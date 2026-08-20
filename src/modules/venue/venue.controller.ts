import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { MulterEnum, StoreEnum } from 'src/common/enums/multerEnum';
import { RoleEnum } from 'src/common/enums/userEnum';
import { multer_cloud } from 'src/common/interceptor/multer';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import {
  CreateVenueDto,
  GetVenuesQueryDto,
  UpdateVenueDto,
} from './dto/venue.dto';
import { VenueService } from './venue.service';

@ApiTags('Venues')
@Controller('venue')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Get()
  @ApiOperation({
    summary: 'List All Active Sports Venues',
    description:
      'Retrieves all active venues with name, address, sportsType, amenities, defaultHourPrice, and cover photos. Supports optional filtering by sportsType.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of active venues retrieved successfully',
  })
  async getAllVenues(@Query() query: GetVenuesQueryDto) {
    return this.venueService.getAllVenues(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Sports Venue Details by ID',
    description:
      'Retrieves comprehensive details of a specific venue including operating hours, pricing, amenities, and location.',
  })
  @ApiParam({
    name: 'id',
    description: 'Venue MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({
    status: 200,
    description: 'Venue details retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid venue ID format' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async getVenueById(@Param('id') id: string) {
    return this.venueService.getVenueById(id);
  }

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create Sports Venue (Admin / SuperAdmin)',
    description:
      'Registers a new venue with operating hours, sport types, amenities, GPS location, default pricing, custom hourly pricing, and uploads up to 5 venue photos to AWS S3.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Venue creation payload + up to 5 image files',
    schema: {
      type: 'object',
      required: [
        'venueName',
        'address',
        'sportsType',
        'locationAlt',
        'locationLang',
        'amenities',
        'startWorkingHours',
        'endWorkingHours',
        'defaultHourPrice',
      ],
      properties: {
        venueName: { type: 'string', example: 'Camp Nou Arena' },
        address: { type: 'string', example: '123 Stadium Road, Cairo' },
        sportsType: {
          type: 'array',
          items: { type: 'string' },
          example: ['Football', 'Padel'],
          description: 'Sports supported at this venue',
        },
        locationAlt: {
          type: 'number',
          example: 30.0444,
          description: 'Latitude',
        },
        locationLang: {
          type: 'number',
          example: 31.2357,
          description: 'Longitude',
        },
        amenities: {
          type: 'array',
          items: { type: 'string' },
          example: ['Parking', 'Shower', 'WiFi'],
          description: 'List of amenities',
        },
        startWorkingHours: {
          type: 'number',
          example: 8,
          description: 'Opening hour (0-23)',
        },
        endWorkingHours: {
          type: 'number',
          example: 24,
          description: 'Closing hour (1-24)',
        },
        defaultHourPrice: {
          type: 'number',
          example: 250,
          description: 'Base price per hour',
        },
        customHourPrices: {
          type: 'string',
          example: '[{"hour": 20, "pricePerHour": 350}]',
          description: 'JSON string of custom hourly pricing array',
        },
        isActive: { type: 'boolean', example: true },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Up to 5 venue photo files (PNG/JPG, max 5MB each)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Venue created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid coordinates/hours',
  })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  @UseInterceptors(
    FilesInterceptor(
      'images',
      5,
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
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update Sports Venue Details (Admin / SuperAdmin)',
    description:
      'Updates specific venue fields and optionally uploads additional/replacement photos.',
  })
  @ApiParam({
    name: 'id',
    description: 'Venue MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Updated venue fields + optional image files',
    schema: {
      type: 'object',
      properties: {
        venueName: { type: 'string', example: 'Camp Nou Arena - Updated' },
        address: { type: 'string', example: '123 New Stadium Road' },
        sportsType: {
          type: 'array',
          items: { type: 'string' },
          example: ['Football'],
        },
        locationAlt: { type: 'number', example: 30.0444 },
        locationLang: { type: 'number', example: 31.2357 },
        amenities: {
          type: 'array',
          items: { type: 'string' },
          example: ['Parking', 'Shower'],
        },
        startWorkingHours: { type: 'number', example: 9 },
        endWorkingHours: { type: 'number', example: 23 },
        defaultHourPrice: { type: 'number', example: 300 },
        customHourPrices: {
          type: 'string',
          example: '[{"hour": 21, "pricePerHour": 400}]',
        },
        isActive: { type: 'boolean', example: true },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Optional new venue photos',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Venue updated successfully' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin] })
  @UseInterceptors(
    FilesInterceptor(
      'images',
      5,
      multer_cloud({
        storeType: StoreEnum.memory,
        customType: MulterEnum.image,
        maxFileSize: 5 * 1024 * 1024,
      }),
    ),
  )
  async updateVenue(
    @Param('id') id: string,
    @Body() body: UpdateVenueDto,
    @User() user: AdminUserDocument,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    return this.venueService.updateVenue(id, body, user, images);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete Sports Venue (Admin / SuperAdmin / Manager / Owner)',
    description:
      'Soft deletes the specified venue, deactivating it and preserving booking histories.',
  })
  @ApiParam({
    name: 'id',
    description: 'Venue MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({ status: 200, description: 'Venue deleted successfully' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.manager,
      RoleEnum.owner,
    ],
  })
  async deleteVenue(@Param('id') id: string, @User() user: AdminUserDocument) {
    return this.venueService.deleteVenue(id, user);
  }

  @Delete(':id/image')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a specific photo from Venue gallery',
    description: 'Removes the specified image from S3 storage and the venue photos list.',
  })
  @ApiParam({
    name: 'id',
    description: 'Venue MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({ status: 200, description: 'Venue photo deleted successfully' })
  @ApiResponse({ status: 404, description: 'Venue or image not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.manager,
      RoleEnum.owner,
    ],
  })
  async deleteVenueImage(
    @Param('id') id: string,
    @Query('imageKey') imageKey: string,
    @User() user: AdminUserDocument,
  ) {
    return this.venueService.deleteVenueImage(id, imageKey, user);
  }
}
