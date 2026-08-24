import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDate, IsEnum, IsIn, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min, registerDecorator, ValidateNested, ValidationArguments, ValidationOptions } from 'class-validator';
import { AdvertisementPositionEnum, AdvertisementStatusEnum } from 'src/common/enums/advertisementEnum';
import { IsAfterOrEqualDate } from 'src/common/decorator/ad.decorator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';



export class CreateAdvertisementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'linkUrl must be a valid URL with http or https protocol' },
  )
  @IsOptional()
  linkUrl?: string;

  @IsEnum(AdvertisementPositionEnum, {
    message: `position must be one of: ${Object.values(AdvertisementPositionEnum).join(', ')}`,
  })
  @IsNotEmpty()
  position: AdvertisementPositionEnum;

  @IsEnum(AdvertisementStatusEnum, {
    message: `status must be one of: ${Object.values(AdvertisementStatusEnum).join(', ')}`,
  })
  @IsOptional()
  status?: AdvertisementStatusEnum;

  @IsDate({ message: 'startDate must be a valid date' })
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @IsDate({ message: 'endDate must be a valid date' })
  @Type(() => Date)
  @IsAfterOrEqualDate('startDate', {
    message: 'endDate cannot be before startDate',
  })
  @IsOptional()
  endDate?: Date;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  displayDuration?: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  durationMinutes?: number;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  priority?: number;
}

@AtLeastOne(["title", "description", "linkUrl", "position", "status", "startDate", "endDate", "displayDuration", "durationMinutes", "priority"])
export class UpdateAdvertisementDto extends PartialType(
  CreateAdvertisementDto,
) {}

export class QueryAdvertisementDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(AdvertisementStatusEnum)
  status?: AdvertisementStatusEnum;

  @IsOptional()
  @IsEnum(AdvertisementPositionEnum)
  position?: AdvertisementPositionEnum;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc', '1', '-1'])
  sortOrder?: string = 'desc';
}

export class GetDashboardAdvertisementsDto {
  @IsOptional()
  @IsEnum(AdvertisementPositionEnum, {
    message: `position must be one of: ${Object.values(AdvertisementPositionEnum).join(', ')}`,
  })
  position?: AdvertisementPositionEnum;
}

export class UpdateAdvertisementStatusDto {
  @IsEnum(AdvertisementStatusEnum, {
    message: `status must be one of: ${Object.values(AdvertisementStatusEnum).join(', ')}`,
  })
  @IsNotEmpty()
  status: AdvertisementStatusEnum;
}

export class UpdateAdvertisementPriorityDto {
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  priority: number;
}

export class ScheduleAdvertisementDto {
  @IsDate({ message: 'startDate must be a valid date' })
  @Type(() => Date)
  @IsNotEmpty()
  startDate: Date;

  @IsDate({ message: 'endDate must be a valid date' })
  @Type(() => Date)
  @IsAfterOrEqualDate('startDate', {
    message: 'endDate cannot be before startDate',
  })
  @IsOptional()
  endDate?: Date;
}

export class ReorderItemDto {
  @IsMongoId({ message: 'id must be a valid MongoDB ObjectId' })
  @IsNotEmpty()
  id: string;

  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  priority: number;
}

export class BulkReorderAdvertisementDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'items array cannot be empty' })
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
