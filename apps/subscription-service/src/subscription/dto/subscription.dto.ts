import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SubscriptionPlan } from '../schemas/subscription.schema';

export class StartTrialDto {
  @IsString()
  @IsNotEmpty()
  salonId: string;
}

export class GeneratePaymentDto {
  @IsString()
  @IsNotEmpty()
  salonId: string;

  @IsEnum(['starter', 'basic', 'pro', 'franchise'])
  plan: SubscriptionPlan;
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
