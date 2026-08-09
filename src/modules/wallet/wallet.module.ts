import { Module } from '@nestjs/common';
import { WalletRepo } from 'src/common/reposetories/wallet-repo';
import walletModel from './entities/wallet.entity';
import walletTransactionModel from './entities/wallet-transaction.entity';
import { WalletTransactionRepo } from 'src/common/reposetories/wallet-transaction-repo';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import userModel from '../user/entities/user.entity';
import { UserRepo } from 'src/common/reposetories/user-repo';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';

@Module({
  imports: [walletModel, walletTransactionModel, userModel, adminUserModel, customerUserModel],
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletRepo,
    WalletTransactionRepo,
    UserRepo,
    TokenService,
    JwtService,
    AdminUserRepo,
    CustomerUserRepo,
    RedisService,
  ],
  exports: [WalletService, WalletRepo, WalletTransactionRepo],
})
export class WalletModule {}
