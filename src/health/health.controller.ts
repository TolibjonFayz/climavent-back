import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ServiceKeyGuard } from 'src/guards/service_key.guard';

// Deploy tekshiruvi uchun yengil endpoint.
// Bazaga TEGMAYDI — shuning uchun baza sekin/uzilgan bo'lsa ham javob
// beradi va "server ko'tarildimi?" degan savolga aniq javob bo'ladi.
// `startedAt` orqali yangi deploy chiqqanini darrov bilish mumkin.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private static readonly startedAt = new Date().toISOString();

  @ApiOperation({ summary: 'Server holati va ishga tushgan vaqti' })
  @ApiResponse({
    status: 200,
    description: 'Server ishlayapti',
    schema: {
      example: {
        status: 'ok',
        startedAt: '2026-09-02T12:40:00.000Z',
        uptimeSeconds: 42,
        node: 'v22.12.0',
      },
    },
  })
  @Get()
  check(): {
    status: string;
    startedAt: string;
    uptimeSeconds: number;
    node: string;
  } {
    return {
      status: 'ok',
      startedAt: HealthController.startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    };
  }

  // Proksi zanjiri diagnostikasi (topshiriq №16). `trust proxy` sozlamasi
  // to'g'riligini PROD'da tekshirish uchun: oferta dalilidagi `offer_ip`
  // aynan `req.ip` dan olinadi. Railway infratuzilmasi o'zgarsa, shu bilan
  // qayta tekshiriladi. Faqat servis kaliti — va baribir faqat so'rovchining
  // o'z manzilini ko'rsatadi.
  @ApiOperation({ summary: "So'rovchi IP va proksi zanjiri (servis kaliti)" })
  @ApiSecurity('service-key')
  @UseGuards(ServiceKeyGuard)
  @Get('client-ip')
  clientIp(@Req() req: Request) {
    return {
      ip: req.ip,
      ips: req.ips,
      x_forwarded_for: req.headers['x-forwarded-for'] ?? null,
      x_real_ip: req.headers['x-real-ip'] ?? null,
      remote_address: req.socket?.remoteAddress ?? null,
    };
  }
}
