import { MailerService } from '@nestjs-modules/mailer';
import { User } from 'src/users/model/user.model';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private mailerservice: MailerService) {}
  async sendAdminConfrmation(user: User): Promise<void> {
    const url = `http://localhost:3000/api/users/activate/${user.unique_id}`;
    await this.mailerservice.sendMail({
      to: user.email,
      subject: 'Emailni tasdiqlash',
      template: './confirmation',
      context: {
        name: user.name,
        url,
      },
    });
  }
}
