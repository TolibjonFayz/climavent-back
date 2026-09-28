import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = process.env.API_BASE_URL_SMS || 'https://notify.eskiz.uz/api';

@Injectable()
export class OtpService {
  private login: string;
  private password: string;
  private webhookurl: string;
  private readonly tokenFilePath = path.join(__dirname, 'token.json');

  constructor() {
    this.login = process.env.SMS_LOGIN;
    this.password = process.env.SMS_PASSWORD;
    this.webhookurl = process.env.WEB_HOOK_URL;
  }

  // Eskiz'ga login qilib, yangi token oladi va faylga saqlaydi
  private async login_and_save(): Promise<string> {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: this.login,
        password: this.password,
      });
      const data = response.data;
      fs.writeFileSync(this.tokenFilePath, JSON.stringify(data, null, 2));
      return data?.data?.token;
    } catch (error) {
      throw new InternalServerErrorException(
        `Eskiz auth failed: ${error?.message}`,
      );
    }
  }

  // Saqlangan tokenni o'qiydi; bo'lmasa yangi login qiladi
  async auth(): Promise<string> {
    if (!fs.existsSync(this.tokenFilePath)) {
      return this.login_and_save();
    }
    try {
      const tokenData = JSON.parse(
        fs.readFileSync(this.tokenFilePath, 'utf-8'),
      );
      const token = tokenData?.data?.token;
      if (!token) return this.login_and_save();
      return token;
    } catch {
      // Fayl buzilgan bo'lsa — qayta login
      return this.login_and_save();
    }
  }

  async sendOtp(phone: number, otp: string) {
    return this.sendSms(phone, `Climavent.uz saytiga ro‘yxatdan o‘tish uchun tasdiqlash kodi: ${otp}`);
  }

  /**
   * Istalgan SMS (topshiriq №22, 5-band — yetkazish kodi).
   *
   * DIQQAT: Eskiz har bir yangi matnni oldindan moderatsiyadan o'tgan SHABLON
   * sifatida talab qiladi. Tasdiqlanmagan matn rad etiladi — xato qaytadi va
   * logga yoziladi, chaqiruvchi amal buzilmaydi.
   */
  /**
   * Sinov raqamlari (topshiriq №40, 2-band): `SMS_TEST_PHONES` (vergul bilan,
   * `+998…` / `998…` / `90…` ko'rinishida). Bu raqamlarga SMS YUBORILMAYDI —
   * matn (kod bilan) server logiga yoziladi. Har chaqiruvda o'qiladi: Railway'da
   * o'zgaruvchi qo'shilsa qayta deploy shart emas (restart yetadi).
   */
  static isTestPhone(phone: number | string): boolean {
    const norm = (v: string) => {
      const d = String(v).replace(/\D/g, '');
      return d.length === 9 ? `998${d}` : d;
    };
    const list = String(process.env.SMS_TEST_PHONES || '')
      .split(',')
      .map((x) => norm(x.trim()))
      .filter(Boolean);
    return list.length > 0 && list.includes(norm(String(phone)));
  }

  async sendSms(phone: number | string, message: string, isRetry = false) {
    if (OtpService.isTestPhone(phone)) {
      new Logger('Sms').warn(`SMS (sinov raqami, YUBORILMADI) -> ${String(phone)}: ${message}`);
      return true;
    }
    try {
      const token = await this.auth();

      const config = {
        method: 'post',
        url: `${API_BASE_URL}/message/sms/send`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          mobile_phone: Number(String(phone).replace(/\D/g, '')),
          message,
          from: 4546,
          callback_url: this.webhookurl,
        },
      };

      await axios(config);
      return true;
    } catch (error) {
      // Token eskirgan bo'lsa (401/403) — bir marta qayta login qilib, qaytadan urinamiz
      if (
        !isRetry &&
        error.response &&
        (error.response.status === 401 || error.response.status === 403)
      ) {
        await this.login_and_save();
        return this.sendSms(phone, message, true);
      }
      console.error('SMS send error:', error?.response?.data || error.message);
      return {
        error: true,
        message: error.response ? error.response.data?.message : 'Unknown error',
        status: error.response ? error.response.status : 'Unknown status',
      };
    }
  }
}
