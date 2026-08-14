import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { TransactionTypeEnum } from 'src/common/enums/walletEnum';

export class CreateWalletDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;
}

export class DepositWalletDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(100, { message: 'Deposit amount must be at least 100' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class UserDeductWalletDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Deduction amount must be at least 1' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class AdminDeductWalletDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Deduction amount must be at least 1' })
  amount: number;

  @IsNotEmpty({ message: 'Description is required for admin deductions' })
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class DeductWalletDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Deduction amount must be at least 1' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class GetTransactionsDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(TransactionTypeEnum)
  type?: TransactionTypeEnum;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
