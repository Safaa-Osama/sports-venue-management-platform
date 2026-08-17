import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, } from 'class-validator';
import { ProviderEnum, RoleEnum } from 'src/common/enums/userEnum';

export class CustomerSendOtpDto {
  @ApiProperty({
    description: 'Customer mobile phone number with country code',
    example: '+201012345678',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class CustomerVerifyOtpDto {
  @ApiProperty({
    description: 'Customer mobile phone number with country code',
    example: '+201012345678',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    description: '6-digit SMS verification code sent to the customer phone',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({
    description: 'Full name of the customer (optional on first-time profile creation)',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  userName?: string;

  @ApiPropertyOptional({
    description: 'Preferred player position on field (e.g., Striker, Midfielder, Goalkeeper)',
    example: 'Forward / Striker',
  })
  @IsString()
  @IsOptional()
  position?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL or file upload field (when uploading via multipart/form-data)',
    type: 'string',
    format: 'binary',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class DashboardLoginDto {
  @ApiProperty({
    description: 'Dashboard staff/admin email address',
    example: 'admin@sportsvenue.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Dashboard staff/admin password',
    example: 'Admin@123456',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateAdminDto {
  @ApiProperty({
    description: 'Work email address for the new administrator/manager',
    example: 'manager@sportsvenue.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Initial password (minimum 6 characters)',
    example: 'Pass@123456',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    description: 'Full name or username of the staff member',
    example: 'Ahmed Hassan',
  })
  @IsString()
  @IsNotEmpty()
  userName: string;

  @ApiPropertyOptional({
    description: 'Role assigned to the staff account',
    enum: RoleEnum,
    default: RoleEnum.admin,
    example: RoleEnum.manager,
  })
  @IsEnum(RoleEnum)
  @IsOptional()
  role?: RoleEnum;
}

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google OAuth ID Token obtained from Google Sign-In SDK on the client',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    description: 'User display name if provided by Google',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  userName?: string;

  @ApiPropertyOptional({
    description: 'User email address if provided by Google',
    example: 'user@gmail.com',
  })
  @IsString()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Identity provider type',
    enum: ProviderEnum,
    default: ProviderEnum.google,
    example: ProviderEnum.google,
  })
  @IsString()
  @IsOptional()
  provider?: ProviderEnum.google;
}
