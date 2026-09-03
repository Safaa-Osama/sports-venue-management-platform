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
import { RoleEnum } from '../src/common/enums/userEnum';
import { AdminUserRepo } from '../src/common/repositories/admin-user-repo';
import { VenueRepo } from '../src/common/repositories/venue-repo';
import { WalletRepo } from '../src/common/repositories/wallet-repo';
import { BookingRepo } from '../src/common/repositories/booking-repo';
import { PaymentRepo } from '../src/common/repositories/payment-repo';
import { Types } from 'mongoose';
import { hash } from '../src/common/services/securityService/hash';

describe('Tier 5 Adversarial Master Integration & Concurrency Stress Suite (M4)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let secondUserToken: string;
  let secondUserId: string;
  let adminUserRepo: AdminUserRepo;
  let venueRepo: VenueRepo;
  let walletRepo: WalletRepo;
  let bookingRepo: BookingRepo;
  let paymentRepo: PaymentRepo;

  let tier5StdVenueId: string;
  let tier5DepositVenueId: string;
  let tier5LargeDepositVenueId: string;
  let tier5CustomPriceVenueId: string;

  const m4TestDate = '2026-12-25';

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
    walletRepo = app.get(WalletRepo);
    bookingRepo = app.get(BookingRepo);
    paymentRepo = app.get(PaymentRepo);

    // 1. Primary Admin setup & login
    const adminEmail = 'challenger_m4_master@venue.com';
    const adminPassword = 'AdminPassword@123456';
    let admin = await adminUserRepo.findOne({ filter: { email: adminEmail } });
    if (!admin) {
      admin = await adminUserRepo.create({
        userName: 'M4 Master Challenger Admin',
        email: adminEmail,
        password: hash({ text: adminPassword }),
        role: RoleEnum.superAdmin,
      });
    }
    adminUserId = admin._id.toString();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/dashboard/login')
      .send({ email: adminEmail, password: adminPassword });

    adminToken = loginRes.body?.data?.accessToken || loginRes.body?.accessToken;

    // 2. Secondary User setup & login for true multi-user race condition tests
    const secondEmail = 'challenger_m4_rival@venue.com';
    const secondPassword = 'RivalPassword@123456';
    let secondUser = await adminUserRepo.findOne({ filter: { email: secondEmail } });
    if (!secondUser) {
      secondUser = await adminUserRepo.create({
        userName: 'M4 Master Rival User',
        email: secondEmail,
        password: hash({ text: secondPassword }),
        role: RoleEnum.user,
      });
    }
    secondUserId = secondUser._id.toString();

    const secondLoginRes = await request(app.getHttpServer())
      .post('/auth/dashboard/login')
      .send({ email: secondEmail, password: secondPassword });

    secondUserToken = secondLoginRes.body?.data?.accessToken || secondLoginRes.body?.accessToken;

    // 3. Standard Venue (Price: 200/hr, Deposit: 0)
    let stdVenue = await venueRepo.findOne({
      filter: { venueName: 'Tier 5 Master Stress Arena' },
    });
    if (!stdVenue) {
      stdVenue = await venueRepo.create({
        venueName: 'Tier 5 Master Stress Arena',
        sportsType: ['football'],
        address: '500 Nile Corniche, Maadi',
        locationAlt: 29.96,
        locationLang: 31.25,
        images: ['https://example.com/tier5_std.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 200,
        minimumDepositAmount: 0,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    tier5StdVenueId = stdVenue._id.toString();

    // 4. Deposit Venue (Price: 300/hr, Deposit: 80/slot)
    let depVenue = await venueRepo.findOne({
      filter: { venueName: 'Tier 5 Master Deposit Arena' },
    });
    if (!depVenue) {
      depVenue = await venueRepo.create({
        venueName: 'Tier 5 Master Deposit Arena',
        sportsType: ['padel'],
        address: '600 Ring Road, New Cairo',
        locationAlt: 30.01,
        locationLang: 31.45,
        images: ['https://example.com/tier5_dep.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 300,
        minimumDepositAmount: 80,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    tier5DepositVenueId = depVenue._id.toString();

    // 5. Large Deposit Venue (Price: 150/hr, Deposit: 500/slot -> exceeds hour price)
    let largeDepVenue = await venueRepo.findOne({
      filter: { venueName: 'Tier 5 Master Large Deposit Arena' },
    });
    if (!largeDepVenue) {
      largeDepVenue = await venueRepo.create({
        venueName: 'Tier 5 Master Large Deposit Arena',
        sportsType: ['tennis'],
        address: '700 Gezira Club Way, Zamalek',
        locationAlt: 30.05,
        locationLang: 31.22,
        images: ['https://example.com/tier5_large_dep.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 150,
        minimumDepositAmount: 500,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    tier5LargeDepositVenueId = largeDepVenue._id.toString();

    // 6. Custom Price Venue (Default: 100/hr, Custom: hour 17=150, hour 18=200, hour 19=150, Deposit: 80)
    let customVenue = await venueRepo.findOne({
      filter: { venueName: 'Tier 5 Master Custom Price Arena' },
    });
    if (!customVenue) {
      customVenue = await venueRepo.create({
        venueName: 'Tier 5 Master Custom Price Arena',
        sportsType: ['football'],
        address: '800 Olympic St, Nasr City',
        locationAlt: 30.07,
        locationLang: 31.33,
        images: ['https://example.com/tier5_custom.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 100,
        minimumDepositAmount: 80,
        customHourPrices: [
          { hour: 17, pricePerHour: 150 },
          { hour: 18, pricePerHour: 200 },
          { hour: 19, pricePerHour: 150 },
        ],
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    tier5CustomPriceVenueId = customVenue._id.toString();

    // Clean test bookings and payments completely for clean state isolation
    const d = new Date(m4TestDate);
    const startOfDay = new Date(d);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setUTCHours(23, 59, 59, 999);
    await bookingRepo.deleteMany({
      filter: {
        venueId: {
          $in: [
            new Types.ObjectId(tier5StdVenueId),
            new Types.ObjectId(tier5DepositVenueId),
            new Types.ObjectId(tier5LargeDepositVenueId),
            new Types.ObjectId(tier5CustomPriceVenueId),
          ],
        },
        date: { $gte: startOfDay, $lte: endOfDay },
      },
    });
    await paymentRepo.deleteMany({});
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. CONCURRENCY & ATOMIC LOCK/ROLLBACK STRESS
  // =========================================================================
  describe('1. High-Concurrency & Multi-Slot Atomic Lock/Rollback Stress', () => {
    it('T5-CONCUR-01: 8 Parallel Simultaneous Booking Requests on the Exact Same Slot -> Exactly 1 succeeds, 7 receive 409', async () => {
      // Set wallet balance to 5000 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 5000 },
        options: { upsert: true },
      });

      const slotTime = { startTime: 10, endTime: 11 };

      // Launch 8 concurrent requests simultaneously
      const requests = Array.from({ length: 8 }, () =>
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            venueId: tier5StdVenueId,
            date: m4TestDate,
            slots: [slotTime],
            paymentMethod: PaymentMethodEnum.wallet,
          }),
      );

      const results = await Promise.all(requests);
      const successful = results.filter((r) => [200, 201].includes(r.status));
      const conflicts = results.filter((r) => [409, 400, 500].includes(r.status));

      console.log('T5-CONCUR-01 Results summary: successful=', successful.length, 'conflicts=', conflicts.length);

      expect(successful.length).toBe(1);
      expect(conflicts.length).toBe(7);

      // Verify MongoDB contains strictly 1 confirmed booking for this slot
      const d = new Date(m4TestDate);
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const dbBookings = await bookingRepo.find({
        filter: {
          venueId: new Types.ObjectId(tier5StdVenueId),
          startTime: 10,
          endTime: 11,
          date: { $gte: startOfDay, $lte: endOfDay },
          status: BookingStatusEnum.confirmed,
        },
      });

      expect(dbBookings.length).toBe(1);

      // Verify wallet debited exactly once (5000 - 200 = 4800 EGP)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(4800);
    });

    it('T5-CONCUR-02: Multi-Slot Group Overlapping Race (Group A [{11,12},{12,13}] vs Group B [{12,13},{13,14}]) -> Atomic win/loss with zero orphan bookings', async () => {
      // User 1 balance: 1000 EGP, User 2 balance: 1000 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(secondUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      // Group A tries [11, 12) + [12, 13) (2 slots @ 200 = 400 EGP)
      // Group B tries [12, 13) + [13, 14) (2 slots @ 200 = 400 EGP) - Slot 12-13 overlaps!
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            venueId: tier5StdVenueId,
            date: m4TestDate,
            slots: [
              { startTime: 11, endTime: 12 },
              { startTime: 12, endTime: 13 },
            ],
            paymentMethod: PaymentMethodEnum.wallet,
          }),
        request(app.getHttpServer())
          .post('/booking')
          .set('Authorization', `Bearer ${secondUserToken}`)
          .send({
            venueId: tier5StdVenueId,
            date: m4TestDate,
            slots: [
              { startTime: 12, endTime: 13 },
              { startTime: 13, endTime: 14 },
            ],
            paymentMethod: PaymentMethodEnum.wallet,
          }),
      ]);

      const successCount = [resA, resB].filter((r) => [200, 201].includes(r.status)).length;
      const conflictCount = [resA, resB].filter((r) => [400, 409, 500].includes(r.status)).length;

      console.log('T5-CONCUR-02 Results summary: successCount=', successCount, 'conflictCount=', conflictCount);

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      // Verify winner got both 2 slots, loser got 0 slots
      const winningRes = [resA, resB].find((r) => [200, 201].includes(r.status))!;
      const winningGroupId = winningRes.body?.data?.groupId || winningRes.body?.groupId;
      expect(winningGroupId).toBeDefined();

      const winningDbBookings = await bookingRepo.find({ filter: { groupId: winningGroupId } });
      expect(winningDbBookings).toHaveLength(2);
      for (const b of winningDbBookings) {
        expect(b.status).toBe(BookingStatusEnum.confirmed);
      }

      // Check wallets: winning user debited 400 (balance 600), losing user debited 0 (balance 1000)
      const walletA = await walletRepo.findOne({ filter: { userId: new Types.ObjectId(adminUserId) } });
      const walletB = await walletRepo.findOne({ filter: { userId: new Types.ObjectId(secondUserId) } });

      if ([200, 201].includes(resA.status)) {
        expect(walletA?.balance).toBe(600);
        expect(walletB?.balance).toBe(1000);
      } else {
        expect(walletA?.balance).toBe(1000);
        expect(walletB?.balance).toBe(600);
      }
    });
  });

  // =========================================================================
  // 2. PARTIAL PAYMENT VS FULL PAYMENT STATUS TRANSITIONS & DEPOSIT PRECISION
  // =========================================================================
  describe('2. Partial Payment vs Full Payment Status Transitions', () => {
    it('T5-STAT-01: Multi-slot booking with deposit < total -> sets paymentStatus=partially_paid for all group bookings', async () => {
      // 3 slots @ 300 EGP = 900 EGP total. Deposit: 80 EGP/slot (3 * 80 = 240 EGP).
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: tier5DepositVenueId,
          date: m4TestDate,
          slots: [
            { startTime: 14, endTime: 15 },
            { startTime: 15, endTime: 16 },
            { startTime: 16, endTime: 17 },
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const groupId = data.groupId;
      expect(groupId).toBeDefined();

      const bookings = data.bookings;
      expect(bookings).toHaveLength(3);
      for (const b of bookings) {
        expect(b.paymentStatus).toBe(PaymentStatusEnum.partially_paid);
        expect(b.status).toBe(BookingStatusEnum.confirmed);
      }

      // Wallet debited strictly 240 EGP (1000 - 240 = 760 EGP)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(760);
    });

    it('T5-STAT-02: Deposit >= total cost -> caps deposit to total and sets paymentStatus=paid (NOT partially_paid)', async () => {
      // 1 slot [8, 9) @ 150 EGP on large deposit venue (minimumDepositAmount = 500 EGP)
      // Math.min(1 * 500, 150) = 150 EGP (Full amount!)
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: tier5LargeDepositVenueId,
          date: m4TestDate,
          slots: [{ startTime: 8, endTime: 9 }],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      expect(data.bookings).toHaveLength(1);
      expect(data.bookings[0].paymentStatus).toBe(PaymentStatusEnum.paid);
      expect(data.bookings[0].status).toBe(BookingStatusEnum.confirmed);
      expect(data.payment.amount).toBe(150);
      expect(data.payment.isDeposit).toBe(false);

      // Wallet debited 150 EGP (1000 - 150 = 850)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(850);
    });

    it('T5-STAT-03: Zero deposit venue -> requires full payment and sets paymentStatus=paid', async () => {
      // 2 slots @ 200 = 400 EGP on 0 deposit venue
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: tier5StdVenueId,
          date: m4TestDate,
          slots: [
            { startTime: 8, endTime: 9 },
            { startTime: 9, endTime: 10 },
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      expect(data.bookings).toHaveLength(2);
      for (const b of data.bookings) {
        expect(b.paymentStatus).toBe(PaymentStatusEnum.paid);
        expect(b.status).toBe(BookingStatusEnum.confirmed);
      }
      expect(data.payment.amount).toBe(400);

      // Wallet debited 400 EGP (1000 - 400 = 600)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(600);
    });
  });

  // =========================================================================
  // 3. DEPOSIT CALCULATION WITH CUSTOM HOURLY PRICES
  // =========================================================================
  describe('3. Deposit Calculation Formula: slots.length * minimumDepositAmount with Custom Prices', () => {
    it('T5-CALC-01: Correctly computes deposit for 3 slots with custom hourly prices (hour 17=150, 18=200, 19=150 -> total 500) and deposit 80 EGP/slot', async () => {
      // Total price: 150 + 200 + 150 = 500 EGP. Required deposit: 3 * 80 = 240 EGP.
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: tier5CustomPriceVenueId,
          date: m4TestDate,
          slots: [
            { startTime: 17, endTime: 18 },
            { startTime: 18, endTime: 19 },
            { startTime: 19, endTime: 20 },
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      expect(data.payment.amount).toBe(240); // Exactly 3 * 80
      expect(data.payment.totalDue).toBe(500); // 150 + 200 + 150
      expect(data.payment.isDeposit).toBe(true);
      expect(data.payment.status).toBe(PaymentStatusEnum.partially_paid);

      // Wallet debited exactly 240 EGP (1000 - 240 = 760)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(760);
    });
  });

  // =========================================================================
  // 4. PAYMOB WEBHOOK SETTLEMENT ACROSS MULTI-BOOKING GROUPS
  // =========================================================================
  describe('4. Paymob Webhook Group Matching & Idempotent Replay Stress', () => {
    it('T5-WH-01: Multi-slot group Paymob webhook matches groupId and updates ALL bookings in group to partially_paid', async () => {
      // Create pending Paymob booking for 2 slots on deposit venue (slots [20,21), [21,22) -> total 600, deposit 160)
      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: tier5DepositVenueId,
          date: m4TestDate,
          slots: [
            { startTime: 20, endTime: 21 },
            { startTime: 21, endTime: 22 },
          ],
          paymentMethod: PaymentMethodEnum.paymob,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const groupId = data.groupId || data.data?.groupId;
      const transactionId = data.transactionId || data.payment?.transactionId || data.data?.transactionId;

      expect(groupId).toBeDefined();
      expect(transactionId).toBeDefined();

      const paymobUniqueTxnId = 90000000 + Math.floor(Math.random() * 1000000);
      const webhookPayload = {
        type: 'TRANSACTION',
        obj: {
          id: paymobUniqueTxnId,
          success: true,
          is_pending: false,
          is_voided: false,
          is_refunded: false,
          special_reference: transactionId,
          order: {
            merchant_order_id: transactionId,
            special_reference: groupId,
          },
        },
      };

      // Send webhook 5 times sequentially to stress idempotency
      for (let i = 0; i < 5; i++) {
        const whRes = await request(app.getHttpServer())
          .post('/payment/webhook/paymob')
          .send(webhookPayload);

        expect([200, 201]).toContain(whRes.status);
      }

      // Verify all bookings belonging to this groupId are confirmed and partially_paid
      const dbBookings = await bookingRepo.find({ filter: { groupId } });
      expect(dbBookings).toHaveLength(2);
      for (const b of dbBookings) {
        expect(b.status).toBe(BookingStatusEnum.confirmed);
        expect(b.paymentStatus).toBe(PaymentStatusEnum.partially_paid);
      }
    });

    it('T5-WH-02: Multi-slot group Paymob webhook for full amount updates ALL bookings in group to paid', async () => {
      // Create pending Paymob booking for 2 slots on 0-deposit venue (total 400 EGP)
      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: tier5StdVenueId,
          date: m4TestDate,
          slots: [
            { startTime: 22, endTime: 23 },
            { startTime: 23, endTime: 24 },
          ],
          paymentMethod: PaymentMethodEnum.paymob,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const groupId = data.groupId || data.data?.groupId;
      const transactionId = data.transactionId || data.payment?.transactionId || data.data?.transactionId;

      const paymobUniqueTxnId = 91000000 + Math.floor(Math.random() * 1000000);
      const webhookPayload = {
        type: 'TRANSACTION',
        obj: {
          id: paymobUniqueTxnId,
          success: true,
          is_pending: false,
          is_voided: false,
          is_refunded: false,
          special_reference: transactionId,
          order: {
            merchant_order_id: transactionId,
            special_reference: groupId,
          },
        },
      };

      const whRes = await request(app.getHttpServer())
        .post('/payment/webhook/paymob')
        .send(webhookPayload);

      expect([200, 201]).toContain(whRes.status);

      // Verify all bookings in group are confirmed and paid
      const dbBookings = await bookingRepo.find({ filter: { groupId } });
      expect(dbBookings).toHaveLength(2);
      for (const b of dbBookings) {
        expect(b.status).toBe(BookingStatusEnum.confirmed);
        expect(b.paymentStatus).toBe(PaymentStatusEnum.paid);
      }
    });
  });

  // =========================================================================
  // 5. VENUE DTO & NESTJS VALIDATIONPIPE STRICT WHITELIST TESTS
  // =========================================================================
  describe('5. Venue DTO & NestJS ValidationPipe Strict Whitelist Tests', () => {
    let createdVenueId: string;

    it('T5-DTO-01: Accepts existingImages (Array, JSON string, CSV) and keepImages on POST /venue', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Tier 5 Image Whitelist Arena ' + Date.now(),
          address: '88 Nile Road, Cairo',
          sportsType: ['football', 'padel'],
          locationAlt: 30.04,
          locationLang: 31.23,
          amenities: ['Parking', 'Showers'],
          startWorkingHours: 8,
          endWorkingHours: 24,
          defaultHourPrice: 250,
          minimumDepositAmount: 60,
          existingImages: [
            'https://storage.arena.com/img1.jpg',
            'https://storage.arena.com/img2.jpg',
          ],
          keepImages: ['https://storage.arena.com/img1.jpg'],
          isActive: true,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data?.venue || res.body?.venue || res.body?.data || res.body;
      expect(data).toBeDefined();
      expect(data.minimumDepositAmount).toBe(60);
      createdVenueId = data._id;
    });

    it('T5-DTO-02: Accepts keepImages, removedImages, and deleteImages on PATCH /venue/:id', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/venue/${createdVenueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          minimumDepositAmount: 90,
          existingImages: ['https://storage.arena.com/img1.jpg'],
          keepImages: ['https://storage.arena.com/img1.jpg'],
          removedImages: ['https://storage.arena.com/img2.jpg'],
          deleteImages: ['https://storage.arena.com/img2.jpg'],
        });

      expect(res.status).toBe(200);
      const updated = res.body?.data || res.body;
      expect(updated.minimumDepositAmount).toBe(90);
    });

    it('T5-DTO-03: Rejects forbidden non-whitelisted properties with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Hacker Injected Field Arena',
          address: 'Cairo',
          sportsType: ['football'],
          locationAlt: 30.0,
          locationLang: 31.0,
          startWorkingHours: 8,
          endWorkingHours: 24,
          defaultHourPrice: 200,
          __hacker_injected_prop: 'malicious_exploit',
        });

      expect(res.status).toBe(400);
    });

    it('T5-DTO-04: Rejects negative minimumDepositAmount on POST and PATCH with 400 Bad Request', async () => {
      const postRes = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Negative Deposit Arena ' + Date.now(),
          address: 'Cairo',
          sportsType: ['football'],
          locationAlt: 30.0,
          locationLang: 31.0,
          startWorkingHours: 8,
          endWorkingHours: 24,
          defaultHourPrice: 200,
          minimumDepositAmount: -100,
        });

      expect(postRes.status).toBe(400);

      const patchRes = await request(app.getHttpServer())
        .patch(`/venue/${createdVenueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          minimumDepositAmount: -50,
        });

      expect(patchRes.status).toBe(400);
    });
  });
});
