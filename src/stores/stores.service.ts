import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Store } from './model/store.model';

@Injectable()
export class StoresService {
  constructor(
    @InjectModel(Store) private readonly storeRepository: typeof Store,
  ) {}

  // Do'konlar ro'yxati — adminka do'kon tanlash uchun ishlatadi.
  async getAll(): Promise<Store[]> {
    return this.storeRepository.findAll({ order: [['id', 'ASC']] });
  }
}
