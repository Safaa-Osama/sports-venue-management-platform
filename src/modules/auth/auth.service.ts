import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRepo } from 'src/common/reposetories/user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';
import { CreateUserDto } from './dto/auth.dto';
import { RoleEnum } from 'src/common/enums/userEnum';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {

  constructor(
    private readonly userRepo: UserRepo,
    private readonly redisService: RedisService,
    private readonly s3Service: S3Service,
    private readonly tokenService: TokenService,
  ) { }

  async register(body: CreateUserDto, avatar?: Express.Multer.File) {
    const { userName, phone, role, walletBalance } = body
    if (!userName && !phone) {
      throw new BadRequestException("ussr name and phone are required...")
    }

    if (await this.userRepo.findOne({ filter: { phone } })) {
      throw new BadRequestException("user already exists")
    }

    let uploadedImage: string | undefined;
    if (avatar) {
      uploadedImage = await this.s3Service.uploadFile({
        file: avatar,
        path: "users",
      });
    }

    const user = await this.userRepo.create({
      userName,
      phone,
      role,
      avatar: uploadedImage,
      walletBalance,
    })

    if (!user) {
      await this.s3Service.deleteFile(uploadedImage!)
      throw new BadRequestException("user not created")
    }
    
      const prefix = user.role === RoleEnum.admin ? process.env.PREFIX_ADMIN! : process.env.PREFIX_USER!;
      const { ACCESS_SECRET_KEY, REFRESH_SECRET_KEY } = await this.tokenService.getSignature(prefix);

      const uuid = randomUUID()
      const accessToken = await this.tokenService.generateToken({
        payload: {
          id: user._id,
          phone: user.phone
        },
        options: {
          secret: ACCESS_SECRET_KEY,
          expiresIn: 60 * 60,
          jwtid: uuid
        }
      })

      const refreshToken = await this.tokenService.generateToken({
        payload: {
          id: user._id,
          phone: user.phone
        },
        options: {
          secret: REFRESH_SECRET_KEY,
          expiresIn: '1y',
          jwtid: uuid
        }
      })

    return { user, accessToken, refreshToken }
  }


}
