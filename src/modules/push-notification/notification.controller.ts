import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { TokenService } from 'src/common/services/token/tokenService';
import { PushNotificationService } from './push-notification.service';
import {
  AdminSendNotificationDto,
  QueryAdminNotificationHistoryDto,
  QueryNotificationDto,
} from './dto/admin-send-notification.dto';

@Controller('notification')
export class NotificationController {
  constructor(
    private readonly pushNotificationService: PushNotificationService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Helper to safely extract user if an authorization header is present without throwing for guests
   */
  private async extractUser(req: any): Promise<any | null> {
    const authHeader = req?.headers?.authorization;
    if (!authHeader) return null;
    const [prefix, token] = authHeader.split(' ');
    if (prefix !== 'Bearer' || !token) return null;
    try {
      const { user } = await this.tokenService.authenticateToken_fetchUser(token);
      return user || null;
    } catch {
      return null;
    }
  }

  private parseGuestIds(param?: string): string[] {
    if (!param) return [];
    try {
      if (param.startsWith('[')) {
        return JSON.parse(param);
      }
      return param
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC / CUSTOMER / GUEST ENDPOINTS
  // ---------------------------------------------------------------------------

  /**
   * Retrieve all in-app notifications (read & unread) for current customer or guest device
   */
  @Get()
  async getNotifications(
    @Req() req: any,
    @Query() query: QueryNotificationDto,
    @Query('guestReadIds') queryGuestReadIds?: string,
    @Query('guestDeletedIds') queryGuestDeletedIds?: string,
    @Headers('x-guest-read-ids') headerGuestReadIds?: string,
    @Headers('x-guest-deleted-ids') headerGuestDeletedIds?: string,
  ) {
    const user = await this.extractUser(req);
    const guestReadIds = this.parseGuestIds(
      query?.guestReadIds || queryGuestReadIds || headerGuestReadIds,
    );
    const guestDeletedIds = this.parseGuestIds(
      query?.guestDeletedIds || queryGuestDeletedIds || headerGuestDeletedIds,
    );
    return this.pushNotificationService.getNotificationsForUser(
      user,
      query,
      guestReadIds,
      guestDeletedIds,
    );
  }

  /**
   * Fast unread notification count query for header badge
   */
  @Get('unread-count')
  async getUnreadCount(
    @Req() req: any,
    @Query('guestReadIds') queryGuestReadIds?: string,
    @Query('guestDeletedIds') queryGuestDeletedIds?: string,
    @Headers('x-guest-read-ids') headerGuestReadIds?: string,
    @Headers('x-guest-deleted-ids') headerGuestDeletedIds?: string,
  ) {
    const user = await this.extractUser(req);
    const guestReadIds = this.parseGuestIds(queryGuestReadIds || headerGuestReadIds);
    const guestDeletedIds = this.parseGuestIds(queryGuestDeletedIds || headerGuestDeletedIds);
    const unreadCount = await this.pushNotificationService.getUnreadCount(
      user,
      guestReadIds,
      guestDeletedIds,
    );
    return { unreadCount };
  }

  /**
   * Mark a single notification as read
   */
  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const user = await this.extractUser(req);
    await this.pushNotificationService.markAsRead(id, user);
    return { success: true, message: 'Notification marked as read' };
  }

  /**
   * Mark all visible notifications as read
   */
  @Patch('read-all')
  async markAllAsRead(@Req() req: any) {
    const user = await this.extractUser(req);
    await this.pushNotificationService.markAllAsRead(user);
    return { success: true, message: 'All notifications marked as read' };
  }

  /**
   * Dismiss or delete a notification
   */
  @Delete(':id')
  async deleteNotification(@Req() req: any, @Param('id') id: string) {
    const user = await this.extractUser(req);
    await this.pushNotificationService.deleteNotification(id, user);
    return { success: true, message: 'Notification deleted' };
  }

  // ---------------------------------------------------------------------------
  // ADMIN MANAGEMENT ENDPOINTS
  // ---------------------------------------------------------------------------

  /**
   * Admin: Compose and dispatch notification to All / Guests / Customers / Selected Customer(s)
   */
  @Post('admin/send')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async sendAdminNotification(
    @Body() dto: AdminSendNotificationDto,
    @User() admin: any,
  ) {
    return this.pushNotificationService.sendAdminNotification(dto, admin?._id);
  }

  /**
   * Admin: Sent notifications history filtered by date range and audience
   */
  @Get('admin/history')
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
    ],
  })
  async getAdminHistory(@Query() query: QueryAdminNotificationHistoryDto) {
    return this.pushNotificationService.getAdminHistory(query);
  }
}
