import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ProviderEnum, RoleEnum } from 'src/common/enums/userEnum';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class User {
  @Prop({ type: String, required: true })
  userName: string;

  @Prop({ type: String, unique: true })
  phone?: string;

  @Prop({ type: String })
  avatar: string;

  @Prop({ type: String })
  position?: string;

  @Prop({
    type: String, lowercase: true, trim: true,
    sparse: true,
  })
  email?: string;

  @Prop({ type: String, enum: RoleEnum, default: RoleEnum.customer })
  role: RoleEnum;

  @Prop({ type: Number, default: 0 })
  walletBalance?: number;

  @Prop({
    type: [
      {
        token: { type: String, required: true },
        platform: { type: String, default: 'unknown' },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  pushTokens: { token: string; platform: string; updatedAt?: Date }[];

  @Prop({ type: String, enum: ['ar', 'en'], default: 'ar' })
  locale: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

const userModel = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
]);
export default userModel;
