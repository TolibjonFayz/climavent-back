import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import { BadInputFilter } from './common/filters/bad-input.filter';

const start = async () => {
  try {
    const PORT = process.env.PORT || 3333;

    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');

    // CSP o'chirilgan — Swagger UI (/api/docs) inline script/style ishlatadi,
    // qattiq CSP uni buzadi. Qolgan sarlavhalar (HSTS, X-Frame-Options,
    // X-Content-Type-Options, X-Powered-By yashirish va h.k.) standart holida.
    app.use(helmet({ contentSecurityPolicy: false }));

    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

    // credentials: true bilan origin '*' ishlamaydi — brauzer rad etadi.
    // Shuning uchun aniq domenlar ro'yxatini .env dan o'qiymiz.
    const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    app.enableCors({
      origin: allowedOrigins,
      methods: 'GET,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Authorization',
      credentials: true,
      optionsSuccessStatus: 200,
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
