import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import { BadInputFilter } from './common/filters/bad-input.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { stripSensitiveFields } from './common/serialization/sensitive-fields';
import { SalePresentationInterceptor } from './common/pricing/sale-presentation.interceptor';

const start = async () => {
  try {
    const PORT = process.env.PORT || 3333;

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.setGlobalPrefix('api');

    // Maxfiy maydonlar (refresh_token, unique_id, parol hash'lari) HECH BIR
    // javobda, hech qanday chuqurlikda chiqmasin (topshiriq №13, 2-band).
    // Nega aynan shu yerda — `common/serialization/sensitive-fields.ts`.
    app.set('json replacer', stripSensitiveFields);

    // Railway so'rovni o'z proksisi orqali uzatadi. Busiz `req.ip` — proksi
    // manzili bo'lardi: IP boshiga cheklovlar (OTP, ariza) amalda HAMMAGA
    // UMUMIY bo'lib qolardi, oferta dalilida (`offer_ip`) esa mijozning
    // emas, Railway'ning manzili yozilardi.
    //
    // Railway'da zanjir IKKI bo'g'inli (GET /health/client-ip bilan o'lchangan):
    // soket — ichki 100.64.x.x, X-Forwarded-For — "<mijoz>, <Railway edge>".
    // `2` — shu ikkala proksiga ishonamiz va undan oldingi manzilni olamiz.
    // Mijoz o'zi yuborgan X-Forwarded-For'ni Railway almashtiradi; almashtirmay
    // oldiga qo'shib yuborgan taqdirda ham 2 bo'g'in o'ngdan sanaladi — soxta
    // qiymat baribir tanlanmaydi.
    app.set('trust proxy', 2);

    // CSP o'chirilgan — Swagger UI (/api/docs) inline script/style ishlatadi,
    // qattiq CSP uni buzadi. Qolgan sarlavhalar (HSTS, X-Frame-Options,
    // X-Content-Type-Options, X-Powered-By yashirish va h.k.) standart holida.
    app.use(helmet({ contentSecurityPolicy: false }));

    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

    // credentials: true bilan origin '*' ishlamaydi — brauzer rad etadi.
    // Shuning uchun aniq domenlar ro'yxatini .env dan o'qiymiz.
    //
    // Production domenlari KODDA ham turadi (topshiriq №17, 1-band): Railway
    // muhit o'zgaruvchisi unutilsa yoki qayta yozilsa, sayt va adminka
    // brauzerdan backendga chiqolmay qolmasin. `CORS_ORIGINS` qo'shimcha
    // (lokal, preview) domenlar uchun.
    const PRODUCTION_ORIGINS = [
      'https://climavent.uz',
      'https://www.climavent.uz',
      // Next.js marketpleys adminkasi (sotuvchi arizasi formasi shu yerda)
      'https://climavent-marketplace-admin.vercel.app',
    ];
    const allowedOrigins = [
      ...new Set([
        ...PRODUCTION_ORIGINS,
        ...(process.env.CORS_ORIGINS || 'http://localhost:3000')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ]),
    ];

    app.enableCors({
      origin: allowedOrigins,
      methods: 'GET,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Authorization',
      credentials: true,
      optionsSuccessStatus: 200,
      // `users/all` sahifalashda jami sonni shu sarlavhada beradi
      // (topshiriq №13, 1-band). Expose qilinmasa brauzer uni o'qiy olmaydi.
      exposedHeaders: 'X-Total-Count',
    });

    const config = new DocumentBuilder()
      .setTitle('Climavent backend')
      .setDescription('Backend project for Climavent company')
      .setVersion('1.0.1')
      .addTag('NestJS, Postgres, Sequelize')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: 'x-api-key', in: 'header' },
        'service-key',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/api/docs', app, document);

    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new BadInputFilter(httpAdapterHost.httpAdapter));
    // Aksiya: mehmonga faqat FAOL aksiya, adminkaga xom qiymat + sale_active;
    // mahsulotga on_sale / min_price / min_sale_price (topshiriq №15).
    app.useGlobalInterceptors(new SalePresentationInterceptor());

    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true, // DTO tiplarini (masalan number) avtomatik o'giradi
        whitelist: true, // DTO da yo'q maydonlarni tozalaydi
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};
start();
