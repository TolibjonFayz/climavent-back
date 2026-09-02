import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

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
}
