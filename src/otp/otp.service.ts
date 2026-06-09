import { Injectable, InternalServerErrorException } from '@nestjs/common';
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

  async sendOtp(phone: number, otp: string, isRetry = false) {
    try {
      const token = await this.auth();

      const config = {
        method: 'post',
        url: `${API_BASE_URL}/message/sms/send`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          mobile_phone: phone,
          message: `Climavent.uz saytiga ro‘yxatdan o‘tish uchun tasdiqlash kodi: ${otp}`,
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
        return this.sendOtp(phone, otp, true);
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
