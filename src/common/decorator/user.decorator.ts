


import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
    (data: unknown, context: ExecutionContext) => {
        if (context.getType() == "http") {
            const req = context.switchToHttp().getRequest();
            const user = req.user;
            return user;
        }
    },
);
