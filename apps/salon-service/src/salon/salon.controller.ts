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

import { SalonService } from './salon.service';
import { CreateSalonDto } from './dto/create-salon.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { PaginationQueryDto, SalonSearchQueryDto } from './dto/salon-query.dto';
import { PaginatedSalonsDto, SalonResponseDto } from './dto/salon-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';

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
    @Query() query: SalonSearchQueryDto,
  ): Promise<SalonResponseDto[]> {
    return this.salonService.search(query);
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
}
