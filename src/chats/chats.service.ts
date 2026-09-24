import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { pushTo } from 'src/deliveries/push';
import { ChatActor, storeCan } from './chat-auth';
import { ChatHub, clientRoom, storeRoom } from './chat-hub';
import { SendMessageDto } from './dto';

type Side = 'client' | 'store';

/** Daqiqasiga bitta foydalanuvchidan xabar (topshiriq №34, 2-band). */
const RATE_LIMIT = Number(process.env.CHAT_RATE_LIMIT) || 30;
const RATE_WINDOW_MS = 60_000;
const TEXT_MAX = 2000;
const PUSH_TEXT_MAX = 100;

/**
 * Xaridor ↔ do'kon chati (topshiriq №34).
 *
 * Yuborish — REST (tekshiruv va cheklovlar shu yerda), qabul qilish — Socket.IO
 * (`ChatHub`). Qabul qiluvchi xonasida ulangan socket bo'lmasa — push.
 *
 * Begona suhbat — 404 (borligi ham oshkor qilinmaydi). Xaridorning telefoni
 * do'konga HECH QACHON berilmaydi — faqat ismi.
 */
@Injectable()
export class ChatsService {
  private readonly logger = new Logger('Chat');
  private readonly sent = new Map<string, number[]>();

  constructor(
    @InjectConnection() private readonly db: Sequelize,
    private readonly hub: ChatHub,
  ) {}

  // ------------------------------------------------------------ REST
  async getOrCreate(actor: ChatActor, storeId: number) {
    if (actor.kind !== 'client') throw new ForbiddenException("Suhbatni faqat xaridor boshlaydi");
    const [store]: any[] = await this.db.query('SELECT id FROM stores WHERE id = :id AND is_active', {
      replacements: { id: storeId },
      type: QueryTypes.SELECT,
    });
    if (!store) throw new NotFoundException("Do'kon topilmadi");
    const [row]: any[] = await this.db.query(
      `INSERT INTO chats (client_id, store_id) VALUES (:client, :store)
       ON CONFLICT (client_id, store_id) DO UPDATE SET client_id = EXCLUDED.client_id
       RETURNING id`,
      { replacements: { client: actor.user_id, store: storeId }, type: QueryTypes.SELECT },
    );
    return (await this.views('c.id = :id', { id: row.id }, 'client'))[0];
  }

  async list(actor: ChatActor, storeId?: number) {
    if (actor.kind === 'client') return this.views('c.client_id = :me', { me: actor.user_id }, 'client');
    if (actor.kind === 'store') {
      if (!storeCan(actor, 'chat.view')) throw this.noPerm('chat.view');
      return this.views('c.store_id = :store', { store: actor.store_id }, 'store');
    }
    // superadmin — faqat o'qish; `?store_id=` bilan bitta do'kon
    return storeId
      ? this.views('c.store_id = :store', { store: storeId }, 'store')
      : this.views('TRUE', {}, 'store');
  }

  async messages(actor: ChatActor, chatId: number, beforeId?: number, limit?: number) {
    await this.chatFor(actor, chatId, 'chat.view');
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const rows: any[] = await this.db.query(
      `${MESSAGE_SQL} WHERE m.chat_id = :chat ${beforeId ? 'AND m.id < :before' : ''}
        ORDER BY m.id DESC LIMIT :n`,
      { replacements: { chat: chatId, before: Number(beforeId) || 0, n }, type: QueryTypes.SELECT },
    );
    return rows.map(messageView);
  }

