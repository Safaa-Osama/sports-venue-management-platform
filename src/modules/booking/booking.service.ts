import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { BookingStatusEnum, PaymentStatusEnum } from 'src/common/enums/bookingEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { CreateBookingDto, QueryBookingDto, UpdateBookingStatusDto } from './dto/booking.dto';

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepo: BookingRepo,
    private readonly venueRepo: VenueRepo,
  ) {}

  async create(createBookingDto: CreateBookingDto, user: any) {
    const { venueId, date, startTime, endTime } = createBookingDto;

    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be strictly less than endTime');
    }

    // 1. Fetch Venue
    const venue = await this.venueRepo.findById(venueId);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    if (!venue.isActive) {
      throw new BadRequestException('Venue is currently inactive');
    }

    // 2. Validate Venue Working Hours
    if (startTime < venue.startWorkingHours || endTime > venue.endWorkingHours) {
      throw new BadRequestException(
        `Booking hours must be between venue operating hours (${venue.startWorkingHours}:00 - ${venue.endWorkingHours}:00)`,
      );
    }

    const bookingDate = new Date(date);
    const startOfDay = new Date(bookingDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(bookingDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 3. Check for Overlapping Bookings
    const existingBookings = await this.bookingRepo.find({
      filter: {
        venueId: venue._id,
        date: { $gte: startOfDay, $lte: endOfDay },
        status: { $ne: BookingStatusEnum.cancelled },
        $or: [
          { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
        ],
      },
    });

    if (existingBookings.length > 0) {
      throw new ConflictException('Selected time slot is already booked for this venue');
    }

    // 4. Calculate Total Price
    let totalPrice = 0;
    const durationHours = endTime - startTime;

    if (venue.customHourPrices && venue.customHourPrices.length > 0) {
      for (let hour = startTime; hour < endTime; hour++) {
        const customPrice = venue.customHourPrices.find((c) => c.hour === hour);
        if (customPrice && customPrice.pricePerHour > 0) {
          totalPrice += customPrice.pricePerHour;
        } else {
          totalPrice += venue.defaultHourPrice;
        }
      }
    } else {
      totalPrice = venue.defaultHourPrice * durationHours;
    }

    // 5. Auto-generate bookingCode & QR Code
    const bookingCode = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const qrPayload = JSON.stringify({
      bookingCode,
      venueId: venue._id,
      userId: user._id,
      date: startOfDay.toISOString(),
      startTime,
      endTime,
    });

    const qrCode = await QRCode.toDataURL(qrPayload);

    // 6. Save Booking
    const newBooking = await this.bookingRepo.create({
      userId: user._id,
      venueId: venue._id,
      date: startOfDay,
      startTime,
      endTime,
      totalPrice,
      status: BookingStatusEnum.pending,
      paymentStatus: PaymentStatusEnum.unpaid,
      bookingCode,
      qrCode,
    });

    return newBooking;
  }

  async getMyBookings(user: any, query: QueryBookingDto) {
    const { page, limit, status, paymentStatus, date } = query;
    const search: any = { userId: user._id };

    if (status) {
      search.status = status;
    }
    if (paymentStatus) {
      search.paymentStatus = paymentStatus;
    }
    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      endOfDay.setUTCHours(23, 59, 59, 999);
      search.date = { $gte: startOfDay, $lte: endOfDay };
    }

    return this.bookingRepo.paginate({
      page,
      limit,
      search,
      sort: { createdAt: -1 },
      populate: { path: 'venueId', select: 'venueName address images defaultHourPrice' },
    });
  }

  async getVenueBookings(venueId: string, query: QueryBookingDto) {
    const venue = await this.venueRepo.findById(venueId);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const { page, limit, status, paymentStatus, date } = query;
    const search: any = { venueId: venue._id };

    if (status) {
      search.status = status;
    }
    if (paymentStatus) {
      search.paymentStatus = paymentStatus;
    }
    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      endOfDay.setUTCHours(23, 59, 59, 999);
      search.date = { $gte: startOfDay, $lte: endOfDay };
    }

    return this.bookingRepo.paginate({
      page,
      limit,
      search,
      sort: { createdAt: -1 },
      populate: { path: 'userId', select: 'name email phone' },
    });
  }

  async getBookingById(id: string, user: any) {
    const booking = await this.bookingRepo.findOne({
      filter: { _id: id },
      options: {
        populate: [
          { path: 'venueId', select: 'venueName address images' },
          { path: 'userId', select: 'name email phone' },
        ],
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isOwner = booking.userId?._id?.toString() === user._id.toString() || booking.userId?.toString() === user._id.toString();
    const isStaffOrAdmin = [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager].includes(
      user.role,
    );

    if (!isOwner && !isStaffOrAdmin) {
      throw new UnauthorizedException('You do not have permission to view this booking');
    }

    return booking;
  }

  async cancelBooking(id: string, user: any) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isOwner = booking.userId.toString() === user._id.toString();
    const isStaffOrAdmin = [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager].includes(
      user.role,
    );

    if (!isOwner && !isStaffOrAdmin) {
      throw new UnauthorizedException('You do not have permission to cancel this booking');
    }

    if (booking.status === BookingStatusEnum.cancelled) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatusEnum.completed) {
      throw new BadRequestException('Completed bookings cannot be cancelled');
    }

    const updateData: any = { status: BookingStatusEnum.cancelled };
    if (booking.paymentStatus === PaymentStatusEnum.paid) {
      updateData.paymentStatus = PaymentStatusEnum.refunded;
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: updateData,
    });

    return updatedBooking;
  }

  async updateStatus(id: string, updateDto: UpdateBookingStatusDto) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const updateData: any = {};
    if (updateDto.status) updateData.status = updateDto.status;
    if (updateDto.paymentStatus) updateData.paymentStatus = updateDto.paymentStatus;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No status fields provided to update');
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: updateData,
    });

    return updatedBooking;
  }

  async verifyBookingCode(bookingCode: string) {
    const booking = await this.bookingRepo.findOne({
      filter: { bookingCode },
      options: {
        populate: [
          { path: 'venueId', select: 'venueName address' },
          { path: 'userId', select: 'name email phone' },
        ],
      },
    });

    if (!booking) {
      throw new NotFoundException('Invalid booking code or QR code');
    }

    return {
      valid: booking.status !== BookingStatusEnum.cancelled,
      booking,
    };
  }
}
