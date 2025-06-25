import { ApiProperty } from '@nestjs/swagger';
import { Table, Model, Column, DataType } from 'sequelize-typescript';

interface RishotkalarAtr {
  name: string;
  length: number;
  width: number;
  price: number;
}

@Table({ tableName: 'rishotkalar' })
export class Rishotkalar extends Model<Rishotkalar, RishotkalarAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({ example: '4РВП', description: 'Name of the rishotka' })
  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @ApiProperty({ example: 400, description: 'Length of the rishotka' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  length: number;

  @ApiProperty({ example: 400, description: 'Width of the rishotka' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  width: number;

  @ApiProperty({ example: 100000, description: 'Price of the rishotka' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  price: number;
}
