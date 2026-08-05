import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { UpdateAdminUserDto, UpdateCustomerUserDto } from './dto/update-user.dto';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UserDocument } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
  ) {}

  async getAllCustomers() {
    return this.customerUserRepo.find();
  }

  async getAllAdmins() {
    return this.adminUserRepo.find();
  }

  getProfile(user: UserDocument) {
    return user;
  }

  async updateCustomerUser(id: string, updateDto: UpdateCustomerUserDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid customer user ID format');
    }

    const customer = await this.customerUserRepo.findById(id);
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }

    if (updateDto.phone && updateDto.phone !== customer.phone) {
      const existing = await this.customerUserRepo.findOne({
        filter: { phone: updateDto.phone, _id: { $ne: new Types.ObjectId(id) } },
      });
      if (existing) {
        throw new BadRequestException('Customer user with this phone number already exists');
      }
    }

    const updatedCustomer = await this.customerUserRepo.findByIdAndUpdate({
      id: new Types.ObjectId(id),
      update: { },
    });

    return updatedCustomer;
  }

  async updateAdminUser(id: string, updateDto: UpdateAdminUserDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid admin user ID format');
    }

    const admin = await this.adminUserRepo.findById(id);
    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    const updatePayload: Record<string, any> = { ...updateDto };

    if (updateDto.email) {
      const normalizedEmail = updateDto.email.toLowerCase();
      if (normalizedEmail !== admin.email) {
        const existing = await this.adminUserRepo.findOne({
          filter: { email: normalizedEmail, _id: { $ne: new Types.ObjectId(id) } },
        });
        if (existing) {
          throw new BadRequestException('Admin user with this email already exists');
        }
      }
      updatePayload.email = normalizedEmail;
    }

    if (updateDto.password) {
      updatePayload.password = await bcrypt.hash(updateDto.password, 10);
    }

    const updatedAdmin = await this.adminUserRepo.findByIdAndUpdate({
      id: new Types.ObjectId(id),
      update: { $set: updatePayload },
    });

    if (!updatedAdmin) {
      throw new NotFoundException('Admin user not found');
    }

    const adminObj = updatedAdmin.toObject();
    const { password, ...adminWithoutPassword } = adminObj as any;

    
    return adminWithoutPassword;
  }
}
