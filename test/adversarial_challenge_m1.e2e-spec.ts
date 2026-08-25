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

describe('Empirical Adversarial Challenge Suite: Milestone 1 (R2, R3, R5)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let adminUserRepo: AdminUserRepo;
  let venueRepo: VenueRepo;
  let walletRepo: WalletRepo;
  let bookingRepo: BookingRepo;
  let paymentRepo: PaymentRepo;

  let smallDepositVenueId: string;
  let largeDepositVenueId: string;
  let zeroDepositVenueId: string;

  const challengeDate = '2026-12-15';

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

    // 1. Admin setup & login
    const adminEmail = 'challenger_admin@venue.com';
    const adminPassword = 'AdminPassword@123';
    let admin = await adminUserRepo.findOne({ filter: { email: adminEmail } });
    if (!admin) {
      admin = await adminUserRepo.create({
        userName: 'Challenger Admin',
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

    // 2. Small Deposit Venue (Price: 200/hr, Deposit: 50/slot)
    let sVenue = await venueRepo.findOne({
      filter: { venueName: 'Small Deposit Challenge Arena' },
    });
    if (!sVenue) {
      sVenue = await venueRepo.create({
        venueName: 'Small Deposit Challenge Arena',
        sportsType: ['football'],
        address: '10 Cairo Stadium Way',
        locationAlt: 30.01,
        locationLang: 31.01,
        images: ['https://example.com/small_dep.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 200,
        minimumDepositAmount: 50,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    smallDepositVenueId = sVenue._id.toString();

    // 3. Large Deposit Venue (Price: 150/hr, Deposit: 500/slot -> exceeds slot price)
    let lVenue = await venueRepo.findOne({
      filter: { venueName: 'Large Deposit Challenge Arena' },
    });
    if (!lVenue) {
      lVenue = await venueRepo.create({
        venueName: 'Large Deposit Challenge Arena',
        sportsType: ['padel'],
        address: '20 New Cairo Sports Way',
        locationAlt: 30.02,
        locationLang: 31.02,
        images: ['https://example.com/large_dep.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 150,
        minimumDepositAmount: 500,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    largeDepositVenueId = lVenue._id.toString();

    // 4. Zero Deposit Venue (Price: 250/hr, Deposit: 0)
    let zVenue = await venueRepo.findOne({
      filter: { venueName: 'Zero Deposit Challenge Arena' },
    });
    if (!zVenue) {
      zVenue = await venueRepo.create({
        venueName: 'Zero Deposit Challenge Arena',
        sportsType: ['basketball'],
        address: '30 Maadi Ring Road',
        locationAlt: 30.03,
        locationLang: 31.03,
        images: ['https://example.com/zero_dep.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 250,
        minimumDepositAmount: 0,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    zeroDepositVenueId = zVenue._id.toString();

    // Clean test bookings for the challenge date
    const d = new Date(challengeDate);
    const startOfDay = new Date(d);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setUTCHours(23, 59, 59, 999);
    await bookingRepo.deleteMany({
      filter: {
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
  // CHALLENGE 1 & 2: MINIMUM DEPOSIT CALCULATION & PAYMENT STATUS TRANSITIONS
  // =========================================================================
  describe('Challenge 1 & 2: Minimum Deposit & Payment Status Transitions', () => {
    it('CH-01: Deposit < Total Price (Multi-slot): calculates slots.length * deposit and transitions to partially_paid', async () => {
      // 3 non-continuous slots: [9, 10), [11, 12), [14, 15) @ 200 EGP each = 600 EGP total
      // Deposit per slot = 50 EGP -> Required deposit = 3 * 50 = 150 EGP
      // Fund wallet with 500 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 500 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: smallDepositVenueId,
          date: challengeDate,
          slots: [
            { startTime: 9, endTime: 10 },
            { startTime: 11, endTime: 12 },
            { startTime: 14, endTime: 15 },
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const groupId = data.groupId;
      expect(groupId).toBeDefined();

      const bookings = data.bookings;
      expect(bookings).toHaveLength(3);

      // Verify each booking in the group has partially_paid and confirmed status
      for (const b of bookings) {
        expect(b.paymentStatus).toBe(PaymentStatusEnum.partially_paid);
        expect(b.status).toBe(BookingStatusEnum.confirmed);
        expect(b.groupId).toBe(groupId);
      }

      // Verify payment details in response
      expect(data.payment.amount).toBe(150); // 3 slots * 50 EGP
      expect(data.payment.totalDue).toBe(600); // 3 slots * 200 EGP
      expect(data.payment.isDeposit).toBe(true);
      expect(data.payment.status).toBe(PaymentStatusEnum.partially_paid);

      // Verify wallet balance was debited exactly 150 EGP (500 - 150 = 350 EGP)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(350);

      // Verify DB records directly
      const dbBookings = await bookingRepo.find({ filter: { groupId } });
      expect(dbBookings).toHaveLength(3);
      for (const dbB of dbBookings) {
        expect(dbB.paymentStatus).toBe(PaymentStatusEnum.partially_paid);
        expect(dbB.status).toBe(BookingStatusEnum.confirmed);
      }
    });

    it('CH-02: Deposit >= Total Price (Deposit larger than total): caps deposit at total price and sets status to paid (NOT partially_paid)', async () => {
      // 1 slot [10, 11) @ 150 EGP on largeDepositVenue (minimumDepositAmount = 500 EGP)
      // Deposit required = 1 * 500 = 500 EGP, but total price = 150 EGP
      // Math.min(500, 150) = 150 EGP (Full payment!)
      // isDepositOnly = 150 < 150 => FALSE -> target status = paid
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: largeDepositVenueId,
          date: challengeDate,
          slots: [{ startTime: 10, endTime: 11 }],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const bookings = data.bookings;
      expect(bookings).toHaveLength(1);

      // Must be marked as 'paid', because the full price (150 EGP) was paid!
      expect(bookings[0].paymentStatus).toBe(PaymentStatusEnum.paid);
      expect(bookings[0].status).toBe(BookingStatusEnum.confirmed);
      expect(data.payment.amount).toBe(150);
      expect(data.payment.isDeposit).toBe(false);
      expect(data.payment.status).toBe(PaymentStatusEnum.paid);

      // Wallet debited 150 EGP (1000 - 150 = 850)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(850);
    });

    it('CH-03: Zero deposit venue: requires full payment and marks status as paid', async () => {
      // 2 slots [12, 13) and [13, 14) @ 250 EGP each = 500 EGP on zeroDepositVenue
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: zeroDepositVenueId,
          date: challengeDate,
          slots: [
            { startTime: 12, endTime: 13 },
            { startTime: 13, endTime: 14 },
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
      expect(data.payment.amount).toBe(500);
      expect(data.payment.status).toBe(PaymentStatusEnum.paid);
    });

    it('CH-04: Paymob Webhook Deposit: transitions group bookings to partially_paid when payment amount < total price', async () => {
      // Create pending booking on small deposit venue with Paymob (slots: [16, 17), [17, 18), total: 400 EGP, deposit: 100 EGP)
      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: smallDepositVenueId,
          date: challengeDate,
          slots: [
            { startTime: 16, endTime: 17 },
            { startTime: 17, endTime: 18 },
          ],
          paymentMethod: PaymentMethodEnum.paymob,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const groupId = data.groupId;
      const transactionId = data.payment?.transactionId || data.transactionId;
      expect(transactionId).toBeDefined();

      // Trigger Paymob Webhook with matching transactionId & success status
      const webhookPayload = {
        type: 'TRANSACTION',
        obj: {
          id: Date.now() + Math.floor(Math.random() * 100000),
          success: true,
          is_pending: false,
          is_voided: false,
          is_refunded: false,
          special_reference: transactionId,
          order: {
            special_reference: groupId,
          },
        },
      };

      const webhookRes = await request(app.getHttpServer())
        .post('/payment/webhook/paymob')
        .send(webhookPayload);

      expect([200, 201]).toContain(webhookRes.status);
      const webhookStatus = webhookRes.body?.data?.status || webhookRes.body?.status;
      expect(webhookStatus).toBe(PaymentStatusEnum.partially_paid);

      // Verify all bookings in group are confirmed and partially_paid in DB
      const dbBookings = await bookingRepo.find({ filter: { groupId } });
      expect(dbBookings).toHaveLength(2);
      for (const b of dbBookings) {
        expect(b.status).toBe(BookingStatusEnum.confirmed);
        expect(b.paymentStatus).toBe(PaymentStatusEnum.partially_paid);
      }
    });

    it('CH-05: Paymob Webhook Full Payment: transitions group bookings to paid when payment amount == total price', async () => {
      // Create pending booking on zero deposit venue with Paymob (slot: [18, 19), total: 250 EGP)
      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: zeroDepositVenueId,
          date: challengeDate,
          slots: [{ startTime: 18, endTime: 19 }],
          paymentMethod: PaymentMethodEnum.paymob,
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data || res.body;
      const groupId = data.groupId;
      const transactionId = data.payment?.transactionId || data.transactionId;

      // Trigger Paymob Webhook
      const webhookPayload = {
        type: 'TRANSACTION',
        obj: {
          id: Date.now() + Math.floor(Math.random() * 100000) + 1,
          success: true,
          is_pending: false,
          is_voided: false,
          is_refunded: false,
          special_reference: transactionId,
          order: {
            special_reference: groupId,
          },
        },
      };

      const webhookRes = await request(app.getHttpServer())
        .post('/payment/webhook/paymob')
        .send(webhookPayload);

      expect([200, 201]).toContain(webhookRes.status);
      const webhookStatus2 = webhookRes.body?.data?.status || webhookRes.body?.status;
      expect(webhookStatus2).toBe(PaymentStatusEnum.paid);

      const dbBookings = await bookingRepo.find({ filter: { groupId } });
      expect(dbBookings).toHaveLength(1);
      expect(dbBookings[0].status).toBe(BookingStatusEnum.confirmed);
      expect(dbBookings[0].paymentStatus).toBe(PaymentStatusEnum.paid);
    });
  });

  // =========================================================================
  // CHALLENGE 3: STRICT NESTJS VALIDATIONPIPE TESTING ON POST /venue
  // =========================================================================
  describe('Challenge 3: Strict NestJS ValidationPipe & DTO Sanitization on POST /venue', () => {
    it('CH-06: Accepts existingImages as array of URLs with 0 validation errors', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Array existingImages Arena ' + Date.now(),
          address: '123 Main St, New Cairo',
          sportsType: ['football'],
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: ['Parking', 'Shower'],
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          existingImages: [
            'https://storage.arena.com/img1.png',
            'https://storage.arena.com/img2.png',
          ],
        });

      expect([200, 201]).toContain(res.status);
      const data = res.body?.data?.venue || res.body?.venue || res.body?.data || res.body;
      expect(data).toBeDefined();
    });

    it('CH-07: Accepts existingImages as JSON stringified array and comma-separated string', async () => {
      // Test JSON string
      const resJson = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'JSON String existingImages Arena ' + Date.now(),
          address: '124 Main St, New Cairo',
          sportsType: ['padel'],
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: ['WiFi', 'Lockers'],
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          existingImages: '["https://storage.arena.com/json1.png", "https://storage.arena.com/json2.png"]',
        });

      expect([200, 201]).toContain(resJson.status);

      // Test comma-separated string with whitespace
      const resCsv = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'CSV existingImages Arena ' + Date.now(),
          address: '125 Main St, New Cairo',
          sportsType: 'padel, football',
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: '  WiFi ,  Lockers , Showers  ',
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          existingImages: ' https://storage.arena.com/csv1.png , https://storage.arena.com/csv2.png ',
        });

      expect([200, 201]).toContain(resCsv.status);
    });

    it('CH-08: Accepts keepImages, removedImages, and deleteImages without validation errors', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Keep Removed Images Arena ' + Date.now(),
          address: '126 Main St, New Cairo',
          sportsType: ['basketball'],
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: ['Parking'],
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          keepImages: ['https://storage.arena.com/keep1.png'],
          removedImages: ['https://storage.arena.com/del1.png'],
          deleteImages: ['https://storage.arena.com/del2.png'],
          minimumDepositAmount: 50,
          isActive: true,
        });

      expect([200, 201]).toContain(res.status);
    });

    it('CH-09: Accepts empty existingImages array or whitespace string without 400 error', async () => {
      const resEmpty = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Empty Images Arena ' + Date.now(),
          address: '127 Main St, New Cairo',
          sportsType: ['football'],
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: ['Parking'],
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          existingImages: [],
          keepImages: '   ',
        });

      expect([200, 201]).toContain(resEmpty.status);
    });

    it('CH-10: Rejects forbidden non-whitelisted properties with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Illegal Property Arena ' + Date.now(),
          address: '128 Main St, New Cairo',
          sportsType: ['football'],
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: ['Parking'],
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          injectedForbiddenField: 'exploit_attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('property injectedForbiddenField should not exist')]),
      );
    });

    it('CH-11: Rejects negative minimumDepositAmount with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Negative Deposit Arena ' + Date.now(),
          address: '129 Main St, New Cairo',
          sportsType: ['football'],
          locationAlt: 30.1,
          locationLang: 31.1,
          amenities: ['Parking'],
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          minimumDepositAmount: -50,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('minimumDepositAmount must not be less than 0')]),
      );
    });
  });
});
