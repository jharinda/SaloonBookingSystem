import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OwnerReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reply: string;
}
