import { Body, Controller, Get, Param, Patch, Post, Query, } from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { BookingService } from './booking.service';
import {
  CreateBookingDto, CreatePaymentDto, QueryBookingDto, UpdateBookingStatusDto,
} from './dto/booking.dto';
import type { UserDocument } from '../user/entities/user.entity';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @auth({ roles: [RoleEnum.customer, RoleEnum.user,RoleEnum.manager, RoleEnum.admin, RoleEnum.owner, RoleEnum.superAdmin] })
  async createBooking(
    @Body() body: CreateBookingDto,
    @User() user: UserDocument,
  ) {
    return await this.bookingService.createBooking(body, user);
  }

  @Post(':bookingId/pay')
  @auth({})
  async payBooking(
    @Param('bookingId') bookingId: string,
    @Body() body: CreatePaymentDto,
    @User() user: UserDocument,
  ) {
    return await this.bookingService.payBooking(bookingId, body, user);
  }

  @Get('my-bookings')
  @auth({ roles: [RoleEnum.customer, RoleEnum.user] })
  async getMyBookings(
    @Query() query: QueryBookingDto,
    @User() user: UserDocument,
  ) {
    return await this.bookingService.getMyBookings(user, query);
  }

  @Get('venue/:venueId')
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
  @auth({
    roles: [
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  async verifyBookingCode(@Param('bookingCode') bookingCode: string) {
    const verification = await this.bookingService.verifyBookingCode(
      bookingCode,
    );
    return {
      message: 'Booking code verified',
      data: verification,
    };
  }

  @Get(':id')
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
