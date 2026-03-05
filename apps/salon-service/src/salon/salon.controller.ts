import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { SalonService } from './salon.service';
import { CreateSalonDto, OperatingHoursDto } from './dto/create-salon.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { AddServiceDto } from './dto/add-service.dto';
import { PaginationQueryDto, SearchSalonsDto } from './dto/salon-query.dto';
import { PaginatedSalonsDto, SalonResponseDto, SalonSearchResultDto } from './dto/salon-response.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, JwtUser, UserRole } from '@org/shared-auth';

@Controller('salons')
export class SalonController {
  constructor(private readonly salonService: SalonService) {}

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
}
