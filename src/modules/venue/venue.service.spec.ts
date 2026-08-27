import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VenueService } from './venue.service';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { Types } from 'mongoose';
import { PushNotificationService } from '../push-notification/push-notification.service';

const mockPushNotificationService = {
  sendToCustomer: jest.fn().mockResolvedValue(undefined),
  sendToAdmin: jest.fn().mockResolvedValue(undefined),
  sendToUser: jest.fn().mockResolvedValue(undefined),
  broadcastToAllCustomers: jest.fn().mockResolvedValue(undefined),
};

describe('VenueService', () => {
  let service: VenueService;
  let venueRepo: jest.Mocked<VenueRepo>;
  let s3Service: jest.Mocked<S3Service>;

  const mockVenueRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockS3Service = {
    uploadFiles: jest.fn(),
    deleteManyFiles: jest.fn(),
    deleteFile: jest.fn(),
    getPreSignedUrls: jest.fn(),
  };

  const mockAdminUser: any = {
    _id: new Types.ObjectId('64e8b0a1f2b4c10012345678'),
    userName: 'Admin User',
    email: 'admin@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenueService,
        { provide: VenueRepo, useValue: mockVenueRepo },
        { provide: S3Service, useValue: mockS3Service },
        { provide: PushNotificationService, useValue: mockPushNotificationService },
      ],
    }).compile();

    service = module.get<VenueService>(VenueService);
    venueRepo = module.get(VenueRepo);
    s3Service = module.get(S3Service);
    jest.clearAllMocks();
  });

  describe('createVenue (R5 & R3)', () => {
    it('should successfully create a venue with existingImages and minimumDepositAmount (R5 & R3)', async () => {
      mockVenueRepo.findOne.mockResolvedValue(null);
      mockVenueRepo.create.mockImplementation(async (data: any) => ({
        ...data,
        _id: new Types.ObjectId('64e8b0a1f2b4c10012345699'),
        toObject: () => ({ ...data, _id: '64e8b0a1f2b4c10012345699' }),
      }));
      mockS3Service.getPreSignedUrls.mockImplementation(async (urls) => urls);

      const dto: any = {
        venueName: 'Camp Nou Arena',
        address: '123 Stadium Way',
        sportsType: ['Football'],
        locationAlt: 30.0444,
        locationLang: 31.2357,
        amenities: ['Parking', 'Shower'],
        startWorkingHours: 8,
        endWorkingHours: 23,
        defaultHourPrice: 200,
        minimumDepositAmount: 50,
        existingImages: ['https://s3.example.com/gallery/img1.jpg'],
        keepImages: ['https://s3.example.com/gallery/img2.jpg'],
        isActive: true,
      };

      const result = await service.createVenue(dto, mockAdminUser);

      expect(mockVenueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venueName: 'Camp Nou Arena',
          minimumDepositAmount: 50,
          images: expect.arrayContaining([
            'https://s3.example.com/gallery/img1.jpg',
          ]),
        }),
      );
      expect(result).toBeDefined();
      expect(result.minimumDepositAmount).toBe(50);
    });

    it('should throw BadRequestException if venueName already exists', async () => {
      mockVenueRepo.findOne.mockResolvedValue({ _id: 'existingId' });

      const dto: any = {
        venueName: 'Duplicate Arena',
        address: '123 Road',
        sportsType: ['Football'],
        locationAlt: 30.0,
        locationLang: 31.0,
        startWorkingHours: 8,
        endWorkingHours: 22,
        defaultHourPrice: 150,
      };

      await expect(service.createVenue(dto, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateVenue (R3 & R5)', () => {
    it('should update venue with minimumDepositAmount', async () => {
      const venueId = '64e8b0a1f2b4c10012345699';
      mockVenueRepo.findOne.mockResolvedValue({
        _id: new Types.ObjectId(venueId),
        venueName: 'Existing Arena',
        images: ['img1.jpg'],
        startWorkingHours: 8,
        endWorkingHours: 22,
      });

      mockVenueRepo.findByIdAndUpdate.mockResolvedValue({
        _id: venueId,
        venueName: 'Existing Arena',
        minimumDepositAmount: 75,
        images: ['img1.jpg'],
        toObject: () => ({
          _id: venueId,
          venueName: 'Existing Arena',
          minimumDepositAmount: 75,
          images: ['img1.jpg'],
        }),
      });

      mockS3Service.getPreSignedUrls.mockImplementation(async (urls) => urls);

      const result = await service.updateVenue(
        venueId,
        { minimumDepositAmount: 75 },
        mockAdminUser,
      );

      expect(mockVenueRepo.findByIdAndUpdate).toHaveBeenCalledWith({
        id: venueId,
        update: expect.objectContaining({
          minimumDepositAmount: 75,
        }),
      });
      expect(result?.minimumDepositAmount).toBe(75);
    });
  });
});
