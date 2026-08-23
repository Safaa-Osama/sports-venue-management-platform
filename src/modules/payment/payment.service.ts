import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
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
import { BookingGateway } from '../booking/booking.gateway';
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

  async handlePaymobWebhook(payload: any, hmac?: string) {
    const isValidHmac = this.paymobService.verifyWebhookHmac(payload, hmac);
    const enforceHmac =
      process.env.PAYMOB_ENFORCE_HMAC === 'true' ||
      process.env.NODE_ENV === 'production';

    if (!isValidHmac) {
      if (enforceHmac) {
        throw new UnauthorizedException('Invalid Paymob HMAC signature');
      } else {
        console.warn(
          '⚠️ [PaymentService] HMAC signature mismatch. Bypassing in development mode to permit transaction processing. Set PAYMOB_ENFORCE_HMAC=true to strictly block mismatches.',
        );
      }
    }

    // ── Resolve transaction object from either Intention API or Legacy API format ──
    // Intention API: { intention: {...}, transaction: {...}, hmac: "..." }
    // Legacy API:    { type: "TRANSACTION", obj: {...} }
    const txn = payload?.transaction || payload?.obj || payload || {};
    const intention = payload?.intention || {};
    const order = txn?.order || payload?.order;

    const isSuccess =
      txn.success === true ||
      txn.success === 'true' ||
      txn.txn_response_code === 'APPROVED' ||
      txn.data?.message === 'Approved';
    const isPending = txn.pending === true || txn.pending === 'true';

    // Collect all candidate identifier keys across both API formats
    const candidateIds: string[] = [
      // Intention API: special_reference is under intention, not transaction
      intention?.special_reference,
      // Legacy API: special_reference is under obj
      txn?.special_reference,
      payload?.special_reference,
      // Order-level IDs
      order?.merchant_order_id,
      txn?.merchant_order_id,
      payload?.merchant_order_id,
      txn?.merchant_txn_ref,
      // Order ID (nested object or flat)
      order?.id?.toString(),
      txn?.order_id?.toString(),
      txn?.['order.id']?.toString(),
      // Transaction ID (Paymob unique ID — used for deduplication)
      txn?.id?.toString(),
      txn?.transaction_id?.toString(),
      // Application-level IDs
      txn?.bookingId?.toString(),
      txn?.booking_id?.toString(),
      txn?.bookingCode?.toString(),
      txn?.booking_code?.toString(),
    ].filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0,
    );

    console.log(
      '📩 [PaymentService] Processing Paymob webhook. Candidate reference IDs:',
      candidateIds,
    );

    // 1. Search for existing Payment record
    const validObjectIds = candidateIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    let payment = await this.paymentRepo.findOne({
      filter: {
        $or: [
          { transactionId: { $in: candidateIds } },
          ...(validObjectIds.length > 0
            ? [
                { _id: { $in: validObjectIds } },
                { bookingId: { $in: validObjectIds } },
              ]
            : []),
        ],
      },
    });

    let booking: any = null;
    if (payment) {
      booking = await this.bookingRepo.findById(payment.bookingId);
    } else {
      // 2. Search for existing Booking record directly
      booking = await this.bookingRepo.findOne({
        filter: {
          $or: [
            { bookingCode: { $in: candidateIds } },
            ...(validObjectIds.length > 0
              ? [{ _id: { $in: validObjectIds } }]
              : []),
          ],
        },
      });

      if (booking) {
        // Create initial payment tracking record if not found
        payment = await this.paymentRepo.create({
          bookingId: booking._id,
          userId: booking.userId,
          amount: booking.finalPrice ?? booking.totalPrice,
          transactionId:
            intention?.special_reference ||
            txn?.special_reference ||
            candidateIds[0] ||
            `PAYMOB-${txn?.id || Date.now()}`,
          status: PaymentStatusEnum.unpaid,
        });
      }
    }

    if (!payment || !booking) {
      console.warn(
        '⚠️ [PaymentService] No matching payment or booking record found for Paymob webhook candidates:',
        candidateIds,
      );
      return {
        received: true,
        note: 'No matching payment or booking record found',
        candidateIds,
      };
    }

    // Deduplication check: Check if this specific Paymob transaction ID was already fulfilled
    if (txn?.id) {
      const existingTxnPayment = await this.paymentRepo.findOne({
        filter: {
          paymobTransactionId: String(txn.id),
          status: PaymentStatusEnum.paid,
        },
      });
      if (existingTxnPayment) {
        console.log(
          `ℹ️ [PaymentService] Duplicate Paymob webhook event for transaction ID ${txn.id}. Already processed as paid.`,
        );
        return {
          received: true,
          status: PaymentStatusEnum.paid,
          note: `Duplicate callback on Paymob transaction ID ${txn.id}. Already fulfilled.`,
        };
      }
    }

    // 3. Idempotency check: Already processed
    if (payment.status === PaymentStatusEnum.paid) {
      console.log(
        `ℹ️ [PaymentService] Payment for booking ${booking.bookingCode || booking._id} is already marked as paid.`,
      );
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

    // 4. Handle Success Path
    if (isSuccess && !isPending) {
      const now = new Date();
      const isBookingExpired =
        booking.status === BookingStatusEnum.expired ||
        (booking.status === BookingStatusEnum.pending &&
          booking.expiresAt &&
          new Date(booking.expiresAt) <= now);
      const isBookingCancelled =
        booking.status === BookingStatusEnum.cancelled;

      // Handle late payment on expired or cancelled booking: auto-refund to user wallet
      if (isBookingExpired || isBookingCancelled) {
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

      // Normal Success Confirmation with Atomic Compare-and-Set
      const updatedPayment = await this.paymentRepo.findOneAndUpdate({
        filter: {
          _id: payment._id,
          status: { $ne: PaymentStatusEnum.paid },
        },
        update: {
          status: PaymentStatusEnum.paid,
          paidAt: new Date(),
          ...(txn?.id ? { paymobTransactionId: String(txn.id) } : {}),
        },
      });

      if (!updatedPayment) {
        return {
          received: true,
          status: PaymentStatusEnum.paid,
          note: 'Payment was already fulfilled by concurrent callback.',
        };
      }

      const updatedBooking = await this.bookingRepo.findByIdAndUpdate({
        id: payment.bookingId,
        update: {
          paymentStatus: PaymentStatusEnum.paid,
          status: BookingStatusEnum.confirmed,
          expiresAt: null,
        },
      });

      // Emit real-time Socket.IO events to update mobile app and venue dashboard
      if (this.bookingGateway && updatedBooking) {
        try {
          this.bookingGateway.emitBookingConfirmed(updatedBooking);

          const venue = await this.venueRepo.findById(booking.venueId);
          if (venue?.createdBy) {
            this.bookingGateway.emitOwnerNotification(
              venue.createdBy.toString(),
              updatedBooking,
              'booking_confirmed',
            );
          }
        } catch (socketErr: any) {
          console.warn(
            '⚠️ [PaymentService] Failed to emit socket event:',
            socketErr?.message || socketErr,
          );
        }
      }

      console.log(
        `🎉 [PaymentService] Payment confirmed for booking ${booking.bookingCode || booking._id}. Transaction ID: ${txn?.id || 'N/A'}`,
      );
      return {
        received: true,
        status: PaymentStatusEnum.paid,
        bookingId: booking._id,
        transactionId: txn?.id,
      };
    } else if (!isSuccess && !isPending) {
      payment.status = PaymentStatusEnum.unpaid;
      await payment.save();
      return {
        received: true,
        status: payment.status,
        message: txn?.data?.message || 'Transaction was declined or failed',
      };
    }

    return { received: true, status: payment.status };
  }
}
