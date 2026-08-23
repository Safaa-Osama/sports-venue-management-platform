import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { ContactService } from './contact.service';
import { CreateContactDto, QueryContactDto, UpdateContactStatusDto } from './dto/contact.dto';

@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * Public: Submit a contact / advertising inquiry.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createContactDto: CreateContactDto, @User() user?: any) {
    return this.contactService.create(createContactDto, user);
  }

  /**
   * Admin: List all contact inquiries with pagination and filters.
   */
  @Get()
  @auth({ roles: [RoleEnum.superAdmin, RoleEnum.admin] })
  async findAll(@Query() query: QueryContactDto) {
    return this.contactService.findAll(query);
  }

  /**
   * Admin: View single inquiry.
   */
  @Get(':id')
  @auth({ roles: [RoleEnum.superAdmin, RoleEnum.admin] })
  async findOne(@Param('id') id: string) {
    return this.contactService.findOne(id);
  }

  /**
   * Admin: Update inquiry status.
   */
  @Patch(':id/status')
  @auth({ roles: [RoleEnum.superAdmin, RoleEnum.admin] })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateContactStatusDto,
  ) {
    return this.contactService.updateStatus(id, updateStatusDto);
  }
}
