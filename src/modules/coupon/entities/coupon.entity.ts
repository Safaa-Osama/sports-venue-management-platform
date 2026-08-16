import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CouponEnum } from 'src/common/enums/couponEnum';

export type CouponDocument = HydratedDocument<Coupon>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Coupon {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  code: string;

  @Prop({ type: Number, required: true })
  discount: number;

  @Prop({ type: String, enum: CouponEnum, default: CouponEnum.percentage })
  discountType: CouponEnum;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ type: Number, required: true })
  maxUses: number;

  @Prop({ type: Number, default: 0 })
  usesCount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);

const couponModel = MongooseModule.forFeature([
  { name: Coupon.name, schema: CouponSchema },
]);

export default couponModel;
