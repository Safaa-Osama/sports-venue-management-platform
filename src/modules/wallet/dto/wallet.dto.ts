import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString,IsEnum,IsInt,IsMongoId,IsNotEmpty,IsNumber, IsOptional, IsString, Max, Min, } from 'class-validator';
import { TransactionTypeEnum } from 'src/common/enums/walletEnum';

export class CreateWalletDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the user account to attach this wallet to',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsMongoId()
  @IsNotEmpty()
  userId: string;
}

export class DepositWalletDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the target customer receiving the deposit',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsMongoId({ message: 'Target user ID must be a valid MongoDB ObjectId' })
  @IsNotEmpty({ message: 'Target user ID is required for deposit' })
  userId: string;

  @ApiProperty({
    description: 'Top-up deposit amount (minimum 100)',
    example: 500,
    minimum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(100, { message: 'Deposit amount must be at least 100' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Note or reason for deposit',
    example: 'Cash deposit at reception',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'External payment reference or bank transfer ID',
    example: 'TXN-BANK-998822',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class UserDeductWalletDto {
  @ApiProperty({
    description: 'Amount to deduct from wallet',
    example: 200,
    minimum: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Deduction amount must be at least 1' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Reason for spending/deduction',
    example: 'Equipment rental purchase',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Reference transaction identifier',
    example: 'REF-887711',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class AdminDeductWalletDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the target user',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Amount to deduct from user wallet balance',
    example: 150,
    minimum: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Deduction amount must be at least 1' })
  amount: number;

  @ApiProperty({
    description: 'Mandatory reason for admin manual deduction',
    example: 'Penalty adjustment for venue property damage',
  })
  @IsNotEmpty({ message: 'Description is required for admin deductions' })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    description: 'Internal audit or incident reference ID',
    example: 'AUDIT-INC-001',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class DeductWalletDto {
  @ApiPropertyOptional({
    description: 'Target user ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiProperty({
    description: 'Amount to deduct',
    example: 100,
    minimum: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Deduction amount must be at least 1' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Description of deduction',
    example: 'Manual deduction',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Reference ID',
    example: 'REF-001',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class GetTransactionsDto {
  @ApiPropertyOptional({
    description: 'Filter transactions by specific user MongoDB ID (Admins only)',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

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
    description: 'Number of transactions per page (max 100)',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter transactions by operation type',
    enum: TransactionTypeEnum,
    example: TransactionTypeEnum.BOOKING_PAYMENT,
  })
  @IsOptional()
  @IsEnum(TransactionTypeEnum)
  type?: TransactionTypeEnum;

  @ApiPropertyOptional({
    description: 'Filter transactions starting from date (YYYY-MM-DD)',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter transactions ending at date (YYYY-MM-DD)',
    example: '2026-08-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
