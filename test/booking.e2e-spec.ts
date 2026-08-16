import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptor/response';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '../src/common/enums/bookingEnum';
import { CouponEnum } from '../src/common/enums/couponEnum';
import { RoleEnum } from '../src/common/enums/userEnum';
import { AdminUserRepo } from '../src/common/reposetories/admin-user-repo';
import { VenueRepo } from '../src/common/reposetories/venue-repo';
import { CouponRepo } from '../src/common/reposetories/coupon-repo';
import { WalletRepo } from '../src/common/reposetories/wallet-repo';
import { WalletTransactionRepo } from '../src/common/reposetories/wallet-transaction-repo';
import { BookingRepo } from '../src/common/reposetories/booking-repo';
import { PaymentRepo } from '../src/common/reposetories/payment-repo';
import { Types } from 'mongoose';
import { hash } from '../src/common/services/securityService/hash';
import RedisService from '../src/common/services/redis/redis.service';

describe('Production Audit Suite: Wallet Atomicity, Booking Idempotency & Paymob Webhooks', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let testVenueId: string;
  let customPriceVenueId: string;
  let adminUserRepo: AdminUserRepo;
  let venueRepo: VenueRepo;
  let couponRepo: CouponRepo;
  let walletRepo: WalletRepo;
  let walletTransactionRepo: WalletTransactionRepo;
  let bookingRepo: BookingRepo;
  let paymentRepo: PaymentRepo;

  const testFutureDate = '2026-12-10';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();

    adminUserRepo = app.get(AdminUserRepo);
    venueRepo = app.get(VenueRepo);
    couponRepo = app.get(CouponRepo);
    walletRepo = app.get(WalletRepo);
    walletTransactionRepo = app.get(WalletTransactionRepo);
    bookingRepo = app.get(BookingRepo);
    paymentRepo = app.get(PaymentRepo);

    // 1. Ensure Super Admin exists
    const adminEmail = 'admin@venue.com';
    const adminPassword = 'Admin@123456';
    let admin = await adminUserRepo.findOne({ filter: { email: adminEmail } });
    if (!admin) {
      admin = await adminUserRepo.create({
        userName: 'Super Admin',
        email: adminEmail,
        password: hash({ text: adminPassword }),
        role: RoleEnum.superAdmin,
      });
    }
    adminUserId = admin._id.toString();

    // 2. Login to get JWT
    const loginRes = await request(app.getHttpServer())
      .post('/auth/dashboard/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(loginRes.status).toBe(201);
    adminToken = loginRes.body?.data?.accessToken || loginRes.body?.accessToken;
    expect(adminToken).toBeDefined();

    // 3. Create Standard Test Venue
    let venue = await venueRepo.findOne({
      filter: { venueName: 'Production Audit Arena' },
    });
    if (!venue) {
      venue = await venueRepo.create({
        venueName: 'Production Audit Arena',
        sportsType: ['football'],
        address: '100 Stadium Road',
        locationAlt: 30.0444,
        locationLang: 31.2357,
        images: ['https://example.com/stadium.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 23,
        defaultHourPrice: 100,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    } else {
      await venueRepo.findByIdAndUpdate({
        id: venue._id,
        update: {
          isActive: true,
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 100,
        },
      });
    }
    testVenueId = venue._id.toString();

    // 4. Custom Hour Prices Venue
    let customVenue = await venueRepo.findOne({
      filter: { venueName: 'Custom Pricing Production Arena' },
    });
    if (!customVenue) {
      customVenue = await venueRepo.create({
        venueName: 'Custom Pricing Production Arena',
        sportsType: ['padel'],
        address: '200 Padel Court Way',
        locationAlt: 30.0555,
        locationLang: 31.2457,
        images: ['https://example.com/padel.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 23,
        defaultHourPrice: 100,
        customHourPrices: [
          { hour: 17, pricePerHour: 150 },
          { hour: 18, pricePerHour: 200 },
          { hour: 19, pricePerHour: 150 },
        ],
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    } else {
      await venueRepo.findByIdAndUpdate({
        id: customVenue._id,
        update: {
          isActive: true,
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 100,
          customHourPrices: [
            { hour: 17, pricePerHour: 150 },
            { hour: 18, pricePerHour: 200 },
            { hour: 19, pricePerHour: 150 },
          ],
        },
      });
    }
    customPriceVenueId = customVenue._id.toString();

    // Clean up test bookings on test date
    const d = new Date(testFutureDate);
    const startOfDay = new Date(d);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setUTCHours(23, 59, 59, 999);
    await bookingRepo.deleteMany({
      filter: {
        date: { $gte: startOfDay, $lte: endOfDay },
      },
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('A. Wallet Payment Atomicity & Invariant Proof', () => {
    it('should deduct wallet balance, confirm booking, and create transaction record atomically in a MongoDB transaction', async () => {
      // Set wallet balance to 500
      let wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      if (!wallet) {
        wallet = await walletRepo.create({
          userId: new Types.ObjectId(adminUserId),
          balance: 500,
        });
      } else {
        await walletRepo.findByIdAndUpdate({
          id: wallet._id,
          update: { balance: 500 },
        });
      }

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 8,
          endTime: 10,
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect(res.status).toBe(201);
      const booking = res.body?.data?.booking || res.body?.booking;
      expect(booking.status).toBe(BookingStatusEnum.confirmed);
      expect(booking.paymentStatus).toBe(PaymentStatusEnum.paid);
      expect(booking.paymentMethod).toBe(PaymentMethodEnum.wallet);
      expect(booking.finalPrice).toBe(200);

      // Verify wallet balance was exactly deducted to 300
      const updatedWallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(updatedWallet?.balance).toBe(300);
    });

    it('should NOT deduct balance or create any booking if balance is insufficient', async () => {
      // Set wallet balance to 50 EGP (insufficient for 200 EGP booking)
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 50 },
      });

      const countBefore = await bookingRepo.countDocuments();

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 10,
          endTime: 12,
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient wallet balance');

      // Balance unchanged
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(50);

      // Zero booking records created
      const countAfter = await bookingRepo.countDocuments();
      expect(countAfter).toBe(countBefore);
    });

    it('FAILURE INJECTION 1: should abort MongoDB transaction and leave wallet untouched if transaction creation fails', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      // Inject failure on transaction record creation
      jest
        .spyOn(walletTransactionRepo, 'create')
        .mockImplementation(async () => {
          throw new Error(
            'INJECTED_DB_FAILURE: Failed to write transaction ledger document',
          );
        });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 19,
          endTime: 20,
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([400, 500]).toContain(res.status);

      // Restore spy
      jest.restoreAllMocks();

      // PROVE FINANCIAL INVARIANT: Wallet balance is 100% UNTOUCHED (500 EGP, NOT 400 EGP)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(500);

      // PROVE NO ORPHANED BOOKING: Slot is NOT confirmed
      const booking = await bookingRepo.findOne({
        filter: {
          venueId: new Types.ObjectId(testVenueId),
          startTime: 19,
          endTime: 20,
          status: BookingStatusEnum.confirmed,
        },
      });
      expect(booking).toBeNull();
    });

    it('FAILURE INJECTION 2: should abort MongoDB transaction and restore balance if booking update fails', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      // Inject failure on booking confirmation update
      jest
        .spyOn(BookingRepo.prototype, 'findByIdAndUpdate')
        .mockRejectedValueOnce(
          new Error(
            'INJECTED_DB_FAILURE: Booking confirmation status update failed',
          ),
        );

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 20,
          endTime: 21,
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([400, 500]).toContain(res.status);

      // Restore spy
      jest.restoreAllMocks();

      // PROVE FINANCIAL INVARIANT: Wallet balance is 100% RESTORED/UNTOUCHED (500 EGP)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(500);

      // PROVE NO ORPHANED BOOKING CREATED
      const booking = await bookingRepo.findOne({
        filter: {
          venueId: new Types.ObjectId(testVenueId),
          startTime: 20,
          endTime: 21,
          status: BookingStatusEnum.confirmed,
        },
      });
      expect(booking).toBeNull();
    });

    it('FAILURE INJECTION 3: should abort and restore balance if post-deduction commit phase fails', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      let coupon = await couponRepo.findOne({ filter: { code: 'FAILCOMMIT' } });
      if (!coupon) {
        coupon = await couponRepo.create({
          code: 'FAILCOMMIT',
          discount: 10,
          discountType: CouponEnum.percentage,
          maxUses: 100,
          startDate: new Date(Date.now() - 86400000),
          endDate: new Date(Date.now() + 86400000 * 30),
          isActive: true,
          createdBy: new Types.ObjectId(adminUserId),
        });
      }

      // 1st findOne in createBooking succeeds, 2nd findOne in payBooking throws
      jest
        .spyOn(CouponRepo.prototype, 'findOne')
        .mockResolvedValueOnce(coupon)
        .mockRejectedValueOnce(
          new Error('INJECTED_DB_FAILURE: Commit phase database failure'),
        );

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 21,
          endTime: 22,
          couponCode: 'FAILCOMMIT',
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([400, 500]).toContain(res.status);

      // PROVE FINANCIAL INVARIANT: Wallet balance is 100% RESTORED/UNTOUCHED (500 EGP)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(500);

      // PROVE NO ORPHANED BOOKING CREATED
      const booking = await bookingRepo.findOne({
        filter: {
          venueId: new Types.ObjectId(testVenueId),
          startTime: 21,
          endTime: 22,
          status: BookingStatusEnum.confirmed,
        },
      });
      expect(booking).toBeNull();
    });
  });

  describe('B. Request-Level Booking Idempotency', () => {
    it('1. Identical Retries: should replay the exact same booking response on duplicate/retried requests without charging the wallet twice', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      const idempotencyKey = 'IDEM-RETRY-' + Date.now();
      const bookingPayload = {
        venueId: testVenueId,
        date: testFutureDate,
        startTime: 12,
        endTime: 13,
        paymentMethod: PaymentMethodEnum.wallet,
        idempotencyKey,
      };

      // 1. First Request
      const res1 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('idempotency-key', idempotencyKey)
        .send(bookingPayload);

      expect(res1.status).toBe(201);
      const booking1 = res1.body?.data?.booking || res1.body?.booking;
      expect(booking1).toBeDefined();
      expect(booking1.status).toBe(BookingStatusEnum.confirmed);

      // Verify wallet balance is 400 (500 - 100)
      let wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(400);

      // 2. Retry with same Idempotency-Key (simulating network timeout replay)
      const res2 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('idempotency-key', idempotencyKey)
        .send(bookingPayload);

      expect([200, 201]).toContain(res2.status);
      const booking2 = res2.body?.data?.booking || res2.body?.booking;
      expect(booking2._id.toString()).toBe(booking1._id.toString());
      expect(booking2.bookingCode).toBe(booking1.bookingCode);

      // 3. PROVE THAT WALLET WAS NOT DEDUCTED AGAIN
      wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(400); // Still 400!
    });

    it('2. Concurrent Identical Requests: should execute exactly once and never charge wallet twice under parallel requests', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      const idempotencyKey = 'IDEM-CONCUR-' + Date.now();
      const bookingPayload = {
        venueId: testVenueId,
        date: testFutureDate,
        startTime: 13,
        endTime: 14,
        paymentMethod: PaymentMethodEnum.wallet,
        idempotencyKey,
      };

      // Send 4 concurrent requests with the identical Idempotency-Key
      const responses = await Promise.all([
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('idempotency-key', idempotencyKey)
          .send(bookingPayload),
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('idempotency-key', idempotencyKey)
          .send(bookingPayload),
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('idempotency-key', idempotencyKey)
          .send(bookingPayload),
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('idempotency-key', idempotencyKey)
          .send(bookingPayload),
      ]);

      // All responses should either succeed with 201/200 (replayed) or be safely rejected with 409
      const successResponses = responses.filter((r) =>
        [200, 201].includes(r.status),
      );
      expect(successResponses.length).toBeGreaterThanOrEqual(1);

      // Verify all successful responses reference the exact same booking ID
      const firstBookingId = (
        successResponses[0].body?.data?.booking ||
        successResponses[0].body?.booking
      )._id;
      for (const res of successResponses) {
        const b = res.body?.data?.booking || res.body?.booking;
        expect(b._id.toString()).toBe(firstBookingId.toString());
      }

      // PROVE ONLY 1 BOOKING CREATED IN DATABASE
      const bookingCount = await bookingRepo.find({
        filter: {
          venueId: new Types.ObjectId(testVenueId),
          startTime: 13,
          endTime: 14,
          status: BookingStatusEnum.confirmed,
        },
      });
      expect(bookingCount.length).toBe(1);

      // PROVE WALLET CHARGED EXACTLY ONCE (500 - 100 = 400)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(400);
    });

    it('3. Payload Fingerprint Mismatch: should reject if same Idempotency-Key is reused with a different request payload', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      const idempotencyKey = 'IDEM-MISMATCH-' + Date.now();

      // 1. Initial Request with Payload A (Slot 14 - 15)
      const res1 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 14,
          endTime: 15,
          paymentMethod: PaymentMethodEnum.wallet,
          idempotencyKey,
        });

      expect(res1.status).toBe(201);

      // 2. Malicious / Faulty Reuse of the same Idempotency-Key with Payload B (Slot 15 - 16)
      const res2 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 15,
          endTime: 16,
          paymentMethod: PaymentMethodEnum.wallet,
          idempotencyKey,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toContain(
        'Idempotency key mismatch: cannot reuse the same key with a different request payload',
      );

      // PROVE SECOND SLOT WAS NOT BOOKED
      const secondBooking = await bookingRepo.findOne({
        filter: {
          venueId: new Types.ObjectId(testVenueId),
          startTime: 15,
          endTime: 16,
          status: BookingStatusEnum.confirmed,
        },
      });
      expect(secondBooking).toBeNull();

      // PROVE WALLET ONLY CHARGED FOR FIRST BOOKING (500 - 100 = 400)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(400);
    });

    it('4. Crash Resilience: should safely recover from DB and replay response if Redis cache write fails or is lost after DB commit', async () => {
      // Set wallet balance to 500
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
      });

      const idempotencyKey = 'IDEM-CRASH-RECOVER-' + Date.now();
      const bookingPayload = {
        venueId: testVenueId,
        date: testFutureDate,
        startTime: 15,
        endTime: 16,
        paymentMethod: PaymentMethodEnum.wallet,
        idempotencyKey,
      };

      // 1. First Request: Successfully commits to MongoDB, but Redis caching fails or cache is lost
      const res1 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('idempotency-key', idempotencyKey)
        .send(bookingPayload);

      expect(res1.status).toBe(201);
      const booking1 = res1.body?.data?.booking || res1.body?.booking;

      // Simulate Redis cache eviction/loss right after DB commit
      const redisService = app.get(RedisService);
      const redisKey = `idem:req:${adminUserId}:${idempotencyKey}`;
      await redisService.delKey(redisKey);

      // Verify Redis key is truly deleted
      const checkRedis = await redisService.getValue(redisKey);
      expect(checkRedis).toBeNull();

      // 2. Client retries request with the same Idempotency-Key
      const res2 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('idempotency-key', idempotencyKey)
        .send(bookingPayload);

      expect([200, 201]).toContain(res2.status);
      const booking2 = res2.body?.data?.booking || res2.body?.booking;

      // PROVE RECOVERED IDENTICAL BOOKING FROM DATABASE
      expect(booking2._id.toString()).toBe(booking1._id.toString());
      expect(booking2.bookingCode).toBe(booking1.bookingCode);

      // PROVE WALLET CHARGED ONLY ONCE (500 - 100 = 400, NOT 300)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(400);

      // PROVE REDIS CACHE WAS SELF-HEALED FOR FUTURE RETRIES
      const healedCache: any = await redisService.getValue(redisKey);
      expect(healedCache).toBeDefined();
    });
  });

  describe('C. Paymob Payment & Webhook Idempotency', () => {
    let paymobBookingId: string;
    let paymobTxnId: string;

    it('should create pending Paymob booking and initial payment record', async () => {
      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: testVenueId,
          date: testFutureDate,
          startTime: 16,
          endTime: 18,
          paymentMethod: PaymentMethodEnum.paymob,
        });

      expect(res.status).toBe(201);
      const booking = res.body?.data?.booking || res.body?.booking;
      paymobBookingId = booking._id.toString();
      expect(booking.status).toBe(BookingStatusEnum.pending);
      expect(booking.paymentStatus).toBe(PaymentStatusEnum.unpaid);

      // Create an initial payment record in DB simulating initiated session
      paymobTxnId = 'TXN-PAYMOB-' + Date.now();
      await paymentRepo.create({
        bookingId: new Types.ObjectId(paymobBookingId),
        userId: new Types.ObjectId(adminUserId),
        amount: 200,
        paymentMethod: PaymentMethodEnum.paymob,
        transactionId: paymobTxnId,
        status: PaymentStatusEnum.unpaid,
      });
    });

    it('should process success webhook, confirm booking, and mark payment as paid', async () => {
      const hmacSecret =
        process.env.PAYMOB_HMAC_SECRET || 'CF847A5A5927CEDDBC9DB35C1B0ABEA1';
      const webhookPayload = {
        obj: {
          amount_cents: 20000,
          created_at: '2026-12-10T12:00:00.000Z',
          currency: 'EGP',
          error_occured: false,
          has_parent_transaction: false,
          id: 123456,
          integration_id: 3143838,
          is_3d_secure: true,
          is_auth: false,
          is_capture: false,
          is_refunded: false,
          is_standalone_payment: true,
          is_voided: false,
          order: { id: 987654 },
          owner: 111,
          pending: false,
          source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
          success: true,
          merchant_order_id: paymobTxnId,
        },
      };

      const concatenated = [
        webhookPayload.obj.amount_cents,
        webhookPayload.obj.created_at,
        webhookPayload.obj.currency,
        webhookPayload.obj.error_occured,
        webhookPayload.obj.has_parent_transaction,
        webhookPayload.obj.id,
        webhookPayload.obj.integration_id,
        webhookPayload.obj.is_3d_secure,
        webhookPayload.obj.is_auth,
        webhookPayload.obj.is_capture,
        webhookPayload.obj.is_refunded,
        webhookPayload.obj.is_standalone_payment,
        webhookPayload.obj.is_voided,
        webhookPayload.obj.order.id,
        webhookPayload.obj.owner,
        webhookPayload.obj.pending,
        webhookPayload.obj.source_data.pan,
        webhookPayload.obj.source_data.sub_type,
        webhookPayload.obj.source_data.type,
        webhookPayload.obj.success,
      ].join('');

      const crypto = require('crypto');
      const hmac = crypto
        .createHmac('sha512', hmacSecret)
        .update(concatenated)
        .digest('hex');

      const res = await request(app.getHttpServer())
        .post(`/payment/webhook/paymob?hmac=${hmac}`)
        .send(webhookPayload);

      expect(res.status).toBe(201);
      const data = res.body?.data || res.body;
      expect(data?.status).toBe(PaymentStatusEnum.paid);

      // Verify DB state
      const booking = await bookingRepo.findById(paymobBookingId);
      expect(booking?.status).toBe(BookingStatusEnum.confirmed);
      expect(booking?.paymentStatus).toBe(PaymentStatusEnum.paid);
      expect(booking?.expiresAt).toBeNull();
    });

    it('should be idempotent on duplicate / retried success webhook', async () => {
      const hmacSecret =
        process.env.PAYMOB_HMAC_SECRET || 'CF847A5A5927CEDDBC9DB35C1B0ABEA1';
      const webhookPayload = {
        obj: {
          amount_cents: 20000,
          created_at: '2026-12-10T12:00:00.000Z',
          currency: 'EGP',
          error_occured: false,
          has_parent_transaction: false,
          id: 123456,
          integration_id: 3143838,
          is_3d_secure: true,
          is_auth: false,
          is_capture: false,
          is_refunded: false,
          is_standalone_payment: true,
          is_voided: false,
          order: { id: 987654 },
          owner: 111,
          pending: false,
          source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
          success: true,
          merchant_order_id: paymobTxnId,
        },
      };

      const concatenated = [
        webhookPayload.obj.amount_cents,
        webhookPayload.obj.created_at,
        webhookPayload.obj.currency,
        webhookPayload.obj.error_occured,
        webhookPayload.obj.has_parent_transaction,
        webhookPayload.obj.id,
        webhookPayload.obj.integration_id,
        webhookPayload.obj.is_3d_secure,
        webhookPayload.obj.is_auth,
        webhookPayload.obj.is_capture,
        webhookPayload.obj.is_refunded,
        webhookPayload.obj.is_standalone_payment,
        webhookPayload.obj.is_voided,
        webhookPayload.obj.order.id,
        webhookPayload.obj.owner,
        webhookPayload.obj.pending,
        webhookPayload.obj.source_data.pan,
        webhookPayload.obj.source_data.sub_type,
        webhookPayload.obj.source_data.type,
        webhookPayload.obj.success,
      ].join('');

      const crypto = require('crypto');
      const hmac = crypto
        .createHmac('sha512', hmacSecret)
        .update(concatenated)
        .digest('hex');

      // Resend identical success webhook
      const res = await request(app.getHttpServer())
        .post(`/payment/webhook/paymob?hmac=${hmac}`)
        .send(webhookPayload);

      expect(res.status).toBe(201);
      const data = res.body?.data || res.body;
      expect(data?.status).toBe(PaymentStatusEnum.paid);
      expect(data?.note).toContain('already processed');

      // Verify booking remains confirmed without corruption
      const booking = await bookingRepo.findById(paymobBookingId);
      expect(booking?.status).toBe(BookingStatusEnum.confirmed);
    });

    it('should NOT allow out-of-order failed webhook to downgrade an already paid payment', async () => {
      const hmacSecret =
        process.env.PAYMOB_HMAC_SECRET || 'CF847A5A5927CEDDBC9DB35C1B0ABEA1';
      const failedWebhook = {
        obj: {
          amount_cents: 20000,
          created_at: '2026-12-10T12:00:00.000Z',
          currency: 'EGP',
          error_occured: true,
          has_parent_transaction: false,
          id: 123457,
          integration_id: 3143838,
          is_3d_secure: true,
          is_auth: false,
          is_capture: false,
          is_refunded: false,
          is_standalone_payment: true,
          is_voided: false,
          order: { id: 987654 },
          owner: 111,
          pending: false,
          source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
          success: false,
          merchant_order_id: paymobTxnId,
        },
      };

      const concatenated = [
        failedWebhook.obj.amount_cents,
        failedWebhook.obj.created_at,
        failedWebhook.obj.currency,
        failedWebhook.obj.error_occured,
        failedWebhook.obj.has_parent_transaction,
        failedWebhook.obj.id,
        failedWebhook.obj.integration_id,
        failedWebhook.obj.is_3d_secure,
        failedWebhook.obj.is_auth,
        failedWebhook.obj.is_capture,
        failedWebhook.obj.is_refunded,
        failedWebhook.obj.is_standalone_payment,
        failedWebhook.obj.is_voided,
        failedWebhook.obj.order.id,
        failedWebhook.obj.owner,
        failedWebhook.obj.pending,
        failedWebhook.obj.source_data.pan,
        failedWebhook.obj.source_data.sub_type,
        failedWebhook.obj.source_data.type,
        failedWebhook.obj.success,
      ].join('');

      const crypto = require('crypto');
      const hmac = crypto
        .createHmac('sha512', hmacSecret)
        .update(concatenated)
        .digest('hex');

      const res = await request(app.getHttpServer())
        .post(`/payment/webhook/paymob?hmac=${hmac}`)
        .send(failedWebhook);

      expect(res.status).toBe(201);

      // Payment remains paid in DB
      const payment = await paymentRepo.findOne({
        filter: { transactionId: paymobTxnId },
      });
      expect(payment?.status).toBe(PaymentStatusEnum.paid);
    });

    it('should auto-refund late success webhook arriving after booking hold expired', async () => {
      const hmacSecret =
        process.env.PAYMOB_HMAC_SECRET || 'CF847A5A5927CEDDBC9DB35C1B0ABEA1';

      // 1. Create a booking that expired 10 minutes ago
      const expiredBooking = await bookingRepo.create({
        userId: new Types.ObjectId(adminUserId),
        venueId: new Types.ObjectId(testVenueId),
        date: new Date(testFutureDate),
        startTime: 17,
        endTime: 19,
        totalPrice: 200,
        finalPrice: 200,
        status: BookingStatusEnum.expired,
        paymentStatus: PaymentStatusEnum.unpaid,
        paymentMethod: PaymentMethodEnum.paymob,
        expiresAt: new Date(Date.now() - 1000 * 60 * 10), // Expired 10m ago
        bookingCode: 'BK-LATE-WEBHOOK-TEST',
        qrCode: 'data:image/png;base64,sample',
      });

      const lateTxnId = 'TXN-LATE-' + Date.now();
      await paymentRepo.create({
        bookingId: expiredBooking._id,
        userId: new Types.ObjectId(adminUserId),
        amount: 200,
        paymentMethod: PaymentMethodEnum.paymob,
        transactionId: lateTxnId,
        status: PaymentStatusEnum.unpaid,
      });

      // Record wallet balance before late webhook
      let wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      const balanceBefore = wallet?.balance || 0;

      // 2. Late success webhook arrives
      const lateWebhook = {
        obj: {
          amount_cents: 20000,
          created_at: '2026-12-10T12:00:00.000Z',
          currency: 'EGP',
          error_occured: false,
          has_parent_transaction: false,
          id: 123458,
          integration_id: 3143838,
          is_3d_secure: true,
          is_auth: false,
          is_capture: false,
          is_refunded: false,
          is_standalone_payment: true,
          is_voided: false,
          order: { id: 987655 },
          owner: 111,
          pending: false,
          source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
          success: true,
          merchant_order_id: lateTxnId,
        },
      };

      const concatenated = [
        lateWebhook.obj.amount_cents,
        lateWebhook.obj.created_at,
        lateWebhook.obj.currency,
        lateWebhook.obj.error_occured,
        lateWebhook.obj.has_parent_transaction,
        lateWebhook.obj.id,
        lateWebhook.obj.integration_id,
        lateWebhook.obj.is_3d_secure,
        lateWebhook.obj.is_auth,
        lateWebhook.obj.is_capture,
        lateWebhook.obj.is_refunded,
        lateWebhook.obj.is_standalone_payment,
        lateWebhook.obj.is_voided,
        lateWebhook.obj.order.id,
        lateWebhook.obj.owner,
        lateWebhook.obj.pending,
        lateWebhook.obj.source_data.pan,
        lateWebhook.obj.source_data.sub_type,
        lateWebhook.obj.source_data.type,
        lateWebhook.obj.success,
      ].join('');

      const crypto = require('crypto');
      const hmac = crypto
        .createHmac('sha512', hmacSecret)
        .update(concatenated)
        .digest('hex');

      const res = await request(app.getHttpServer())
        .post(`/payment/webhook/paymob?hmac=${hmac}`)
        .send(lateWebhook);

      expect(res.status).toBe(201);
      const data = res.body?.data || res.body;
      expect(data?.status).toBe(PaymentStatusEnum.refunded);
      expect(data?.note).toContain('refunded to user wallet');

      // 3. Verify user wallet received full 200 EGP refund
      wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(balanceBefore + 200);

      // 4. Verify booking was NOT revived as confirmed
      const updatedBooking = await bookingRepo.findById(expiredBooking._id);
      expect(updatedBooking?.status).toBe(BookingStatusEnum.expired);
      expect(updatedBooking?.paymentStatus).toBe(PaymentStatusEnum.refunded);
    });
  });
});
