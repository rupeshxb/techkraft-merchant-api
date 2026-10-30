import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApplicationStatus } from '../enums/application-status.enum';

export const REVIEW_DECISIONS = [
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.INFO_REQUESTED,
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export class ReviewDecisionDto {
  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn(REVIEW_DECISIONS)
  decision!: ReviewDecision;

  @ApiPropertyOptional({ example: 'Please provide a company registration certificate.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
