import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { R2DocumentsStore } from 'src/seller_applications/r2-documents.store';
import { refreshStoreRating } from 'src/service_jobs/jobs.service';
import { syncTestPhones } from './test-flags';

/**
 * Sinov ma'lumotlari (topshiriq №43, 2-band).
 *
 * Belgi `is_test` besh jadvalda (users, stores, store_users, couriers, orders).
 * Avtomatik qoidalar DB trigger'larida (migratsiya 20260928120000), bu yerda —
 * qo'lda belgilash, ko'rish (quruq yurish) va tozalash.
 *
 * Tozalash doirasi `scope()` da TEMP jadvallarda hisoblanadi — quruq yurish ham,
 * haqiqiy tozalash ham AYNAN bir xil doirani ko'radi (ko'rsatilgan son = o'chgan son).
 */

export const TEST_ENTITIES = ['user', 'order', 'store_user', 'store'] as const;
export type TestEntity = (typeof TEST_ENTITIES)[number];
const ENTITY_TABLE: Record<TestEntity, string> = {
  user: 'users',
  order: 'orders',
  store_user: 'store_users',
  store: 'stores',
};

/** Tozalashda ildiz turlari (`entities` filtri). */
export const PURGE_ROOTS = ['users', 'stores', 'store_users', 'couriers', 'orders'] as const;
export type PurgeRoot = (typeof PURGE_ROOTS)[number];

export interface AuditActor {
  type: 'store_user' | 'service';
  id?: number | null;
  login?: string | null;
  ip?: string | null;
}

/** Buyurtma avtomatik `is_test` qoidasi (trigger'lar bilan bir xil) — `o` taxallusi uchun. */
const ORDER_RULE = `(
     EXISTS (SELECT 1 FROM users u WHERE u.id = o.user_id AND u.is_test)
  OR EXISTS (SELECT 1 FROM "order-items" i JOIN stores s ON s.id = i.store_id WHERE i.order_id = o.id AND s.is_test)
  OR EXISTS (SELECT 1 FROM deliveries d JOIN couriers c ON c.id = d.courier_id WHERE d.order_id = o.id AND c.is_test)
  OR EXISTS (SELECT 1 FROM service_jobs j JOIN couriers c ON c.id = j.worker_id WHERE j.order_id = o.id AND c.is_test))`;

/** Haqiqiy to'lov belgisi. Click/Payme integratsiyasi backendda YO'Q — yagona belgi `paid` holati. */
const PAID = `(o.status = 'paid' OR EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.to_status = 'paid'))`;

export type Counts = Record<
  | 'users' | 'stores' | 'store_users' | 'couriers' | 'orders' | 'order_items' | 'deliveries'
  | 'service_jobs' | 'quotes' | 'chats' | 'messages' | 'files' | 'devices',
  number
>;
export interface Skipped { entity: string; id: number; reason: string }

