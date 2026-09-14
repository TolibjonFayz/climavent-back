// Sotuvchi arizasi — yagona manba (topshiriq №16).

export const APPLICATION_STATUSES = ['pending', 'needs_info', 'approved', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Ulardan chiqib bo'lmaydi — qayta urinish uchun yangi ariza. */
export const FINAL_STATUSES: readonly string[] = ['approved', 'rejected'];

export const LEGAL_FORMS = ['llc', 'jsc', 'other_legal_entity', 'sole_proprietor'] as const;

export const BUSINESS_TYPES = ['manufacturer', 'distributor', 'dealer', 'reseller'] as const;

export const DOCUMENT_TYPES = [
  'registration_certificate',
  'director_appointment',
  'passport',
  'power_of_attorney',
  'dealer_authorization',
  'certificate',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Majburiy hujjatlar — huquqiy shaklga qarab (topshiriq 2-band jadvali). */
export function requiredDocuments(legalForm: string): DocumentType[] {
  return legalForm === 'sole_proprietor'
    ? ['registration_certificate', 'passport']
    : ['registration_certificate', 'director_appointment', 'passport'];
}

/**
 * STIR formati. Yuridik shaxs — 9 raqam. YaTT — 9 (STIR) yoki 14 (JShShIR):
 * YaTT larning bir qismi faqat JShShIR bilan ro'yxatda turadi, shuning
 * uchun ikkalasi ham qabul qilinadi (3-savol).
 */
export function isValidTin(tin: unknown, legalForm: string): boolean {
  if (typeof tin !== 'string') return false;
  if (legalForm === 'sole_proprietor') return /^(\d{9}|\d{14})$/.test(tin);
  return /^\d{9}$/.test(tin);
}

export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOCS_PER_APPLICATION = 10;
/** Arizaga bog'lanmagan yuklama shu muddatdan keyin o'chiriladi. */
export const ORPHAN_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
/** Yakuniy holatdan keyin pasport shuncha kun saqlanadi (oferta 2-ilova 2.3). */
export const PASSPORT_RETENTION_DAYS = 30;
/**
 * Bog'lanmagan yuklamalarning JAMI hajmi chegarasi. Hujjatlar bazada
 * saqlangani uchun: ko'p IP'dan kelgan spam bazani to'ldirib yubormasin.
 */
export const ORPHAN_UPLOADS_MAX_BYTES = 300 * 1024 * 1024;
/** Hujjat havolasi muddati (2-savol). */
export const DOCUMENT_URL_TTL_MS = 5 * 60 * 1000;
/** Parol o'rnatish havolasi muddati (7-band). */
export const PASSWORD_SETUP_TTL_MS = 72 * 60 * 60 * 1000;
