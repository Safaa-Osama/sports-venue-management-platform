
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../services/token/tokenService';
import { UserRepo } from 'src/common/reposetories/user-repo';
import RedisService from '../services/redis/redis.service';
import { Reflector } from '@nestjs/core';
import { IRequest } from 'utilis/types/request.type';

@Injectable()
export class AuthenticationGuard implements CanActivate {


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
    else if (context.getType() == "ws") {
      req = context.switchToWs().getClient();
    }
    else if (context.getType() == "rpc") {
      req = context.switchToRpc().getContext();
    }

    if (!authorization) {
      throw new UnauthorizedException("Authorization token is required");
    }
    const [prefix, token] = authorization.split(" ");
    if (!token || !prefix) {
      throw new UnauthorizedException("Invalid authorization token");
    }

    const tokenType = this.reflector.getAllAndOverride('tokenType', [context.getHandler(), context.getClass()]);
    console.log({ tokenType });

    const { ACCESS_SECRET_KEY, REFRESH_SECRET_KEY } = await this.tokenService.getSignature(prefix);
    const { user, decoded } = await this.tokenService.authenticateToken_fetchUser(token, ACCESS_SECRET_KEY);

    req.user = user;
    req.decoded = decoded;

    return true;
  }
}
