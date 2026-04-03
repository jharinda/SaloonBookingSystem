import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Salon ID' })
  @IsMongoId()
  @IsNotEmpty()
  salonId: string;
}

export class GetMessagesQueryDto {
  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsString()
  page?: string = '1';

  @ApiPropertyOptional({ default: '50' })
  @IsOptional()
  @IsString()
  limit?: string = '50';
}
