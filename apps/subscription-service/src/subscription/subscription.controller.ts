import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard, RolesGuard, Roles, UserRole } from '@org/shared-auth';
import { SubscriptionService } from './subscription.service';
import {
  GeneratePaymentDto,
  PayhereWebhookDto,
  RenewalStatusResponseDto,
  SimulateUpgradeDto,
  StartTrialDto,
  UpdatePlanConfigDto,
} from './dto/subscription.dto';

@ApiTags('subscriptions')
@ApiBearerAuth('JWT')
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @ApiOperation({ summary: 'List subscription plans' })
  @ApiResponse({ status: 200, description: 'Plan configurations' })
  @Get('plans')
  getPlans() {
    return this.subscriptionService.getAllPlans();
  }

  @ApiOperation({ summary: 'Platform subscription plan distribution (super admin)' })
  @ApiResponse({ status: 200, description: 'Count of subscriptions per plan' })
  @Get('admin/plan-distribution')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getPlanDistribution() {
    return this.subscriptionService.getPlanDistribution();
  }

  @ApiOperation({ summary: 'Update plan config (admin)' })
  @ApiParam({ name: 'key', description: 'Plan key' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  @Patch('admin/plans/:key')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  updatePlan(
    @Param('key') key: string,
    @Body() dto: UpdatePlanConfigDto,
  ) {
    return this.subscriptionService.updatePlanConfig(key, dto);
  }

  @ApiOperation({ summary: 'Start subscription trial for a salon' })
  @ApiResponse({ status: 201, description: 'Trial started' })
  @Post('trial')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  startTrial(@Body() dto: StartTrialDto) {
    return this.subscriptionService.startTrial(dto.salonId);
  }

  @ApiOperation({ summary: 'Get current subscription for a salon' })
  @ApiQuery({ name: 'salonId', required: true, description: 'Salon ID' })
  @ApiResponse({ status: 200, description: 'Subscription state' })
  @Get('my')
  @UseGuards(JwtAuthGuard)
  getMySubscription(@Query('salonId') salonId: string) {
    return this.subscriptionService.getSubscription(salonId);
  }

  @ApiOperation({ summary: 'Generate PayHere payment payload' })
  @ApiResponse({ status: 200, description: 'Payment form data' })
  @Post('payment')
  @UseGuards(JwtAuthGuard)
  generatePayment(@Body() dto: GeneratePaymentDto) {
    return this.subscriptionService.generatePayherePayment(dto);
  }

  @ApiOperation({ summary: 'Simulate plan upgrade (dev)' })
  @ApiResponse({ status: 200, description: 'Subscription updated' })
  @Post('simulate-upgrade')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  simulateUpgrade(@Body() dto: SimulateUpgradeDto) {
    return this.subscriptionService.simulateUpgrade(dto.salonId, dto.plan);
  }

  @ApiExcludeEndpoint()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: PayhereWebhookDto) {
    return this.subscriptionService.handleWebhook(payload);
  }

  @ApiOperation({ summary: 'Check if a feature is enabled for a salon' })
  @ApiParam({ name: 'salonId', description: 'Salon ID' })
  @ApiQuery({ name: 'feature', required: true, description: 'Feature key' })
  @ApiResponse({ status: 200, description: 'Feature check result' })
  @Get(':salonId/check-feature')
  checkFeature(
    @Param('salonId') salonId: string,
    @Query('feature') feature: string,
  ) {
    return this.subscriptionService.checkFeature(salonId, feature);
  }

  @ApiOperation({ summary: 'Get effective plan limits for a salon' })
  @ApiParam({ name: 'salonId', description: 'Salon ID' })
  @ApiResponse({ status: 200, description: 'Plan limits' })
  @Get(':salonId/plan-limits')
  getPlanLimits(@Param('salonId') salonId: string) {
    return this.subscriptionService.getPlanLimits(salonId);
  }

  @ApiOperation({ summary: 'Subscription renewal status (period end, days left, expiring soon)' })
  @ApiParam({ name: 'salonId', description: 'Salon ID' })
  @ApiResponse({ status: 200, description: 'Renewal status', type: RenewalStatusResponseDto })
  @Get(':salonId/renewal-status')
  @UseGuards(JwtAuthGuard)
  getRenewalStatus(@Param('salonId') salonId: string) {
    return this.subscriptionService.getRenewalStatus(salonId);
  }
}
