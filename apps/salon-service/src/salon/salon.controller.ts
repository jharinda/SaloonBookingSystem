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
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { FranchiseOverviewDto, TransferBranchDto } from './dto/franchise.dto';
import { StaffAnalyticsResponseDto } from './dto/staff-analytics.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, JwtUser, UserRole } from '@org/shared-auth';

@ApiTags('salons')
@ApiBearerAuth('JWT')
@Controller('salons')
export class SalonController {
  constructor(
    private readonly salonService: SalonService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public routes ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List salons (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated salons' })
  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedSalonsDto> {
    return this.salonService.findAll(query);
  }

  @ApiOperation({ summary: 'Search salons' })
  @ApiResponse({ status: 200, description: 'Search results' })
  @Get('search')
  async search(
    @Query() query: SearchSalonsDto,
  ): Promise<SalonSearchResultDto> {
    return this.salonService.searchSalons(query);
  }

  @ApiOperation({ summary: 'Featured salons' })
  @ApiResponse({ status: 200, description: 'Featured list' })
  @Get('featured')
  async featured(): Promise<SalonResponseDto[]> {
    return this.salonService.getFeaturedSalons();
  }

  @ApiOperation({ summary: 'List franchise branches and solo salons for the current owner' })
  @ApiResponse({ status: 200, description: 'Branches', type: [Object] })
  @Get('franchise/branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FRANCHISE_OWNER, UserRole.ADMIN)
  async franchiseBranches(@CurrentUser() user: JwtUser): Promise<SalonResponseDto[]> {
    return this.salonService.getFranchiseBranches(user.sub);
  }

  @ApiOperation({ summary: 'Aggregated franchise metrics across branches' })
  @ApiResponse({ status: 200, description: 'Overview' })
  @Get('franchise/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FRANCHISE_OWNER, UserRole.ADMIN)
  async franchiseOverview(@CurrentUser() user: JwtUser): Promise<FranchiseOverviewDto> {
    return this.salonService.getFranchiseOverview(user.sub);
  }

  @ApiOperation({ summary: 'Add a branch (inherits franchise id; enforces plan location limits)' })
  @ApiResponse({ status: 201, description: 'Branch created' })
  @Post('franchise/branches')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FRANCHISE_OWNER, UserRole.ADMIN)
  async addFranchiseBranch(
    @Body() dto: CreateSalonDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SalonResponseDto> {
    return this.salonService.addBranch(user.sub, dto, user.email);
  }

  @ApiOperation({ summary: 'Transfer branch ownership to another franchise owner' })
  @ApiParam({ name: 'salonId', description: 'Branch salon id' })
  @ApiResponse({ status: 200, description: 'Transferred' })
  @Patch('franchise/branches/:salonId/transfer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FRANCHISE_OWNER, UserRole.ADMIN)
  async transferFranchiseBranch(
    @Param('salonId') salonId: string,
    @Body() dto: TransferBranchDto,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.salonService.transferBranch(user.sub, salonId, dto.newOwnerId, {
      isAdmin: user.role === UserRole.ADMIN,
    });
  }

  @ApiOperation({ summary: 'Salons owned by current user' })
  @ApiResponse({ status: 200, description: 'Owner salons' })
  @Get('owner/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async mySalons(@CurrentUser() user: JwtUser): Promise<SalonResponseDto[]> {
    return this.salonService.getSalonsByOwner(user.sub);
  }

  /** Internal route — find salons that contain a given stylist in their staff */
  @ApiExcludeEndpoint()
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

  @ApiOperation({ summary: 'Get salon by id' })
  @ApiParam({ name: 'id', description: 'Salon ID' })
  @ApiResponse({ status: 200, description: 'Salon' })
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SalonResponseDto> {
    return this.salonService.findById(id);
  }

  // ── Protected routes ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create salon' })
  @ApiResponse({ status: 201, description: 'Salon created' })
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

  @ApiOperation({ summary: 'Approve salon (admin)' })
  @ApiParam({ name: 'id', description: 'Salon ID' })
  @ApiResponse({ status: 200, description: 'Salon approved' })
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async approve(@Param('id') id: string): Promise<SalonResponseDto> {
    return this.salonService.approveSalon(id);
  }

  @ApiOperation({ summary: 'Reject salon (admin)' })
  @ApiParam({ name: 'id', description: 'Salon ID' })
  @ApiResponse({ status: 200, description: 'Salon rejected' })
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

  @ApiOperation({ summary: 'Add service to salon' })
  @ApiParam({ name: 'id', description: 'Salon ID' })
  @ApiResponse({ status: 201, description: 'Service added' })
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

  @ApiOperation({ summary: 'Update salon service' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Remove service from salon' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Update operating hours' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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
  @ApiExcludeEndpoint()
  @Patch(':id/rating')
  @HttpCode(HttpStatus.OK)
  async updateRating(
    @Param('id') id: string,
    @Body() body: { rating: number; reviewCount: number },
  ): Promise<void> {
    return this.salonService.updateRating(id, body.rating, body.reviewCount);
  }

  // ── Image management routes ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Attach image metadata to salon (cloudinary id + url)' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Remove image from salon' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Set primary salon image' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Add stylist to salon staff' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Remove stylist from salon' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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
  @ApiExcludeEndpoint()
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

  @ApiOperation({ summary: 'Staff analytics for salon' })
  @ApiResponse({ status: 200, description: 'Analytics' })
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

  @ApiOperation({ summary: 'List stations for salon' })
  @ApiResponse({ status: 200, description: 'Stations' })
  @Get(':id/stations')
  @HttpCode(HttpStatus.OK)
  async getStations(@Param('id') id: string): Promise<StationsResponseDto> {
    return this.salonService.getStations(id);
  }

  @ApiOperation({ summary: 'Add station' })
  @ApiResponse({ status: 201, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Update station' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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

  @ApiOperation({ summary: 'Delete station' })
  @ApiResponse({ status: 200, description: 'Updated salon' })
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
