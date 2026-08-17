import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import {
  Wallet,
  WalletDocument,
} from 'src/modules/wallet/entities/wallet.entity';

@Injectable()
export class WalletRepo extends BaseRepo<WalletDocument> {
  constructor(
    @InjectModel(Wallet.name)
    protected readonly walletModel: Model<WalletDocument>,
  ) {
    super(walletModel);
  }
}
