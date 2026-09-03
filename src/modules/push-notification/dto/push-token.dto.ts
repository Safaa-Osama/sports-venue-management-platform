import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @ApiProperty({
    description: 'Expo Push Token (e.g. ExponentPushToken[xxxxxx])',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'Operating system / platform',
    example: 'android',
    enum: ['android', 'ios', 'web', 'unknown'],
  })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({
    description: 'User language preference',
    example: 'ar',
    enum: ['ar', 'en'],
  })
  @IsOptional()
  @IsIn(['ar', 'en'])
  locale?: string;
}

export class RemovePushTokenDto {
  @ApiProperty({
    description: 'Expo Push Token to remove from the authenticated user account',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
