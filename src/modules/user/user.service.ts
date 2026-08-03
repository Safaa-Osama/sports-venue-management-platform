import { Injectable } from '@nestjs/common';
import { UserRepo } from 'src/common/reposetories/user-repo';
import { UserDocument } from './entities/user.entity';

@Injectable()
export class UserService {
    constructor(private readonly userRepo: UserRepo) { }

    getAllUser(){
        const users = this.userRepo.find()
        return users
    }

     getProfile (user: UserDocument) {
        return user;
    }
}
