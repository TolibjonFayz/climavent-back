import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Sequelize/Postgres: id="abc" kabi noto'g'ri turdagi qiymat yuborilganda
// "invalid input syntax for type integer" xatosi ko'tariladi va shu
// paytgacha xom holida 500 sifatida chiqib ketardi. Bu yerda 400'ga
// aylantiramiz.
//
// Postgres xabarida qiymat va tur bor, ustun nomi esa odatda alohida
// `column` maydonida keladi. Ilgari javob shunchaki "So'rovdagi parametr
// formati noto'g'ri" derdi — qaysi maydon aybdorligi noma'lum qolardi.
const BAD_INPUT_PATTERN =
  /invalid input syntax for (?:type )?(integer|bigint|uuid|numeric|boolean|timestamp[^:]*)(?::\s*"([^"]*)")?/i;

// Postgres xatosida ustun nomi turli joylarda bo'lishi mumkin.
const columnOf = (error: any): string | undefined =>
  error?.column ||
  error?.parent?.column ||
  error?.original?.column ||
  error?.errors?.[0]?.path;

@Catch()
export class BadInputFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof Error) {
      const match = BAD_INPUT_PATTERN.exec(exception.message);
      if (match) {
        const [, type, value] = match;
        const column = columnOf(exception as any);

        const parts = [
          column ? `\`${column}\` maydoni` : 'Yuborilgan qiymat',
          value !== undefined ? `("${value}")` : null,
          `${type} turiga mos emas`,
        ].filter(Boolean);

        return super.catch(new BadRequestException(parts.join(' ')), host);
      }
    }
    super.catch(exception, host);
  }
}
