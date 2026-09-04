import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { StoreLoginDto } from './dto/store-login.dto';

@Injectable()
export class StoreAuthService {
  constructor(
    @InjectModel(StoreUser)
    private readonly storeUserRepository: typeof StoreUser,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: StoreLoginDto) {
    const user = await this.storeUserRepository.findOne({
      where: { login: dto.login },
      include: [{ model: Store }],
    });

    // Login topilmadi / parol xato / bloklangan — hamma holatda BIR XIL
    // xabar. Aks holda qaysi login mavjudligini taxmin qilish oson bo'ladi.
    const invalid = new UnauthorizedException("Login yoki parol noto'g'ri");
    if (!user || !user.is_active) throw invalid;

    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) throw invalid;

    await this.storeUserRepository.update(
      { last_login_at: new Date() },
      { where: { id: user.id }, silent: true },
    );

    const token = await this.jwtService.signAsync(
      {
        user_id: user.id,
        store_id: user.store_id ?? null,
        role: user.role,
        login: user.login,
      },
      {
        secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY,
        expiresIn: process.env.STORE_TOKEN_TIME || '12h',
      },
    );

    return {
      token,
      role: user.role,
      store: user.store ?? null,
      user: {
        id: user.id,
        login: user.login,
        full_name: user.full_name,
      },
    };
  }

  // Joriy hisob + do'koni. Token guard'da tekshirilgan.
  async me(userId: number) {
    const user = await this.storeUserRepository.findByPk(userId, {
      include: [{ model: Store }],
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Hisob faol emas');
    }
    return user;
  }
}
