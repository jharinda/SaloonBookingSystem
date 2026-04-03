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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { JwtAuthGuard, RolesGuard, Roles, UserRole } from '@org/shared-auth';
import { Specialty } from './schemas/specialty.schema';

class CreateSpecialtyDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

class UpdateSpecialtyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

export interface SpecialtyResponseDto {
  _id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
}

@ApiTags('salons')
@Controller('salons/specialties')
export class SpecialtiesController {
  constructor(
    @InjectModel(Specialty.name) private readonly specialtyModel: Model<Specialty>,
  ) {}

  @ApiOperation({ summary: 'List active specialties (public)' })
  @ApiResponse({ status: 200, description: 'Specialties' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAll(): Promise<SpecialtyResponseDto[]> {
    const items = await this.specialtyModel
      .find({ isActive: true })
      .sort({ category: 1, name: 1 })
      .lean();
    return items.map((s) => ({
      _id: s._id.toString(),
      name: s.name,
      description: s.description ?? null,
      category: s.category ?? null,
      isActive: s.isActive,
    }));
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create specialty (admin)' })
  @ApiResponse({ status: 201, description: 'Created' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(@Body() dto: CreateSpecialtyDto): Promise<SpecialtyResponseDto> {
    const doc = await this.specialtyModel.create({
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
    });
    return {
      _id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      category: doc.category,
      isActive: doc.isActive,
    };
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all specialties including inactive (admin)' })
  @ApiResponse({ status: 200, description: 'Specialties' })
  @Get('all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAllIncludingInactive(): Promise<SpecialtyResponseDto[]> {
    const items = await this.specialtyModel
      .find()
      .sort({ category: 1, name: 1 })
      .lean();
    return items.map((s) => ({
      _id: s._id.toString(),
      name: s.name,
      description: s.description ?? null,
      category: s.category ?? null,
      isActive: s.isActive,
    }));
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update specialty (admin)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSpecialtyDto,
  ): Promise<SpecialtyResponseDto> {
    const doc = await this.specialtyModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true, lean: true },
    );
    if (!doc) throw new Error('Specialty not found');
    return {
      _id: doc._id.toString(),
      name: doc.name,
      description: doc.description ?? null,
      category: doc.category ?? null,
      isActive: doc.isActive,
    };
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Deactivate specialty (admin)' })
  @ApiResponse({ status: 200, description: 'Deactivated' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.specialtyModel.findByIdAndUpdate(id, { isActive: false });
    return { message: 'Specialty deactivated' };
  }
}
