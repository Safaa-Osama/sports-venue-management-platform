import { HydratedDocument } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { User } from 'src/modules/user/entities/user.entity';

// declare module "express" {
//         user?: HydratedDocument<User>;
//         decoded?: any;
//     }
// }  

export interface IRequest {
    user?: HydratedDocument<User>;
    decoded?: JwtPayload;
}