import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Chat fayllari (topshiriq №46) — sof yordamchilar: tur aniqlash, nom
 * tozalash, imzoli havola. Bazaga ham, saqlashga ham tegmaydi.
 */

export const CHAT_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const CHAT_FILES_PER_MESSAGE = 10;
export const THUMB_MAX_PX = 480;
/** Havola umri: 24 soat, soat boshiga yaxlitlanadi (bir soat ichida havola o'zgarmaydi — brauzer keshi ishlaydi). */
export const URL_TTL_MS = 24 * 60 * 60 * 1000;

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';
export type FileVariant = 'file' | 'thumb';

/** Bajariladigan fayllar — kengaytma bo'yicha (topshiriq ro'yxati). */
export const BLOCKED_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'jar', 'apk', 'sh']);

export interface Sniffed {
  kind: AttachmentKind;
  mime: string;
  /** Mazmuni bo'yicha bajariladigan fayl (nomi .pdf bo'lsa ham). */
  executable: boolean;
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
};

const FTYP_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const FTYP_AVIF = new Set(['avif', 'avis']);
const FTYP_AUDIO = new Set(['M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B ']);
const FTYP_QT = new Set(['qt  ']);
const FTYP_3GP = /^3g[p2]/;

const ascii = (b: Buffer, from: number, to: number) => (b.length >= to ? b.subarray(from, to).toString('latin1') : '');
const starts = (b: Buffer, bytes: number[]) => b.length >= bytes.length && bytes.every((x, i) => b[i] === x);

/**
 * Turni MAZMUN (magic-bytes) bo'yicha aniqlaydi. Kengaytma faqat bir xil
 * imzoli konteynerlarda (ZIP: docx/xlsx; OLE: doc/xls) mime tanlash uchun.
 * SVG va HTML — `kind: file` (brauzerda ochilib ketmasin).
 */
