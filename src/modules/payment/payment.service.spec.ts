import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { WalletService } from '../wallet/wallet.service';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import { BookingGateway } from '../booking/booking.gateway';
import {
  BookingStatusEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { Types } from 'mongoose';

describe('PaymentService (Webhook Group & Deposit Resolution)', () => {
  let service: PaymentService;
  let paymentRepo: jest.Mocked<PaymentRepo>;
  let bookingRepo: jest.Mocked<BookingRepo>;
  let paymobService: jest.Mocked<PaymobService>;

  const mockPaymentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockBookingRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockVenueRepo = {
    findById: jest.fn(),
  };

  const mockWalletService = {
    payForBooking: jest.fn(),
    refundBooking: jest.fn(),
  };

  const mockPaymobService = {
    verifyWebhookHmac: jest.fn(),
    createPaymentIntention: jest.fn(),
  };

  const mockBookingGateway = {
    emitBookingConfirmed: jest.fn(),
    emitOwnerNotification: jest.fn(),
    emitSlotReleased: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PaymentRepo, useValue: mockPaymentRepo },
        { provide: BookingRepo, useValue: mockBookingRepo },
        { provide: VenueRepo, useValue: mockVenueRepo },
        { provide: WalletService, useValue: mockWalletService },
        { provide: PaymobService, useValue: mockPaymobService },
        { provide: BookingGateway, useValue: mockBookingGateway },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepo = module.get(PaymentRepo);
    bookingRepo = module.get(BookingRepo);
    paymobService = module.get(PaymobService);
    jest.clearAllMocks();

    mockPaymobService.verifyWebhookHmac.mockReturnValue(true);
  });

  describe('handlePaymobWebhook', () => {
    it('should confirm all bookings in a groupId when full payment webhook arrives', async () => {
      const groupId = 'group-uuid-123';
      const bookingId1 = new Types.ObjectId();
      const bookingId2 = new Types.ObjectId();

      const mockPayment: any = {
        _id: new Types.ObjectId(),
        groupId,
        bookingId: bookingId1,
        amount: 300,
        status: PaymentStatusEnum.unpaid,
        userId: new Types.ObjectId(),
      };

      mockPaymentRepo.findOne.mockImplementation(async ({ filter }: any) => {
        if (filter?.paymobTransactionId) {
          return null;
        }
        return mockPayment;
      });

      mockPaymentRepo.findOneAndUpdate.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatusEnum.paid,
      });

      const groupBookings: any[] = [
        {
          _id: bookingId1,
          groupId,
          finalPrice: 150,
          status: BookingStatusEnum.pending,
          paymentStatus: PaymentStatusEnum.unpaid,
          venueId: new Types.ObjectId(),
        },
        {
          _id: bookingId2,
          groupId,
          finalPrice: 150,
          status: BookingStatusEnum.pending,
          paymentStatus: PaymentStatusEnum.unpaid,
          venueId: new Types.ObjectId(),
        },
      ];

      mockBookingRepo.find.mockResolvedValue(groupBookings);
      mockBookingRepo.findByIdAndUpdate.mockImplementation(
        async ({ id, update }) => ({
          _id: id,
          ...update,
        }),
      );

      const payload = {
        transaction: {
          id: 998877,
          success: true,
          special_reference: 'TXN-ABC-123',
        },
      };

      const result = await service.handlePaymobWebhook(payload, 'valid-hmac');

      expect(result.status).toBe(PaymentStatusEnum.paid);
      expect(mockBookingRepo.findByIdAndUpdate).toHaveBeenCalledTimes(2);
      expect(mockBookingRepo.findByIdAndUpdate).toHaveBeenCalledWith({
        id: bookingId1,
        update: expect.objectContaining({
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.paid,
        }),
      });
      expect(mockBookingRepo.findByIdAndUpdate).toHaveBeenCalledWith({
        id: bookingId2,
        update: expect.objectContaining({
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.paid,
        }),
      });
    });

    it('should set partially_paid when webhook payment amount matches deposit (< totalDue)', async () => {
      const groupId = 'group-deposit-456';
      const bookingId1 = new Types.ObjectId();
      const bookingId2 = new Types.ObjectId();

      const mockPayment: any = {
        _id: new Types.ObjectId(),
        groupId,
        bookingId: bookingId1,
        amount: 100, // Deposit paid: 100 EGP (Total due: 400 EGP)
        status: PaymentStatusEnum.unpaid,
        userId: new Types.ObjectId(),
      };

      mockPaymentRepo.findOne.mockImplementation(async ({ filter }: any) => {
        if (filter?.paymobTransactionId) {
          return null;
        }
        return mockPayment;
      });

      mockPaymentRepo.findOneAndUpdate.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatusEnum.partially_paid,
      });

      const groupBookings: any[] = [
        {
          _id: bookingId1,
          groupId,
          finalPrice: 200,
          status: BookingStatusEnum.pending,
          venueId: new Types.ObjectId(),
        },
        {
          _id: bookingId2,
          groupId,
          finalPrice: 200,
          status: BookingStatusEnum.pending,
          venueId: new Types.ObjectId(),
        },
      ];

      mockBookingRepo.find.mockResolvedValue(groupBookings);
      mockBookingRepo.findByIdAndUpdate.mockImplementation(
        async ({ id, update }) => ({
          _id: id,
          ...update,
        }),
      );

      const payload = {
        transaction: {
          id: 998878,
          success: true,
          special_reference: 'TXN-DEP-456',
        },
      };

      const result = await service.handlePaymobWebhook(payload, 'valid-hmac');

      expect(result.status).toBe(PaymentStatusEnum.partially_paid);
      expect(mockBookingRepo.findByIdAndUpdate).toHaveBeenCalledWith({
        id: bookingId1,
        update: expect.objectContaining({
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.partially_paid,
        }),
      });
      expect(mockBookingRepo.findByIdAndUpdate).toHaveBeenCalledWith({
        id: bookingId2,
        update: expect.objectContaining({
          status: BookingStatusEnum.confirmed,
          paymentStatus: PaymentStatusEnum.partially_paid,
        }),
      });
    });
  });
});
