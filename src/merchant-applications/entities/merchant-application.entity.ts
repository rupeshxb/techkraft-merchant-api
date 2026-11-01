import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { BusinessType } from '../enums/business-type.enum';
import { RiskStatus } from '../enums/risk-status.enum';

@Entity('merchant_applications')
export class MerchantApplication {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ example: 'Himalayan Bites' })
  @Column()
  businessName!: string;

  @ApiProperty({ example: 'Himalayan Bites Pvt. Ltd.' })
  @Column()
  legalBusinessName!: string;

  @ApiProperty({ enum: BusinessType })
  @Column({
    type: 'enum',
    enum: BusinessType,
    enumName: 'merchant_applications_business_type_enum',
  })
  businessType!: BusinessType;

  @ApiProperty({ example: 'Sita' })
  @Column()
  ownerFirstName!: string;

  @ApiProperty({ example: 'Sharma' })
  @Column()
  ownerLastName!: string;

  @ApiProperty({ example: 'sita@himalayanbites.com' })
  @Column()
  ownerEmail!: string;

  @ApiProperty({ example: '+9779841234567' })
  @Column()
  ownerPhone!: string;

  @ApiProperty({ example: 'Thamel, Kathmandu' })
  @Column()
  businessAddress!: string;

  @ApiProperty({ example: 2500000, description: 'Monthly volume' })
  /** Monthly processing volume. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number) => value,
      from: (value: string | null) => (value === null ? value : Number(value)),
    },
  })
  requestedProcessingVolume!: number;

  @ApiProperty({ example: 'NPR', default: 'NPR' })
  @Column({ default: 'NPR' })
  requestedProcessingCurrency!: string;

  @ApiProperty({ enum: ApplicationStatus })
  @Index()
  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'merchant_applications_status_enum',
    default: ApplicationStatus.PENDING,
  })
  status!: ApplicationStatus;

  @ApiProperty({ enum: RiskStatus })
  @Column({
    type: 'enum',
    enum: RiskStatus,
    enumName: 'merchant_applications_risk_status_enum',
    default: RiskStatus.PENDING,
  })
  riskStatus!: RiskStatus;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '0-100, set by the async risk check' })
  @Column({ type: 'int', nullable: true })
  riskScore!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  riskNotes!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  riskProcessedAt!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'risk-check-<application id>' })
  /** Used for idempotency of the risk-check job. */
  @Column({ type: 'varchar', nullable: true })
  riskJobId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  /** Notes left by the reviewer with their latest decision. */
  @Column({ type: 'text', nullable: true })
  reviewNotes!: string | null;

  @ApiProperty({ type: () => User, description: 'The SALES user who created it' })
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  createdBy!: User;

  @ApiPropertyOptional({ type: () => User, nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignedReviewer!: User | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @UpdateDateColumn()
  updatedAt!: Date;
}
