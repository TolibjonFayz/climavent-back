import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ServiceKeyGuard } from 'src/guards/service_key.guard';
import { fcmStatus } from 'src/deliveries/push';

// Deploy tekshiruvi uchun yengil endpoint.
// Bazaga TEGMAYDI — shuning uchun baza sekin/uzilgan bo'lsa ham javob
// beradi va "server ko'tarildimi?" degan savolga aniq javob bo'ladi.
// `startedAt` orqali yangi deploy chiqqanini darrov bilish mumkin.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private static readonly startedAt = new Date().toISOString();

  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  /**
   * Tezlik diagnostikasi (topshiriq №23) — faqat servis kaliti.
   *
   * Region va baza haqida taxmin qilmaslik uchun: ilova QAYERDA ishlayotganini
   * (Railway muhit o'zgaruvchilari) va bazaga bitta borib-kelish SERVERNING
   * O'ZIDAN qancha vaqt olishini o'lchaydi. Parol, to'liq host va IP qaytarilmaydi.
   */
  @ApiOperation({ summary: 'Region va baza kechikishi (servis kaliti)' })
  @ApiSecurity('service-key')
  @UseGuards(ServiceKeyGuard)
  @Get('diagnostics')
  async diagnostics() {
    const time = async (fn: () => Promise<unknown>) => {
      const t = process.hrtime.bigint();
      await fn();
      return Math.round((Number(process.hrtime.bigint() - t) / 1e6) * 10) / 10;
    };
    const ping: number[] = [];
    for (let i = 0; i < 5; i++) ping.push(await time(() => this.sequelize.query('SELECT 1')));
    const query: number[] = [];
    for (let i = 0; i < 5; i++) {
      query.push(await time(() => this.sequelize.query("SELECT value FROM settings WHERE key = 'usd_rate'")));
    }
    const [[srv]]: any = await this.sequelize.query(
      `SELECT version() AS version, inet_server_addr()::text AS addr, current_setting('TimeZone') AS tz`,
    );
    const host = String(process.env.POSTGRES_HOST || '');
    const addr = String(srv?.addr || '');
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return {
      app: {
        railway_region: process.env.RAILWAY_REPLICA_REGION ?? null,
        railway_replica_id: process.env.RAILWAY_REPLICA_ID ? 'bor' : null,
        railway_environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
        node: process.version,
        uptime_seconds: Math.round(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1048576),
      },
      database: {
        // Host turi: ichki tarmoq (.railway.internal) yoki ommaviy proksi (.proxy.rlwy.net)
        host_kind: /\.railway\.internal$/i.test(host)
          ? 'railway-internal'
          : /rlwy\.net$/i.test(host)
            ? 'railway-public-proxy'
            : host ? 'external' : 'unknown',
        host_suffix: host.split('.').slice(-3).join('.'),
        server_addr_private: /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|fd|fc)/i.test(addr),
        version: String(srv?.version || '').split(' ').slice(0, 2).join(' '),
        ping_ms: ping,
        ping_median_ms: median(ping),
        one_row_query_ms: query,
        one_row_query_median_ms: median(query),
      },
    };
  }

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
        fcm: 'ok',
        fcm_auth: 'ok',
      },
    },
  })
  @Get()
  check(): {
    status: string;
    startedAt: string;
    uptimeSeconds: number;
    node: string;
    fcm: 'ok' | 'sozlanmagan';
    fcm_auth: 'ok' | 'xato' | null;
  } {
    // Topshiriq №32, 3-band: kalitning o'zi emas, faqat holat.
    // `fcm_auth` — oxirgi Google OAuth urinishi (null — hali urinilmagan).
    const fcm = fcmStatus();
    return {
      status: 'ok',
      startedAt: HealthController.startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      fcm: fcm.fcm,
      fcm_auth: fcm.auth ? (fcm.auth.ok ? 'ok' : 'xato') : null,
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