  async send(actor: ChatActor, chatId: number, dto: SendMessageDto) {
    if (actor.kind === 'super') throw new ForbiddenException('Superadmin suhbatlarni faqat o\'qiydi');
    const chat = await this.chatFor(actor, chatId, 'chat.reply');
    const side: Side = actor.kind === 'client' ? 'client' : 'store';

    const text = cleanText(dto.text);
    const productId = dto.product_id ? Number(dto.product_id) : null;
    if (!text && !productId) throw new BadRequestException("Xabar bo'sh — matn yoki mahsulot kerak");
    if (text && text.length > TEXT_MAX) throw new BadRequestException(`Matn ${TEXT_MAX} belgidan oshmasin`);
    if (productId) {
      const [p]: any[] = await this.db.query('SELECT id FROM products WHERE id = :id', {
        replacements: { id: productId },
        type: QueryTypes.SELECT,
      });
      if (!p) throw new BadRequestException('Mahsulot topilmadi');
    }

    // Idempotent: shu `client_msg_id` bilan xabar bor bo'lsa — o'shani qaytaramiz,
    // qayta socket/push yo'q (ilova internet uzilganda qayta yuboradi).
    if (dto.client_msg_id) {
      const existing = await this.messageBy('m.chat_id = :chat AND m.client_msg_id = :cm', {
        chat: chatId,
        cm: dto.client_msg_id,
      });
      if (existing) return existing;
    }
    this.rateLimit(actor);

    const senderUserId = actor.kind === 'client' ? actor.user_id : actor.store_user_id;
    const inserted: any[] = await this.db.query(
      `INSERT INTO chat_messages (chat_id, sender, sender_user_id, text, product_id, client_msg_id)
       VALUES (:chat, :sender, :uid, :text, :product, :cm)
       ON CONFLICT (chat_id, client_msg_id) DO NOTHING
       RETURNING id`,
      {
        replacements: {
          chat: chatId,
          sender: side,
          uid: senderUserId,
          text: text || null,
          product: productId,
          cm: dto.client_msg_id || null,
        },
        type: QueryTypes.SELECT,
      },
    );
    if (!inserted.length) {
      // Parallel ikki so'rov — ikkinchisi birinchisining yozuvini oladi
      return this.messageBy('m.chat_id = :chat AND m.client_msg_id = :cm', { chat: chatId, cm: dto.client_msg_id });
    }
    const id = Number(inserted[0].id);
    // O'z xabari o'qilmagan bo'lib qolmasin — yuboruvchi tomon shu xabargacha o'qigan
    await this.db.query(
      `UPDATE chats SET updated_at = now(), ${side}_last_read_id = GREATEST(${side}_last_read_id, :id) WHERE id = :chat`,
      { replacements: { id, chat: chatId } },
    );
    const message = await this.messageBy('m.id = :id', { id });
    await this.deliver(chat, message, side);
    return message;
  }

  async read(actor: ChatActor, chatId: number, lastMessageId: number) {
    if (actor.kind === 'super') throw new ForbiddenException('Superadmin suhbatlarni faqat o\'qiydi');
    await this.chatFor(actor, chatId, 'chat.view');
    const side: Side = actor.kind === 'client' ? 'client' : 'store';
    const [row]: any[] = await this.db.query(
      `UPDATE chats SET ${side}_last_read_id = GREATEST(${side}_last_read_id,
              LEAST(:id, (SELECT COALESCE(MAX(id), 0) FROM chat_messages WHERE chat_id = :chat)))
        WHERE id = :chat
        RETURNING client_id, store_id, ${side}_last_read_id AS last_read_id`,
      { replacements: { id: Number(lastMessageId) || 0, chat: chatId }, type: QueryTypes.SELECT },
    );
    const last = Number(row.last_read_id);
    const peerRoom = side === 'client' ? storeRoom(Number(row.store_id)) : clientRoom(Number(row.client_id));
    this.hub.emit(peerRoom, 'read', { chat_id: chatId, reader: side, last_message_id: last });
    return { chat_id: chatId, reader: side, last_message_id: last };
  }

