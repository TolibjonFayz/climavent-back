import { Column, DataType, Model, Table } from 'sequelize-typescript';

const num = (name: string, type: any, allowNull = true) => ({
  type,
  allowNull,
  get(this: Model) {
    const v = this.getDataValue(name);
    return v === null || v === undefined ? null : Number(v);
  },
});
const coord = (name: string) => num(name, DataType.DECIMAL(9, 6));

/**
 * Xizmat ishi — yetkazishning egizagi (topshiriq №39, 5-band).
 * Xizmat qatori bor buyurtmada har bir hamkor uchun bitta ish.
 */
@Table({ tableName: 'service_jobs', createdAt: 'created_at', updatedAt: 'updated_at' })
export class ServiceJob extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) order_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  /** `couriers.id`; `null` — usta biriktirilmagan */
  @Column({ type: DataType.INTEGER, allowNull: true }) worker_id: number | null;
  /** Shu yetkazish bilan BIRGA bajariladi (bitta odam olib borib o'rnatadi). */
  @Column({ type: DataType.INTEGER, allowNull: true }) delivery_id: number | null;
  /** Kafolat bo'yicha murojaat — asl ish (10-band). */
  @Column({ type: DataType.INTEGER, allowNull: true }) parent_job_id: number | null;
  @Column({ type: DataType.STRING(15), allowNull: false, defaultValue: 'pending' }) status: string;
  /** Shu hamkorning xizmat qatorlari (`order-items.id`). */
  @Column({ type: DataType.ARRAY(DataType.INTEGER), allowNull: false, defaultValue: [] }) items: number[];
  @Column({ type: DataType.STRING(500), allowNull: true }) address: string | null;
  @Column(coord('lat')) lat: number | null;
  @Column(coord('lng')) lng: number | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) address_details: string | null;
  @Column({ type: DataType.STRING(150), allowNull: true }) recipient_name: string | null;
  @Column({ type: DataType.STRING(13), allowNull: true }) recipient_phone: string | null;
  /** Mijoz izohi ("3-qavat, tashqi blok balkonda") va rasmlari. */
  @Column({ type: DataType.STRING(2000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) customer_photos: string[];
  /** Mijoz buyurtmada taklif qilgan vaqt (hamkor boshqa vaqt taklif qilsa ham saqlanadi). */
  @Column({ type: DataType.DATE, allowNull: true }) customer_from: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) customer_to: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) scheduled_from: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) scheduled_to: Date | null;
  /** `proposed` · `confirmed` · `rescheduled` */
  @Column({ type: DataType.STRING(12), allowNull: false, defaultValue: 'proposed' }) schedule_status: string;
  @Column(num('quoted_amount', DataType.BIGINT)) quoted_amount: number | null;
  @Column(num('visit_fee_uzs', DataType.BIGINT)) visit_fee_uzs: number | null;
  @Column(num('final_amount', DataType.BIGINT)) final_amount: number | null;
  /** `null` · `pending` · `accepted` · `rejected` */
  @Column({ type: DataType.STRING(10), allowNull: true }) final_amount_status: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) final_amount_comment: string | null;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) final_amount_photos: string[];
  @Column(num('cod_amount', DataType.BIGINT, false)) cod_amount: number;
  /**
   * Narx o'zgarishidan OLDINGI `cod_amount` (oldindan to'langan qism shundan
   * bilinadi: `quoted - cod_before_price`). Qayta tashrifda tiklanadi.
   */
  @Column(num('cod_before_price', DataType.BIGINT)) cod_before_price: number | null;
  @Column(num('cash_collected', DataType.BIGINT)) cash_collected: number | null;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) photos_before: string[];
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) photos_after: string[];
  /** 4 xonali kod SHIFRLANGAN (AES-256-GCM): mijoz ilovada ochiq ko'radi, shuning uchun xesh emas. */
  @Column({ type: DataType.STRING(200), allowNull: true }) proof_code_enc: string | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) proof_code_attempts: number;
  @Column({ type: DataType.STRING(1000), allowNull: true }) proof_comment: string | null;
  @Column({ type: DataType.STRING(30), allowNull: true }) failure_reason: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) failure_comment: string | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) failure_photo: string | null;
  @Column({ type: DataType.DATE, allowNull: true }) warranty_until: Date | null;
  @Column(num('commission_percent', DataType.DECIMAL(5, 2))) commission_percent: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) assigned_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) accepted_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) started_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) arrived_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) work_started_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) completed_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) failed_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) cancelled_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Ish tarixi — `delivery_events` bilan bir xil tuzilgan. Faqat qo'shiladi. */
