import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactStatusEnum } from '../entities/contact.entity';

export class CreateContactDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  name: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone must be a string' })
  phone: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  campaignType?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateContactStatusDto {
  @IsNotEmpty()
  @IsEnum(ContactStatusEnum)
  status: ContactStatusEnum;
}

export class QueryContactDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ContactStatusEnum)
  status?: ContactStatusEnum;

  @IsOptional()
  @IsString()
  search?: string;
}
