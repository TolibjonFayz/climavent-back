import { StoreUser } from 'src/store_users/model/store_user.model';
import type { StoreRequester } from './store_auth.guard';
import { staffInfo } from './staff-permissions';

/**
 * Do'kon paneli tokenidan so'rov egasini BAZA bo'yicha aniqlaydi (topshiriq №17, 3-band).
 *
 * Ilgari guard faqat JWT imzosi va ichidagi `role` ga ishonardi: hisob nofaol
 * qilinsa yoki o'chirilsa ham token muddati tugaguncha (12 soat) hamma narsa
 * ishlardi — superadmin bo'lsa arizalar, pasport havolalari, do'konlar.
 *
 * Endi har so'rovda:
 *   - hisob bazada bor va `is_active`;
 *   - tokendagi `tv` hisobning `token_version` iga teng (parol almashsa oshadi —
 *     o'g'irlangan eski token o'ladi);
 *   - rol va do'kon TOKENDAN EMAS, bazadan olinadi: superadminlikdan tushirilgan
 *     yoki boshqa do'konga o'tkazilgan hisob darhol yangi huquq bilan ishlaydi.
 *
 * `null` — tokenni rad etish kerak (chaqiruvchi 401 beradi).
 *
 * Model DI orqali emas, to'g'ridan-to'g'ri ishlatiladi: guard ko'p modulda
 * `@UseGuards` bilan qo'llanadi va har biriga `StoreUser` ni qo'shish shart bo'lmasin.
 */
export async function resolveStoreSession(payload: any): Promise<StoreRequester | null> {
  const id = Number(payload?.user_id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const user = await StoreUser.findByPk(id, {
    attributes: ['id', 'login', 'role', 'store_id', 'is_active', 'token_version'],
  });
  if (!user || !user.is_active) return null;
  if (Number(payload?.tv ?? 0) !== Number(user.token_version ?? 0)) return null;
  if (!['superadmin', 'store_admin', 'courier', 'store_staff'].includes(user.role)) return null;

  // Xodim (topshiriq №35): roli bazadan; rol yo'q/o'chirilgan yoki do'kon
  // nofaol — token o'lik. Ma'lumot doirasi — o'z do'konining admini kabi
  // (`role: 'store_admin'`), endpoint ruxsatlari — `staff` (StaffPermissionGuard).
  if (user.role === 'store_staff') {
    if (!user.store_id) return null;
    const staff = await staffInfo({ id: user.id, store_id: user.store_id });
    if (!staff) return null;
    return {
      role: 'store_admin',
      store_id: user.store_id,
      user_id: user.id,
      login: user.login,
      staff,
    };
  }

  // Kuryer (topshiriq №22): profili o'chirilgan bo'lsa token ham o'lik.
  if (user.role === 'courier') {
    const [row] = (await StoreUser.sequelize.query(
      'SELECT is_active FROM couriers WHERE store_user_id = :id',
      { replacements: { id: user.id }, type: 'SELECT' as any },
    )) as any[];
    if (!row?.is_active) return null;
  }

  return {
    role: user.role as StoreRequester['role'],
    store_id: user.role === 'superadmin' ? null : user.store_id ?? null,
    user_id: user.id,
    login: user.login,
  };
}
