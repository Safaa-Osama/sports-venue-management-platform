import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { BookingStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from 'src/common/enums/bookingEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import { PaymentRepo } from 'src/common/reposetories/payment-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { UserDocument } from '../user/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { CreatePaymentDto, MarkCashPaidDto, QueryPaymentDto, RefundPaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepo: PaymentRepo,
    private readonly bookingRepo: BookingRepo,
    private readonly venueRepo: VenueRepo,
    private readonly walletService: WalletService,
    private readonly paymobService: PaymobService,
  ) {}

  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomStr = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
    return `TXN-${timestamp}-${randomStr}`;
  }


  async createPayment(body: CreatePaymentDto, user: UserDocument) {
    const { bookingId, paymentMethod } = body;

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId.toString() !== user._id.toString() && user.role === RoleEnum.customer) {
      throw new UnauthorizedException('You can only pay for your own bookings');
    }

    if (booking.paymentStatus === PaymentStatusEnum.paid) {
      throw new BadRequestException('Booking is already paid');
    }

    if (booking.status === BookingStatusEnum.cancelled || booking.status === BookingStatusEnum.expired) {
      throw new BadRequestException(`Cannot process payment for the ${booking.status} booking`);
    }

    const transactionId = this.generateTransactionId();
    const paymentAmount = booking.finalPrice ?? booking.totalPrice ?? 0;

    
    if (paymentMethod === PaymentMethodEnum.wallet) {
      await this.walletService.payForBooking(user._id, paymentAmount, booking._id.toString());

      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: paymentAmount,
        currency: 'EGP',
        paymentMethod: PaymentMethodEnum.wallet,
        provider: 'wallet',
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

    // B. CASH / PAY AT VENUE METHOD
    if (paymentMethod === PaymentMethodEnum.cash) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: paymentAmount,
        currency: 'EGP',
        paymentMethod: PaymentMethodEnum.cash,
        provider: 'cash_at_venue',
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

    // C. PAYMOB / ONLINE GATEWAY METHOD
    if (paymentMethod === PaymentMethodEnum.paymob) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: user._id,
        amount: paymentAmount,
        currency: 'EGP',
        paymentMethod: PaymentMethodEnum.paymob,
        provider: 'paymob',
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
      populate: [{ path: 'bookingId', select: 'bookingCode date startTime endTime totalPrice finalPrice status' }],
    });

    return {
      message: 'Payments retrieved successfully',
      ...result,
    };
  }


  async getVenuePayments(venueId: string, query: QueryPaymentDto, user: UserDocument) {
    const venue = await this.venueRepo.findById(venueId);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const { page = 1, limit = 10, status, paymentMethod } = query;
    const bookings = await this.bookingRepo.find({ filter: { venueId: new Types.ObjectId(venueId) } });
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
        { path: 'bookingId', select: 'bookingCode date startTime endTime finalPrice' },
      ],
    });

    const completedPayments = await this.paymentRepo.find({
      filter: {
        bookingId: { $in: bookingIds },
        status: PaymentStatusEnum.paid,
      },
    });

    const totalRevenue = completedPayments.reduce((sum, p) => sum + (p.amount || 0) - (p.refundedAmount || 0), 0);

    return {
      message: 'Venue payments retrieved successfully',
      totalRevenue,
      ...result,
    };
  }


  // 4. READ (SINGLE PAYMENT BY ID)
  async getPaymentById(id: string, user: UserDocument) {
    const payment = await this.paymentRepo.findOne({
      filter: { _id: id },
      options: {
        populate: [
          { path: 'userId', select: 'userName email phone' },
          { path: 'bookingId', select: 'bookingCode date startTime endTime totalPrice finalPrice status' },
        ],
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    // Authorization check
    const isOwner = payment.userId._id.toString() === user._id.toString();
    const isStaffOrAdmin = [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager].includes(
      user.role as RoleEnum,
    );

    if (!isOwner && !isStaffOrAdmin) {
      throw new ForbiddenException('You are not authorized to view this payment');
    }

    return {
      message: 'Payment details retrieved successfully',
      data: payment,
    };
  }


  // 5. UPDATE (MARK CASH PAID AT VENUE)
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


  // 6. REFUND PAYMENT (FINANCIAL REVERSAL)
  async refundPayment(id: string, body: RefundPaymentDto, user: UserDocument) {
    const payment = await this.paymentRepo.findById(id);
    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (payment.status !== PaymentStatusEnum.paid) {
      throw new BadRequestException('Only completed/paid payments can be refunded');
    }

    const availableToRefund = payment.amount - (payment.refundedAmount || 0);
    const refundAmount = body.amount || availableToRefund;

    if (refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    if (refundAmount > availableToRefund) {
      throw new BadRequestException(`Refund amount cannot exceed remaining refundable balance of ${availableToRefund}`);
    }

    // Credit refunded amount back to user's wallet
    await this.walletService.refundBooking(payment.userId, refundAmount, payment.bookingId.toString());

    const newRefundedTotal = (payment.refundedAmount || 0) + refundAmount;
    payment.refundedAmount = newRefundedTotal;
    payment.refundReason = body.reason || 'Booking cancelled and refunded to wallet';

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
  

  // 7. PAYMOB WEBHOOK LISTENER WITH HMAC VERIFICATION
  async handlePaymobWebhook(payload: any, hmacHeader?: string) {
    const isValidHmac = this.paymobService.verifyWebhookHmac(payload, hmacHeader);
    if (!isValidHmac) {
      throw new UnauthorizedException('Invalid Paymob HMAC signature');
    }

    const obj = payload?.obj || payload;
    const { success, pending, order } = obj || {};
    const merchantOrderId = order?.merchant_order_id || obj?.merchant_order_id || obj?.order_id;

    if (!merchantOrderId) {
      return { received: true, note: 'No merchant order ID in webhook payload' };
    }

    const payment = await this.paymentRepo.findOne({
      filter: {
        $or: [{ transactionId: merchantOrderId }, { _id: Types.ObjectId.isValid(merchantOrderId) ? merchantOrderId : undefined }],
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record not found for order ${merchantOrderId}`);
    }

    if (success && !pending) {
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
    } else if (!success) {
      payment.status = PaymentStatusEnum.unpaid;
      await payment.save();
    }

    return { received: true, status: payment.status };
  }
}