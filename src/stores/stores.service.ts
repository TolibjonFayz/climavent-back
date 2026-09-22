import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Store } from './model/store.model';
import { Product } from 'src/products/model/product.model';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import {
  PRIVATE_REQUISITE_FIELDS,
  STORE_ADMIN_EDITABLE_REQUISITES,
  StoreRequisites,
} from './model/store-requisites.model';
import { StoreEvent } from './model/store-event.model';
import type { Viewer } from 'src/common/middleware/viewer_scope.middleware';
import {
  CatalogScope,
  PUBLIC_SCOPE,
  storeVisibilityWhere,
  storeVisible,
} from 'src/common/visibility/catalog-visibility';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';

// `stores` jadvalidagi, lekin faqat SUPERADMIN o'zgartira oladigan maydonlar.
//   is_active  — tasdiqlangan sotuvchi do'konini superadmin ochadi
//                (topshiriq №16, 4-qadam). Do'kon admini o'zi ocholsa,
//                tekshiruvning ma'nosi qolmasdi.
//   name, slug — ariza tekshiruvida ko'rilgan; almashtirib boshqa brend
//                nomini olish (masalan "Climavent Official") mumkin bo'lmasin.
//   legal_name, tin — faqat superadmin (8-band).
//   sort_order — saytdagi tartib, maydonchaning ishi.
const SUPERADMIN_ONLY_STORE_FIELDS = ['is_active', 'name', 'slug', 'legal_name', 'tin', 'sort_order'];

@Injectable()
export class StoresService {
  constructor(
    @InjectModel(Store) private readonly storeRepository: typeof Store,
    @InjectModel(Product) private readonly productRepository: typeof Product,
    @InjectModel(StoreRequisites) private readonly requisitesRepo: typeof StoreRequisites,
    @InjectModel(StoreEvent) private readonly eventRepo: typeof StoreEvent,
  ) {}

