import { SellerApplication } from './model/seller-application.model';
import { SellerApplicationDocument } from './model/seller-application-document.model';
import { SellerApplicationEvent } from './model/seller-application-event.model';
import { requiredDocuments } from './constants';

// Arizaning JAVOB SHAKLLARI — bitta joyda (topshiriq №16, 4- va 5-band).
//
// Model to'g'ridan-to'g'ri javobga BERILMAYDI. Har bir auditoriya uchun
// ochiq ro'yxat (allowlist): yangi ustun qo'shilsa u avtomatik ravishda
// hech kimga ko'rinmaydi — ataylab qo'shilishi kerak. Aks holda
// `offer_user_agent`, `public_token_hash` yoki bank rekvizitlari
// kutilmagan joyga tushib qolardi.

const iso = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : null;

/** Sotuvchining holat sahifasi — bank, pasport, ichki izoh QAYTMAYDI. */
export function toStatusView(app: SellerApplication, linkedTypes: string[]) {
  const missing = requiredDocuments(app.legal_form).filter((t) => !linkedTypes.includes(t));
  return {
    status: app.status,
    store_name: app.store_name,
    created_at: iso(app.created_at),
    info_request: app.status === 'needs_info' ? app.info_request : null,
    reject_reason: app.status === 'rejected' ? app.reject_reason : null,
    missing_documents: missing,
  };
}

export function toDocumentView(d: SellerApplicationDocument) {
  return {
    id: d.id,
    type: d.type,
    original_name: d.original_name,
    mime: d.mime,
    size: d.size,
    created_at: iso(d.created_at),
    deleted_at: iso(d.deleted_at),
  };
}

export function toEventView(e: SellerApplicationEvent) {
  return {
    id: e.id,
    type: e.type,
    // Login MATNI (ID emas) — topshiriq talabi. NULL: sotuvchi, tizim yoki
    // servis kaliti.
    actor: e.actor?.login ?? null,
    message: e.message,
    created_at: iso(e.created_at),
  };
}

/**
 * Superadmin uchun. `public_token_hash` va `offer_user_agent` ATAYLAB yo'q.
 * `full` — `one/:id` (hujjatlar va tarix bilan), aks holda `all` ro'yxati.
 */
export function toAdminView(
  app: SellerApplication,
  opts: { documentsCount: number; full?: boolean },
) {
  const view: Record<string, unknown> = {
    id: app.id,
    status: app.status,
    legal_form: app.legal_form,
    legal_name: app.legal_name,
    tin: app.tin,
    registered_at: app.registered_at ?? null,
    legal_address: app.legal_address,
    director_name: app.director_name,
    director_position: app.director_position,
    bank_name: app.bank_name,
    bank_account: app.bank_account,
    bank_mfo: app.bank_mfo,
    vat_payer: app.vat_payer,
    vat_code: app.vat_code,
    contact_name: app.contact_name,
    contact_phone: app.contact_phone,
    contact_email: app.contact_email,
    store_name: app.store_name,
    business_type: app.business_type,
    categories: app.categories,
    brands: app.brands,
    warehouse_address: app.warehouse_address,
    delivery_regions: app.delivery_regions,
    comment: app.comment,
    offer_version: app.offer_version,
    offer_accepted_at: iso(app.offer_accepted_at),
    offer_ip: app.offer_ip,
    info_request: app.info_request,
    reject_reason: app.reject_reason,
    admin_note: app.admin_note,
    reviewed_by: app.reviewer?.login ?? null,
    reviewed_at: iso(app.reviewed_at),
    store_id: app.store_id,
    store_user_id: app.store_user_id,
    store_user_login: app.sellerAccount?.login ?? null,
    documents_count: opts.documentsCount,
    created_at: iso(app.created_at),
    updated_at: iso(app.updated_at),
  };
  if (opts.full) {
    view.documents = (app.documents || [])
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(toDocumentView);
    view.events = (app.events || [])
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(toEventView);
  }
  return view;
}
