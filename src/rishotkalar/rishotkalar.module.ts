import { Module } from '@nestjs/common';
import { RishotkalarService } from './rishotkalar.service';
import { RishotkalarController } from './rishotkalar.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Rishotkalar } from './models/rishotkalar.model';

@Module({
  imports: [SequelizeModule.forFeature([Rishotkalar])],
  controllers: [RishotkalarController],
  providers: [RishotkalarService],
  exports: [RishotkalarService],
})
export class RishotkalarModule {}
