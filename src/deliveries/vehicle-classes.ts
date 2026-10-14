// Mashina sinflari va yuk hisobi — yagona manba (topshiriq №47, 2- va 3-bo'lim).
//
// `vehicle_type` (foot/bike/car/van/truck) sanoat uskunasi uchun dag'al:
// «truck» 3 tonnalik Isuzu ham, 20 tonnalik fura ham. Sinf aniqroq va
// sig'imi bor. Eski `vehicle_type` javobda qoladi — sinfdan olinadi.

export const VEHICLE_CLASSES = ['car', 'damas', 'gazel', 'truck_3t', 'truck_10t', 'truck_20t', 'crane'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export interface ClassSpec {
  vehicle_type: 'car' | 'van' | 'truck';
  kg: number;
  m3: number;
  crane: boolean;
}

/** Standart sig'im — kuryer mashinasida aniq `capacity_*` bo'lmasa. */
export const CLASS_SPEC: Record<VehicleClass, ClassSpec> = {
  car: { vehicle_type: 'car', kg: 300, m3: 0.8, crane: false },
  damas: { vehicle_type: 'van', kg: 600, m3: 2.5, crane: false },
  gazel: { vehicle_type: 'van', kg: 1500, m3: 9, crane: false },
  truck_3t: { vehicle_type: 'truck', kg: 4000, m3: 18, crane: false },
  truck_10t: { vehicle_type: 'truck', kg: 10000, m3: 36, crane: false },
  truck_20t: { vehicle_type: 'truck', kg: 20000, m3: 82, crane: false },
  crane: { vehicle_type: 'truck', kg: 7000, m3: 20, crane: true },
};

/** Kichikdan kattaga — avtomatik tanlov shu tartibda (kran alohida). */
const ROAD_CLASSES: VehicleClass[] = ['car', 'damas', 'gazel', 'truck_3t', 'truck_10t', 'truck_20t'];

export const isVehicleClass = (x: unknown): x is VehicleClass => (VEHICLE_CLASSES as readonly string[]).includes(String(x));

/**
 * Sinfi yo'q eski yozuv (`vehicle_type` faqat) uchun sinf. Ataylab ENG
 * KICHIK mos sinf: `van` — damas, `truck` — 3 t. Katta yukni kichik
 * deb hisoblash xavfsizroq (birjada kamroq ish ko'radi), aksi — haydovchi
 * borib qaytadi.
 */
export const DEFAULT_CLASS_FOR_TYPE: Record<string, VehicleClass | null> = {
  foot: null,
  bike: null,
  car: 'car',
  van: 'damas',
  truck: 'truck_3t',
};

export const classOf = (vehicleClass?: string | null, vehicleType?: string | null): VehicleClass | null =>
  isVehicleClass(vehicleClass) ? vehicleClass : DEFAULT_CLASS_FOR_TYPE[String(vehicleType)] ?? null;

/** `a` sinfi `b` sinfining ishini qila oladimi (standart sig'im bo'yicha). */
export const classCovers = (a: VehicleClass, b: VehicleClass) =>
  (CLASS_SPEC[b].crane ? CLASS_SPEC[a].crane : true) && CLASS_SPEC[a].kg >= CLASS_SPEC[b].kg && CLASS_SPEC[a].m3 >= CLASS_SPEC[b].m3;

/** Mashinaning amaldagi sig'imi: aniq qiymat bo'lsa u, bo'lmasa sinf standarti. */
export function vehicleCapacity(v: { vehicle_class?: string | null; vehicle_type?: string | null; capacity_kg?: number | null; capacity_m3?: number | null }) {
  const cls = classOf(v.vehicle_class, v.vehicle_type);
  const spec = cls ? CLASS_SPEC[cls] : null;
  return {
    vehicle_class: cls,
    kg: v.capacity_kg !== null && v.capacity_kg !== undefined && Number(v.capacity_kg) > 0 ? Number(v.capacity_kg) : spec?.kg ?? null,
    m3: v.capacity_m3 !== null && v.capacity_m3 !== undefined && Number(v.capacity_m3) > 0 ? Number(v.capacity_m3) : spec?.m3 ?? null,
    crane: !!spec?.crane,
  };
}

// ============================================================ 3-bo'lim: yuk hisobi

/** Qadoq va bo'shliq zaxirasi; ustma-ust qo'yib bo'lmaydigan yuk ko'proq joy egallaydi. */
export const VOLUME_FACTOR = 1.15;
export const VOLUME_FACTOR_NOT_STACKABLE = 1.5;

export interface LoadLine {
  order_item_id: number;
  quantity: number;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  packages: number | null;
  needs_crane: boolean | null;
  stackable: boolean | null;
}

export interface LoadSummary {
  /** Hamma qatorda o'lcham bo'lsagina — aks holda `null` (taxmin qilmaymiz). */
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  needs_crane: boolean;
  /** Eng og'ir bitta joy (dona og'irligi / joylar soni). */
  max_package_kg: number | null;
  dimensions_missing: number[];
  suggested_class: VehicleClass | null;
  /** Eng katta sinfga ham sig'masa — bir necha mashina. */
  split_suggested: { class: VehicleClass; weight_kg: number; volume_m3: number }[] | null;
  loaders_suggested: number;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Yuk ko'taruvchilar taklifi: bitta joy > 50 kg — 2 kishi, > 100 kg — 4 kishi.
 * Liftsiz binoda 2-qavatdan yuqoriga 20 kg dan og'ir joy ham qo'lda chiqadi —
 * kamida 2 kishi.
 */
export function suggestLoaders(maxPackageKg: number | null, floor?: number | null, hasElevator?: boolean | null): number {
  if (maxPackageKg === null) return 0;
  let n = maxPackageKg > 100 ? 4 : maxPackageKg > 50 ? 2 : 0;
  if (Number(floor || 0) >= 2 && hasElevator === false && maxPackageKg > 20) n = Math.max(n, 2);
  return n;
}

const fits = (cls: VehicleClass, kg: number, m3: number) => CLASS_SPEC[cls].kg >= kg && CLASS_SPEC[cls].m3 >= m3;

/** Og'irlik VA hajm sig'adigan eng kichik sinf (kran kerak bo'lsa — faqat `crane`). */
export function smallestClass(kg: number, m3: number, crane: boolean): VehicleClass | null {
  if (crane) return fits('crane', kg, m3) ? 'crane' : null;
  return ROAD_CLASSES.find((c) => fits(c, kg, m3)) ?? null;
}

/** Bitta mashinaga sig'masa — teng bo'laklarga bo'lib, har bo'lakka eng kichik sinf. */
export function splitLoad(kg: number, m3: number, crane: boolean) {
  const biggest: VehicleClass = crane ? 'crane' : 'truck_20t';
  const n = Math.max(2, Math.ceil(Math.max(kg / CLASS_SPEC[biggest].kg, m3 / CLASS_SPEC[biggest].m3)));
  const partKg = round(kg / n, 2);
  const partM3 = round(m3 / n, 3);
  const cls = smallestClass(partKg, partM3, crane) ?? biggest;
  return Array.from({ length: n }, () => ({ class: cls, weight_kg: partKg, volume_m3: partM3 }));
}

export function summarizeLoad(lines: LoadLine[], opts: { floor?: number | null; has_elevator?: boolean | null } = {}): LoadSummary {
  const missing: number[] = [];
  let kg = 0;
  let m3 = 0;
  let maxPkg: number | null = null;
  let crane = false;
  for (const l of lines) {
    if (l.needs_crane) crane = true;
    const q = Math.max(0, Number(l.quantity) || 0);
    if (l.weight_kg !== null && l.weight_kg !== undefined) {
      const perPackage = Number(l.weight_kg) / Math.max(1, Number(l.packages) || 1);
      maxPkg = Math.max(maxPkg ?? 0, perPackage);
    }
    if ([l.weight_kg, l.length_cm, l.width_cm, l.height_cm].some((x) => x === null || x === undefined)) {
      missing.push(Number(l.order_item_id));
      continue;
    }
    kg += Number(l.weight_kg) * q;
    const factor = l.stackable === false ? VOLUME_FACTOR_NOT_STACKABLE : VOLUME_FACTOR;
    m3 += ((Number(l.length_cm) * Number(l.width_cm) * Number(l.height_cm)) / 1e6) * q * factor;
  }
  const complete = lines.length > 0 && missing.length === 0;
  const totalKg = complete ? round(kg, 2) : null;
  const totalM3 = complete ? round(m3, 3) : null;
  let suggested: VehicleClass | null = null;
  let split: LoadSummary['split_suggested'] = null;
  if (complete) {
    suggested = smallestClass(totalKg, totalM3, crane);
    if (!suggested) {
      split = splitLoad(totalKg, totalM3, crane);
      suggested = split[0].class;
    }
  }
  return {
    total_weight_kg: totalKg,
    total_volume_m3: totalM3,
    needs_crane: crane,
    max_package_kg: maxPkg === null ? null : round(maxPkg, 2),
    dimensions_missing: missing,
    suggested_class: suggested,
    split_suggested: split,
    loaders_suggested: suggestLoaders(maxPkg, opts.floor, opts.has_elevator),
  };
}

/**
 * Kuryer mashinasi yetkazishga mos keladimi (4-bo'lim, birja):
 *   - kran talab qilinsa — faqat `crane` sinfi;
 *   - og'irlik/hajm ma'lum bo'lsa — mashinaning AMALDAGI sig'imi ≥ yuk;
 *   - do'kon sinf tanlagan bo'lsa (narx shu sinf bo'yicha) — mashina sinfi
 *     uni qoplashi kerak (do'kon kattaroq sinfni ataylab tanlagan bo'lishi mumkin);
 *   - sinf ham, o'lcham ham yo'q (eski yozuv) — eski `vehicle_type` qoidasi.
 * Qaytadi: `null` — mos, aks holda sabab matni.
 */
export function vehicleMismatch(
  v: { vehicle_class?: string | null; vehicle_type?: string | null; capacity_kg?: number | null; capacity_m3?: number | null },
  d: { vehicle_class?: string | null; required_vehicle?: string | null; total_weight_kg?: number | null; total_volume_m3?: number | null; needs_crane?: boolean | null },
  legacyFits: (courierType: string, required: string) => boolean,
): string | null {
  const cap = vehicleCapacity(v);
  const wantClass = isVehicleClass(d.vehicle_class) ? d.vehicle_class : null;
  const crane = !!d.needs_crane || (wantClass ? CLASS_SPEC[wantClass].crane : false);
  if (crane && !cap.crane) return 'Kran (manipulyator) kerak';
  const kg = d.total_weight_kg === null || d.total_weight_kg === undefined ? null : Number(d.total_weight_kg);
  const m3 = d.total_volume_m3 === null || d.total_volume_m3 === undefined ? null : Number(d.total_volume_m3);
  if (kg !== null && (cap.kg === null || cap.kg < kg)) return `Yuk ${kg} kg — sig'im ${cap.kg ?? 0} kg`;
  if (m3 !== null && (cap.m3 === null || cap.m3 < m3)) return `Hajm ${m3} m³ — sig'im ${cap.m3 ?? 0} m³`;
  if (wantClass) {
    if (!cap.vehicle_class || !classCovers(cap.vehicle_class, wantClass)) {
      return `${cap.vehicle_class ?? v.vehicle_type} ${wantClass} sinfiga mos emas`;
    }
    return null;
  }
  if (kg === null && m3 === null && d.required_vehicle && v.vehicle_type && !legacyFits(String(v.vehicle_type), String(d.required_vehicle))) {
    return `Transport (${v.vehicle_type}) ${d.required_vehicle} talabiga mos emas`;
  }
  return null;
}
