import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CreateIntentionParams,
  PaymobBillingData,
  PaymobCheckoutResult,
  PaymobIntentionRequest,
  PaymobIntentionResponse,
  PaymobWebhookPayload,
} from './paymob.types';

@Injectable()
export class PaymobService {
  constructor() {}

  private get secretKey(): string {
    return process.env.PAYMOB_SECRET_KEY || '';
  }

  private get publicKey(): string {
    return process.env.PAYMOB_PUBLIC_KEY || '';
  }

  private get integrationId(): string {
    return process.env.PAYMOB_INTEGRATION_ID || '';
  }

  private get hmacSecret(): string {
    return process.env.PAYMOB_HMAC_SECRET || '';
  }

  async createPaymentIntention(
    params: CreateIntentionParams,
  ): Promise<PaymobCheckoutResult> {
    if (!this.secretKey) {
      throw new BadRequestException('Paymob secret key is not configured');
    }
    if (!this.publicKey) {
      throw new BadRequestException('Paymob public key is not configured');
    }

    const {
      transactionId,
      amount,
      userEmail,
      userName,
      userPhone,
      items = [],
      currency = 'EGP',
      redirectionUrl,
      notificationUrl,
      paymentMethods,
    } = params;

    // Split user full name into first and last name
    const nameParts = (userName || 'Customer User').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const billingData: PaymobBillingData = {
      apartment: 'NA',
      email: userEmail || 'customer@example.com',
      floor: 'NA',
      first_name: firstName,
      street: 'NA',
      building: 'NA',
      phone_number: userPhone || '+201000000000',
      shipping_method: 'PKG',
      postal_code: 'NA',
      city: 'Cairo',
      country: 'EGY',
      last_name: lastName,
      state: 'NA',
    };

    const amountCents = Math.round(amount * 100);
    const integrationIdNum = Number(this.integrationId);

    const methods: (number | string)[] =
      paymentMethods && paymentMethods.length > 0
        ? paymentMethods
        : integrationIdNum
          ? [integrationIdNum]
          : [];

    const payload: PaymobIntentionRequest = {
      amount: amountCents,
      currency,
      payment_methods: methods,
      items,
      billing_data: billingData,
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: billingData.email,
        phone_number: billingData.phone_number,
      },
      special_reference: transactionId,
      ...(redirectionUrl ? { redirection_url: redirectionUrl } : {}),
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    };

    let response: Response;
    try {
      response = await fetch('https://accept.paymob.com/v1/intention/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${this.secretKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to connect to Paymob: ${error.message || error}`,
      );
    }

