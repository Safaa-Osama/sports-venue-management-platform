import { Type } from "class-transformer";
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";
import { GenderEnum, ProviderEnum, RoleEnum } from "src/common/enums/userEnum";

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    userName: string;

    @IsString()
    @IsNotEmpty()
    phone: string[]

    @IsEnum(RoleEnum)
    @IsOptional()
    role: RoleEnum

    @IsString()
    @IsOptional()
    avatar: string

    @IsNumber()
    @IsOptional()
    walletBalance: number

    @IsString()
    @IsOptional()
    position: string
}
