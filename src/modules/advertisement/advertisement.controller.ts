import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { MulterEnum, StoreEnum } from 'src/common/enums/multerEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { multer_cloud } from 'src/common/interceptor/multer';
import { AdvertisementService } from './advertisement.service';
import {
  BulkReorderAdvertisementDto,
  CreateAdvertisementDto,
  GetDashboardAdvertisementsDto,
  QueryAdvertisementDto,
  ScheduleAdvertisementDto,
  UpdateAdvertisementDto,
  UpdateAdvertisementPriorityDto,
  UpdateAdvertisementStatusDto,
} from './dto/advertisement.dto';

@Controller('advertisements')
export class AdvertisementController {
  constructor(private readonly advertisementService: AdvertisementService) {}

  // ---------------------------------------------------------------------------
  // PUBLIC / DASHBOARD & TRACKING ENDPOINTS
  // ---------------------------------------------------------------------------

  /**
   * Public: Retrieve eligible active advertisements for dashboard positions.
   */
  @Get('dashboard')
  async getDashboardAdvertisements(
    @Query() query: GetDashboardAdvertisementsDto,
  ) {
    return this.advertisementService.getDashboardAdvertisements(query);
  }

  /**
   * Public: Safely record an impression on an advertisement.
   */
  @Post(':id/impression')
  @HttpCode(HttpStatus.OK)
  async recordImpression(@Param('id') id: string) {
    return this.advertisementService.recordImpression(id);
  }

  /**
   * Public: Safely record a click on an advertisement.
   */
  @Post(':id/click')
  @HttpCode(HttpStatus.OK)
  async recordClick(@Param('id') id: string) {
    return this.advertisementService.recordClick(id);
  }

  // ---------------------------------------------------------------------------
  // ADMIN MANAGEMENT ENDPOINTS
  // ---------------------------------------------------------------------------

  /**
   * Admin: Create a new advertisement with banner image upload.
   */
  @Post()
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  @UseInterceptors(
    FileInterceptor(
      'image',
      multer_cloud({
        storeType: StoreEnum.memory,
        customType: MulterEnum.image,
        maxFileSize: 5 * 1024 * 1024, // 5MB
      }),
    ),
  )
  async create(
    @Body() body: CreateAdvertisementDto,
    @User() user: any,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.advertisementService.create(body, user, image);
  }

  /**
   * Admin: List all advertisements with pagination, filters, and search.
   */
  @Get()
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async findAllAdmin(@Query() query: QueryAdvertisementDto) {
    return this.advertisementService.findAllAdmin(query);
  }

  /**
   * Admin: Bulk reorder advertisement priorities.
   */
  @Patch('reorder')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async bulkReorder(
    @Body() body: BulkReorderAdvertisementDto,
    @User() user: any,
  ) {
    return this.advertisementService.bulkReorder(body, user);
  }

  /**
   * Admin: Get single advertisement by ID with full analytics.
   */
  @Get(':id')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async findById(@Param('id') id: string) {
    return this.advertisementService.findById(id);
  }

  /**
   * Admin: Update advertisement details and optionally replace banner image.
   */
  @Patch(':id')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  @UseInterceptors(
    FileInterceptor(
      'image',
      multer_cloud({
        storeType: StoreEnum.memory,
        customType: MulterEnum.image,
        maxFileSize: 5 * 1024 * 1024, // 5MB
      }),
    ),
  )
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAdvertisementDto,
    @User() user: any,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.advertisementService.update(id, body, user, image);
  }

  /**
   * Admin: Update advertisement status (active, inactive, etc.).
   */
  @Patch(':id/status')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateAdvertisementStatusDto,
    @User() user: any,
  ) {
    return this.advertisementService.updateStatus(id, body.status, user);
  }

  /**
   * Admin: Schedule an advertisement with start and end dates.
   */
  @Patch(':id/schedule')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async schedule(
    @Param('id') id: string,
    @Body() body: ScheduleAdvertisementDto,
    @User() user: any,
  ) {
    return this.advertisementService.schedule(id, body, user);
  }

  /**
   * Admin: Update single advertisement priority.
   */
  @Patch(':id/priority')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async updatePriority(
    @Param('id') id: string,
    @Body() body: UpdateAdvertisementPriorityDto,
    @User() user: any,
  ) {
    return this.advertisementService.updatePriority(id, body.priority, user);
  }

  /**
   * Admin: Delete advertisement and delete S3 image asset.
   */
  @Delete(':id')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async delete(@Param('id') id: string, @User() user: any) {
    return this.advertisementService.delete(id, user);
  }
}
