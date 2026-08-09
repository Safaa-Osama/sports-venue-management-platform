import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TransactionStatusEnum, TransactionTypeEnum } from 'src/common/enums/walletEnum';
import { WalletRepo } from 'src/common/reposetories/wallet-repo';
import { WalletTransactionRepo } from 'src/common/reposetories/wallet-transaction-repo';
import {
  AdminDeductWalletDto,
  CreateWalletDto,
  DeductWalletDto,
  DepositWalletDto,
  GetTransactionsDto,
  UserDeductWalletDto,
} from './dto/wallet.dto';
import { WalletDocument } from './entities/wallet.entity';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepo,
    private readonly walletTransactionRepo: WalletTransactionRepo,
  ) {}

  private generateReceiptNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')
      .toUpperCase();
    return `TXN-${dateStr}-${randomHex}`;
  }

  async getOrCreateWallet(userId: string | Types.ObjectId): Promise<WalletDocument> {
    const userObjId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    let wallet = await this.walletRepo.findOne({ filter: { userId: userObjId } });

    if (!wallet) {
      wallet = await this.walletRepo.create({
        userId: userObjId,
        balance: 0,
      });
    }
    return wallet;
  }

  async getMyWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      message: 'Wallet retrieved successfully',
      data: wallet,
    };
  }

  async getWalletByUserId(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const wallet = await this.getOrCreateWallet(userId);
    return {
      message: 'User wallet retrieved successfully',
      data: wallet,
    };
  }

  async createWallet(dto: CreateWalletDto) {
    if (!Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const userObjId = new Types.ObjectId(dto.userId);
    const existing = await this.walletRepo.findOne({ filter: { userId: userObjId } });
    if (existing) {
      throw new ConflictException('Wallet already exists for this user');
    }

    const wallet = await this.walletRepo.create({
      userId: userObjId,
      balance: 0,
    });

    return {
      message: 'Wallet created successfully',
      data: wallet,
    };
  }

  async deposit(
    dto: DepositWalletDto,
    type: TransactionTypeEnum = TransactionTypeEnum.DEPOSIT,
  ) {
    if (!Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const wallet = await this.getOrCreateWallet(dto.userId);
    const balanceBefore = wallet.balance;

    const updatedWallet = await this.walletRepo.findOneAndUpdate({
      filter: { _id: wallet._id },
      update: { $inc: { balance: dto.amount } },
      options: { new: true },
    });

    if (!updatedWallet) {
      throw new BadRequestException('Failed to update wallet balance');
    }

    const receiptNumber = this.generateReceiptNumber();
    const transaction = await this.walletTransactionRepo.create({
      walletId: updatedWallet._id,
      userId: wallet.userId,
      type,
      status: TransactionStatusEnum.SUCCESS,
      amount: dto.amount,
      balanceBefore,
      balanceAfter: updatedWallet.balance,
      receiptNumber,
      referenceId: dto.referenceId,
      description: dto.description || 'Wallet deposit top-up',
    });

    return {
      message: 'Wallet deposit successful',
      data: {
        wallet: updatedWallet,
        transaction,
      },
    };
  }

  private async processDeduction(
    targetUserId: string | Types.ObjectId,
    amount: number,
    type: TransactionTypeEnum,
    description?: string,
    referenceId?: string,
  ) {
    const userObjId =
      typeof targetUserId === 'string' ? new Types.ObjectId(targetUserId) : targetUserId;

    const wallet = await this.getOrCreateWallet(userObjId);

    if (wallet.balance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ${amount}, Available: ${wallet.balance}`,
      );
    }

    const balanceBefore = wallet.balance;

    const updatedWallet = await this.walletRepo.findOneAndUpdate({
      filter: { _id: wallet._id, balance: { $gte: amount } },
      update: { $inc: { balance: -amount } },
      options: { new: true },
    });

    if (!updatedWallet) {
      throw new BadRequestException(
        'Insufficient wallet balance or concurrent transaction update failure',
      );
    }

    const receiptNumber = this.generateReceiptNumber();
    const transaction = await this.walletTransactionRepo.create({
      walletId: updatedWallet._id,
      userId: wallet.userId,
      type,
      status: TransactionStatusEnum.SUCCESS,
      amount,
      balanceBefore,
      balanceAfter: updatedWallet.balance,
      receiptNumber,
      referenceId,
      description: description || 'Wallet deduction',
    });

    return {
      wallet: updatedWallet,
      transaction,
    };
  }

  async deductSelf(dto: UserDeductWalletDto, currentUser: any) {
    const userId = currentUser._id || currentUser.id;
    const result = await this.processDeduction(
      userId,
      dto.amount,
      TransactionTypeEnum.DEDUCTION,
      dto.description || 'User wallet self-deduction',
      dto.referenceId,
    );

    return {
      message: 'Wallet deduction successful',
      data: result,
    };
  }

  async deductAdmin(dto: AdminDeductWalletDto) {
    if (!Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Invalid target user ID');
    }

    const result = await this.processDeduction(
      dto.userId,
      dto.amount,
      TransactionTypeEnum.DEDUCTION,
      dto.description,
      dto.referenceId,
    );

    return {
      message: 'Admin wallet deduction successful',
      data: result,
    };
  }

  // Legacy fallback method for backwards compatibility
  async deduct(dto: DeductWalletDto, currentUser: any) {
    const targetUserId = dto.userId || currentUser._id || currentUser.id;
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid target user ID');
    }

    const result = await this.processDeduction(
      targetUserId,
      dto.amount,
      TransactionTypeEnum.DEDUCTION,
      dto.description || 'Wallet deduction',
      dto.referenceId,
    );

    return {
      message: 'Wallet deduction successful',
      data: result,
    };
  }

  async payForBooking(userId: string | Types.ObjectId, amount: number, bookingId: string) {
    return this.processDeduction(
      userId,
      amount,
      TransactionTypeEnum.BOOKING_PAYMENT,
      `Payment for booking #${bookingId}`,
      bookingId,
    );
  }

  async refundBooking(userId: string | Types.ObjectId, amount: number, bookingId: string) {
    return this.deposit(
      {
        userId: userId.toString(),
        amount,
        description: `Refund for booking cancellation #${bookingId}`,
        referenceId: bookingId,
      },
      TransactionTypeEnum.BOOKING_REFUND,
    );
  }

  async getMyTransactions(userId: string, queryDto: GetTransactionsDto) {
    return this.getTransactions({ ...queryDto, userId });
  }

  async getTransactions(queryDto: GetTransactionsDto) {
    const search: any = {};

    if (queryDto.userId) {
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
