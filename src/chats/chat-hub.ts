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
  private ns: Namespace | null = null;

  get server(): Namespace | null {
    return this.ns;
  }
  set server(ns: Namespace | null) {
    this.ns = ns;
    shared = ns;
  }

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
/**
 * Do'konning BUYURTMA signallari xonasi (topshiriq №36). `store:<id>` dan
 * alohida: u chat xonasi va push sharti (`isEmpty`) unga tayanadi —
 * faqat buyurtma ko'radigan xodim unga kirsa chat push'i to'xtab qolardi.
 */
export const storeOrdersRoom = (storeId: number) => `store-orders:${storeId}`;

/**
 * Socket namespace — DI tashqarisidagi kod uchun (`recordOrderEvent` statik
 * funksiya, №25 dagi aylanma bog'liqlik sababi). Gateway ishga tushmagan
 * bo'lsa (sinov konteksti, fon ishi) — `null`, signal jimgina tushib qoladi.
 */
let shared: Namespace | null = null;
export const realtimeServer = (): Namespace | null => shared;
