import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreatePaymentDto {
    @IsNotEmpty()
    @IsString()
    bookingId: string;

    @IsNotEmpty()
    @IsString()
    paymentMethod: string;

    @IsNotEmpty()
    @IsString()
    transactionId: string;

    @IsNotEmpty()
    @IsNumber()
    amount: number;

    @IsNotEmpty()
    @IsString()
    currency: string;

    @IsNotEmpty()
    @IsString()
    status: string;

    @IsNotEmpty()
    @IsString()
    provider: string;

    @IsNotEmpty()
    @IsString()
    paidAt: string;
}
