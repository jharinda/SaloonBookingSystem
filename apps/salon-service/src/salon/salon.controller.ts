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
  Put,
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
    return this.salonService.createSalon(dto, user.sub);
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

  @Put(':id/operating-hours')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async updateOperatingHours(
    @Param('id') id: string,
    @Body() hours: OperatingHoursDto[],
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
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
}
