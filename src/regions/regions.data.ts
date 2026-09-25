/**
 * Viloyatlar va tumanlar — STATIK ma'lumotnoma (topshiriq №39, 1-band).
 *
 * Backendda bunday ro'yxat yo'q edi (`users.region` erkin matn). Xizmat
 * hududini qidirish uchun qat'iy kodlar kerak, shuning uchun bazaga jadval
 * emas, kodga ro'yxat: u deyarli o'zgarmaydi va migratsiyasiz yangilanadi.
 *
 * Kodlar lotincha, kichik harf, `_` bilan. Tuman kodi BUTUN RO'YXAT bo'ylab
 * YAGONA (shahar va tuman nomi bir xil bo'lsa `_city` qo'shiladi), shuning
 * uchun `?district=yunusobod` viloyatsiz ham aniq.
 *
 * Birinchi navbatda Toshkent shahri va Toshkent viloyati tumanlari to'liq;
 * qolgan viloyatlarda hozircha tuman yo'q — hamkor butun viloyatni belgilaydi.
 */
export interface District {
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
}
export interface Region extends District {
  districts: District[];
}

const d = (code: string, name_uz: string, name_ru: string, name_en: string): District => ({
  code,
  name_uz,
  name_ru,
  name_en,
});

export const REGIONS: Region[] = [
  {
    ...d('tashkent_city', 'Toshkent shahri', 'город Ташкент', 'Tashkent city'),
    districts: [
      d('bektemir', 'Bektemir tumani', 'Бектемирский район', 'Bektemir district'),
      d('chilonzor', 'Chilonzor tumani', 'Чиланзарский район', 'Chilanzar district'),
      d('mirobod', 'Mirobod tumani', 'Мирабадский район', 'Mirabad district'),
      d('mirzo_ulugbek', "Mirzo Ulug'bek tumani", 'Мирзо-Улугбекский район', 'Mirzo Ulugbek district'),
      d('olmazor', 'Olmazor tumani', 'Алмазарский район', 'Almazar district'),
      d('sergeli', 'Sergeli tumani', 'Сергелийский район', 'Sergeli district'),
      d('shayxontohur', 'Shayxontohur tumani', 'Шайхантахурский район', 'Shaykhantakhur district'),
      d('uchtepa', 'Uchtepa tumani', 'Учтепинский район', 'Uchtepa district'),
      d('yakkasaroy', 'Yakkasaroy tumani', 'Яккасарайский район', 'Yakkasaray district'),
      d('yangihayot', 'Yangihayot tumani', 'Янгихаётский район', 'Yangikhayot district'),
      d('yashnobod', 'Yashnobod tumani', 'Яшнабадский район', 'Yashnabad district'),
      d('yunusobod', 'Yunusobod tumani', 'Юнусабадский район', 'Yunusabad district'),
    ],
  },
  {
    ...d('tashkent_region', 'Toshkent viloyati', 'Ташкентская область', 'Tashkent region'),
    districts: [
      d('bekobod', 'Bekobod tumani', 'Бекабадский район', 'Bekabad district'),
      d('boka', "Bo'ka tumani", 'Букинский район', 'Buka district'),
      d('bostonliq', "Bo'stonliq tumani", 'Бостанлыкский район', 'Bostanliq district'),
      d('chinoz', 'Chinoz tumani', 'Чиназский район', 'Chinaz district'),
      d('qibray', 'Qibray tumani', 'Кибрайский район', 'Kibray district'),
      d('ohangaron', 'Ohangaron tumani', 'Ахангаранский район', 'Akhangaran district'),
      d('oqqorgon', "Oqqo'rg'on tumani", 'Аккурганский район', 'Akkurgan district'),
      d('parkent', 'Parkent tumani', 'Паркентский район', 'Parkent district'),
      d('piskent', 'Piskent tumani', 'Пскентский район', 'Pskent district'),
      d('quyi_chirchiq', 'Quyi Chirchiq tumani', 'Куйичирчикский район', 'Quyi Chirchiq district'),
      d('orta_chirchiq', "O'rta Chirchiq tumani", 'Уртачирчикский район', 'Orta Chirchiq district'),
      d('yuqori_chirchiq', 'Yuqori Chirchiq tumani', 'Юкоричирчикский район', 'Yuqori Chirchiq district'),
      d('yangiyol', "Yangiyo'l tumani", 'Янгиюльский район', 'Yangiyul district'),
      d('zangiota', 'Zangiota tumani', 'Зангиатинский район', 'Zangiata district'),
      d('toshkent_tumani', 'Toshkent tumani', 'Ташкентский район', 'Tashkent district'),
      d('nurafshon', 'Nurafshon shahri', 'город Нурафшан', 'Nurafshon city'),
      d('olmaliq', 'Olmaliq shahri', 'город Алмалык', 'Almalyk city'),
      d('angren', 'Angren shahri', 'город Ангрен', 'Angren city'),
      d('bekobod_city', 'Bekobod shahri', 'город Бекабад', 'Bekabad city'),
      d('chirchiq', 'Chirchiq shahri', 'город Чирчик', 'Chirchiq city'),
      d('ohangaron_city', 'Ohangaron shahri', 'город Ахангаран', 'Akhangaran city'),
      d('yangiyol_city', "Yangiyo'l shahri", 'город Янгиюль', 'Yangiyul city'),
    ],
  },
  { ...d('andijan', 'Andijon viloyati', 'Андижанская область', 'Andijan region'), districts: [] },
  { ...d('bukhara', 'Buxoro viloyati', 'Бухарская область', 'Bukhara region'), districts: [] },
  { ...d('fergana', "Farg'ona viloyati", 'Ферганская область', 'Fergana region'), districts: [] },
  { ...d('jizzakh', 'Jizzax viloyati', 'Джизакская область', 'Jizzakh region'), districts: [] },
  { ...d('karakalpakstan', "Qoraqalpog'iston Respublikasi", 'Республика Каракалпакстан', 'Republic of Karakalpakstan'), districts: [] },
  { ...d('kashkadarya', 'Qashqadaryo viloyati', 'Кашкадарьинская область', 'Kashkadarya region'), districts: [] },
  { ...d('khorezm', 'Xorazm viloyati', 'Хорезмская область', 'Khorezm region'), districts: [] },
  { ...d('namangan', 'Namangan viloyati', 'Наманганская область', 'Namangan region'), districts: [] },
  { ...d('navoi', 'Navoiy viloyati', 'Навоийская область', 'Navoi region'), districts: [] },
  { ...d('samarkand', 'Samarqand viloyati', 'Самаркандская область', 'Samarkand region'), districts: [] },
  { ...d('surkhandarya', 'Surxondaryo viloyati', 'Сурхандарьинская область', 'Surkhandarya region'), districts: [] },
  { ...d('syrdarya', 'Sirdaryo viloyati', 'Сырдарьинская область', 'Syrdarya region'), districts: [] },
];

const REGION_BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));
const REGION_OF_DISTRICT = new Map(REGIONS.flatMap((r) => r.districts.map((x) => [x.code, r.code] as const)));

export const isRegion = (code: unknown): code is string => typeof code === 'string' && REGION_BY_CODE.has(code);

/** Tuman shu viloyatnikimi (viloyat berilmasa — umuman bormi). */
export function isDistrict(code: unknown, region?: string | null): code is string {
  if (typeof code !== 'string') return false;
  const owner = REGION_OF_DISTRICT.get(code);
  return !!owner && (!region || owner === region);
}

/** Tumandan viloyatni topadi (`?district=yunusobod` viloyatsiz kelganda). */
export const regionOfDistrict = (code: string | null | undefined): string | null =>
  (code && REGION_OF_DISTRICT.get(code)) || null;
