import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Store } from './model/store.model';
import { Product } from 'src/products/model/product.model';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoresService {
  constructor(
    @InjectModel(Store) private readonly storeRepository: typeof Store,
    @InjectModel(Product) private readonly productRepository: typeof Product,
  ) {}

  // Do'konlar ro'yxati. `onlyActive` — sayt uchun (nofaol do'kon
  // ko'rinmasin), adminka esa hammasini oladi.
  async getAll(onlyActive = false): Promise<Store[]> {
    return this.storeRepository.findAll({
      ...(onlyActive ? { where: { is_active: true } } : {}),
      order: [
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  }

  async getOne(id: number): Promise<Store> {
    const store = await this.storeRepository.findByPk(id);
    if (!store) throw new NotFoundException("Do'kon topilmadi");
    return store;
  }

  // Sayt do'kon sahifasi uchun — URL'da id emas, slug turadi.
  async getBySlug(slug: string): Promise<Store> {
    const store = await this.storeRepository.findOne({ where: { slug } });
    if (!store) throw new NotFoundException("Do'kon topilmadi");
    return store;
  }

  async create(dto: CreateStoreDto) {
    await this.ensureSlugFree(dto.slug);
    const created = await this.storeRepository.create(dto as any);
    return { message: "Do'kon yaratildi", store: created };
  }

  async update(id: number, dto: UpdateStoreDto) {
    const store = await this.getOne(id);
    if (dto.slug && dto.slug !== store.slug) {
      await this.ensureSlugFree(dto.slug);
    }
    await this.storeRepository.update(dto as any, { where: { id } });
    return this.getOne(id);
  }

  // Mahsuloti bor do'kon O'CHIRILMAYDI. Kaskad o'chirish bu yerda juda
  // xavfli — bitta noto'g'ri so'rov butun katalogni yo'q qilishi mumkin.
  // O'chirish o'rniga `is_active = false`.
  async remove(id: number) {
    await this.getOne(id);
    const productCount = await this.productRepository.count({
      where: { store_id: id },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Bu do'konda ${productCount} ta mahsulot bor — o'chirib bo'lmaydi. ` +
          "Sotuvdan olib qo'yish uchun is_active = false qiling.",
      );
    }
    await this.storeRepository.destroy({ where: { id } });
    return { message: "Do'kon o'chirildi" };
  }

  // Controller'dan chaqiriladi — xatoni bitta joyda ushlab turish uchun.
  forbidOtherStore(): never {
    throw new ForbiddenException("Faqat o'z do'koningizni tahrirlay olasiz");
  }

  private async ensureSlugFree(slug: string) {
    const exists = await this.storeRepository.findOne({ where: { slug } });
    if (exists) {
      throw new ConflictException(`'${slug}' slug allaqachon band`);
    }
  }
}