    if (!response.ok) {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = JSON.stringify(errJson);
      } catch {
        errDetail = await response.text();
      }
      throw new BadRequestException(
        `Paymob Intention API failed (${response.status}): ${errDetail}`,
      );
    }

    const data: PaymobIntentionResponse = await response.json();
    const clientSecret = data.client_secret;

    if (!clientSecret) {
      throw new BadRequestException(
        'Paymob did not return a valid client secret',
      );
    }

    const redirectUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${this.publicKey}&clientSecret=${clientSecret}`;

    return {
      redirectUrl,
      orderId: data.intention_order?.id?.toString(),
      clientSecret,
      publicKey: this.publicKey,
    };
  }

  /**
   * Performs constant-time, timing-safe comparison between two HMAC hex digests.
   */
  private safeCompareHmac(calculated: string, received: string): boolean {
    if (!calculated || !received) return false;
    try {
      const calcBuf = Buffer.from(calculated.trim().toLowerCase(), 'utf8');
      const recvBuf = Buffer.from(received.trim().toLowerCase(), 'utf8');
      if (calcBuf.length !== recvBuf.length) return false;
      return crypto.timingSafeEqual(calcBuf, recvBuf);
    } catch {
      return false;
    }
  }

  /**
   * Validates Paymob webhook SHA-512 HMAC signature.
   *
   * Supports two payload formats:
   * - Intention API: { intention, transaction: { ...20 fields... }, hmac }
   * - Legacy API:    { type: "TRANSACTION", obj: { ...20 fields... } }
   *
   * HMAC types:
   * 1. Transaction Webhook (20 fields in documented alphabetical order)
   * 2. Card Token Webhook (8 fields)
   *
   * Always SHA-512, hex-lowercase, timing-safe comparison.
   */
  verifyWebhookHmac(
    payload: PaymobWebhookPayload,
    receivedHmac?: string,
  ): boolean {
    const secret = (this.hmacSecret || '').trim();

    if (!secret) {
      console.log(
        'ℹ️ [Paymob Webhook] PAYMOB_HMAC_SECRET is not configured in server environment. Skipping HMAC signature check (Development mode).',
      );
      return true;
    }

    if (!receivedHmac) {
      console.warn(
        '⚠️ [Paymob Webhook] Missing HMAC parameter on webhook request while PAYMOB_HMAC_SECRET is set.',
      );
      return false;
    }

    const p = payload as any;

    // Resolve the transaction object from either format:
    // Intention API: payload.transaction
    // Legacy API:    payload.obj
    const txn = p?.transaction || p?.obj || p;
    if (!txn) return false;

    const formatName = p?.transaction ? 'Intention API' : p?.obj ? 'Legacy API' : 'Flat';
    console.log(`ℹ️ [Paymob Webhook] Detected format: ${formatName}. Transaction keys: [${Object.keys(txn).slice(0, 10).join(', ')}...]`);

    // Helper to format values matching Paymob Python serialization (lowercase booleans, empty strings for nulls)
    const formatVal = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return String(v);
    };

    const extractField = (key: string, altKeys: string[] = []): any => {
      if (txn[key] !== undefined && txn[key] !== null) return txn[key];
      for (const alt of altKeys) {
        if (txn[alt] !== undefined && txn[alt] !== null) return txn[alt];
      }
      return '';
    };

    try {
      const orderVal =
        txn.order && typeof txn.order === 'object'
          ? txn.order.id
          : extractField('order', ['order_id', 'order.id', 'merchant_order_id']);

      const panVal =
        txn.source_data?.pan ??
        extractField('source_data.pan', ['source_data_pan', 'pan']);

      const subTypeVal =
        txn.source_data?.sub_type ??
        txn.source_data?.subtype ??
        extractField('source_data.sub_type', [
          'source_data_sub_type',
          'source_data_subtype',
          'sub_type',
          'subtype',
        ]);

      const typeVal =
        txn.source_data?.type ??
        extractField('source_data.type', ['source_data_type', 'type']);

      // ── Type 1: Transaction Webhook (20 Fields in Exact Documented Alphabetical Order) ──
      const transactionFields = [
        formatVal(extractField('amount_cents')),
        formatVal(extractField('created_at')),
        formatVal(extractField('currency')),
        formatVal(extractField('error_occured', ['error_occurred'])),
        formatVal(extractField('has_parent_transaction')),
        formatVal(extractField('id')),
        formatVal(extractField('integration_id')),
        formatVal(extractField('is_3d_secure', ['is_3dsecure'])),
        formatVal(extractField('is_auth')),
        formatVal(extractField('is_capture')),
        formatVal(extractField('is_refunded')),
        formatVal(extractField('is_standalone_payment')),
        formatVal(extractField('is_voided', ['is_void'])),
        formatVal(orderVal),
        formatVal(extractField('owner')),
        formatVal(extractField('pending')),
        formatVal(panVal),
        formatVal(subTypeVal),
        formatVal(typeVal),
        formatVal(extractField('success')),
      ];

      const transactionConcat = transactionFields.join('');
      const calculatedTransactionHmac = crypto
        .createHmac('sha512', secret)
        .update(transactionConcat)
        .digest('hex')
        .toLowerCase();

      // Logging removed to prevent spam

      if (this.safeCompareHmac(calculatedTransactionHmac, receivedHmac)) {
        console.log('🔒 [Paymob Webhook] SHA-512 HMAC timing-safely verified (Transaction Type).');
        return true;
      }

      // ── Type 2: Card Token Webhook (8 Fields in Exact Documented Order) ──
      if (txn.token || p?.type === 'TOKEN') {
        const tokenFields = [
          formatVal(extractField('card_subtype')),
          formatVal(extractField('created_at')),
          formatVal(extractField('email')),
          formatVal(extractField('id')),
          formatVal(extractField('masked_pan')),
          formatVal(extractField('merchant_id')),
          formatVal(extractField('order_id')),
          formatVal(extractField('token')),
        ];
        const tokenConcat = tokenFields.join('');
        const calculatedTokenHmac = crypto
          .createHmac('sha512', secret)
          .update(tokenConcat)
          .digest('hex')
          .toLowerCase();

        if (this.safeCompareHmac(calculatedTokenHmac, receivedHmac)) {
          console.log('🔒 [Paymob Webhook] SHA-512 HMAC timing-safely verified (Card Token Type).');
          return true;
        }
      }

      console.warn(
        `⚠️ [Paymob Webhook] HMAC signature mismatch. ` +
          `(Note: Paymob Intention API webhooks sometimes fail standard legacy HMAC validation. ` +
          `Proceeding with transaction ID ${txn.id} via fallback validation.)`,
      );

      return false;
    } catch (err: any) {
      console.error(
        '❌ [Paymob Webhook] Error during HMAC verification calculation:',
        err?.message || err,
      );
      return false;
    }
  }
}
