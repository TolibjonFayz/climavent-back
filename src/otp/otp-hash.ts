import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * SMS kodini xeshlash (topshiriq №19, 8-band).
 *
 * Ilgari kod bazada OCHIQ saqlanardi: `otp` jadvalini o'qiy olgan har kim
 * (baza nusxasi, zaxira fayli, xato bilan ochiq qolgan ulanish) istalgan
 * raqam nomidan saytga kira olardi — SMS mijozga yetib borishini kutmasdan.
 *
 * Kod atigi 5 raqam, ya'ni oddiy SHA-256 ni 100 000 ta variant bilan
 * bir zumda ochish mumkin. Shuning uchun SERVER SIRI bilan HMAC: sirni
 * bilmasdan xeshlar jadvalini tuzib bo'lmaydi.
 *
 * bcrypt EMAS: kod har tekshiruvda hisoblanadi va OTP ning o'z himoyasi
 * boshqa joyda — 5 daqiqalik muddat, urinishlar soni va sutkalik limit.
 */
function secret(): string {
  return (
    process.env.OTP_HASH_SECRET ||
    // Alohida sozlama bo'lmasa — mavjud server sirini ALMASHTIRIB
    // ishlatamiz (to'g'ridan-to'g'ri emas, xesh orqali).
    createHash('sha256')
      .update(`otp:${process.env.ACCESS_TOKEN_KEY_USER || process.env.ACCESS_TOKEN_KEY || ''}`)
      .digest('hex')
  );
}

export function hashOtp(code: string, phone: string): string {
  // Raqam ham xeshga kiradi: bitta kod boshqa raqamda ishlamasin
  return createHmac('sha256', secret()).update(`${phone}:${code}`).digest('hex');
}

export function otpMatches(code: string, phone: string, stored: string): boolean {
  if (!stored) return false;
  const a = Buffer.from(hashOtp(code, phone));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}
