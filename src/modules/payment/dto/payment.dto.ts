import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import {
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the booking reservation to pay for',
    example: '64e8b0a1f2b4c10012345680',
  })
  @IsMongoId()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty({
    description: 'Selected payment method',
    enum: PaymentMethodEnum,
    example: PaymentMethodEnum.paymob,
  })
  @IsEnum(PaymentMethodEnum)
  @IsNotEmpty()
  paymentMethod: PaymentMethodEnum;

  @ApiPropertyOptional({
    description: 'Optional discount coupon code',
    example: 'SUMMER2026',
  })
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class RefundPaymentDto {
  @ApiPropertyOptional({
    description: 'Specific partial refund amount (leave blank for full refund)',
    example: 250,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Reason for processing the refund',
    example: 'Customer requested cancellation due to weather condition',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryPaymentDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of payment records per page',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter payments by settlement status',
    enum: PaymentStatusEnum,
    example: PaymentStatusEnum.paid,
  })
  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  status?: PaymentStatusEnum;

  @ApiPropertyOptional({
    description: 'Filter payments by method used',
    enum: PaymentMethodEnum,
    example: PaymentMethodEnum.wallet,
  })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;
}

export class MarkCashPaidDto {
  @ApiPropertyOptional({
    description: 'Administrative note regarding the cash collection (e.g. collected at reception by staff)',
    example: 'Paid in cash at gate reception desk',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
