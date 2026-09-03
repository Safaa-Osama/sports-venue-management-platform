import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSession, Connection, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { CustomerStatusEnum, RoleEnum } from 'src/common/enums/userEnum';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import RedisService from 'src/common/services/redis/redis.service';
import { calculateCouponDiscount } from '../coupon/utils/coupon-calculator.utils';
import { UserDocument } from '../user/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { BookingGateway } from './booking.gateway';
import { CreateBookingDto, CreatePaymentDto, QueryBookingDto, UpdateBookingStatusDto, } from './dto/booking.dto';
import * as crypto from 'crypto';
import { PushNotificationService } from '../push-notification/push-notification.service';
import { randomUUID } from 'crypto';

function isDuplicateKeyError(error: any): boolean {
  if (!error) return false;
  if (error.code === 11000 || error.code === 11001 || error.code === 112) return true;
  if (error.errorResponse?.code === 11000 || error.errorResponse?.code === 11001 || error.errorResponse?.code === 112) return true;
  if (typeof error.hasErrorLabel === 'function' && (error.hasErrorLabel('TransientTransactionError') || error.code === 11000)) return true;
  if (error.name === 'MongoServerError' && (error.code === 11000 || error.code === 11001 || error.code === 112)) return true;
  if (error.name === 'MongoError' && (error.code === 11000 || error.code === 11001 || error.code === 112)) return true;
  const msg = `${error.message || error.errmsg || ''}`;
  if (msg.includes('E11000') || msg.includes('duplicate key') || msg.includes('dup key') || msg.includes('WriteConflict')) {
    return true;
  }
  return false;
}

const HOLD_DURATION_MINUTES = 15;
const CANCELLATION_DEADLINE_HOURS = 24;


