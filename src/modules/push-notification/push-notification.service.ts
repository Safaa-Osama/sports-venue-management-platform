import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CustomerUser,
  CustomerUserDocument,
} from 'src/modules/user/entities/customer-user.entity';
import {
  AdminUser,
  AdminUserDocument,
} from 'src/modules/user/entities/admin-user.entity';
import { User, UserDocument } from 'src/modules/user/entities/user.entity';
import {
  GuestDevice,
  GuestDeviceDocument,
} from './entities/guest-device.entity';
import {
  NotificationEventType,
  renderTemplate,
} from './push-templates';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidCredentials' | string;
    [key: string]: any;
  };
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(
    @InjectModel(CustomerUser.name)
    private readonly customerUserModel: Model<CustomerUserDocument>,
    @InjectModel(AdminUser.name)
    private readonly adminUserModel: Model<AdminUserDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(GuestDevice.name)
    private readonly guestDeviceModel: Model<GuestDeviceDocument>,
  ) {}

  /**
   * Register an anonymous/guest device push token before login
   */
  async registerGuestPushToken(
    token: string,
    platform: string = 'unknown',
    locale: string = 'ar',
  ): Promise<boolean> {
    if (!token) return false;
    try {
      await this.guestDeviceModel.findOneAndUpdate(
        { token },
        {
          token,
          platform,
          locale: locale?.toLowerCase().startsWith('en') ? 'en' : 'ar',
          lastSeenAt: new Date(),
        },
        { upsert: true, returnDocument: 'after' },
      );
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to register guest push token: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Register or update a push token for an authenticated user
   */
  async registerPushToken(
    userId: string | Types.ObjectId,
    token: string,
    platform: string = 'unknown',
    locale?: string,
  ): Promise<boolean> {
    if (!token || !userId) return false;

    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    // Prune from guest devices collection since token is now linked to an account
    this.guestDeviceModel.deleteOne({ token }).catch(() => {});

    const updateOperations = {
      $pull: { pushTokens: { token } },
    };

    const pushOperation = {
      $push: {
        pushTokens: {
          token,
          platform,
          updatedAt: new Date(),
        },
      },
      ...(locale ? { $set: { locale: locale?.toLowerCase().startsWith('en') ? 'en' : 'ar' } } : {}),
    };

    // Try CustomerUser first
    const customer = await this.customerUserModel.findById(objectId);
    if (customer) {
      await this.customerUserModel.findByIdAndUpdate(objectId, updateOperations);
      await this.customerUserModel.findByIdAndUpdate(objectId, pushOperation);
      return true;
    }

    // Try AdminUser
    const admin = await this.adminUserModel.findById(objectId);
    if (admin) {
      await this.adminUserModel.findByIdAndUpdate(objectId, updateOperations);
      await this.adminUserModel.findByIdAndUpdate(objectId, pushOperation);
      return true;
    }

    // Fallback to User
    const genericUser = await this.userModel.findById(objectId);
    if (genericUser) {
      await this.userModel.findByIdAndUpdate(objectId, updateOperations);
      await this.userModel.findByIdAndUpdate(objectId, pushOperation);
      return true;
    }

    return false;
  }

  /**
   * Remove a push token from a user (e.g. on logout)
   */
  async removePushToken(
    userId: string | Types.ObjectId,
    token: string,
  ): Promise<boolean> {
    if (!token || !userId) return false;
    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    await Promise.all([
      this.customerUserModel.findByIdAndUpdate(objectId, {
        $pull: { pushTokens: { token } },
      }),
      this.adminUserModel.findByIdAndUpdate(objectId, {
        $pull: { pushTokens: { token } },
      }),
      this.userModel.findByIdAndUpdate(objectId, {
        $pull: { pushTokens: { token } },
      }),
      this.guestDeviceModel.deleteOne({ token }),
    ]);

    return true;
  }

  /**
   * Prune a dead token across all collections (e.g. DeviceNotRegistered)
   */
  async pruneInvalidToken(token: string): Promise<void> {
    if (!token) return;
    this.logger.warn(`Pruning invalid/unregistered push token: ${token}`);
    await Promise.all([
      this.customerUserModel.updateMany(
        { 'pushTokens.token': token },
        { $pull: { pushTokens: { token } } },
      ),
      this.adminUserModel.updateMany(
        { 'pushTokens.token': token },
        { $pull: { pushTokens: { token } } },
      ),
      this.userModel.updateMany(
        { 'pushTokens.token': token },
        { $pull: { pushTokens: { token } } },
      ),
      this.guestDeviceModel.deleteOne({ token }),
    ]);
  }

  /**
   * Send notification to a customer user
   */
  async sendToCustomer(
    customerId: string | Types.ObjectId,
    eventType: NotificationEventType,
    params: Record<string, string | number> = {},
    dataPayload: Record<string, any> = {},
  ): Promise<void> {
    const objectId = typeof customerId === 'string' ? new Types.ObjectId(customerId) : customerId;
    const customer = await this.customerUserModel.findById(objectId);
    if (!customer || !customer.pushTokens || customer.pushTokens.length === 0) {
      return;
    }

    const locale = (customer as any).locale || 'ar';
    const { title, body } = renderTemplate(eventType, locale, params);

    const messages: ExpoPushMessage[] = customer.pushTokens.map((pt) => ({
      to: pt.token,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      priority: 'high',
      data: {
        eventType,
        ...dataPayload,
      },
    }));

    await this.sendPushBatch(messages);
  }

  /**
   * Send notification to an admin / pitch host
   */
  async sendToAdmin(
    adminId: string | Types.ObjectId,
    eventType: NotificationEventType,
    params: Record<string, string | number> = {},
    dataPayload: Record<string, any> = {},
  ): Promise<void> {
    const objectId = typeof adminId === 'string' ? new Types.ObjectId(adminId) : adminId;
    const admin = await this.adminUserModel.findById(objectId);
    if (!admin || !admin.pushTokens || admin.pushTokens.length === 0) {
      return;
    }

    const locale = (admin as any).locale || 'ar';
    const { title, body } = renderTemplate(eventType, locale, params);

    const messages: ExpoPushMessage[] = admin.pushTokens.map((pt) => ({
      to: pt.token,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      priority: 'high',
      data: {
        eventType,
        ...dataPayload,
      },
    }));

    await this.sendPushBatch(messages);
  }

  /**
   * Broadcast a notification to all devices (active registered customers + guest devices)
   * (e.g. promo added, discounts, pitch reopened)
   */
  async broadcastToAllCustomers(
    eventType: NotificationEventType,
    params: Record<string, string | number> = {},
    dataPayload: Record<string, any> = {},
  ): Promise<void> {
    const [customers, guestDevices] = await Promise.all([
      this.customerUserModel.find(
        { 'pushTokens.0': { $exists: true } },
        { pushTokens: 1, locale: 1 },
      ),
      this.guestDeviceModel.find({}, { token: 1, locale: 1 }),
    ]);

    const messages: ExpoPushMessage[] = [];
    const seenTokens = new Set<string>();

    // 1. Process customer push tokens
    for (const customer of customers) {
      const locale = (customer as any).locale || 'ar';
      const { title, body } = renderTemplate(eventType, locale, params);

      for (const pt of customer.pushTokens) {
        if (pt.token && !seenTokens.has(pt.token)) {
          seenTokens.add(pt.token);
          messages.push({
            to: pt.token,
            title,
            body,
            sound: 'default',
            channelId: 'default',
            priority: 'default',
            data: {
              eventType,
              ...dataPayload,
            },
          });
        }
      }
    }

    // 2. Process guest device push tokens
    for (const guest of guestDevices) {
      if (guest.token && !seenTokens.has(guest.token)) {
        seenTokens.add(guest.token);
        const locale = guest.locale || 'ar';
        const { title, body } = renderTemplate(eventType, locale, params);

        messages.push({
          to: guest.token,
          title,
          body,
          sound: 'default',
          channelId: 'default',
          priority: 'default',
          data: {
            eventType,
            ...dataPayload,
          },
        });
      }
    }

    if (messages.length > 0) {
      await this.sendPushBatch(messages);
    }
  }

  /**
   * Chunk messages into chunks of 100 and dispatch to Expo Push API
   */
  private async sendPushBatch(messages: ExpoPushMessage[]): Promise<void> {
    if (!messages || messages.length === 0) return;

    // Filter valid tokens (must start with ExponentPushToken or ExpoPushToken)
    const validMessages = messages.filter((m) =>
      m.to && (m.to.startsWith('ExponentPushToken') || m.to.startsWith('ExpoPushToken')),
    );

    if (validMessages.length === 0) return;

    const chunkSize = 100;
    for (let i = 0; i < validMessages.length; i += chunkSize) {
      const chunk = validMessages.slice(i, i + chunkSize);
      await this.dispatchChunk(chunk);
    }
  }

  private async dispatchChunk(chunk: ExpoPushMessage[]): Promise<void> {
    try {
      const response = await fetch(this.expoPushUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Expo Push API HTTP error ${response.status}: ${errText}`);
        return;
      }

      const result = await response.json();
      const tickets: ExpoPushTicket[] = result.data || [];

      // Inspect receipts for DeviceNotRegistered or errors
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          const sentMessage = chunk[idx];
          this.logger.warn(
            `Push error for token ${sentMessage?.to}: ${ticket.message} [${ticket.details?.error}]`,
          );

          if (ticket.details?.error === 'DeviceNotRegistered' && sentMessage?.to) {
            // Auto prune invalid token asynchronously
            this.pruneInvalidToken(sentMessage.to).catch((err) =>
              this.logger.error(`Failed to prune token ${sentMessage.to}:`, err),
            );
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to send push notification chunk to Expo:', error);
    }
  }
}
