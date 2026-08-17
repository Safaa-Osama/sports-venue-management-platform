import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';

export class CreateAmenitiesDto {
  @ApiProperty({
    description: 'Unique name of the amenity (e.g. WiFi, Parking, Showers)',
    example: 'WiFi',
  })
  @IsString()
  @IsNotEmpty()
  amenityName: string;

  @ApiPropertyOptional({
    description: 'URL or icon identifier for the amenity',
    example: 'https://cdn.example.com/icons/wifi.svg',
  })
  @IsString()
  @IsOptional()
  iconUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether the amenity is active and available',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

@AtLeastOne(['amenityName', 'iconUrl', 'isActive'])
export class UpdateAmenitiesDto extends PartialType(CreateAmenitiesDto) {}

export class QueryAmenitiesDto {
  @ApiPropertyOptional({
    description: 'Filter amenities by active status (true/false)',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search amenities by name (case-insensitive search)',
    example: 'wifi',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
