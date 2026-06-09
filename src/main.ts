import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

const start = async () => {
  try {
    const PORT = process.env.PORT || 3333;

    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');

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
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/api/docs', app, document);

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
