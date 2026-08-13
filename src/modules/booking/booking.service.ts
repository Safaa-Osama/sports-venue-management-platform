import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException, } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { BookingStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from 'src/common/enums/bookingEnum';
import { CouponEnum } from 'src/common/enums/couponEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import { CouponRepo } from 'src/common/reposetories/coupon-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { UserDocument } from '../user/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { BookingGateway } from './booking.gateway';
import { CreateBookingDto, CreatePaymentDto, QueryBookingDto, UpdateBookingStatusDto, } from './dto/booking.dto';

const HOLD_DURATION_MINUTES = 15;
const CANCELLATION_DEADLINE_HOURS = 24;


@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepo: BookingRepo,
    private readonly venueRepo: VenueRepo,
    private readonly walletService: WalletService,
    private readonly couponRepo: CouponRepo,
    private readonly bookingGateway: BookingGateway,
  ) { }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanExpiredBookings() {
    const now = new Date();
    const expiredBookings = await this.bookingRepo.find({
      filter: {
        status: BookingStatusEnum.pending,
        expiresAt: { $lte: now },
      },
    });

    for (const booking of expiredBookings) {
      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          status: BookingStatusEnum.expired,
        },
      });

      this.bookingGateway.emitSlotReleased(booking);
    }
  }


  async createBooking(body: CreateBookingDto, user: UserDocument) {
    const { venueId, date, startTime, endTime, couponCode, paymentMethod } = body;

    const venue = await this.venueRepo.findById(venueId);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    if (!venue.isActive) {
      throw new BadRequestException('Venue is currently inactive');
    }

    if (startTime < venue.startWorkingHours || endTime > venue.endWorkingHours) {
      throw new BadRequestException(
        `Booking hours must be between venue operating hours (${venue.startWorkingHours}:00 - ${venue.endWorkingHours}:00)`,
      );
    }

    const now = new Date();
    const existingBookings = await this.bookingRepo.find({
      filter: {
        venueId: venue._id,
        date: new Date(date),
        status: { $in: [BookingStatusEnum.confirmed, BookingStatusEnum.pending] },
        $or: [
          { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
        ],
      },
    });

    const validOverlaps = existingBookings.filter((b) => {
      if (b.status === BookingStatusEnum.pending && b.expiresAt && new Date(b.expiresAt) <= now) {
        return false;
      }
      return true;
    });

    if (validOverlaps.length > 0) {
      throw new ConflictException('Selected time slot is already booked or reserved for this venue');
    }

    let totalPrice = 0;
    const durationHours = endTime - startTime;

    if (venue.customHourPrices && venue.customHourPrices.length > 0) {
      for (let hour = startTime; hour < endTime; hour++) {
        const customPrice = venue.customHourPrices.find((c) => c.hour === hour);
        if (customPrice && typeof customPrice.pricePerHour === 'number' && customPrice.pricePerHour >= 0) {
          totalPrice += customPrice.pricePerHour;
        } else {
          totalPrice += venue.defaultHourPrice;
        }
      }
    } else {
      totalPrice = venue.defaultHourPrice * durationHours;
    }

    let discountAmount = 0;
    let finalPrice = totalPrice;

    if (couponCode) {
      const coupon = await this.couponRepo.findOne({
        filter: { code: couponCode.toLowerCase() },
      });

      if (!coupon) {
        throw new NotFoundException('Invalid coupon code');
      }

      if (!coupon.isActive) {
        throw new BadRequestException('Coupon is inactive');
      }

      if (coupon.usesCount >= coupon.maxUses) {
        throw new BadRequestException('Coupon maximum usage limit reached');
      }

      if (now < new Date(coupon.startDate) || now > new Date(coupon.endDate)) {
        throw new BadRequestException('Coupon is expired or not valid yet');
      }

      if (coupon.discountType === CouponEnum.percentage) {
        discountAmount = (totalPrice * coupon.discount) / 100;
      } else {
        discountAmount = coupon.discount;
      }

      discountAmount = Math.min(discountAmount, totalPrice);
      finalPrice = Math.max(0, totalPrice - discountAmount);
    }
    const expiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000);

    const bookingCode = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const qrPayload = JSON.stringify({
      bookingCode,
      venueId: venue._id,
      userId: user._id,
      date,
      startTime,
      endTime,
    });

    const qrCode = await QRCode.toDataURL(qrPayload);

    const booking = await this.bookingRepo.create({
      userId: user._id,
      venueId: venue._id,
      date: new Date(date),
      startTime,
      endTime,
      totalPrice,
      discountAmount: Number(discountAmount.toFixed(2)),
      finalPrice: Number(finalPrice.toFixed(2)),
      couponCode: couponCode ? couponCode.toLowerCase() : undefined,
      status: BookingStatusEnum.pending,
      paymentStatus: PaymentStatusEnum.unpaid,
      paymentMethod,
      expiresAt,
      bookingCode,
      qrCode,
    });

    this.bookingGateway.emitSlotLocked(booking);
    if (venue.createdBy) {
      this.bookingGateway.emitOwnerNotification(venue.createdBy.toString(), booking, 'NEW_PENDING_BOOKING');
    }

    const paymentResult = await this.payBooking(
      booking._id.toString(),
      { paymentMethod, couponCode },
      user,
    );

    const latestBooking = await this.bookingRepo.findById(booking._id);

    return {
      booking: latestBooking || booking,
      payment: paymentResult,
    };
  }


  async payBooking(bookingId: string, body: CreatePaymentDto, user: UserDocument) {
    const { paymentMethod, couponCode } = body;


    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId.toString() !== user._id.toString()) {
      throw new UnauthorizedException('You do not have permission to pay for this booking');
    }

    if (booking.status === BookingStatusEnum.cancelled || booking.status === BookingStatusEnum.expired) {
      throw new BadRequestException('Booking is expired or cancelled and cannot be paid');
    }

    if (booking.paymentStatus === PaymentStatusEnum.paid) {
      throw new BadRequestException('Booking is already paid');
    }

    const now = new Date();
    if (booking.expiresAt && new Date(booking.expiresAt) <= now && booking.status === BookingStatusEnum.pending) {
      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: { status: BookingStatusEnum.expired },
      });
      this.bookingGateway.emitSlotReleased(booking);
      throw new BadRequestException('Booking hold has expired. Please create a new booking request.');
    }

    const amountToPay = booking.finalPrice ?? booking.totalPrice;
    const activeCouponCode = couponCode || booking.couponCode;

    if (paymentMethod === PaymentMethodEnum.wallet) {
      await this.walletService.payForBooking(user._id, amountToPay, booking._id.toString());

      const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.paid,
          paymentMethod: PaymentMethodEnum.wallet,
          expiresAt: null,
        },
      });

      if (activeCouponCode) {
        const coupon = await this.couponRepo.findOne({ filter: { code: activeCouponCode.toLowerCase() } });
        if (coupon) {
          coupon.usesCount += 1;
          await coupon.save();
        }
      }

      this.bookingGateway.emitBookingConfirmed(updatedBooking);
      return updatedBooking;
    }

    if (paymentMethod === PaymentMethodEnum.cash) {
      const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.pay_at_venue,
          paymentMethod: PaymentMethodEnum.cash,
          expiresAt: null,
        },
      });

      if (activeCouponCode) {
        const coupon = await this.couponRepo.findOne({ filter: { code: activeCouponCode.toLowerCase() } });
        if (coupon) {
          coupon.usesCount += 1;
          await coupon.save();
        }
      }

      this.bookingGateway.emitBookingConfirmed(updatedBooking);
      return updatedBooking;
    }

    if (paymentMethod === PaymentMethodEnum.paymob) {
      return {
        message: 'Paymob checkout session initiated',
        bookingId: booking._id,
        amountToPay,
        currency: 'EGP',
        status: booking.status,
      };
    }

    throw new BadRequestException('Unsupported payment method');
  }

  // ai not me (all get apis)
  async getMyBookings(user: UserDocument, query: QueryBookingDto) {
    const { page, limit, status, paymentStatus, date } = query;
    const search: Types.ObjectId | any = { userId: user._id };

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
          { path: 'userId', select: 'name phone' },
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

    // Cancellation window check (24 hours before slot start)
    const bookingDateTime = new Date(booking.date);
    bookingDateTime.setHours(booking.startTime, 0, 0, 0);
    const now = new Date();
    const hoursDifference = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDifference < CANCELLATION_DEADLINE_HOURS && !isStaffOrAdmin) {
      throw new BadRequestException(`Bookings can only be cancelled at least ${CANCELLATION_DEADLINE_HOURS} hours prior to slot time.`);
    }

    const updateData: any = { status: BookingStatusEnum.cancelled, expiresAt: null };

    // Process wallet refund if paid via wallet
    if (booking.paymentStatus === PaymentStatusEnum.paid && booking.paymentMethod === PaymentMethodEnum.wallet) {
      const refundAmount = booking.finalPrice ?? booking.totalPrice;
      await this.walletService.refundBooking(booking.userId, refundAmount, booking._id.toString());
      updateData.paymentStatus = PaymentStatusEnum.refunded;
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: updateData,
    });

    // Real-time broadcast: Slot released
    this.bookingGateway.emitSlotReleased(updatedBooking);

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

    if (updateDto.status === BookingStatusEnum.cancelled || updateDto.status === BookingStatusEnum.expired) {
      this.bookingGateway.emitSlotReleased(updatedBooking);
    } else if (updateDto.status === BookingStatusEnum.confirmed) {
      this.bookingGateway.emitBookingConfirmed(updatedBooking);
    }

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
      valid: booking.status !== BookingStatusEnum.cancelled && booking.status !== BookingStatusEnum.expired,
      booking,
    };
  }
}
