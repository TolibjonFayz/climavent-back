import { Column, DataType, Model, Table } from 'sequelize-typescript';

const num = (name: string, type: any) => ({
  type,
  allowNull: true,
  get(this: Model) {
    const v = this.getDataValue(name);
    return v === null || v === undefined ? null : Number(v);
  },
});

/**
 * Brigada — topshiriq №44, 1-band. Boshliq (`leader_courier_id`) u orqali kiradi;
 * ish brigadaga biriktirilganda `service_jobs.worker_id` = boshliq, `crew_id` = brigada.
 * `store_id` null — platforma brigadasi.
 */
@Table({ tableName: 'crews', createdAt: 'created_at', updatedAt: 'updated_at' })
export class Crew extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.STRING(80), allowNull: false }) name: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) leader_courier_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) store_id: number | null;
  /** Brigada birga qila oladigan xizmat turlari (`service_categories.key`). */
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) skills: string[];
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] }) service_areas: { region_code: string; district_code?: string | null }[];
  /** Arizada aytilgan son (a'zolar ro'yxatidan mustaqil). */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 }) members_count: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'none' }) trust_level: string;
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] }) verified_skills: string[];
  @Column({ type: DataType.DATE, allowNull: true }) top_revoked_at: Date | null;
  @Column(num('rating', DataType.DECIMAL(3, 2))) rating: number | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) reviews_count: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) jobs_done: number;
  declare created_at: Date;
  declare updated_at: Date;
}

@Table({ tableName: 'crew_members', timestamps: false })
export class CrewMember extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) crew_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  /** `leader` · `member` */
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'member' }) role: string;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) joined_at: Date;
  @Column({ type: DataType.DATE, allowNull: true }) left_at: Date | null;
}

/** Brigadaga taklif (1.3): havola boshliqdan Telegram orqali ketadi (SMS yo'q). Bazada faqat xesh. */
@Table({ tableName: 'crew_invites', createdAt: 'created_at', updatedAt: false })
export class CrewInvite extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) crew_id: number;
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true }) token_hash: string;
  @Column({ type: DataType.STRING(120), allowNull: false }) full_name: string;
  @Column({ type: DataType.STRING(13), allowNull: false }) phone: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) created_by: number | null;
  @Column({ type: DataType.DATE, allowNull: false }) expires_at: Date;
  @Column({ type: DataType.INTEGER, allowNull: true }) application_id: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) accepted_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) revoked_at: Date | null;
  declare created_at: Date;
}

/** Boshliq tanlagan ijrochilar (1.4): ishni ko'radi, holat amallarini qila oladi. */
@Table({ tableName: 'service_job_workers', timestamps: false })
export class ServiceJobWorker extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true }) job_id: number;
  @Column({ type: DataType.INTEGER, primaryKey: true }) courier_id: number;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) added_at: Date;
}

export const CREW_MODELS = [Crew, CrewMember, CrewInvite, ServiceJobWorker];

export const TRUST_LEVELS = ['none', 'documents', 'skills', 'top'] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];
export const TRUST_RANK: Record<string, number> = { none: 0, documents: 1, skills: 2, top: 3 };

/** Taklif havolasi muddati. */
export const CREW_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CREW_INVITE_URL_BASE = (process.env.CREW_INVITE_URL_BASE || 'https://climavent.uz/brigada/').replace(/\/?$/, '/');

/** «Aziz Karimov» -> «Aziz K.» — xaridorga familiya ko'rsatilmaydi (2-band). */
export function shortName(full: string | null | undefined): string | null {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0];
}
