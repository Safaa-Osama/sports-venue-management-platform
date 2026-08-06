import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { UpdateAdminUserDto, UpdateCustomerUserDto } from './dto/update-user.dto';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { S3Service } from 'src/common/services/s3Service/s3.service';

@Injectable()
export class UserService {
  constructor(
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
    private readonly s3Service: S3Service,
  ) {}

  async getAllCustomers() {
    return this.customerUserRepo.find();
  }

  async getAllAdmins() {
    const admins = await this.adminUserRepo.find();
    return admins.map((admin) => {
      const obj = admin.toObject ? admin.toObject() : { ...admin };
      const { password, ...withoutPassword } = obj as any;
      return withoutPassword;
    });
  }

  getProfile(user: any) {
    if (!user) return null;
    const userObj = user.toObject ? user.toObject() : { ...user };
    const { password, ...withoutPassword } = userObj;
    return withoutPassword;
  }

  async updateCustomerUser(
    id: string,
    updateDto: UpdateCustomerUserDto,
    avatar?: Express.Multer.File,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid customer user ID format');
    }

    const objectId = new Types.ObjectId(id);

    const customer = await this.customerUserRepo.findById(objectId);
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }

    const updatePayload: Record<string, any> = { ...updateDto };

    if (updateDto.phone && updateDto.phone !== customer.phone) {
      const existing = await this.customerUserRepo.findOne({
        filter: { phone: updateDto.phone, _id: { $ne: objectId } },
      });
      if (existing) {
        throw new BadRequestException('Customer user with this phone number already exists');
      }
    }

    let newlyUploadedImage: string | undefined;

    if (avatar) {
      newlyUploadedImage = await this.s3Service.uploadFile({
        file: avatar,
        path: 'customerUser',
      });
      updatePayload.avatar = newlyUploadedImage;
    }

    try {
      const updatedCustomer = await this.customerUserRepo.findByIdAndUpdate({
        id: objectId,
        update: { $set: updatePayload },
      });

      if (!updatedCustomer) {
        throw new NotFoundException('Customer user update failed');
      }

      // If update succeeded and new avatar was uploaded, delete old avatar if existing
      if (avatar && customer.avatar && newlyUploadedImage) {
        await this.s3Service.deleteFile(customer.avatar as string).catch(() => {});
      }

      return updatedCustomer;
    } catch (error) {
      // If DB update failed, delete the newly uploaded image from S3
      if (newlyUploadedImage) {
        await this.s3Service.deleteFile(newlyUploadedImage).catch(() => {});
      }
      throw error;
    }
  }

  async updateAdminUser(id: string, updateDto: UpdateAdminUserDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid admin user ID format');
    }

    const objectId = new Types.ObjectId(id);

    const admin = await this.adminUserRepo.findById(objectId);
    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    const updatePayload: Record<string, any> = { ...updateDto };

    if (updateDto.email) {
      const normalizedEmail = updateDto.email.toLowerCase().trim();
      if (normalizedEmail !== admin.email) {
        const existing = await this.adminUserRepo.findOne({
          filter: { email: normalizedEmail, _id: { $ne: objectId } },
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
      id: objectId,
      update: { $set: updatePayload },
    });

    if (!updatedAdmin) {
      throw new NotFoundException('Admin user not found');
    }

    const adminObj = updatedAdmin.toObject ? updatedAdmin.toObject() : { ...updatedAdmin };
    const { password, ...adminWithoutPassword } = adminObj as any;

    return adminWithoutPassword;
  }
}
