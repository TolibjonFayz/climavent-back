import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface SettingAtr {
  key: string;
  value: string;
  description: string;
}

// Sayt sozlamalari (key-value). Hozircha dollar kursi uchun ishlatiladi,
// keyinchalik boshqa sozlamalar ham shu yerga qo'shilishi mumkin.
@Table({ tableName: 'settings' })
export class Setting extends Model<Setting, SettingAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({ example: 'usd_rate', description: 'Sozlama kaliti' })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  key: string;

  @ApiProperty({ example: '12000', description: 'Sozlama qiymati' })
  @Column({ type: DataType.STRING, allowNull: false })
  value: string;

  @ApiProperty({
    example: "Dollar kursi (1 USD necha so'm)",
    description: 'Izoh',
    required: false,
  })
  @Column({ type: DataType.STRING, allowNull: true })
  description: string;
}
