import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}
