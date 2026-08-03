import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions, JwtVerifyOptions } from '@nestjs/jwt';
import { UserRepo } from 'src/common/reposetories/user-repo';
import RedisService from '../redis/redis.service';

@Injectable()
export class TokenService {

    constructor(
        private readonly jwtService: JwtService,
        private readonly userRepo: UserRepo,
        private readonly redisService: RedisService,
    ) { }

    generateToken({ payload, options }: {
        payload: object;
        options?: JwtSignOptions;
    }): Promise<string> {
        return this.jwtService.signAsync(payload, options);
    }

    verifyToken({ token, options }: {
        token: string;
        options?: JwtVerifyOptions;
    }): Promise<object> {
        return this.jwtService.verifyAsync(token, options);
    }

    async getSignature(prefix: string) {

        let ACCESS_SECRET_KEY: string = "";
        let REFRESH_SECRET_KEY: string = "";

        if (prefix === process.env.PREFIX_USER) {
            ACCESS_SECRET_KEY = process.env.SECRET_KEY_USER!;
            REFRESH_SECRET_KEY = process.env.REFRESH_SECRET_KEY_USER!;
        } else if (prefix === process.env.PREFIX_ADMIN) {
            ACCESS_SECRET_KEY = process.env.SECRET_KEY_ADMIN!;
            REFRESH_SECRET_KEY = process.env.REFRESH_SECRET_KEY_ADMIN!;
        } else {
            throw new BadRequestException("Invalid role");
        }

        return { ACCESS_SECRET_KEY, REFRESH_SECRET_KEY }
    }


    async authenticateToken_fetchUser(token: string, secret: string) {
        console.log("SECRET USED:", secret);
        console.log("TOKEN:", token);
        const decoded = await this.verifyToken({ token, options: { secret } }) as any;

        if (!decoded?.jti || !decoded?.id) {
            throw new BadRequestException("invalid authorization !");
        }

        const user = await this.userRepo.findOne({
            filter: { _id: decoded.id },
        });

        if (!user) {
            throw new BadRequestException("user not found");
        }

        const revoked = await this.redisService.getValue(
            this.redisService.revokedKey({
                userId: user._id,
                jti: decoded.jti!,
            })
        );

        if (revoked) {
            throw new BadRequestException("Invalid token revoked");
        }
        return { user, decoded };
    };

}