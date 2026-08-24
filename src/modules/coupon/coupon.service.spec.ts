import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { UserRepo } from 'src/common/repositories/user-repo';
import { CouponEnum } from 'src/common/enums/couponEnum';

describe('CouponService', () => {
  let service: CouponService;
  let couponRepo: jest.Mocked<CouponRepo>;

  const mockCouponRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: CouponRepo, useValue: mockCouponRepo },
        { provide: UserRepo, useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<CouponService>(CouponService);
    couponRepo = module.get(CouponRepo);
    jest.clearAllMocks();
  });

  describe('validateCoupon', () => {
    it('should successfully validate a percentage discount coupon for a customer', async () => {
      const mockCoupon = {
        code: 'SUMMER20',
        discount: 20,
        discountType: CouponEnum.percentage,
        startDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        maxUses: 100,
        usesCount: 5,
        isActive: true,
      };

      mockCouponRepo.findOne.mockResolvedValue(mockCoupon);

      const result = await service.validateCoupon({
        code: ' summer20 ',
        bookingAmount: 500,
      });

      expect(couponRepo.findOne).toHaveBeenCalledWith({
        filter: { code: 'SUMMER20' },
      });
      expect(result).toEqual({
        isValid: true,
        code: 'SUMMER20',
        discount: 20,
        discountType: CouponEnum.percentage,
        discountAmount: 100,
        finalPrice: 400,
      });
    });

    it('should successfully validate a fixed amount discount coupon for a customer', async () => {
      const mockCoupon = {
        code: 'SAVE50',
        discount: 50,
        discountType: CouponEnum.fixed,
        startDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        maxUses: 50,
        usesCount: 10,
        isActive: true,
      };

      mockCouponRepo.findOne.mockResolvedValue(mockCoupon);

      const result = await service.validateCoupon({
        code: 'SAVE50',
        bookingAmount: 300,
      });

      expect(result).toEqual({
        isValid: true,
        code: 'SAVE50',
        discount: 50,
        discountType: CouponEnum.fixed,
        discountAmount: 50,
        finalPrice: 250,
      });
    });

    it('should throw NotFoundException when coupon code does not exist', async () => {
      mockCouponRepo.findOne.mockResolvedValue(null);

      await expect(
        service.validateCoupon({
          code: 'INVALIDCODE',
          bookingAmount: 200,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when coupon is inactive', async () => {
      const inactiveCoupon = {
        code: 'INACTIVE10',
        discount: 10,
        discountType: CouponEnum.percentage,
        startDate: new Date(Date.now() - 1000 * 60 * 60),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
        maxUses: 100,
        usesCount: 0,
        isActive: false,
      };

      mockCouponRepo.findOne.mockResolvedValue(inactiveCoupon);

      await expect(
        service.validateCoupon({
          code: 'INACTIVE10',
          bookingAmount: 200,
        }),
      ).rejects.toThrow(new BadRequestException('Coupon is inactive'));
    });

    it('should throw BadRequestException when coupon maximum usage is reached', async () => {
      const exhaustedCoupon = {
        code: 'MAXEDOUT',
        discount: 15,
        discountType: CouponEnum.percentage,
        startDate: new Date(Date.now() - 1000 * 60 * 60),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
        maxUses: 10,
        usesCount: 10,
        isActive: true,
      };

      mockCouponRepo.findOne.mockResolvedValue(exhaustedCoupon);

      await expect(
        service.validateCoupon({
          code: 'MAXEDOUT',
          bookingAmount: 200,
        }),
      ).rejects.toThrow(
        new BadRequestException('Coupon maximum usage limit has been reached'),
      );
    });

    it('should throw BadRequestException when coupon is not active yet', async () => {
      const futureCoupon = {
        code: 'FUTURE2027',
        discount: 20,
        discountType: CouponEnum.percentage,
        startDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        maxUses: 100,
        usesCount: 0,
        isActive: true,
      };

      mockCouponRepo.findOne.mockResolvedValue(futureCoupon);

      await expect(
        service.validateCoupon({
          code: 'FUTURE2027',
          bookingAmount: 200,
        }),
      ).rejects.toThrow(new BadRequestException('Coupon is not active yet'));
    });

    it('should throw BadRequestException when coupon is expired', async () => {
      const expiredCoupon = {
        code: 'EXPIRED10',
        discount: 10,
        discountType: CouponEnum.percentage,
        startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
        endDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
        maxUses: 100,
        usesCount: 20,
        isActive: true,
      };

      mockCouponRepo.findOne.mockResolvedValue(expiredCoupon);

      await expect(
        service.validateCoupon({
          code: 'EXPIRED10',
          bookingAmount: 200,
        }),
      ).rejects.toThrow(new BadRequestException('Coupon has expired'));
    });
  });
});
