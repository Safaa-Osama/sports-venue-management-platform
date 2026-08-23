import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
ApiTags,
} from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { BookingService } from './booking.service';
import {
  CreateBookingDto,
  CreatePaymentDto,
  QueryBookingDto,
  UpdateBookingStatusDto,
} from './dto/booking.dto';
import type { UserDocument } from '../user/entities/user.entity';

@ApiTags('Bookings')
@ApiBearerAuth('JWT-auth')
@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}
  
  @Get('availability/:venueId')
  @ApiOperation({
    summary: 'Get Venue Availability',
    description: 'Returns a list of booked or held slots for a venue',
  })
  async getAvailability(
    @Param('venueId') venueId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return await this.bookingService.getAvailability(venueId, startDate, endDate);
  }

  @Post()
  @ApiOperation({
    summary: 'Create Venue Slot Booking',
    description:
      'Reserves an available time slot at the specified venue. Calculates pricing with custom hourly rates and coupons. Emits real-time WebSocket event `slot_locked`. Accepts an optional `idempotency-key` header to avoid duplicate bookings.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    description: 'Unique UUID idempotency key to prevent double reservations on network retries',
    required: false,
  })
  @ApiResponse({
    status: 201,
    description: 'Booking created successfully (pending or confirmed depending on payment method)',
    schema: {
      example: {
        success: true,
        statusCode: 201,
        message: 'done',
        data: {
          _id: '64e8b0a1f2b4c10012345680',
          venueId: '64e8b0a1f2b4c10012345678',
          userId: '64e8b0a1f2b4c10012345679',
          date: '2026-08-20',
          startTime: 18,
          endTime: 20,
          totalPrice: 500,
          discountAmount: 50,
          finalPrice: 450,
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentMethod: 'wallet',
          bookingCode: 'BK7890',
          qrCode: 'data:image/png;base64,...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Slot is already booked or invalid time range' })
  @auth({
    roles: [
      RoleEnum.customer,
      RoleEnum.user,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.owner,
      RoleEnum.superAdmin,
    ],
  })
  async createBooking(
    @Body() body: CreateBookingDto,
    @User() user: UserDocument,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    const effectiveIdempotencyKey = idempotencyHeader || body.idempotencyKey;
    return await this.bookingService.createBooking(
      body,
      user,
      effectiveIdempotencyKey,
    );
  }

  @Post(':bookingId/pay')
  @ApiOperation({
    summary: 'Pay for a Pending Booking Slot',
    description:
      'Initiates payment for an existing unpaid reservation via wallet, Paymob, or cash at venue.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking MongoDB ID', example: '64e8b0a1f2b4c10012345680' })
  @ApiResponse({ status: 200, description: 'Booking paid successfully' })
  @ApiResponse({ status: 400, description: 'Booking already paid, expired, or insufficient wallet balance' })
  @auth({})
  async payBooking(
    @Param('bookingId') bookingId: string,
    @Body() body: CreatePaymentDto,
    @User() user: UserDocument,
  ) {
    return await this.bookingService.payBooking(bookingId, body, user);
  }

  @Get('my-bookings')
  @ApiOperation({
    summary: 'Get Customer Booking History',
    description: 'Returns a paginated list of reservations belonging to the authenticated customer.',
  })
  @ApiResponse({ status: 200, description: 'List of customer bookings' })
  @auth({ roles: [RoleEnum.customer, RoleEnum.user] })
  async getMyBookings(
    @Query() query: QueryBookingDto,
    @User() user: UserDocument,
  ) {
    return await this.bookingService.getMyBookings(user, query);
  }

  @Get('venue/:venueId')
  @ApiOperation({
    summary: 'Get Venue Bookings (Owner / Admin / Manager)',
    description: 'Retrieves all slot bookings for a specific venue with pagination, date, and status filters.',
  })
  @ApiParam({ name: 'venueId', description: 'Venue MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({ status: 200, description: 'List of venue bookings' })
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  async getVenueBookings(
    @Param('venueId') venueId: string,
    @Query() query: QueryBookingDto,
  ) {
    return await this.bookingService.getVenueBookings(venueId, query);
  }

  @Get('verify/:bookingCode')
  @ApiOperation({
    summary: 'Verify Booking via 6-Character Booking Code / QR (Owner / Admin / Manager)',
    description:
      'Validates a booking code presented by a customer at the venue gate and checks ticket validity.',
  })
  @ApiParam({ name: 'bookingCode', description: '6-character code (e.g. BK7890)', example: 'BK7890' })
  @ApiResponse({ status: 200, description: 'Booking verified successfully' })
  @ApiResponse({ status: 404, description: 'Invalid booking code' })
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  async verifyBookingCode(@Param('bookingCode') bookingCode: string) {
    const verification =
      await this.bookingService.verifyBookingCode(bookingCode);
    return {
      message: 'Booking code verified',
      data: verification,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Booking Details by ID',
    description: 'Retrieves comprehensive reservation details, including QR code, slot time, pricing, and venue information.',
  })
  @ApiParam({ name: 'id', description: 'Booking MongoDB ID', example: '64e8b0a1f2b4c10012345680' })
  @ApiResponse({ status: 200, description: 'Booking details retrieved' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
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
  async getBookingById(@Param('id') id: string, @User() user: any) {
    const booking = await this.bookingService.getBookingById(id, user);
    return {
      message: 'Booking details retrieved successfully',
      data: booking,
    };
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel Booking & Process Refund',
    description:
      'Cancels an active booking, unlocks the slot (emitting `slot_released`), and processes automatic wallet refund if applicable.',
  })
  @ApiParam({ name: 'id', description: 'Booking MongoDB ID', example: '64e8b0a1f2b4c10012345680' })
  @ApiResponse({ status: 200, description: 'Booking cancelled and slot released' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed or expired bookings' })
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
  async cancelBooking(@Param('id') id: string, @User() user: any) {
    const cancelledBooking = await this.bookingService.cancelBooking(id, user);
    return {
      message: 'Booking cancelled successfully',
      data: cancelledBooking,
    };
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update Booking Status (Owner / Admin / Manager)',
    description: 'Manually adjusts booking lifecycle status (confirmed, completed, cancelled) or payment status.',
  })
  @ApiParam({ name: 'id', description: 'Booking MongoDB ID', example: '64e8b0a1f2b4c10012345680' })
  @ApiResponse({ status: 200, description: 'Booking status updated successfully' })
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateBookingStatusDto,
  ) {
    const updatedBooking = await this.bookingService.updateStatus(
      id,
      updateDto,
    );
    return {
      message: 'Booking status updated successfully',
      data: updatedBooking,
    };
  }
}
