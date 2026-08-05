import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import { AdminUser, AdminUserDocument } from 'src/modules/user/entities/admin-user.entity';

@Injectable()
export class AdminUserRepo extends BaseRepo<AdminUserDocument> {
  constructor(@InjectModel(AdminUser.name) protected readonly adminUserModel: Model<AdminUserDocument>) {
    super(adminUserModel);
  }
}
