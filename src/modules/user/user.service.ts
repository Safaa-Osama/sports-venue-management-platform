import { Injectable } from '@nestjs/common';
import { UserRepo } from 'src/common/reposetories/user-repo';

@Injectable()
export class UserService {
    constructor(private readonly userRepo: UserRepo) { }

    getUser(){
        const users = this.userRepo.find()
        return users
    }
}