export function sniff(buf: Buffer, ext: string): Sniffed {
  const file = (mime: string, executable = false): Sniffed => ({ kind: 'file', mime, executable });
  const b = buf;

  // --- bajariladigan
  if (starts(b, [0x4d, 0x5a])) return file('application/x-msdownload', true); // MZ: exe/dll/scr/com
  if (starts(b, [0x7f, 0x45, 0x4c, 0x46])) return file('application/x-executable', true); // ELF
  if ([[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe]].some((m) => starts(b, m))) {
    return file('application/x-mach-binary', true);
  }
  if (starts(b, [0x23, 0x21])) return file('text/x-shellscript', true); // #! skript

  // --- rasm
  if (starts(b, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg', executable: false };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mime: 'image/png', executable: false };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { kind: 'image', mime: 'image/gif', executable: false };
  if (ascii(b, 0, 4) === 'RIFF') {
    const form = ascii(b, 8, 12);
    if (form === 'WEBP') return { kind: 'image', mime: 'image/webp', executable: false };
    if (form === 'WAVE') return { kind: 'audio', mime: 'audio/wav', executable: false };
    if (form === 'AVI ') return { kind: 'video', mime: 'video/x-msvideo', executable: false };
  }

  // --- ISO BMFF: ftyp — rasm (HEIC/AVIF), audio (m4a) yoki video (mp4/mov/3gp).
  // Faqat `ftyp` ga qarash yetarli EMAS: brand (8–12 bayt) va mos brendlar ko'riladi.
  if (ascii(b, 4, 8) === 'ftyp') {
    const size = Math.min(b.readUInt32BE(0), b.length, 256);
    const brands = [ascii(b, 8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(b, i, i + 4));
    const major = brands[0];
    if (FTYP_AVIF.has(major)) return { kind: 'image', mime: 'image/avif', executable: false };
    if (FTYP_HEIC.has(major)) return { kind: 'image', mime: 'image/heic', executable: false };
    if (major === 'mif1' || major === 'msf1') {
      if (brands.some((x) => FTYP_AVIF.has(x))) return { kind: 'image', mime: 'image/avif', executable: false };
      if (brands.some((x) => FTYP_HEIC.has(x))) return { kind: 'image', mime: 'image/heic', executable: false };
      return { kind: 'image', mime: 'image/heif', executable: false };
    }
    if (FTYP_AUDIO.has(major)) return { kind: 'audio', mime: 'audio/mp4', executable: false };
    if (FTYP_QT.has(major)) return { kind: 'video', mime: 'video/quicktime', executable: false };
    if (FTYP_3GP.test(major)) return { kind: 'video', mime: 'video/3gpp', executable: false };
    return { kind: 'video', mime: 'video/mp4', executable: false };
  }

  // --- Matroska / WebM
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = b.subarray(0, 64).toString('latin1');
    return { kind: 'video', mime: head.includes('webm') ? 'video/webm' : 'video/x-matroska', executable: false };
  }

  // --- audio
  if (ascii(b, 0, 4) === 'OggS') {
    const head = b.subarray(0, 128).toString('latin1');
    if (head.includes('theora')) return { kind: 'video', mime: 'video/ogg', executable: false };
    return { kind: 'audio', mime: head.includes('OpusHead') ? 'audio/ogg; codecs=opus' : 'audio/ogg', executable: false };
  }
  if (ascii(b, 0, 3) === 'ID3') return { kind: 'audio', mime: 'audio/mpeg', executable: false };
  if (ascii(b, 0, 4) === 'fLaC') return { kind: 'audio', mime: 'audio/flac', executable: false };
  if (ascii(b, 0, 5) === '#!AMR') return { kind: 'audio', mime: 'audio/amr', executable: false };
  if (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    // MPEG kadr sinxroni: layer bitlari 00 — AAC (ADTS), aks holda MP3
    return { kind: 'audio', mime: (b[1] & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg', executable: false };
  }

  // --- hujjatlar
  if (ascii(b, 0, 5) === '%PDF-') return file('application/pdf');
  if (starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06])) {
    // ZIP ichidagi fayl nomlari ochiq turadi: APK va JAR shu yerda ushlanadi
    const raw = b.toString('latin1');
    if (raw.includes('AndroidManifest.xml') || raw.includes('classes.dex') || raw.includes('META-INF/MANIFEST.MF')) {
      return file('application/java-archive', true);
    }
    return file(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(ext) ? EXT_MIME[ext] : 'application/zip');
  }
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return file(['doc', 'xls', 'ppt'].includes(ext) ? EXT_MIME[ext] : 'application/x-ole-storage');
  }
  if (/^AC10\d\d/.test(ascii(b, 0, 6))) return file('image/vnd.dwg');
  if (ascii(b, 0, 4) === 'Rar!') return file('application/vnd.rar');
  if (starts(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return file('application/x-7z-compressed');
  if (starts(b, [0x1f, 0x8b])) return file('application/gzip');

  // --- matnli: SVG/HTML hech qachon rasm/sahifa sifatida berilmaydi
  const text = b.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return file('image/svg+xml');
  if (text.startsWith('<!doctype html') || text.startsWith('<html') || /<(script|iframe|body|head)[\s>]/.test(text)) {
    return file('text/html');
  }
  return file(EXT_MIME[ext] || 'application/octet-stream');
}

/**
 * Asl nom: yo'l qismlari, boshqaruv va Windows'da taqiqlangan belgilar
 * olib tashlanadi. Multer (busboy) nomni latin1 deb o'qiydi — `Смета №4.xlsx`
 * UTF-8 baytlari shu yerda qayta tiklanadi.
 */
export function cleanFileName(raw: string | undefined): string {
  let name = String(raw ?? '');
  if (/^[\u0000-\u00ff]*$/.test(name) && /[\u0080-\u00ff]/.test(name)) {
    const utf8 = Buffer.from(name, 'latin1').toString('utf8');
    if (!utf8.includes('\uFFFD')) name = utf8;
  }
  name = name.normalize('NFC').split(/[\\/]/).pop() || '';
  name = name
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (!name) return 'fayl';
  if (name.length > 180) {
    const ext = extOf(name);
    const tail = ext && ext.length <= 10 ? `.${ext}` : '';
    name = name.slice(0, 180 - tail.length).trimEnd() + tail;
  }
  return name;
}

export function extOf(name: string): string {
  const m = /\.([^.\s]{1,16})$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** HEIC → JPEG: yuklab olinadigan fayl nomi ham `.jpg` bo'ladi. */
export const withExt = (name: string, ext: string) => {
  const cur = extOf(name);
  return (cur ? name.slice(0, -cur.length - 1) : name) + `.${ext}`;
};

/** Brauzerda ochiladiganlar (rasm/video/audio/PDF) — `inline`, qolgani yuklab olinadi. */
export function isInline(kind: AttachmentKind, mime: string): boolean {
  return kind !== 'file' || mime === 'application/pdf';
}

export function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// ------------------------------------------------------------ imzoli havola
const VARIANT_CODE: Record<FileVariant, string> = { file: 'f', thumb: 't' };
const CODE_VARIANT: Record<string, FileVariant> = { f: 'file', t: 'thumb' };

function secret(): string {
  return (
    process.env.CHAT_FILE_URL_SECRET ||
    createHash('sha256').update(`chat-files:${process.env.ACCESS_TOKEN_KEY || ''}`).digest('hex')
  );
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

/** `<id>.<variant>.<exp>.<hmac>` — bazasiz tekshiriladi, ichida faqat raqamlar. */
export function fileToken(id: number, variant: FileVariant, now = Date.now()): string {
  const exp = Math.floor((now + URL_TTL_MS) / 3_600_000) * 3600;
  const payload = `${id}.${VARIANT_CODE[variant]}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export type TokenCheck =
  | { ok: true; id: number; variant: FileVariant }
  | { ok: false; reason: 'invalid' | 'expired' };

export function verifyFileToken(token: string, now = Date.now()): TokenCheck {
  const m = /^(\d{1,10})\.([ft])\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(String(token || ''));
  if (!m) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(sign(`${m[1]}.${m[2]}.${m[3]}`));
  const given = Buffer.from(m[4]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'invalid' };
  if (Number(m[3]) * 1000 <= now) return { ok: false, reason: 'expired' };
  return { ok: true, id: Number(m[1]), variant: CODE_VARIANT[m[2]] };
}

/** Push va ro'yxat uchun qisqa matn (topshiriq №46, 4-band). */
export function attachmentsSummary(list: { kind: AttachmentKind; name: string }[]): string | null {
  if (!list.length) return null;
  const first = list[0];
  if (first.kind === 'image') {
    const n = list.filter((a) => a.kind === 'image').length;
    return n > 1 ? `📷 ${n} ta rasm` : '📷 Rasm';
  }
  if (first.kind === 'video') return '🎬 Video';
  if (first.kind === 'audio') return '🎤 Ovozli xabar';
  return `📎 ${first.name}`;
}
