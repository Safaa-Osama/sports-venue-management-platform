import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RoleEnum } from 'src/common/enums/userEnum';

export type AdminUserDocument = HydratedDocument<AdminUser>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class AdminUser {
  @Prop({ type: String, required: true })
  userName: string;

  @Prop({ type: String, required: true, unique: true, index: true, lowercase: true })
  email: string;

  @Prop({ type: String, required: true, select: false })
  password: string;

  @Prop({ type: String, enum: RoleEnum, default: RoleEnum.admin })
  role: RoleEnum;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);

const adminUserModel = MongooseModule.forFeature([
  { name: AdminUser.name, schema: AdminUserSchema },
]);

export default adminUserModel;
