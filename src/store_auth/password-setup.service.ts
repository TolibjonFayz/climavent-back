import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Transaction } from 'sequelize';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { PASSWORD_SETUP_TTL_MS } from 'src/seller_applications/constants';

const SALT_ROUNDS = 10;

export const hashToken = (raw: string) =>
  createHash('sha256').update(String(raw)).digest('hex');

/**
 * Parolni bir martalik havola orqali o'rnatish (topshiriq №16, 7-band).
 *
 * Nega parolni superadmin o'ylab topib yubormaydi: parol HECH KIMGA,
 * superadminga ham ko'rinmasligi, Telegram yoki xatda ochiq yurmasligi
 * kerak. Havola esa bir marta ishlaydi va 72 soatda eskiradi.
 *
 * Token: tasodifiy 32 bayt. Bazada faqat SHA-256 XESHI — baza sizib
 * chiqsa ham undan hisobga parol qo'yib bo'lmaydi. Yangi token berilsa
 * eskisi o'z-o'zidan bekor bo'ladi (ustun bitta).
 */
@Injectable()
export class PasswordSetupService {
  constructor(
    @InjectModel(StoreUser) private readonly storeUserRepo: typeof StoreUser,
  ) {}

  async issue(storeUserId: number, transaction?: Transaction) {
    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_SETUP_TTL_MS);
    const [count] = await this.storeUserRepo.update(
      { password_setup_token_hash: hashToken(raw), password_setup_expires_at: expiresAt } as any,
      { where: { id: storeUserId }, transaction },
    );
    if (!count) throw new NotFoundException('Hisob topilmadi');
    return { password_setup_token: raw, expires_at: expiresAt.toISOString() };
  }

  async setPassword(token: string, password: string) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException("Parol kamida 8 belgi bo'lsin");
    }
    // Yo'q, ishlatilgan yoki muddati o'tgan — hammasi BIR XIL 410: qaysi
    // biri ekanini aytish token taxmin qilishga yordam berardi.
    const gone = new GoneException("Havola yaroqsiz yoki muddati o'tgan");
    if (typeof token !== 'string' || token.length < 32) throw gone;

    return this.storeUserRepo.sequelize.transaction(async (transaction) => {
      const user = await this.storeUserRepo.findOne({
        where: { password_setup_token_hash: hashToken(token) } as any,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user || !user.password_setup_expires_at) throw gone;
      if (new Date(user.password_setup_expires_at).getTime() <= Date.now()) throw gone;

      await user.update(
        {
          password_hash: await bcrypt.hash(password, SALT_ROUNDS),
          // Bir martalik: ishlatilgan zahoti bekor
          password_setup_token_hash: null,
          password_setup_expires_at: null,
        } as any,
        { transaction },
      );
      return { login: user.login };
    });
  }
}
