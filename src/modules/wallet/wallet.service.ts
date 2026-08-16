import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ClientSession, Types } from 'mongoose';
import { RoleEnum } from 'src/common/enums/userEnum';
import {
  TransactionStatusEnum,
  TransactionTypeEnum,
} from 'src/common/enums/walletEnum';
import { WalletRepo } from 'src/common/reposetories/wallet-repo';
import { WalletTransactionRepo } from 'src/common/reposetories/wallet-transaction-repo';
import { AdminUserDocument } from '../user/entities/admin-user.entity';
import type { UserDocument } from '../user/entities/user.entity';
import {
  AdminDeductWalletDto,
  CreateWalletDto,
  DepositWalletDto,
  GetTransactionsDto,
  UserDeductWalletDto,
} from './dto/wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepo,
    private readonly walletTransactionRepo: WalletTransactionRepo,
  ) {}

  private generateReceiptNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const uuid = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

    return `TXN-${dateStr}-${uuid}`;
  }

  async getOrCreateWallet(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ) {
    const userObjId =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    let wallet = await this.walletRepo.findOne({
      filter: { userId },
      options: { session },
    });

    if (!wallet) {
      wallet = await this.walletRepo.create(
        {
          userId: userObjId,
          balance: 0,
        },
        { session },
      );
    }
    return wallet;
  }

  async getWalletByUserId(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const wallet = await this.getOrCreateWallet(userId);
    return wallet;
  }

  async createWallet(body: CreateWalletDto) {
    if (!Types.ObjectId.isValid(body.userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const existing = await this.walletRepo.findOne({
      filter: { userId: body.userId },
    });
    if (existing) {
      throw new ConflictException('Wallet already exists for this user');
    }
    const wallet = await this.walletRepo.create({
      userId: new Types.ObjectId(body.userId),
      balance: 0,
    });

    return wallet;
  }

  async deposit(
    dto: DepositWalletDto,
    type: TransactionTypeEnum = TransactionTypeEnum.DEPOSIT,
    user?: UserDocument,
    session?: ClientSession,
  ) {
    const { amount } = dto;
    const targetUserId = user?._id || dto.userId;
    if (!targetUserId) {
      throw new BadRequestException('User ID is required for deposit');
    }
    const wallet = await this.getOrCreateWallet(targetUserId, session);
    const balanceBefore = wallet.balance;

    const updatedWallet = await this.walletRepo.findOneAndUpdate({
      filter: { _id: wallet._id },
      update: { $inc: { balance: amount } },
      options: { session, new: true, returnDocument: 'after' },
    });

    if (!updatedWallet) {
      throw new BadRequestException('Failed to update wallet balance');
    }

    const receiptNumber = this.generateReceiptNumber();
    const transaction = await this.walletTransactionRepo.create(
      {
        walletId: updatedWallet._id,
        type,
        status: TransactionStatusEnum.SUCCESS,
        amount,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        receiptNumber,
        referenceId: dto.referenceId,
        description: dto.description || 'Wallet deposit top-up',
      },
      { session },
    );

    return { updatedWallet, transaction };
  }

  async processDeduction(
    targetUserId: string | Types.ObjectId,
    amount: number,
    type: TransactionTypeEnum,
    description?: string,
    referenceId?: string,
    deductBy?: Types.ObjectId,
    session?: ClientSession,
  ) {
    const userObjId =
      typeof targetUserId === 'string'
        ? new Types.ObjectId(targetUserId)
        : targetUserId;

    const wallet = await this.getOrCreateWallet(userObjId, session);

    if (wallet.balance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ${amount}, Available: ${wallet.balance}`,
      );
    }

    const balanceBefore = wallet.balance;

    const updatedWallet = await this.walletRepo.findOneAndUpdate({
      filter: { _id: wallet._id, balance: { $gte: amount } },
      update: { $inc: { balance: -amount } },
      options: { session, new: true, returnDocument: 'after' },
    });

    if (!updatedWallet) {
      throw new BadRequestException(
        'Insufficient wallet balance or concurrent transaction update failure',
      );
    }

    const receiptNumber = this.generateReceiptNumber();
    let transaction: any;
    try {
      transaction = await this.walletTransactionRepo.create(
        {
          walletId: updatedWallet._id,
          type,
          status: TransactionStatusEnum.SUCCESS,
          amount,
          balanceBefore,
          balanceAfter: updatedWallet.balance,
          receiptNumber,
          referenceId,
          description: description || 'Wallet deduction',
        },
        { session },
      );
    } catch (txnErr) {
      if (!session) {
        // Compensating rollback when not running inside a native replica set session
        await this.walletRepo.findOneAndUpdate({
          filter: { _id: updatedWallet._id },
          update: { $inc: { balance: amount } },
        });
      }
      throw txnErr;
    }

    return { updatedWallet, transaction };
  }

  async deductSelf(dto: UserDeductWalletDto, user: UserDocument) {
    const { amount } = dto;
    const result = await this.processDeduction(
      user._id,
      amount,
      TransactionTypeEnum.DEDUCTION,
      dto.description || 'User wallet self-deduction',
      dto.referenceId,
    );

    return result;
  }

  async deductAdmin(dto: AdminDeductWalletDto, user: AdminUserDocument) {
    if (!Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Invalid target user ID');
    }

    const result = await this.processDeduction(
      dto.userId,
      dto.amount,
      TransactionTypeEnum.DEDUCTION,
      dto.description,
      dto.referenceId,
      user._id,
    );

    return result;
  }

  async payForBooking(
    userId: string | Types.ObjectId,
    amount: number,
    bookingId: string,
    session?: ClientSession,
  ) {
    return this.processDeduction(
      userId,
      amount,
      TransactionTypeEnum.BOOKING_PAYMENT,
      `Payment for booking #${bookingId}`,
      bookingId,
      undefined,
      session,
    );
  }

  async refundBooking(
    userId: string | Types.ObjectId,
    amount: number,
    bookingId: string,
    user?: UserDocument,
    session?: ClientSession,
  ) {
    return this.deposit(
      {
        userId: userId.toString(),
        amount,
        description: `Refund for booking cancellation #${bookingId}`,
        referenceId: bookingId,
      },
      TransactionTypeEnum.BOOKING_REFUND,
      user,
      session,
    );
  }

  async getTransactions(queryDto: GetTransactionsDto, user: UserDocument) {
    const search: any = {};

    if (user.role !== RoleEnum.admin && user.role !== RoleEnum.superAdmin) {
      search.userId = new Types.ObjectId(user._id as any);
    } else if (queryDto.userId) {
      if (!Types.ObjectId.isValid(queryDto.userId)) {
        throw new BadRequestException('Invalid user ID filter');
      }
      search.userId = new Types.ObjectId(queryDto.userId);
    }

    if (queryDto.type) {
      search.type = queryDto.type;
    }

    if (queryDto.startDate || queryDto.endDate) {
      search.createdAt = {};
      if (queryDto.startDate) {
        search.createdAt.$gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        search.createdAt.$lte = new Date(queryDto.endDate);
      }
    }

    const result = await this.walletTransactionRepo.paginate({
      page: queryDto.page,
      limit: queryDto.limit,
      search,
      sort: { createdAt: -1 },
    });

    return {
      message: 'Transactions retrieved successfully',
      ...result,
    };
  }
}
