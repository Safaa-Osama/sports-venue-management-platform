import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { RoleEnum } from 'src/common/enums/userEnum';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import RedisService from 'src/common/services/redis/redis.service';
import { calculateCouponDiscount } from '../coupon/utils/coupon-calculator.utils';
import { UserDocument } from '../user/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { BookingGateway } from './booking.gateway';
import {
  CreateBookingDto,
  CreatePaymentDto,
  QueryBookingDto,
  UpdateBookingStatusDto,
} from './dto/booking.dto';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

const HOLD_DURATION_MINUTES = 15;
const CANCELLATION_DEADLINE_HOURS = 24;

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepo: BookingRepo,
    private readonly paymentRepo: PaymentRepo,
    private readonly venueRepo: VenueRepo,
    private readonly walletService: WalletService,
    private readonly couponRepo: CouponRepo,
    private readonly paymobService: PaymobService,
    private readonly bookingGateway: BookingGateway,
    private readonly redisService: RedisService,
    @InjectConnection() private readonly connection: Connection,
  ) { }

  async getAvailability(venueId: string, startDate?: string, endDate?: string) {
    const filter: any = {
      venueId,
      status: {
        $in: [BookingStatusEnum.confirmed, BookingStatusEnum.pending],
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

    return validOverlaps.map((b) => ({
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
    }));
  }

  private computeRequestFingerprint(body: CreateBookingDto): string {
    const canonical = {
      venueId: body.venueId.toString(),
      date: new Date(body.date).toISOString().split('T')[0],
      startTime: Number(body.startTime),
      endTime: Number(body.endTime),
      couponCode: body.couponCode ? body.couponCode.trim().toUpperCase() : null,
      paymentMethod: body.paymentMethod,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

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

  async createBooking(
    body: CreateBookingDto,
    user: UserDocument,
    idempotencyKey?: string,
  ) {
    const { venueId, date, startTime, endTime, couponCode, paymentMethod } =
      body;
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
      console.log(cached);

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

        const reconstructedResponse = {
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
      const venue = await this.venueRepo.findById(venueId);
      if (!venue) {
        throw new NotFoundException('Venue not found');
      }

      if (!venue.isActive) {
        throw new BadRequestException('Venue is currently inactive');
      }

      if (
        startTime < venue.startWorkingHours ||
        endTime > venue.endWorkingHours
      ) {
        throw new BadRequestException(
          `Booking hours must be between venue operating hours (${venue.startWorkingHours}:00 - ${venue.endWorkingHours}:00)`,
        );
      }

      const bookingDate = new Date(date);
      const startOfDay = new Date(bookingDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(bookingDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const now = new Date();
      const slotStartDateTime = new Date(startOfDay);
      slotStartDateTime.setUTCHours(startTime, 0, 0, 0);

      if (slotStartDateTime.getTime() <= now.getTime()) {
        throw new BadRequestException('Cannot book a time slot in the past');
      }

      const lockKey = `lock::booking::venue::${venue._id.toString()}::${startOfDay.toISOString()}`;
      let lockAcquired = false;
      for (let i = 0; i < 10; i++) {
        lockAcquired = await this.redisService.acquireLock(lockKey, 5);
        if (lockAcquired) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      try {
        const existingBookings = await this.bookingRepo.find({
          filter: {
            venueId: venue._id,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: {
              $in: [BookingStatusEnum.confirmed, BookingStatusEnum.pending],
            },
            $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
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

        if (validOverlaps.length > 0) {
          throw new ConflictException(
            'Selected time slot is already booked or reserved for this venue',
          );
        }

        let totalPrice = 0;
        const durationHours = endTime - startTime;

        if (venue.customHourPrices && venue.customHourPrices.length > 0) {
          for (let hour = startTime; hour < endTime; hour++) {
            const customPrice = venue.customHourPrices.find(
              (c) => c.hour === hour,
            );
            if (
              customPrice &&
              typeof customPrice.pricePerHour === 'number' &&
              customPrice.pricePerHour >= 0
            ) {
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
            totalPrice,
          );
          discountAmount = discountResult.discountAmount;
          finalPrice = discountResult.finalPrice;
        }

        if (paymentMethod === PaymentMethodEnum.wallet) {
          const wallet = await this.walletService.getOrCreateWallet(user._id);
          if (wallet.balance < finalPrice) {
            throw new BadRequestException(
              `Insufficient wallet balance. Required: ${finalPrice}, Available: ${wallet.balance}`,
            );
          }
        }

        const expiresAt = new Date(
          Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
        );

        const bookingCode = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .substring(2, 6)
          .toUpperCase()}`;

        const qrPayload = JSON.stringify({
          bookingCode,
          venueId: venue._id,
          userId: user._id,
          date: startOfDay.toISOString().split('T')[0],
          startTime,
          endTime,
        });

        const qrCode = await QRCode.toDataURL(qrPayload);

        const booking = await this.bookingRepo.create({
          userId: user._id,
          venueId: venue._id,
          date: startOfDay,
          startTime,
          endTime,
          totalPrice: Number(totalPrice.toFixed(2)),
          discountAmount: Number(discountAmount.toFixed(2)),
          finalPrice: Number(finalPrice.toFixed(2)),
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

        this.bookingGateway.emitSlotLocked(booking);
        if (venue.createdBy) {
          this.bookingGateway.emitOwnerNotification(
            venue.createdBy.toString(),
            booking,
            'NEW_PENDING_BOOKING',
          );
        }

        let paymentResult: any;
        try {
          paymentResult = await this.payBooking(
            booking._id.toString(),
            { paymentMethod, couponCode: normalizedCouponCode },
            user,
          );
        } catch (payError) {
          await this.bookingRepo.findByIdAndDelete(booking._id);
          this.bookingGateway.emitSlotReleased(booking);
          throw payError;
        }

        const latestBooking = await this.bookingRepo.findById(booking._id);
        const responseData = {
          booking: latestBooking || booking,
          payment: paymentResult,
        };

        // Store in Redis with 24-hour TTL for idempotency replay
        if (effectiveIdemKey) {
          try {
            await this.redisService.setValue({
              key: effectiveIdemKey,
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

  private async payForBookingCompensating(
    user: UserDocument,
    amountToPay: number,
    booking: any,
    activeCouponCode?: string,
  ) {
    await this.walletService.payForBooking(
      user._id,
      amountToPay,
      booking._id.toString(),
    );

    let updatedBooking: any;
    try {
      updatedBooking = await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.paid,
          paymentMethod: PaymentMethodEnum.wallet,
          expiresAt: null,
        },
      });

      if (activeCouponCode) {
        const coupon = await this.couponRepo.findOne({
          filter: { code: activeCouponCode },
        });
        if (coupon) {
          coupon.usesCount += 1;
          await coupon.save();
        }
      }
    } catch (confirmError) {
      await this.walletService.refundBooking(
        user._id,
        amountToPay,
        booking._id.toString(),
      );
      throw confirmError;
    }

    this.bookingGateway.emitBookingConfirmed(updatedBooking);
    return updatedBooking;
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

    const amountToPay = booking.finalPrice ?? booking.totalPrice;
    const activeCouponCode = couponCode
      ? couponCode.trim().toUpperCase()
      : booking.couponCode
        ? booking.couponCode.trim().toUpperCase()
        : undefined;

    if (paymentMethod === PaymentMethodEnum.wallet) {
      let session: ClientSession | null = null;
      try {
        session = await this.connection.startSession();
        session.startTransaction();
      } catch {
        session = null;
      }

      if (session) {
        try {
          await this.walletService.payForBooking(
            user._id,
            amountToPay,
            booking._id.toString(),
            session,
          );

          const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
            id: booking._id,
            update: {
              status: BookingStatusEnum.confirmed,
              paymentStatus: PaymentStatusEnum.paid,
              paymentMethod: PaymentMethodEnum.wallet,
              expiresAt: null,
            },
            options: { session },
          });

          if (activeCouponCode) {
            await this.couponRepo.findOneAndUpdate({
              filter: { code: activeCouponCode },
              update: { $inc: { usesCount: 1 } },
              options: { session },
            });
          }
          await session.commitTransaction();

          this.bookingGateway.emitBookingConfirmed(updatedBooking!);
          return updatedBooking;
        } catch (txnError: any) {
          try {
            await session.abortTransaction();
            await session.endSession();
          } catch { }

          const isReplicaSetError =
            txnError?.code === 20 ||
            txnError?.errorResponse?.code === 20 ||
            txnError?.message?.includes('replica set') ||
            txnError?.message?.includes('Transaction numbers');

          if (isReplicaSetError) {
            return await this.payForBookingCompensating(
              user,
              amountToPay,
              booking,
              activeCouponCode,
            );
          }
          throw txnError;
        } finally {
          try {
            if (session?.inTransaction()) {
              await session.abortTransaction();
            }
            await session.endSession();
          } catch { }
        }
      } else {
        return await this.payForBookingCompensating(
          user,
          amountToPay,
          booking,
          activeCouponCode,
        );
      }
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
        const coupon = await this.couponRepo.findOne({
          filter: { code: activeCouponCode },
        });
        if (coupon) {
          coupon.usesCount += 1;
          await coupon.save();
        }
      }

      this.bookingGateway.emitBookingConfirmed(updatedBooking);
      return updatedBooking;
    }

    if (paymentMethod === PaymentMethodEnum.paymob) {
      const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${randomUUID()
        .replace(/-/g, '')
        .substring(0, 8)
        .toUpperCase()}`;

      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: amountToPay,
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
        bookingId: booking._id.toString(),
        transactionId,
        amount: amountToPay,
        userEmail: anyUser.email || 'player@arenahub.com',
        userName: anyUser.userName || anyUser.name || 'Arena Player',
        userPhone,
      });

      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          paymentMethod: PaymentMethodEnum.paymob,
        },
      });

      return {
        message: 'Paymob checkout session initiated',
        bookingId: booking._id,
        paymentId: payment._id,
        transactionId,
        amountToPay,
        currency: 'EGP',
        clientSecret: checkoutData.clientSecret,
        publicKey: checkoutData.publicKey,
        redirectUrl: checkoutData.redirectUrl,
        status: BookingStatusEnum.pending,
      };
    }

    throw new BadRequestException('Unsupported payment method');
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

  async getBookingById(id: string, user: UserDocument) {
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

    if (
      booking.paymentStatus === PaymentStatusEnum.paid &&
      booking.paymentMethod === PaymentMethodEnum.wallet
    ) {
      const refundAmount = booking.finalPrice ?? booking.totalPrice;
      const session = await this.connection.startSession();
      session.startTransaction();

      try {
        await this.walletService.refundBooking(
          booking.userId,
          refundAmount,
          booking._id.toString(),
          undefined,
          session,
        );

        const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
          id: booking._id,
          update: {
            status: BookingStatusEnum.cancelled,
            paymentStatus: PaymentStatusEnum.refunded,
            expiresAt: null,
          },
          options: { session },
        });

        await session.commitTransaction();
        this.bookingGateway.emitSlotReleased(updatedBooking!);
        return updatedBooking;
      } catch (refundError) {
        await session.abortTransaction();
        throw refundError;
      } finally {
        await session.endSession();
      }
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: { status: BookingStatusEnum.cancelled, expiresAt: null },
    });
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
    if (updateDto.paymentStatus)
      updateData.paymentStatus = updateDto.paymentStatus;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No status fields provided to update');
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
      id: booking._id,
      update: updateData,
    });

    if (
      updateDto.status === BookingStatusEnum.cancelled ||
      updateDto.status === BookingStatusEnum.expired
    ) {
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
      valid:
        booking.status !== BookingStatusEnum.cancelled &&
        booking.status !== BookingStatusEnum.expired,
      booking,
    };
  }
}
