import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { BusinessType } from '../enums/business-type.enum';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Himalayan Bites' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName!: string;

  @ApiProperty({ example: 'Himalayan Bites Pvt. Ltd.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalBusinessName!: string;

  @ApiProperty({ enum: BusinessType, example: BusinessType.PRIVATE_LIMITED })
  @IsEnum(BusinessType)
  businessType!: BusinessType;

  @ApiProperty({ example: 'Sita' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ownerFirstName!: string;

  @ApiProperty({ example: 'Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ownerLastName!: string;

  @ApiProperty({ example: 'sita@himalayanbites.com' })
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty({ example: '+9779841234567' })
  @IsString()
  @Length(7, 20)
  ownerPhone!: string;

  @ApiProperty({ example: 'Thamel, Kathmandu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  businessAddress!: string;

  @ApiProperty({ example: 2500000, description: 'Requested monthly volume' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  requestedProcessingVolume!: number;

  @ApiPropertyOptional({ example: 'NPR', default: 'NPR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  requestedProcessingCurrency?: string;
}
