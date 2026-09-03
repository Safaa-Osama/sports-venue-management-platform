import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { TransactionTypeEnum } from 'src/common/enums/walletEnum';
import { AdvertisementRepo } from 'src/common/repositories/advertisement-repo';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { ContactRepo } from 'src/common/repositories/contact-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { WalletRepo } from 'src/common/repositories/wallet-repo';
import { WalletTransactionRepo } from 'src/common/repositories/wallet-transaction-repo';
import { QueryReportDto, ReportIntervalEnum } from './dto/reports.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly bookingRepo: BookingRepo,
    private readonly paymentRepo: PaymentRepo,
    private readonly walletRepo: WalletRepo,
    private readonly walletTransactionRepo: WalletTransactionRepo,
    private readonly couponRepo: CouponRepo,
    private readonly advertisementRepo: AdvertisementRepo,
    private readonly venueRepo: VenueRepo,
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly contactRepo: ContactRepo,
  ) {}

  private parseDateRange(query: QueryReportDto): { start: Date; end: Date } {
    const rawStart = query.startDate || query.from;
    const rawEnd = query.endDate || query.to;

    let start: Date;
    let end: Date;

    if (rawStart) {
      start = new Date(rawStart);
      start.setUTCHours(0, 0, 0, 0);
    } else {
      start = new Date();
      start.setUTCDate(start.getUTCDate() - 30);
      start.setUTCHours(0, 0, 0, 0);
    }

    if (rawEnd) {
      end = new Date(rawEnd);
      end.setUTCHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setUTCHours(23, 59, 59, 999);
    }

    return { start, end };
  }

  private getDateFormat(interval?: ReportIntervalEnum): string {
    switch (interval) {
      case ReportIntervalEnum.week:
        return '%Y-W%V';
      case ReportIntervalEnum.month:
        return '%Y-%m';
      case ReportIntervalEnum.day:
      default:
        return '%Y-%m-%d';
    }
  }

  // ===========================================================================
  // 1. REVENUE & PAYMENTS REPORT
  // ===========================================================================
  async getRevenueReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);
    const venueObjectId = query.venueId && Types.ObjectId.isValid(query.venueId)
      ? new Types.ObjectId(query.venueId)
      : null;

    const bookingMatch: any = {
      date: { $gte: start, $lte: end },
    };
    if (venueObjectId) {
      bookingMatch.venueId = venueObjectId;
    }

    const paymentMatch: any = {
      createdAt: { $gte: start, $lte: end },
    };

    // 1.1 Payment Method Breakdown & Totals (from Payment Collection)
    const paymentMethodStats = await this.paymentRepo.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: {
            $sum: {
              $cond: [
                { $in: ['$status', [PaymentStatusEnum.paid, PaymentStatusEnum.partially_paid]] },
                '$amount',
                0,
              ],
            },
          },
          totalRefunded: { $sum: '$refundedAmount' },
          count: { $sum: 1 },
          paidCount: {
            $sum: {
              $cond: [
                { $in: ['$status', [PaymentStatusEnum.paid, PaymentStatusEnum.partially_paid]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    let cardRevenue = 0;
    let cashRevenue = 0;
    let walletRevenue = 0;
    let totalRefunds = 0;
    let totalCollectedPayments = 0;

    paymentMethodStats.forEach((p) => {
      const net = Math.max(0, p.totalAmount - (p.totalRefunded || 0));
      totalRefunds += p.totalRefunded || 0;
      totalCollectedPayments += p.totalAmount || 0;
      if (p._id === PaymentMethodEnum.paymob) cardRevenue = p.totalAmount;
      else if (p._id === PaymentMethodEnum.cash) cashRevenue = p.totalAmount;
      else if (p._id === PaymentMethodEnum.wallet) walletRevenue = p.totalAmount;
    });

    const totalRevenueSum = cardRevenue + cashRevenue + walletRevenue;
    const cardPct = totalRevenueSum > 0 ? Number(((cardRevenue / totalRevenueSum) * 100).toFixed(1)) : 0;
    const cashPct = totalRevenueSum > 0 ? Number(((cashRevenue / totalRevenueSum) * 100).toFixed(1)) : 0;
    const walletPct = totalRevenueSum > 0 ? Number(((walletRevenue / totalRevenueSum) * 100).toFixed(1)) : 0;

    // 1.2 Bookings Financial Aggregation (Gross vs Net vs Discounts)
    const bookingFinancials = await this.bookingRepo.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: null,
          totalGross: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                { $ifNull: ['$finalPrice', '$totalPrice'] },
                0,
              ],
            },
          },
          totalBasePrice: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                '$totalPrice',
                0,
              ],
            },
          },
          totalDiscounts: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                { $ifNull: ['$discountAmount', 0] },
                0,
              ],
            },
          },
          totalPaidAmount: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                { $ifNull: ['$paidAmount', 0] },
                0,
              ],
            },
          },
          totalRemainingAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', BookingStatusEnum.cancelled] },
                    { $eq: ['$paymentStatus', PaymentStatusEnum.partially_paid] },
                  ],
                },
                { $ifNull: ['$remainingAmount', 0] },
                0,
              ],
            },
          },
          depositBookingsCount: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', PaymentStatusEnum.partially_paid] }, 1, 0],
            },
          },
          fullPaidBookingsCount: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', PaymentStatusEnum.paid] }, 1, 0],
            },
          },
          payAtVenueBookingsCount: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', PaymentStatusEnum.pay_at_venue] }, 1, 0],
            },
          },
          cancelledBookingsCount: {
            $sum: {
              $cond: [{ $eq: ['$status', BookingStatusEnum.cancelled] }, 1, 0],
            },
          },
          totalBookingsCount: { $sum: 1 },
        },
      },
    ]);

    const bf = bookingFinancials[0] || {
      totalGross: 0,
      totalBasePrice: 0,
      totalDiscounts: 0,
      totalPaidAmount: 0,
      totalRemainingAmount: 0,
      depositBookingsCount: 0,
      fullPaidBookingsCount: 0,
      payAtVenueBookingsCount: 0,
      cancelledBookingsCount: 0,
      totalBookingsCount: 0,
    };

    const grossRevenue = bf.totalGross;
    const netRevenue = Math.max(0, grossRevenue - totalRefunds);

    // 1.3 Revenue Time-Series (by Interval)
    const dateFormat = this.getDateFormat(query.interval);
    const revenueTimeline = await this.bookingRepo.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$date' } },
          gross: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                { $ifNull: ['$finalPrice', '$totalPrice'] },
                0,
              ],
            },
          },
          paid: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                { $ifNull: ['$paidAmount', 0] },
                0,
              ],
            },
          },
          discounts: {
            $sum: {
              $cond: [
                { $ne: ['$status', BookingStatusEnum.cancelled] },
                { $ifNull: ['$discountAmount', 0] },
                0,
              ],
            },
          },
          bookingsCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 1.4 Pending / Uncollected Deposits Table
    const pendingDeposits = await this.bookingRepo.aggregate([
      {
        $match: {
          ...bookingMatch,
          paymentStatus: PaymentStatusEnum.partially_paid,
          remainingAmount: { $gt: 0 },
        },
      },
      { $sort: { date: -1 } },
      { $limit: query.limit || 20 },
      {
        $lookup: {
          from: 'customerusers',
          localField: 'userId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $lookup: {
          from: 'venues',
          localField: 'venueId',
          foreignField: '_id',
          as: 'venue',
        },
      },
      {
        $project: {
          _id: 1,
          bookingCode: 1,
          date: 1,
          startTime: 1,
          endTime: 1,
          totalPrice: 1,
          finalPrice: 1,
          paidAmount: 1,
          remainingAmount: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          status: 1,
          customerName: { $arrayElemAt: ['$customer.userName', 0] },
          customerPhone: { $arrayElemAt: ['$customer.phone', 0] },
          venueName: { $arrayElemAt: ['$venue.venueName', 0] },
        },
      },
    ]);

    // 1.5 Paymob Card Settlement Reconciliation
    const paymobReconciliation = await this.paymentRepo.aggregate([
      {
        $match: {
          ...paymentMatch,
          paymentMethod: PaymentMethodEnum.paymob,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
          refunded: { $sum: '$refundedAmount' },
        },
      },
    ]);

    return {
      summary: {
        grossRevenue,
        netRevenue,
        totalCollectedPayments,
        totalRefunds,
        totalDiscountsGiven: bf.totalDiscounts,
        cardRevenue,
        cashRevenue,
        walletRevenue,
        cardPct,
        cashPct,
        walletPct,
        depositBookingsCount: bf.depositBookingsCount,
        fullPaidBookingsCount: bf.fullPaidBookingsCount,
        payAtVenueBookingsCount: bf.payAtVenueBookingsCount,
        outstandingDepositBalance: bf.totalRemainingAmount,
        totalBookings: bf.totalBookingsCount,
      },
      series: [
        {
          name: 'Gross Revenue',
          data: revenueTimeline.map((r) => ({ x: r._id, y: r.gross })),
        },
        {
          name: 'Collected Paid Amount',
          data: revenueTimeline.map((r) => ({ x: r._id, y: r.paid })),
        },
        {
          name: 'Coupon Discounts',
          data: revenueTimeline.map((r) => ({ x: r._id, y: r.discounts })),
        },
      ],
      paymentMethodDistribution: [
        { label: 'Card (Paymob)', value: cardRevenue, percentage: cardPct },
        { label: 'Cash at Venue', value: cashRevenue, percentage: cashPct },
        { label: 'Digital Wallet', value: walletRevenue, percentage: walletPct },
      ],
      reconciliation: {
        gatewayTransactions: paymobReconciliation,
      },
      pendingDepositsTable: {
        docs: pendingDeposits,
        total: bf.depositBookingsCount,
      },
    };
  }

  // ===========================================================================
  // 2. REFUNDS & WALLET LIABILITY REPORT
  // ===========================================================================
  async getRefundsAndWalletReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);
    const dateFormat = this.getDateFormat(query.interval);

    // 2.1 Total Customer Wallet Liability in System
    const walletLiabilityStats = await this.walletRepo.aggregate([
      {
        $group: {
          _id: null,
          totalLiability: { $sum: '$balance' },
          activeWalletsCount: {
            $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] },
          },
          totalWalletsCount: { $sum: 1 },
          avgBalance: { $avg: '$balance' },
        },
      },
    ]);

    const wl = walletLiabilityStats[0] || {
      totalLiability: 0,
      activeWalletsCount: 0,
      totalWalletsCount: 0,
      avgBalance: 0,
    };

    // 2.2 Wallet Activity & Velocity (Deposits vs Payments vs Refunds)
    const walletVelocity = await this.walletTransactionRepo.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    let creditedVolume = 0;
    let redeemedVolume = 0;
    let refundVolume = 0;
    let refundCount = 0;
    let depositCount = 0;
    let paymentCount = 0;

    walletVelocity.forEach((v) => {
      if (v._id === TransactionTypeEnum.DEPOSIT) {
        creditedVolume += v.totalAmount;
        depositCount += v.count;
      } else if (v._id === TransactionTypeEnum.BOOKING_PAYMENT || v._id === TransactionTypeEnum.DEDUCTION) {
        redeemedVolume += v.totalAmount;
        paymentCount += v.count;
      } else if (v._id === TransactionTypeEnum.BOOKING_REFUND) {
        refundVolume += v.totalAmount;
        refundCount += v.count;
      }
    });

    // 2.3 Refund Timeline & Reasons
    const refundTimeline = await this.walletTransactionRepo.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          type: TransactionTypeEnum.BOOKING_REFUND,
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          totalRefundAmount: { $sum: '$amount' },
          refundCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 2.4 Refund Rate (% of all completed booking payments)
    const totalTransactionsInPeriod = paymentCount + depositCount + refundCount;
    const refundRate = totalTransactionsInPeriod > 0
      ? Number(((refundCount / totalTransactionsInPeriod) * 100).toFixed(2))
      : 0;

    // 2.5 Paginated Refund & Wallet Audit Ledger
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [transactionsList, totalTxCount] = await Promise.all([
      this.walletTransactionRepo.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'wallets',
            localField: 'walletId',
            foreignField: '_id',
            as: 'wallet',
          },
        },
        {
          $lookup: {
            from: 'customerusers',
            localField: 'wallet.userId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        {
          $project: {
            _id: 1,
            receiptNumber: 1,
            type: 1,
            amount: 1,
            balanceBefore: 1,
            balanceAfter: 1,
            status: 1,
            description: 1,
            referenceId: 1,
            createdAt: 1,
            customerName: { $arrayElemAt: ['$customer.userName', 0] },
            customerPhone: { $arrayElemAt: ['$customer.phone', 0] },
          },
        },
      ]),
      this.walletTransactionRepo.countDocuments({
        createdAt: { $gte: start, $lte: end },
      }),
    ]);

    return {
      summary: {
        totalWalletLiability: wl.totalLiability,
        activeCustomerWallets: wl.activeWalletsCount,
        totalCustomerWallets: wl.totalWalletsCount,
        averageWalletBalance: Number((wl.avgBalance || 0).toFixed(2)),
        creditedVolume,
        redeemedVolume,
        refundVolume,
        refundCount,
        refundRatePct: refundRate,
      },
      series: [
        {
          name: 'Refund Value (EGP)',
          data: refundTimeline.map((r) => ({ x: r._id, y: r.totalRefundAmount })),
        },
        {
          name: 'Refund Count',
          data: refundTimeline.map((r) => ({ x: r._id, y: r.refundCount })),
        },
      ],
      table: {
        docs: transactionsList,
        total: totalTxCount,
        page,
        limit,
      },
    };
  }

  // ===========================================================================
  // 3. NO-SHOWS REPORT
  // ===========================================================================
  async getNoShowsReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);
    const venueObjectId = query.venueId && Types.ObjectId.isValid(query.venueId)
      ? new Types.ObjectId(query.venueId)
      : null;

    const match: any = {
      date: { $gte: start, $lte: end },
    };
    if (venueObjectId) {
      match.venueId = venueObjectId;
    }

    // 3.1 Overall No-Show Aggregation
    const overallStats = await this.bookingRepo.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          noShowCount: {
            $sum: { $cond: [{ $eq: ['$status', BookingStatusEnum.no_show] }, 1, 0] },
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', BookingStatusEnum.completed] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', BookingStatusEnum.cancelled] }, 1, 0] },
          },
          lostRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$status', BookingStatusEnum.no_show] },
                { $ifNull: ['$finalPrice', '$totalPrice'] },
                0,
              ],
            },
          },
          retainedDeposits: {
            $sum: {
              $cond: [
                { $eq: ['$status', BookingStatusEnum.no_show] },
                { $ifNull: ['$paidAmount', 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const os = overallStats[0] || {
      totalBookings: 0,
      noShowCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      lostRevenue: 0,
      retainedDeposits: 0,
    };

    const effectiveTotal = os.totalBookings - os.cancelledCount;
    const noShowRate = effectiveTotal > 0
      ? Number(((os.noShowCount / effectiveTotal) * 100).toFixed(1))
      : 0;

    // 3.2 No-Show Rate By Venue
    const venueNoShowStats = await this.bookingRepo.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$venueId',
          totalBookings: { $sum: 1 },
          noShowCount: {
            $sum: { $cond: [{ $eq: ['$status', BookingStatusEnum.no_show] }, 1, 0] },
          },
          lostRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$status', BookingStatusEnum.no_show] },
                { $ifNull: ['$finalPrice', '$totalPrice'] },
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'venues',
          localField: '_id',
          foreignField: '_id',
          as: 'venue',
        },
      },
      {
        $project: {
          _id: 1,
          venueName: { $arrayElemAt: ['$venue.venueName', 0] },
          totalBookings: 1,
          noShowCount: 1,
          lostRevenue: 1,
          noShowRate: {
            $cond: [
              { $gt: ['$totalBookings', 0] },
              { $multiply: [{ $divide: ['$noShowCount', '$totalBookings'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { noShowCount: -1 } },
    ]);

    // 3.3 No-Show Trend Timeline
    const dateFormat = this.getDateFormat(query.interval);
    const noShowTimeline = await this.bookingRepo.aggregate([
      {
        $match: {
          ...match,
          status: BookingStatusEnum.no_show,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$date' } },
          noShowCount: { $sum: 1 },
          lostRevenue: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 3.4 Top Customers with No-Shows
    const topNoShowCustomers = await this.customerUserRepo.aggregate([
      { $match: { noShowCount: { $gt: 0 } } },
      { $sort: { noShowCount: -1 } },
      { $limit: query.limit || 20 },
      {
        $project: {
          _id: 1,
          userName: 1,
          phone: 1,
          email: 1,
          status: 1,
          noShowCount: 1,
          createdAt: 1,
        },
      },
    ]);

    return {
      summary: {
        totalNoShows: os.noShowCount,
        totalBookings: os.totalBookings,
        noShowRatePct: noShowRate,
        revenueImpactLost: os.lostRevenue,
        retainedDepositValue: os.retainedDeposits,
      },
      series: [
        {
          name: 'No-Show Matches',
          data: noShowTimeline.map((t) => ({ x: t._id, y: t.noShowCount })),
        },
        {
          name: 'Lost Revenue (EGP)',
          data: noShowTimeline.map((t) => ({ x: t._id, y: t.lostRevenue })),
        },
      ],
      venueBreakdown: venueNoShowStats,
      topNoShowCustomersTable: {
        docs: topNoShowCustomers,
        total: topNoShowCustomers.length,
      },
    };
  }

  // ===========================================================================
  // 4. COUPONS & PROMOS REPORT
  // ===========================================================================
  async getCouponsReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);

    // 4.1 Coupon Campaign Usage from Booking Records
    const couponUsageStats = await this.bookingRepo.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          couponCode: { $ne: null, $exists: true },
          status: { $ne: BookingStatusEnum.cancelled },
        },
      },
      {
        $group: {
          _id: '$couponCode',
          bookingsDriven: { $sum: 1 },
          totalRevenueGenerated: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
          totalDiscountsGiven: { $sum: { $ifNull: ['$discountAmount', 0] } },
          uniqueCustomers: { $addToSet: '$userId' },
        },
      },
      {
        $lookup: {
          from: 'coupons',
          localField: '_id',
          foreignField: 'code',
          as: 'couponDetails',
        },
      },
      {
        $project: {
          _id: 1,
          couponCode: '$_id',
          bookingsDriven: 1,
          totalRevenueGenerated: 1,
          totalDiscountsGiven: 1,
          uniqueCustomersCount: { $size: '$uniqueCustomers' },
          discountType: { $arrayElemAt: ['$couponDetails.discountType', 0] },
          discountValue: { $arrayElemAt: ['$couponDetails.discount', 0] },
          maxUses: { $arrayElemAt: ['$couponDetails.maxUses', 0] },
          totalUsesCount: { $arrayElemAt: ['$couponDetails.usesCount', 0] },
          isActive: { $arrayElemAt: ['$couponDetails.isActive', 0] },
          startDate: { $arrayElemAt: ['$couponDetails.startDate', 0] },
          endDate: { $arrayElemAt: ['$couponDetails.endDate', 0] },
        },
      },
      { $sort: { bookingsDriven: -1 } },
    ]);

    // 4.2 Overall Coupon Totals
    let totalCouponsRevenue = 0;
    let totalCouponsDiscounts = 0;
    let totalCouponBookings = 0;

    couponUsageStats.forEach((c) => {
      totalCouponsRevenue += c.totalRevenueGenerated || 0;
      totalCouponsDiscounts += c.totalDiscountsGiven || 0;
      totalCouponBookings += c.bookingsDriven || 0;
    });

    const activeCouponsCount = await this.couponRepo.countDocuments({ isActive: true });

    // 4.3 New vs Returning User Split on Coupons
    const customerSplitStats = await this.bookingRepo.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          couponCode: { $ne: null, $exists: true },
        },
      },
      {
        $lookup: {
          from: 'customerusers',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          userId: 1,
          bookingDate: '$date',
          userCreatedAt: { $arrayElemAt: ['$user.createdAt', 0] },
        },
      },
      {
        $project: {
          isNewCustomer: {
            $lte: [
              { $abs: { $subtract: ['$bookingDate', '$userCreatedAt'] } },
              1000 * 60 * 60 * 24 * 7, // within 7 days of account creation
            ],
          },
        },
      },
      {
        $group: {
          _id: '$isNewCustomer',
          count: { $sum: 1 },
        },
      },
    ]);

    let newCustomerCouponUses = 0;
    let returningCustomerCouponUses = 0;
    customerSplitStats.forEach((s) => {
      if (s._id === true) newCustomerCouponUses = s.count;
      else returningCustomerCouponUses = s.count;
    });

    return {
      summary: {
        activeCouponsCount,
        totalBookingsDriven: totalCouponBookings,
        totalRevenueGenerated: totalCouponsRevenue,
        totalDiscountsGiven: totalCouponsDiscounts,
        roiRatio: totalCouponsDiscounts > 0
          ? Number((totalCouponsRevenue / totalCouponsDiscounts).toFixed(2))
          : 0,
        newCustomerCouponUses,
        returningCustomerCouponUses,
      },
      series: [
        {
          name: 'Revenue Generated',
          data: couponUsageStats.map((c) => ({ x: c.couponCode, y: c.totalRevenueGenerated })),
        },
        {
          name: 'Discount Value Granted',
          data: couponUsageStats.map((c) => ({ x: c.couponCode, y: c.totalDiscountsGiven })),
        },
      ],
      table: {
        docs: couponUsageStats,
        total: couponUsageStats.length,
      },
    };
  }

  // ===========================================================================
  // 5. AD SYSTEM REPORT
  // ===========================================================================
  async getAdsReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);

    // 5.1 Ad Status & KPI Breakdown
    const adsKpi = await this.advertisementRepo.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalImpressions: { $sum: '$impressions' },
          totalClicks: { $sum: '$clicks' },
          totalRevenue: { $sum: { $ifNull: ['$cost', 0] } },
        },
      },
    ]);

    let activeAds = 0;
    let scheduledAds = 0;
    let expiredAds = 0;
    let inactiveAds = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalAdRevenue = 0;

    adsKpi.forEach((k) => {
      totalImpressions += k.totalImpressions || 0;
      totalClicks += k.totalClicks || 0;
      totalAdRevenue += k.totalRevenue || 0;
      if (k._id === 'active') activeAds = k.count;
      else if (k._id === 'scheduled') scheduledAds = k.count;
      else if (k._id === 'expired') expiredAds = k.count;
      else if (k._id === 'inactive') inactiveAds = k.count;
    });

    const averageCtr = totalImpressions > 0
      ? Number(((totalClicks / totalImpressions) * 100).toFixed(2))
      : 0;

    // 5.2 Ad Payment Status Breakdown
    const paymentStatusBreakdown = await this.advertisementRepo.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$paymentStatus', 'paid'] },
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$cost', 0] } },
        },
      },
    ]);

    // 5.3 Position Inventory & Slot Utilization
    const positionUtilization = await this.advertisementRepo.aggregate([
      {
        $group: {
          _id: '$position',
          totalAds: { $sum: 1 },
          activeAds: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          totalImpressions: { $sum: '$impressions' },
          totalClicks: { $sum: '$clicks' },
        },
      },
    ]);

    // 5.4 Revenue & Performance by Advertiser
    const advertiserPerformance = await this.advertisementRepo.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$advertiserName', 'ArenaHub Direct'] },
          campaignsCount: { $sum: 1 },
          totalCost: { $sum: { $ifNull: ['$cost', 0] } },
          totalImpressions: { $sum: '$impressions' },
          totalClicks: { $sum: '$clicks' },
        },
      },
      {
        $project: {
          _id: 1,
          advertiserName: '$_id',
          campaignsCount: 1,
          totalCost: 1,
          totalImpressions: 1,
          totalClicks: 1,
          ctr: {
            $cond: [
              { $gt: ['$totalImpressions', 0] },
              { $multiply: [{ $divide: ['$totalClicks', '$totalImpressions'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { totalCost: -1, totalImpressions: -1 } },
    ]);

    // 5.5 Ads Table with Pagination
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [adsList, totalAdsCount] = await Promise.all([
      this.advertisementRepo.find({
        options: { sort: { createdAt: -1 }, skip, limit },
      }),
      this.advertisementRepo.countDocuments(),
    ]);

    return {
      summary: {
        totalAds: totalAdsCount,
        activeAds,
        scheduledAds,
        expiredAds,
        inactiveAds,
        totalImpressions,
        totalClicks,
        averageCtr,
        totalAdRevenue,
      },
      paymentStatusBreakdown,
      positionUtilization,
      advertiserPerformance,
      table: {
        docs: adsList,
        total: totalAdsCount,
        page,
        limit,
      },
    };
  }

  // ===========================================================================
  // 6. VENUE UTILIZATION REPORT
  // ===========================================================================
  async getVenueUtilizationReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);
    const venueObjectId = query.venueId && Types.ObjectId.isValid(query.venueId)
      ? new Types.ObjectId(query.venueId)
      : null;

    const match: any = {
      date: { $gte: start, $lte: end },
      status: { $in: [BookingStatusEnum.confirmed, BookingStatusEnum.completed, BookingStatusEnum.no_show] },
    };
    if (venueObjectId) {
      match.venueId = venueObjectId;
    }

    // 6.1 Total Operating Venues
    const venues = await this.venueRepo.find({ filter: { isActive: true, isDeleted: { $ne: true } } });
    const targetVenues = venueObjectId
      ? venues.filter((v) => v._id.toString() === venueObjectId.toString())
      : venues;

    const dayDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    let totalTheoreticalCapacityHours = 0;
    targetVenues.forEach((v) => {
      const dailyHours = (v.endWorkingHours || 24) - (v.startWorkingHours || 8);
      totalTheoreticalCapacityHours += Math.max(0, dailyHours) * dayDiff;
    });

    // 6.2 Total Booked Hours and Revenue by Venue
    const venueUtilizationStats = await this.bookingRepo.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$venueId',
          bookedSlotsCount: { $sum: 1 },
          totalBookedHours: {
            $sum: {
              $subtract: ['$endTime', '$startTime'],
            },
          },
          totalRevenue: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
        },
      },
      {
        $lookup: {
          from: 'venues',
          localField: '_id',
          foreignField: '_id',
          as: 'venue',
        },
      },
      {
        $project: {
          _id: 1,
          venueName: { $arrayElemAt: ['$venue.venueName', 0] },
          startWorkingHours: { $arrayElemAt: ['$venue.startWorkingHours', 0] },
          endWorkingHours: { $arrayElemAt: ['$venue.endWorkingHours', 0] },
          bookedSlotsCount: 1,
          totalBookedHours: 1,
          totalRevenue: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    let totalBookedHoursOverall = 0;
    let totalUtilizationRevenue = 0;

    const venueBreakdownTable = venueUtilizationStats.map((v) => {
      const dailyHours = (v.endWorkingHours || 24) - (v.startWorkingHours || 8);
      const venueCapacityHours = Math.max(1, dailyHours * dayDiff);
      const occupancyRate = Number(((v.totalBookedHours / venueCapacityHours) * 100).toFixed(1));
      totalBookedHoursOverall += v.totalBookedHours;
      totalUtilizationRevenue += v.totalRevenue;

      return {
        ...v,
        capacityHours: venueCapacityHours,
        occupancyRate: Math.min(100, occupancyRate),
        revenuePerHour: v.totalBookedHours > 0
          ? Number((v.totalRevenue / v.totalBookedHours).toFixed(2))
          : 0,
      };
    });

    const overallOccupancyRate = totalTheoreticalCapacityHours > 0
      ? Number(((totalBookedHoursOverall / totalTheoreticalCapacityHours) * 100).toFixed(1))
      : 0;

    // 6.3 24-Hour Time-Slot Hourly Distribution (0 to 23)
    const hourlyDemand = await this.bookingRepo.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$startTime',
          bookingCount: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const hourMap: Record<number, { count: number; revenue: number }> = {};
    hourlyDemand.forEach((h) => {
      hourMap[h._id] = { count: h.bookingCount, revenue: h.revenue };
    });

    const full24HoursSeries = Array.from({ length: 24 }, (_, i) => {
      const norm = i % 24;
      const ampm = norm >= 12 ? 'PM' : 'AM';
      const displayHour = norm % 12 === 0 ? 12 : norm % 12;
      return {
        hour: `${displayHour}:00 ${ampm}`,
        rawHour: i,
        bookingCount: hourMap[i]?.count || 0,
        revenue: hourMap[i]?.revenue || 0,
      };
    });

    return {
      summary: {
        totalVenues: targetVenues.length,
        totalTheoreticalCapacityHours,
        totalBookedHours: totalBookedHoursOverall,
        overallOccupancyRatePct: overallOccupancyRate,
        totalRevenue: totalUtilizationRevenue,
      },
      series: [
        {
          name: 'Bookings Count',
          data: full24HoursSeries.map((h) => ({ x: h.hour, y: h.bookingCount })),
        },
        {
          name: 'Revenue (EGP)',
          data: full24HoursSeries.map((h) => ({ x: h.hour, y: h.revenue })),
        },
      ],
      venueBreakdownTable,
    };
  }

  // ===========================================================================
  // 7. CUSTOMERS, RETENTION & BOOKING FUNNEL REPORT
  // ===========================================================================
  async getCustomersAndFunnelReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);

    // 7.1 Booking Funnel Stages
    const [allHoldsCreated, paymentsSettled, completedMatches, cancelledHolds] = await Promise.all([
      this.bookingRepo.countDocuments({
        createdAt: { $gte: start, $lte: end },
      }),
      this.bookingRepo.countDocuments({
        createdAt: { $gte: start, $lte: end },
        paymentStatus: { $in: [PaymentStatusEnum.paid, PaymentStatusEnum.partially_paid, PaymentStatusEnum.pay_at_venue] },
      }),
      this.bookingRepo.countDocuments({
        createdAt: { $gte: start, $lte: end },
        status: BookingStatusEnum.completed,
      }),
      this.bookingRepo.countDocuments({
        createdAt: { $gte: start, $lte: end },
        status: { $in: [BookingStatusEnum.cancelled, BookingStatusEnum.expired] },
      }),
    ]);

    const funnelStages = [
      {
        stage: '1. Booking Hold Initiated',
        count: allHoldsCreated,
        conversionRate: 100,
      },
      {
        stage: '2. Payment Settled',
        count: paymentsSettled,
        conversionRate: allHoldsCreated > 0 ? Number(((paymentsSettled / allHoldsCreated) * 100).toFixed(1)) : 0,
      },
      {
        stage: '3. Match Completed & Attended',
        count: completedMatches,
        conversionRate: paymentsSettled > 0 ? Number(((completedMatches / paymentsSettled) * 100).toFixed(1)) : 0,
      },
    ];

    // 7.2 Customer Retention & Repeat Booking Frequency
    const customerBookingFrequencies = await this.bookingRepo.aggregate([
      {
        $match: {
          status: { $ne: BookingStatusEnum.cancelled },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalBookings: { $sum: 1 },
          totalSpend: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
        },
      },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: ['$totalBookings', 1] }, then: '1 Booking (One-Time)' },
                {
                  case: {
                    $and: [{ $gte: ['$totalBookings', 2] }, { $lte: ['$totalBookings', 4] }],
                  },
                  then: '2–4 Bookings (Repeat)',
                },
                { case: { $gte: ['$totalBookings', 5] }, then: '5+ Bookings (Loyal)' },
              ],
              default: 'Other',
            },
          },
          customersCount: { $sum: 1 },
          totalRevenue: { $sum: '$totalSpend' },
        },
      },
    ]);

    let oneTimeCount = 0;
    let repeatCount = 0;
    let loyalCount = 0;
    let totalActiveCustomers = 0;

    customerBookingFrequencies.forEach((f) => {
      totalActiveCustomers += f.customersCount;
      if (f._id.includes('One-Time')) oneTimeCount = f.customersCount;
      else if (f._id.includes('Repeat')) repeatCount = f.customersCount;
      else if (f._id.includes('Loyal')) loyalCount = f.customersCount;
    });

    const repeatRate = totalActiveCustomers > 0
      ? Number((((repeatCount + loyalCount) / totalActiveCustomers) * 100).toFixed(1))
      : 0;

    // 7.3 Top Customers Ranked by Spend and Bookings
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const topCustomers = await this.bookingRepo.aggregate([
      {
        $match: {
          status: { $ne: BookingStatusEnum.cancelled },
        },
      },
      {
        $group: {
          _id: '$userId',
          bookingsCount: { $sum: 1 },
          totalSpent: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
          lastBookingDate: { $max: '$date' },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'customerusers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $project: {
          _id: 1,
          bookingsCount: 1,
          totalSpent: 1,
          lastBookingDate: 1,
          userName: { $arrayElemAt: ['$customer.userName', 0] },
          phone: { $arrayElemAt: ['$customer.phone', 0] },
          email: { $arrayElemAt: ['$customer.email', 0] },
          status: { $arrayElemAt: ['$customer.status', 0] },
          noShowCount: { $arrayElemAt: ['$customer.noShowCount', 0] },
        },
      },
    ]);

    return {
      summary: {
        totalCustomersAudited: totalActiveCustomers,
        oneTimeCustomersCount: oneTimeCount,
        repeatCustomersCount: repeatCount,
        loyalCustomersCount: loyalCount,
        repeatRatePct: repeatRate,
        cancelledOrExpiredHolds: cancelledHolds,
      },
      funnel: funnelStages,
      retentionDistribution: customerBookingFrequencies,
      topCustomersTable: {
        docs: topCustomers,
        total: totalActiveCustomers,
        page,
        limit,
      },
    };
  }

  // ===========================================================================
  // 8. VENUE OWNER PAYOUTS & DISPUTES REPORT
  // ===========================================================================
  async getPayoutsAndDisputesReport(query: QueryReportDto) {
    const { start, end } = this.parseDateRange(query);
    const commissionRate = query.commissionRate !== undefined && query.commissionRate !== null
      ? Number(query.commissionRate)
      : 10;

    // 8.1 Venue Owner Revenue & Commission Settlement
    const ownerPayouts = await this.bookingRepo.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          status: { $in: [BookingStatusEnum.confirmed, BookingStatusEnum.completed, BookingStatusEnum.no_show] },
        },
      },
      {
        $lookup: {
          from: 'venues',
          localField: 'venueId',
          foreignField: '_id',
          as: 'venue',
        },
      },
      {
        $unwind: '$venue',
      },
      {
        $group: {
          _id: '$venue.createdBy',
          venueName: { $first: '$venue.venueName' },
          venueId: { $first: '$venue._id' },
          bookingsCount: { $sum: 1 },
          grossRevenue: { $sum: { $ifNull: ['$finalPrice', '$totalPrice'] } },
        },
      },
      {
        $lookup: {
          from: 'adminusers',
          localField: '_id',
          foreignField: '_id',
          as: 'owner',
        },
      },
      {
        $project: {
          _id: 1,
          ownerId: '$_id',
          ownerName: { $arrayElemAt: ['$owner.userName', 0] },
          ownerEmail: { $arrayElemAt: ['$owner.email', 0] },
          venueName: 1,
          venueId: 1,
          bookingsCount: 1,
          grossRevenue: 1,
          commissionRate: { $literal: commissionRate },
          platformFee: {
            $multiply: ['$grossRevenue', commissionRate / 100],
          },
          netPayoutOwed: {
            $subtract: [
              '$grossRevenue',
              { $multiply: ['$grossRevenue', commissionRate / 100] },
            ],
          },
          payoutStatus: { $literal: 'Eligible for Payout' },
        },
      },
      { $sort: { grossRevenue: -1 } },
    ]);

    let totalGrossRevenue = 0;
    let totalPlatformCommission = 0;
    let totalOwnerPayouts = 0;

    ownerPayouts.forEach((p) => {
      totalGrossRevenue += p.grossRevenue;
      totalPlatformCommission += p.platformFee;
      totalOwnerPayouts += p.netPayoutOwed;
    });

    // 8.2 Customer Disputes & Contacts Breakdown
    const disputesStats = await this.contactRepo.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const disputesList = await this.contactRepo.find({
      filter: { createdAt: { $gte: start, $lte: end } },
      options: { sort: { createdAt: -1 }, limit: query.limit || 20 },
    });

    return {
      summary: {
        commissionRatePct: commissionRate,
        totalGrossRevenue,
        totalPlatformCommission,
        totalOwnerPayouts,
        totalDisputes: disputesList.length,
      },
      ownerPayoutsTable: {
        docs: ownerPayouts,
        total: ownerPayouts.length,
      },
      disputesStatusDistribution: disputesStats,
      disputesTable: {
        docs: disputesList,
        total: disputesList.length,
      },
    };
  }

  // ===========================================================================
  // 9. REPORTS OVERVIEW DASHBOARD
  // ===========================================================================
  async getReportsOverview(query: QueryReportDto) {
    const [revenue, refunds, noShows, utilization] = await Promise.all([
      this.getRevenueReport(query),
      this.getRefundsAndWalletReport(query),
      this.getNoShowsReport(query),
      this.getVenueUtilizationReport(query),
    ]);

    return {
      kpis: {
        grossRevenue: revenue.summary.grossRevenue,
        netRevenue: revenue.summary.netRevenue,
        totalRefunds: refunds.summary.refundVolume,
        walletLiability: refunds.summary.totalWalletLiability,
        noShowRate: noShows.summary.noShowRatePct,
        occupancyRate: utilization.summary.overallOccupancyRatePct,
        totalBookings: revenue.summary.totalBookings,
      },
      revenueSeries: revenue.series,
      paymentMethods: revenue.paymentMethodDistribution,
      peakHoursSeries: utilization.series,
      pendingDeposits: revenue.pendingDepositsTable,
    };
  }
}
