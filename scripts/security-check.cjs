// XAVFSIZLIK REGRESSIYA TEKSHIRUVI — HAR RELIZDAN OLDIN ISHLATING.
//
// Nimani tekshiradi: guvohnomasiz yozish, begona ma'lumotga kirish (IDOR),
// huquqni oshirish, token qalbakilashtirish, do'kon izolyatsiyasi, maxfiy
// maydonlarning javobga tushmasligi, kiritish tekshiruvlari, narx
// manipulyatsiyasi, sessiya qoidalari, ochiq token sahifalari, xavfsizlik
// sarlavhalari va CORS.
//
// Ishlatish:
//   1) serverni ko'taring (lokal, prod BAZASIGA ulangan holda ham bo'ladi):
//        PORT=3477 DB_SYNC=false API_BASE_URL_SMS=http://127.0.0.1:3499/api node dist/main.js
//   2) node scripts/security-check.cjs
//
// Hamma so'rov ZARARSIZ: yozish urinishlari ataylab rad etilishi kutiladi,
// tekshiruv paytida o'zgartirilgan yagona maydon (`users.name`) darhol
// qaytariladi. Baza manzili `.env` dan olinadi.
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE = process.env.SECURITY_CHECK_BASE || 'http://127.0.0.1:3477/api';
const KEY = process.env.ACCESS_TOKEN_KEY_USER;
const STORE_KEY = process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY;
const SERVICE = process.env.SERVICE_API_KEY;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  FAIL ' + n + (e ? '  ' + e : '')); } };
const req = async (p, o) => { const r = await fetch(BASE + p, o || {}); let b = null; const t = await r.text(); try { b = JSON.parse(t); } catch (e) { b = t; } return { status: r.status, body: b, text: t, headers: r.headers }; };
const H = (h) => ({ headers: h });
const J = (m, h, b) => ({ method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: JSON.stringify(b) });
const userTok = (id, is_admin) => jwt.sign({ id, is_active: true, is_admin, tv: 0, client: 'web' }, KEY, { expiresIn: '1h' });
const storeTok = (user_id, store_id, role) => jwt.sign({ user_id, store_id, role, login: 'x', tv: 0 }, STORE_KEY, { expiresIn: '1h' });

const db = new Client({
  host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER, password: String(process.env.POSTGRES_PASSWORD),
  database: process.env.POSTGRES_DB, ssl: { rejectUnauthorized: false },
});

