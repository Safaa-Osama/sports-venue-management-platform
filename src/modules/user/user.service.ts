import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { UpdateAdminUserDto, UpdateCustomerUserDto } from './dto/update-user.dto';
import { AdminUser } from './entities/admin-user.entity';
import { CustomerUserDocument } from './entities/customer-user.entity';


import { CustomerStatusEnum, ProviderEnum } from 'src/common/enums/userEnum';
import { PushNotificationService } from '../push-notification/push-notification.service';
import { RegisterPushTokenDto, RemovePushTokenDto } from '../push-notification/dto/push-token.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
    private readonly s3Service: S3Service,
    private readonly pushService: PushNotificationService,
  ) { }

  async createCustomer(dto: { userName: string; phone: string }) {
    const existing = await this.customerUserRepo.findOne({ filter: { phone: dto.phone } });
    if (existing) {
      throw new BadRequestException('Customer with this phone already exists');
    }
    const customer = await this.customerUserRepo.create({
      userName: dto.userName,
      phone: dto.phone,
      status: CustomerStatusEnum.active,
      provider: ProviderEnum.system,
    });
    return customer;
  }

  async getAllCustomers(): Promise<any> {
    const customers = await this.customerUserRepo.find({
      projection: { password: 0 },
    });
    return customers.map((c) => {
      const obj = c.toObject ? c.toObject() : { ...c };
      const { password, ...withoutPassword } = obj as any;
      return withoutPassword;
    });
  }

  async getAllAdmins(): Promise<any> {
    const admins = await this.adminUserRepo.find({
      projection: { password: 0 },
    });
    return admins.map((admin) => {
      const obj = admin.toObject ? admin.toObject() : { ...admin };
      const { password, ...withoutPassword } = obj as AdminUser;
      return withoutPassword;
    });
  }


  getProfile(user: any) {
    if (!user) return null;
    const userObj = user.toObject ? user.toObject() : { ...user };
    const { password, ...withoutPassword } = userObj;
    return withoutPassword;
  }


  async getCustomerById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid customer user ID format');
    }
    const customer = await this.customerUserRepo.findById(new Types.ObjectId(id));
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }
    return customer;
  }


  async getCustomerProfile(user: CustomerUserDocument) {
    if (!user || !user._id) {
      throw new NotFoundException('Customer not found');
    }
    const customer = await this.customerUserRepo.findById(user._id);
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }
    return customer;
  }

  async updateCustomerUser(id: string, body: UpdateCustomerUserDto, avatar?: Express.Multer.File,) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid customer user ID format');
    }

    const objectId = new Types.ObjectId(id);

    const customer = await this.customerUserRepo.findById(objectId);
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }

    const { phone, position, userName, avatar: avatarUrl } = body;

    if (phone && phone !== customer.phone) {
      const existing = await this.customerUserRepo.findOne({
        filter: { phone: phone, _id: { $ne: objectId } },
      });
      if (existing) {
        throw new BadRequestException(
          'this phone is used by another customer',
        );
      }
    }

    let newlyUploadedImage: string | undefined;

    if (avatar) {
      newlyUploadedImage = await this.s3Service.uploadFile({
        file: avatar,
        path: 'customerUser',
      });
    }

    const updateData: any = {};

    if (userName !== undefined) updateData.userName = userName;
    if (phone !== undefined) updateData.phone = phone;
    if (position !== undefined) updateData.position = position;
    if (body.locale !== undefined) updateData.locale = body.locale;
    if (body.status !== undefined) updateData.status = body.status;

    if (avatar && newlyUploadedImage !== undefined) {
      updateData.avatar = newlyUploadedImage;
    } else if (avatarUrl !== undefined) {
      updateData.avatar = avatarUrl;
    }

    const updatedCustomer = await this.customerUserRepo.findByIdAndUpdate({
      id: objectId,
      update: { $set: updateData },
    });

    if (!updatedCustomer) {
      throw new NotFoundException('Customer user update failed');
    }

    if (avatar && customer.avatar && newlyUploadedImage) {
      await this.s3Service.deleteFile(customer.avatar);
    }

    // Trigger push notification if status changed to suspended or hold
    if (body.status && body.status !== customer.status) {
      if (body.status === CustomerStatusEnum.suspended) {
        this.pushService.sendToCustomer(objectId, 'USER_SUSPENDED', {
          userName: updatedCustomer.userName || 'User',
        }).catch(() => {});
      } else if (body.status === CustomerStatusEnum.hold) {
        this.pushService.sendToCustomer(objectId, 'USER_ON_HOLD', {
          userName: updatedCustomer.userName || 'User',
        }).catch(() => {});
      }
    }

    return updatedCustomer;
  }

  async registerPushToken(user: any, dto: RegisterPushTokenDto) {
    const userId = user._id || user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }
    const success = await this.pushService.registerPushToken(
      userId,
      dto.token,
      dto.platform || 'unknown',
      dto.locale,
    );
    return { success, message: 'Push token registered successfully' };
  }

  async removePushToken(user: any, dto: RemovePushTokenDto) {
    const userId = user._id || user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }
    const success = await this.pushService.removePushToken(userId, dto.token);
    return { success, message: 'Push token removed successfully' };
  }


  async updateAdminUser(id: string, body: UpdateAdminUserDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid admin user ID format');
    }

    const objectId = new Types.ObjectId(id);

    const admin = await this.adminUserRepo.findById(objectId);
    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    const { userName, email, password } = body;

    const updatePayload: any = {};

    if (userName !== undefined) updatePayload.userName = userName;
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      if (normalizedEmail !== admin.email) {
        const existing = await this.adminUserRepo.findOne({
          filter: { email: normalizedEmail, _id: { $ne: objectId } },
        });
        if (existing) {
          throw new BadRequestException(
            'Admin user with this email already exists',
          );
        }
      }
      updatePayload.email = normalizedEmail;
    }

    if (password) {
      updatePayload.password = await bcrypt.hash(password, 10);
    }

    const updatedAdmin = await this.adminUserRepo.findByIdAndUpdate({
      id: objectId,
      update: { $set: updatePayload },
    });

    if (!updatedAdmin) {
      throw new NotFoundException('Admin user not found');
    }

    const adminObj = updatedAdmin.toObject();
    const { password: _, ...withoutPassword } = adminObj;

    return withoutPassword;
  }
}
