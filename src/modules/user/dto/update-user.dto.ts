import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CustomerStatusEnum } from 'src/common/enums/userEnum';

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
    description: 'Updated field position (e.g. Defender, Goalkeeper)',
    example: 'Midfielder',
  })
  @IsString()
  @IsOptional()
  position?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL or path',
    example: 'https://lh3.googleusercontent.com/...',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Customer account status',
    enum: CustomerStatusEnum,
    example: CustomerStatusEnum.active,
  })
  @IsEnum(CustomerStatusEnum)
  @IsOptional()
  status?: CustomerStatusEnum;

  @ApiPropertyOptional({
    description: 'Preferred language / locale',
    enum: ['ar', 'en'],
    example: 'ar',
  })
  @IsString()
  @IsOptional()
  locale?: string;
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
