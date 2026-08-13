import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({
  timestamps: true,
})
export class Wallet {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  balance: number;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

const walletModel = MongooseModule.forFeature([
  { name: Wallet.name, schema: WalletSchema },
]);

export default walletModel;


