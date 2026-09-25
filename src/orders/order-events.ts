import { Logger } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { emitOrderUpdated } from './order-signal';

/** Buyurtma yo'lidagi hodisa turlari (topshiriq №25, 4-band). */
export const ORDER_EVENTS = [
  'created',
  'status_changed',
  'quote_sent',
  'quote_accepted',
  'quote_rejected',
  'quote_requested_again',
  // №33: do'kon bo'limi 24 soatda narx bermadi
  'quote_section_timeout',
  'delivery_created',
  'delivery_assigned',
  'delivery_started',
  'delivery_delivered',
  'delivery_failed',
  'delivery_cancelled',
  // №38: do'kon yig'ish bosqichi (`store_id` bilan)
  'stage_changed',
  // №39: xizmat ishi (`store_id` bilan)
  'job_created',
  'job_assigned',
  'job_started',
  'job_completed',
  'job_failed',
  'job_cancelled',
  'job_price_changed',
  'job_rescheduled',
  'warranty_claim',
] as const;
export type OrderEventName = (typeof ORDER_EVENTS)[number];

export type OrderActorType = 'customer' | 'store' | 'superadmin' | 'courier' | 'system';

/**
 * Buyurtma tarixi — faqat QO'SHILADI (topshiriq №25, 4-band; №19 dagi savol).
 *
 * KP oqimi uchun kerak bo'ldi: "sotuvchi qachon narx berdi, mijoz qachon
 * qabul qildi, kim bekor qildi" — bularning hammasi bitta joyda ko'rinsin.
 * Mijozga (`oneuser`) `actor_id` siz beriladi.
 */
@Table({ tableName: 'order_events', timestamps: false })
export class OrderEvent extends Model {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.INTEGER, allowNull: false }) order_id: number;
  /** Qaysi do'kon qismi haqida (№38); `null` — butun buyurtma. */
  @Column({ type: DataType.INTEGER, allowNull: true }) store_id: number | null;
  @Column({ type: DataType.STRING(20), allowNull: true }) from_status: string | null;
  @Column({ type: DataType.STRING(20), allowNull: true }) to_status: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false }) event: string;
  @Column({ type: DataType.STRING(12), allowNull: false }) actor_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) note: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

const logger = new Logger('OrderEvents');

export interface OrderEventInput {
  order_id: number;
  store_id?: number | null;
  event: OrderEventName;
  actor_type: OrderActorType;
  actor_id?: number | null;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  transaction?: any;
}

/**
 * Tarixga yozadi. Xato bo'lsa ASOSIY amal buzilmaydi (tranzaksiyasiz
 * chaqiruvlarda) — jurnalda ko'rinadi.
 *
 * Nega statik funksiya, servis emas: yetkazish moduli ham, buyurtmalar
 * moduli ham chaqiradi; DI orqali ulash aylanma bog'liqlik hosil qilardi
 * (`cancelDeliveriesForOrder` bilan bir xil sabab).
 */
export async function recordOrderEvent(input: OrderEventInput): Promise<void> {
  const { transaction, ...row } = input;
  try {
    await OrderEvent.create(
      {
        order_id: row.order_id,
        store_id: row.store_id ?? null,
        from_status: row.from_status ?? null,
        to_status: row.to_status ?? null,
        event: row.event,
        actor_type: row.actor_type,
        actor_id: row.actor_id ?? null,
        note: row.note ? String(row.note).slice(0, 1000) : null,
        created_at: new Date(),
      } as any,
      transaction ? { transaction } : {},
    );
    // Tarixga tushgan har o'zgarish — ilovalarga socket signali (№36).
    // Tranzaksiyada bo'lsa commit'dan keyin ketadi.
    emitOrderUpdated(row.order_id, { transaction });
  } catch (e) {
    if (transaction) throw e;
    logger.error(`Buyurtma tarixiga yozib bo'lmadi (#${row.order_id}): ${(e as Error).message}`);
  }
}

/** Mijozga ko'rsatiladigan ko'rinish — `actor_id` siz (topshiriq №25, 4-band). */
export const publicOrderEvent = (e: OrderEvent) => ({
  event: e.event,
  store_id: e.store_id ?? null,
  from_status: e.from_status,
  to_status: e.to_status,
  actor_type: e.actor_type,
  note: e.note,
  created_at: e.created_at,
});
