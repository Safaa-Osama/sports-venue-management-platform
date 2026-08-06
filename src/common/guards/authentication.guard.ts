import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../services/token/tokenService';
import { IRequest } from 'src/utilis/types/request.type';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    let req: IRequest | any;
    let authorization: string | undefined;

    if (context.getType() === 'http') {
      req = context.switchToHttp().getRequest();
      authorization = req?.headers?.authorization;
    } else if (context.getType() === 'ws') {
      req = context.switchToWs().getClient();
      authorization = req?.handshake?.headers?.authorization;
    } else if (context.getType() === 'rpc') {
      req = context.switchToRpc().getContext();
    }

    if (!authorization) {
      throw new UnauthorizedException('Authorization token is required');
    }
    const [prefix, token] = authorization.split(" ");
    if (!token || !prefix) {
      throw new UnauthorizedException("Invalid authorization token");
    }

    const { user, decoded } = await this.tokenService.authenticateToken_fetchUser(token);

    req.user = user;
    req.decoded = decoded;

    return true;
  }
}
