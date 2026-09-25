import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import type { Viewer } from 'src/common/middleware/viewer_scope.middleware';
import { isDistrict, isRegion, regionOfDistrict } from 'src/regions/regions.data';
import {
  Service,
  ServiceCategory,
  ServiceProductLink,
  ServiceVariant,
  StoreServiceArea,
} from './models';
import {
  CreateServiceDto,
  ServiceAreasDto,
  ServiceCategoryDto,
  ServiceLinksDto,
  UpdateServiceCategoryDto,
  UpdateServiceDto,
  UpdateVariantDto,
  VariantDto,
} from './dto';

/**
 * Xizmatlar katalogi — topshiriq №39, 1- va 3-band.
 *
 * Ruxsat (backendda):
 *   superadmin — hammasi (servis kaliti ham);
 *   hamkor admini / ruxsatli xodim — faqat O'Z xizmatlari; boshqa hamkorniki —
 *                 404 (ro'yxatda ko'rmaydi) yoki 403 (yozishda);
 *   xaridor (tokensiz) — faqat faol xizmat, faol va `sells_services` hamkor.
 * Narx (`price_uzs`, `visit_fee_uzs`) xodimga `prices.edit` bilan — bu
 * `StaffPermissionGuard` da (staff-permissions.ts).
 */
@Injectable()
export class ServiceCatalogService {
  private isSuper = (r: StoreRequester) => r?.role === 'superadmin';

  /** Orqa ofis so'rovimi (xaridor emas). Xodimga — faqat `services.view` bilan. */
  static backofficeOf(viewer?: Viewer): { store_id: number | null; super: boolean } | null {
    if (!viewer?.kind) return null;
    if (viewer.kind === 'service' || viewer.kind === 'superadmin') return { store_id: null, super: true };
    if (viewer.kind === 'store_admin') {
      if (viewer.permissions && !viewer.permissions.includes('services.view')) return null;
      return { store_id: viewer.store_id, super: false };
    }
    return null;
  }

  // ============================================================ turlar
  async categories(all: boolean) {
    return ServiceCategory.findAll({
      where: all ? {} : { is_active: true },
      order: [['sort', 'ASC'], ['id', 'ASC']],
    });
  }

  async createCategory(dto: ServiceCategoryDto) {
    if (dto.key === 'delivery') throw new BadRequestException("'delivery' — kuryer ko'nikmasi, xizmat turi bo'lolmaydi");
    try {
      return await ServiceCategory.create({ ...dto } as any);
    } catch (e) {
      if (e instanceof UniqueConstraintError) throw new ConflictException(`'${dto.key}' kaliti band`);
      throw e;
    }
  }

  async updateCategory(id: number, dto: UpdateServiceCategoryDto) {
    const c = await ServiceCategory.findByPk(id);
    if (!c) throw new NotFoundException('Xizmat turi topilmadi');
    // `key` o'zgarmaydi — ustalarning ko'nikmalari unga bog'langan
    await c.update(clean(dto));
    return c;
  }

  // ============================================================ hudud (1-band)
  async areas(storeId: number) {
    return StoreServiceArea.findAll({
      where: { store_id: storeId },
      attributes: ['region_code', 'district_code'],
      order: [['region_code', 'ASC'], ['district_code', 'ASC NULLS FIRST']],
    });
  }

