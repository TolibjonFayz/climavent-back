import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = 'https://notify.eskiz.uz/api';

@Injectable()
export class OtpService {
  private login;
  private password;
  private webhookurl;
  constructor() {
    this.login = process.env.SMS_LOGIN;
    this.password = process.env.SMS_PASSWORD;
    this.webhookurl = process.env.WEB_HOOK_URL;
  }

  async auth() {
    const tokenFilePath = path.join(__dirname, 'token.json');
    try {
      if (!fs.existsSync(tokenFilePath)) {
        const response = await axios.post(`${API_BASE_URL}/auth/login`, {
          email: this.login,
          password: this.password,
        });
        const data = response.data;
        console.log('Hehe', data);

        fs.writeFileSync(tokenFilePath, JSON.stringify(data, null, 2));
        return;
      }
      console.log('What is that bro');
      return;
    } catch (error) {
      throw new InternalServerErrorException(error?.message);
    }
  }

  async sendOtp(phone: number, otp: number) {
    try {
      const tokenData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'token.json'), 'utf-8'),
      );

      const res = await this.auth();
      // // Update token function
      // var updatetoken = {
      //   method: 'patch',
      //   maxBodyLength: Infinity,
      //   url: `${API_BASE_URL}/auth/refresh`,
      //   headers: {
      //     Authorization: `Bearer ${tokenData?.data?.token}`,
      //   },
      // };
      // axios(updatetoken)
      //   .then(function (response) {
      //     console.log(JSON.stringify(response.data));
      //   })
      //   .catch(function (error) {
      //     console.log(error);
      //   });

      const config = {
        method: 'post',
        url: `${API_BASE_URL}/message/sms/send`,
        headers: {
          Authorization: `Bearer ${tokenData?.data?.token}`,
        },
        data: {
          mobile_phone: phone,
          message: `Climavent.uz saytiga ro‘yxatdan o‘tish uchun tasdiqlash kodi: ${otp}`,
          from: 4546,
          callback_url: this.webhookurl,
        },
      };

      let response;
      try {
        response = await axios(config);
      } catch (error) {
        console.log(error);
      }
      return true;
    } catch (error) {
      console.log(`Error ${error}`);
      if (
        error.response &&
        (error.response.status === 401 || error.response.status === 403)
      ) {
        await this.auth();
        return this.sendOtp(phone, otp);
      }
      console.error('Send error:', error.message);
      return {
        error: true,
        message: error.response ? error.response.data.message : 'Unknown error',
        status: error.response ? error.response.status : 'Unknown status',
      };
    }
  }
}
