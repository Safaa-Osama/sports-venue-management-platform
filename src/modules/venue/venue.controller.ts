import { Body, Controller, Delete, Param, Patch, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { MulterEnum, StoreEnum } from 'src/common/enums/multerEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { multer_cloud } from 'src/common/interceptor/multer';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import { CreateVenueDto, UpdateteVenueDto } from './dto/venue.dto';
import { VenueService } from './venue.service';

@Controller('venue')
export class VenueController {
  constructor(private readonly venueService: VenueService) { }

  @Post()
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  @UseInterceptors(
    FilesInterceptor(
      'images', 5,
      multer_cloud({
        storeType: StoreEnum.memory,
        customType: MulterEnum.image,
        maxFileSize: 5 * 1024 * 1024,
      }),
    ),
  )
  async createVenue(
    @Body() body: CreateVenueDto,
    @User() user: AdminUserDocument,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    return this.venueService.createVenue(body, user, images);
  }


  @Patch(':id')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  @UseInterceptors(
    FilesInterceptor(
      'images', 5,
      multer_cloud({
        storeType: StoreEnum.memory,
        customType: MulterEnum.image,
        maxFileSize: 5 * 1024 * 1024,
      }),
    ),
  )
  async updateVenue(
    @Param('id') id: string,
    @Body() body: UpdateteVenueDto,
    @User() user: AdminUserDocument,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    return this.venueService.updateVenue(id, body, user, images);
  }

  @Delete(':id')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin,RoleEnum.manager,RoleEnum.owner] })
  async deleteVenue(
    @Param('id') id: string,
    @User() user: AdminUserDocument,
  ) {
    return this.venueService.deleteVenue(id, user);
  }

}
