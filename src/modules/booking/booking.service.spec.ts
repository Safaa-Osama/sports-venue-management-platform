import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { BookingService } from './booking.service';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { WalletService } from '../wallet/wallet.service';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import { BookingGateway } from './booking.gateway';
import RedisService from 'src/common/services/redis/redis.service';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { Types } from 'mongoose';
import { PushNotificationService } from '../push-notification/push-notification.service';

const mockPushNotificationService = {
  sendToCustomer: jest.fn().mockResolvedValue(undefined),
  sendToAdmin: jest.fn().mockResolvedValue(undefined),
  sendToUser: jest.fn().mockResolvedValue(undefined),
  broadcastToAllCustomers: jest.fn().mockResolvedValue(undefined),
  registerPushToken: jest.fn().mockResolvedValue(true),
  removePushToken: jest.fn().mockResolvedValue(true),
  pruneInvalidToken: jest.fn().mockResolvedValue(undefined),
};

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQrCode'),
}));

describe('BookingService (R2 Multi-Slot & R3 Minimum Deposit)', () => {
  jest.setTimeout(15000);
  let service: BookingService;
  let bookingRepo: jest.Mocked<BookingRepo>;
  let venueRepo: jest.Mocked<VenueRepo>;
  let walletService: jest.Mocked<WalletService>;
  let paymobService: jest.Mocked<PaymobService>;
  let redisService: jest.Mocked<RedisService>;

  const mockVenueId = new Types.ObjectId('64e8b0a1f2b4c10012345678');
  const mockUserId = new Types.ObjectId('64e8b0a1f2b4c10012345679');

  const mockUser: any = {
    _id: mockUserId,
    userName: 'Player One',
    email: 'player@example.com',
    phone: ['+201000000001'],
  };

  const mockBookingRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockPaymentRepo = {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockVenueRepo = {
    findById: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCouponRepo = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockWalletService = {
    getOrCreateWallet: jest.fn(),
    payForBooking: jest.fn(),
    refundBooking: jest.fn(),
  };

  const mockPaymobService = {
    createPaymentIntention: jest.fn(),
    verifyWebhookHmac: jest.fn(),
  };

  const mockBookingGateway = {
    emitSlotLocked: jest.fn(),
    emitSlotReleased: jest.fn(),
    emitBookingConfirmed: jest.fn(),
    emitOwnerNotification: jest.fn(),
  };

  const mockRedisService = {
    getValue: jest.fn(),
    setValue: jest.fn(),
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
  };

  const mockConnection = {
    client: {
      topology: {
        description: {
          type: 'ReplicaSetWithPrimary',
        },
      },
    },
    startSession: jest.fn().mockImplementation(async () => ({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: BookingRepo, useValue: mockBookingRepo },
        { provide: PaymentRepo, useValue: mockPaymentRepo },
        { provide: VenueRepo, useValue: mockVenueRepo },
        { provide: CouponRepo, useValue: mockCouponRepo },
        { provide: WalletService, useValue: mockWalletService },
        { provide: PaymobService, useValue: mockPaymobService },
        { provide: BookingGateway, useValue: mockBookingGateway },
        { provide: RedisService, useValue: mockRedisService },
        { provide: PushNotificationService, useValue: mockPushNotificationService },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
    bookingRepo = module.get(BookingRepo);
    venueRepo = module.get(VenueRepo);
    walletService = module.get(WalletService);
    paymobService = module.get(PaymobService);
    redisService = module.get(RedisService);
    jest.clearAllMocks();

    mockRedisService.acquireLock.mockResolvedValue(true);
    mockRedisService.releaseLock.mockResolvedValue(true);
    mockRedisService.getValue.mockResolvedValue(null);
    mockWalletService.getOrCreateWallet.mockResolvedValue({ balance: 0 });
  });

  describe('createBooking (R2 Multi-Slot)', () => {
    it('should create multiple Booking documents with shared groupId for multi-slot request', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Arena Hub',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 150,
        createdBy: new Types.ObjectId(),
      });

      mockBookingRepo.find.mockResolvedValue([]); // No overlaps
      mockWalletService.getOrCreateWallet.mockResolvedValue({
        balance: 1000,
      } as any);

      const createdDocs: any[] = [];
      mockBookingRepo.create.mockImplementation(async (data: any) => {
        const doc = {
          ...data,
          _id: new Types.ObjectId(),
          toObject: () => ({ ...data }),
        };
        createdDocs.push(doc);
        return doc;
      });

      mockBookingRepo.findByIdAndUpdate.mockImplementation(
        async ({ id, update }) => {
          const found = createdDocs.find(
            (d) => d._id.toString() === id.toString(),
          );
          if (found) {
            Object.assign(found, update);
            return found;
          }
          return null;
        },
      );

      mockBookingRepo.findById.mockImplementation(async (id) => {
        return (
          createdDocs.find((d) => d._id.toString() === id.toString()) || null
        );
      });

      const futureDate = '2026-12-15';
      const result = await service.createBooking(
        {
          venueId: mockVenueId.toString(),
          date: futureDate,
          slots: [
            { startTime: 10, endTime: 11 },
            { startTime: 14, endTime: 15 },
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        },
        mockUser,
      );

      expect(result.groupId).toBeDefined();
      expect(result.bookings).toHaveLength(2);
      expect(result.bookings[0].groupId).toBe(result.groupId);
      expect(result.bookings[1].groupId).toBe(result.groupId);
      expect(result.bookings[0].startTime).toBe(10);
      expect(result.bookings[1].startTime).toBe(14);
      expect(result.bookings[0].status).toBe(BookingStatusEnum.confirmed);
      expect(result.bookings[1].status).toBe(BookingStatusEnum.confirmed);
      expect(result.payment.amount).toBe(300); // 150 * 2
      expect(mockWalletService.payForBooking).toHaveBeenCalledWith(
        mockUserId,
        300,
        expect.any(String),
        expect.anything(),
      );
    });

    it('should maintain backward compatibility for single slot request with startTime and endTime', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Arena Hub',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 100,
      });

      mockBookingRepo.find.mockResolvedValue([]);
      mockWalletService.getOrCreateWallet.mockResolvedValue({
        balance: 500,
      } as any);

      mockBookingRepo.create.mockImplementation(async (data: any) => ({
        ...data,
        _id: new Types.ObjectId(),
      }));
      mockBookingRepo.findByIdAndUpdate.mockImplementation(
        async ({ update }) => ({
          ...update,
          _id: new Types.ObjectId(),
        }),
      );
      mockBookingRepo.findById.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: BookingStatusEnum.confirmed,
      } as any);

      const result = await service.createBooking(
        {
          venueId: mockVenueId.toString(),
          date: '2026-12-15',
          startTime: 18,
          endTime: 19,
          paymentMethod: PaymentMethodEnum.wallet,
        },
        mockUser,
      );

      expect(result.groupId).toBeDefined();
      expect(result.bookings).toHaveLength(1);
      expect(result.booking).toBeDefined();
    });

    it('should reject overlapping requested slots in the same request', async () => {
      const dto: any = {
        venueId: mockVenueId.toString(),
        date: '2026-12-15',
        slots: [
          { startTime: 18, endTime: 20 },
          { startTime: 19, endTime: 21 },
        ],
        paymentMethod: PaymentMethodEnum.wallet,
      };

      await expect(service.createBooking(dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if any requested slot is already booked', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Arena Hub',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 100,
      });

      mockBookingRepo.find.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          startTime: 18,
          endTime: 19,
          status: BookingStatusEnum.confirmed,
        },
      ] as any);

      const dto: any = {
        venueId: mockVenueId.toString(),
        date: '2026-12-15',
        slots: [
          { startTime: 10, endTime: 11 },
          { startTime: 18, endTime: 19 },
        ],
        paymentMethod: PaymentMethodEnum.wallet,
      };

      await expect(service.createBooking(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject if any requested slot is held under pending status by another user', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Arena Hub',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 100,
      });

      mockBookingRepo.find.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(), // Different user
          startTime: 18,
          endTime: 19,
          status: BookingStatusEnum.pending,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // unexpired
        },
      ] as any);

      const dto: any = {
        venueId: mockVenueId.toString(),
        date: '2026-12-15',
        slots: [{ startTime: 18, endTime: 19 }],
        paymentMethod: PaymentMethodEnum.wallet,
      };

      await expect(service.createBooking(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow re-booking if the slot is held under pending status by the SAME user', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Arena Hub',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 100,
      });

      const oldHoldId = new Types.ObjectId();
      mockBookingRepo.find.mockResolvedValue([
        {
          _id: oldHoldId,
          userId: mockUser._id, // SAME user
          startTime: 18,
          endTime: 19,
          status: BookingStatusEnum.pending,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // unexpired
        },
      ] as any);

      mockBookingRepo.findByIdAndDelete.mockResolvedValue({ _id: oldHoldId } as any);
      mockBookingRepo.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: mockUser._id,
        venueId: mockVenueId,
        groupId: 'test-group',
        date: new Date('2026-12-15'),
        startTime: 18,
        endTime: 19,
        totalPrice: 100,
        paidAmount: 100,
        remainingAmount: 0,
        status: BookingStatusEnum.confirmed,
        paymentStatus: PaymentStatusEnum.paid,
        paymentMethod: PaymentMethodEnum.wallet,
      } as any);

      mockWalletService.getOrCreateWallet.mockResolvedValue({ balance: 500 });
      mockWalletService.payForBooking.mockResolvedValue({});

      const dto: any = {
        venueId: mockVenueId.toString(),
        date: '2026-12-15',
        slots: [{ startTime: 18, endTime: 19 }],
        paymentMethod: PaymentMethodEnum.wallet,
      };

      const result = await service.createBooking(dto, mockUser);
      expect(result).toBeDefined();
      expect(mockBookingRepo.findByIdAndDelete).toHaveBeenCalledWith(oldHoldId);
    });
  });

  describe('createBooking (R3 Minimum Deposit Per Slot)', () => {
    it('should calculate deposit as slots.length * minimumDepositAmount and mark status partially_paid when deposit is paid', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Deposit Arena',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 200,
        minimumDepositAmount: 50, // 50 EGP deposit per slot
      });

      mockBookingRepo.find.mockResolvedValue([]);
      mockWalletService.getOrCreateWallet.mockResolvedValue({
        balance: 500,
      } as any);

      const createdDocs: any[] = [];
      mockBookingRepo.create.mockImplementation(async (data: any) => {
        const doc = { ...data, _id: new Types.ObjectId() };
        createdDocs.push(doc);
        return doc;
      });

      mockBookingRepo.findByIdAndUpdate.mockImplementation(
        async ({ id, update }) => {
          const found = createdDocs.find(
            (d) => d._id.toString() === id.toString(),
          );
          if (found) {
            Object.assign(found, update);
            return found;
          }
          return null;
        },
      );

      mockBookingRepo.findById.mockImplementation(async (id) => {
        return (
          createdDocs.find((d) => d._id.toString() === id.toString()) || null
        );
      });

      const result = await service.createBooking(
        {
          venueId: mockVenueId.toString(),
          date: '2026-12-15',
          slots: [
            { startTime: 10, endTime: 11 }, // Price 200
            { startTime: 12, endTime: 13 }, // Price 200
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        },
        mockUser,
      );

      // Total price = 400. Required deposit = 2 slots * 50 = 100.
      expect(result.payment.amount).toBe(100);
      expect(result.payment.isDeposit).toBe(true);
      expect(result.payment.status).toBe(PaymentStatusEnum.partially_paid);
      expect(result.bookings[0].paymentStatus).toBe(
        PaymentStatusEnum.partially_paid,
      );
      expect(result.bookings[0].status).toBe(BookingStatusEnum.confirmed);
      expect(mockWalletService.payForBooking).toHaveBeenCalledWith(
        mockUserId,
        100,
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe('createBooking (Paymob Group Session)', () => {
    it('should initiate a single Paymob payment intention for the entire group amount', async () => {
      mockVenueRepo.findById.mockResolvedValue({
        _id: mockVenueId,
        venueName: 'Paymob Arena',
        isActive: true,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 150,
      });

      mockBookingRepo.find.mockResolvedValue([]);
      mockPaymentRepo.create.mockImplementation(async (data: any) => ({
        ...data,
        _id: new Types.ObjectId(),
      }));

      mockPaymobService.createPaymentIntention.mockResolvedValue({
        clientSecret: 'secret_123',
        publicKey: 'pub_123',
        redirectUrl: 'https://paymob.com/checkout/123',
      });

      mockBookingRepo.create.mockImplementation(async (data: any) => ({
        ...data,
        _id: new Types.ObjectId(),
      }));

      const result = await service.createBooking(
        {
          venueId: mockVenueId.toString(),
          date: '2026-12-15',
          slots: [
            { startTime: 10, endTime: 11 },
            { startTime: 11, endTime: 12 },
          ],
          paymentMethod: PaymentMethodEnum.paymob,
        },
        mockUser,
      );

      expect(result.payment.amountToPay).toBe(300);
      expect(result.payment.clientSecret).toBe('secret_123');
      expect(mockPaymobService.createPaymentIntention).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 300,
          userEmail: 'player@example.com',
        }),
      );
    });
  });
});
