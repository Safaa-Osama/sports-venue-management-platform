import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { UserDocument } from '../user/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { BookingGateway } from '../booking/booking.gateway';
import { PushNotificationService } from '../push-notification/push-notification.service';
import {
  CreatePaymentDto,
  MarkCashPaidDto,
  QueryPaymentDto,
  RefundPaymentDto,
} from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentRepo: PaymentRepo,
    private readonly bookingRepo: BookingRepo,
    private readonly venueRepo: VenueRepo,
    private readonly walletService: WalletService,
    private readonly paymobService: PaymobService,
    private readonly pushService: PushNotificationService,
    @Optional() private readonly bookingGateway?: BookingGateway,
  ) { }

  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomStr = randomUUID()
      .replace(/-/g, '')
      .substring(0, 8)
      .toUpperCase();
    return `TXN-${timestamp}-${randomStr}`;
  }

  async createPayment(body: CreatePaymentDto, user: UserDocument) {
    const { bookingId, paymentMethod } = body;

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      booking.userId.toString() !== user._id.toString() &&
      user.role === RoleEnum.customer
    ) {
      throw new UnauthorizedException('You can only pay for your own bookings');
    }

    if (booking.paymentStatus === PaymentStatusEnum.paid) {
      throw new BadRequestException('Booking is already paid');
    }

    if (
      booking.status === BookingStatusEnum.cancelled ||
      booking.status === BookingStatusEnum.expired
    ) {
      throw new BadRequestException(
        `Cannot process payment for the ${booking.status} booking`,
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

    let paymentAmount = totalGroupFinalPrice;
    let isDepositOnly = false;
    if (
      venue?.minimumDepositAmount !== undefined &&
      venue?.minimumDepositAmount !== null &&
      venue.minimumDepositAmount > 0
    ) {
      const depositRequired =
        targetBookings.length * venue.minimumDepositAmount;
      paymentAmount = Math.min(depositRequired, totalGroupFinalPrice);
      isDepositOnly = paymentAmount < totalGroupFinalPrice;
    }

    const targetPaymentStatus = isDepositOnly
      ? PaymentStatusEnum.partially_paid
      : PaymentStatusEnum.paid;

    const transactionId = this.generateTransactionId();

    if (paymentMethod === PaymentMethodEnum.wallet) {
      await this.walletService.payForBooking(
        user._id,
        paymentAmount,
        booking._id.toString(),
      );

      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        groupId: booking.groupId,
        userId: user._id,
        amount: paymentAmount,
        paymentMethod: PaymentMethodEnum.wallet,
        transactionId,
        status: targetPaymentStatus,
        paidAt: new Date(),
      });

      for (const b of targetBookings) {
        const bookingFinal = b.finalPrice ?? b.totalPrice ?? 0;
        const bPaid = isDepositOnly
          ? Number(((bookingFinal / (totalGroupFinalPrice || 1)) * paymentAmount).toFixed(2))
          : bookingFinal;
        const bRemaining = Math.max(0, Number((bookingFinal - bPaid).toFixed(2)));
        const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            paymentStatus: targetPaymentStatus,
            status: BookingStatusEnum.confirmed,
            paymentMethod: PaymentMethodEnum.wallet,
            paidAmount: bPaid,
            remainingAmount: bRemaining,
            expiresAt: null,
          },
        });
        if (this.bookingGateway && updatedBooking) {
          this.bookingGateway.emitBookingConfirmed(updatedBooking);
        }
      }

      return {
        message: 'Payment processed successfully via wallet',
        data: payment,
      };
    }

    if (paymentMethod === PaymentMethodEnum.cash) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        groupId: booking.groupId,
        userId: user._id,
        amount: paymentAmount,
        paymentMethod: PaymentMethodEnum.cash,
        transactionId,
        status: PaymentStatusEnum.pay_at_venue,
      });

      for (const b of targetBookings) {
        const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            paymentStatus: PaymentStatusEnum.pay_at_venue,
            paymentMethod: PaymentMethodEnum.cash,
            expiresAt: null,
          },
        });
        if (this.bookingGateway && updatedBooking) {
          this.bookingGateway.emitBookingConfirmed(updatedBooking);
        }
      }

      return {
        message: 'Pay at venue selected. Please present payment upon arrival.',
        data: payment,
      };
    }

    if (paymentMethod === PaymentMethodEnum.paymob) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        groupId: booking.groupId,
        userId: user._id,
        amount: paymentAmount,
        paymentMethod: PaymentMethodEnum.paymob,
        transactionId,
        status: PaymentStatusEnum.unpaid,
      });

      const anyUser: any = user;
      const checkoutData = await this.paymobService.createPaymentIntention({
        bookingId: booking.groupId || booking._id.toString(),
        transactionId,
        amount: paymentAmount,
        userEmail: anyUser.email || undefined,
        userName: anyUser.userName || 'Customer',
        userPhone: (Array.isArray(anyUser.phone) ? anyUser.phone[0] : anyUser.phone) || '+201000000000',
      });

      for (const b of targetBookings) {
        await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            paymentMethod: PaymentMethodEnum.paymob,
          },
        });
      }

      return {
        message: 'Online payment initiated',
        data: {
          payment,
          paymentGatewayLink: checkoutData.redirectUrl,
        },
      };
    }

    throw new BadRequestException('Unsupported payment method');
  }

  async getMyPayments(user: UserDocument, query: QueryPaymentDto) {
    const { page = 1, limit = 10, status, paymentMethod } = query;
    const filter: any = { userId: user._id };

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    const result = await this.paymentRepo.paginate({
      page,
      limit,
      search: filter,
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'bookingId',
          select:
            'bookingCode date startTime endTime totalPrice finalPrice status',
        },
      ],
    });

    return {
      message: 'Payments retrieved successfully',
      ...result,
    };
  }

  async getAllPayments(query: QueryPaymentDto & { startDate?: string; endDate?: string; search?: string }) {
    const { page = 1, limit = 50, status, paymentMethod, startDate, endDate, search } = query;
    const filter: any = {};

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { transactionId: { $regex: q, $options: 'i' } },
        { referenceId: { $regex: q, $options: 'i' } },
        { 'paymobOrder.id': isNaN(Number(q)) ? undefined : Number(q) },
      ].filter(Boolean);
    }

    const result = await this.paymentRepo.paginate({
      page,
      limit,
      search: filter,
      sort: { createdAt: -1 },
      populate: [
        { path: 'userId', select: 'userName email phone name' },
        {
          path: 'bookingId',
          select: 'bookingCode date startTime endTime totalPrice finalPrice venueId venueName customerName customerPhone',
          populate: { path: 'venueId', select: 'venueName name address' },
        },
      ],
    });

    return {
      message: 'Payments retrieved successfully',
      ...result,
    };
  }

  async getVenuePayments(
    venueId: string,
    query: QueryPaymentDto,
    user: UserDocument,
  ) {
    const venue = await this.venueRepo.findById(venueId);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const { page = 1, limit = 10, status, paymentMethod } = query;
    const bookings = await this.bookingRepo.find({
      filter: { venueId: new Types.ObjectId(venueId) },
    });
    const bookingIds = bookings.map((b) => b._id);

    const filter: any = { bookingId: { $in: bookingIds } };
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    const result = await this.paymentRepo.paginate({
      page,
      limit,
      search: filter,
      sort: { createdAt: -1 },
      populate: [
        { path: 'userId', select: 'userName email phone' },
        {
          path: 'bookingId',
          select: 'bookingCode date startTime endTime finalPrice',
        },
      ],
    });

    const completedPayments = await this.paymentRepo.find({
      filter: {
        bookingId: { $in: bookingIds },
        status: PaymentStatusEnum.paid,
      },
    });

    const totalRevenue = completedPayments.reduce(
      (sum, p) => sum + (p.amount || 0) - (p.refundedAmount || 0),
      0,
    );

    return {
      message: 'Venue payments retrieved successfully',
      totalRevenue,
      ...result,
    };
  }

  async getPaymentById(id: string, user: UserDocument) {
    const payment = await this.paymentRepo.findOne({
      filter: { _id: id },
      options: {
        populate: [
          { path: 'userId', select: 'userName email phone' },
          {
            path: 'bookingId',
            select:
              'bookingCode date startTime endTime totalPrice finalPrice status',
          },
        ],
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    // Authorization check
    const isOwner = payment.userId._id.toString() === user._id.toString();
    const isStaffOrAdmin = [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ].includes(user.role);

    if (!isOwner && !isStaffOrAdmin) {
      throw new ForbiddenException(
        'You are not authorized to view this payment',
      );
    }

    return {
      message: 'Payment details retrieved successfully',
      data: payment,
    };
  }

  async markCashPaid(id: string, body: MarkCashPaidDto, user: UserDocument) {
    const payment = await this.paymentRepo.findById(id);
    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (payment.status === PaymentStatusEnum.paid) {
      throw new BadRequestException('Payment is already marked as paid');
    }

    if (payment.status === PaymentStatusEnum.refunded) {
      throw new BadRequestException('Cannot mark a refunded payment as paid');
    }

    payment.status = PaymentStatusEnum.paid;
    payment.paidAt = new Date();
    await payment.save();

    const targetBookings = payment.groupId
      ? await this.bookingRepo.find({
          filter: { groupId: payment.groupId },
        })
      : payment.bookingId
        ? [await this.bookingRepo.findById(payment.bookingId)].filter(Boolean)
        : [];

    for (const b of targetBookings) {
      if (!b) continue;
      const updated = await this.bookingRepo.findByIdAndUpdate({
        id: b._id,
        update: {
          paymentStatus: PaymentStatusEnum.paid,
          status: BookingStatusEnum.confirmed,
          expiresAt: null,
        },
      });
      if (this.bookingGateway && updated) {
        this.bookingGateway.emitBookingConfirmed(updated);
      }
      if (updated && payment.userId) {
        this.pushService.sendToCustomer(
          payment.userId.toString(),
          'PAYMENT_APPROVED',
          {
            bookingCode: updated.bookingCode || '',
          },
          {
            route: '/',
            bookingId: updated._id?.toString(),
          },
        ).catch(() => {});
      }
    }

    return {
      message: 'Cash payment marked as received successfully',
      data: payment,
    };
  }

  async refundPayment(id: string, body: RefundPaymentDto, user: UserDocument) {
    const payment = await this.paymentRepo.findById(id);
    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (
      payment.status !== PaymentStatusEnum.paid &&
      payment.status !== PaymentStatusEnum.partially_paid
    ) {
      throw new BadRequestException(
        'Only completed or partially paid payments can be refunded',
      );
    }

    const availableToRefund = payment.amount - (payment.refundedAmount || 0);
    const refundAmount = body.amount || availableToRefund;

    if (refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    if (refundAmount > availableToRefund) {
      throw new BadRequestException(
        `Refund amount cannot exceed remaining refundable balance of ${availableToRefund}`,
      );
    }

    // Credit refunded amount back to user's wallet
    const refundRes = await this.walletService.refundBooking(
      payment.userId,
      refundAmount,
      payment.bookingId
        ? payment.bookingId.toString()
        : payment.groupId || 'GROUP_REFUND',
    );

    if (this.bookingGateway && refundRes?.updatedWallet) {
      this.bookingGateway.emitWalletUpdated(payment.userId.toString(), {
        balance: refundRes.updatedWallet.balance,
        reason: body.reason || 'Booking cancelled and refunded to wallet',
        bookingId: payment.bookingId?.toString(),
      });
    }

    const newRefundedTotal = (payment.refundedAmount || 0) + refundAmount;
    payment.refundedAmount = newRefundedTotal;
    payment.refundReason =
      body.reason || 'Booking cancelled and refunded to wallet';

    if (newRefundedTotal >= payment.amount) {
      payment.status = PaymentStatusEnum.refunded;
    }

    await payment.save();

    const targetBookings = payment.groupId
      ? await this.bookingRepo.find({
          filter: { groupId: payment.groupId },
        })
      : payment.bookingId
        ? [await this.bookingRepo.findById(payment.bookingId)].filter(Boolean)
        : [];

    for (const b of targetBookings) {
      if (!b) continue;
      await this.bookingRepo.findByIdAndUpdate({
        id: b._id,
        update: {
          status: BookingStatusEnum.cancelled,
          paymentStatus: PaymentStatusEnum.refunded,
          paidAmount: 0,
          remainingAmount: 0,
          expiresAt: null,
        },
      });
      if (this.bookingGateway) {
        this.bookingGateway.emitSlotReleased(b);
        this.bookingGateway.emitBookingCancelled(b, refundAmount);
      }
    }

    return {
      message: `Payment refund of ${refundAmount} EGP processed successfully to user wallet`,
      data: payment,
    };
  }

  async handlePaymobWebhook(payload: any, hmac?: string) {
    const isValidHmac = this.paymobService.verifyWebhookHmac(payload, hmac);
    if (!isValidHmac) {
      throw new UnauthorizedException('Invalid Paymob HMAC signature');
    }

    const obj = payload?.obj;
    if (!obj) {
      this.logger.warn('[PaymentService] Missing obj in Paymob webhook payload');
      return {
        received: true,
        note: 'Missing obj in Paymob webhook payload',
      };
    }

    const specialReference = obj.order?.merchant_order_id;
    if (!specialReference) {
      this.logger.warn(
        '[PaymentService] Missing obj.order.merchant_order_id in Paymob webhook payload',
      );
      return {
        received: true,
        note: 'Missing obj.order.merchant_order_id in Paymob webhook payload',
      };
    }

    const isSuccess = obj.success === true;
    const isPending = obj.pending === true;

    const payment = await this.paymentRepo.findOne({
      filter: { transactionId: specialReference },
    });

    if (!payment) {
      this.logger.warn(
        `[PaymentService] No matching payment record found for transactionId/specialReference: ${specialReference}`,
      );
      return {
        received: true,
        note: 'No matching payment record found',
        specialReference,
      };
    }

    this.logger.log(
      `[PaymentService] Located payment record: ID=${payment._id} | Amount=${payment.amount} EGP | Status=${payment.status} | GroupId=${payment.groupId || 'NONE'}`,
    );

    // 2. Fetch associated booking(s)
    let booking: any = null;
    let groupBookings: any[] = [];
    if (payment.groupId) {
      groupBookings = await this.bookingRepo.find({
        filter: { groupId: payment.groupId },
      });
      booking = groupBookings[0] || null;
    }

    if (!booking && payment.bookingId) {
      booking = await this.bookingRepo.findById(payment.bookingId);
      if (booking && booking.groupId && groupBookings.length === 0) {
        groupBookings = await this.bookingRepo.find({
          filter: { groupId: booking.groupId },
        });
      }
    }

    if (!booking) {
      this.logger.warn(
        `No booking found associated with payment ${payment._id}`,
      );
      return {
        received: true,
        note: 'No matching booking record found for payment',
        paymentId: payment._id,
      };
    }

    // 3. Deduplication check: Check if this specific Paymob transaction ID was already fulfilled
    if (obj.id) {
      const existingTxnPayment = await this.paymentRepo.findOne({
        filter: {
          paymobTransactionId: String(obj.id),
          status: PaymentStatusEnum.paid,
          _id: { $ne: payment._id },
        },
      });
      if (existingTxnPayment) {
        return {
          received: true,
          status: PaymentStatusEnum.paid,
          note: `Webhook already processed. Duplicate callback on Paymob transaction ID ${obj.id}.`,
        };
      }
    }

    // 4. Idempotency check: Already processed
    if (payment.status === PaymentStatusEnum.paid) {
      return {
        received: true,
        status: payment.status,
        note: 'Webhook already processed. Payment is marked as paid.',
      };
    }

    if (payment.status === PaymentStatusEnum.refunded) {
      return {
        received: true,
        status: payment.status,
        note: 'Webhook already processed. Payment was previously refunded.',
      };
    }

    // 5. Handle Success Path
    if (isSuccess && !isPending) {
      const now = new Date();
      let targetBookings: any[] = [];
      const targetGroupId = payment.groupId || booking.groupId;
      if (targetGroupId) {
        if (groupBookings && groupBookings.length > 0) {
          targetBookings = groupBookings;
        } else {
          const found = await this.bookingRepo.find({
            filter: { groupId: targetGroupId },
          });
          if (found && found.length > 0) {
            targetBookings = found;
          }
        }
      }
      if (!targetBookings.length) {
        targetBookings = [booking];
      }

      const totalGroupDue = targetBookings.reduce(
        (sum, b) => sum + (b.finalPrice ?? b.totalPrice ?? 0),
        0,
      );

      // Extract effective amount from webhook amount_cents if provided
      const paidCents = Number(obj.amount_cents);
      const effectiveCardPaid =
        !isNaN(paidCents) && paidCents > 0
          ? Number((paidCents / 100).toFixed(2))
          : payment.amount || 0;

      const walletDeduction = Number(payment.walletDeduction || 0);
      const totalActualPaid = Number(
        (effectiveCardPaid + walletDeduction).toFixed(2),
      );

      if (effectiveCardPaid > 0 && effectiveCardPaid !== payment.amount) {
        payment.amount = effectiveCardPaid;
      }

      const isDeposit = totalActualPaid < totalGroupDue;
      const targetPaymentStatus = isDeposit
        ? PaymentStatusEnum.partially_paid
        : PaymentStatusEnum.paid;

      const isAnyExpiredOrCancelled = targetBookings.some((b) => {
        return (
          b.status === BookingStatusEnum.expired ||
          b.status === BookingStatusEnum.cancelled ||
          (b.status === BookingStatusEnum.pending &&
            b.expiresAt &&
            new Date(b.expiresAt) <= now)
        );
      });

      // Handle late payment on expired or cancelled booking: auto-refund to user wallet
      if (isAnyExpiredOrCancelled) {
        payment.status = PaymentStatusEnum.refunded;
        payment.paidAt = new Date();
        payment.refundedAmount = payment.amount;
        payment.refundReason =
          'Late payment received after booking hold expired or was cancelled. Automatically credited to wallet.';
        await payment.save();

        await this.walletService.refundBooking(
          payment.userId,
          payment.amount,
          payment.bookingId
            ? payment.bookingId.toString()
            : payment.groupId || 'GROUP_REFUND',
        );

        for (const b of targetBookings) {
          if (b.status !== BookingStatusEnum.cancelled) {
            await this.bookingRepo.findByIdAndUpdate({
              id: b._id,
              update: {
                status: BookingStatusEnum.expired,
                paymentStatus: PaymentStatusEnum.refunded,
              },
            });
          }
        }

        return {
          received: true,
          status: PaymentStatusEnum.refunded,
          note: 'Booking hold had expired. Payment automatically refunded to user wallet.',
        };
      }

      // Normal Success Confirmation with Atomic Compare-and-Set
      const updatedPayment = await this.paymentRepo.findOneAndUpdate({
        filter: {
          _id: payment._id,
          status: {
            $nin: [PaymentStatusEnum.paid, PaymentStatusEnum.partially_paid],
          },
        },
        update: {
          status: targetPaymentStatus,
          paidAt: new Date(),
          ...(obj.id ? { paymobTransactionId: String(obj.id) } : {}),
        },
      });

      if (!updatedPayment) {
        return {
          received: true,
          status: payment.status,
          note: 'Payment was already fulfilled by concurrent callback.',
        };
      }

      if (payment.walletDeduction && payment.walletDeduction > 0) {
        try {
          await this.walletService.payForBooking(
            payment.userId,
            payment.walletDeduction,
            payment.bookingId
              ? payment.bookingId.toString()
              : payment.groupId || 'PAYMOB_WALLET_SPLIT',
          );
        } catch (wErr) {
          this.logger.error('Wallet deduction on Paymob success error:', wErr);
        }
      }

      const confirmedBookings: any[] = [];
      for (const b of targetBookings) {
        const bookingFinal = b.finalPrice ?? b.totalPrice ?? 0;
        const bPaid = isDeposit
          ? Number(
              (
                (bookingFinal / (totalGroupDue || 1)) *
                totalActualPaid
              ).toFixed(2),
            )
          : bookingFinal;
        const bRemaining = Math.max(
          0,
          Number((bookingFinal - bPaid).toFixed(2)),
        );
        const updated = await this.bookingRepo.findByIdAndUpdate({
          id: b._id,
          update: {
            paymentStatus: targetPaymentStatus,
            status: BookingStatusEnum.confirmed,
            paidAmount: bPaid,
            remainingAmount: bRemaining,
            expiresAt: null,
          },
        });
        if (updated) {
          confirmedBookings.push(updated);
          if (this.bookingGateway) {
            this.bookingGateway.emitBookingConfirmed(updated);
          }
        }
      }

      // Emit real-time Socket.IO events to update mobile app and venue dashboard
      if (this.bookingGateway && confirmedBookings.length > 0) {
        try {
          const venue = await this.venueRepo.findById(booking.venueId);
          if (venue?.createdBy) {
            this.bookingGateway.emitOwnerNotification(
              venue.createdBy.toString(),
              confirmedBookings[0],
              'booking_confirmed',
            );
          }
        } catch (socketErr: any) {
          this.logger.warn(
            `Failed to emit socket event: ${socketErr?.message || socketErr}`,
          );
        }
      }

      this.logger.log(
        `[PaymentService] >>> PAYMENT SUCCESS CONFIRMED: Payment ${payment._id} -> ${targetPaymentStatus}. Confirmed ${confirmedBookings.length} booking(s). Paymob Txn ID: ${obj.id || 'N/A'}`,
      );
      return {
        received: true,
        status: targetPaymentStatus,
        groupId: payment.groupId || booking.groupId,
        bookingId: booking._id,
        transactionId: obj.id,
      };
    } else if (!isSuccess && !isPending) {
      const currentStatus = String(payment.status);
      if (
        currentStatus === PaymentStatusEnum.paid ||
        currentStatus === PaymentStatusEnum.partially_paid ||
        currentStatus === PaymentStatusEnum.refunded
      ) {
        return {
          received: true,
          status: payment.status,
          note: 'Ignored failed webhook for already completed payment',
        };
      }
      payment.status = PaymentStatusEnum.unpaid;
      await payment.save();
      return {
        received: true,
        status: payment.status,
        message: obj.data?.message || 'Transaction was declined or failed',
      };
    }

    return { received: true, status: payment.status };
  }

  /**
   * Automated server-side reconciliation cron job running every 5 minutes.
   * Inquires Paymob for any payment stuck in 'unpaid' between 5 minutes and 2 hours ago.
   * If approved on Paymob, automatically fulfills the booking and payment.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingPayments() {
    try {
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const twoHoursAgo = new Date(now - 120 * 60 * 1000);

      const pendingPayments = await this.paymentRepo.find({
        filter: {
          paymentMethod: PaymentMethodEnum.paymob,
          status: PaymentStatusEnum.unpaid,
          createdAt: { $gte: twoHoursAgo, $lte: fiveMinutesAgo },
        },
      });

      if (!pendingPayments || pendingPayments.length === 0) {
        return;
      }

      for (const payment of pendingPayments) {
        const refId = payment.transactionId;
        if (!refId) continue;

        const remoteTxn = await this.paymobService.inquireTransactionByReference(refId);
        if (remoteTxn) {
          const isSuccess =
            remoteTxn.success === true ||
            remoteTxn.success === 'true' ||
            remoteTxn.txn_response_code === 'APPROVED' ||
            remoteTxn.data?.message === 'Approved';

          if (isSuccess && !remoteTxn.pending) {
            this.logger.log(
              `[Reconciliation] Fulfilling payment for reference ${refId} (Paymob Txn ID: ${remoteTxn.id})`,
            );
            await this.handlePaymobWebhook(
              {
                transaction: remoteTxn,
                special_reference: refId,
              },
              'reconciliation-internal',
            );
          }
        }
      }
    } catch (cronErr: any) {
      this.logger.error(
        'Error during payment reconciliation cron:',
        cronErr?.message || cronErr,
      );
    }
  }
}
