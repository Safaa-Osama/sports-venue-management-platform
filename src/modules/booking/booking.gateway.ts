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

  handleConnection(client: Socket) {
    console.log(`Client connected to booking gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected from booking gateway: ${client.id}`);
  }

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
    const venueRoom = `venue_${booking.venueId}`;
    this.server.to(venueRoom).emit('slot_locked', {
      bookingId: booking._id,
      venueId: booking.venueId,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      expiresAt: booking.expiresAt,
    });
  }

  emitSlotReleased(booking: any) {
    const venueRoom = `venue_${booking.venueId}`;
    this.server.to(venueRoom).emit('slot_released', {
      bookingId: booking._id,
      venueId: booking.venueId,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
  }

  emitBookingConfirmed(booking: any) {
    const venueRoom = `venue_${booking.venueId}`;
    this.server.to(venueRoom).emit('booking_confirmed', {
      bookingId: booking._id,
      venueId: booking.venueId,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
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
}

