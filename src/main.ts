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
import { responseTime } from './common/middleware/response-time';

const start = async () => {
  try {
    const PORT = process.env.PORT || 3333;

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.setGlobalPrefix('api');

    // Server ichidagi vaqt har javobda `Server-Timing` da (topshiriq №23)
    app.use(responseTime());

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

    // SWAGGER: prod'da YOPIQ (2026-09-22).
    //
    // `/api/docs` butun API xaritasini, maydon nomlarini va misollarni
    // tokensiz ko'rsatadi — hujum yuzasini bepul beradi. Endi u faqat
    // lokal/stend muhitida ochiladi. Railway'da ataylab ochish kerak
    // bo'lsa: `SWAGGER_ENABLED=true`.
    const production =
      process.env.NODE_ENV === 'production' ||
      Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
    const swaggerOn =
      process.env.SWAGGER_ENABLED === 'true' ||
      (!production && process.env.SWAGGER_DISABLED !== 'true');

    // CSP: Swagger UI inline script/style ishlatadi, shuning uchun u YOQIQ
    // bo'lganda CSP o'chiriladi. Aks holda (ya'ni prod'da) qattiq CSP
    // qo'yiladi: API javoblari hech qanday skript yuklamaydi, sahifa
    // ichiga joylab bo'lmaydi.
    app.use(
      helmet({
        contentSecurityPolicy: swaggerOn
          ? false
          : {
              directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'none'"],
                formAction: ["'none'"],
              },
            },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      }),
    );

    // JSON tanasi: 10 MB juda katta edi (xotirani band qilish oson).
    // Eng katta tana — mahsulot tavsifi (R2 ga ketadigan HTML), u 2 MB dan
    // oshmaydi. Rasm/hujjat yuklash bundan MUSTASNO: ular multipart bilan
    // ketadi va o'z chegarasiga ega (8 MB).
    app.use(bodyParser.json({ limit: process.env.JSON_BODY_LIMIT || '2mb' }));
    app.use(
      bodyParser.urlencoded({ limit: process.env.JSON_BODY_LIMIT || '2mb', extended: true }),
    );

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
      // Adminka va hamkor portali (sotuvchi arizasi formasi shu yerda).
      // Topshiriq №26, 0-band: domen `climavent-hamkor.vercel.app` ga
      // ko'chdi. Yangi domen ro'yxatda bo'lmagani uchun preflight javobida
      // `Access-Control-Allow-Origin` qaytmasdi va `/sotuvchi-bolish`
      // sahifasidan hujjat yuklash brauzerda ishlamasdi.
      'https://climavent-hamkor.vercel.app',
      // Eski domen (307 bilan yangisiga yo'naltiradi) — bir oy qoladi,
      // keyin olib tashlanadi.
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
      exposedHeaders: 'X-Total-Count, Server-Timing',
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
    if (swaggerOn) {
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('/api/docs', app, document);
    }

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
