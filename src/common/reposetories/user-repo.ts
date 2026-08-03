 import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/user/entities/user.entity';

@Injectable()
export class UserRepo extends BaseRepo<UserDocument> {
  constructor(@InjectModel(User.name) protected readonly userModel: Model<UserDocument>) {
    super(userModel);
  }
}
