import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/**
 * Servis va gateway o'rtasidagi ko'prik: servis xabar saqlagach socket
 * xonalariga yuboradi, gateway esa servisdan a'zolikni so'raydi — to'g'ridan
 * bog'lansa aylanma bog'liqlik bo'lardi.
 *
 * Xonalar: xaridor — `client:<user_id>`, do'kon — `store:<store_id>`.
 * Bitta nusxa (Railway'da bitta replika) — xotiradagi adapter yetarli.
 * Replika ko'paytirilsa Redis adapter kerak bo'ladi.
 */
@Injectable()
export class ChatHub {
  server: Namespace | null = null;

  emit(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }

  /** Xonada birorta ham ulangan socket yo'qmi (push yuborish sharti). */
  async isEmpty(room: string): Promise<boolean> {
    if (!this.server) return true;
    try {
      return (await this.server.in(room).fetchSockets()).length === 0;
    } catch {
      return true;
    }
  }
}

export const clientRoom = (userId: number) => `client:${userId}`;
export const storeRoom = (storeId: number) => `store:${storeId}`;
