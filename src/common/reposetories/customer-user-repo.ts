import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import {
  CustomerUser,
  CustomerUserDocument,
} from 'src/modules/user/entities/customer-user.entity';

@Injectable()
export class CustomerUserRepo extends BaseRepo<CustomerUserDocument> {
  constructor(
    @InjectModel(CustomerUser.name)
    protected readonly customerUserModel: Model<CustomerUserDocument>,
  ) {
    super(customerUserModel);
  }
}
