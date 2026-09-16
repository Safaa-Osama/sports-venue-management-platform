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
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(_client: Socket) {}

  handleDisconnect(_client: Socket) {}

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

  /**
   * Broadcast a notification event to all connected clients (customers + guests)
   */
  emitGlobalNotification(notification: any) {
    if (this.server) {
      this.server.emit('notification_new', {
        notification,
        isGlobal: true,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Send a targeted notification event to a specific user's room
   */
  emitUserNotification(userId: string, notification: any) {
    if (this.server) {
      const userRoom = `user_${userId}`;
      this.server.to(userRoom).emit('notification_new', {
        notification,
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
