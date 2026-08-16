import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateCustomerUserDto {
  @ApiPropertyOptional({
    description: 'Updated username/full name',
    example: 'John Smith',
  })
  @IsString()
  @IsOptional()
  userName?: string;

  @ApiPropertyOptional({
    description: 'Updated phone number',
    example: '+201012345678',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL or binary upload',
    type: 'string',
    format: 'binary',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Updated field position (e.g. Defender, Goalkeeper)',
    example: 'Midfielder',
  })
  @IsString()
  @IsOptional()
  position?: string;

  @ApiPropertyOptional({
    description: 'Direct adjustment of customer wallet balance (Admin only)',
    example: 1500,
  })
  @IsNumber()
  @IsOptional()
  walletBalance?: number;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({
    description: 'Updated admin username',
    example: 'Admin Supervisor',
  })
  @IsString()
  @IsOptional()
  userName?: string;

  @ApiPropertyOptional({
    description: 'Updated admin work email',
    example: 'supervisor@sportsvenue.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Updated password (minimum 6 characters)',
    example: 'NewAdmin@2026',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
