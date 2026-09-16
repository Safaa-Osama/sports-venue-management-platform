import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminSendNotificationDto {
  @ApiProperty({
    description: 'Notification title in Arabic',
    example: 'عرض خاص على ملاعب سان سيرو',
  })
  @IsString()
  @IsNotEmpty()
  titleAr: string;

  @ApiPropertyOptional({
    description: 'Notification title in English',
    example: 'Special Offer at San Siro Pitches',
  })
  @IsOptional()
  @IsString()
  titleEn?: string;

  @ApiProperty({
    description: 'Notification message body in Arabic',
    example: 'احجز الآن واحصل على خصم 20% على حجزك القادم!',
  })
  @IsString()
  @IsNotEmpty()
  bodyAr: string;

  @ApiPropertyOptional({
    description: 'Notification message body in English',
    example: 'Book now and get 20% off on your next match!',
  })
  @IsOptional()
  @IsString()
  bodyEn?: string;

  @ApiProperty({
    description: 'Target audience',
    enum: ['all', 'guests', 'customers', 'specific_users'],
    default: 'all',
  })
  @IsIn(['all', 'guests', 'customers', 'specific_users'])
  targetType: string;

  @ApiPropertyOptional({
    description: 'List of target customer user IDs when targetType is specific_users',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  customerIds?: string[];

  @ApiPropertyOptional({
    description: 'Actionable deep-link target',
    enum: ['none', 'pitch', 'bookings', 'profile', 'promo'],
    default: 'none',
  })
  @IsOptional()
  @IsString()
  deepLinkType?: string;

  @ApiPropertyOptional({
    description: 'Venue ID if deepLinkType is pitch',
  })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({
    description: 'Optional custom deep-link route',
  })
  @IsOptional()
  @IsString()
  customRoute?: string;
}

export class QueryNotificationDto {
  @ApiPropertyOptional({
    description: 'Filter by read status',
    enum: ['all', 'unread', 'read'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'unread', 'read'])
  filter?: 'all' | 'unread' | 'read';

  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
  })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Limit items per page',
    default: 50,
  })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'JSON array or comma-separated guest read IDs',
  })
  @IsOptional()
  @IsString()
  guestReadIds?: string;

  @ApiPropertyOptional({
    description: 'JSON array or comma-separated guest deleted IDs',
  })
  @IsOptional()
  @IsString()
  guestDeletedIds?: string;
}

export class QueryAdminNotificationHistoryDto {
  @ApiPropertyOptional({
    description: 'Filter by start date (YYYY-MM-DD or ISO string)',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by end date (YYYY-MM-DD or ISO string)',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by target type',
    enum: ['all', 'guests', 'customers', 'specific_users'],
  })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({
    description: 'Search query in title or body',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
  })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Limit items per page',
    default: 50,
  })
  @IsOptional()
  limit?: number;
}
