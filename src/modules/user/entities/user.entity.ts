import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GenderEnum, ProviderEnum, RoleEnum } from 'src/common/enums/userEnum';

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

  @Prop({ type: String, required: true, unique: true })
  phone: string;

  @Prop({ type: Number })
  age: number;

  @Prop({ type: String })
  avatar: string;

  @Prop({ type: String, enum: RoleEnum, default: RoleEnum.customer })
  role: RoleEnum;

  @Prop({ type: String, enum: GenderEnum, default: GenderEnum.male })
  gender: GenderEnum;

  @Prop({ type: String, enum: ProviderEnum, default: ProviderEnum.system })
  provider: ProviderEnum;

  @Prop({ type: Number, default: 0 })
  walletBalance: number;

  @Prop({ type: Date })
  birthDate: Date;

  @Prop({type:Date})
  createdAt:Date
}

export const UserSchema = SchemaFactory.createForClass(User);

const userModel = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
]);
export default userModel;
