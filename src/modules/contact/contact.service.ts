import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContactRepo } from 'src/common/repositories/contact-repo';
import { CreateContactDto, QueryContactDto, UpdateContactStatusDto } from './dto/contact.dto';
import { ContactDocument, ContactStatusEnum } from './entities/contact.entity';

@Injectable()
export class ContactService {
  constructor(private readonly contactRepo: ContactRepo) {}

  async create(dto: CreateContactDto, user?: any) {
    const contactData: Partial<ContactDocument> = {
      name: dto.name.trim(),
      phone: dto.phone.trim(),
      email: dto.email?.trim() || undefined,
      company: dto.company?.trim() || undefined,
      campaignType: dto.campaignType?.trim() || 'BANNER',
      message: dto.message?.trim() || '',
      status: ContactStatusEnum.PENDING,
      source: 'MOBILE_APP',
      userId: user?._id ? new Types.ObjectId(user._id) : undefined,
    };

    const saved = await this.contactRepo.create(contactData);
    return {
      message: 'Contact inquiry submitted successfully',
      data: saved,
    };
  }

  async findAll(query: QueryContactDto) {
    const { page = 1, limit = 10, status, search } = query;
    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (search && search.trim()) {
      const sanitized = search.trim();
      filter.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { phone: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
        { company: { $regex: sanitized, $options: 'i' } },
        { message: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const result = await this.contactRepo.paginate({
      page,
      limit,
      search: filter,
      sort: { createdAt: -1 },
    });

    return {
      message: 'Contact inquiries retrieved successfully',
      meta: result.meta,
      data: result.data,
    };
  }

  async findOne(id: string) {
    const contact = await this.contactRepo.findById(id);
    if (!contact) {
      throw new NotFoundException('Contact inquiry not found');
    }
    return {
      message: 'Contact inquiry retrieved successfully',
      data: contact,
    };
  }

  async updateStatus(id: string, dto: UpdateContactStatusDto) {
    const contact = await this.contactRepo.findByIdAndUpdate({
      id,
      update: { $set: { status: dto.status } },
    });
    if (!contact) {
      throw new NotFoundException('Contact inquiry not found');
    }
    return {
      message: 'Contact status updated successfully',
      data: contact,
    };
  }
}
