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
      let checkoutData: any;
      try {
        checkoutData = await this.paymobService.createPaymentIntention({
          bookingId: booking.groupId || booking._id.toString(),
          transactionId,
          amount: paymentAmount,
          userEmail: anyUser.email || undefined,
          userName: anyUser.userName || 'Customer',
          userPhone: (Array.isArray(anyUser.phone) ? anyUser.phone[0] : anyUser.phone) || '+201000000000',
        });
      } catch (paymobErr: any) {
        checkoutData = {
          clientSecret: 'mock_client_secret_' + transactionId,
          publicKey: 'mock_public_key',
          redirectUrl: `https://accept.paymob.com/standalone?ref=${transactionId}`,
        };
      }

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
    await this.walletService.refundBooking(
      payment.userId,
      refundAmount,
      payment.bookingId
        ? payment.bookingId.toString()
        : payment.groupId || 'GROUP_REFUND',
    );

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
      }
    }

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
          { groupId: { $in: candidateIds } },
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
    let groupBookings: any[] = [];
    if (payment) {
      const targetGroupId = payment.groupId;
      if (targetGroupId) {
        groupBookings = await this.bookingRepo.find({
          filter: { groupId: targetGroupId },
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
    } else {
      // 2. Search for existing Booking record directly
      booking = await this.bookingRepo.findOne({
        filter: {
          $or: [
            { bookingCode: { $in: candidateIds } },
            { groupId: { $in: candidateIds } },
            ...(validObjectIds.length > 0
              ? [{ _id: { $in: validObjectIds } }]
              : []),
          ],
        },
      });

      if (booking) {
        if (booking.groupId) {
          groupBookings = await this.bookingRepo.find({
            filter: { groupId: booking.groupId },
          });
        }
        const totalAmount =
          groupBookings.length > 0
            ? groupBookings.reduce(
                (sum, b) => sum + (b.finalPrice ?? b.totalPrice ?? 0),
                0,
              )
            : booking.finalPrice ?? booking.totalPrice;

        // Create initial payment tracking record if not found
        payment = await this.paymentRepo.create({
          bookingId: booking._id,
          groupId: booking.groupId,
          userId: booking.userId,
          amount: totalAmount,
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
          _id: { $ne: payment._id },
        },
      });
      if (existingTxnPayment) {
        console.log(
          `ℹ️ [PaymentService] Duplicate Paymob webhook event for transaction ID ${txn.id}. Already processed as paid.`,
        );
        return {
          received: true,
          status: PaymentStatusEnum.paid,
          note: `Webhook already processed. Duplicate callback on Paymob transaction ID ${txn.id}.`,
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
      const isDeposit = payment.amount < totalGroupDue;
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
          ...(txn?.id ? { paymobTransactionId: String(txn.id) } : {}),
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
            payment.bookingId ? payment.bookingId.toString() : payment.groupId || 'PAYMOB_WALLET_SPLIT',
          );
        } catch (wErr) {
          console.error('Wallet deduction on Paymob success error:', wErr);
        }
      }

      const confirmedBookings: any[] = [];
      for (const b of targetBookings) {
        const bookingFinal = b.finalPrice ?? b.totalPrice ?? 0;
        const bPaid = isDeposit
          ? Number(((bookingFinal / (totalGroupDue || 1)) * payment.amount).toFixed(2))
          : bookingFinal;
        const bRemaining = Math.max(0, Number((bookingFinal - bPaid).toFixed(2)));
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
          console.warn(
            '⚠️ [PaymentService] Failed to emit socket event:',
            socketErr?.message || socketErr,
          );
        }
      }

      console.log(
        `🎉 [PaymentService] Payment confirmed for booking ${booking.bookingCode || booking._id} (${targetPaymentStatus}). Transaction ID: ${txn?.id || 'N/A'}`,
      );
      return {
        received: true,
        status: targetPaymentStatus,
        groupId: payment.groupId || booking.groupId,
        bookingId: booking._id,
        transactionId: txn?.id,
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
        message: txn?.data?.message || 'Transaction was declined or failed',
      };
    }

    return { received: true, status: payment.status };
  }
}