  // Do'konlar ro'yxati.
  //
  // Ilgari nofaolni yashirish MIJOZNING ishi edi (`?active=true`), ya'ni
  // frontend so'ramasa nofaol do'kon ham ro'yxatga tushardi. Endi
  // standart holat XAVFSIZ: mehmon faqat faol do'konlarni ko'radi,
  // adminka/bot esa hammasini (topshiriq №14, 1-band).
  //
  // `?active=true` hamon ishlaydi — eski mijozlar buzilmasin.
  async getAll(onlyActive = false, scope: CatalogScope = PUBLIC_SCOPE): Promise<Store[]> {
    // `store_admin` boshqa do'konlarning faqat FAOLlarini ko'radi (topshiriq
    // №29, 1-band): e'lon qilinmagan raqib do'konning nomi/slug'i kerak emas.
    return this.storeRepository.findAll({
      where: onlyActive ? { is_active: true } : storeVisibilityWhere(scope),
      order: [
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  }

  // Nofaol do'konga TO'G'RIDAN-TO'G'RI havola ham ochilmasin: odamlarda
  // eski havola saqlanib qolgan bo'lishi mumkin. Adminka uchun ochiq.
  async getOne(id: number, scope: CatalogScope = PUBLIC_SCOPE): Promise<Store> {
    const store = await this.storeRepository.findByPk(id);
    if (!store || !storeVisible(store, scope)) {
      throw new NotFoundException("Do'kon topilmadi");
    }
    return store;
  }

  // Sayt do'kon sahifasi uchun — URL'da id emas, slug turadi.
  async getBySlug(slug: string, scope: CatalogScope = PUBLIC_SCOPE): Promise<Store> {
    const store = await this.storeRepository.findOne({ where: { slug } });
    if (!store || !storeVisible(store, scope)) {
      throw new NotFoundException("Do'kon topilmadi");
    }
    return store;
  }

  /**
   * Javob shakli (topshiriq №16, 8-band):
   *   mehmon / begona do'kon admini — `legal_name`, `tin` (stores da);
   *   o'z do'koni, superadmin, servis kaliti, sayt admini — ustiga bank,
   *   rahbar, QQS va `application_id` (store_requisites dan).
   */
  async present(stores: Store | Store[], viewer?: Viewer) {
    const list = Array.isArray(stores) ? stores : [stores];
    const allowedIds = list.filter((s) => this.canSeeRequisites(s.id, viewer)).map((s) => s.id);
    const requisites = allowedIds.length
      ? await this.requisitesRepo.findAll({ where: { store_id: { [Op.in]: allowedIds } } })
      : [];
    const byStore = new Map(requisites.map((r) => [r.store_id, r]));

    const out = list.map((s) => {
      // Nusxa: `get({ plain: true })` ba'zan `dataValues` ning o'zini
      // qaytaradi — unga rekvizit yozsak model obyekti buzilardi.
      const plain = { ...(s.get({ plain: true }) as unknown as Record<string, unknown>) };
      if (allowedIds.includes(s.id)) {
        const r = byStore.get(s.id);
        for (const f of PRIVATE_REQUISITE_FIELDS) plain[f] = r ? (r as any)[f] ?? null : null;
      }
      return plain;
    });
    return Array.isArray(stores) ? out : out[0];
  }

  canSeeRequisites(storeId: number, viewer?: Viewer): boolean {
    if (!viewer?.kind) return false;
    if (viewer.kind === 'store_admin') return viewer.store_id === storeId;
    return true; // service, site_admin, superadmin
  }

  async create(dto: CreateStoreDto) {
    await this.ensureSlugFree(dto.slug);
    const { storeFields, requisiteFields } = this.split(dto);
    const created = await this.storeRepository.sequelize.transaction(async (transaction) => {
      const store = await this.storeRepository.create(storeFields as any, { transaction });
      if (Object.keys(requisiteFields).length) {
        await this.requisitesRepo.create({ store_id: store.id, ...requisiteFields }, { transaction });
      }
      return store;
    });
    return { message: "Do'kon yaratildi", store: created };
  }

  /**
   * Kim nimani o'zgartiradi (topshiriq №16, 8-band):
   *   superadmin   — hammasini;
   *   do'kon admini — faqat O'Z do'konining profili (tavsif, logo, aloqa)
   *                  va BANK rekvizitlari. Bank o'zgarishi `store_events` ga
   *                  yoziladi — to'lov firibgarligidan himoya.
   * Ruxsatsiz maydon yuborilsa — 403 (jimgina tashlab yuborilmaydi: adminka
   * saqlandi deb o'ylamasin).
   */
  async update(id: number, dto: UpdateStoreDto, requester?: StoreRequester) {
    const isSuper = requester?.role === 'superadmin';
    // Cheklovsiz doira MAJBURIY: aks holda nofaol do'konni qayta
    // faollashtirib bo'lmasdi — `getOne` uni mehmonga 404 qiladi.
    const store = await this.getOne(id, { kind: 'all' });

    const sent = Object.keys(dto).filter((k) => (dto as any)[k] !== undefined);
    if (!isSuper) {
      const forbidden = sent.filter(
        (k) =>
          SUPERADMIN_ONLY_STORE_FIELDS.includes(k) ||
          ((PRIVATE_REQUISITE_FIELDS as readonly string[]).includes(k) &&
            !(STORE_ADMIN_EDITABLE_REQUISITES as readonly string[]).includes(k)),
      );
      if (forbidden.length) {
        throw new ForbiddenException(
          `Bu maydonlarni faqat superadmin o'zgartira oladi: ${forbidden.join(', ')}`,
        );
      }
    }

    if (dto.slug && dto.slug !== store.slug) await this.ensureSlugFree(dto.slug);
    if (dto.tin && dto.tin !== store.tin) {
      const taken = await this.storeRepository.findOne({ where: { tin: dto.tin, id: { [Op.ne]: id } } });
      if (taken) throw new ConflictException("Bu STIR bilan boshqa do'kon bor");
    }

    const { storeFields, requisiteFields } = this.split(dto);
    await this.storeRepository.sequelize.transaction(async (transaction) => {
      if (Object.keys(storeFields).length) {
        await this.storeRepository.update(storeFields as any, { where: { id }, transaction });
      }
      if (Object.keys(requisiteFields).length) {
        const existing = await this.requisitesRepo.findByPk(id, { transaction });
        // Eski qiymatlarni update'dan OLDIN NUSXALAYMIZ. DIQQAT: getter va
        // include bo'lmagan modelda `get({ plain: true })` nusxa EMAS —
        // `dataValues` ning O'ZINI qaytaradi, `update()` esa uni o'zgartiradi.
        // Spread'siz jurnalga "yangi -> yangi" yozilib, nizoda eng kerakli
        // narsa — eski hisob raqami — yo'qolardi (sinovda aynan shu chiqdi).
        const before: Record<string, unknown> = existing ? { ...existing.get({ plain: true }) } : {};
        const bankChanged = (STORE_ADMIN_EDITABLE_REQUISITES as readonly string[]).filter(
          (f) =>
            f in requisiteFields &&
            String(before[f] ?? '') !== String((requisiteFields as any)[f] ?? ''),
        );
        if (existing) await existing.update(requisiteFields, { transaction });
        else await this.requisitesRepo.create({ store_id: id, ...requisiteFields }, { transaction });

        if (bankChanged.length) {
          await this.eventRepo.create(
            {
              store_id: id,
              type: 'bank_requisites_changed',
              actor_id: requester?.user_id ?? null,
              actor_login: requester?.login ?? null,
              // Eski qiymat ham yoziladi: nizoda "oldin qaysi hisob edi"
              message: bankChanged
                .map((f) => `${f}: ${before[f] ?? '—'} → ${(requisiteFields as any)[f] ?? '—'}`)
                .join('; '),
            },
            { transaction },
          );
        }
      }
    });
    return this.getOne(id, { kind: 'all' });
  }

  // Mahsuloti bor do'kon O'CHIRILMAYDI. Kaskad o'chirish bu yerda juda
  // xavfli — bitta noto'g'ri so'rov butun katalogni yo'q qilishi mumkin.
  // O'chirish o'rniga `is_active = false`.
  async remove(id: number) {
    await this.getOne(id, { kind: 'all' });
    const productCount = await this.productRepository.count({
      where: { store_id: id },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Bu do'konda ${productCount} ta mahsulot bor — o'chirib bo'lmaydi. ` +
          "Sotuvdan olib qo'yish uchun is_active = false qiling.",
      );
    }
    await this.storeRepository.destroy({ where: { id } });
    return { message: "Do'kon o'chirildi" };
  }

  // Controller'dan chaqiriladi — xatoni bitta joyda ushlab turish uchun.
  forbidOtherStore(): never {
    throw new ForbiddenException("Faqat o'z do'koningizni tahrirlay olasiz");
  }

  private split(dto: Record<string, any>) {
    const storeFields: Record<string, unknown> = {};
    const requisiteFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      if ((PRIVATE_REQUISITE_FIELDS as readonly string[]).includes(k)) requisiteFields[k] = v;
      else storeFields[k] = v;
    }
    delete requisiteFields.application_id; // API orqali o'zgarmaydi
    return { storeFields, requisiteFields };
  }

  private async ensureSlugFree(slug: string) {
    const exists = await this.storeRepository.findOne({ where: { slug } });
    if (exists) {
      throw new ConflictException(`'${slug}' slug allaqachon band`);
    }
  }
}
