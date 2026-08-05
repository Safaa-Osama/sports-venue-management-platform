import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleEnum } from 'src/common/enums/userEnum';

export class UpdateCustomerUserDto {
  @IsString()
  @IsOptional()
  userName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsNumber()
  @IsOptional()
  walletBalance?: number;
}

export class UpdateAdminUserDto {
  @IsString()
  @IsOptional()
  userName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
