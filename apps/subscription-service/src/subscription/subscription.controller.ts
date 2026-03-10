import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '@org/shared-auth';
import { SubscriptionService } from './subscription.service';
import { GeneratePaymentDto, PayhereWebhookDto, StartTrialDto } from './dto/subscription.dto';
import { PLANS } from './plans.config';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  /** GET /api/subscriptions/plans */
  @Get('plans')
  getPlans(): typeof PLANS {
    return this.subscriptionService.getAllPlans();
  }

  /** GET /api/subscriptions/:salonId/check-feature?feature=X */
  @Get(':salonId/check-feature')
  checkFeature(
    @Param('salonId') salonId: string,
    @Query('feature') feature: string,
  ) {
    return this.subscriptionService.checkFeature(salonId, feature);
  }

  /** GET /api/subscriptions/:salonId/plan-limits */
  @Get(':salonId/plan-limits')
  getPlanLimits(@Param('salonId') salonId: string) {
    return this.subscriptionService.getPlanLimits(salonId);
  }

  // ── Authenticated ─────────────────────────────────────────────────────────

  /** POST /api/subscriptions/trial — start 30-day trial for a salon */
  @Post('trial')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  startTrial(@Body() dto: StartTrialDto) {
    return this.subscriptionService.startTrial(dto.salonId);
  }

  /** GET /api/subscriptions/my — get subscription by salonId (query param) */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  getMySubscription(@Body() body: { salonId: string }) {
    return this.subscriptionService.getSubscription(body.salonId);
  }

  /** POST /api/subscriptions/payment — generate PayHere payment data */
  @Post('payment')
  @UseGuards(JwtAuthGuard)
  generatePayment(@Body() dto: GeneratePaymentDto) {
    return this.subscriptionService.generatePayherePayment(dto);
  }

  // ── Webhook (no auth guard — verified by hash) ────────────────────────────

  /** POST /api/subscriptions/webhook — PayHere payment notification */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: PayhereWebhookDto) {
    return this.subscriptionService.handleWebhook(payload);
  }
}
