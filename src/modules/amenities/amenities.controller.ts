import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AmenitiesService } from './amenities.service';
import { CreateAmenitiesDto, UpdateAmenitiesDto } from './dto/amenities.dto';
import { auth } from 'src/common/decorator/auth.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';

@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) { }

  @Post()
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager] })
  async create(@Body() createAmenitiesDto: CreateAmenitiesDto) {
    return this.amenitiesService.create(createAmenitiesDto);
  }

  @Get()
  async findAll() {
    return this.amenitiesService.findAll();
  }

  @Get('venue/:venueId')
  async findByVenueId(@Param('venueId') venueId: string) {
    return this.amenitiesService.findByVenueId(venueId);
  }


  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.amenitiesService.findOne(id);
  }


  @Patch(':id')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager] })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAmenitiesDto,
  ) {
    return this.amenitiesService.updateAmenities(id, body);
  }


  @Delete(':id')
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner, RoleEnum.manager] })
  async remove(@Param('id') id: string) {
    return this.amenitiesService.removeAmenities(id);
  }
}
