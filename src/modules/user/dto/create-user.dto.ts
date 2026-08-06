import { Type } from "class-transformer";
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";
import { GenderEnum, ProviderEnum, RoleEnum } from "src/common/enums/userEnum";

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    phone: string

    @IsEnum(RoleEnum)
    @IsOptional()
    role: RoleEnum

    @IsEnum(ProviderEnum)
    @IsOptional()
    provider: ProviderEnum

    @IsNumber()
    @Type(() => Number)
    @IsPositive()
    @Min(18, { message: "age cannot be less than 18 years old" })
    @IsOptional()
    age: number

    @IsEnum(GenderEnum)
    @IsOptional()
    gender: GenderEnum

    @IsString()
    @IsOptional()
    avatar: string

    @IsNumber()
    @IsOptional()
    walletBalance: number

    @Type(()=>Date)
    @IsDate()
    @IsOptional()
    birthDate: Date
}