  async setAreas(storeId: number, dto: ServiceAreasDto, r: StoreRequester) {
    if (!this.isSuper(r) && Number(r.store_id) !== Number(storeId)) {
      throw new ForbiddenException("Faqat o'z do'koningiz hududini o'zgartira olasiz");
    }
    await this.storeOr404(storeId);
    const seen = new Set<string>();
    const rows: { region_code: string; district_code: string | null }[] = [];
    for (const a of dto.areas) {
      if (!isRegion(a.region_code)) throw new BadRequestException(`Noma'lum viloyat: ${a.region_code}`);
      const district = a.district_code ?? null;
      if (district !== null && !isDistrict(district, a.region_code)) {
        throw new BadRequestException(`${district} tumani ${a.region_code} ga tegishli emas`);
      }
      const k = `${a.region_code}:${district ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ region_code: a.region_code, district_code: district });
    }
    await StoreServiceArea.sequelize.transaction(async (t) => {
      await StoreServiceArea.destroy({ where: { store_id: storeId }, transaction: t });
      if (rows.length) {
        await StoreServiceArea.bulkCreate(
          rows.map((x) => ({ ...x, store_id: storeId })) as any,
          { transaction: t },
        );
      }
    });
    return this.areas(storeId);
  }

  // ============================================================ xizmatlar: orqa ofis
  async create(dto: CreateServiceDto, r: StoreRequester) {
    let storeId: number;
    if (this.isSuper(r)) {
      if (!dto.store_id) throw new BadRequestException('store_id majburiy');
      storeId = dto.store_id;
    } else {
      if (dto.store_id !== undefined && Number(dto.store_id) !== Number(r.store_id)) {
        throw new ForbiddenException("Faqat o'z do'koningizga xizmat qo'sha olasiz");
      }
      storeId = Number(r.store_id);
    }
    const store = await this.storeOr404(storeId);
    if (!store.sells_services) {
      throw new ForbiddenException("Bu hamkor xizmat sotmaydi (sells_services = false) — xizmat yaratib bo'lmaydi");
    }
    const category = await this.categoryOf(dto.category_id, dto.category_key);

    const variants: VariantDto[] = dto.variants?.length
      ? dto.variants
      : [{ name_uz: dto.name_uz, name_ru: dto.name_ru, name_en: dto.name_en, price_uzs: dto.price_uzs ?? null }];
    for (const v of variants) this.checkVariantPrice(dto.price_type, v.price_uzs);

    return Service.sequelize.transaction(async (t) => {
      const s = await Service.create(
        {
          store_id: storeId,
          category_id: category.id,
          name_uz: dto.name_uz.trim(),
          name_ru: dto.name_ru?.trim() || null,
          name_en: dto.name_en?.trim() || null,
          description_uz: dto.description_uz ?? null,
          description_ru: dto.description_ru ?? null,
          description_en: dto.description_en ?? null,
          price_type: dto.price_type,
          unit: dto.unit ?? 'piece',
          visit_fee_uzs: dto.visit_fee_uzs ?? null,
          duration_minutes: dto.duration_minutes ?? null,
          warranty_months: dto.warranty_months ?? 0,
          photos: dto.photos ?? [],
          is_active: dto.is_active ?? true,
          sort: dto.sort ?? 0,
        } as any,
        { transaction: t },
      );
      for (const [i, v] of variants.entries()) {
        await ServiceVariant.create(
          {
            service_id: s.id,
            name_uz: v.name_uz.trim(),
            name_ru: v.name_ru?.trim() || null,
            name_en: v.name_en?.trim() || null,
            price_uzs: dto.price_type === 'quote' ? null : v.price_uzs ?? null,
            sort: v.sort ?? i,
            is_active: v.is_active ?? true,
          } as any,
          { transaction: t },
        );
      }
      return this.backofficeOne(s.id, t);
    });
  }

  async update(id: number, dto: UpdateServiceDto, r: StoreRequester) {
    const s = await this.owned(id, r);
    const payload = clean(dto);
    if (payload.category_id !== undefined) await this.categoryOf(payload.category_id);
    if (payload.price_type && payload.price_type !== s.price_type) {
      // Yangi narx turi mavjud variantlarga mos kelsin
      const vs = await ServiceVariant.findAll({ where: { service_id: id, is_active: true } });
      for (const v of vs) this.checkVariantPrice(payload.price_type, payload.price_type === 'quote' ? null : v.price_uzs);
      if (payload.price_type === 'quote') {
        await ServiceVariant.update({ price_uzs: null } as any, { where: { service_id: id } });
      }
    }
    await s.update(payload);
    return this.backofficeOne(id);
  }

  /**
   * O'chirish (3-band). Buyurtmada ishlatilgan xizmat o'chirilmaydi —
   * `is_active = false` (tarix va faol ishlar buzilmasin). Ishlatilmagan — butunlay.
   */
  async remove(id: number, r: StoreRequester) {
    const s = await this.owned(id, r);
    const [used]: any[] = await Service.sequelize.query(
      `SELECT COUNT(*)::int AS n FROM "order-items" WHERE service_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (Number(used?.n) > 0) {
      await s.update({ is_active: false });
      return { id, deleted: false, is_active: false, message: "Xizmat buyurtmalarda bor — nofaol qilindi" };
    }
    await s.destroy();
    return { id, deleted: true };
  }

  async addVariant(id: number, dto: VariantDto, r: StoreRequester) {
    const s = await this.owned(id, r);
    this.checkVariantPrice(s.price_type, dto.price_uzs);
    await ServiceVariant.create({
      service_id: id,
      name_uz: dto.name_uz.trim(),
      name_ru: dto.name_ru?.trim() || null,
      name_en: dto.name_en?.trim() || null,
      price_uzs: s.price_type === 'quote' ? null : dto.price_uzs ?? null,
      sort: dto.sort ?? 0,
      is_active: dto.is_active ?? true,
    } as any);
    return this.backofficeOne(id);
  }

  async updateVariant(id: number, variantId: number, dto: UpdateVariantDto, r: StoreRequester) {
    const s = await this.owned(id, r);
    const v = await ServiceVariant.findOne({ where: { id: variantId, service_id: id } });
    if (!v) throw new NotFoundException('Variant topilmadi');
    const payload = clean(dto);
    if (payload.price_uzs !== undefined) this.checkVariantPrice(s.price_type, payload.price_uzs);
    if (s.price_type === 'quote') payload.price_uzs = null;
    if (payload.is_active === false) await this.ensureAnotherActive(id, variantId);
    await v.update(payload);
    return this.backofficeOne(id);
  }

  async removeVariant(id: number, variantId: number, r: StoreRequester) {
    await this.owned(id, r);
    const v = await ServiceVariant.findOne({ where: { id: variantId, service_id: id } });
    if (!v) throw new NotFoundException('Variant topilmadi');
    await this.ensureAnotherActive(id, variantId);
    const [used]: any[] = await Service.sequelize.query(
      `SELECT COUNT(*)::int AS n FROM "order-items" WHERE service_variant_id = :id`,
      { replacements: { id: variantId }, type: QueryTypes.SELECT },
    );
    if (Number(used?.n) > 0) await v.update({ is_active: false });
    else await v.destroy();
    return this.backofficeOne(id);
  }

  /** Tovarga bog'lash — ro'yxat TO'LIQ almashtiriladi (3-band). */
  async setLinks(id: number, dto: ServiceLinksDto, r: StoreRequester) {
    await this.owned(id, r);
    const variants = new Set(
      (await ServiceVariant.findAll({ where: { service_id: id }, attributes: ['id'] })).map((v) => v.id),
    );
    const rows = dto.links.map((l, i) => {
      const hasCat = l.category_id !== undefined && l.category_id !== null;
      const hasProd = l.product_id !== undefined && l.product_id !== null;
      if (hasCat === hasProd) throw new BadRequestException(`links[${i}]: category_id YOKI product_id (bittasi) majburiy`);
      if (l.variant_id != null && !variants.has(Number(l.variant_id))) {
        throw new BadRequestException(`links[${i}]: variant_id bu xizmatniki emas`);
      }
      return {
        service_id: id,
        variant_id: l.variant_id ?? null,
        category_id: hasCat ? Number(l.category_id) : null,
        product_id: hasProd ? Number(l.product_id) : null,
      };
    });
    const cats = [...new Set(rows.map((x) => x.category_id).filter(Boolean))];
    const prods = [...new Set(rows.map((x) => x.product_id).filter(Boolean))];
    if (cats.length) {
      const found: any[] = await Service.sequelize.query('SELECT id FROM category WHERE id IN (:ids)', {
        replacements: { ids: cats },
        type: QueryTypes.SELECT,
      });
      if (found.length !== cats.length) throw new BadRequestException("Noma'lum tovar bo'limi (category_id)");
    }
    if (prods.length) {
      const found: any[] = await Service.sequelize.query('SELECT id FROM products WHERE id IN (:ids)', {
        replacements: { ids: prods },
        type: QueryTypes.SELECT,
      });
      if (found.length !== prods.length) throw new BadRequestException("Noma'lum mahsulot (product_id)");
    }
    await Service.sequelize.transaction(async (t) => {
      await ServiceProductLink.destroy({ where: { service_id: id }, transaction: t });
      if (rows.length) await ServiceProductLink.bulkCreate(rows as any, { transaction: t });
    });
    return ServiceProductLink.findAll({ where: { service_id: id }, order: [['id', 'ASC']] });
  }

  async backofficeList(scope: { store_id: number | null; super: boolean }, q: Record<string, any>) {
    const where: any = {};
    if (!scope.super) where.store_id = scope.store_id;
    else if (q.store_id) where.store_id = Number(q.store_id);
    if (q.category) {
      const c = await this.categoryOf(/^\d+$/.test(String(q.category)) ? Number(q.category) : undefined, String(q.category));
      where.category_id = c.id;
    }
    if (q.is_active === 'true' || q.is_active === 'false') where.is_active = q.is_active === 'true';
    const rows = await Service.findAll({ where, order: [['store_id', 'ASC'], ['sort', 'ASC'], ['id', 'ASC']] });
    return this.assemble(rows, { backoffice: true });
  }

  async backofficeOne(id: number, t?: Transaction) {
    const s = await Service.findByPk(id, { transaction: t });
    if (!s) throw new NotFoundException('Xizmat topilmadi');
    const [out] = await this.assemble([s], { backoffice: true, links: true, t });
    return out;
  }

  /** Orqa ofis: bitta xizmat (begona hamkorniki — 404). */
  async backofficeGet(id: number, scope: { store_id: number | null; super: boolean }) {
    const s = await Service.findByPk(id);
    if (!s || (!scope.super && Number(s.store_id) !== Number(scope.store_id))) throw new NotFoundException('Xizmat topilmadi');
    return this.backofficeOne(id);
  }

  // ============================================================ xaridor (tokensiz)
  /**
   * `GET /api/services` — faqat faol xizmat, faol va `sells_services` hamkor.
   * Javobda hamkor (`id, name, logo, rating, jobs_done`) va `min_price_uzs` —
   * ro'yxat alohida so'rovsiz chiziladi.
   */
  async publicList(q: Record<string, any>) {
    const { where, rep } = this.publicWhere(q);
    const sort =
      q.sort === 'price'
        ? 'min_price ASC NULLS LAST, s.id'
        : q.sort === 'rating'
          ? 'st.service_rating DESC NULLS LAST, st.jobs_done DESC, s.id'
          : 's.sort ASC, s.id';
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const ids: any[] = await Service.sequelize.query(
      `SELECT s.id,
              (SELECT MIN(v.price_uzs) FROM service_variants v WHERE v.service_id = s.id AND v.is_active) AS min_price
         FROM services s
         JOIN stores st ON st.id = s.store_id
         JOIN service_categories c ON c.id = s.category_id
        WHERE ${where}
        ORDER BY ${sort}
        LIMIT :limit OFFSET :offset`,
      { replacements: { ...rep, limit, offset: (page - 1) * limit }, type: QueryTypes.SELECT },
    );
    const [{ total }]: any[] = await Service.sequelize.query(
      `SELECT COUNT(*)::int AS total FROM services s
         JOIN stores st ON st.id = s.store_id
         JOIN service_categories c ON c.id = s.category_id
        WHERE ${where}`,
      { replacements: rep, type: QueryTypes.SELECT },
    );
    const order = ids.map((x) => Number(x.id));
    const rows = order.length ? await Service.findAll({ where: { id: { [Op.in]: order } } }) : [];
    rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return { rows: await this.assemble(rows, { backoffice: false }), total, page, limit };
  }

  async publicOne(id: number) {
    const { where, rep } = this.publicWhere({});
    const [row]: any[] = await Service.sequelize.query(
      `SELECT s.id FROM services s
         JOIN stores st ON st.id = s.store_id
         JOIN service_categories c ON c.id = s.category_id
        WHERE ${where} AND s.id = :id`,
      { replacements: { ...rep, id }, type: QueryTypes.SELECT },
    );
    if (!row) throw new NotFoundException('Xizmat topilmadi');
    const s = await Service.findByPk(id);
    const [out] = await this.assemble([s], { backoffice: false, areas: true });
    return out;
  }

  /**
   * Shu tovarga mos xizmatlar (6-band). Tartib:
   *   1) shu tovarni sotayotgan do'konning O'Z xizmati — `recommended: true`
   *      (bitta hamkor, bitta buyurtma, bitta chat);
   *   2) qolgan hamkorlar (hududda bo'lsa) — reyting bo'yicha.
   * `suggested_variant_id` — `service_product_links` da bog'langan variant
   * (avval mahsulotning o'ziga, keyin bo'limiga bog'langani).
   */
  async forProduct(productId: number, q: Record<string, any>) {
    const [p]: any[] = await Service.sequelize.query(
      'SELECT id, store_id, category_id FROM products WHERE id = :id',
      { replacements: { id: productId }, type: QueryTypes.SELECT },
    );
    if (!p) throw new NotFoundException('Mahsulot topilmadi');
    const { where, rep } = this.publicWhere(q);
    const rows: any[] = await Service.sequelize.query(
      `SELECT s.id, s.store_id,
              (SELECT l.variant_id FROM service_product_links l
                WHERE l.service_id = s.id AND (l.product_id = :product OR l.category_id = :category)
                ORDER BY (l.product_id IS NULL), (l.variant_id IS NULL), l.id LIMIT 1) AS suggested_variant_id
         FROM services s
         JOIN stores st ON st.id = s.store_id
         JOIN service_categories c ON c.id = s.category_id
        WHERE ${where}
          AND EXISTS (SELECT 1 FROM service_product_links l
                       WHERE l.service_id = s.id AND (l.product_id = :product OR l.category_id = :category))
        ORDER BY (s.store_id = :seller) DESC, st.service_rating DESC NULLS LAST, st.jobs_done DESC, c.sort, s.sort, s.id`,
      {
        replacements: { ...rep, product: p.id, category: p.category_id ?? -1, seller: p.store_id ?? -1 },
        type: QueryTypes.SELECT,
      },
    );
    const ids = rows.map((x) => Number(x.id));
    const models = ids.length ? await Service.findAll({ where: { id: { [Op.in]: ids } } }) : [];
    models.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const out = await this.assemble(models, { backoffice: false });
    return out.map((s: any, i: number) => ({
      ...s,
      recommended: Number(rows[i].store_id) === Number(p.store_id),
      suggested_variant_id: rows[i].suggested_variant_id === null ? null : Number(rows[i].suggested_variant_id),
    }));
  }

  /** Xaridorga ko'rinadigan xizmat sharti + filtrlar. */
  private publicWhere(q: Record<string, any>) {
    const cond = [
      's.is_active',
      'st.is_active',
      'st.sells_services',
      'c.is_active',
      'EXISTS (SELECT 1 FROM service_variants v WHERE v.service_id = s.id AND v.is_active)',
    ];
    const rep: any = {};
    if (q.category) {
      if (/^\d+$/.test(String(q.category))) {
        cond.push('c.id = :category_id');
        rep.category_id = Number(q.category);
      } else {
        cond.push('c.key = :category_key');
        rep.category_key = String(q.category);
      }
    }
    if (q.store_id && /^\d+$/.test(String(q.store_id))) {
      cond.push('s.store_id = :store_id');
      rep.store_id = Number(q.store_id);
    }
    if (q.product_id && /^\d+$/.test(String(q.product_id))) {
      cond.push(`EXISTS (SELECT 1 FROM service_product_links l WHERE l.service_id = s.id
                    AND (l.product_id = :product_id
                      OR l.category_id = (SELECT category_id FROM products WHERE id = :product_id)))`);
      rep.product_id = Number(q.product_id);
    }
    const district = q.district ? String(q.district) : null;
    const region = q.region ? String(q.region) : regionOfDistrict(district);
    if (district && !isDistrict(district, region)) {
      throw new BadRequestException(`Noma'lum tuman: ${district}`);
    }
    if (region) {
      if (!isRegion(region)) throw new BadRequestException(`Noma'lum viloyat: ${region}`);
      cond.push(
        district
          ? `EXISTS (SELECT 1 FROM store_service_areas a WHERE a.store_id = s.store_id
                      AND a.region_code = :region AND (a.district_code IS NULL OR a.district_code = :district))`
          : `EXISTS (SELECT 1 FROM store_service_areas a WHERE a.store_id = s.store_id AND a.region_code = :region)`,
      );
      rep.region = region;
      rep.district = district;
    }
    return { where: cond.join(' AND '), rep };
  }

  /** Javob shakli: variantlar, tur, hamkor, `min_price_uzs`. */
  private async assemble(
    rows: Service[],
    opts: { backoffice: boolean; links?: boolean; areas?: boolean; t?: Transaction },
  ) {
    if (!rows.length) return [];
    const ids = rows.map((s) => s.id);
    const variants = await ServiceVariant.findAll({
      where: { service_id: { [Op.in]: ids }, ...(opts.backoffice ? {} : { is_active: true }) },
      order: [['sort', 'ASC'], ['id', 'ASC']],
      transaction: opts.t,
    });
    const cats = await ServiceCategory.findAll({
      where: { id: { [Op.in]: [...new Set(rows.map((s) => s.category_id))] } },
      transaction: opts.t,
    });
    const stores: any[] = await Service.sequelize.query(
      `SELECT s.id, s.name, s.slug, s.logo_url, s.phone, s.service_rating, s.service_reviews_count, s.jobs_done,
              r.vat_payer
         FROM stores s LEFT JOIN store_requisites r ON r.store_id = s.id WHERE s.id IN (:ids)`,
      { replacements: { ids: [...new Set(rows.map((s) => s.store_id))] }, type: QueryTypes.SELECT, transaction: opts.t },
    );
    const links = opts.links
      ? await ServiceProductLink.findAll({ where: { service_id: { [Op.in]: ids } }, order: [['id', 'ASC']], transaction: opts.t })
      : [];
    const catById = new Map(cats.map((c) => [c.id, c]));
    const storeById = new Map(stores.map((s) => [Number(s.id), s]));
    const out: any[] = [];
    for (const s of rows) {
      const plain: any = { ...s.get({ plain: true }) };
      if (!opts.backoffice) delete plain.commission_percent;
      const vs = variants.filter((v) => v.service_id === s.id).map((v) => {
        const x: any = { ...v.get({ plain: true }) };
        if (!opts.backoffice) {
          delete x.is_active;
          delete x.created_at;
          delete x.updated_at;
        }
        return x;
      });
      const priced = vs.filter((v) => v.is_active !== false && v.price_uzs !== null).map((v) => Number(v.price_uzs));
      const c = catById.get(s.category_id);
      const st = storeById.get(Number(s.store_id));
      plain.category = c ? { id: c.id, key: c.key, name_uz: c.name_uz, name_ru: c.name_ru, name_en: c.name_en, icon: c.icon } : null;
      plain.store = st
        ? {
            id: Number(st.id),
            name: st.name,
            slug: st.slug,
            logo: st.logo_url ?? null,
            rating: st.service_rating === null ? null : Number(st.service_rating),
            reviews_count: Number(st.service_reviews_count || 0),
            jobs_done: Number(st.jobs_done || 0),
            // `store_requisites.vat_payer` (№16); null — ko'rsatilmagan
            vat_payer: st.vat_payer ?? null,
          }
        : null;
      plain.variants = vs;
      plain.min_price_uzs = priced.length ? Math.min(...priced) : null;
      if (opts.links) plain.links = links.filter((l) => l.service_id === s.id);
      if (opts.areas) plain.areas = await this.areas(s.store_id);
      out.push(plain);
    }
    return out;
  }

  // ============================================================ yordamchilar
  private async owned(id: number, r: StoreRequester) {
    const s = await Service.findByPk(id);
    if (!s) throw new NotFoundException('Xizmat topilmadi');
    if (!this.isSuper(r) && Number(s.store_id) !== Number(r.store_id)) {
      throw new ForbiddenException("Bu xizmat boshqa hamkorga tegishli");
    }
    return s;
  }

  private async storeOr404(storeId: number) {
    const [store]: any[] = await Service.sequelize.query(
      'SELECT id, is_active, sells_products, sells_services FROM stores WHERE id = :id',
      { replacements: { id: storeId }, type: QueryTypes.SELECT },
    );
    if (!store) throw new NotFoundException("Do'kon topilmadi");
    return store;
  }

  private async categoryOf(id?: number, key?: string) {
    if (id === undefined && !key) throw new BadRequestException('category_id yoki category_key majburiy');
    const c = id !== undefined ? await ServiceCategory.findByPk(id) : await ServiceCategory.findOne({ where: { key } });
    if (!c) throw new BadRequestException("Noma'lum xizmat turi");
    return c;
  }

  /** Narx turi qoidasi (3-band): `fixed` — narx majburiy, `from` — "…dan" narx majburiy, `quote` — narxsiz. */
  private checkVariantPrice(priceType: string, price: number | null | undefined) {
    if (priceType === 'quote') return;
    if (price === null || price === undefined) {
      throw new BadRequestException(
        priceType === 'fixed' ? "fixed narxli xizmatda variant narxi (price_uzs) majburiy" : "from narxli xizmatda \"…dan\" narx (price_uzs) majburiy",
      );
    }
  }

  /** Variantsiz xizmat bo'lmaydi (3-band). */
  private async ensureAnotherActive(serviceId: number, variantId: number) {
    const n = await ServiceVariant.count({ where: { service_id: serviceId, is_active: true, id: { [Op.ne]: variantId } } });
    if (!n) throw new ConflictException("Xizmatda kamida bitta faol variant qolishi kerak");
  }
}

/** `undefined` maydonlarni olib tashlaydi (qismiy tahrir). */
function clean<T extends object>(dto: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(dto)) if (v !== undefined) out[k] = v;
  return out;
}
