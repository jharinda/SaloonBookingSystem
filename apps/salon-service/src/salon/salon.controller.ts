import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SalonService } from './salon.service';
import { CreateSalonDto, OperatingHoursDto } from './dto/create-salon.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { AddServiceDto } from './dto/add-service.dto';
import { CreateStationDto, UpdateStationDto, StationsResponseDto } from './dto/station.dto';
import { PaginationQueryDto, SearchSalonsDto } from './dto/salon-query.dto';
import {
  PaginatedSalonsDto,
  SalonResponseDto,
  SalonSearchResultDto,
} from './dto/salon-response.dto';
import { StaffAnalyticsResponseDto } from './dto/staff-analytics.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, JwtUser, UserRole } from '@org/shared-auth';

@Controller('salons')
export class SalonController {
  constructor(
    private readonly salonService: SalonService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public routes ─────────────────────────────────────────────────────────

  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedSalonsDto> {
    return this.salonService.findAll(query);
  }

  @Get('search')
  async search(
    @Query() query: SearchSalonsDto,
  ): Promise<SalonSearchResultDto> {
    return this.salonService.searchSalons(query);
  }

  @Get('featured')
  async featured(): Promise<SalonResponseDto[]> {
    return this.salonService.getFeaturedSalons();
  }

  @Get('owner/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async mySalons(@CurrentUser() user: JwtUser): Promise<SalonResponseDto[]> {
    return this.salonService.getSalonsByOwner(user.sub);
  }

  /** Internal route — find salons that contain a given stylist in their staff */
  @Get('internal/by-stylist/:stylistId')
  @HttpCode(HttpStatus.OK)
  async findSalonsByStylist(
    @Param('stylistId') stylistId: string,
    @Headers('x-internal-token') token: string | undefined,
  ): Promise<Array<{ salonId: string; salonName: string }>> {
    const expected = this.configService.get<string>('internalToken');
    if (!expected || !token || token !== expected) {
      throw new UnauthorizedException('Internal access only');
    }
    return this.salonService.findSalonsByStylist(stylistId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SalonResponseDto> {
    return this.salonService.findById(id);
  }

  // ── Protected routes ──────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async create(
    @Body() dto: CreateSalonDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.createSalon(dto, user.sub, user.email);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSalonDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.updateSalon(id, dto, user.sub);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async approve(@Param('id') id: string): Promise<SalonResponseDto> {
    return this.salonService.approveSalon(id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ): Promise<SalonResponseDto> {
    return this.salonService.rejectSalon(id, reason);
  }

  @Post(':id/services')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async addService(
    @Param('id') id: string,
    @Body() dto: AddServiceDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.addService(id, dto, user.sub);
  }

  @Patch(':id/services/:serviceId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async updateService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: AddServiceDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.updateService(id, serviceId, dto, user.sub);
  }

  @Delete(':id/services/:serviceId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async removeService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.removeService(id, serviceId, user.sub);
  }

  @Patch(':id/operating-hours')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async updateOperatingHours(
    @Param('id') id: string,
    @Body() body: Record<string, { isOpen: boolean; open: string; close: string }>,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    const DAY_INDEX: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const hours: OperatingHoursDto[] = Object.entries(body)
      .filter(([day]) => DAY_INDEX[day] !== undefined)
      .map(([day, h]) => ({
        day: DAY_INDEX[day],
        open: h.open,
        close: h.close,
        closed: !h.isOpen,
      }));
    return this.salonService.updateOperatingHours(id, hours, user.sub);
  }

  /** Internal route — called by review-service to keep rating in sync */
  @Patch(':id/rating')
  @HttpCode(HttpStatus.OK)
  async updateRating(
    @Param('id') id: string,
    @Body() body: { rating: number; reviewCount: number },
  ): Promise<void> {
    return this.salonService.updateRating(id, body.rating, body.reviewCount);
  }

  // ── Image management routes ───────────────────────────────────────────────

  @Patch(':id/images')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async pushImage(
    @Param('id') id: string,
    @Body() body: { cloudinaryId: string; url: string },
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.pushImage(id, body, user.sub);
  }

  @Delete(':id/images/:cloudinaryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async removeImage(
    @Param('id') id: string,
    @Param('cloudinaryId') cloudinaryId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.removeImage(id, cloudinaryId, user.sub);
  }

  @Patch(':id/images/:imageId/primary')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async setPrimaryImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.setPrimaryImage(id, imageId, user.sub);
  }

  // ── Staff Management ────────────────────────────────────────────────────

  @Post(':id/staff/:stylistId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async addStaff(
    @Param('id') id: string,
    @Param('stylistId') stylistId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.addStaffByOwner(id, stylistId, user.sub);
  }

  @Delete(':id/staff/:stylistId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async removeStaff(
    @Param('id') id: string,
    @Param('stylistId') stylistId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.removeStaff(id, stylistId, user.sub);
  }

  /** Internal route — called by auth-service when approving a join request */
  @Post(':id/staff-internal/:stylistId')
  @HttpCode(HttpStatus.OK)
  async addStaffInternal(
    @Param('id') id: string,
    @Param('stylistId') stylistId: string,
    @Headers('x-internal-token') token: string | undefined,
  ): Promise<SalonResponseDto> {
    const expected = this.configService.get<string>('internalToken');
    if (!expected || !token || token !== expected) {
      throw new UnauthorizedException('Internal access only');
    }
    return this.salonService.addStaff(id, stylistId);
  }

  @Get(':salonId/staff-analytics')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async getStaffAnalytics(
    @Param('salonId') salonId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<StaffAnalyticsResponseDto> {
    return this.salonService.getStaffAnalytics(salonId, user.sub);
  }

  // ── Station Management ──────────────────────────────────────

  @Get(':id/stations')
  @HttpCode(HttpStatus.OK)
  async getStations(@Param('id') id: string): Promise<StationsResponseDto> {
    return this.salonService.getStations(id);
  }

  @Post(':id/stations')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async addStation(
    @Param('id') id: string,
    @Body() dto: CreateStationDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.addStation(id, dto.name, user.sub);
  }

  @Patch(':id/stations/:stationId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async updateStation(
    @Param('id') id: string,
    @Param('stationId') stationId: string,
    @Body() dto: UpdateStationDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.updateStation(id, stationId, dto, user.sub);
  }

  @Delete(':id/stations/:stationId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async deleteStation(
    @Param('id') id: string,
    @Param('stationId') stationId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.deleteStation(id, stationId, user.sub);
  }
}
