import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import type { UserDocument } from '../user/entities/user.entity';
import {
  CreatePaymentDto,
  MarkCashPaidDto,
  QueryPaymentDto,
  RefundPaymentDto,
} from './dto/payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Initiate Payment for Booking',
    description:
      'Creates a payment transaction for an existing booking using either digital wallet balance, cash on venue, or returns Paymob checkout URL/iframe details for card payment.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment initiated / completed successfully',
    schema: {
      example: {
        success: true,
        statusCode: 201,
        message: 'done',
        data: {
          _id: '64e8b0a1f2b4c10012345690',
          bookingId: '64e8b0a1f2b4c10012345680',
          amount: 450,
          paymentMethod: 'wallet',
          status: 'paid',
          referenceId: 'TXN-123456',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Booking already paid, expired, or insufficient balance' })
  @auth({
    roles: [
      RoleEnum.customer,
      RoleEnum.user,
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  createPayment(@Body() body: CreatePaymentDto, @User() user: UserDocument) {
    return this.paymentService.createPayment(body, user);
  }

  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get All Payments / Paymob Transactions (Admin / Owner / Manager)',
    description: 'Retrieves all financial transactions across venues with date range and status filters.',
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter end date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'paymentMethod', required: false, description: 'e.g. paymob, wallet, cash' })
  @ApiQuery({ name: 'status', required: false, description: 'paid, pending, partially_paid, refunded, failed' })
  @ApiQuery({ name: 'search', required: false, description: 'Search transaction ID or reference' })
  @ApiResponse({ status: 200, description: 'Payments list retrieved successfully' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  getAllPayments(
    @Query() query: QueryPaymentDto & { startDate?: string; endDate?: string; search?: string },
  ) {
    return this.paymentService.getAllPayments(query);
  }

  @Get('my-payments')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Customer Payment History',
    description: 'Returns all payment transactions belonging to the currently logged in customer.',
  })
  @ApiResponse({ status: 200, description: 'Customer payment history retrieved' })
  @auth({ roles: [RoleEnum.customer, RoleEnum.user] })
  getMyPayments(@User() user: UserDocument, @Query() query: QueryPaymentDto) {
    return this.paymentService.getMyPayments(user, query);
  }

  @Get('venue/:venueId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Venue Payments (Owner / Admin / Manager)',
    description: 'Retrieves all financial transactions and payment records for a specific sports venue.',
  })
  @ApiParam({ name: 'venueId', description: 'Venue MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({ status: 200, description: 'Venue payments list retrieved' })
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  getVenuePayments(
    @Param('venueId') venueId: string,
    @Query() query: QueryPaymentDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.getVenuePayments(venueId, query, user);
  }

  @Get(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Payment Details by ID',
    description: 'Retrieves single transaction information by payment ID.',
  })
  @ApiParam({ name: 'id', description: 'Payment MongoDB ID', example: '64e8b0a1f2b4c10012345690' })
  @ApiResponse({ status: 200, description: 'Payment transaction details retrieved' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @auth({})
  getPaymentById(@Param('id') id: string, @User() user: UserDocument) {
    return this.paymentService.getPaymentById(id, user);
  }

  @Patch(':id/mark-cash-paid')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Mark Cash as Paid (Owner / Admin / Manager)',
    description:
      'Settles an on-venue cash booking by marking the payment as paid once the customer pays reception.',
  })
  @ApiParam({ name: 'id', description: 'Payment MongoDB ID', example: '64e8b0a1f2b4c10012345690' })
  @ApiResponse({ status: 200, description: 'Payment marked as paid and booking confirmed' })
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  markCashPaid(
    @Param('id') id: string,
    @Body() body: MarkCashPaidDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.markCashPaid(id, body, user);
  }

  @Post(':id/refund')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Refund Payment (Owner / Admin / Manager)',
    description: 'Processes a full or partial refund back to customer wallet or gateway source.',
  })
  @ApiParam({ name: 'id', description: 'Payment MongoDB ID', example: '64e8b0a1f2b4c10012345690' })
  @ApiResponse({ status: 200, description: 'Refund processed successfully' })
  @ApiResponse({ status: 400, description: 'Payment already refunded or invalid amount' })
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  refundPayment(
    @Param('id') id: string,
    @Body() body: RefundPaymentDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.refundPayment(id, body, user);
  }

  @Post('webhook/paymob')
  @Get('webhook/paymob')
  @UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false, transform: false }))
  @ApiOperation({
    summary: 'Paymob Payment Gateway Webhook & Redirection Callback (Public)',
    description:
      'Unprotected public webhook callback from Paymob (accepts POST & GET). Handles both Intention API format ({ intention, transaction, hmac }) and Legacy API format ({ type, obj }).',
  })
  @ApiHeader({ name: 'hmac', description: 'Paymob HMAC signature header', required: false })
  @ApiQuery({ name: 'hmac', description: 'Paymob HMAC signature query parameter', required: false })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handlePaymobWebhook(
    @Req() req: Request,
    @Query('hmac') hmacQuery?: string,
    @Headers('hmac') hmacHeader?: string,
  ) {
    const rawQuery = (req.query as Record<string, any>) || {};
    const rawBody = (req.body as Record<string, any>) || {};
    const rawHeaders = (req.headers as Record<string, any>) || {};

    // Extract HMAC from all possible locations:
    // - Intention API: body.hmac
    // - Legacy API: query param ?hmac= or header hmac / x-paymob-signature
    const extractedHmac =
      rawBody?.hmac ||
      hmacQuery ||
      rawQuery?.hmac ||
      rawQuery?.HMAC ||
      hmacHeader ||
      rawHeaders?.['x-paymob-signature'] ||
      rawHeaders?.['hmac'] ||
      rawBody?.obj?.hmac;

    // Detect payload format and build unified payload for the service
    // Intention API format: { intention, transaction, hmac, paymob_request_id, partner_digest }
    // Legacy API format:    { type, obj: { ...transaction fields } }
    const isIntentionApi = Boolean(rawBody?.transaction && rawBody?.intention);
    const isLegacyApi = Boolean(rawBody?.obj || rawBody?.type === 'TRANSACTION');

    console.log('📩 [Paymob Webhook Controller] Incoming Request:', {
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      format: isIntentionApi ? 'INTENTION_API' : isLegacyApi ? 'LEGACY_API' : 'UNKNOWN',
      bodyKeys: Object.keys(rawBody),
      queryKeys: Object.keys(rawQuery),
      extractedHmac: extractedHmac ? `${extractedHmac.slice(0, 12)}...` : 'NONE',
    });

    // Pass the raw body directly — let the service layer handle format detection
    // This preserves the nested structure (transaction, intention, obj) needed for HMAC
    return await this.paymentService.handlePaymobWebhook(
      rawBody,
      extractedHmac,
    );
  }
}
