import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { StoreUser } from './model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { CreateStoreUserDto } from './dto/create-store-user.dto';
import { UpdateStoreUserDto } from './dto/update-store-user.dto';

const SALT_ROUNDS = 10;

// So'rovni kim qilyapti. `superadmin` — `SERVICE_API_KEY` yoki
// role='superadmin' hisob; ular hamma do'konni ko'radi.
export interface Requester {
  role: 'superadmin' | 'store_admin';
  store_id?: number | null;
  user_id?: number;
}

@Injectable()
export class StoreUsersService {
  constructor(
    @InjectModel(StoreUser)
    private readonly storeUserRepository: typeof StoreUser,
    @InjectModel(Store) private readonly storeRepository: typeof Store,
  ) {}

  // store_admin faqat O'Z do'koni hisoblarini ko'radi.
  async getAll(requester: Requester) {
    const where =
      requester.role === 'superadmin' ? {} : { store_id: requester.store_id };
    return this.storeUserRepository.findAll({
      where,
      include: [{ model: Store, attributes: ['id', 'name', 'slug'] }],
      order: [['id', 'ASC']],
    });
  }

  async create(dto: CreateStoreUserDto, requester: Requester) {
    const role = dto.role || 'store_admin';

    // Faqat superadmin superadmin yarata oladi.
    if (role === 'superadmin' && requester.role !== 'superadmin') {
      throw new ForbiddenException('Superadmin yaratish huquqi yo\'q');
    }
    // store_admin boshqa do'konga hisob qo'sha olmaydi.
    if (
      requester.role === 'store_admin' &&
      Number(dto.store_id) !== Number(requester.store_id)
    ) {
      throw new ForbiddenException("Boshqa do'konga hisob qo'sha olmaysiz");
    }

    await this.validateRoleAndStore(role, dto.store_id);

    const exists = await this.storeUserRepository.findOne({
      where: { login: dto.login },
    });
    if (exists) {
      throw new ConflictException(`'${dto.login}' logini allaqachon band`);
    }

    const created = await this.storeUserRepository.create({
      login: dto.login,
      password_hash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      store_id: role === 'superadmin' ? null : dto.store_id,
      full_name: dto.full_name,
      role,
      is_active: dto.is_active ?? true,
    } as any);

    // toJSON password_hash ni chiqarib tashlaydi.
    return { message: 'Hisob yaratildi', storeUser: created };
  }

  async update(id: number, dto: UpdateStoreUserDto, requester: Requester) {
    const user = await this.getOneOrFail(id);
    this.ensureCanTouch(user, requester);

    const payload: any = { ...dto };
    delete payload.password;

    // Parol berilsa — qayta hash qilinadi, ochiq holda saqlanmaydi.
    if (dto.password) {
      payload.password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    if (dto.login && dto.login !== user.login) {
      const exists = await this.storeUserRepository.findOne({
        where: { login: dto.login },
      });
      if (exists) {
        throw new ConflictException(`'${dto.login}' logini allaqachon band`);
      }
    }

    const nextRole = dto.role || user.role;
    const nextStoreId =
      dto.store_id !== undefined ? dto.store_id : user.store_id;
    if (dto.role || dto.store_id !== undefined) {
      if (requester.role !== 'superadmin') {
        throw new ForbiddenException(
          "Rol yoki do'konni faqat superadmin o'zgartira oladi",
        );
      }
      await this.validateRoleAndStore(nextRole, nextStoreId);
      payload.store_id = nextRole === 'superadmin' ? null : nextStoreId;
    }

    await this.storeUserRepository.update(payload, { where: { id } });
    return this.getOneOrFail(id);
  }

  async remove(id: number, requester: Requester) {
    const user = await this.getOneOrFail(id);
    this.ensureCanTouch(user, requester);
    await this.storeUserRepository.destroy({ where: { id } });
    return { message: "Hisob o'chirildi" };
  }

  private async getOneOrFail(id: number) {
    const user = await this.storeUserRepository.findByPk(id, {
      include: [{ model: Store, attributes: ['id', 'name', 'slug'] }],
    });
    if (!user) throw new NotFoundException('Hisob topilmadi');
    return user;
  }

  private ensureCanTouch(user: StoreUser, requester: Requester) {
    if (requester.role === 'superadmin') return;
    if (Number(user.store_id) !== Number(requester.store_id)) {
      throw new ForbiddenException("Bu hisob boshqa do'konga tegishli");
    }
  }

  // superadmin do'konsiz, store_admin esa SHART do'konli bo'lishi kerak —
  // aks holda "hech qaysi do'konga tegishli bo'lmagan admin" paydo bo'ladi.
  private async validateRoleAndStore(role: string, storeId?: number | null) {
    if (role === 'superadmin') return;
    if (!storeId) {
      throw new BadRequestException('store_admin uchun store_id majburiy');
    }
    const store = await this.storeRepository.findByPk(storeId);
    if (!store) throw new BadRequestException("Bunday do'kon yo'q");
  }
}
