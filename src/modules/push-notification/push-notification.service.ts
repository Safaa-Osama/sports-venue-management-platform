import { Injectable, Logger, Optional } from '@nestjs/common';
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
  Notification,
  NotificationDocument,
  NotificationTargetType,
} from './entities/notification.entity';
import {
  NotificationEventType,
  renderTemplate,
} from './push-templates';
import { NotificationGateway } from './notification.gateway';
import {
  AdminSendNotificationDto,
  QueryAdminNotificationHistoryDto,
  QueryNotificationDto,
} from './dto/admin-send-notification.dto';

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
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @Optional()
    private readonly notificationGateway?: NotificationGateway,
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
   * Send notification to a customer user (Stores in-app Notification + Dispatches Push + Emits Socket)
   */
  async sendToCustomer(
    customerId: string | Types.ObjectId,
    eventType: NotificationEventType,
    params: Record<string, string | number> = {},
    dataPayload: Record<string, any> = {},
  ): Promise<void> {
    const objectId = typeof customerId === 'string' ? new Types.ObjectId(customerId) : customerId;

    // 1. Render both localized strings for DB persistence
    const arContent = renderTemplate(eventType, 'ar', params);
    const enContent = renderTemplate(eventType, 'en', params);

    // 2. Persist in-app Notification document
    let createdNotification: NotificationDocument | null = null;
    try {
      createdNotification = await this.notificationModel.create({
        title: { ar: arContent.title, en: enContent.title },
        body: { ar: arContent.body, en: enContent.body },
        eventType,
        targetType: 'specific_users',
        recipientUserIds: [objectId],
        data: dataPayload,
        readBy: [],
        deletedBy: [],
      });
    } catch (err: any) {
      this.logger.error(`Failed to persist in-app notification: ${err?.message || err}`);
    }

    // 3. Emit real-time WebSocket event
    if (this.notificationGateway && createdNotification) {
      this.notificationGateway.emitUserNotification(objectId.toString(), createdNotification);
    }

    // 4. Dispatch mobile push notification if user has registered device tokens
    const customer = await this.customerUserModel.findById(objectId);
    if (!customer || !customer.pushTokens || customer.pushTokens.length === 0) {
      return;
    }

    const locale = (customer as any).locale || 'ar';
    const activeContent = locale?.toLowerCase().startsWith('en') ? enContent : arContent;

    const messages: ExpoPushMessage[] = customer.pushTokens.map((pt) => ({
      to: pt.token,
      title: activeContent.title,
      body: activeContent.body,
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
    const arContent = renderTemplate(eventType, 'ar', params);
    const enContent = renderTemplate(eventType, 'en', params);

    // 1. Persist broadcast in-app Notification document
    let createdNotification: NotificationDocument | null = null;
    try {
      createdNotification = await this.notificationModel.create({
        title: { ar: arContent.title, en: enContent.title },
        body: { ar: arContent.body, en: enContent.body },
        eventType,
        targetType: 'all',
        data: dataPayload,
        readBy: [],
        deletedBy: [],
      });
    } catch (err: any) {
      this.logger.error(`Failed to persist broadcast notification: ${err?.message || err}`);
    }

    // 2. Emit real-time WebSocket event globally
    if (this.notificationGateway && createdNotification) {
      this.notificationGateway.emitGlobalNotification(createdNotification);
    }

    // 3. Dispatch push batches
    const [customers, guestDevices] = await Promise.all([
      this.customerUserModel.find(
        { 'pushTokens.0': { $exists: true } },
        { pushTokens: 1, locale: 1 },
      ),
      this.guestDeviceModel.find({}, { token: 1, locale: 1 }),
    ]);

    const messages: ExpoPushMessage[] = [];
    const seenTokens = new Set<string>();

    for (const customer of customers) {
      const isEn = (customer as any).locale?.toLowerCase().startsWith('en');
      const activeContent = isEn ? enContent : arContent;

      for (const pt of customer.pushTokens) {
        if (pt.token && !seenTokens.has(pt.token)) {
          seenTokens.add(pt.token);
          messages.push({
            to: pt.token,
            title: activeContent.title,
            body: activeContent.body,
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

    for (const guest of guestDevices) {
      if (guest.token && !seenTokens.has(guest.token)) {
        seenTokens.add(guest.token);
        const isEn = guest.locale?.toLowerCase().startsWith('en');
        const activeContent = isEn ? enContent : arContent;

        messages.push({
          to: guest.token,
          title: activeContent.title,
          body: activeContent.body,
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
   * Admin-composed custom notification dispatcher (All / Guests / Customers / Specific Users)
   */
  async sendAdminNotification(
    dto: AdminSendNotificationDto,
    adminUserId?: string,
  ): Promise<{ success: boolean; notification: NotificationDocument; pushedCount: number }> {
    const titleAr = dto.titleAr.trim();
    const titleEn = (dto.titleEn || dto.titleAr).trim();
    const bodyAr = dto.bodyAr.trim();
    const bodyEn = (dto.bodyEn || dto.bodyAr).trim();

    // Resolve route from deepLinkType
    let resolvedRoute = dto.customRoute;
    if (!resolvedRoute) {
      if (dto.deepLinkType === 'pitch' && dto.venueId) {
        resolvedRoute = `/pitch/${dto.venueId}`;
      } else if (dto.deepLinkType === 'bookings') {
        resolvedRoute = `/(tabs)/bookings`;
      } else if (dto.deepLinkType === 'profile') {
        resolvedRoute = `/(tabs)/profile`;
      } else if (dto.deepLinkType === 'promo') {
        resolvedRoute = `/`;
      }
    }

    const dataPayload = {
      eventType: 'ADMIN_BROADCAST',
      route: resolvedRoute,
      venueId: dto.venueId,
      deepLinkType: dto.deepLinkType || 'none',
    };

    const targetType: NotificationTargetType =
      (dto.targetType as NotificationTargetType) || 'all';
    const recipientUserIds: Types.ObjectId[] = [];

    if (targetType === 'specific_users' && dto.customerIds && dto.customerIds.length > 0) {
      dto.customerIds.forEach((id) => {
        if (Types.ObjectId.isValid(id)) {
          recipientUserIds.push(new Types.ObjectId(id));
        }
      });
    }

    // 1. Create Notification document in MongoDB
    const notification = await this.notificationModel.create({
      title: { ar: titleAr, en: titleEn },
      body: { ar: bodyAr, en: bodyEn },
      eventType: 'ADMIN_BROADCAST',
      targetType,
      recipientUserIds,
      data: dataPayload,
      readBy: [],
      deletedBy: [],
      sentBy: adminUserId && Types.ObjectId.isValid(adminUserId) ? new Types.ObjectId(adminUserId) : undefined,
    });

    // 2. Emit WebSocket event
    if (this.notificationGateway) {
      if (targetType === 'specific_users') {
        recipientUserIds.forEach((uid) => {
          this.notificationGateway?.emitUserNotification(uid.toString(), notification);
        });
      } else {
        this.notificationGateway.emitGlobalNotification(notification);
      }
    }

    // 3. Collect push tokens according to target audience
    const messages: ExpoPushMessage[] = [];
    const seenTokens = new Set<string>();

    const addTokens = (
      tokens: { token: string; platform?: string }[],
      userLocale?: string,
    ) => {
      const isEn = userLocale?.toLowerCase().startsWith('en');
      const activeTitle = isEn ? titleEn : titleAr;
      const activeBody = isEn ? bodyEn : bodyAr;

      for (const pt of tokens || []) {
        if (pt.token && !seenTokens.has(pt.token)) {
          seenTokens.add(pt.token);
          messages.push({
            to: pt.token,
            title: activeTitle,
            body: activeBody,
            sound: 'default',
            channelId: 'default',
            priority: 'high',
            data: dataPayload,
          });
        }
      }
    };

    if (targetType === 'all' || targetType === 'customers') {
      const customerFilter: any = { 'pushTokens.0': { $exists: true } };
      const customers = await this.customerUserModel.find(customerFilter, { pushTokens: 1, locale: 1 });
      for (const c of customers) {
        addTokens(c.pushTokens, (c as any).locale);
      }
    } else if (targetType === 'specific_users' && recipientUserIds.length > 0) {
      const customers = await this.customerUserModel.find(
        { _id: { $in: recipientUserIds }, 'pushTokens.0': { $exists: true } },
        { pushTokens: 1, locale: 1 },
      );
      for (const c of customers) {
        addTokens(c.pushTokens, (c as any).locale);
      }
    }

    if (targetType === 'all' || targetType === 'guests') {
      const guestDevices = await this.guestDeviceModel.find({}, { token: 1, locale: 1 });
      for (const g of guestDevices) {
        addTokens([{ token: g.token }], g.locale);
      }
    }

    // 4. Send push batch
    if (messages.length > 0) {
      await this.sendPushBatch(messages);
    }

    return {
      success: true,
      notification,
      pushedCount: messages.length,
    };
  }

  /**
   * Fetch in-app notifications for authenticated user or guest
   */
  async getNotificationsForUser(
    user: { _id?: string } | null,
    query: QueryNotificationDto,
    guestReadIds: string[] = [],
    guestDeletedIds: string[] = [],
  ): Promise<{
    notifications: Array<{
      _id: string;
      title: { ar: string; en: string };
      body: { ar: string; en: string };
      eventType: string;
      targetType: string;
      data: Record<string, any>;
      isRead: boolean;
      createdAt: Date;
    }>;
    unreadCount: number;
    total: number;
  }> {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 50)));
    const skip = (page - 1) * limit;

    if (user && user._id && Types.ObjectId.isValid(user._id)) {
      const userId = new Types.ObjectId(user._id);

      const matchFilter: any = {
        $and: [
          {
            $or: [
              { targetType: 'all' },
              { targetType: 'customers' },
              { targetType: 'specific_users', recipientUserIds: userId },
            ],
          },
          { deletedBy: { $ne: userId } },
        ],
      };

      if (query.filter === 'unread') {
        matchFilter.$and.push({ readBy: { $ne: userId } });
      } else if (query.filter === 'read') {
        matchFilter.$and.push({ readBy: userId });
      }

      const [docs, total, unreadCount] = await Promise.all([
        this.notificationModel
          .find(matchFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.notificationModel.countDocuments(matchFilter),
        this.notificationModel.countDocuments({
          $and: [
            {
              $or: [
                { targetType: 'all' },
                { targetType: 'customers' },
                { targetType: 'specific_users', recipientUserIds: userId },
              ],
            },
            { deletedBy: { $ne: userId } },
            { readBy: { $ne: userId } },
          ],
        }),
      ]);

      const formatted = docs.map((doc: any) => ({
        _id: doc._id.toString(),
        title: doc.title,
        body: doc.body,
        eventType: doc.eventType,
        targetType: doc.targetType,
        data: doc.data || {},
        isRead: Array.isArray(doc.readBy) && doc.readBy.some((id: any) => id.toString() === userId.toString()),
        createdAt: doc.createdAt,
      }));

      return { notifications: formatted, unreadCount, total };
    } else {
      // Guest user — fetch broadcast notifications
      const guestDeletedObjectIds = (guestDeletedIds || [])
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      const matchFilter: any = {
        targetType: { $in: ['all', 'guests'] },
        ...(guestDeletedObjectIds.length > 0 ? { _id: { $nin: guestDeletedObjectIds } } : {}),
      };

      const docs = await this.notificationModel
        .find(matchFilter)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      let formatted = docs.map((doc: any) => ({
        _id: doc._id.toString(),
        title: doc.title,
        body: doc.body,
        eventType: doc.eventType,
        targetType: doc.targetType,
        data: doc.data || {},
        isRead: (guestReadIds || []).includes(doc._id.toString()),
        createdAt: doc.createdAt,
      }));

      if (query.filter === 'unread') {
        formatted = formatted.filter((n) => !n.isRead);
      } else if (query.filter === 'read') {
        formatted = formatted.filter((n) => n.isRead);
      }

      const total = formatted.length;
      const unreadCount = docs.filter((doc: any) => !(guestReadIds || []).includes(doc._id.toString())).length;
      const paginated = formatted.slice(skip, skip + limit);

      return { notifications: paginated, unreadCount, total };
    }
  }

  /**
   * Fast unread count query
   */
  async getUnreadCount(
    user: { _id?: string } | null,
    guestReadIds: string[] = [],
    guestDeletedIds: string[] = [],
  ): Promise<number> {
    if (user && user._id && Types.ObjectId.isValid(user._id)) {
      const userId = new Types.ObjectId(user._id);
      return await this.notificationModel.countDocuments({
        $and: [
          {
            $or: [
              { targetType: 'all' },
              { targetType: 'customers' },
              { targetType: 'specific_users', recipientUserIds: userId },
            ],
          },
          { deletedBy: { $ne: userId } },
          { readBy: { $ne: userId } },
        ],
      });
    } else {
      const guestDeletedObjectIds = (guestDeletedIds || [])
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      const docs = await this.notificationModel
        .find({
          targetType: { $in: ['all', 'guests'] },
          ...(guestDeletedObjectIds.length > 0 ? { _id: { $nin: guestDeletedObjectIds } } : {}),
        }, { _id: 1 })
        .lean();

      return docs.filter((doc: any) => !(guestReadIds || []).includes(doc._id.toString())).length;
    }
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, user: { _id?: string } | null): Promise<boolean> {
    if (!notificationId || !Types.ObjectId.isValid(notificationId)) return false;

    if (user && user._id && Types.ObjectId.isValid(user._id)) {
      const userId = new Types.ObjectId(user._id);
      await this.notificationModel.findByIdAndUpdate(notificationId, {
        $addToSet: { readBy: userId },
      });
      return true;
    }

    return true;
  }

  /**
   * Mark all applicable notifications as read
   */
  async markAllAsRead(user: { _id?: string } | null): Promise<boolean> {
    if (user && user._id && Types.ObjectId.isValid(user._id)) {
      const userId = new Types.ObjectId(user._id);
      await this.notificationModel.updateMany(
        {
          $and: [
            {
              $or: [
                { targetType: 'all' },
                { targetType: 'customers' },
                { targetType: 'specific_users', recipientUserIds: userId },
              ],
            },
            { deletedBy: { $ne: userId } },
          ],
        },
        {
          $addToSet: { readBy: userId },
        },
      );
      return true;
    }
    return true;
  }

  /**
   * Dismiss / delete notification for the user
   */
  async deleteNotification(notificationId: string, user: { _id?: string } | null): Promise<boolean> {
    if (!notificationId || !Types.ObjectId.isValid(notificationId)) return false;

    if (user && user._id && Types.ObjectId.isValid(user._id)) {
      const userId = new Types.ObjectId(user._id);
      await this.notificationModel.findByIdAndUpdate(notificationId, {
        $addToSet: { deletedBy: userId },
      });
      return true;
    }

    return true;
  }

  /**
   * Admin history query filtered by date range, targetType, or search text
   */
  async getAdminHistory(
    query: QueryAdminNotificationHistoryDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 50)));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.targetType && query.targetType !== 'all_targets') {
      filter.targetType = query.targetType;
    }

    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate && String(query.startDate).trim()) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          dateFilter.$gte = start;
        }
      }
      if (query.endDate && String(query.endDate).trim()) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          dateFilter.$lte = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        filter.createdAt = dateFilter;
      }
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { 'title.ar': { $regex: term, $options: 'i' } },
        { 'title.en': { $regex: term, $options: 'i' } },
        { 'body.ar': { $regex: term, $options: 'i' } },
        { 'body.en': { $regex: term, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sentBy', 'userName name email')
        .lean(),
      this.notificationModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
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
