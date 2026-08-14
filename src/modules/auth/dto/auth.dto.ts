import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ProviderEnum, RoleEnum } from 'src/common/enums/userEnum';

export class CustomerSendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class CustomerVerifyOtpDto {
  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  userName?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}

export class DashboardLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateAdminDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsEnum(RoleEnum)
  @IsOptional()
  role?: RoleEnum;
}


export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @IsOptional()
  userName?: string;

  @IsString()
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  provider?: ProviderEnum.google;
}