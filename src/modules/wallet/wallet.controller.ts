import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import {
  AdminDeductWalletDto,
  CreateWalletDto,
  DeductWalletDto,
  DepositWalletDto,
  GetTransactionsDto,
  UserDeductWalletDto,
} from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('my-wallet')
  @auth({ roles: [RoleEnum.customer, RoleEnum.user, RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin] })
  async getMyWallet(@User() user: any) {
    const userId = user._id || user.id;
    return this.walletService.getMyWallet(userId);
  }

  @Get('my-transactions')
  @auth({ roles: [RoleEnum.customer, RoleEnum.user, RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin] })
  async getMyTransactions(@User() user: any, @Query() query: GetTransactionsDto) {
    const userId = user._id || user.id;
    return this.walletService.getMyTransactions(userId, query);
  }

  @Get('transactions')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async getTransactions(@Query() query: GetTransactionsDto) {
    return this.walletService.getTransactions(query);
  }

  @Get('user/:userId')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async getWalletByUserId(@Param('userId') userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }

  @Post('create')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async createWallet(@Body() body: CreateWalletDto) {
    return this.walletService.createWallet(body);
  }

  @Post('deposit')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async deposit(@Body() body: DepositWalletDto) {
    return this.walletService.deposit(body);
  }

  @Post('deduct')
  @auth({
    roles: [
      RoleEnum.customer,
      RoleEnum.user,
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.admin,
      RoleEnum.superAdmin,
    ],
  })
  async deductSelf(@Body() body: UserDeductWalletDto, @User() user: any) {
    return this.walletService.deductSelf(body, user);
  }

  @Post('admin/deduct')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async deductAdmin(@Body() body: AdminDeductWalletDto) {
    return this.walletService.deductAdmin(body);
  }
}
