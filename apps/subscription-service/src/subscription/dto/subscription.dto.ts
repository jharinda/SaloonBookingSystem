import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SubscriptionPlan } from '../schemas/subscription.schema';

export class StartTrialDto {
  @ApiProperty({ description: 'Salon ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  salonId: string;
}

export class GeneratePaymentDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  salonId: string;

  @ApiProperty({ enum: ['starter', 'basic', 'pro', 'franchise'] })
  @IsEnum(['starter', 'basic', 'pro', 'franchise'])
  plan: SubscriptionPlan;
}

export class SimulateUpgradeDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  salonId: string;

  @ApiProperty({ enum: ['starter', 'basic', 'pro', 'franchise'] })
  @IsEnum(['starter', 'basic', 'pro', 'franchise'])
  plan: SubscriptionPlan;
}

export class UpdatePlanConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-1)
  maxLocations?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-1)
  maxStaff?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-1)
  maxStations?: number;

  /** null removes the trial; omit to leave unchanged */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  trialDays?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

export class PayhereWebhookDto {
  merchant_id: string;
  order_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
  custom_1?: string; // salonId
  [key: string]: string | undefined;
}

export class RenewalStatusResponseDto {
  @ApiProperty()
  status: string;

  @ApiProperty()
  plan: string;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  currentPeriodEnd: Date | null;

  @ApiProperty({ description: 'Whole days until period (or trial) end; can be negative if overdue' })
  daysRemaining: number;

  @ApiProperty({ description: 'True when trial or paid period ends within 3 days' })
  isExpiringSoon: boolean;
}
