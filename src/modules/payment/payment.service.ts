import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
import {
  CreatePaymentDto,
  MarkCashPaidDto,
  QueryPaymentDto,
  RefundPaymentDto,
} from './dto/payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepo: PaymentRepo,
    private readonly bookingRepo: BookingRepo,
    private readonly venueRepo: VenueRepo,
    private readonly walletService: WalletService,
    private readonly paymobService: PaymobService,
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

    const transactionId = this.generateTransactionId();
    const paymentAmount = booking.finalPrice ?? booking.totalPrice ?? 0;

    if (paymentMethod === PaymentMethodEnum.wallet) {
      await this.walletService.payForBooking(
        user._id,
        paymentAmount,
        booking._id.toString(),
      );

      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: paymentAmount,
        paymentMethod: PaymentMethodEnum.wallet,
        transactionId,
        status: PaymentStatusEnum.paid,
        paidAt: new Date(),
      });

      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          paymentStatus: PaymentStatusEnum.paid,
          status: BookingStatusEnum.confirmed,
          paymentMethod: PaymentMethodEnum.wallet,
          expiresAt: null,
        },
      });

      return {
        message: 'Payment processed successfully via wallet',
        data: payment,
      };
    }

    if (paymentMethod === PaymentMethodEnum.cash) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: paymentAmount,
        paymentMethod: PaymentMethodEnum.cash,
        transactionId,
        status: PaymentStatusEnum.pay_at_venue,
      });

      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          paymentStatus: PaymentStatusEnum.pay_at_venue,
          paymentMethod: PaymentMethodEnum.cash,
          expiresAt: null,
        },
      });

      return {
        message: 'Pay at venue selected. Please present payment upon arrival.',
        data: payment,
      };
    }

    if (paymentMethod === PaymentMethodEnum.paymob) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: paymentAmount,
        paymentMethod: PaymentMethodEnum.paymob,
        transactionId,
        status: PaymentStatusEnum.unpaid,
      });

      const anyUser: any = user;
      const checkoutData = await this.paymobService.createPaymentIntention({
        bookingId: booking._id.toString(),
        transactionId,
        amount: paymentAmount,
        userEmail: anyUser.email || undefined,
        userName: anyUser.userName || 'Customer',
        userPhone: anyUser.phone[0] || undefined,
      });

      await this.bookingRepo.findByIdAndUpdate({
        id: booking._id,
        update: {
          paymentMethod: PaymentMethodEnum.paymob,
        },
      });

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

    await this.bookingRepo.findByIdAndUpdate({
      id: payment.bookingId,
      update: {
        paymentStatus: PaymentStatusEnum.paid,
        status: BookingStatusEnum.confirmed,
        expiresAt: null,
      },
    });

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

    if (payment.status !== PaymentStatusEnum.paid) {
      throw new BadRequestException(
        'Only completed/paid payments can be refunded',
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
    await this.walletService.refundBooking(
      payment.userId,
      refundAmount,
      payment.bookingId.toString(),
    );

    const newRefundedTotal = (payment.refundedAmount || 0) + refundAmount;
    payment.refundedAmount = newRefundedTotal;
    payment.refundReason =
      body.reason || 'Booking cancelled and refunded to wallet';

    if (newRefundedTotal >= payment.amount) {
      payment.status = PaymentStatusEnum.refunded;
    }

    await payment.save();

    // Cancel related booking and mark payment status as refunded
    await this.bookingRepo.findByIdAndUpdate({
      id: payment.bookingId,
      update: {
        status: BookingStatusEnum.cancelled,
        paymentStatus: PaymentStatusEnum.refunded,
      },
    });

    return {
      message: `Payment refund of ${refundAmount} EGP processed successfully to user wallet`,
      data: payment,
    };
  }

  async handlePaymobWebhook(payload: any, hmacHeader?: string) {
    const isValidHmac = this.paymobService.verifyWebhookHmac(
      payload,
      hmacHeader,
    );
    if (!isValidHmac) {
      throw new UnauthorizedException('Invalid Paymob HMAC signature');
    }

    const obj = payload?.obj || payload;
    const { success, pending, order } = obj || {};
    const merchantOrderId =
      order?.merchant_order_id || obj?.merchant_order_id || obj?.order_id;

    if (!merchantOrderId) {
      return {
        received: true,
        note: 'No merchant order ID in webhook payload',
      };
    }

    let payment = await this.paymentRepo.findOne({
      filter: {
        $or: [
          { transactionId: merchantOrderId },
          {
            _id: Types.ObjectId.isValid(merchantOrderId)
              ? merchantOrderId
              : undefined,
          },
          {
            bookingId: Types.ObjectId.isValid(merchantOrderId)
              ? merchantOrderId
              : undefined,
          },
        ],
      },
    });

    let booking: any = null;
    if (payment) {
      booking = await this.bookingRepo.findById(payment.bookingId);
    } else {
      booking = await this.bookingRepo.findOne({
        filter: {
          $or: [
            {
              _id: Types.ObjectId.isValid(merchantOrderId)
                ? merchantOrderId
                : undefined,
            },
            { bookingCode: merchantOrderId },
          ],
        },
      });

      if (booking) {
        payment = await this.paymentRepo.create({
          bookingId: booking._id,
          userId: booking.userId,
          amount: booking.finalPrice ?? booking.totalPrice,
          transactionId: merchantOrderId,
          status: PaymentStatusEnum.unpaid,
        });
      }
    }

    if (!payment || !booking) {
      throw new NotFoundException(
        `Payment or booking record not found for order ${merchantOrderId}`,
      );
    }
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
        note: 'Webhook already processed. Payment is refunded.',
      };
    }

    if (success && !pending) {
      // 2. LATE / EXPIRED / CANCELLED WEBHOOK HANDLING
      const now = new Date();
      const isBookingExpired =
        booking.status === BookingStatusEnum.expired ||
        (booking.status === BookingStatusEnum.pending &&
          booking.expiresAt &&
          new Date(booking.expiresAt) <= now);
      const isBookingCancelled = booking.status === BookingStatusEnum.cancelled;

      if (isBookingExpired || isBookingCancelled) {
        // Automatically refund payment to user's wallet rather than reviving expired slot
        payment.status = PaymentStatusEnum.refunded;
        payment.paidAt = new Date();
        payment.refundedAmount = payment.amount;
        payment.refundReason =
          'Late payment received after booking hold expired or was cancelled. Automatically credited to wallet.';
        await payment.save();

        await this.walletService.refundBooking(
          payment.userId,
          payment.amount,
          payment.bookingId.toString(),
        );

        if (booking.status !== BookingStatusEnum.cancelled) {
          await this.bookingRepo.findByIdAndUpdate({
            id: booking._id,
            update: {
              status: BookingStatusEnum.expired,
              paymentStatus: PaymentStatusEnum.refunded,
            },
          });
        }

        return {
          received: true,
          status: PaymentStatusEnum.refunded,
          note: 'Booking hold had expired. Payment automatically refunded to user wallet.',
        };
      }

      // 3. NORMAL SUCCESS PATH
      payment.status = PaymentStatusEnum.paid;
      payment.paidAt = new Date();
      await payment.save();

      await this.bookingRepo.findByIdAndUpdate({
        id: payment.bookingId,
        update: {
          paymentStatus: PaymentStatusEnum.paid,
          status: BookingStatusEnum.confirmed,
          expiresAt: null,
        },
      });

      return { received: true, status: PaymentStatusEnum.paid };
    } else if (!success && !pending) {
      payment.status = PaymentStatusEnum.unpaid;
      await payment.save();
      return { received: true, status: payment.status };
    }

    return { received: true, status: payment.status };
  }
}