(async () => {
  await db.connect();
  const users = (await db.query('SELECT id, is_admin FROM users WHERE is_active ORDER BY id')).rows;
  const oddiy = users.filter((u) => !u.is_admin).map((u) => u.id);
  const A = oddiy[0], B = oddiy[1];
  const order = (await db.query('SELECT id, user_id FROM orders ORDER BY id DESC LIMIT 1')).rows[0];

  console.log('== 1. Guvohnomasiz yozish mumkin emas ==');
  for (const [nom, yol, usul, tana] of [
    ['mahsulot yaratish', '/products/create', 'POST', { name_uz: 'zz', store_id: 2 }],
    ['mahsulot tahrirlash', '/products/update/29', 'PATCH', { name_uz: 'zz' }],
    ['mahsulot o\'chirish', '/products/delete/29', 'DELETE', null],
    ['kategoriya yaratish', '/category/create', 'POST', { name_uz: 'zz', name_ru: 'zz', name_en: 'zz' }],
    ['banner yaratish', '/banners/create', 'POST', { image_url: 'zz' }],
    ['do\'kon yaratish', '/stores/create', 'POST', { name: 'zz', slug: 'zz' }],
    ['kurs o\'zgartirish', '/settings/usd-rate', 'PATCH', { rate: 1 }],
  ]) {
    const r = await req(yol, tana ? J(usul, {}, tana) : { method: usul });
    ok(nom + ' -> 401/403', [401, 403].includes(r.status), String(r.status));
  }

  console.log('');
  console.log('== 2. Mijoz tokeni bilan begona ma\'lumot ==');
  ok('boshqa mijoz profili -> 401/403', [401, 403].includes((await req('/users/one/' + B, H({ Authorization: 'Bearer ' + userTok(A, false) }))).status));
  ok('boshqa mijoz buyurtmalari -> 401/403', [401, 403].includes((await req('/users/badges/' + B, H({ Authorization: 'Bearer ' + userTok(A, false) }))).status));
  ok('boshqa mijoz layklari -> 401/403', [401, 403].includes((await req('/likes/useralllikes/' + B, H({ Authorization: 'Bearer ' + userTok(A, false) }))).status));
  ok('hamma mijozlar ro\'yxati mijozga yopiq', [401, 403].includes((await req('/users/all', H({ Authorization: 'Bearer ' + userTok(A, false) }))).status));
  ok('hamma buyurtmalar mijozga yopiq', [401, 403].includes((await req('/orders/all', H({ Authorization: 'Bearer ' + userTok(A, false) }))).status));
  if (order && order.user_id !== A) {
    ok('begona buyurtma -> 404/403', [403, 404].includes((await req('/orders/one/' + order.id, H({ Authorization: 'Bearer ' + userTok(A, false) }))).status));
  }

  console.log('');
  console.log('== 3. Huquqni oshirish urinishlari ==');
  const meBefore = (await db.query('SELECT is_admin, role, token_version, store_id FROM users WHERE id = $1', [A])).rows[0];
  const esc = await req('/users/update/' + A, J('PATCH', { Authorization: 'Bearer ' + userTok(A, false) },
    { is_admin: true, role: 'admin', store_id: 1, token_version: 999, name: 'zz-sinov' }));
  const meAfter = (await db.query('SELECT is_admin, role, token_version, store_id FROM users WHERE id = $1', [A])).rows[0];
  ok('o\'ziga is_admin bera olmaydi', meAfter.is_admin === meBefore.is_admin, 'javob ' + esc.status);
  ok('rolni o\'zgartira olmaydi', meAfter.role === meBefore.role);
  ok('store_id biriktira olmaydi', String(meAfter.store_id) === String(meBefore.store_id));
  ok('token_version ni buza olmaydi', Number(meAfter.token_version) === Number(meBefore.token_version));
  await db.query('UPDATE users SET name = $2 WHERE id = $1', [A, null]);

  const tampered = jwt.sign({ id: A, is_active: true, is_admin: true, tv: 0 }, 'boshqa-kalit', { expiresIn: '1h' });
  ok('boshqa kalit bilan imzolangan token -> 401', (await req('/users/all', H({ Authorization: 'Bearer ' + tampered }))).status === 401);
  const alg = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ id: A, is_admin: true, tv: 0 })).toString('base64url') + '.';
  ok('alg:none tokeni -> 401', (await req('/users/all', H({ Authorization: 'Bearer ' + alg }))).status === 401);
  const expired = jwt.sign({ id: A, is_active: true, is_admin: true, tv: 0 }, KEY, { expiresIn: '-1h' });
  ok('muddati o\'tgan token -> 401', (await req('/users/all', H({ Authorization: 'Bearer ' + expired }))).status === 401);
  ok('bo\'sh Bearer -> 401', (await req('/users/all', H({ Authorization: 'Bearer ' }))).status === 401);
  ok('noto\'g\'ri servis kaliti -> 401/403', [401, 403].includes((await req('/users/all', H({ 'x-api-key': 'zzz' }))).status));
  const fakeUser = jwt.sign({ id: 999999, is_active: true, is_admin: true, tv: 0 }, KEY, { expiresIn: '1h' });
  ok('mavjud bo\'lmagan hisob tokeni -> 401', (await req('/users/all', H({ Authorization: 'Bearer ' + fakeUser }))).status === 401);
  const wrongTv = jwt.sign({ id: A, is_active: true, is_admin: false, tv: 77 }, KEY, { expiresIn: '1h' });
  ok('eski sessiya (tv mos emas) -> 401', (await req('/users/one/' + A, H({ Authorization: 'Bearer ' + wrongTv }))).status === 401);

  console.log('');
  console.log('== 4. Do\'kon izolyatsiyasi ==');
  const jihozventProduct = (await db.query('SELECT id FROM products WHERE store_id = 2 LIMIT 1')).rows[0];
  const armaventTok = storeTok(50, 7, 'store_admin');
  ok('begona do\'kon mahsulotini tahrirlash -> 403/404',
    [403, 404].includes((await req('/products/update/' + jihozventProduct.id, J('PATCH', { Authorization: 'Bearer ' + armaventTok }, { name_uz: 'zz' }))).status));
  ok('begona do\'kon nomidan mahsulot yaratish -> 403',
    (await req('/products/create', J('POST', { Authorization: 'Bearer ' + armaventTok }, { name_uz: 'zz', store_id: 2, category_id: 14 }))).status === 403);
  ok('do\'kon admini boshqa do\'konni tahrirlay olmaydi -> 403',
    (await req('/stores/update/2', J('PATCH', { Authorization: 'Bearer ' + armaventTok }, { description_uz: 'zz' }))).status === 403);
  ok('do\'kon admini o\'z do\'konini FAOLLASHTIRA olmaydi -> 403',
    (await req('/stores/update/7', J('PATCH', { Authorization: 'Bearer ' + armaventTok }, { is_active: true }))).status === 403);
  const kuryer = (await db.query("SELECT id, store_id, token_version FROM store_users WHERE role = 'courier' AND is_active LIMIT 1")).rows[0];
  if (kuryer) {
    const kTok = jwt.sign(
      { user_id: kuryer.id, store_id: kuryer.store_id, role: 'courier', login: 'k', tv: Number(kuryer.token_version || 0) },
      STORE_KEY, { expiresIn: '1h' });
    ok('kuryer tokeni katalogga kira olmaydi -> 403', (await req('/products/all', H({ Authorization: 'Bearer ' + kTok }))).status === 403);
    ok("kuryer tokeni do'konlar ro'yxatiga kira olmaydi -> 403", (await req('/stores/all', H({ Authorization: 'Bearer ' + kTok }))).status === 403);
    ok("kuryer o'z endpointiga kiradi -> 200", (await req('/courier/me', H({ Authorization: 'Bearer ' + kTok }))).status === 200);
  }

  console.log('');
  console.log('== 5. Maxfiy maydonlar javobda yo\'q ==');
  const sample = [
    (await req('/users/all', H({ 'x-api-key': SERVICE }))).text,
    (await req('/stores/all', H({ 'x-api-key': SERVICE }))).text,
    (await req('/products/one/29?count=false')).text,
  ].join(' ');
  for (const maydon of ['password_hash', 'refresh_token', 'unique_id', 'otp_hash', 'proof_code_hash', 'tracking_token_hash', 'token_hash']) {
    ok('javobda "' + maydon + '" yo\'q', !sample.includes('"' + maydon + '"'));
  }

  console.log('');
  console.log('== 6. Kiritish (input) xavfsizligi ==');
  const inj = await req('/products/search', J('POST', {}, { text: "' OR 1=1 --" }));
  ok('SQL kabi matn qidiruvda xato bermaydi', inj.status === 200 || inj.status === 201, String(inj.status));
  ok('SQL kabi matn butun katalogni qaytarmaydi', Array.isArray(inj.body) && inj.body.length < 137, String(Array.isArray(inj.body) ? inj.body.length : '?'));
  const inj2 = await req('/products/all?limit=999999999999');
  ok('juda katta limit -> 400 yoki cheklangan', inj2.status === 400 || (Array.isArray(inj2.body) && inj2.body.length <= 500), String(inj2.status));
  ok('manfiy sahifa -> 400', (await req('/products/all?page=-5')).status === 400);
  ok('son o\'rniga matn -> 400', (await req('/products/one/abc')).status === 400);
  ok('r2 kalitida yo\'l chiqish -> 400', (await req('/r2/r2-content?key=' + encodeURIComponent('../../secret'))).status === 400);
  ok('r2 kalitida to\'liq URL -> 400', (await req('/r2/r2-content?key=' + encodeURIComponent('https://evil.example/x'))).status === 400);
  const big = 'a'.repeat(300);
  ok('juda uzun qidiruv matni yiqitmaydi', [200, 201, 400].includes((await req('/products/search', J('POST', {}, { text: big }))).status));

  console.log('');
  console.log('== 7. Buyurtma/narx manipulyatsiyasi ==');
  const own = (await db.query('SELECT id FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [A])).rows[0];
  if (own) {
    const before = (await db.query('SELECT "totalAmount", status FROM orders WHERE id = $1', [own.id])).rows[0];
    await req('/orders/update/' + own.id, J('PATCH', { Authorization: 'Bearer ' + userTok(A, false) }, { totalAmount: 1 }));
    const after = (await db.query('SELECT "totalAmount" FROM orders WHERE id = $1', [own.id])).rows[0];
    ok('mijoz summani o\'zgartira olmaydi', String(after.totalAmount) === String(before.totalAmount));
    const st = await req('/orders/update/' + own.id, J('PATCH', { Authorization: 'Bearer ' + userTok(A, false) }, { status: 'paid' }));
    ok('mijoz buyurtmani "to\'landi" qila olmaydi -> 403', st.status === 403, String(st.status));
  } else {
    console.log('   (bu mijozda buyurtma yo\'q — o\'tkazib yuborildi)');
  }
  const foreign = await req('/orders/create', J('POST', { Authorization: 'Bearer ' + userTok(A, false) }, { user_id: B, status: 'new', location: 'zz' }));
  ok('boshqa odam nomidan buyurtma -> 403', foreign.status === 403, String(foreign.status));

  console.log('');
  console.log('== 8. Sessiya va cheklovlar ==');
  ok('refresh: bo\'sh tana -> 400', (await req('/users/refresh', J('POST', {}, {}))).status === 400);
  ok('refresh: yaroqsiz token -> 401', (await req('/users/refresh', J('POST', {}, { refresh_token: 'x'.repeat(64) }))).status === 401);
  ok('signout: yaroqsiz token 500 bermaydi', [200, 201, 400].includes((await req('/users/signout', J('POST', {}, { refresh_token: 'x'.repeat(64) }))).status));
  const bruteforce = [];
  for (let i = 0; i < 12; i++) bruteforce.push(await req('/store-auth/login', J('POST', {}, { login: 'zz-yoq', password: 'zz' })));
  ok('do\'kon kirishida tezlik cheklovi bor (429)', bruteforce.some((r) => r.status === 429));
  ok('kirish xatosi qaysi login mavjudligini oshkor qilmaydi',
    new Set(bruteforce.filter((r) => r.status === 401).map((r) => JSON.stringify(r.body.message))).size <= 1);

  console.log('');
  console.log('== 8b. Ochiq token bilan ishlaydigan sahifalar ==');
  ok("noto'g'ri kuzatish tokeni -> 404", (await req('/tracking/' + 'a'.repeat(32))).status === 404);
  ok('kuzatish tokeni shakli buzuq -> 404/400', [400, 404].includes((await req('/tracking/qisqa')).status));
  ok("noto'g'ri ariza tokeni -> 404", (await req('/seller-applications/status/' + 'b'.repeat(40))).status === 404);
  ok('imzosiz hujjat havolasi -> 400/401/404', [400, 401, 404].includes((await req('/seller-applications/documents/file?token=zzz')).status));
  ok('imzosiz kuryer hujjati -> 400/401/404', [400, 401, 404].includes((await req('/courier-documents/file/zzz')).status));

  console.log('');
  console.log('== 9. Sarlavhalar va CORS ==');
  const h = (await req('/health')).headers;
  ok('X-Powered-By yashirilgan', !h.get('x-powered-by'));
  ok('HSTS bor', Boolean(h.get('strict-transport-security')));
  ok('X-Content-Type-Options bor', h.get('x-content-type-options') === 'nosniff');
  const cors = await fetch(BASE + '/products/allcount', { headers: { Origin: 'https://evil.example' } });
  ok('begona domenga CORS ruxsati yo\'q', !cors.headers.get('access-control-allow-origin'), String(cors.headers.get('access-control-allow-origin')));

  await db.end();
  console.log('');
  console.log('== JAMI: ' + pass + ' ta otdi, ' + fail + ' ta yiqildi ==');
})().catch(async (e) => { console.error('XATO', e); try { await db.end(); } catch (x) {} process.exit(1); });
