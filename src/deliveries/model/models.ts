import { Column, DataType, Model, Table } from 'sequelize-typescript';

// BIGINT va DECIMAL Postgres'dan SATR bo'lib keladi — JSON'da son bo'lsin.
const num = (name: string, type: any, allowNull = true) => ({
  type,
  allowNull,
  get(this: Model) {
    const v = this.getDataValue(name);
    return v === null || v === undefined ? null : Number(v);
  },
});
const coord = (name: string) => num(name, DataType.DECIMAL(9, 6));

/** Kuryer profili (topshiriq №22, 1-band). Hisob — `store_users`, `role = 'courier'`. */
@Table({ tableName: 'couriers', createdAt: 'created_at', updatedAt: 'updated_at' })
export class Courier extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false, unique: true }) store_user_id: number;
  /** null — platforma kuryeri */
  @Column({ type: DataType.INTEGER, allowNull: true }) store_id: number | null;
  @Column({ type: DataType.STRING(150), allowNull: false }) full_name: string;
  @Column({ type: DataType.STRING(13), allowNull: false, unique: true }) phone: string;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'car' }) vehicle_type: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) is_online: boolean;
  @Column(coord('last_lat')) last_lat: number | null;
  @Column(coord('last_lng')) last_lng: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) last_seen_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) cash_reminded_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Yetkazish (topshiriq №22, 2-band). Bitta buyurtma — har do'kon uchun alohida. */
@Table({ tableName: 'deliveries', createdAt: 'created_at', updatedAt: 'updated_at' })
export class Delivery extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) order_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) courier_id: number | null;
  @Column({ type: DataType.STRING(15), allowNull: false, defaultValue: 'pending' }) status: string;
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'own' }) provider: string;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'car' }) required_vehicle: string;
  @Column({ type: DataType.STRING(500), allowNull: true }) pickup_address: string | null;
  @Column(coord('pickup_lat')) pickup_lat: number | null;
  @Column(coord('pickup_lng')) pickup_lng: number | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) dropoff_address: string | null;
  @Column(coord('dropoff_lat')) dropoff_lat: number | null;
  @Column(coord('dropoff_lng')) dropoff_lng: number | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) dropoff_details: string | null;
  @Column({ type: DataType.STRING(150), allowNull: true }) recipient_name: string | null;
  @Column({ type: DataType.STRING(13), allowNull: true }) recipient_phone: string | null;
  @Column({ type: DataType.DATE, allowNull: true }) window_from: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) window_to: Date | null;
  @Column({ type: DataType.ARRAY(DataType.INTEGER), allowNull: false, defaultValue: [] }) items: number[];
  @Column(num('cod_amount', DataType.BIGINT, false)) cod_amount: number;
  @Column(num('cash_collected', DataType.BIGINT)) cash_collected: number | null;
  @Column(num('delivery_fee', DataType.BIGINT)) delivery_fee: number | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) proof_photo_url: string | null;
  @Column({ type: DataType.STRING(64), allowNull: true }) proof_code_hash: string | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) proof_code_attempts: number;
  @Column({ type: DataType.STRING(1000), allowNull: true }) proof_comment: string | null;
  @Column({ type: DataType.STRING(30), allowNull: true }) failure_reason: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) failure_comment: string | null;
  @Column({ type: DataType.STRING(64), allowNull: true, unique: true }) tracking_token_hash: string | null;
  @Column({ type: DataType.DATE, allowNull: true }) assigned_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) accepted_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) picked_up_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) on_the_way_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) delivered_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) failed_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) returned_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) cancelled_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Yetkazish holati tarixi (topshiriq №22, 2-band). Faqat qo'shiladi. */
@Table({ tableName: 'delivery_events', timestamps: false })
export class DeliveryEvent extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) delivery_id: number;
  @Column({ type: DataType.STRING(15), allowNull: true }) from_status: string | null;
  @Column({ type: DataType.STRING(15), allowNull: false }) to_status: string;
  @Column({ type: DataType.STRING(12), allowNull: false }) actor_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number | null;
  @Column(coord('lat')) lat: number | null;
  @Column(coord('lng')) lng: number | null;
  @Column({ type: DataType.STRING(1000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Topshirish / muvaffaqiyatsizlik rasmi. R2 sozlanmagan bo'lsa baytlar shu yerda. */
@Table({ tableName: 'delivery_proofs', createdAt: 'created_at', updatedAt: false })
export class DeliveryProof extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) delivery_id: number;
  @Column({ type: DataType.STRING(10), allowNull: false }) kind: 'delivered' | 'failed';
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'db' }) storage: string;
  @Column({ type: DataType.STRING(200), allowNull: true }) file_key: string | null;
  @Column({ type: DataType.STRING(50), allowNull: false }) mime: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) size: number;
  @Column({ type: DataType.BLOB, allowNull: true }) data: Buffer | null;
  declare created_at: Date;
}

/** Kuryer yo'l tarixi — faqat faol yetkazish paytida, 30 kun (topshiriq №22, 6-band). */
@Table({ tableName: 'courier_locations', timestamps: false })
export class CourierLocation extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) delivery_id: number | null;
  @Column(num('lat', DataType.DECIMAL(9, 6), false)) lat: number;
  @Column(num('lng', DataType.DECIMAL(9, 6), false)) lng: number;
  @Column({ type: DataType.FLOAT, allowNull: true }) accuracy: number | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Push (FCM) tokenlari (topshiriq №22, 7-band). */
@Table({ tableName: 'device_tokens', timestamps: false })
export class DeviceToken extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.STRING(12), allowNull: false }) owner_type: 'store_user' | 'user';
  @Column({ type: DataType.INTEGER, allowNull: false }) owner_id: number;
  @Column({ type: DataType.STRING(10), allowNull: false }) platform: 'ios' | 'android' | 'web';
  @Column({ type: DataType.STRING(512), allowNull: false, unique: true }) token: string;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) last_used_at: Date;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Kuryerdan qabul qilingan naqd pul (topshiriq №22, 9-band). */
@Table({ tableName: 'cash_handovers', timestamps: false })
export class CashHandover extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column(num('amount', DataType.BIGINT, false)) amount: number;
  @Column({ type: DataType.STRING(500), allowNull: true }) comment: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) received_by_store_user_id: number | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) received_by_login: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

export const DELIVERY_MODELS = [Courier, Delivery, DeliveryEvent, DeliveryProof, CourierLocation, DeviceToken, CashHandover];
