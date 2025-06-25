import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRishotkalarDto } from './dto/create-rishotkalar.dto';
import { UpdateRishotkalarDto } from './dto/update-rishotkalar.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Rishotkalar } from './models/rishotkalar.model';

@Injectable()
export class RishotkalarService {
  constructor(
    @InjectModel(Rishotkalar)
    private readonly RishotkaRepository: typeof Rishotkalar,
  ) {}

  //Creating a rishotkalar
  async create(createRishotkalarDto: CreateRishotkalarDto) {
    const newRishotkalar = await this.RishotkaRepository.create(createRishotkalarDto);
    const response = {
      message: 'Rishotka successfully created',
      newRishotkalar,
    };
    return response;
  }

  //Get all rishotkalar
  async getAllRishotkalar() {
    const rishotkalar = await this.RishotkaRepository.findAll({
      include: { all: true },
    });
    return rishotkalar;
  }

  //Get one rishotka by id
  async getOneRishotkaById(id: number) {
    const rishotka = await this.RishotkaRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!rishotka) {
      throw new NotFoundException('Rishotka not found');
    }
    return rishotka;
  }

  //Update rishotka by id
  async updateRishotkaById(id: number, updateRishotka: UpdateRishotkalarDto) {
    const updated = await this.RishotkaRepository.update(updateRishotka, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      throw new NotFoundException('Rishotka not found or something went wrong');
  }

  //Delete rishotka by id
  async deleteRishotkaById(id: number) {
    const deleting = await this.RishotkaRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Rishotka not found or something wrong');
  }
}