@Table({ tableName: 'service_job_events', timestamps: false })
export class ServiceJobEvent extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) job_id: number;
  @Column({ type: DataType.STRING(15), allowNull: true }) from_status: string | null;
  @Column({ type: DataType.STRING(15), allowNull: false }) to_status: string;
  /** Holat o'zgarishi bo'lmagan hodisa (vaqt, narx, ...); `null` — holat o'tishi. */
  @Column({ type: DataType.STRING(30), allowNull: true }) event: string | null;
  @Column({ type: DataType.STRING(12), allowNull: false }) actor_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number | null;
  @Column(coord('lat')) lat: number | null;
  @Column(coord('lng')) lng: number | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Ishga bitta baho (10-band). */
@Table({ tableName: 'service_reviews', createdAt: 'created_at', updatedAt: 'updated_at' })
export class ServiceReview extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false, unique: true }) job_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) order_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) user_id: number;
  @Column({ type: DataType.SMALLINT, allowNull: false }) rating: number;
  @Column({ type: DataType.STRING(2000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) is_hidden: boolean;
  @Column({ type: DataType.INTEGER, allowNull: true }) hidden_by: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export const SERVICE_JOB_MODELS = [ServiceJob, ServiceJobEvent, ServiceReview];

// ============================================================ holatlar
export const JOB_STATUSES = [
  'pending',
  'assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Usta qo'lidagi (faol) holatlar. */
export const JOB_ACTIVE: JobStatus[] = ['assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress'];
export const JOB_HISTORY: JobStatus[] = ['completed', 'failed', 'cancelled'];

export const JOB_FAILURE_REASONS = ['client_unreachable', 'client_refused', 'wrong_address', 'not_possible', 'other'] as const;

/**
 * Ruxsat etilgan o'tishlar (5-band). Boshqa har qanday o'tish — 409.
 * `fail` spetsifikatsiyadagi `in_progress` dan tashqari `on_the_way` va
 * `arrived` dan ham: "mijoz javob bermadi" ish boshlanmasdan bo'ladi.
 */
export const JOB_TRANSITIONS: Record<string, { from: JobStatus[]; to: JobStatus }> = {
  assign: { from: ['pending', 'assigned'], to: 'assigned' },
  reject: { from: ['assigned'], to: 'pending' },
  accept: { from: ['assigned'], to: 'accepted' },
  start: { from: ['accepted'], to: 'on_the_way' },
  arrive: { from: ['on_the_way'], to: 'arrived' },
  begin: { from: ['arrived'], to: 'in_progress' },
  complete: { from: ['in_progress'], to: 'completed' },
  fail: { from: ['on_the_way', 'arrived', 'in_progress'], to: 'failed' },
  cancel: { from: ['pending', 'assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'failed'], to: 'cancelled' },
  retry: { from: ['failed'], to: 'pending' },
};

/** Mijoz o'zi bekor qila oladigan holatlar ("faqat on_the_way gacha"). */
export const JOB_CUSTOMER_CANCEL_FROM: JobStatus[] = ['pending', 'assigned', 'accepted'];

export const JOB_STATUS_TIME: Partial<Record<JobStatus, keyof ServiceJob>> = {
  assigned: 'assigned_at',
  accepted: 'accepted_at',
  on_the_way: 'started_at',
  arrived: 'arrived_at',
  in_progress: 'work_started_at',
  completed: 'completed_at',
  failed: 'failed_at',
  cancelled: 'cancelled_at',
};

/** Kodni shuncha marta noto'g'ri kiritsa — bloklanadi (№22 bilan bir xil). */
export const JOB_CODE_MAX_ATTEMPTS = 5;
/** Rasmlar soni chegarasi (mijoz — 5 ta, usta — 10 ta). */
export const CUSTOMER_PHOTOS_MAX = 5;
export const WORKER_PHOTOS_MAX = 10;
export const SERVICE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
