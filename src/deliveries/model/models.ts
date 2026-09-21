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
  /**
   * Endi FAOL transportdan olinadi (topshiriq №26, 1a-band). Eski mijozlar
   * buzilmasligi uchun ustun va javobdagi kalit saqlanib qoldi.
   */
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'car' }) vehicle_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) active_vehicle_id: number | null;
  /** `employee` · `self_employed` · `ip` (YaTT) · `contractor` */
  @Column({ type: DataType.STRING(20), allowNull: true }) employment_type: string | null;
  /** JShShIR (14) yoki STIR (9) */
  @Column({ type: DataType.STRING(14), allowNull: true }) tin: string | null;
  /** Haydovchilik guvohnomasi toifalari, masalan ['B','C'] */
  @Column({ type: DataType.ARRAY(DataType.STRING(3)), allowNull: false, defaultValue: [] }) license_categories: string[];
  @Column({ type: DataType.DATE, allowNull: true }) documents_verified_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) verified_by: number | null;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) is_online: boolean;
  @Column(coord('last_lat')) last_lat: number | null;
  @Column(coord('last_lng')) last_lng: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) last_seen_at: Date | null;
  /** GPS'dan kelgan yo'nalish (0–360) va tezlik (m/s) — №26, 5-band. */
  @Column({ type: DataType.SMALLINT, allowNull: true }) last_heading: number | null;
  @Column({ type: DataType.FLOAT, allowNull: true }) last_speed: number | null;
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
  // ——— topshiriq №26 ———
  /** Olib ketishda kuryer "oldim" deb belgilagan qatorlar (2-band). */
  @Column({ type: DataType.ARRAY(DataType.INTEGER), allowNull: false, defaultValue: [] }) items_checked: number[];
  @Column({ type: DataType.STRING(1000), allowNull: true }) pickup_comment: string | null;
  /** Tovarni qabul qilgan odam — B2B da mijozning xodimi (3-band). */
  @Column({ type: DataType.STRING(120), allowNull: true }) received_by_name: string | null;
  /** "Yetib keldim" (4-band) — holat o'zgarmaydi, kutish vaqti shundan sanaladi. */
  @Column({ type: DataType.DATE, allowNull: true }) arrived_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) call_attempts: number;
  @Column({ type: DataType.DATE, allowNull: true }) last_call_at: Date | null;
  /** Yuk ko'taruvchilar, qavat va lift (7-band). */
  @Column({ type: DataType.SMALLINT, allowNull: false, defaultValue: 0 }) loaders_needed: number;
  @Column({ type: DataType.SMALLINT, allowNull: true }) floor: number | null;
  @Column({ type: DataType.BOOLEAN, allowNull: true }) has_elevator: boolean | null;
  @Column(num('total_weight_kg', DataType.DECIMAL(10, 2))) total_weight_kg: number | null;
  @Column(num('total_volume_m3', DataType.DECIMAL(10, 3))) total_volume_m3: number | null;
  /** To'lov usuli va fiskal chek (10-band) — hozircha faqat saqlanadi. */
  @Column({ type: DataType.STRING(15), allowNull: true }) payment_method: string | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) fiscal_receipt_url: string | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) fiscal_sign: string | null;
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
  /**
   * Holat o'zgarishi bo'lmagan hodisa (topshiriq №24): `tracking_link_created`
   * va h.k. `null` — oddiy holat o'tishi. Mijoz sahifasi qadamlarni faqat
   * `event IS NULL` yozuvlardan yig'adi.
   */
  @Column({ type: DataType.STRING(30), allowNull: true }) event: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Topshirish / muvaffaqiyatsizlik rasmi. R2 sozlanmagan bo'lsa baytlar shu yerda. */
@Table({ tableName: 'delivery_proofs', createdAt: 'created_at', updatedAt: false })
export class DeliveryProof extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) delivery_id: number;
  /**
   * `pickup` — olib ketish, `delivery` — topshirish, `failure` — amalga
   * oshmaslik, `signature` — qabul qiluvchining imzosi, `incident` — hodisa
   * (topshiriq №26, 2-, 3-, 9-band). Eski yozuvlarda `delivered` / `failed`.
   */
  @Column({ type: DataType.STRING(10), allowNull: false }) kind: string;
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

