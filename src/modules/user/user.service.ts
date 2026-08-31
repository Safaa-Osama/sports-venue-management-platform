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
import { WalletRepo } from 'src/common/repositories/wallet-repo';
import { BookingGateway } from '../booking/booking.gateway';
import { BookingService } from '../booking/booking.service';

@Injectable()
export class UserService {
  constructor(
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
    private readonly walletRepo: WalletRepo,
    private readonly s3Service: S3Service,
    private readonly pushService: PushNotificationService,
    private readonly bookingGateway: BookingGateway,
    private readonly bookingService: BookingService,
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

    const userIds = customers.map((c) => c._id);
    const wallets = await this.walletRepo.find({
      filter: { userId: { $in: userIds } },
    });

    const walletMap = new Map<string, number>();
    for (const w of wallets) {
      if (w.userId) {
        walletMap.set(w.userId.toString(), w.balance ?? 0);
      }
    }

    return customers.map((c) => {
      const obj = c.toObject ? c.toObject() : { ...c };
      const { password, ...withoutPassword } = obj as any;
      const cIdStr = c._id.toString();
      return {
        ...withoutPassword,
        walletBalance: walletMap.get(cIdStr) ?? 0,
      };
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


  async getCustomerById(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid customer user ID format');
    }
    const customer = await this.customerUserRepo.findById(new Types.ObjectId(id));
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }
    const wallet = await this.walletRepo.findOne({ filter: { userId: customer._id } });
    const obj = customer.toObject ? customer.toObject() : { ...customer };
    return {
      ...obj,
      walletBalance: wallet?.balance ?? 0,
    };
  }


  async getCustomerProfile(user: CustomerUserDocument): Promise<any> {
    if (!user || !user._id) {
      throw new NotFoundException('Customer not found');
    }
    const customer = await this.customerUserRepo.findById(user._id);
    if (!customer) {
      throw new NotFoundException('Customer user not found');
    }
    const wallet = await this.walletRepo.findOne({ filter: { userId: customer._id } });
    const obj = customer.toObject ? customer.toObject() : { ...customer };
    return {
      ...obj,
      walletBalance: wallet?.balance ?? 0,
    };
  }

  async updateCustomerUser(id: string, body: UpdateCustomerUserDto, avatar?: Express.Multer.File): Promise<any> {
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
    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.statusUpdatedAt = new Date();
    }
    if (body.statusReason !== undefined) {
      updateData.statusReason = body.statusReason;
    }

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

    // Trigger push notification, auto-cancellation of upcoming bookings, and real-time socket event if status changed
    if (body.status && body.status !== customer.status) {
      if (body.status === CustomerStatusEnum.suspended) {
        // Automatically cancel all upcoming bookings and process tiered refund
        try {
          await this.bookingService.cancelUpcomingBookingsForSuspendedUser(
            objectId,
            body.statusReason || '',
          );
        } catch (cancelErr) {
          // Log error but continue with user suspension
          console.error('[UserService] Auto-cancellation of upcoming bookings failed:', cancelErr);
        }

        this.pushService.sendToCustomer(objectId, 'USER_SUSPENDED', {
          userName: updatedCustomer.userName || 'User',
          reason: body.statusReason || '',
        }).catch(() => {});
      } else if (body.status === CustomerStatusEnum.hold) {
        this.pushService.sendToCustomer(objectId, 'USER_ON_HOLD', {
          userName: updatedCustomer.userName || 'User',
          reason: body.statusReason || '',
        }).catch(() => {});
      } else if (body.status === CustomerStatusEnum.active) {
        this.pushService.sendToCustomer(objectId, 'USER_ACTIVE', {
          userName: updatedCustomer.userName || 'User',
        }).catch(() => {});
      }

      // Real-time WebSocket emission to mobile app
      this.bookingGateway.emitUserStatusUpdated(objectId.toString(), {
        status: updatedCustomer.status,
        statusReason: updatedCustomer.statusReason || body.statusReason || '',
      });
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

  async registerGuestPushToken(dto: RegisterPushTokenDto) {
    if (!dto.token) {
      throw new BadRequestException('Token is required');
    }
    const success = await this.pushService.registerGuestPushToken(
      dto.token,
      dto.platform || 'unknown',
      dto.locale || 'ar',
    );
    return { success, message: 'Guest push token registered successfully' };
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
