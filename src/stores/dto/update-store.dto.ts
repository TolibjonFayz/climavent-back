import { PartialType } from '@nestjs/swagger';
import { CreateStoreDto } from './create-store.dto';

// Hamma maydon ixtiyoriy. DIQQAT: bu yerda maydonlarni QAYTA E'LON
// QILMANG — `@IsOptional()` siz qayta e'lon PartialType bergan
// ixtiyoriylikni bekor qiladi (topshiriq №9 da shu xato bo'lgan).
export class UpdateStoreDto extends PartialType(CreateStoreDto) {}
