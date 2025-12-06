import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCharacteristicDto } from './dto/create-characteristic.dto';
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Characteristic } from './model/characteristic.model';

@Injectable()
export class CharacteristicsService {
  constructor(
    @InjectModel(Characteristic)
    private readonly charecteristicRepository: typeof Characteristic,
  ) {}

  //Create characteristic
  async createCharacteristics(
    createCharacteristicsDto: CreateCharacteristicDto,
  ) {
    const newBaner = await this.charecteristicRepository.create(
      createCharacteristicsDto,
    );

    const response = {
      message: 'Characteristic successfully created',
      newBaner,
    };
    return response;
  }

  //Get one characteristic by id
  async getCharacteristicById(id: number) {
    const characteristic = await this.charecteristicRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    return characteristic;
  }

  //Update characteristic by id
  async updateCharacteristicById(id: number, payload: UpdateCharacteristicDto) {
    const updated = await this.charecteristicRepository.update(payload, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Banner not found or something wrong');
  }

  //Delete characteristic by id
  async deleteCharacteristicById(id: number) {
    const characteristic = await this.getCharacteristicById(id);
    if (!characteristic) {
      throw new NotFoundException('Characteristic not found');
    }
    await this.charecteristicRepository.destroy({ where: { id: id } });
    return { message: 'Characteristic successfully deleted' };
  }
}
