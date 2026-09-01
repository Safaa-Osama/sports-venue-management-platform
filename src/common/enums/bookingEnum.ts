export enum BookingStatusEnum {
  pending = 'pending',
  confirmed = 'confirmed',
  cancelled = 'cancelled',
  completed = 'completed',
  expired = 'expired',
  no_show = 'no_show',
}

export enum PaymentStatusEnum {
  unpaid = 'unpaid',
  paid = 'paid',
  partially_paid = 'partially_paid',
  refunded = 'refunded',
  pay_at_venue = 'pay_at_venue',
}

export enum PaymentMethodEnum {
  wallet = 'wallet',
  paymob = 'paymob',
  cash = 'cash',
}