@Injectable()
export class TestDataService implements OnApplicationBootstrap {
  private readonly logger = new Logger('TestData');

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly cloudinary: CloudinaryService,
    private readonly r2: R2DocumentsStore,
  ) {}

  async onApplicationBootstrap() {
    try {
      const n = await syncTestPhones(this.sequelize);
      if (n) this.logger.log(`SMS_TEST_PHONES: ${n} ta xaridor sinov deb belgilandi`);
    } catch (e) {
      // Migratsiyasiz ishga tushsa ham ilova ko'tarilsin
      this.logger.error(`Sinov raqamlarini belgilab bo'lmadi: ${(e as Error).message}`);
    }
  }

  // ============================================================ qo'lda belgi
  async setFlag(entity: TestEntity, id: number, isTest: boolean, actor: AuditActor) {
    const table = ENTITY_TABLE[entity];
    return this.sequelize.transaction(async (t) => {
      const [row]: any[] = await this.q(`UPDATE ${table} SET is_test = :v WHERE id = :id RETURNING id, is_test`, { v: isTest, id }, t);
      if (!row) throw new NotFoundException('Yozuv topilmadi');

      // Hisob -> uning kuryer/usta profili ham (profil alohida belgilanmaydi)
      if (entity === 'store_user') {
        await this.q(`UPDATE couriers SET is_test = :v WHERE store_user_id = :id`, { v: isTest, id }, t);
      }

      // Bog'liq buyurtmalar: belgi qo'yilsa — ular ham sinov; olinsa — qoida
      // bo'yicha QAYTA hisoblanadi (boshqa sinov yozuviga bog'langani sinovligicha qoladi).
      let orders: number[] = [];
      if (entity !== 'order') {
        const link = {
          user: `o.user_id = :id`,
          store: `EXISTS (SELECT 1 FROM "order-items" i WHERE i.order_id = o.id AND i.store_id = :id)`,
          store_user: `EXISTS (SELECT 1 FROM couriers c WHERE c.store_user_id = :id AND (
                         EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND d.courier_id = c.id)
                      OR EXISTS (SELECT 1 FROM service_jobs j WHERE j.order_id = o.id AND j.worker_id = c.id)))`,
        }[entity];
        const set = isTest ? 'true' : ORDER_RULE;
        const changed: any[] = await this.q(
          `UPDATE orders o SET is_test = ${set} WHERE ${link} AND o.is_test IS DISTINCT FROM ${set} RETURNING o.id`,
          { id },
          t,
        );
        orders = changed.map((r) => Number(r.id));
      } else {
        orders = [id];
      }

      await this.audit(actor, 'test_flag', { entity, id, is_test: isTest, orders_changed: entity === 'order' ? undefined : orders.length }, t);
      t.afterCommit(() => void this.refreshStoreStats(orders).catch(() => undefined));
      return { entity, id, is_test: isTest, orders_changed: entity === 'order' ? 0 : orders.length };
    });
  }

  // ============================================================ quruq yurish
  async preview(q: { entity?: string; page?: number; limit?: number; before?: string; entities?: string[] }) {
    const opts = this.opts(q);
    const entity = (q.entity || 'orders') as PurgeRoot;
    if (!(PURGE_ROOTS as readonly string[]).includes(entity)) {
      throw new BadRequestException(`entity: ${PURGE_ROOTS.join(', ')}`);
    }
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);

    const t = await this.sequelize.transaction();
    try {
      const skipped = await this.scope(opts, t);
      const counts = await this.counts(t);
      const items = await this.items(entity, limit, (page - 1) * limit, t);
      const [{ n }]: any[] = await this.q(`SELECT COUNT(*)::int AS n FROM p_${entity}`, {}, t);
      return {
        counts,
        skipped,
        entity,
        total: n,
        page,
        limit,
        items,
        filters: { before: opts.before?.toISOString() ?? null, entities: opts.roots },
      };
    } finally {
      await t.rollback(); // faqat TEMP jadvallar — hech narsa o'zgarmaydi
    }
  }

  // ============================================================ tozalash
  async purge(dto: { confirm?: string; entities?: string[]; before?: string }, actor: AuditActor) {
    if (actor.type !== 'store_user' || !actor.id) {
      throw new ForbiddenException('Tozalash faqat superadmin hisobi tokeni bilan — servis kaliti bilan emas');
    }
    if (dto.confirm !== 'TOZALASH') throw new BadRequestException('Tasdiqlash uchun confirm: "TOZALASH" yuboring');
    const opts = this.opts(dto);

    const files: { r2: string[]; urls: string[] } = { r2: [], urls: [] };
    let touchedStores: number[] = [];
    let touchedProducts: { product_id: number; n: number }[] = [];

    const result = await this.sequelize.transaction(async (t) => {
      const skipped = await this.scope(opts, t);
      const counts = await this.counts(t);

      // Omborlardagi fayllar — o'chirishdan OLDIN yig'iladi, commit'dan KEYIN o'chiriladi
      const r2: any[] = await this.q(
        `SELECT file_key FROM delivery_proofs WHERE storage = 'r2' AND file_key IS NOT NULL AND delivery_id IN (SELECT id FROM p_deliveries)
         UNION ALL SELECT file_key FROM courier_documents WHERE storage = 'r2' AND courier_id IN (SELECT id FROM p_couriers)
         UNION ALL SELECT file_key FROM courier_application_documents WHERE storage = 'r2' AND application_id IN (SELECT id FROM p_courier_apps)
         UNION ALL SELECT file_key FROM seller_application_documents WHERE storage = 'r2' AND application_id IN (SELECT id FROM p_seller_apps)`,
        {},
        t,
      );
      files.r2 = r2.map((r) => r.file_key).filter(Boolean);
      const urls: any[] = await this.q(
        `SELECT unnest(customer_photos || photos_before || photos_after || final_amount_photos || ARRAY[failure_photo]) AS url
           FROM service_jobs WHERE order_id IN (SELECT id FROM p_orders)
         UNION SELECT unnest(photos) FROM services WHERE store_id IN (SELECT id FROM p_stores)
         UNION SELECT image_link FROM product_images WHERE product_id IN (SELECT id FROM products WHERE store_id IN (SELECT id FROM p_stores))
         UNION SELECT logo_url FROM stores WHERE id IN (SELECT id FROM p_stores)
         UNION SELECT image_url FROM users WHERE id IN (SELECT id FROM p_users)`,
        {},
        t,
      );
      files.urls = urls.map((r) => r.url).filter((u) => typeof u === 'string' && u.includes('res.cloudinary.com'));

      // Hisobotlarni qayta hisoblash uchun: qolgan do'konlar va mahsulotlar
      const ts: any[] = await this.q(
        `SELECT DISTINCT store_id FROM "order-items" WHERE order_id IN (SELECT id FROM p_orders) AND store_id IS NOT NULL
           AND store_id NOT IN (SELECT id FROM p_stores)`,
        {},
        t,
      );
      touchedStores = ts.map((r) => Number(r.store_id));
      touchedProducts = (await this.q(
        `SELECT product_id, COUNT(*)::int AS n FROM reviews WHERE user_id IN (SELECT id FROM p_users)
           AND product_id NOT IN (SELECT id FROM products WHERE store_id IN (SELECT id FROM p_stores)) GROUP BY product_id`,
        {},
        t,
      )) as any[];

      await this.remove(t);
      await this.audit(
        actor,
        'test_data_purge',
        { counts, skipped: skipped.length, filters: { before: opts.before?.toISOString() ?? null, entities: opts.roots } },
        t,
      );
      return { deleted: counts, skipped };
    });

    // ---- commit'dan keyin: hisobotlar va fayllar (xato tozalashni bekor qilmaydi)
    for (const p of touchedProducts) {
      await this.sequelize
        .query(`UPDATE products SET reviews_count = GREATEST(COALESCE(reviews_count, 0) - :n, 0) WHERE id = :id`, {
          replacements: { n: p.n, id: p.product_id },
        })
        .catch(() => undefined);
    }
    await this.recomputeStores(touchedStores).catch((e) => this.logger.error(`Hisobot qayta hisoblanmadi: ${e.message}`));
    const removedFiles = await this.removeFiles(files);
    this.logger.warn(
      `Sinov ma'lumotlari tozalandi (${actor.login ?? actor.id}): ${JSON.stringify(result.deleted)}, o'tkazib yuborildi ${result.skipped.length}, fayl ${removedFiles}`,
    );
    return { ...result, files_removed: removedFiles };
  }

  // ============================================================ doira
  private opts(q: { before?: string; entities?: string[] | string }) {
    let before: Date | null = null;
    if (q.before) {
      before = new Date(q.before);
      if (isNaN(before.getTime())) throw new BadRequestException("before — sana (YYYY-MM-DD)");
    }
    const raw = typeof q.entities === 'string' ? q.entities.split(',') : q.entities;
    const roots = (raw?.length ? raw.map((x) => String(x).trim()) : [...PURGE_ROOTS]) as PurgeRoot[];
    const bad = roots.filter((x) => !(PURGE_ROOTS as readonly string[]).includes(x));
    if (bad.length) throw new BadRequestException(`entities: ${PURGE_ROOTS.join(', ')} (noto'g'ri: ${bad.join(', ')})`);
    return { before, roots };
  }

  /**
   * TEMP jadvallar `p_*` — o'chiriladigan yozuvlar; qaytadi — o'tkazib yuborilganlar.
   *
   * Ildizlar (users, stores, store_users, couriers) — `is_test` + `before` + `entities`.
   * Buyurtmalar — `is_test` ва: (`orders` ildiz bo'lsa) `before` bo'yicha, yoki
   * o'chiriladigan ildizga bog'langani. Himoya:
   *   - to'lov qayd etilgan buyurtma -> skipped;
   *   - ildiz `is_test = false` (yoki to'langan) buyurtmaga bog'langan bo'lsa -> o'sha
   *     ildiz skipped (masalan, sinov do'konidagi haqiqiy buyurtma — do'kon qoladi).
   */
  private async scope(o: { before: Date | null; roots: PurgeRoot[] }, t: Transaction): Promise<Skipped[]> {
    const R = new Set(o.roots);
    const rep = { before: o.before };
    const bf = (col: string) => (o.before ? ` AND ${col} < :before` : '');
    const on = (root: PurgeRoot) => (R.has(root) ? 'true' : 'false');
    const exec = (sql: string) => this.q(sql, rep, t);

    // 1) Nomzod ildizlar
    await exec(`CREATE TEMP TABLE c_users ON COMMIT DROP AS SELECT id FROM users WHERE is_test AND ${on('users')}${bf('"createdAt"')}`);
    await exec(`CREATE TEMP TABLE c_stores ON COMMIT DROP AS SELECT id FROM stores WHERE is_test AND ${on('stores')}${bf('"createdAt"')}`);
    await exec(`CREATE TEMP TABLE c_su ON COMMIT DROP AS
                  SELECT id FROM store_users WHERE (is_test AND ${on('store_users')}${bf('"createdAt"')})
                     OR store_id IN (SELECT id FROM c_stores)`);
    await exec(`CREATE TEMP TABLE c_couriers ON COMMIT DROP AS
                  SELECT id FROM couriers WHERE (is_test AND ${on('couriers')}${bf('created_at')})
                     OR store_user_id IN (SELECT id FROM c_su) OR store_id IN (SELECT id FROM c_stores)`);
    // Kuryer hisobi (role = courier) profilisiz qolmasin
    await exec(`INSERT INTO c_su SELECT u.id FROM couriers c JOIN store_users u ON u.id = c.store_user_id
                 WHERE c.id IN (SELECT id FROM c_couriers) AND u.role = 'courier' AND u.id NOT IN (SELECT id FROM c_su)`);

    // 2) Buyurtmalar: bazaviy + nomzod ildizlarga bog'langan (faqat is_test)
    const linked = (u: string, s: string, c: string) => `(
         o.user_id IN (SELECT id FROM ${u})
      OR EXISTS (SELECT 1 FROM "order-items" i WHERE i.order_id = o.id AND i.store_id IN (SELECT id FROM ${s}))
      OR EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND (d.courier_id IN (SELECT id FROM ${c}) OR d.store_id IN (SELECT id FROM ${s})))
      OR EXISTS (SELECT 1 FROM service_jobs j WHERE j.order_id = o.id AND (j.worker_id IN (SELECT id FROM ${c}) OR j.store_id IN (SELECT id FROM ${s})))
      OR EXISTS (SELECT 1 FROM order_quotes q WHERE q.order_id = o.id AND q.store_id IN (SELECT id FROM ${s}))
      OR EXISTS (SELECT 1 FROM order_store_progress p WHERE p.order_id = o.id AND p.store_id IN (SELECT id FROM ${s}))
      OR EXISTS (SELECT 1 FROM order_quote_sections x WHERE x.order_id = o.id AND x.store_id IN (SELECT id FROM ${s})))`;
    await exec(`CREATE TEMP TABLE c_orders ON COMMIT DROP AS SELECT o.id, ${PAID} AS paid FROM orders o
                 WHERE o.is_test AND ((${on('orders')}${bf('o."createdAt"')}) OR ${linked('c_users', 'c_stores', 'c_couriers')})`);
    await exec(`CREATE TEMP TABLE ok_orders ON COMMIT DROP AS SELECT id FROM c_orders WHERE NOT paid`);

    // 3) Himoya: ildiz faqat hamma bog'liq buyurtmasi o'chsa o'chadi
    const skippedRows: any[] = [];
    const skip = async (entity: string, table: string, sql: string, reason: string) => {
      const rows: any[] = await exec(`DELETE FROM ${table} x WHERE ${sql} RETURNING x.id`);
      for (const r of rows) skippedRows.push({ entity, id: Number(r.id), reason });
    };
    const notOk = `NOT IN (SELECT id FROM ok_orders)`;
    const paidList: any[] = await exec(`SELECT id FROM c_orders WHERE paid`);
    for (const r of paidList) skippedRows.push({ entity: 'order', id: Number(r.id), reason: "To'lov qayd etilgan (paid) — qo'lda hal qilinadi" });

    await skip('user', 'c_users', `EXISTS (SELECT 1 FROM orders o WHERE o.user_id = x.id AND o.id ${notOk})`,
      "Sinov bo'lmagan yoki to'langan buyurtmasi bor");
    await skip('courier', 'c_couriers', `EXISTS (SELECT 1 FROM deliveries d WHERE d.courier_id = x.id AND d.order_id ${notOk})`,
      "Sinov bo'lmagan yoki to'langan buyurtmani yetkazgan");
    await skip('store', 'c_stores', `(
         EXISTS (SELECT 1 FROM "order-items" i WHERE i.store_id = x.id AND i.order_id ${notOk})
      OR EXISTS (SELECT 1 FROM deliveries d WHERE d.store_id = x.id AND d.order_id ${notOk})
      OR EXISTS (SELECT 1 FROM service_jobs j WHERE j.store_id = x.id AND j.order_id ${notOk})
      OR EXISTS (SELECT 1 FROM order_quotes q WHERE q.store_id = x.id AND q.order_id ${notOk})
      OR EXISTS (SELECT 1 FROM order_store_progress p WHERE p.store_id = x.id AND p.order_id ${notOk})
      OR EXISTS (SELECT 1 FROM order_quote_sections s WHERE s.store_id = x.id AND s.order_id ${notOk})
      OR EXISTS (SELECT 1 FROM couriers c WHERE c.store_id = x.id AND c.id NOT IN (SELECT id FROM c_couriers)))`,
      "Sinov bo'lmagan buyurtmalari yoki kuryerlari bor");

    // Qolgan do'konlar bo'yicha hisob/kuryer doirasini qayta quramiz
    await exec(`CREATE TEMP TABLE p_stores ON COMMIT DROP AS SELECT id FROM c_stores`);
    await exec(`CREATE TEMP TABLE p_couriers ON COMMIT DROP AS SELECT id FROM couriers
                 WHERE id IN (SELECT id FROM c_couriers) AND (
                       (is_test AND ${on('couriers')}${bf('created_at')})
                    OR store_id IN (SELECT id FROM p_stores)
                    OR store_user_id IN (SELECT id FROM store_users WHERE is_test AND ${on('store_users')}${bf('"createdAt"')})
                    OR store_user_id IN (SELECT id FROM store_users WHERE store_id IN (SELECT id FROM p_stores)))`);
    await exec(`CREATE TEMP TABLE p_su ON COMMIT DROP AS SELECT id FROM store_users
                 WHERE id IN (SELECT id FROM c_su) AND (
                       (is_test AND ${on('store_users')}${bf('"createdAt"')})
                    OR store_id IN (SELECT id FROM p_stores)
                    OR (role = 'courier' AND id IN (SELECT store_user_id FROM couriers WHERE id IN (SELECT id FROM p_couriers))))
                   -- profili qolayotgan hisob o'chmaydi (couriers.store_user_id RESTRICT)
                   AND NOT EXISTS (SELECT 1 FROM couriers c WHERE c.store_user_id = store_users.id AND c.id NOT IN (SELECT id FROM p_couriers))`);
    const suSkipped: any[] = await exec(`SELECT id FROM c_su WHERE id NOT IN (SELECT id FROM p_su)
                                            AND id IN (SELECT id FROM store_users WHERE is_test)`);
    for (const r of suSkipped) skippedRows.push({ entity: 'store_user', id: Number(r.id), reason: "Kuryer/usta profili o'chirilmaydi" });
    await exec(`CREATE TEMP TABLE p_users ON COMMIT DROP AS SELECT id FROM c_users`);

    // 4) Yakuniy buyurtmalar va bog'liqlar
    await exec(`CREATE TEMP TABLE p_orders ON COMMIT DROP AS SELECT o.id FROM orders o
                 WHERE o.id IN (SELECT id FROM ok_orders)
                   AND ((${on('orders')}${bf('o."createdAt"')}) OR ${linked('p_users', 'p_stores', 'p_couriers')})`);
    await exec(`CREATE TEMP TABLE p_deliveries ON COMMIT DROP AS SELECT id FROM deliveries WHERE order_id IN (SELECT id FROM p_orders)`);
    await exec(`CREATE TEMP TABLE p_courier_apps ON COMMIT DROP AS SELECT id FROM courier_applications
                 WHERE courier_id IN (SELECT id FROM p_couriers) OR store_user_id IN (SELECT id FROM p_su)`);
    await exec(`CREATE TEMP TABLE p_seller_apps ON COMMIT DROP AS SELECT id FROM seller_applications
                 WHERE store_id IN (SELECT id FROM p_stores) OR store_user_id IN (SELECT id FROM p_su)`);
    await exec(`CREATE TEMP TABLE p_chats ON COMMIT DROP AS SELECT id FROM chats
                 WHERE client_id IN (SELECT id FROM p_users) OR store_id IN (SELECT id FROM p_stores)`);
    return skippedRows;
  }

  private async counts(t: Transaction): Promise<Counts> {
    const [c]: any[] = await this.q(
      `SELECT
         (SELECT COUNT(*) FROM p_users)::int AS users,
         (SELECT COUNT(*) FROM p_stores)::int AS stores,
         (SELECT COUNT(*) FROM p_su)::int AS store_users,
         (SELECT COUNT(*) FROM p_couriers)::int AS couriers,
         (SELECT COUNT(*) FROM p_orders)::int AS orders,
         (SELECT COUNT(*) FROM "order-items" WHERE order_id IN (SELECT id FROM p_orders))::int AS order_items,
         (SELECT COUNT(*) FROM p_deliveries)::int AS deliveries,
         (SELECT COUNT(*) FROM service_jobs WHERE order_id IN (SELECT id FROM p_orders))::int AS service_jobs,
         (SELECT COUNT(*) FROM order_quotes WHERE order_id IN (SELECT id FROM p_orders))::int AS quotes,
         (SELECT COUNT(*) FROM p_chats)::int AS chats,
         (SELECT COUNT(*) FROM chat_messages WHERE chat_id IN (SELECT id FROM p_chats))::int AS messages,
         ((SELECT COUNT(*) FROM delivery_proofs WHERE delivery_id IN (SELECT id FROM p_deliveries))
          + (SELECT COUNT(*) FROM courier_documents WHERE courier_id IN (SELECT id FROM p_couriers))
          + (SELECT COUNT(*) FROM courier_application_documents WHERE application_id IN (SELECT id FROM p_courier_apps))
          + (SELECT COUNT(*) FROM seller_application_documents WHERE application_id IN (SELECT id FROM p_seller_apps))
          + (SELECT COALESCE(SUM(cardinality(customer_photos) + cardinality(photos_before) + cardinality(photos_after)
                                 + cardinality(final_amount_photos) + (failure_photo IS NOT NULL)::int), 0)
               FROM service_jobs WHERE order_id IN (SELECT id FROM p_orders))
          + (SELECT COUNT(*) FROM product_images WHERE product_id IN (SELECT id FROM products WHERE store_id IN (SELECT id FROM p_stores)))
          + (SELECT COALESCE(SUM(cardinality(photos)), 0) FROM services WHERE store_id IN (SELECT id FROM p_stores)))::int AS files,
         (SELECT COUNT(*) FROM device_tokens WHERE (owner_type = 'user' AND owner_id IN (SELECT id FROM p_users))
                                               OR (owner_type = 'store_user' AND owner_id IN (SELECT id FROM p_su)))::int AS devices`,
      {},
      t,
    );
    return c;
  }

  private async items(entity: PurgeRoot, limit: number, offset: number, t: Transaction) {
    const sql: Record<PurgeRoot, string> = {
      orders: `SELECT o.id, o.status, o."totalAmount" AS total, o.user_id, o."createdAt" AS created_at, o.source
                 FROM orders o WHERE o.id IN (SELECT id FROM p_orders)`,
      users: `SELECT u.id, u.phone_number, u.name, u."createdAt" AS created_at FROM users u WHERE u.id IN (SELECT id FROM p_users)`,
      stores: `SELECT s.id, s.name, s.slug, s."createdAt" AS created_at FROM stores s WHERE s.id IN (SELECT id FROM p_stores)`,
      store_users: `SELECT u.id, u.login, u.role, u.store_id, u."createdAt" AS created_at FROM store_users u WHERE u.id IN (SELECT id FROM p_su)`,
      couriers: `SELECT c.id, c.full_name, c.store_user_id, c.store_id, c.created_at FROM couriers c WHERE c.id IN (SELECT id FROM p_couriers)`,
    };
    const rows: any[] = await this.q(`${sql[entity]} ORDER BY id DESC LIMIT :limit OFFSET :offset`, { limit, offset }, t);
    return rows.map((r) => (r.total !== undefined ? { ...r, total: r.total === null ? null : Number(r.total) } : r));
  }

  /** O'chirish — bog'liqlik tartibida (RESTRICT/NO ACTION FK'lar oldin). */
  private async remove(t: Transaction) {
    const x = (sql: string) => this.q(sql, {}, t);
    // Dalil jadvallari (offer_acceptances, seller_application_events) faqat shu tranzaksiyada
    await x(`SET LOCAL climavent.test_purge = 'on'`);

    // ---- buyurtmalar
    await x(`DELETE FROM delivery_events WHERE delivery_id IN (SELECT id FROM p_deliveries)`);
    await x(`DELETE FROM courier_locations WHERE delivery_id IN (SELECT id FROM p_deliveries)`);
    await x(`DELETE FROM deliveries WHERE id IN (SELECT id FROM p_deliveries)`);
    await x(`DELETE FROM service_jobs WHERE order_id IN (SELECT id FROM p_orders)`);
    await x(`DELETE FROM orders WHERE id IN (SELECT id FROM p_orders)`);

    // ---- arizalar (dalil yozuvlari bilan)
    await x(`DELETE FROM offer_acceptances WHERE courier_application_id IN (SELECT id FROM p_courier_apps)
                OR application_id IN (SELECT id FROM p_seller_apps)
                OR store_user_id IN (SELECT id FROM p_su) OR store_id IN (SELECT id FROM p_stores)
                OR user_id IN (SELECT id FROM p_users)`);
    await x(`DELETE FROM courier_applications WHERE id IN (SELECT id FROM p_courier_apps)`);
    await x(`DELETE FROM seller_application_events WHERE application_id IN (SELECT id FROM p_seller_apps)`);
    await x(`DELETE FROM seller_applications WHERE id IN (SELECT id FROM p_seller_apps)`);

    // ---- kuryerlar (to'lov yozuvlari RESTRICT)
    await x(`DELETE FROM cash_handovers WHERE courier_id IN (SELECT id FROM p_couriers)`);
    await x(`DELETE FROM courier_payouts WHERE courier_id IN (SELECT id FROM p_couriers)`);
    await x(`UPDATE couriers SET active_vehicle_id = NULL WHERE id IN (SELECT id FROM p_couriers)`);
    await x(`DELETE FROM couriers WHERE id IN (SELECT id FROM p_couriers)`);

    // ---- hisoblar
    await x(`DELETE FROM device_tokens WHERE (owner_type = 'user' AND owner_id IN (SELECT id FROM p_users))
                                          OR (owner_type = 'store_user' AND owner_id IN (SELECT id FROM p_su))`);
    await x(`DELETE FROM store_user_logins WHERE store_user_id IN (SELECT id FROM p_su)`);
    await x(`DELETE FROM store_users WHERE id IN (SELECT id FROM p_su)`);

    // ---- do'konlar (mahsulot/xizmat bilan)
    await x(`DELETE FROM products WHERE store_id IN (SELECT id FROM p_stores)`);
    await x(`DELETE FROM services WHERE store_id IN (SELECT id FROM p_stores)`);
    await x(`DELETE FROM stores WHERE id IN (SELECT id FROM p_stores)`);

    // ---- xaridorlar
    await x(`DELETE FROM cart WHERE user_id IN (SELECT id FROM p_users)`);
    await x(`DELETE FROM likes WHERE user_id IN (SELECT id FROM p_users)`);
    await x(`DELETE FROM reviews WHERE user_id IN (SELECT id FROM p_users)`);
    await x(`DELETE FROM selected_to_checkout WHERE user_id IN (SELECT id FROM p_users)`);
    await x(`DELETE FROM otp WHERE phone_number IN (SELECT phone_number FROM users WHERE id IN (SELECT id FROM p_users))`);
    await x(`DELETE FROM users WHERE id IN (SELECT id FROM p_users)`);
  }

  /** Qolgan do'konlar: xizmat reytingi va «N ta ish» (sinov buyurtmalarisiz). */
  private async recomputeStores(storeIds: number[]) {
    for (const id of [...new Set(storeIds)]) {
      await refreshStoreRating(id);
      await this.sequelize.query(
        `UPDATE stores SET jobs_done = (SELECT COUNT(*) FROM service_jobs j JOIN orders o ON o.id = j.order_id
                                          WHERE j.store_id = :id AND j.status = 'completed' AND NOT o.is_test)::int
          WHERE id = :id`,
        { replacements: { id } },
      );
    }
  }

  /** Belgi o'zgargan buyurtmalarning do'konlari — hisobot darhol to'g'rilansin (2.4). */
  private async refreshStoreStats(orderIds: number[]) {
    if (!orderIds.length) return;
    const rows: any[] = await this.sequelize.query(
      `SELECT DISTINCT store_id FROM "order-items" WHERE order_id IN (:ids) AND store_id IS NOT NULL`,
      { replacements: { ids: orderIds }, type: QueryTypes.SELECT },
    );
    await this.recomputeStores(rows.map((r) => Number(r.store_id)));
  }

  /**
   * Ombordagi fayllar. Cloudinary: faqat BOSHQA HECH QAYERDA ishlatilmayotgan
   * havola o'chadi (memory qoidasi: o'chirishdan oldin bazadan tekshirish).
   */
  private async removeFiles(files: { r2: string[]; urls: string[] }) {
    let n = 0;
    if (this.r2.enabled) {
      for (const key of files.r2) {
        try {
          await this.r2.remove(key);
          n++;
        } catch (e) {
          this.logger.error(`R2 fayl o'chmadi (${key}): ${(e as Error).message}`);
        }
      }
    }
    for (const url of [...new Set(files.urls)]) {
      try {
        const [{ used }]: any[] = await this.sequelize.query(
          `SELECT (
             EXISTS (SELECT 1 FROM product_images WHERE image_link = :u)
          OR EXISTS (SELECT 1 FROM services WHERE :u = ANY(photos))
          OR EXISTS (SELECT 1 FROM service_jobs WHERE :u = ANY(customer_photos || photos_before || photos_after || final_amount_photos) OR failure_photo = :u)
          OR EXISTS (SELECT 1 FROM stores WHERE logo_url = :u)
          OR EXISTS (SELECT 1 FROM users WHERE image_url = :u)
          OR EXISTS (SELECT 1 FROM banner b WHERE b::text LIKE '%' || :u || '%')
          OR EXISTS (SELECT 1 FROM category c WHERE c::text LIKE '%' || :u || '%')) AS used`,
          { replacements: { u: url }, type: QueryTypes.SELECT },
        );
        if (used) continue;
        const publicId = cloudinaryPublicId(url);
        if (!publicId) continue;
        await this.cloudinary.deleteImage(publicId);
        n++;
      } catch (e) {
        this.logger.error(`Cloudinary fayl o'chmadi (${url}): ${(e as Error).message}`);
      }
    }
    return n;
  }

  private async audit(actor: AuditActor, action: string, details: any, t?: Transaction) {
    await this.q(
      `INSERT INTO admin_audit (actor_type, actor_id, actor_login, action, details, ip)
       VALUES (:type, :id, :login, :action, CAST(:details AS jsonb), :ip)`,
      {
        type: actor.type,
        id: actor.id ?? null,
        login: actor.login ?? null,
        action,
        details: JSON.stringify(details ?? {}),
        ip: actor.ip ? String(actor.ip).slice(0, 64) : null,
      },
      t,
    );
  }

  private q(sql: string, replacements: any, t?: Transaction): Promise<any[]> {
    return this.sequelize.query(sql, { replacements, transaction: t, type: QueryTypes.SELECT }) as Promise<any[]>;
  }
}

/** `https://res.cloudinary.com/<cloud>/image/upload/v123/climavent/x/abc.jpg` -> `climavent/x/abc` */
export function cloudinaryPublicId(url: string): string | null {
  const m = /\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?([^?#]+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i.exec(url);
  return m ? m[1] : null;
}
