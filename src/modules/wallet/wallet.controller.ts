import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, } from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { TransactionTypeEnum } from 'src/common/enums/walletEnum';
import type { UserDocument } from '../user/entities/user.entity';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import { AdminDeductWalletDto, CreateWalletDto, DepositWalletDto, GetTransactionsDto, UserDeductWalletDto, } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth('JWT-auth')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) { }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Wallet Balance by User ID',
    description: 'Retrieves current digital wallet balance for a user account.',
  })
  @ApiParam({ name: 'id', description: 'User MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({
    status: 200,
    description: 'Wallet found',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          _id: '64e8b0a1f2b4c10012345699',
          userId: '64e8b0a1f2b4c10012345678',
          balance: 750,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
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
  async getMyWallet(@Param('id') userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Get Wallet Transactions Ledger',
    description:
      'Retrieves chronological list of wallet debits, credits, refunds, and bookings with pagination and filters.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions ledger retrieved successfully',
  })
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
  async getTransactions(
    @Query() query: GetTransactionsDto,
    @User() user: UserDocument,
  ) {
    return this.walletService.getTransactions(query, user);
  }

  @Post('create')
  @ApiOperation({
    summary: 'Create Wallet for User (Admin / SuperAdmin)',
    description: 'Manually creates a new digital wallet record for a user if one was not automatically created.',
  })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Wallet already exists for this user' })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async createWallet(@Body() body: CreateWalletDto) {
    return this.walletService.createWallet(body);
  }

  @Post('deposit')
  @ApiOperation({
    summary: 'Deposit Funds to Customer Wallet (Admin / SuperAdmin)',
    description:
      'Deposits funds to a target customer wallet after cash collection at reception or manual credit.',
  })
  @ApiResponse({ status: 200, description: 'Deposit successful, balance updated' })
  @ApiResponse({ status: 400, description: 'Invalid amount or user ID' })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async deposit(@Body() body: DepositWalletDto, @User() user: AdminUserDocument) {
    return this.walletService.deposit(body, TransactionTypeEnum.DEPOSIT, user);
  }

  @Post('deduct')
  @ApiOperation({
    summary: 'Deduct Funds from Self Wallet',
    description: 'Deducts money from the authenticated user own wallet balance.',
  })
  @ApiResponse({ status: 200, description: 'Funds deducted successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance' })
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
  async deductSelf(
    @Body() body: UserDeductWalletDto,
    @User() user: UserDocument,
  ) {
    return this.walletService.deductSelf(body, user);
  }

  @Post('admin/deduct')
  @ApiOperation({
    summary: 'Admin Deduct Funds from User Wallet (Admin / SuperAdmin)',
    description: 'Administrative deduction with mandatory audit reason description.',
  })
  @ApiResponse({ status: 200, description: 'Admin deduction processed' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or user not found' })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  async deductAdmin(
    @Body() body: AdminDeductWalletDto,
    @User() user: AdminUserDocument,
  ) {
    return this.walletService.deductAdmin(body, user);
  }
}
