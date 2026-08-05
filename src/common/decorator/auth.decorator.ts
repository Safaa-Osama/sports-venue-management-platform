import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { TokenEnum } from "../enums/tokenEnum";
import { authorizationGuard } from "../guards/authorization";
import { AuthenticationGuard } from "../guards/authentication.guard";
import { RoleEnum } from "../enums/userEnum";


export function auth(
    { roles = [RoleEnum.user,RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager,RoleEnum.customer],
        tokenType = TokenEnum.accessToken }
        : { roles?: RoleEnum[], tokenType?: TokenEnum }) {
    return applyDecorators(
        SetMetadata('tokenType', tokenType),
        SetMetadata('roles', roles),
        UseGuards(AuthenticationGuard, authorizationGuard)
    );
}