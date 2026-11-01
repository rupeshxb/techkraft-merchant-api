import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ description: 'Acting user id, or "system" for background jobs' })
  @Column()
  userId!: string;

  @ApiProperty()
  @Column()
  userEmail!: string;

  @ApiProperty({ example: 'REVIEWER' })
  @Column()
  userRole!: string;

  @ApiProperty({ example: 'APPLICATION_CREATED' })
  @Column()
  action!: string;

  @ApiProperty({ example: 'MerchantApplication' })
  @Column()
  entityType!: string;

  @ApiProperty()
  @Index('IDX_audit_logs_entityId')
  @Column()
  entityId!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Extra context; never contains secrets',
  })
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;
}
