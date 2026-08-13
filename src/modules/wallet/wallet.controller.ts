import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { TransactionTypeEnum } from 'src/common/enums/walletEnum';
import type { UserDocument } from '../user/entities/user.entity';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import { AdminDeductWalletDto, CreateWalletDto, DepositWalletDto, GetTransactionsDto, UserDeductWalletDto,} from './dto/wallet.dto';
import { WalletService } from './wallet.service';


@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':id')
  @auth({
    roles: [ RoleEnum.customer, RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin,],
  })
  async getMyWallet(@Param('id') userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }


  @Get('transactions')
  @auth({
    roles: [RoleEnum.customer, RoleEnum.user, RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin,],
  })
  async getTransactions(
    @Query() query: GetTransactionsDto,
    @User() user: UserDocument,
  ) {
    return this.walletService.getTransactions(query, user);
  }


  @Post('create')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async createWallet(@Body() body: CreateWalletDto) {
    return this.walletService.createWallet(body);
  }


  @Post('deposit')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async deposit(@Body() body: DepositWalletDto, @User() user: UserDocument) {
    return this.walletService.deposit(body, TransactionTypeEnum.DEPOSIT, user);
  }


  @Post('deduct')
  @auth({
    roles: [RoleEnum.customer, RoleEnum.user, RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin,],})
  async deductSelf(
    @Body() body: UserDeductWalletDto,
    @User() user: UserDocument,
  ) {
    return this.walletService.deductSelf(body, user);
  }

  
  @Post('admin/deduct')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async deductAdmin(
    @Body() body: AdminDeductWalletDto,
    @User() user: AdminUserDocument,
  ) {
    return this.walletService.deductAdmin(body, user);
  }
}
