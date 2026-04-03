import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Password must not be empty' })
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token must not be empty' })
  refreshToken: string;
}
