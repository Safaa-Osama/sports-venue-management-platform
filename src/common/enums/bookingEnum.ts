export enum BookingStatusEnum {
  pending = 'pending',
  confirmed = 'confirmed',
  cancelled = 'cancelled',
  completed = 'completed',
  expired = 'expired',
}

export enum PaymentStatusEnum {
  unpaid = 'unpaid',
  paid = 'paid',
  refunded = 'refunded',
  pay_at_venue = 'pay_at_venue',
}

export enum PaymentMethodEnum {
  wallet = 'wallet',
  paymob = 'paymob',
  cash = 'cash',
}