  // ------------------------------------------------------------ socket uchun
  /** `typing` — a'zo bo'lsa qarshi tomon xonasi, aks holda `null`. */
  async typingTarget(actor: ChatActor, chatId: number): Promise<{ room: string; from: Side } | null> {
    if (actor.kind === 'super') return null;
    if (actor.kind === 'store' && !storeCan(actor, 'chat.reply')) return null;
    try {
      const chat = await this.chatFor(actor, chatId, 'chat.reply');
      return actor.kind === 'client'
        ? { room: storeRoom(chat.store_id), from: 'client' }
        : { room: clientRoom(chat.client_id), from: 'store' };
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------ ichki
  /** Suhbat va a'zolik; begona — 404. */
  private async chatFor(actor: ChatActor, chatId: number, perm: 'chat.view' | 'chat.reply') {
    const [chat]: any[] = await this.db.query(
      `SELECT c.id, c.client_id, c.store_id, s.name AS store_name,
              NULLIF(btrim(concat_ws(' ', u.name, u.surname)), '') AS client_name
         FROM chats c JOIN stores s ON s.id = c.store_id JOIN users u ON u.id = c.client_id
        WHERE c.id = :id`,
      { replacements: { id: chatId }, type: QueryTypes.SELECT },
    );
    const mine =
      chat &&
      (actor.kind === 'super' ||
        (actor.kind === 'client' && Number(chat.client_id) === actor.user_id) ||
        (actor.kind === 'store' && Number(chat.store_id) === actor.store_id));
    if (!mine) throw new NotFoundException('Suhbat topilmadi');
    if (actor.kind === 'store' && !storeCan(actor, perm)) throw this.noPerm(perm);
    return {
      id: Number(chat.id),
      client_id: Number(chat.client_id),
      store_id: Number(chat.store_id),
      store_name: String(chat.store_name),
      client_name: chat.client_name ? String(chat.client_name) : null,
    };
  }

  private noPerm(required: string) {
    return new ForbiddenException({ statusCode: 403, message: "Ruxsat yo'q", required });
  }

  private rateLimit(actor: ChatActor) {
    const key = actor.kind === 'client' ? `c${actor.user_id}` : actor.kind === 'store' ? `s${actor.store_user_id}` : 'x';
    const now = Date.now();
    const recent = (this.sent.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      throw new HttpException(
        { statusCode: 429, message: "Juda ko'p xabar — bir daqiqadan keyin qayta urinib ko'ring" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.sent.set(key, recent);
    if (this.sent.size > 5000) {
      for (const [k, v] of this.sent) if (!v.some((t) => now - t < RATE_WINDOW_MS)) this.sent.delete(k);
    }
  }

  private async messageBy(where: string, rep: Record<string, unknown>) {
    const [row]: any[] = await this.db.query(`${MESSAGE_SQL} WHERE ${where} LIMIT 1`, {
      replacements: rep,
      type: QueryTypes.SELECT,
    });
    return row ? messageView(row) : null;
  }

  /**
   * Suhbat obyekti `side` nuqtai nazaridan: `unread` — shu tomonning
   * o'qilmaganlari, `peer_last_read_id` — qarshi tomon o'qigan oxirgi xabar.
   */
  private async views(where: string, rep: Record<string, unknown>, side: Side) {
    const peer: Side = side === 'client' ? 'store' : 'client';
    const rows: any[] = await this.db.query(
      `SELECT c.id, c.client_id, c.store_id, c.updated_at,
              c.${side}_last_read_id AS my_read, c.${peer}_last_read_id AS peer_read,
              s.name AS store_name, s.logo_url,
              NULLIF(btrim(concat_ws(' ', u.name, u.surname)), '') AS client_name,
              (SELECT COUNT(*)::int FROM chat_messages m
                WHERE m.chat_id = c.id AND m.sender = '${peer}' AND m.id > c.${side}_last_read_id) AS unread,
              lm.id AS lm_id
         FROM chats c
         JOIN stores s ON s.id = c.store_id
         JOIN users u ON u.id = c.client_id
         LEFT JOIN LATERAL (SELECT id FROM chat_messages WHERE chat_id = c.id ORDER BY id DESC LIMIT 1) lm ON true
        WHERE ${where}
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT 300`,
      { replacements: rep, type: QueryTypes.SELECT },
    );
    const lastIds = rows.map((r) => r.lm_id).filter((x) => x !== null);
    const last = new Map<number, any>();
    if (lastIds.length) {
      const msgs: any[] = await this.db.query(`${MESSAGE_SQL} WHERE m.id IN (:ids)`, {
        replacements: { ids: lastIds },
        type: QueryTypes.SELECT,
      });
      for (const m of msgs) last.set(Number(m.id), messageView(m));
    }
    return rows.map((r) => ({
      id: Number(r.id),
      store: { id: Number(r.store_id), name: r.store_name, logo_url: r.logo_url ?? null },
      // Telefon YO'Q (№34, tamoyil) — faqat ism; bo'sh bo'lsa null
      client: { id: Number(r.client_id), name: r.client_name ?? null },
      last_message: r.lm_id !== null ? last.get(Number(r.lm_id)) ?? null : null,
      unread: Number(r.unread),
      peer_last_read_id: Number(r.peer_read),
      updated_at: r.updated_at,
    }));
  }

  /** Ikkala xonaga `message` (har biriga o'z nuqtai nazaridagi `chat`), bo'sh xonaga push. */
  private async deliver(
    chat: { id: number; client_id: number; store_id: number; store_name: string; client_name: string | null },
    message: any,
    from: Side,
  ) {
    try {
      const [forClient] = await this.views('c.id = :id', { id: chat.id }, 'client');
      const [forStore] = await this.views('c.id = :id', { id: chat.id }, 'store');
      this.hub.emit(clientRoom(chat.client_id), 'message', { chat_id: chat.id, message, chat: forClient });
      this.hub.emit(storeRoom(chat.store_id), 'message', { chat_id: chat.id, message, chat: forStore });

      const body = message.text ? truncate(message.text, PUSH_TEXT_MAX) : 'Mahsulot haqida savol';
      const base = { body, channel: 'chat', tag: `chat-${chat.id}` };
      if (from === 'store') {
        if (await this.hub.isEmpty(clientRoom(chat.client_id))) {
          await pushTo('user', [chat.client_id], {
            ...base,
            title: chat.store_name,
            data: { type: 'chat_message', chat_id: chat.id, store_id: chat.store_id },
          });
        }
      } else if (await this.hub.isEmpty(storeRoom(chat.store_id))) {
        await pushTo('store_user', await this.storeRecipients(chat.store_id), {
          ...base,
          title: chat.client_name || `Xaridor #${chat.client_id}`,
          data: { type: 'chat_message', chat_id: chat.id },
        });
      }
    } catch (e) {
      // Xabar saqlangan — yetkazishdagi xato yuborishni buzmasin
      this.logger.warn(`Chat #${chat.id} yetkazishda xato: ${(e as Error).message}`);
    }
  }

  /** Do'kon tomoni: faol adminlar + `chat.view` ruxsatli faol xodimlar (№35). */
  private async storeRecipients(storeId: number): Promise<number[]> {
    const rows: any[] = await this.db.query(
      `SELECT su.id FROM store_users su
         LEFT JOIN store_roles r ON r.id = su.store_role_id
        WHERE su.store_id = :store AND su.is_active
          AND (su.role = 'store_admin' OR (su.role = 'store_staff' AND 'chat.view' = ANY (r.permissions)))`,
      { replacements: { store: storeId }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => Number(r.id));
  }
}

const MESSAGE_SQL = `
  SELECT m.id, m.chat_id, m.sender, m.text, m.client_msg_id, m.created_at,
         p.id AS p_id, p.name_uz AS p_name_uz, p.name_ru AS p_name_ru, p.name_en AS p_name_en,
         (SELECT pi.image_link FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.id LIMIT 1) AS p_image
    FROM chat_messages m
    LEFT JOIN products p ON p.id = m.product_id`;

function messageView(r: any) {
  return {
    id: Number(r.id),
    chat_id: Number(r.chat_id),
    sender: r.sender,
    text: r.text ?? '',
    // Mahsulot o'chirilgan bo'lsa ham xabar ochiladi — `product: null`
    product: r.p_id
      ? {
          id: Number(r.p_id),
          name_uz: r.p_name_uz ?? null,
          name_ru: r.p_name_ru ?? null,
          name_en: r.p_name_en ?? null,
          image: r.p_image ?? null,
        }
      : null,
    client_msg_id: r.client_msg_id ?? null,
    created_at: r.created_at,
  };
}

/** HTML teglar olib tashlanadi, boshqaruv belgilari tozalanadi, trim. */
export function cleanText(v: unknown): string {
  return String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
