import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Sequelize/Postgres: id="abc" kabi noto'g'ri turdagi qiymat yuborilganda
// "invalid input syntax for type integer/uuid" xatosi ko'tariladi va shu
// paytgacha xom holida 500 sifatida chiqib ketardi. Bu yerda 400'ga aylantiramiz.
const BAD_INPUT_PATTERN =
  /invalid input syntax for (type )?(integer|bigint|uuid|numeric)/i;

@Catch()
export class BadInputFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof Error && BAD_INPUT_PATTERN.test(exception.message)) {
      return super.catch(
        new BadRequestException("So'rovdagi parametr formati noto'g'ri"),
        host,
      );
    }
    super.catch(exception, host);
  }
}
