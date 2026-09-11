import Sequelize from 'sequelize';

/**
 * Do'kon mahsulotlari id'lari — SQL subquery sifatida (topshiriq №13, 6-band).
 *
 * `where: { product_id: { [Op.in]: storeProductIds(2) } }` ko'rinishida
 * ishlatiladi: alohida so'rov yo'q, filtr bitta SQL da hal bo'ladi va
 * `include: { all: true }` tegilmaydi.
 *
 * `store_id` imzolangan tokendan keladi, lekin baribir SONGA majburan
 * aylantiriladi — satr SQL ga hech qachon to'g'ridan-to'g'ri tushmasin.
 */
export function storeProductIds(storeId: number) {
  const id = Number(storeId);
  if (!Number.isInteger(id) || id < 1) {
    // Noto'g'ri id — hech narsa qaytmasin (hammasi qaytgandan ko'ra xavfsiz)
    return Sequelize.literal('(SELECT NULL::int WHERE false)');
  }
  return Sequelize.literal(`(SELECT id FROM products WHERE store_id = ${id})`);
}

/** So'rov do'kon admini tokeni bilan kelganmi — shunda qatorlar cheklanadi. */
export function scopedStoreId(req: any): number | null {
  const su = req?.storeUser;
  return su?.role === 'store_admin' && su?.store_id ? Number(su.store_id) : null;
}
