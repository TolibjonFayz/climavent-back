import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * Kuryer / usta bo'lish arizasi — topshiriq №41 (sotuvchi arizasining №16 egizagi).
 * Parol ariza paytida qo'yiladi (bcrypt); ochiq holat tokeni bazada faqat xesh.
 */
@Table({ tableName: 'courier_applications', createdAt: 'created_at', updatedAt: 'updated_at' })
export class CourierApplication extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.STRING(12), allowNull: false, defaultValue: 'pending' }) status: string;
  @Column({ type: DataType.STRING(120), allowNull: false }) full_name: string;
  @Column({ type: DataType.STRING(13), allowNull: false }) phone: string;
  @Column({ type: DataType.DATEONLY, allowNull: false }) birth_date: string;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false }) skills: string[];
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] }) regions: { region_code: string; district_code?: string | null }[];
  /** A'zo arizasida (taklif bilan, №44) ixtiyoriy. */
  @Column({ type: DataType.STRING(20), allowNull: true }) employment_type: string | null;
  @Column({ type: DataType.STRING(14), allowNull: true }) tin: string | null;
  @Column({ type: DataType.JSONB, allowNull: true }) vehicle: VehicleInput | null;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) license_categories: string[];
  @Column({ type: DataType.STRING(1000), allowNull: true }) experience: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.TEXT, allowNull: false }) password_hash: string;
  @Column({ type: DataType.STRING(2), allowNull: true }) lang: string | null;
  @Column({ type: DataType.STRING(512), allowNull: true }) push_token: string | null;
  @Column({ type: DataType.STRING(10), allowNull: true }) push_platform: string | null;
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true }) public_token_hash: string;
  @Column({ type: DataType.TEXT, allowNull: false }) offer_version: string;
  @Column({ type: DataType.DATE, allowNull: false }) offer_accepted_at: Date;
  @Column({ type: DataType.TEXT, allowNull: true }) offer_ip: string | null;
  @Column({ type: DataType.TEXT, allowNull: true }) offer_user_agent: string | null;
  @Column({ type: DataType.STRING(2000), allowNull: true }) info_request: string | null;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) missing_documents: string[];
  @Column({ type: DataType.STRING(2000), allowNull: true }) reject_reason: string | null;
  @Column({ type: DataType.STRING(2000), allowNull: true }) admin_note: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) reviewed_by: number | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) reviewed_by_login: string | null;
  @Column({ type: DataType.DATE, allowNull: true }) reviewed_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) courier_id: number | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) store_user_id: number | null;
  /** `individual` · `crew` (boshliq) · `crew_member` (taklif havolasi bilan) — №44, 1.2 */
  @Column({ type: DataType.STRING(12), allowNull: false, defaultValue: 'individual' }) applicant_type: string;
  @Column({ type: DataType.JSONB, allowNull: true }) crew: CrewInput | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) crew_invite_id: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export interface CrewInput {
  name: string;
  members_count: number;
  members?: { full_name: string; phone: string; skills?: string[] }[];
}

export interface VehicleInput {
  vehicle_type: string;
  plate?: string | null;
  model?: string | null;
  color?: string | null;
  owner?: string | null;
}

@Table({ tableName: 'courier_application_documents', createdAt: 'created_at', updatedAt: false })
export class CourierApplicationDocument extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) application_id: number | null;
  @Column({ type: DataType.STRING(30), allowNull: false }) type: string;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'db' }) storage: string;
  @Column({ type: DataType.STRING(200), allowNull: false }) file_key: string;
  @Column({ type: DataType.TEXT, allowNull: false }) original_name: string;
  @Column({ type: DataType.STRING(50), allowNull: false }) mime: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) size: number;
  /** Tasdiqlangach kuryer hujjatiga ko'chirildi — fayl endi o'sha yerda. */
  @Column({ type: DataType.INTEGER, allowNull: true }) courier_document_id: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) deleted_at: Date | null;
  declare created_at: Date;
}

@Table({ tableName: 'courier_application_document_blobs', timestamps: false })
export class CourierApplicationDocumentBlob extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true }) document_id: number;
  @Column({ type: DataType.BLOB, allowNull: false }) data: Buffer;
}

@Table({ tableName: 'courier_application_events', timestamps: false })
export class CourierApplicationEvent extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) application_id: number;
  @Column({ type: DataType.STRING(30), allowNull: false }) type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) actor_login: string | null;
  @Column({ type: DataType.STRING(2000), allowNull: true }) message: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

export const COURIER_APPLICATION_MODELS = [
  CourierApplication,
  CourierApplicationDocument,
  CourierApplicationDocumentBlob,
  CourierApplicationEvent,
];

// ============================================================ qoidalar
export const APPLICATION_STATUSES = ['pending', 'needs_info', 'approved', 'rejected', 'withdrawn'] as const;
export const OPEN_STATUSES = ['pending', 'needs_info'];
/** Shu holatlarda telefon band (bazada qisman unique indeks ham bor). */
export const PHONE_BUSY_STATUSES = ['pending', 'needs_info', 'approved'];

export const APPLICATION_DOC_TYPES = [
  'passport',
  'selfie',
  'driver_license',
  'vehicle_registration',
  'self_employed_certificate',
  'ip_certificate',
  'skill_certificate',
] as const;

export const EMPLOYMENT = ['self_employed', 'ip'] as const;

/** Ariza fayllari: har biri ≤ 10 MB; bitta arizada ko'pi bilan 20 ta. */
export const APP_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const APP_DOCS_MAX = 20;
/** Arizaga bog'lanmagan yuklama shuncha vaqtdan keyin o'chiriladi. */
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
/** Rad etilgan / qaytarib olingan ariza hujjatlari shuncha kundan keyin o'chiriladi. */
export const REJECTED_DOCS_RETENTION_DAYS = 30;
export const DOC_URL_TTL_MS = 5 * 60 * 1000;

/** Majburiy hujjatlar (1.2-band). */
export function requiredApplicationDocs(a: {
  employment_type?: string | null;
  vehicle?: VehicleInput | null;
}): string[] {
  const need = ['passport', 'selfie'];
  if (a.vehicle && ['car', 'van', 'truck'].includes(a.vehicle.vehicle_type)) need.push('driver_license');
  if (a.vehicle?.plate && String(a.vehicle.plate).trim()) need.push('vehicle_registration');
  if (a.employment_type === 'self_employed') need.push('self_employed_certificate');
  if (a.employment_type === 'ip') need.push('ip_certificate');
  return need;
}

/** Telefon: `+998901234567` / `998901234567` / `901234567` -> `998901234567` (yoki null). */
export function normalizePhoneDigits(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 9) return `998${d}`;
  if (d.length === 12 && d.startsWith('998')) return d;
  return null;
}