/** Kuryerning transporti (topshiriq №26, 1a-band). */
@Table({ tableName: 'courier_vehicles', createdAt: 'created_at', updatedAt: 'updated_at' })
export class CourierVehicle extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column({ type: DataType.STRING(10), allowNull: false }) vehicle_type: string;
  /** Davlat raqami; `foot` / `bike` da bo'sh bo'lishi mumkin. */
  @Column({ type: DataType.STRING(20), allowNull: true }) plate: string | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) model: string | null;
  @Column({ type: DataType.STRING(30), allowNull: true }) color: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) capacity_kg: number | null;
  @Column(num('capacity_m3', DataType.DECIMAL(8, 3))) capacity_m3: number | null;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'own' }) owner: string;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'pending' }) status: string;
  @Column({ type: DataType.STRING(500), allowNull: true }) reject_reason: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) verified_by: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) verified_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Transport holati tarixi — kim, qachon, qaysi holatdan qaysisiga. */
@Table({ tableName: 'courier_vehicle_events', timestamps: false })
export class CourierVehicleEvent extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) vehicle_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column({ type: DataType.STRING(10), allowNull: true }) from_status: string | null;
  @Column({ type: DataType.STRING(10), allowNull: false }) to_status: string;
  @Column({ type: DataType.STRING(12), allowNull: false }) actor_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) comment: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Kuryer hujjati (metama'lumot). Baytlar — `courier_document_blobs` da. */
@Table({ tableName: 'courier_documents', createdAt: 'created_at', updatedAt: false })
export class CourierDocument extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) vehicle_id: number | null;
  @Column({ type: DataType.STRING(30), allowNull: false }) type: string;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'db' }) storage: string;
  @Column({ type: DataType.STRING(200), allowNull: false }) file_key: string;
  @Column({ type: DataType.TEXT, allowNull: false }) original_name: string;
  @Column({ type: DataType.STRING(50), allowNull: false }) mime: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) size: number;
  @Column({ type: DataType.DATE, allowNull: true }) deleted_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) uploaded_by: number | null;
  declare created_at: Date;
}

@Table({ tableName: 'courier_document_blobs', timestamps: false })
export class CourierDocumentBlob extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true }) document_id: number;
  @Column({ type: DataType.BLOB, allowNull: false }) data: Buffer;
}

/** Yetkazish tarifi (topshiriq №26, 6-band). `store_id: null` — platforma tarifi. */
@Table({ tableName: 'courier_rates', createdAt: 'created_at', updatedAt: 'updated_at' })
export class CourierRate extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) store_id: number | null;
  @Column({ type: DataType.STRING(10), allowNull: false }) vehicle_type: string;
  @Column(num('base_fee', DataType.BIGINT, false)) base_fee: number;
  @Column(num('per_km', DataType.BIGINT, false)) per_km: number;
  @Column(num('floor_fee', DataType.BIGINT, false)) floor_fee: number;
  @Column(num('wait_fee_per_15min', DataType.BIGINT, false)) wait_fee_per_15min: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

/** Kuryer bilan hisob-kitob (topshiriq №26, 6-band). */
@Table({ tableName: 'courier_payouts', timestamps: false })
export class CourierPayout extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column(num('amount', DataType.BIGINT, false)) amount: number;
  @Column({ type: DataType.DATEONLY, allowNull: true }) period_from: string | null;
  @Column({ type: DataType.DATEONLY, allowNull: true }) period_to: string | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) comment: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) paid_by: number | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) paid_by_login: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}

/** Smena (topshiriq №26, 8-band). `is_online` shundan avtomatik. */
@Table({ tableName: 'courier_shifts', timestamps: false })
export class CourierShift extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) courier_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) vehicle_id: number | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) started_at: Date;
  @Column(coord('start_lat')) start_lat: number | null;
  @Column(coord('start_lng')) start_lng: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) ended_at: Date | null;
  @Column(coord('end_lat')) end_lat: number | null;
  @Column(coord('end_lng')) end_lng: number | null;
}

/** Hodisa: shikast, avariya, o'g'irlik (topshiriq №26, 9-band). */
@Table({ tableName: 'delivery_incidents', createdAt: 'created_at', updatedAt: false })
export class DeliveryIncident extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) delivery_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) courier_id: number | null;
  @Column({ type: DataType.STRING(10), allowNull: false }) type: string;
  @Column({ type: DataType.STRING(2000), allowNull: true }) comment: string | null;
  @Column({ type: DataType.ARRAY(DataType.INTEGER), allowNull: false, defaultValue: [] }) proof_ids: number[];
  declare created_at: Date;
}

export const DELIVERY_MODELS = [
  Courier,
  Delivery,
  DeliveryEvent,
  DeliveryProof,
  CourierLocation,
  DeviceToken,
  CashHandover,
  CourierVehicle,
  CourierVehicleEvent,
  CourierDocument,
  CourierDocumentBlob,
  CourierRate,
  CourierPayout,
  CourierShift,
  DeliveryIncident,
];
