import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

import { SalonResponseDto } from './salon-response.dto';

export class FranchiseOverviewDto {
  @ApiProperty()
  totalBranches: number;

  @ApiProperty()
  totalStaff: number;

  @ApiProperty({ description: 'Weighted by review count when available' })
  averageRating: number;

  @ApiProperty({ description: 'Sum of branch analytics totalRevenue for the same period' })
  totalRevenue: number;

  @ApiProperty({ description: 'Sum of active (pending/confirmed/in-progress) bookings today (UTC) across branches' })
  activeTodayCount: number;

  @ApiProperty({ type: [Object], description: 'Branches included in the overview' })
  branches: SalonResponseDto[];
}

export class TransferBranchDto {
  @ApiProperty({ description: 'User id of the new franchise owner' })
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  newOwnerId: string;
}
