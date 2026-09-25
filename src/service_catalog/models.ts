import { Column, DataType, Model, Table } from 'sequelize-typescript';

// BIGINT Postgres'dan SATR bo'lib keladi — JSON'da son bo'lsin.
const bigint = (name: string, allowNull = true) => ({
  type: DataType.BIGINT,
  allowNull,
  get(this: Model) {
    const v = this.getDataValue(name);
    return v === null || v === undefined ? null : Number(v);
  },
});

/** Xizmat turi — platforma belgilaydi (topshiriq №39, 3-band). */
@Table({ tableName: 'service_categories', createdAt: 'created_at', updatedAt: 'updated_at' })
export class ServiceCategory extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  /** `installation` · `dismantling` · `cleaning` · `refill` · `repair` · `survey` — usta ko'nikmasi ham shu kalit. */
  @Column({ type: DataType.STRING(30), allowNull: false, unique: true }) key: string;
  @Column({ type: DataType.STRING(120), allowNull: false }) name_uz: string;
  @Column({ type: DataType.STRING(120), allowNull: true }) name_ru: string | null;
  @Column({ type: DataType.STRING(120), allowNull: true }) name_en: string | null;
  @Column({ type: DataType.STRING(60), allowNull: true }) icon: string | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) sort: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Hamkor xizmati (3-band). Narx faqat so'mda, variantlarda. */
@Table({ tableName: 'services', createdAt: 'created_at', updatedAt: 'updated_at' })
export class Service extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) category_id: number;
  @Column({ type: DataType.STRING(200), allowNull: false }) name_uz: string;
  @Column({ type: DataType.STRING(200), allowNull: true }) name_ru: string | null;
  @Column({ type: DataType.STRING(200), allowNull: true }) name_en: string | null;
  @Column({ type: DataType.TEXT, allowNull: true }) description_uz: string | null;
  @Column({ type: DataType.TEXT, allowNull: true }) description_ru: string | null;
  @Column({ type: DataType.TEXT, allowNull: true }) description_en: string | null;
  /** `fixed` · `from` ("…dan", yakuniy narx joyida) · `quote` (KP orqali) */
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'fixed' }) price_type: string;
  /** `piece` · `m2` · `m` · `hour` · `visit` */
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'piece' }) unit: string;
  /** `from` uchun chiqish haqi; mijoz narxni rad etsa ham shu olinadi. `null` — bepul. */
  @Column(bigint('visit_fee_uzs')) visit_fee_uzs: number | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) duration_minutes: number | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) warranty_months: number;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) photos: string[];
  /** Ochiq savol: platforma komissiyasi. Hozircha `null`. */
  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    get(this: Model) {
      const v = this.getDataValue('commission_percent');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  commission_percent: number | null;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) sort: number;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Xizmat varianti — narx quvvat/o'lchamga qarab (3-band). */
@Table({ tableName: 'service_variants', createdAt: 'created_at', updatedAt: 'updated_at' })
export class ServiceVariant extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) service_id: number;
  @Column({ type: DataType.STRING(200), allowNull: false }) name_uz: string;
  @Column({ type: DataType.STRING(200), allowNull: true }) name_ru: string | null;
  @Column({ type: DataType.STRING(200), allowNull: true }) name_en: string | null;
  /** `fixed` da majburiy; `from` da "…dan" narx; `quote` da `null`. */
  @Column(bigint('price_uzs')) price_uzs: number | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) sort: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Tovarga bog'lash — savatdagi "O'rnatib berish" taklifi uchun (3- va 6-band). */
@Table({ tableName: 'service_product_links', timestamps: false })
export class ServiceProductLink extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) service_id: number;
  /** `null` — mijoz variantni o'zi tanlaydi */
  @Column({ type: DataType.INTEGER, allowNull: true }) variant_id: number | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) category_id: number | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) product_id: number | null;
}

/** Xizmat hududi (1-band). `district_code: null` — butun viloyat. */
@Table({ tableName: 'store_service_areas', createdAt: 'created_at', updatedAt: false })
export class StoreServiceArea extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  @Column({ type: DataType.STRING(40), allowNull: false }) region_code: string;
  @Column({ type: DataType.STRING(40), allowNull: true }) district_code: string | null;
  declare created_at: Date;
}

export const SERVICE_CATALOG_MODELS = [ServiceCategory, Service, ServiceVariant, ServiceProductLink, StoreServiceArea];

export const PRICE_TYPES = ['fixed', 'from', 'quote'] as const;
export const SERVICE_UNITS = ['piece', 'm2', 'm', 'hour', 'visit'] as const;
