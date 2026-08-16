import { HydratedDocument } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { CustomerUser } from 'src/modules/user/entities/customer-user.entity';
import { AdminUser } from 'src/modules/user/entities/admin-user.entity';

export interface IRequest {
  user?: HydratedDocument<CustomerUser> | HydratedDocument<AdminUser> | any;
  decoded?: JwtPayload;
}