@Injectable()
export class BookingService implements OnModuleInit {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly bookingRepo: BookingRepo,
    private readonly paymentRepo: PaymentRepo,
    private readonly venueRepo: VenueRepo,
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly walletService: WalletService,
    private readonly couponRepo: CouponRepo,
    private readonly paymobService: PaymobService,
    private readonly bookingGateway: BookingGateway,
    private readonly redisService: RedisService,
    private readonly pushService: PushNotificationService,
    @InjectConnection() private readonly connection: Connection,
  ) { }

  async onModuleInit() {
    try {
      if (this.connection && typeof (this.connection as any).model === 'function') {
        const bookingModel = (this.connection as any).model('Booking');
        if (bookingModel && typeof bookingModel.syncIndexes === 'function') {
          await bookingModel.syncIndexes();
        }
      }
    } catch {
      // Non-critical startup index sync
    }
  }

  async getAvailability(venueId: string, startDate?: string, endDate?: string) {
    const filter: any = {
      venueId: Types.ObjectId.isValid(venueId)
        ? new Types.ObjectId(venueId)
        : venueId,
      status: {
        $in: [
          BookingStatusEnum.confirmed,
          BookingStatusEnum.pending,
          BookingStatusEnum.completed,
        ],
      },
    };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const bookings = await this.bookingRepo.find({ filter });
    const now = new Date();

    const validOverlaps = bookings.filter((b) => {
      if (
        b.status === BookingStatusEnum.pending &&
        b.expiresAt &&
        new Date(b.expiresAt) <= now
      ) {
        return false;
      }
      return true;
    });

    return validOverlaps.map((b) => {
      const d = b.date instanceof Date ? b.date : new Date(b.date);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return {
        date: dateStr,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        userId: b.userId?.toString(),
        expiresAt: b.expiresAt,
      };
    });
  }

  private computeRequestFingerprint(body: CreateBookingDto): string {
    const rawSlots =
      body.slots && body.slots.length > 0
        ? [...body.slots].map((s) => ({
            startTime: Number(s.startTime),
            endTime: Number(s.endTime),
          }))
        : typeof body.startTime === 'number' && typeof body.endTime === 'number'
          ? [
              {
                startTime: Number(body.startTime),
                endTime: Number(body.endTime),
              },
            ]
          : [];

    const canonical = {
      venueId: body.venueId.toString(),
      date: new Date(body.date).toISOString().split('T')[0],
      slots: rawSlots.sort((a, b) => a.startTime - b.startTime),
      couponCode: body.couponCode ? body.couponCode.trim().toUpperCase() : null,
      paymentMethod: body.paymentMethod,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  @Cron('*/5 * * * *')
  async cleanExpiredAndNoShowBookings() {
    try {
      const now = new Date();

      // 1. Clean expired pending reservations
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

      // 2. Automatically mark un-attended confirmed/pending bookings whose slot end time has passed as No-Show
      const overdueBookings = await this.bookingRepo.find({
        filter: {
          status: { $in: [BookingStatusEnum.confirmed, BookingStatusEnum.pending] },
          date: { $lte: now },
        },
      });

      for (const b of overdueBookings) {
        const bDate = new Date(b.date);
        const endHour = Number(b.endTime);
        const slotEndTime = new Date(
          bDate.getFullYear(),
          bDate.getMonth(),
          bDate.getDate(),
          endHour,
          0,
          0,
          0,
        );

        if (now >= slotEndTime) {
          this.logger.log(
            `Auto-marking booking #${b.bookingCode || b._id} as no_show (slot ended at ${slotEndTime.toISOString()})`,
          );
          const updated = await this.bookingRepo.findByIdAndUpdate({
            id: b._id,
            update: {
              status: BookingStatusEnum.no_show,
            },
          });

          if (b.userId) {
            try {
              await this.customerUserRepo.findByIdAndUpdate({
                id: b.userId,
                update: {
                  $inc: { noShowCount: 1 },
                },
              });
            } catch (userErr) {
              this.logger.error(`Failed to increment noShowCount for user ${b.userId}:`, userErr);
            }
          }

          if (updated) {
            this.bookingGateway.emitSlotReleased(updated);
            this.bookingGateway.emitBookingConfirmed(updated);
          }
        }
      }
    } catch (err) {
      this.logger.error('Error during cleanExpiredAndNoShowBookings cron:', err);
    }
  }

  @Cron('*/10 * * * *')
  async handleMatchReminders() {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const todayBookings = await this.bookingRepo.find({
        filter: {
          status: BookingStatusEnum.confirmed,
          date: { $gte: todayStart, $lte: todayEnd },
        },
      });

      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeDecimal = currentHour + currentMinutes / 60;

      for (const b of todayBookings) {
        const venue = await this.venueRepo.findById(b.venueId);
        const venueName = venue?.venueName || 'ArenaHub Pitch';
        const formattedDate = new Date(b.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        const formattedTime = `${b.startTime}:00`;

        // 1. Morning reminder (09:00 AM)
        if (currentHour >= 9 && !b.morningReminderSent) {
          await this.bookingRepo.findByIdAndUpdate({
            id: b._id,
            update: { morningReminderSent: true },
          });

          this.pushService.sendToCustomer(
            b.userId.toString(),
            'MATCH_REMINDER_MORNING',
            {
              venueName,
              time: formattedTime,
              date: formattedDate,
              bookingCode: b.bookingCode,
            },
            {
              route: '/',
              bookingId: b._id.toString(),
              venueId: b.venueId.toString(),
            },
          ).catch(() => {});
        }

        // 2. 2-Hour Kickoff reminder
        const hoursUntilKickoff = b.startTime - currentTimeDecimal;
        if (hoursUntilKickoff > 0 && hoursUntilKickoff <= 2.25 && !b.twoHourReminderSent) {
          await this.bookingRepo.findByIdAndUpdate({
            id: b._id,
            update: { twoHourReminderSent: true },
          });

          this.pushService.sendToCustomer(
            b.userId.toString(),
            'MATCH_REMINDER_KICKOFF',
            {
              venueName,
              time: formattedTime,
              date: formattedDate,
              bookingCode: b.bookingCode,
            },
            {
              route: '/',
              bookingId: b._id.toString(),
              venueId: b.venueId.toString(),
            },
          ).catch(() => {});
        }
      }
    } catch (err) {
      this.logger.error('Failed to process match reminders:', err);
    }
  }

  private async notifyBookingConfirmed(booking: any) {
    try {
      if (!booking || !booking.userId) return;
      const venue = await this.venueRepo.findById(booking.venueId);
      const venueName = venue?.venueName || 'ArenaHub Pitch';
      const formattedDate = new Date(booking.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const formattedTime = `${booking.startTime}:00`;

      this.pushService.sendToCustomer(
        booking.userId.toString(),
        'BOOKING_CONFIRMED',
        {
          venueName,
          date: formattedDate,
          time: formattedTime,
          bookingCode: booking.bookingCode || '',
        },
        {
          route: '/',
          bookingId: booking._id?.toString(),
          venueId: booking.venueId?.toString(),
        },
      ).catch(() => {});
    } catch (err) {
      this.logger.warn('Failed to send BOOKING_CONFIRMED push notification:', err);
    }
  }

  private async notifyBookingCancelled(booking: any) {
    try {
      if (!booking) return;
      const venue = await this.venueRepo.findById(booking.venueId);
      const venueName = venue?.venueName || 'ArenaHub Pitch';
      const formattedDate = new Date(booking.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      // Customer notification
      if (booking.userId) {
        this.pushService.sendToCustomer(
          booking.userId.toString(),
          'BOOKING_CANCELLED',
          {
            venueName,
            bookingCode: booking.bookingCode || '',
          },
          {
            route: '/',
            bookingId: booking._id?.toString(),
          },
        ).catch(() => {});

        if (booking.morningReminderSent) {
          this.pushService.sendToCustomer(
            booking.userId.toString(),
            'MATCH_REMINDER_CANCELLED',
            {
              venueName,
              date: formattedDate,
            },
            {
              route: '/',
              bookingId: booking._id?.toString(),
            },
          ).catch(() => {});
        }
      }

      // Host / Owner notification
      if (venue?.createdBy) {
        this.pushService.sendToAdmin(
          venue.createdBy.toString(),
          'BOOKING_CANCELLED',
          {
            venueName,
            bookingCode: booking.bookingCode || '',
          },
          {
            route: '/',
            bookingId: booking._id?.toString(),
          },
        ).catch(() => {});
      }
    } catch (err) {
      this.logger.warn('Failed to send BOOKING_CANCELLED push notification:', err);
    }
  }

  async createBooking(
    body: CreateBookingDto,
    user: UserDocument,
    idempotencyKey?: string,
  ) {
    const { venueId, date, couponCode, paymentMethod } = body;

    const rawSlots: Array<{ startTime: number; endTime: number }> =
      body.slots && body.slots.length > 0
        ? body.slots.map((s) => ({
            startTime: Number(s.startTime),
            endTime: Number(s.endTime),
          }))
        : typeof body.startTime === 'number' && typeof body.endTime === 'number'
          ? [
              {
                startTime: Number(body.startTime),
                endTime: Number(body.endTime),
              },
            ]
          : [];

    if (rawSlots.length === 0) {
      throw new BadRequestException(
        'Please provide either a slots array or startTime and endTime',
      );
    }

    for (let i = 0; i < rawSlots.length; i++) {
      const s1 = rawSlots[i];
      if (s1.startTime < 0 || s1.startTime > 23) {
        throw new BadRequestException('Slot startTime must be between 0 and 23');
      }
      if (s1.endTime < 1 || s1.endTime > 24) {
        throw new BadRequestException('Slot endTime must be between 1 and 24');
      }
      if (s1.startTime >= s1.endTime) {
        throw new BadRequestException(
          'Slot startTime must be strictly less than endTime',
        );
      }
      for (let j = i + 1; j < rawSlots.length; j++) {
        const s2 = rawSlots[j];
        if (s1.startTime < s2.endTime && s1.endTime > s2.startTime) {
          throw new BadRequestException(
            'Requested slots overlap with each other',
          );
        }
      }
    }

    const requestHash = this.computeRequestFingerprint(body);
    const trimmedIdemKey = idempotencyKey ? idempotencyKey.trim() : undefined;

    const effectiveIdemKey = trimmedIdemKey
      ? `idem::req::${user._id.toString()}::${trimmedIdemKey}`
      : undefined;
    const idemLockKey = trimmedIdemKey
      ? `idem::lock::${user._id.toString()}::${trimmedIdemKey}`
      : undefined;

    if (effectiveIdemKey) {
      const cached = await this.redisService.getValue(effectiveIdemKey);
      if (cached) {
        if (typeof cached === 'object' && 'requestHash' in cached) {
          if (cached.requestHash && cached.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency key mismatch: cannot reuse the same key with a different request payload',
            );
          }
          return cached.responseData || cached;
        }
        return cached;
      }
    }

    if (trimmedIdemKey) {
      const existingIdemBooking = await this.bookingRepo.findOne({
        filter: {
          userId: user._id,
          idempotencyKey: trimmedIdemKey,
        },
      });

      if (existingIdemBooking) {
        if (
          existingIdemBooking.requestHash &&
          existingIdemBooking.requestHash !== requestHash
        ) {
          throw new ConflictException(
            'Idempotency key mismatch: cannot reuse the same key with a different request payload',
          );
        }

        const allGroupBookings = existingIdemBooking.groupId
          ? await this.bookingRepo.find({
              filter: { groupId: existingIdemBooking.groupId },
            })
          : [existingIdemBooking];

        const reconstructedResponse = {
          groupId: existingIdemBooking.groupId,
          bookings: allGroupBookings.length > 0 ? allGroupBookings : [existingIdemBooking],
          booking: existingIdemBooking,
          payment: {
            status: existingIdemBooking.paymentStatus,
            paymentMethod: existingIdemBooking.paymentMethod,
            amount:
              existingIdemBooking.finalPrice ?? existingIdemBooking.totalPrice,
          },
        };

        if (effectiveIdemKey) {
          await this.redisService.setValue({
            key: effectiveIdemKey,
            value: { requestHash, responseData: reconstructedResponse },
            ttl: 86400,
          });
        }

        return reconstructedResponse;
      }
    }

    let idemLockAcquired = false;
    if (idemLockKey) {
      for (let attempt = 0; attempt < 25; attempt++) {
        idemLockAcquired = await this.redisService.acquireLock(idemLockKey, 10);
        if (idemLockAcquired) break;

        await new Promise((resolve) => setTimeout(resolve, 100));
        if (effectiveIdemKey) {
          const cached = await this.redisService.getValue(effectiveIdemKey);
          if (cached) {
            if (typeof cached === 'object' && 'requestHash' in cached) {
              if (cached.requestHash && cached.requestHash !== requestHash) {
                throw new ConflictException(
                  'Idempotency key mismatch: cannot reuse the same key with a different request payload',
                );
              }
              return cached.responseData || cached;
            }
            return cached;
          }
        }
      }

      if (!idemLockAcquired) {
        throw new ConflictException(
          'A concurrent request with this idempotency key is currently processing. Please retry shortly.',
        );
      }
    }

    try {
      const targetCustomerId = body.customerId || (user?._id ? user._id.toString() : null);
      if (targetCustomerId && Types.ObjectId.isValid(targetCustomerId)) {
        const customer = await this.customerUserRepo.findById(new Types.ObjectId(targetCustomerId));
        if (customer) {
          if (customer.status === CustomerStatusEnum.suspended || (customer.status as string) === 'suspended') {
            throw new ForbiddenException(
              `Account is suspended: ${customer.statusReason || 'Please contact administration.'}`,
            );
          }
          if (customer.status === CustomerStatusEnum.archived || (customer.status as string) === 'archived' || (customer.status as string) === 'inactive') {
            throw new ForbiddenException(
              'Account is archived. New bookings cannot be created.',
            );
          }
        }
      }

      const venue = await this.venueRepo.findById(venueId);
      if (!venue) {
        throw new NotFoundException('Venue not found');
      }

      if (!venue.isActive) {
        throw new BadRequestException('Venue is currently inactive');
      }

      for (const slot of rawSlots) {
        if (
          slot.startTime < venue.startWorkingHours ||
          slot.endTime > venue.endWorkingHours
        ) {
          throw new BadRequestException(
            `Booking hours must be between venue operating hours (${venue.startWorkingHours}:00 - ${venue.endWorkingHours}:00)`,
          );
        }
      }

      const bookingDate = new Date(date);
      const startOfDay = new Date(bookingDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(bookingDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const now = new Date();
      for (const slot of rawSlots) {
        const slotStartDateTime = new Date(startOfDay);
        slotStartDateTime.setUTCHours(slot.startTime, 0, 0, 0);
        if (slotStartDateTime.getTime() <= now.getTime()) {
          throw new BadRequestException('Cannot book a time slot in the past');
        }
      }

      const lockKey = `lock::booking::venue::${venue._id.toString()}::${startOfDay.toISOString()}`;
      let lockAcquired = false;
      for (let i = 0; i < 10; i++) {
        lockAcquired = await this.redisService.acquireLock(lockKey, 5);
        if (lockAcquired) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (!lockAcquired) {
        throw new ConflictException(
          'Selected slot is currently being booked by another user. Please try again.',
        );
      }

      try {
        const slotOverlapConditions = rawSlots.map((s) => ({
          startTime: { $lt: s.endTime },
          endTime: { $gt: s.startTime },
        }));

        const existingBookings = await this.bookingRepo.find({
          filter: {
            venueId: venue._id,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: {
              $in: [
                BookingStatusEnum.confirmed,
                BookingStatusEnum.pending,
                BookingStatusEnum.completed,
              ],
            },
            $or: slotOverlapConditions,
          },
        });

        const validOverlaps = existingBookings.filter((b) => {
          if (
            b.status === BookingStatusEnum.pending &&
            b.expiresAt &&
            new Date(b.expiresAt) <= now
          ) {
            return false;
          }
          return true;
        });

        const thirdPartyConflicts = validOverlaps.filter((b) => {
          // If confirmed/completed, it is always a conflict for everyone
          if (b.status !== BookingStatusEnum.pending) {
            return true;
          }
          // If pending, check if it belongs to someone else
          const bUserId = b.userId?._id?.toString() || b.userId?.toString();
          const currentUserId = user._id?.toString();
          return bUserId !== currentUserId;
        });

        if (thirdPartyConflicts.length > 0) {
          throw new ConflictException(
            'Selected time slot is already booked or reserved for this venue',
          );
        }

        // If the current user has active pending holds on any of these slots, cleanly replace them
        const myExistingPendingHolds = validOverlaps.filter((b) => {
          if (b.status !== BookingStatusEnum.pending) return false;
          const bUserId = b.userId?._id?.toString() || b.userId?.toString();
          const currentUserId = user._id?.toString();
          return bUserId === currentUserId;
        });

        for (const myOldHold of myExistingPendingHolds) {
          await this.bookingRepo.findByIdAndDelete(myOldHold._id).catch(() => {});
        }

        let totalRawPrice = 0;
        const slotPricings: Array<{
          startTime: number;
          endTime: number;
          totalPrice: number;
        }> = [];

        const bookingDateStr =
          typeof date === 'string'
            ? date.split('T')[0]
            : bookingDate.toISOString().split('T')[0];

        for (const slot of rawSlots) {
          let slotPrice = 0;

          for (let hour = slot.startTime; hour < slot.endTime; hour++) {
            let hourPrice: number | null = null;

            // 1. Check Date-Specific Custom Prices (Highest Precedence)
            if (venue.customDatePrices && venue.customDatePrices.length > 0) {
              const dateRule = venue.customDatePrices.find((r) => {
                const rDate =
                  typeof r.date === 'string'
                    ? r.date.split('T')[0]
                    : new Date(r.date).toISOString().split('T')[0];
                return (
                  rDate === bookingDateStr &&
                  hour >= r.startHour &&
                  hour < r.endHour
                );
              });
              if (
                dateRule &&
                typeof dateRule.pricePerHour === 'number' &&
                dateRule.pricePerHour >= 0
              ) {
                hourPrice = dateRule.pricePerHour;
              }
            }

            // 2. Check Recurring Custom Hour Prices (Second Precedence)
            if (
              hourPrice === null &&
              venue.customHourPrices &&
              venue.customHourPrices.length > 0
            ) {
              const customPrice = venue.customHourPrices.find(
                (c) => c.hour === hour,
              );
              if (
                customPrice &&
                typeof customPrice.pricePerHour === 'number' &&
                customPrice.pricePerHour >= 0
              ) {
                hourPrice = customPrice.pricePerHour;
              }
            }

            // 3. Fallback to defaultHourPrice
            if (hourPrice === null) {
              hourPrice = venue.defaultHourPrice;
            }

            slotPrice += hourPrice;
          }

          slotPricings.push({
            startTime: slot.startTime,
            endTime: slot.endTime,
            totalPrice: slotPrice,
          });
          totalRawPrice += slotPrice;
        }

        let groupDiscountAmount = 0;
        let groupFinalPrice = totalRawPrice;
        const normalizedCouponCode = couponCode
          ? couponCode.trim().toUpperCase()
          : undefined;

        if (normalizedCouponCode) {
          const coupon = await this.couponRepo.findOne({
            filter: { code: normalizedCouponCode },
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

          if (
            now < new Date(coupon.startDate) ||
            now > new Date(coupon.endDate)
          ) {
            throw new BadRequestException('Coupon is expired or not valid yet');
          }

          const discountResult = calculateCouponDiscount(
            coupon.discountType,
            coupon.discount,
            totalRawPrice,
          );
          groupDiscountAmount = discountResult.discountAmount;
          groupFinalPrice = discountResult.finalPrice;
        }

        let allocatedDiscount = 0;
        const slotFinalCalculations: Array<{
          startTime: number;
          endTime: number;
          totalPrice: number;
          discountAmount: number;
          finalPrice: number;
        }> = [];

        for (let i = 0; i < slotPricings.length; i++) {
          const sp = slotPricings[i];
          let sDiscount = 0;
          if (groupDiscountAmount > 0 && totalRawPrice > 0) {
            if (i === slotPricings.length - 1) {
              sDiscount = Number(
                (groupDiscountAmount - allocatedDiscount).toFixed(2),
              );
            } else {
              sDiscount = Number(
                (
                  (sp.totalPrice / totalRawPrice) *
                  groupDiscountAmount
                ).toFixed(2),
              );
              allocatedDiscount += sDiscount;
            }
          }
          const sFinal = Number(
            Math.max(0, sp.totalPrice - sDiscount).toFixed(2),
          );
          slotFinalCalculations.push({
            startTime: sp.startTime,
            endTime: sp.endTime,
            totalPrice: Number(sp.totalPrice.toFixed(2)),
            discountAmount: Number(sDiscount.toFixed(2)),
            finalPrice: sFinal,
          });
        }

        let amountToPay = groupFinalPrice;
        let isDepositOnly = false;
        const depositConfigured =
          venue.minimumDepositAmount !== undefined &&
          venue.minimumDepositAmount !== null &&
          venue.minimumDepositAmount > 0;
        const minRequiredDeposit = depositConfigured
          ? Math.min(rawSlots.length * (venue.minimumDepositAmount ?? 0), groupFinalPrice)
          : groupFinalPrice;

        if (
          body.customAmount !== undefined &&
          body.customAmount !== null &&
          Number(body.customAmount) > 0
        ) {
          const custom = Number(body.customAmount);
          if (custom < minRequiredDeposit) {
            throw new BadRequestException(
              `Payment amount cannot be less than the minimum required deposit of ${minRequiredDeposit} EGP`,
            );
          }
          if (custom > groupFinalPrice) {
            throw new BadRequestException(
              `Payment amount cannot exceed the total booking price of ${groupFinalPrice} EGP`,
            );
          }
          amountToPay = custom;
          isDepositOnly = amountToPay < groupFinalPrice;
        } else if (depositConfigured) {
          amountToPay = minRequiredDeposit;
          isDepositOnly = amountToPay < groupFinalPrice;
        }

        if (paymentMethod === PaymentMethodEnum.wallet) {
          const wallet = await this.walletService.getOrCreateWallet(user._id);
          if (wallet.balance < amountToPay) {
            throw new BadRequestException(
              `Insufficient wallet balance. Required: ${amountToPay}, Available: ${wallet.balance}`,
            );
          }
        }

        const expiresAt = new Date(
          Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
        );
        const groupId = randomUUID();
        const createdBookings: any[] = [];

        try {
          for (const sCalc of slotFinalCalculations) {
            const bookingCode = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
              .toString(36)
              .substring(2, 6)
              .toUpperCase()}`;

            const qrPayload = JSON.stringify({
              bookingCode,
              venueId: venue._id,
              userId: user._id,
              groupId,
              date: startOfDay.toISOString().split('T')[0],
              startTime: sCalc.startTime,
              endTime: sCalc.endTime,
            });

            const qrCode = await QRCode.toDataURL(qrPayload);

            const booking = await this.bookingRepo.create({
              userId: user._id,
              venueId: venue._id,
              groupId,
              date: startOfDay,
              startTime: sCalc.startTime,
              endTime: sCalc.endTime,
              totalPrice: sCalc.totalPrice,
              discountAmount: sCalc.discountAmount,
              finalPrice: sCalc.finalPrice,
              paidAmount: 0,
              remainingAmount: sCalc.finalPrice,
              couponCode: normalizedCouponCode,
              status: BookingStatusEnum.pending,
              paymentStatus: PaymentStatusEnum.unpaid,
              paymentMethod,
              expiresAt,
              bookingCode,
              qrCode,
              idempotencyKey: trimmedIdemKey,
              requestHash,
            });

            createdBookings.push(booking);
            this.bookingGateway.emitSlotLocked(booking);
          }
        } catch (createError: any) {
          for (const b of createdBookings) {
            await this.bookingRepo.findByIdAndDelete(b._id).catch(() => {});
            this.bookingGateway.emitSlotReleased(b);
          }
          if (isDuplicateKeyError(createError)) {
            throw new ConflictException(
              'One or more selected slots were just booked by another user. Please try again.',
            );
          }
          throw createError;
        }

        if (venue.createdBy && createdBookings.length > 0) {
          this.bookingGateway.emitOwnerNotification(
            venue.createdBy.toString(),
            createdBookings[0],
            'NEW_PENDING_BOOKING',
          );
          this.pushService.sendToAdmin(
            venue.createdBy.toString(),
            'NEW_BOOKING_REQUEST',
            {
              venueName: venue.venueName || 'Pitch',
              date: startOfDay.toISOString().split('T')[0],
              time: `${createdBookings[0].startTime}:00`,
              customerName: (user as any).userName || 'Customer',
              bookingCode: createdBookings[0].bookingCode || '',
            },
            {
              route: '/',
              bookingId: createdBookings[0]._id?.toString(),
              venueId: venue._id?.toString(),
            },
          ).catch(() => {});
        }

        let paymentResult: any;
        try {
          paymentResult = await this.processGroupPayment({
            user,
            venue,
            groupId,
            createdBookings,
            amountToPay,
            groupFinalPrice,
            isDepositOnly,
            paymentMethod,
            walletAmountToUse: body.walletAmountToUse,
            normalizedCouponCode,
          });
        } catch (payError: any) {
          for (const b of createdBookings) {
            await this.bookingRepo.findByIdAndDelete(b._id).catch(() => {});
            this.bookingGateway.emitSlotReleased(b);
          }
          if (isDuplicateKeyError(payError)) {
            throw new ConflictException(
              'One or more selected slots were just booked by another user. Please try again.',
            );
          }
          throw payError;
        }

        const latestBookings = await this.bookingRepo.find({
          filter: { groupId },
        });
        const finalBookings =
          latestBookings.length > 0 ? latestBookings : createdBookings;

        const responseData = {
          groupId,
          bookings: finalBookings,
          booking: finalBookings[0],
          payment: paymentResult,
        };

        // Store in Redis with 24-hour TTL for idempotency replay
        if (effectiveIdemKey) {
          try {
            await this.redisService.setValue({
              key: String(effectiveIdemKey),
              value: { requestHash, responseData },
              ttl: 86400,
            });
          } catch {
            // Non-critical cache write failure will be recovered from DB on retry
          }
        }

        return responseData;
      } finally {
        if (lockAcquired) {
          await this.redisService.releaseLock(lockKey);
        }
      }
    } finally {
      if (idemLockAcquired && idemLockKey) {
        await this.redisService.releaseLock(idemLockKey);
      }
    }
  }

  private async processGroupPayment({
    user,
    venue,
    groupId,
    createdBookings,
    amountToPay,
    groupFinalPrice,
    isDepositOnly,
    paymentMethod,
    walletAmountToUse,
    normalizedCouponCode,
  }: {
    user: UserDocument;
    venue: any;
    groupId: string;
    createdBookings: any[];
    amountToPay: number;
    groupFinalPrice: number;
    isDepositOnly: boolean;
    paymentMethod: PaymentMethodEnum;
    walletAmountToUse?: number;
    normalizedCouponCode?: string;
  }) {
    const targetPaymentStatus = isDepositOnly
      ? PaymentStatusEnum.partially_paid
      : PaymentStatusEnum.paid;

    if (paymentMethod === PaymentMethodEnum.wallet) {
      let supportsTransactions = false;
      try {
        const connAny = this.connection as any;
        const topologyType = connAny?.client?.topology?.description?.type;
        const setName = connAny?.client?.topology?.description?.setName;
        if (
          topologyType === 'ReplicaSetWithPrimary' ||
          topologyType === 'Sharded' ||
          Boolean(setName)
        ) {
          supportsTransactions = true;
        }
      } catch {
        supportsTransactions = false;
      }

      let session: ClientSession | null = null;
      if (supportsTransactions) {
        try {
          session = await this.connection.startSession();
          session.startTransaction();
        } catch {
          session = null;
        }
      }

      if (session) {
        let walletDebited = false;
        try {
          await this.walletService.payForBooking(
            user._id,
            amountToPay,
            createdBookings[0]._id.toString(),
            session,
          );
          walletDebited = true;

          for (let i = 0; i < createdBookings.length; i++) {
            const b = createdBookings[i];
            const bookingFinal = b.finalPrice ?? b.totalPrice ?? 0;
            const bPaid = isDepositOnly
              ? Number(((bookingFinal / (groupFinalPrice || 1)) * amountToPay).toFixed(2))
              : bookingFinal;
            const bRemaining = Math.max(0, Number((bookingFinal - bPaid).toFixed(2)));
            await this.bookingRepo.findByIdAndUpdate({
              id: b._id,
              update: {
                status: BookingStatusEnum.confirmed,
                paymentStatus: targetPaymentStatus,
                paymentMethod: PaymentMethodEnum.wallet,
                paidAmount: bPaid,
                remainingAmount: bRemaining,
                expiresAt: null,
              },
              options: { session },
            });
          }

          if (normalizedCouponCode) {
            const coupon = await this.couponRepo.findOne({
              filter: { code: normalizedCouponCode },
              options: { session },
            });
            if (coupon) {
              coupon.usesCount += 1;
              await coupon.save({ session });
            }
          }
          await session.commitTransaction();

          for (const b of createdBookings) {
            const updated = await this.bookingRepo.findById(b._id);
            if (updated) {
              this.bookingGateway.emitBookingConfirmed(updated);
              this.notifyBookingConfirmed(updated).catch(() => {});
            }
          }

          return {
            status: targetPaymentStatus,
            paymentMethod: PaymentMethodEnum.wallet,
            amount: amountToPay,
            totalDue: groupFinalPrice,
            isDeposit: isDepositOnly,
          };
        } catch (txnError: any) {
          try {
            await session.abortTransaction();
            await session.endSession();
          } catch {}

          if (isDuplicateKeyError(txnError)) {
            if (walletDebited) {
              await this.walletService
                .refundBooking(
                  user._id,
                  amountToPay,
                  createdBookings[0]._id.toString(),
                )
                .catch(() => {});
            }
            throw new ConflictException(
              'One or more selected slots were just booked by another user. Please try again.',
            );
          }

          const isReplicaSetError =
            txnError?.code === 20 ||
            txnError?.errorResponse?.code === 20 ||
            txnError?.message?.includes('replica set') ||
            txnError?.message?.includes('Transaction numbers');

          if (isReplicaSetError) {
            if (walletDebited) {
              await this.walletService
                .refundBooking(
                  user._id,
                  amountToPay,
                  createdBookings[0]._id.toString(),
                )
                .catch(() => {});
            }
            return await this.processGroupPaymentCompensating({
              user,
              groupId,
              createdBookings,
              amountToPay,
              groupFinalPrice,
              isDepositOnly,
              targetPaymentStatus,
              normalizedCouponCode,
            });
          }
          throw txnError;
        } finally {
          try {
            if (session?.inTransaction()) {
              await session.abortTransaction();
            }
            await session.endSession();
          } catch {}
        }
      } else {
        return await this.processGroupPaymentCompensating({
          user,
          groupId,
          createdBookings,
          amountToPay,
          groupFinalPrice,
          isDepositOnly,
          targetPaymentStatus,
          normalizedCouponCode,
        });
      }
    }

    if (paymentMethod === PaymentMethodEnum.cash) {
      for (const b of createdBookings) {
        const bookingFinal = b.finalPrice ?? b.totalPrice ?? 0;
        const updated = await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            status: BookingStatusEnum.confirmed,
            paymentStatus: PaymentStatusEnum.pay_at_venue,
            paymentMethod: PaymentMethodEnum.cash,
            paidAmount: 0,
            remainingAmount: bookingFinal,
            expiresAt: null,
          },
        });
        if (updated) {
          this.bookingGateway.emitBookingConfirmed(updated);
          this.notifyBookingConfirmed(updated).catch(() => {});
        }
      }

      if (normalizedCouponCode) {
        const coupon = await this.couponRepo.findOne({
          filter: { code: normalizedCouponCode },
        });
        if (coupon) {
          coupon.usesCount += 1;
          await coupon.save();
        }
      }

      return {
        status: PaymentStatusEnum.pay_at_venue,
        paymentMethod: PaymentMethodEnum.cash,
        amount: amountToPay,
        totalDue: groupFinalPrice,
      };
    }

    if (paymentMethod === PaymentMethodEnum.paymob) {
      const userWallet = await this.walletService.getOrCreateWallet(user._id);
      const availableWallet = Math.max(0, userWallet?.balance || 0);

      let requestedWalletDeduction = 0;
      if (walletAmountToUse !== undefined && walletAmountToUse !== null) {
        requestedWalletDeduction = Math.min(Number(walletAmountToUse), availableWallet, amountToPay);
      } else {
        requestedWalletDeduction = Math.min(availableWallet, amountToPay);
      }

      const paymobRemainder = Math.max(0, Number((amountToPay - requestedWalletDeduction).toFixed(2)));

      if (paymobRemainder === 0 && requestedWalletDeduction >= amountToPay) {
        return await this.processGroupPayment({
          user,
          venue,
          groupId,
          createdBookings,
          amountToPay,
          groupFinalPrice,
          isDepositOnly,
          paymentMethod: PaymentMethodEnum.wallet,
          normalizedCouponCode,
        });
      }

      const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${randomUUID()
        .replace(/-/g, '')
        .substring(0, 8)
        .toUpperCase()}`;

      const payment = await this.paymentRepo.create({
        bookingId: createdBookings[0]._id,
        groupId,
        userId: user._id,
        amount: amountToPay,
        walletDeduction: requestedWalletDeduction,
        paymentMethod: PaymentMethodEnum.paymob,
        transactionId,
        status: PaymentStatusEnum.unpaid,
      });

      const anyUser: any = user;
      let userPhone = '+201000000000';
      if (Array.isArray(anyUser.phone) && anyUser.phone.length > 0) {
        userPhone = anyUser.phone[0];
      } else if (typeof anyUser.phone === 'string' && anyUser.phone) {
        userPhone = anyUser.phone;
      }

      const checkoutData = await this.paymobService.createPaymentIntention({
        bookingId: groupId || createdBookings[0]._id.toString(),
        transactionId,
        amount: paymobRemainder,
        userEmail: anyUser.email || 'player@arenahub.com',
        userName: anyUser.userName || anyUser.name || 'Arena Player',
        userPhone,
      });

      for (const b of createdBookings) {
        const updated = await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            paymentMethod: PaymentMethodEnum.paymob,
          },
        });
        if (updated) this.bookingGateway.emitSlotLocked(updated);
      }

      return {
        ...checkoutData,
        amountToPay: paymobRemainder,
        walletDeduction: requestedWalletDeduction,
        totalTarget: amountToPay,
        paymentStatus: PaymentStatusEnum.unpaid,
        status: BookingStatusEnum.pending,
        paymentMethod: PaymentMethodEnum.paymob,
        transactionId,
        bookingId: createdBookings[0]._id.toString(),
        groupId,
        paymentId: payment._id,
        currency: 'EGP',
      };
    }

    throw new BadRequestException('Unsupported payment method');
  }

  private async processGroupPaymentCompensating({
    user,
    groupId,
    createdBookings,
    amountToPay,
    groupFinalPrice,
    isDepositOnly,
    targetPaymentStatus,
    normalizedCouponCode,
  }: {
    user: UserDocument;
    groupId: string;
    createdBookings: any[];
    amountToPay: number;
    groupFinalPrice: number;
    isDepositOnly: boolean;
    targetPaymentStatus: PaymentStatusEnum;
    normalizedCouponCode?: string;
  }) {
    await this.walletService.payForBooking(
      user._id,
      amountToPay,
      createdBookings[0]._id.toString(),
    );

    try {
      for (let i = 0; i < createdBookings.length; i++) {
        const b = createdBookings[i];
        const bookingFinal = b.finalPrice ?? b.totalPrice ?? 0;
        const bPaid = isDepositOnly
          ? Number(((bookingFinal / (groupFinalPrice || 1)) * amountToPay).toFixed(2))
          : bookingFinal;
        const bRemaining = Math.max(0, Number((bookingFinal - bPaid).toFixed(2)));
        const updated = await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            status: BookingStatusEnum.confirmed,
            paymentStatus: targetPaymentStatus,
            paymentMethod: PaymentMethodEnum.wallet,
            paidAmount: bPaid,
            remainingAmount: bRemaining,
            expiresAt: null,
          },
        });
        if (updated) this.bookingGateway.emitBookingConfirmed(updated);
      }

      if (normalizedCouponCode) {
        const coupon = await this.couponRepo.findOne({
          filter: { code: normalizedCouponCode },
        });
        if (coupon) {
          coupon.usesCount += 1;
          await coupon.save();
        }
      }
    } catch (confirmError: any) {
      await this.walletService
        .refundBooking(
          user._id,
          amountToPay,
          createdBookings[0]._id.toString(),
        )
        .catch(() => {});
      if (isDuplicateKeyError(confirmError)) {
        throw new ConflictException(
          'One or more selected slots were just booked by another user. Please try again.',
        );
      }
      throw confirmError;
    }

    return {
      status: targetPaymentStatus,
      paymentMethod: PaymentMethodEnum.wallet,
      amount: amountToPay,
      totalDue: groupFinalPrice,
      isDeposit: isDepositOnly,
    };
  }

  async payBooking(
    bookingId: string,
    body: CreatePaymentDto,
    user: UserDocument,
  ) {
    const { paymentMethod, couponCode } = body;

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId.toString() !== user._id.toString()) {
      throw new UnauthorizedException(
        'You do not have permission to pay for this booking',
      );
    }

    if (
      booking.status === BookingStatusEnum.cancelled ||
      booking.status === BookingStatusEnum.expired
    ) {
      throw new BadRequestException(
        'Booking is expired or cancelled and cannot be paid',
      );
    }

    if (booking.paymentStatus === PaymentStatusEnum.paid) {
      throw new BadRequestException('Booking is already paid');
    }

    const now = new Date();
    if (
      booking.expiresAt &&
      new Date(booking.expiresAt) <= now &&
      booking.status === BookingStatusEnum.pending
    ) {
      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: { status: BookingStatusEnum.expired },
      });
      this.bookingGateway.emitSlotReleased(booking);
      throw new BadRequestException(
        'Booking hold has expired. Please create a new booking request.',
      );
    }

    const targetBookings = booking.groupId
      ? await this.bookingRepo.find({
          filter: { groupId: booking.groupId },
        })
      : [booking];

    const venue = await this.venueRepo.findById(booking.venueId);
    const totalGroupFinalPrice = targetBookings.reduce(
      (sum, b) => sum + (b.finalPrice ?? b.totalPrice ?? 0),
      0,
    );

    let amountToPay = totalGroupFinalPrice;
    let isDepositOnly = false;
    const depositConfigured =
      venue?.minimumDepositAmount !== undefined &&
      venue?.minimumDepositAmount !== null &&
      venue.minimumDepositAmount > 0;
    const minRequiredDeposit = depositConfigured
      ? Math.min(targetBookings.length * (venue?.minimumDepositAmount ?? 0), totalGroupFinalPrice)
      : totalGroupFinalPrice;

    if (
      body.customAmount !== undefined &&
      body.customAmount !== null &&
      Number(body.customAmount) > 0
    ) {
      const custom = Number(body.customAmount);
      if (custom < minRequiredDeposit) {
        throw new BadRequestException(
          `Payment amount cannot be less than the minimum required deposit of ${minRequiredDeposit} EGP`,
        );
      }
      if (custom > totalGroupFinalPrice) {
        throw new BadRequestException(
          `Payment amount cannot exceed the total booking price of ${totalGroupFinalPrice} EGP`,
        );
      }
      amountToPay = custom;
      isDepositOnly = amountToPay < totalGroupFinalPrice;
    } else if (depositConfigured) {
      amountToPay = minRequiredDeposit;
      isDepositOnly = amountToPay < totalGroupFinalPrice;
    }

    const activeCouponCode = couponCode
      ? couponCode.trim().toUpperCase()
      : booking.couponCode
        ? booking.couponCode.trim().toUpperCase()
        : undefined;

    return await this.processGroupPayment({
      user,
      venue,
      groupId: booking.groupId || booking._id.toString(),
      createdBookings: targetBookings,
      amountToPay,
      groupFinalPrice: totalGroupFinalPrice,
      isDepositOnly,
      paymentMethod,
      walletAmountToUse: body.walletAmountToUse,
      normalizedCouponCode: activeCouponCode,
    });
  }

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
      populate: {
        path: 'venueId',
        select: 'venueName address images defaultHourPrice',
      },
    });
  }

  async getCustomerBookings(customerId: string, query: QueryBookingDto) {
    const { page, limit, status, paymentStatus, date } = query;
    const search: any = {
      $or: [
        { userId: new Types.ObjectId(customerId) },
        { customerId: customerId },
      ],
    };

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
      page: page || 1,
      limit: limit || 50,
      search,
      sort: { createdAt: -1 },
      populate: {
        path: 'venueId',
        select: 'venueName name address images defaultHourPrice',
      },
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
      populate: { path: 'userId', select: 'userName email phone' },
    });
  }

  async getBookingById(id: string, user: UserDocument) {
    const booking = await this.bookingRepo.findOne({
      filter: { _id: id },
      options: {
        populate: [
          { path: 'venueId', select: 'venueName address images' },
          { path: 'userId', select: 'userName phone' },
        ],
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isOwner =
      booking.userId?._id?.toString() === user._id.toString() ||
      booking.userId?.toString() === user._id.toString();
    const isStaffOrAdmin = [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ].includes(user.role);

    if (!isOwner && !isStaffOrAdmin) {
      throw new UnauthorizedException(
        'You do not have permission to view this booking',
      );
    }

    return booking;
  }

  async cancelBooking(id: string, user: any) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isOwner = booking.userId.toString() === user._id.toString();
    const isStaffOrAdmin = [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ].includes(user.role);

    if (!isOwner && !isStaffOrAdmin) {
      throw new UnauthorizedException(
        'You do not have permission to cancel this booking',
      );
    }

    if (booking.status === BookingStatusEnum.cancelled) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatusEnum.completed) {
      throw new BadRequestException('Completed bookings cannot be cancelled');
    }

    const bookingDateTime = new Date(booking.date);
    bookingDateTime.setHours(booking.startTime, 0, 0, 0);
    const now = new Date();
    const hoursDifference =
      (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (
      booking.status !== BookingStatusEnum.pending &&
      hoursDifference < CANCELLATION_DEADLINE_HOURS &&
      !isStaffOrAdmin
    ) {
      throw new BadRequestException(
        `Bookings can only be cancelled at least ${CANCELLATION_DEADLINE_HOURS} hours prior to slot time.`,
      );
    }

    const wasPaid =
      booking.paymentStatus === PaymentStatusEnum.paid ||
      booking.paymentStatus === PaymentStatusEnum.partially_paid;

    const actualPaidAmount =
      booking.paidAmount !== undefined && booking.paidAmount !== null && booking.paidAmount > 0
        ? booking.paidAmount
        : wasPaid
        ? (booking.finalPrice ?? booking.totalPrice ?? 0)
        : 0;

    let targetPaymentStatus = booking.paymentStatus;
    let refundedWalletData: any = null;

    if (wasPaid && actualPaidAmount > 0) {
      targetPaymentStatus = PaymentStatusEnum.refunded;
      try {
        const refundRes = await this.walletService.refundBooking(
          booking.userId,
          actualPaidAmount,
          booking._id.toString(),
          user,
        );
        refundedWalletData = refundRes?.updatedWallet;
      } catch (refundError) {
        this.logger.error('Wallet refund failed on booking cancellation:', refundError);
      }
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: {
        status: BookingStatusEnum.cancelled,
        paymentStatus: targetPaymentStatus,
        paidAmount: 0,
        remainingAmount: 0,
        expiresAt: null,
      },
    });

    if (updatedBooking) {
      this.bookingGateway.emitSlotReleased(updatedBooking);
      this.bookingGateway.emitBookingCancelled(updatedBooking, wasPaid ? actualPaidAmount : 0);
      if (refundedWalletData) {
        this.bookingGateway.emitWalletUpdated(booking.userId.toString(), {
          balance: refundedWalletData.balance,
          reason: `Refund for cancelled booking #${booking._id}`,
          bookingId: booking._id.toString(),
        });
      }
      this.notifyBookingCancelled(updatedBooking).catch(() => {});
    }

    return updatedBooking;
  }

  async updateStatus(id: string, updateDto: UpdateBookingStatusDto) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatusEnum.completed) {
      throw new BadRequestException(
        'Completed reservations are finalized and cannot be modified or re-confirmed.',
      );
    }

    const wasPaid =
      booking.paymentStatus === PaymentStatusEnum.paid ||
      booking.paymentStatus === PaymentStatusEnum.partially_paid;

    const actualPaidAmount =
      booking.paidAmount !== undefined && booking.paidAmount !== null && booking.paidAmount > 0
        ? booking.paidAmount
        : wasPaid
        ? (booking.finalPrice ?? booking.totalPrice ?? 0)
        : 0;

    const updateData: any = {};
    let refundedWalletData: any = null;
    if (updateDto.status) updateData.status = updateDto.status;
    if (updateDto.paymentStatus) {
      updateData.paymentStatus = updateDto.paymentStatus;
    }

    const bFinal = booking.finalPrice ?? booking.totalPrice ?? 0;

    if (updateDto.paymentStatus === PaymentStatusEnum.paid || updateDto.collectCash) {
      updateData.paidAmount = bFinal;
      updateData.remainingAmount = 0;
      updateData.paymentStatus = PaymentStatusEnum.paid;
      updateData.expiresAt = null;

      // Settle outstanding balance as cash payment in DB for reports
      const remainingDue =
        typeof updateDto.cashAmount === 'number'
          ? updateDto.cashAmount
          : (booking.remainingAmount !== undefined && booking.remainingAmount !== null && booking.remainingAmount > 0)
          ? booking.remainingAmount
          : Math.max(0, bFinal - actualPaidAmount);

      if (remainingDue > 0) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const randomStr = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
        const cashTxId = `CSH-${timestamp}-${randomStr}`;
        try {
          await this.paymentRepo.create({
            bookingId: booking._id,
            groupId: booking.groupId,
            userId: booking.userId,
            amount: remainingDue,
            paymentMethod: PaymentMethodEnum.cash,
            transactionId: cashTxId,
            status: PaymentStatusEnum.paid,
            paidAt: new Date(),
          });
          this.logger.log(
            `Recorded cash settlement payment ${cashTxId} of ${remainingDue} EGP for booking ${booking._id}`,
          );
          if (!booking.paidAmount || booking.paidAmount === 0) {
            updateData.paymentMethod = PaymentMethodEnum.cash;
          }
        } catch (paymentErr) {
          this.logger.error(
            `Failed to record cash payment for booking ${booking._id}:`,
            paymentErr,
          );
        }
      }
    } else if (updateDto.paymentStatus === PaymentStatusEnum.partially_paid) {
      const pAmount =
        typeof updateDto.paidAmount === 'number'
          ? updateDto.paidAmount
          : booking.paidAmount || 0;
      updateData.paidAmount = pAmount;
      updateData.remainingAmount = Math.max(0, bFinal - pAmount);
    } else if (
      updateDto.status === BookingStatusEnum.cancelled &&
      wasPaid &&
      actualPaidAmount > 0 &&
      booking.paymentStatus !== PaymentStatusEnum.refunded &&
      updateDto.paymentStatus !== PaymentStatusEnum.refunded
    ) {
      updateData.paymentStatus = PaymentStatusEnum.refunded;
      updateData.paidAmount = 0;
      updateData.remainingAmount = 0;
      try {
        const refundRes = await this.walletService.refundBooking(
          booking.userId,
          actualPaidAmount,
          booking._id.toString(),
        );
        refundedWalletData = refundRes?.updatedWallet;
      } catch (refundError) {
        this.logger.error('Wallet refund failed on updateStatus to cancelled:', refundError);
      }
    } else if (updateDto.paymentStatus === PaymentStatusEnum.unpaid ||
      updateDto.paymentStatus === PaymentStatusEnum.pay_at_venue
    ) {
      updateData.paidAmount = 0;
      updateData.remainingAmount = bFinal;
    } else if (updateDto.paymentStatus === PaymentStatusEnum.refunded) {
      updateData.paidAmount = 0;
      updateData.remainingAmount = 0;
      // If was paid and not already refunded, add to customer wallet
      if (wasPaid && actualPaidAmount > 0 && booking.paymentStatus !== PaymentStatusEnum.refunded) {
        try {
          const refundRes = await this.walletService.refundBooking(
            booking.userId,
            actualPaidAmount,
            booking._id.toString(),
          );
          refundedWalletData = refundRes?.updatedWallet;
        } catch (refundError) {
          this.logger.error('Wallet refund failed on updateStatus to refunded:', refundError);
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No status fields provided to update');
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: updateData,
    });

    if (
      updateDto.status === BookingStatusEnum.cancelled ||
      updateDto.status === BookingStatusEnum.expired ||
      updateDto.status === BookingStatusEnum.no_show
    ) {
      this.bookingGateway.emitSlotReleased(updatedBooking);
      if (updateDto.status === BookingStatusEnum.cancelled) {
        this.bookingGateway.emitBookingCancelled(updatedBooking, wasPaid ? actualPaidAmount : 0);
        if (refundedWalletData) {
          this.bookingGateway.emitWalletUpdated(booking.userId.toString(), {
            balance: refundedWalletData.balance,
            reason: `Admin cancellation refund for booking #${booking._id}`,
            bookingId: booking._id.toString(),
          });
        }
        this.notifyBookingCancelled(updatedBooking).catch(() => {});
      }
    } else if (
      updateDto.status === BookingStatusEnum.confirmed ||
      updateDto.status === BookingStatusEnum.completed
    ) {
      this.bookingGateway.emitBookingConfirmed(updatedBooking);
      if (updateDto.status === BookingStatusEnum.confirmed) {
        this.notifyBookingConfirmed(updatedBooking).catch(() => {});
      }
    }

    return updatedBooking;
  }

  async verifyBookingCode(bookingCode: string) {
    const booking = await this.bookingRepo.findOne({
      filter: { bookingCode },
      options: {
        populate: [
          { path: 'venueId', select: 'venueName address' },
          { path: 'userId', select: 'userName email phone status statusReason' },
        ],
      },
    });

    if (!booking) {
      throw new NotFoundException('Invalid booking code or QR code');
    }

    return {
      valid:
        booking.status !== BookingStatusEnum.cancelled &&
        booking.status !== BookingStatusEnum.expired,
      booking,
    };
  }

  async cancelUpcomingBookingsForSuspendedUser(
    userId: string | Types.ObjectId,
    suspensionReason: string,
  ): Promise<{
    cancelledCount: number;
    totalRefunded: number;
    cancelledBookings: any[];
  }> {
    const uId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    // Query active / confirmed / pending bookings for this customer
    const bookings: any[] = await this.bookingRepo.find({
      filter: {
        userId: uId,
        status: {
          $in: [
            BookingStatusEnum.confirmed,
            BookingStatusEnum.pending,
          ],
        },
      },
    });

    if (!bookings || bookings.length === 0) {
      return { cancelledCount: 0, totalRefunded: 0, cancelledBookings: [] };
    }

    // Filter to only upcoming bookings from today onwards
    const upcomingBookings = bookings.filter((b: any) => {
      if (!b.date) return false;
      const bDateVal: any = b.date;
      const bDateStr =
        typeof bDateVal === 'string'
          ? bDateVal.split('T')[0]
          : new Date(bDateVal).toISOString().split('T')[0];
      if (bDateStr > todayStr) return true;
      if (bDateStr === todayStr && (b.endTime || b.startTime) > currentHour) return true;
      return false;
    });

    const cancelledResults: any[] = [];
    let totalRefunded = 0;

    for (const booking of upcomingBookings) {
      // Calculate hours difference until match start time
      const bDate = new Date(booking.date);
      const year = bDate.getUTCFullYear();
      const month = bDate.getUTCMonth();
      const day = bDate.getUTCDate();
      const bookingStartDateTime = new Date(year, month, day, booking.startTime, 0, 0);
      const hoursDifference =
        (bookingStartDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      const wasPaid =
        booking.paymentStatus === PaymentStatusEnum.paid ||
        booking.paymentStatus === PaymentStatusEnum.partially_paid;

      const actualPaidAmount =
        booking.paidAmount !== undefined && booking.paidAmount !== null && booking.paidAmount > 0
          ? booking.paidAmount
          : wasPaid
          ? (booking.finalPrice ?? booking.totalPrice ?? 0)
          : 0;

      // Tiered refund policy on account suspension:
      // > 24 hours: 100% refund (0% penalty)
      // 3 to 24 hours: 50% refund (50% late cancellation penalty)
      // < 3 hours: 0% refund (100% fee for imminent match)
      let refundPercentage = 100;
      if (hoursDifference < 3) {
        refundPercentage = 0;
      } else if (hoursDifference < 24) {
        refundPercentage = 50;
      }

      const refundAmount = Math.round((actualPaidAmount * refundPercentage) / 100);

      let refundedWalletData: any = null;
      if (wasPaid && refundAmount > 0) {
        try {
          const refundRes = await this.walletService.refundBooking(
            booking.userId,
            refundAmount,
            booking._id.toString(),
            undefined,
            undefined,
            `Refund for booking #${booking.bookingCode || booking._id} cancelled due to account suspension (${refundPercentage}% refund: ${refundAmount} EGP)`,
          );
          refundedWalletData = refundRes?.updatedWallet;
          totalRefunded += refundAmount;
        } catch (refundError) {
          this.logger.error(
            `Wallet refund failed on auto-cancellation of booking #${booking._id}:`,
            refundError,
          );
        }
      }

      // Update booking in DB
      const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          status: BookingStatusEnum.cancelled,
          paymentStatus:
            wasPaid
              ? refundAmount > 0
                ? PaymentStatusEnum.refunded
                : PaymentStatusEnum.paid
              : PaymentStatusEnum.unpaid,
          paidAmount: 0,
          remainingAmount: 0,
          cancellationReason: `Cancelled automatically due to account suspension: ${suspensionReason || 'No reason provided'} (${refundPercentage}% refund issued: ${refundAmount} EGP)`,
          cancelledBy: 'system_suspension',
          cancelledAt: new Date(),
        },
      });

      // Emit real-time WebSockets
      if (updatedBooking) {
        this.bookingGateway.emitSlotReleased(updatedBooking);
        this.bookingGateway.emitBookingCancelled(updatedBooking, refundAmount);
      }

      if (refundedWalletData) {
        this.bookingGateway.emitWalletUpdated(booking.userId.toString(), {
          balance: refundedWalletData.balance,
          reason: `Auto-refund for booking #${booking.bookingCode || booking._id} (${refundPercentage}%) due to suspension`,
          bookingId: booking._id.toString(),
        });
      }

      // Send Push Notification to Customer
      let venueName = 'Pitch';
      if (typeof booking.venueId === 'object' && (booking.venueId as any)?.venueName) {
        venueName = (booking.venueId as any).venueName;
      } else if (booking.venueId) {
        try {
          const v = await this.venueRepo.findById(booking.venueId.toString());
          if (v?.venueName) venueName = v.venueName;
        } catch {
          // ignore lookup error
        }
      }

      const refundInfo =
        refundAmount > 0
          ? `تم استرجاع ${refundAmount} ج.م إلى محفظتك بنجاح.`
          : '';

      this.pushService
        .sendToCustomer(booking.userId, 'BOOKING_CANCELLED', {
          userName: 'Customer',
          bookingCode: booking.bookingCode || 'N/A',
          venueName,
          refundInfo,
          refundAmount: refundAmount.toString(),
        })
        .catch(() => {});

      cancelledResults.push({
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        paidAmount: actualPaidAmount,
        refundPercentage,
        refundAmount,
      });
    }

    return {
      cancelledCount: cancelledResults.length,
      totalRefunded,
      cancelledBookings: cancelledResults,
    };
  }
}
