import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import type { AdminUserDocument } from '../user/entities/admin-user.entity';
import { AmenitiesService } from './amenities.service';
import {
  CreateAmenitiesDto,
  QueryAmenitiesDto,
  UpdateAmenitiesDto,
} from './dto/amenities.dto';

@ApiTags('Amenities')
@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create Global Amenity (Admin / Owner / Manager)',
    description:
      'Creates a new amenity item in the master catalog (e.g. WiFi, Parking, Showers, Floodlights, Lockers).',
  })
  @ApiResponse({ status: 201, description: 'Amenity created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid input' })
  @ApiResponse({ status: 409, description: 'Amenity with this name already exists' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async create(
    @Body() createAmenitiesDto: CreateAmenitiesDto,
    @User() user: AdminUserDocument,
  ) {
    return this.amenitiesService.create(createAmenitiesDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List All Master Amenities',
    description:
      'Retrieves all active amenities from the catalog with optional search and active status filters.',
  })
  @ApiResponse({ status: 200, description: 'List of amenities retrieved successfully' })
  async findAll(@Query() query: QueryAmenitiesDto) {
    return this.amenitiesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Amenity by ID',
    description: 'Retrieves a single amenity record by its MongoDB ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Amenity MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({ status: 200, description: 'Amenity record retrieved' })
  @ApiResponse({ status: 404, description: 'Amenity record not found' })
  async findOne(@Param('id') id: string) {
    return this.amenitiesService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update Amenity (Admin / Owner / Manager)',
    description: 'Updates an existing amenity details in the catalog.',
  })
  @ApiParam({
    name: 'id',
    description: 'Amenity MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({ status: 200, description: 'Amenity updated successfully' })
  @ApiResponse({ status: 404, description: 'Amenity record not found' })
  @ApiResponse({ status: 409, description: 'Amenity name already exists' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAmenitiesDto,
    @User() user: AdminUserDocument,
  ) {
    return this.amenitiesService.updateAmenities(id, body, user);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Soft Delete Amenity (Admin / Owner / Manager)',
    description: 'Marks an amenity as deleted in the catalog.',
  })
  @ApiParam({
    name: 'id',
    description: 'Amenity MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({ status: 200, description: 'Amenity deleted successfully' })
  @ApiResponse({ status: 404, description: 'Amenity record not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async remove(@Param('id') id: string, @User() user: AdminUserDocument) {
    return this.amenitiesService.removeAmenities(id, user);
  }
}
