import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums/role.enum';

@Entity('users')
export class User {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ example: 'sales@techkraft.com' })
  @Column({ unique: true })
  email!: string;

  // Hashed with bcrypt; excluded from queries unless explicitly selected.
  @ApiHideProperty()
  @Column({ select: false })
  password!: string;

  @ApiProperty({ enum: Role })
  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @ApiProperty()
  @Column()
  firstName!: string;

  @ApiProperty()
  @Column()
  lastName!: string;

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt!: Date;
}
