import { Logger } from '@nestjs/common';
import { Column, DataType, Model, Table } from 'sequelize-typescript';
import type { Transaction } from 'sequelize';

/**
 * Kuryer tarixi (topshiriq №40, 1-band): hujjatlar tasdiqlandi / tasdiq olindi,
 * arizadan yaratildi (№41). Kim va qachon — nizoda shu yerdan ko'rinadi.
 */
@Table({ tableName: 'courier_events', timestamps: false })
export class CourierEvent extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column({ type: DataType.STRING(40), allowNull: false }) event: string;
  @Column({ type: DataType.STRING(12), allowNull: false }) actor_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) actor_login: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

const logger = new Logger('CourierEvents');

export async function recordCourierEvent(
  courierId: number,
  event: 'documents_verified' | 'documents_unverified' | 'created_from_application' | 'license_changed',
  actor: { role?: string; user_id?: number | null; login?: string | null } | null,
  comment: string | null = null,
  transaction?: Transaction,
) {
  try {
    await CourierEvent.create(
      {
        courier_id: courierId,
        event,
        actor_type: actor?.role === 'superadmin' || !actor?.user_id ? 'superadmin' : 'store',
        actor_id: actor?.user_id ?? null,
        actor_login: actor?.login ?? (actor?.user_id ? null : 'service-key'),
        comment: comment ? String(comment).slice(0, 1000) : null,
        created_at: new Date(),
      } as any,
      { transaction },
    );
  } catch (e) {
    if (transaction) throw e;
    logger.error(`Kuryer #${courierId} tarixiga yozib bo'lmadi: ${(e as Error).message}`);
  }
}
