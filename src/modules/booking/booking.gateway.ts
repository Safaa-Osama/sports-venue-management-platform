import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class BookingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(_client: Socket) {}

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('join_venue')
  handleJoinVenue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { venueId: string },
  ) {
    if (data && data.venueId) {
      client.join(`venue_${data.venueId}`);
      return { event: 'joined_venue', venueId: data.venueId };
    }
  }

  @SubscribeMessage('leave_venue')
  handleLeaveVenue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { venueId: string },
  ) {
    if (data && data.venueId) {
      client.leave(`venue_${data.venueId}`);
      return { event: 'left_venue', venueId: data.venueId };
    }
  }

  emitSlotLocked(booking: any) {
    const venueIdStr = booking.venueId?.toString();
    const venueRoom = `venue_${venueIdStr}`;
    this.server.to(venueRoom).emit('slot_locked', {
      bookingId: booking._id?.toString(),
      venueId: venueIdStr,
      userId: booking.userId?._id?.toString() || booking.userId?.toString(),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      expiresAt: booking.expiresAt,
    });
  }

  emitSlotReleased(booking: any) {
    const venueIdStr = booking.venueId?.toString();
    const venueRoom = `venue_${venueIdStr}`;
    this.server.to(venueRoom).emit('slot_released', {
      bookingId: booking._id?.toString(),
      venueId: venueIdStr,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
  }

  emitBookingConfirmed(booking: any) {
    const venueIdStr = booking.venueId?.toString();
    const venueRoom = `venue_${venueIdStr}`;
    const payload = {
      bookingId: booking._id?.toString(),
      _id: booking._id?.toString(),
      groupId: booking.groupId,
      venueId: venueIdStr,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    };
    if (this.server) {
      this.server.to(venueRoom).emit('booking_confirmed', payload);
      this.server.emit('booking_confirmed', payload);
    }
  }

  @SubscribeMessage('join_user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    if (data && data.userId) {
      client.join(`user_${data.userId}`);
      return { event: 'joined_user', userId: data.userId };
    }
  }

  @SubscribeMessage('leave_user')
  handleLeaveUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    if (data && data.userId) {
      client.leave(`user_${data.userId}`);
      return { event: 'left_user', userId: data.userId };
    }
  }

  emitWalletUpdated(userId: string, data: { balance: number; reason?: string; bookingId?: string }) {
    const userIdStr = userId?.toString();
    const userRoom = `user_${userIdStr}`;
    const payload = {
      userId: userIdStr,
      balance: data.balance,
      reason: data.reason || 'Wallet updated',
      bookingId: data.bookingId,
      timestamp: new Date().toISOString(),
    };
    if (this.server) {
      this.server.to(userRoom).emit('wallet_updated', payload);
      this.server.emit(`user_wallet_${userIdStr}`, payload);
      this.server.emit('wallet_updated', payload);
    }
  }

  emitBookingCancelled(booking: any, refundAmount?: number) {
    const venueIdStr = booking.venueId?.toString();
    const userIdStr = booking.userId?._id?.toString() || booking.userId?.toString();
    const venueRoom = `venue_${venueIdStr}`;
    const userRoom = `user_${userIdStr}`;
    const payload = {
      bookingId: booking._id?.toString(),
      _id: booking._id?.toString(),
      venueId: venueIdStr,
      userId: userIdStr,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      refundAmount,
      timestamp: new Date().toISOString(),
    };
    if (this.server) {
      this.server.to(venueRoom).emit('booking_cancelled', payload);
      this.server.to(userRoom).emit('booking_cancelled', payload);
      this.server.emit(`user_booking_cancelled_${userIdStr}`, payload);
      this.server.emit('booking_cancelled', payload);
    }
  }

  emitOwnerNotification(ownerId: string, booking: any, eventType: string) {
    this.server.emit(`owner_${ownerId}`, {
      eventType,
      booking,
    });
  }

  emitAdvertisementsUpdated(action?: string, adId?: string) {
    if (this.server) {
      this.server.emit('advertisements_updated', {
        action: action || 'refresh',
        adId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  emitUserStatusUpdated(userId: string, data: { status: string; statusReason?: string }) {
    const userIdStr = userId?.toString();
    const userRoom = `user_${userIdStr}`;
    const payload = {
      userId: userIdStr,
      status: data.status,
      statusReason: data.statusReason || '',
      timestamp: new Date().toISOString(),
    };
    if (this.server) {
      this.server.to(userRoom).emit('user_status_updated', payload);
      this.server.emit(`user_status_${userIdStr}`, payload);
      this.server.emit('user_status_updated', payload);
    }
  }
}

