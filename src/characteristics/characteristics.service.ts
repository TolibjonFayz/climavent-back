import { CreateCharacteristicDto } from './dto/create-characteristic.dto';
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Characteristic } from './model/characteristic.model';
import { InjectModel } from '@nestjs/sequelize';
import { R2Service } from 'src/r2/r2.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CharacteristicsService {
  constructor(
    @InjectModel(Characteristic)
    private readonly charecteristicRepository: typeof Characteristic,
    private r2Service: R2Service,
  ) {}

  uniqueId = uuidv4();

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
    const contentR2Link = await this.r2Service.uploadJson(
      (this.uniqueId = uuidv4()),
      payload.content,
    );
    const contentJsonR2Link = await this.r2Service.uploadJson(
      (this.uniqueId = uuidv4()),
      payload.contentJson,
    );
    payload.content = contentR2Link;
    payload.contentJson = contentJsonR2Link;

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
