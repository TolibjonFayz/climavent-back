import { Module } from '@nestjs/common';
import { R2Service } from './r2.service';
import { R2Controller } from './r2.controller';

@Module({
  controllers: [R2Controller],
  providers: [R2Service],
  exports: [R2Service],
})
export class R2Module {}
