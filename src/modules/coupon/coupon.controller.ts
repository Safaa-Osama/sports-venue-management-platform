import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import { CouponService } from './coupon.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto/coupon.dto';

@ApiTags('Coupons')
@ApiBearerAuth('JWT-auth')
@Controller('coupon')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get()
  @ApiOperation({
    summary: 'Get All Coupons (Admin / Owner / Manager)',
    description: 'Retrieves all promotional discount coupons with optional search and status filtering.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by coupon code' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by active, expired, or inactive' })
  @ApiResponse({ status: 200, description: 'List of coupons retrieved' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async getAllCoupons(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.couponService.getAllCoupons({ search, status });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Coupon by ID (Admin / Owner / Manager)',
    description: 'Retrieves a single coupon by ID.',
  })
  @ApiParam({ name: 'id', description: 'Coupon ID', example: '64e8b0a1f2b4c10012345695' })
  @ApiResponse({ status: 200, description: 'Coupon details retrieved' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async getCouponById(@Param('id') id: string) {
    return this.couponService.getCouponById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create Discount Coupon (Admin / Owner / Manager)',
    description:
      'Creates a new promotional discount coupon code with fixed or percentage value, start and end validity dates, and usage limits.',
  })
  @ApiResponse({
    status: 201,
    description: 'Coupon created successfully',
    schema: {
      example: {
        success: true,
        statusCode: 201,
        message: 'done',
        data: {
          _id: '64e8b0a1f2b4c10012345695',
          code: 'SUMMER2026',
          discountType: 'percentage',
          discount: 20,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2026-09-01T23:59:59.000Z',
          maxUses: 100,
          usesCount: 0,
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid discount value, dates, or duplicate code' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async createCoupon(
    @Body() body: CreateCouponDto,
    @User() user: AdminUserDocument,
  ) {
    return this.couponService.createCoupon(body, user);
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Validate Coupon Code & Calculate Discount',
    description:
      'Checks if a coupon code is valid, active, within date range, and has remaining uses. Returns the calculated discount amount for the specified booking amount.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coupon is valid and discount calculated',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          valid: true,
          code: 'SUMMER2026',
          discountAmount: 100,
          finalAmount: 400,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Coupon is invalid, expired, or maximum uses reached' })
  @auth({
    roles: [
      RoleEnum.customer,
      RoleEnum.user,
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async validateCoupon(
    @Body() body: ValidateCouponDto,
  ) {
    return await this.couponService.validateCoupon(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update Discount Coupon (Admin / Owner / Manager)',
    description: 'Updates coupon properties (dates, discount value, active status, max uses).',
  })
  @ApiParam({ name: 'id', description: 'Coupon MongoDB ID', example: '64e8b0a1f2b4c10012345695' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async updateCoupon(
    @Param('id') couponId: string,
    @Body() body: UpdateCouponDto,
    @User() user: AdminUserDocument,
  ) {
    return this.couponService.updateCoupon(couponId, body, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete Discount Coupon (Admin / Owner / Manager)',
    description: 'Permanently deletes a discount coupon.',
  })
  @ApiParam({ name: 'id', description: 'Coupon MongoDB ID', example: '64e8b0a1f2b4c10012345695' })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async deleteCoupon(
    @Param('id') couponId: string,
    @User() user: AdminUserDocument,
  ) {
    return this.couponService.deleteCoupon(couponId, user);
  }
}
