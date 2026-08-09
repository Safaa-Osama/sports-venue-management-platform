import { Body, Controller, Post } from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import { CouponService } from './coupon.service';
import { CreateCouponDto, ValidateCouponDto } from './dto/coupon.dto';

@Controller('coupon')
export class CouponController {
  constructor(private readonly couponService: CouponService) { }

  @Post()
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager] })
  async createCoupon(
    @Body() body: CreateCouponDto,
    @User() user: AdminUserDocument
  ) {
    return this.couponService.createCoupon(body, user)
  }

  @Post('validate')
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
    @User() user: AdminUserDocument) {
    return await this.couponService.validateCoupon(body, user);
  }
}
