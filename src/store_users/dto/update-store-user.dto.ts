import { PartialType } from '@nestjs/swagger';
import { CreateStoreUserDto } from './create-store-user.dto';

// Parol shu yerda ham almashtiriladi — berilsa qayta hash qilinadi.
export class UpdateStoreUserDto extends PartialType(CreateStoreUserDto) {}
