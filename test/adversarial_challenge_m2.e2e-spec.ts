import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptor/response';
import { RoleEnum } from '../src/common/enums/userEnum';
import { AdminUserRepo } from '../src/common/repositories/admin-user-repo';
import { VenueRepo } from '../src/common/repositories/venue-repo';
import { Types } from 'mongoose';
import { hash } from '../src/common/services/securityService/hash';
import { CreateVenueDto, UpdateVenueDto } from '../src/modules/venue/dto/venue.dto';

// Mirroring the dashboard's normalizeVenue and resolveVenueImageUrl functions for empirical parity testing
function resolveVenueImageUrl(url?: string): string {
  if (!url) {
    return 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const API_ORIGIN = 'http://localhost:3000';
  return `${API_ORIGIN}/${url.replace(/^\/+/, '')}`;
}

function formatHour(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayHour).padStart(2, '0')}:00 ${ampm}`;
}

function normalizeVenue(raw: any): any {
  if (!raw) return raw;
  const id = raw._id || raw.id || '';
  const venueName = raw.venueName || raw.name || 'Untitled Venue';
  const sportsType = Array.isArray(raw.sportsType)
    ? raw.sportsType
    : Array.isArray(raw.sportsTypes)
    ? raw.sportsTypes
    : ['5-A-SIDE'];
  const address = raw.address || '';
  const locationAlt = Number(raw.locationAlt ?? raw.coordinates?.lat ?? 30.0444);
  const locationLang = Number(raw.locationLang ?? raw.coordinates?.lng ?? 31.2357);
  const rawImages = Array.isArray(raw.images) ? raw.images : Array.isArray(raw.imageUrls) ? raw.imageUrls : [];
  const images = rawImages.map((img: string) => resolveVenueImageUrl(img));
  const startWorkingHours = Number(raw.startWorkingHours ?? 8);
  const endWorkingHours = Number(raw.endWorkingHours ?? 24);
  const defaultHourPrice = Number(raw.defaultHourPrice ?? raw.defaultHourlyPrice ?? raw.pricing?.defaultPricePerHour ?? 250);
  const minimumDepositAmount = Number(raw.minimumDepositAmount ?? raw.minDeposit ?? 0);
  const isActive = raw.isActive !== false && raw.status !== 'Inactive';

  const amenities = raw.amenities || {};

  return {
    ...raw,
    _id: id,
    id: id,
    venueName: venueName,
    name: venueName,
    sportsType: sportsType,
    sportsTypes: sportsType,
    address: address,
    locationAlt: locationAlt,
    locationLang: locationLang,
    coordinates: { lat: locationAlt, lng: locationLang },
    images: images,
    imageUrls: images,
    imageGallery: images,
    amenities: amenities,
    startWorkingHours: startWorkingHours,
    endWorkingHours: endWorkingHours,
    WorkingHours: endWorkingHours - startWorkingHours,
    workingHours: {
      openTime: formatHour(startWorkingHours),
      closeTime: formatHour(endWorkingHours),
      daysOpen: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
    defaultHourPrice: defaultHourPrice,
    defaultHourlyPrice: defaultHourPrice,
    minimumDepositAmount: minimumDepositAmount,
    minDeposit: minimumDepositAmount,
    pricing: {
      defaultPricePerHour: defaultHourPrice,
      currency: 'EGP',
      customHourlyRates: raw.customHourPrices || raw.pricing?.customHourlyRates || [],
    },
    customHourPrices: raw.customHourPrices || [],
    customHourlyPrices: raw.customHourPrices || [],
    isActive: isActive,
    status: isActive ? 'Active' : 'Inactive',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

describe('Empirical Adversarial Challenge Suite: Milestone 2 (Dashboard Updates)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let adminUserRepo: AdminUserRepo;
  let venueRepo: VenueRepo;

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

    // Setup Admin
    const adminEmail = 'challenger_m2_admin@venue.com';
    const adminPassword = 'AdminPassword@123';
    let admin = await adminUserRepo.findOne({ filter: { email: adminEmail } });
    if (!admin) {
      admin = await adminUserRepo.create({
        userName: 'M2 Challenger Admin',
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

    // Clean up test venue from prior runs
    await venueRepo.deleteMany({
      filter: { venueName: /E2E Dashboard Form Test Venue/ },
    });
  });

  afterAll(async () => {
    if (venueRepo) {
      await venueRepo.deleteMany({
        filter: { venueName: /E2E Dashboard Form Test Venue/ },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Dashboard `normalizeVenue` Parity & Edge Case Resilience', () => {
    it('Case 1.1: minimumDepositAmount variations (0, 50, 1000, string, undefined, null, legacy minDeposit)', () => {
      // 0 deposit
      const norm0 = normalizeVenue({ minimumDepositAmount: 0 });
      expect(norm0.minimumDepositAmount).toBe(0);
      expect(norm0.minDeposit).toBe(0);

      // 50 deposit
      const norm50 = normalizeVenue({ minimumDepositAmount: 50 });
      expect(norm50.minimumDepositAmount).toBe(50);
      expect(norm50.minDeposit).toBe(50);

      // 1000 deposit
      const norm1000 = normalizeVenue({ minimumDepositAmount: 1000 });
      expect(norm1000.minimumDepositAmount).toBe(1000);
      expect(norm1000.minDeposit).toBe(1000);

      // String "75" from JSON or query string
      const normStr = normalizeVenue({ minimumDepositAmount: '75' });
      expect(normStr.minimumDepositAmount).toBe(75);
      expect(normStr.minDeposit).toBe(75);

      // Legacy UI alias minDeposit: 120
      const normLegacy = normalizeVenue({ minDeposit: 120 });
      expect(normLegacy.minimumDepositAmount).toBe(120);
      expect(normLegacy.minDeposit).toBe(120);

      // Undefined / omitted field
      const normUndef = normalizeVenue({});
      expect(normUndef.minimumDepositAmount).toBe(0);
      expect(normUndef.minDeposit).toBe(0);

      // Null field
      const normNull = normalizeVenue({ minimumDepositAmount: null });
      expect(normNull.minimumDepositAmount).toBe(0);
      expect(normNull.minDeposit).toBe(0);
    });

    it('Case 1.2: Image URLs normalization (full HTTPS, relative S3, empty array, undefined, null)', () => {
      // Full HTTPS
      const normHttps = normalizeVenue({ images: ['https://s3.amazonaws.com/arena/1.jpg'] });
      expect(normHttps.images).toEqual(['https://s3.amazonaws.com/arena/1.jpg']);
      expect(normHttps.imageUrls).toEqual(['https://s3.amazonaws.com/arena/1.jpg']);
      expect(normHttps.imageGallery).toEqual(['https://s3.amazonaws.com/arena/1.jpg']);

      // Relative path
      const normRel = normalizeVenue({ images: ['uploads/venue/img1.png'] });
      expect(normRel.images[0]).toBe('http://localhost:3000/uploads/venue/img1.png');

      // Empty images array -> resolves to []
      const normEmpty = normalizeVenue({ images: [] });
      expect(normEmpty.images).toEqual([]);

      // Undefined images -> resolves to []
      const normUndefImg = normalizeVenue({});
      expect(normUndefImg.images).toEqual([]);

      // Legacy imageUrls array
      const normLegacyImg = normalizeVenue({ imageUrls: ['https://example.com/pitch.jpg'] });
      expect(normLegacyImg.images).toEqual(['https://example.com/pitch.jpg']);
    });

    it('Case 1.3: Working hours & pricing normalization parity', () => {
      const norm = normalizeVenue({
        startWorkingHours: 10,
        endWorkingHours: 22,
        defaultHourPrice: 350,
        customHourPrices: [{ hour: 20, pricePerHour: 450 }],
      });

      expect(norm.WorkingHours).toBe(12);
      expect(norm.workingHours.openTime).toBe('10:00 AM');
      expect(norm.workingHours.closeTime).toBe('10:00 PM');
      expect(norm.defaultHourlyPrice).toBe(350);
      expect(norm.pricing.defaultPricePerHour).toBe(350);
      expect(norm.pricing.customHourlyRates).toEqual([{ hour: 20, pricePerHour: 450 }]);
    });
  });

  describe('2. Frontend Form Payload Serialization against NestJS DTOs', () => {
    it('Case 2.1: CreateVenueDto successfully validates VenueFormModal payload with positive deposit', async () => {
      const formSimulationPayload = {
        venueName: 'M2 Adversarial Arena 1',
        address: '50 Ring Road, Cairo',
        locationAlt: '30.0444',
        locationLang: '31.2357',
        startWorkingHours: '8',
        endWorkingHours: '24',
        defaultHourPrice: '250',
        minimumDepositAmount: '50',
        sportsType: ['Football', 'Padel'],
        amenities: ['Parking', 'WiFi'],
        customHourPrices: JSON.stringify([{ hour: 19, pricePerHour: 350 }]),
        existingImages: JSON.stringify(['https://s3.amazonaws.com/arena/1.jpg']),
        keepImages: ['https://s3.amazonaws.com/arena/1.jpg'],
        isActive: 'true',
      };

      const dtoInstance = plainToInstance(CreateVenueDto, formSimulationPayload);
      const errors = await validate(dtoInstance);
      expect(errors.length).toBe(0);
      expect(dtoInstance.minimumDepositAmount).toBe(50);
      expect(dtoInstance.sportsType).toEqual(['Football', 'Padel']);
      expect(dtoInstance.amenities).toEqual(['Parking', 'WiFi']);
      expect(dtoInstance.existingImages).toEqual(['https://s3.amazonaws.com/arena/1.jpg']);
      expect(dtoInstance.keepImages).toEqual(['https://s3.amazonaws.com/arena/1.jpg']);
      expect(dtoInstance.isActive).toBe(true);
      expect(dtoInstance.customHourPrices).toBeDefined();
      expect(dtoInstance.customHourPrices![0].hour).toBe(19);
      expect(dtoInstance.customHourPrices![0].pricePerHour).toBe(350);
    });

    it('Case 2.2: CreateVenueDto successfully validates payload with 0 deposit and empty image arrays', async () => {
      const formSimulationPayload = {
        venueName: 'M2 Adversarial Arena Zero Dep',
        address: '60 Ring Road, Cairo',
        locationAlt: 30.0444,
        locationLang: 31.2357,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 200,
        minimumDepositAmount: '0',
        sportsType: ['Football'],
        amenities: ['Parking'],
        existingImages: '[]',
        isActive: true,
      };

      const dtoInstance = plainToInstance(CreateVenueDto, formSimulationPayload);
      const errors = await validate(dtoInstance);
      expect(errors.length).toBe(0);
      expect(dtoInstance.minimumDepositAmount).toBe(0);
      expect(dtoInstance.existingImages).toEqual([]);
    });

    it('Case 2.3: CreateVenueDto rejects negative deposit amounts via @Min(0)', async () => {
      const invalidPayload = {
        venueName: 'Negative Dep Arena',
        address: '10 Cairo Way',
        locationAlt: 30.0444,
        locationLang: 31.2357,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 250,
        minimumDepositAmount: -50,
        sportsType: ['Football'],
        amenities: ['Parking'],
      };

      const dtoInstance = plainToInstance(CreateVenueDto, invalidPayload);
      const errors = await validate(dtoInstance);
      expect(errors.length).toBeGreaterThan(0);
      const depError = errors.find((e) => e.property === 'minimumDepositAmount');
      expect(depError).toBeDefined();
      expect(depError?.constraints?.min).toBeDefined();
    });

    it('Case 2.4: CreateVenueDto rejects non-numeric deposit strings', async () => {
      const invalidPayload = {
        venueName: 'Bad Dep Arena',
        address: '10 Cairo Way',
        locationAlt: 30.0444,
        locationLang: 31.2357,
        startWorkingHours: 8,
        endWorkingHours: 24,
        defaultHourPrice: 250,
        minimumDepositAmount: 'not-a-number',
        sportsType: ['Football'],
        amenities: ['Parking'],
      };

      const dtoInstance = plainToInstance(CreateVenueDto, invalidPayload);
      const errors = await validate(dtoInstance);
      expect(errors.length).toBeGreaterThan(0);
      const depError = errors.find((e) => e.property === 'minimumDepositAmount');
      expect(depError).toBeDefined();
      expect(depError?.constraints?.isNumber).toBeDefined();
    });

    it('Case 2.5: UpdateVenueDto handles keepImages, removedImages, and deleteImages arrays & JSON strings', async () => {
      const updatePayload = {
        minimumDepositAmount: '150',
        existingImages: JSON.stringify(['https://s3.amazonaws.com/1.jpg']),
        keepImages: ['https://s3.amazonaws.com/1.jpg'],
        removedImages: JSON.stringify(['https://s3.amazonaws.com/old.jpg']),
        deleteImages: ['https://s3.amazonaws.com/old.jpg'],
      };

      const dtoInstance = plainToInstance(UpdateVenueDto, updatePayload);
      const errors = await validate(dtoInstance);
      expect(errors.length).toBe(0);
      expect(dtoInstance.minimumDepositAmount).toBe(150);
      expect(dtoInstance.existingImages).toEqual(['https://s3.amazonaws.com/1.jpg']);
      expect(dtoInstance.keepImages).toEqual(['https://s3.amazonaws.com/1.jpg']);
      expect(dtoInstance.removedImages).toEqual(['https://s3.amazonaws.com/old.jpg']);
      expect(dtoInstance.deleteImages).toEqual(['https://s3.amazonaws.com/old.jpg']);
    });
  });

  describe('3. End-to-End Live HTTP Venue Creation & Update with Dashboard Form Data', () => {
    let createdVenueId: string;

    it('Case 3.1: POST /venue with minimumDepositAmount=75 creates venue properly', async () => {
      const res = await request(app.getHttpServer())
        .post('/venue')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('venueName', 'E2E Dashboard Form Test Venue')
        .field('address', '77 Al Nasr St, Cairo')
        .field('locationAlt', '30.0555')
        .field('locationLang', '31.2444')
        .field('startWorkingHours', '9')
        .field('endWorkingHours', '23')
        .field('defaultHourPrice', '300')
        .field('minimumDepositAmount', '75')
        .field('sportsType', 'Football')
        .field('sportsType', 'Padel')
        .field('amenities', 'Parking')
        .field('amenities', 'Shower')
        .field('existingImages', JSON.stringify(['https://s3.amazonaws.com/test/arena_cover.jpg']))
        .field('isActive', 'true');

      expect(res.status).toBe(201);
      const venueData = res.body?.data || res.body;
      expect(venueData).toBeDefined();
      expect(venueData.venueName).toBe('E2E Dashboard Form Test Venue');
      expect(venueData.minimumDepositAmount).toBe(75);
      expect(venueData.defaultHourPrice).toBe(300);
      createdVenueId = venueData._id;
    });

    it('Case 3.2: GET /venue/:id returns the created venue with deposit intact and normalized', async () => {
      const res = await request(app.getHttpServer()).get(`/venue/${createdVenueId}`);
      expect(res.status).toBe(200);
      const venueData = res.body?.data || res.body;
      expect(venueData.minimumDepositAmount).toBe(75);

      const normalized = normalizeVenue(venueData);
      expect(normalized.minimumDepositAmount).toBe(75);
      expect(normalized.minDeposit).toBe(75);
      expect(normalized.defaultHourlyPrice).toBe(300);
    });

    it('Case 3.3: PATCH /venue/:id updates minimumDepositAmount to 150 and preserves images', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/venue/${createdVenueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('minimumDepositAmount', '150')
        .field('existingImages', JSON.stringify(['https://s3.amazonaws.com/test/arena_cover.jpg']))
        .field('keepImages', 'https://s3.amazonaws.com/test/arena_cover.jpg');

      expect(res.status).toBe(200);
      const updated = res.body?.data || res.body;
      expect(updated.minimumDepositAmount).toBe(150);

      // Verify persistence via fresh GET
      const getRes = await request(app.getHttpServer()).get(`/venue/${createdVenueId}`);
      expect(getRes.status).toBe(200);
      expect((getRes.body?.data || getRes.body).minimumDepositAmount).toBe(150);
    });

    it('Case 3.4: PATCH /venue/:id rejects negative minimumDepositAmount with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/venue/${createdVenueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('minimumDepositAmount', '-100');

      expect(res.status).toBe(400);
    });
  });

  describe('4. VenueFormModal Client Validation Rules Simulation', () => {
    function simulateFormValidation(values: {
      name: string;
      address: string;
      lat: number | '';
      lng: number | '';
      defaultHourlyPrice: number | '';
      minimumDepositAmount: number | '';
      sportsTypes: string[];
    }): { valid: boolean; errorMsg?: string } {
      if (!values.name.trim()) {
        return { valid: false, errorMsg: 'Venue Name is required' };
      }
      if (!values.address.trim()) {
        return { valid: false, errorMsg: 'Address is required' };
      }
      if (
        values.lat === '' ||
        isNaN(Number(values.lat)) ||
        values.lng === '' ||
        isNaN(Number(values.lng))
      ) {
        return { valid: false, errorMsg: 'Valid Latitude and Longitude coordinates are required' };
      }
      if (!values.defaultHourlyPrice || Number(values.defaultHourlyPrice) <= 0) {
        return { valid: false, errorMsg: 'Default Hourly Price must be greater than 0' };
      }
      if (
        values.minimumDepositAmount !== '' &&
        (isNaN(Number(values.minimumDepositAmount)) || Number(values.minimumDepositAmount) < 0)
      ) {
        return { valid: false, errorMsg: 'Minimum Deposit Amount must be 0 or a positive number' };
      }
      if (values.sportsTypes.length === 0) {
        return { valid: false, errorMsg: 'Select at least one Sports Type' };
      }
      return { valid: true };
    }

    it('Case 4.1: Form rejects empty name, empty address, invalid coordinates, non-positive price', () => {
      expect(
        simulateFormValidation({
          name: '  ',
          address: 'Cairo',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: 0,
          sportsTypes: ['Football'],
        }).errorMsg,
      ).toBe('Venue Name is required');

      expect(
        simulateFormValidation({
          name: 'Arena',
          address: '',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: 0,
          sportsTypes: ['Football'],
        }).errorMsg,
      ).toBe('Address is required');

      expect(
        simulateFormValidation({
          name: 'Arena',
          address: 'Cairo',
          lat: '',
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: 0,
          sportsTypes: ['Football'],
        }).errorMsg,
      ).toBe('Valid Latitude and Longitude coordinates are required');

      expect(
        simulateFormValidation({
          name: 'Arena',
          address: 'Cairo',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 0,
          minimumDepositAmount: 0,
          sportsTypes: ['Football'],
        }).errorMsg,
      ).toBe('Default Hourly Price must be greater than 0');
    });

    it('Case 4.2: Form rejects negative deposit amount but allows 0, empty string, and positive numbers', () => {
      // Negative deposit
      expect(
        simulateFormValidation({
          name: 'Arena',
          address: 'Cairo',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: -10,
          sportsTypes: ['Football'],
        }).errorMsg,
      ).toBe('Minimum Deposit Amount must be 0 or a positive number');

      // 0 deposit -> valid
      expect(
        simulateFormValidation({
          name: 'Arena',
          address: 'Cairo',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: 0,
          sportsTypes: ['Football'],
        }).valid,
      ).toBe(true);

      // Empty string deposit (user cleared input) -> valid (defaults to 0 on submission)
      expect(
        simulateFormValidation({
          name: 'Arena',
          address: 'Cairo',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: '',
          sportsTypes: ['Football'],
        }).valid,
      ).toBe(true);

      // Positive deposit -> valid
      expect(
        simulateFormValidation({
          name: 'Arena',
          address: 'Cairo',
          lat: 30,
          lng: 31,
          defaultHourlyPrice: 200,
          minimumDepositAmount: 75,
          sportsTypes: ['Football'],
        }).valid,
      ).toBe(true);
    });
  });
});
