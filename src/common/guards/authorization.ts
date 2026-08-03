
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../services/token/tokenService';
import { UserRepo } from 'src/common/reposetories/user-repo';
import RedisService from '../services/redis/redis.service';
import { Reflector } from '@nestjs/core';
import { IRequest } from 'utilis/types/request.type';
import { RoleEnum } from '../enums/userEnum';

@Injectable()
export class authorizationGuard implements CanActivate {


  constructor(
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    let req!: IRequest | any
    let authorization: string | undefined

    if (context.getType() == "http") {
      req = context.switchToHttp().getRequest();
      authorization = req?.headers?.authorization;
    }

    if (!authorization) {
      throw new UnauthorizedException("Authorization token is required");
    }
    const [prefix, token] = authorization.split(" ");
    if (!token || !prefix) {
      throw new UnauthorizedException("Invalid authorization token");
    }

    const user = req.user;
    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }

    const allowedRoles: RoleEnum[] = this.reflector.getAllAndOverride('roles', [context.getHandler(), context.getClass()]);

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      throw new UnauthorizedException("Unauthorized");
    }

    return allowedRoles?.includes(user.role);
  }
}
