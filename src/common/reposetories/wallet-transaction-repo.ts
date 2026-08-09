import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletTransaction, WalletTransactionDocument } from 'src/modules/wallet/entities/wallet-transaction.entity';
import BaseRepo from './base-repo';

@Injectable()
export class WalletTransactionRepo extends BaseRepo<WalletTransactionDocument> {
  constructor(
    @InjectModel(WalletTransaction.name)
    protected readonly walletTransactionModel: Model<WalletTransactionDocument>,
  ) {
    super(walletTransactionModel);
  }
}
