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

  // Do'konlar ro'yxati.
  //
  // Ilgari nofaolni yashirish MIJOZNING ishi edi (`?active=true`), ya'ni
  // frontend so'ramasa nofaol do'kon ham ro'yxatga tushardi. Endi
  // standart holat XAVFSIZ: mehmon faqat faol do'konlarni ko'radi,
  // adminka/bot esa hammasini (topshiriq №14, 1-band).
  //
  // `?active=true` hamon ishlaydi — eski mijozlar buzilmasin.
  async getAll(onlyActive = false, privileged = false): Promise<Store[]> {
    const faqatFaol = onlyActive || !privileged;
    return this.storeRepository.findAll({
      ...(faqatFaol ? { where: { is_active: true } } : {}),
      order: [
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  }

  // Nofaol do'konga TO'G'RIDAN-TO'G'RI havola ham ochilmasin: odamlarda
  // eski havola saqlanib qolgan bo'lishi mumkin. Adminka uchun ochiq.
  async getOne(id: number, privileged = false): Promise<Store> {
    const store = await this.storeRepository.findByPk(id);
    if (!store || (!privileged && !store.is_active)) {
      throw new NotFoundException("Do'kon topilmadi");
    }
    return store;
  }

  // Sayt do'kon sahifasi uchun — URL'da id emas, slug turadi.
  async getBySlug(slug: string, privileged = false): Promise<Store> {
    const store = await this.storeRepository.findOne({ where: { slug } });
    if (!store || (!privileged && !store.is_active)) {
      throw new NotFoundException("Do'kon topilmadi");
    }
    return store;
  }

  async create(dto: CreateStoreDto) {
    await this.ensureSlugFree(dto.slug);
    const created = await this.storeRepository.create(dto as any);
    return { message: "Do'kon yaratildi", store: created };
  }

  async update(id: number, dto: UpdateStoreDto) {
    // `true` MAJBURIY: aks holda nofaol do'konni qayta faollashtirib
    // bo'lmasdi — `getOne` uni mehmonga 404 qiladi, ya'ni superadmin
    // o'zi o'chirgan do'konni ochib ololmay qolardi.
    const store = await this.getOne(id, true);
    if (dto.slug && dto.slug !== store.slug) {
      await this.ensureSlugFree(dto.slug);
    }
    await this.storeRepository.update(dto as any, { where: { id } });
    return this.getOne(id, true);
  }

  // Mahsuloti bor do'kon O'CHIRILMAYDI. Kaskad o'chirish bu yerda juda
  // xavfli — bitta noto'g'ri so'rov butun katalogni yo'q qilishi mumkin.
  // O'chirish o'rniga `is_active = false`.
  async remove(id: number) {
    await this.getOne(id, true);
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
