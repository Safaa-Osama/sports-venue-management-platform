import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AmenitiesService } from './amenities.service';
import { CreateAmenitiesDto, UpdateAmenitiesDto } from './dto/amenities.dto';
import { auth } from 'src/common/decorator/auth.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';

@ApiTags('Amenities')
@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create Venue Amenities (Admin / Owner / Manager)',
    description:
      'Creates a new amenities feature profile for a specific venue (e.g. WiFi, Parking, Showers, Floodlights, Lockers).',
  })
  @ApiResponse({ status: 201, description: 'Amenities record created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or venueId' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async create(@Body() createAmenitiesDto: CreateAmenitiesDto) {
    return this.amenitiesService.create(createAmenitiesDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List All Amenities Records',
    description: 'Retrieves all amenities records across all venues.',
  })
  @ApiResponse({ status: 200, description: 'List of amenities retrieved successfully' })
  async findAll() {
    return this.amenitiesService.findAll();
  }

  @Get('venue/:venueId')
  @ApiOperation({
    summary: 'Get Amenities by Venue ID',
    description: 'Retrieves the amenities feature toggles configured for a particular venue.',
  })
  @ApiParam({ name: 'venueId', description: 'Venue MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({ status: 200, description: 'Amenities for venue found' })
  @ApiResponse({ status: 404, description: 'No amenities found for the given venue' })
  async findByVenueId(@Param('venueId') venueId: string) {
    return this.amenitiesService.findByVenueId(venueId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Amenities Record by ID',
    description: 'Retrieves a single amenities record by its MongoDB ID.',
  })
  @ApiParam({ name: 'id', description: 'Amenities MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({ status: 200, description: 'Amenities record retrieved' })
  @ApiResponse({ status: 404, description: 'Amenities record not found' })
  async findOne(@Param('id') id: string) {
    return this.amenitiesService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update Amenities (Admin / Owner / Manager)',
    description: 'Updates one or more amenity flags for a venue.',
  })
  @ApiParam({ name: 'id', description: 'Amenities MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({ status: 200, description: 'Amenities updated successfully' })
  @ApiResponse({ status: 404, description: 'Amenities record not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async update(@Param('id') id: string, @Body() body: UpdateAmenitiesDto) {
    return this.amenitiesService.updateAmenities(id, body);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete Amenities Record (Admin / Owner / Manager)',
    description: 'Removes an amenities record from the system.',
  })
  @ApiParam({ name: 'id', description: 'Amenities MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiResponse({ status: 200, description: 'Amenities deleted successfully' })
  @ApiResponse({ status: 404, description: 'Amenities record not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async remove(@Param('id') id: string) {
    return this.amenitiesService.removeAmenities(id);
  }
}
