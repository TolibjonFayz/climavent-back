import { BadRequestException, Injectable } from '@nestjs/common';
import { R2DocumentsStore } from 'src/seller_applications/r2-documents.store';
import { DeliveryProof } from './model/models';
import { PROOF_MAX_BYTES } from './constants';

const TYPES = [
  { mime: 'image/jpeg', test: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    test: (b: Buffer) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/**
 * Topshirish isboti rasmi (topshiriq №22, 2- va 5-band).
 *
 * Railway diskiga EMAS. `R2_DOCS_BUCKET` (yopiq bucket, №20) sozlangan bo'lsa —
 * R2 ga (`delivery-proofs/<uuid>`), aks holda bazaga (`delivery_proofs.data`).
 * Rasm hech qachon ochiq URL'da turmaydi: `proof_photo_url` — guvohnoma talab
 * qiladigan server manzili.
 */
@Injectable()
export class ProofStorageService {
  constructor(private readonly r2: R2DocumentsStore) {}

  async save(deliveryId: number, kind: 'delivered' | 'failed', file?: Express.Multer.File) {
    if (!file?.buffer?.length) return null;
    if (file.size > PROOF_MAX_BYTES) throw new BadRequestException("Rasm 8 MB dan katta bo'lmasin");
    const type = TYPES.find((t) => t.test(file.buffer));
    if (!type) throw new BadRequestException('Faqat JPG, PNG yoki WebP rasm');

    if (this.r2.enabled) {
      const key = `delivery-proofs/${this.r2.newKey().split('/').pop()}`;
      await this.r2.put(key, file.buffer, type.mime);
      return DeliveryProof.create({ delivery_id: deliveryId, kind, storage: 'r2', file_key: key, mime: type.mime, size: file.size } as any);
    }
    return DeliveryProof.create({ delivery_id: deliveryId, kind, storage: 'db', mime: type.mime, size: file.size, data: file.buffer } as any);
  }

  async open(proof: DeliveryProof): Promise<Buffer | null> {
    if (proof.storage === 'r2') return proof.file_key ? this.r2.get(proof.file_key) : null;
    return proof.data ?? null;
  }
}
