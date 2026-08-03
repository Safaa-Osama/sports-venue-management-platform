import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/auth.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multer_cloud } from 'src/common/interceptor/multer';
import { MulterEnum, StoreEnum } from 'src/common/enums/multerEnum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  @UseInterceptors(FileInterceptor('avatar', multer_cloud({
    storeType: StoreEnum.memory,
    customType: MulterEnum.image,
    maxFileSize: 5 * 1024 * 1024
  }))
  )
  register(@Body() body: CreateUserDto, @UploadedFile() file: Express.Multer.File) {
    return this.authService.register(body, file);
  }

}
