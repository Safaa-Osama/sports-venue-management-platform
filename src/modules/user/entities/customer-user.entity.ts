import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ref } from 'process';
import { CustomerStatusEnum, ProviderEnum } from 'src/common/enums/userEnum';
import { Wallet } from 'src/modules/wallet/entities/wallet.entity';

export type CustomerUserDocument = HydratedDocument<CustomerUser>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class CustomerUser {
  @Prop({ type: String, required: true })
  userName: string;

  @Prop({ type: String, enum: ProviderEnum, required: true })
  provider: ProviderEnum;

  @Prop({
    type: String,
    trim: true,
    required: function () {
      return this.provider == ProviderEnum.system ? true : false;
    },
    unique: true,
    sparse: true,
  })
  phone?: string;

  @Prop({
    type: String,
    trim: true,
    required: function () {
      return this.provider == ProviderEnum.google ? true : false;
    },
    unique: true,
    sparse: true,
  })
  email?: string;

  @Prop({ type: Boolean, default: false })
  emailConfirmed?: boolean;

  @Prop({ type: String })
  avatar?: string;

  @Prop({ type: String })
  position?: string;

  @Prop({ type: Types.ObjectId, ref: Wallet.name })
  walletId: Types.ObjectId;

  @Prop({ type: String, enum: CustomerStatusEnum, default: CustomerStatusEnum.active, })
  status: CustomerStatusEnum;
}

export const CustomerUserSchema = SchemaFactory.createForClass(CustomerUser);

const customerUserModel = MongooseModule.forFeature([
  { name: CustomerUser.name, schema: CustomerUserSchema },
]);

export default customerUserModel;
