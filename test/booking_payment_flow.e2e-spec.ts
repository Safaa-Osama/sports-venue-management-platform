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

describe('E2E Test Suite: Requirements R1 - R5 (Tiers 1 - 4)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let standardVenueId: string;
  let depositVenueId: string;
  let adminUserRepo: AdminUserRepo;
  let venueRepo: VenueRepo;
  let walletRepo: WalletRepo;
  let bookingRepo: BookingRepo;
  let paymentRepo: PaymentRepo;

  const testE2EDate = '2026-11-20';

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

    // 1. Ensure Super Admin exists
    const adminEmail = 'admin_flow@venue.com';
    const adminPassword = 'Admin@123456';
    let admin = await adminUserRepo.findOne({ filter: { email: adminEmail } });
    if (!admin) {
      admin = await adminUserRepo.create({
        userName: 'Flow Super Admin',
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

    adminToken = loginRes.body?.data?.accessToken || loginRes.body?.accessToken;

    // 3. Create Standard Test Venue (No Deposit)
    let stdVenue = await venueRepo.findOne({
      filter: { venueName: 'Standard E2E Arena' },
    });
    if (!stdVenue) {
      stdVenue = await venueRepo.create({
        venueName: 'Standard E2E Arena',
        sportsType: ['football'],
        address: '100 Nile Corniche, Cairo',
        locationAlt: 30.0444,
        locationLang: 31.2357,
        images: ['https://example.com/standard.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 200,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    standardVenueId = stdVenue._id.toString();

    // 4. Create Deposit Test Venue (minimumDepositAmount = 75 EGP)
    let depVenue = await venueRepo.findOne({
      filter: { venueName: 'Deposit E2E Arena' },
    });
    if (!depVenue) {
      depVenue = await venueRepo.create({
        venueName: 'Deposit E2E Arena',
        sportsType: ['padel'],
        address: '200 Ring Road, New Cairo',
        locationAlt: 30.0555,
        locationLang: 31.2457,
        images: ['https://example.com/deposit.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 300,
        minimumDepositAmount: 75,
        isActive: true,
        createdBy: new Types.ObjectId(adminUserId),
      });
    }
    depositVenueId = depVenue._id.toString();

    // 5. Clean test bookings
    const d = new Date(testE2EDate);
    const startOfDay = new Date(d);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setUTCHours(23, 59, 59, 999);
    await bookingRepo.deleteMany({
      filter: {
        venueId: { $in: [new Types.ObjectId(standardVenueId), new Types.ObjectId(depositVenueId)] },
        date: { $gte: startOfDay, $lte: endOfDay },
      },
    });
    await paymentRepo.deleteMany({
      filter: {
        userId: new Types.ObjectId(adminUserId),
      },
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // REQUIREMENT R5: VENUE CREATION & DTO VALIDATION COMPATIBILITY
  // =========================================================================
  describe('Requirement R5: Venue Creation & DTO Validation Compatibility', () => {
    it('T1-R5-01: should create venue with existingImages array payload without 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Existing Images Test Arena ' + Date.now(),
          address: '404 Pyramids Road, Giza',
          sportsType: ['football'],
          locationAlt: 29.9792,
          locationLang: 31.1342,
          amenities: ['Parking', 'Showers'],
          startWorkingHours: 9,
          endWorkingHours: 23,
          defaultHourPrice: 250,
          existingImages: ['https://s3.example.com/venue_img1.jpg', 'https://s3.example.com/venue_img2.jpg'],
          isActive: true,
        });

      // Whitelist validation must accept existingImages without rejection (Status 201)
      expect([201, 200]).toContain(res.status);
      const data = res.body?.data?.venue || res.body?.venue || res.body?.data || res.body;
      expect(data).toBeDefined();
    });

    it('T1-R5-02: should create venue with keepImages and minimumDepositAmount payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Keep Images Test Arena ' + Date.now(),
          address: '500 Heliopolis Blvd, Cairo',
          sportsType: ['padel'],
          locationAlt: 30.0888,
          locationLang: 31.3222,
          amenities: ['WiFi', 'Lockers'],
          startWorkingHours: 8,
          endWorkingHours: 24,
          defaultHourPrice: 350,
          minimumDepositAmount: 100,
          keepImages: ['https://s3.example.com/kept1.jpg'],
          isActive: true,
        });

      expect([201, 200]).toContain(res.status);
    });

    it('T2-R5-01: should reject unknown foreign keys in CreateVenueDto with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueName: 'Invalid Foreign Key Arena',
          address: 'Cairo',
          sportsType: ['football'],
          locationAlt: 30.0,
          locationLang: 31.0,
          startWorkingHours: 8,
          endWorkingHours: 23,
          defaultHourPrice: 200,
          unrecognizedHackerProperty: 'malicious_data',
        });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // REQUIREMENT R1: WALLET AUTO-DEDUCTION & CASH REMOVAL
  // =========================================================================
  describe('Requirement R1: Wallet Auto-Deduction & Payment Method Elimination', () => {
    it('T1-R1-01: should auto-deduct 100% totalCost from wallet when balance >= totalCost and skip Paymob', async () => {
      // Set wallet balance to 600 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 600 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          startTime: 8,
          endTime: 10, // 2 hours @ 200 = 400 EGP
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect(res.status).toBe(201);
      const booking = res.body?.data?.booking || res.body?.booking;
      expect(booking.status).toBe(BookingStatusEnum.confirmed);
      expect(booking.paymentStatus).toBe(PaymentStatusEnum.paid);

      // Verify wallet balance was debited to 200 EGP (600 - 400)
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(200);
    });

    it('T1-R1-02: should reject booking when wallet balance is insufficient for full wallet payment', async () => {
      // Set wallet balance to 50 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 50 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          startTime: 10,
          endTime: 12, // 2 hours @ 200 = 400 EGP
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect(res.status).toBe(400);

      // Verify wallet balance remained untouched at 50 EGP
      const wallet = await walletRepo.findOne({
        filter: { userId: new Types.ObjectId(adminUserId) },
      });
      expect(wallet?.balance).toBe(50);
    });
  });

  // =========================================================================
  // REQUIREMENT R4: MULTI-HOUR INTERVAL LOCKOUT & TIMEZONE NORMALIZATION
  // =========================================================================
  describe('Requirement R4: Multi-Hour Interval Lockout & Timezone Safety', () => {
    it('T1-R4-01: should lock all hourly sub-slots in interval [startTime, endTime) upon booking', async () => {
      // Reset wallet to 1000 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 1000 },
        options: { upsert: true },
      });

      // Book interval 14:00 to 16:00 (locks hour 14 and hour 15)
      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          startTime: 14,
          endTime: 16,
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect(res.status).toBe(201);

      // Attempting to book overlapping sub-slot [14, 15) must fail with conflict / bad request
      const conflictRes1 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          startTime: 14,
          endTime: 15,
          paymentMethod: PaymentMethodEnum.wallet,
        });
      expect([400, 409]).toContain(conflictRes1.status);

      // Attempting to book overlapping sub-slot [15, 16) must fail with conflict / bad request
      const conflictRes2 = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          startTime: 15,
          endTime: 16,
          paymentMethod: PaymentMethodEnum.wallet,
        });
      expect([400, 409]).toContain(conflictRes2.status);

      // Adjacent slot [16, 17) must succeed without conflict
      const adjacentRes = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          startTime: 16,
          endTime: 17,
          paymentMethod: PaymentMethodEnum.wallet,
        });
      expect(adjacentRes.status).toBe(201);
    });
  });

  // =========================================================================
  // REQUIREMENTS R2 & R3: MULTI-SLOT BOOKINGS & MINIMUM DEPOSITS
  // =========================================================================
  describe('Requirements R2 & R3: Multi-Slot Group Bookings & Minimum Deposits', () => {
    it('T1-R2-01: should accept slots array in CreateBookingDto and assign groupId', async () => {
      // Reset wallet to 2000 EGP
      await walletRepo.findOneAndUpdate({
        filter: { userId: new Types.ObjectId(adminUserId) },
        update: { balance: 2000 },
        options: { upsert: true },
      });

      const res = await request(app.getHttpServer())
        .post('/booking')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venueId: standardVenueId,
          date: testE2EDate,
          slots: [
            { startTime: 18, endTime: 19 },
            { startTime: 19, endTime: 20 },
          ],
          paymentMethod: PaymentMethodEnum.wallet,
        });

      expect([201, 200]).toContain(res.status);
      const data = res.body?.data || res.body;
      expect(data.groupId).toBeDefined();
      expect(data.bookings).toHaveLength(2);
    });

    it('T1-R3-01: should query and verify venue minimumDepositAmount configuration in DB', async () => {
      const depVenue = await venueRepo.findById(depositVenueId);
      expect(depVenue).toBeDefined();
      expect(Number(depVenue?.minimumDepositAmount || 0)).toBe(75);
    });
  });
});
