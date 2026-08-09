import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TransactionStatusEnum, TransactionTypeEnum } from 'src/common/enums/walletEnum';

export type WalletTransactionDocument = HydratedDocument<WalletTransaction>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class WalletTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true, index: true })
  walletId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: TransactionTypeEnum, required: true, index: true })
  type: TransactionTypeEnum;

  @Prop({ type: String, enum: TransactionStatusEnum, default: TransactionStatusEnum.SUCCESS, index: true })
  status: TransactionStatusEnum;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Number, required: true })
  balanceBefore: number;

  @Prop({ type: Number, required: true })
  balanceAfter: number;

  @Prop({ type: String, unique: true, required: true, index: true })
  receiptNumber: string;

  @Prop({ type: String })
  referenceId?: string;

  @Prop({ type: String })
  description?: string;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

const walletTransactionModel = MongooseModule.forFeature([
  { name: WalletTransaction.name, schema: WalletTransactionSchema },
]);

export default walletTransactionModel;
