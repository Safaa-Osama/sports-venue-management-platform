import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(PaymobService.name);
  constructor() {}

  private get secretKey(): string {
    return process.env.PAYMOB_SECRET_KEY || '';
  }

  private get publicKey(): string {
    return process.env.PAYMOB_PUBLIC_KEY || '';
  }

  private get cardIntegrationId(): string {
    return (
      process.env.PAYMOB_CARD_INTEGRATION_ID ||
      process.env.PAYMOB_INTEGRATION_ID ||
      ''
    );
  }

  private get walletIntegrationId(): string {
    return process.env.PAYMOB_WALLET_INTEGRATION_ID || '5822598';
  }

  private get integrationIds(): (number | string)[] {
    const ids: (number | string)[] = [];
    if (this.cardIntegrationId) {
      const cardNum = Number(this.cardIntegrationId);
      ids.push(isNaN(cardNum) ? this.cardIntegrationId : cardNum);
    }
    if (this.walletIntegrationId) {
      const walletNum = Number(this.walletIntegrationId);
      ids.push(isNaN(walletNum) ? this.walletIntegrationId : walletNum);
    }
    return ids;
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

    const methods: (number | string)[] =
      paymentMethods && paymentMethods.length > 0
        ? paymentMethods
        : this.integrationIds;

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
   * Queries Paymob API to check transaction status by special reference ID.
   * Used for automated server-side reconciliation of orphaned pending payments.
   */
  async inquireTransactionByReference(referenceId: string): Promise<any> {
    if (!this.secretKey || !referenceId) return null;
    try {
      const response = await fetch(
        `https://accept.paymob.com/api/acceptance/transactions?special_reference=${encodeURIComponent(referenceId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${this.secretKey}`,
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const results = Array.isArray(data) ? data : data?.results || [];
      if (results.length > 0) {
        return results[0];
      }
      return null;
    } catch (err: any) {
      this.logger.warn(
        `Failed to inquire transaction for reference ${referenceId}: ${err?.message || err}`,
      );
      return null;
    }
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

    console.log(`\n================= [PAYMOB HMAC VERIFICATION PROCESS] =================`);
    console.log(`  HMAC Secret Configured : ${secret ? 'YES (length: ' + secret.length + ')' : 'NO (empty)'}`);
    console.log(`  Received HMAC Signature: ${receivedHmac || 'MISSING'}`);

    if (!secret) {
      console.warn(`  Verification Status    : REJECTED (PAYMOB_HMAC_SECRET is not configured)`);
      console.log(`=======================================================================\n`);
      return false;
    }

    if (!receivedHmac) {
      console.warn(
        '  Verification Status    : REJECTED (Missing HMAC signature query parameter)',
      );
      console.log(`=======================================================================\n`);
      return false;
    }

    const p = payload as any;
    const obj = p?.obj || p?.transaction || p;
    if (!obj) {
      console.warn(
        '  Verification Status    : REJECTED (Missing obj in webhook payload)',
      );
      console.log(`=======================================================================\n`);
      return false;
    }

    // Helper to format values matching Paymob Python serialization (lowercase booleans, empty strings for nulls)
    const formatVal = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return String(v);
    };

    try {
      // ── 20 Fields in Exact Documented Paymob Alphabetical Order ──
      const transactionFields = [
        formatVal(obj.amount_cents),
        formatVal(obj.created_at),
        formatVal(obj.currency),
        formatVal(obj.error_occured),
        formatVal(obj.has_parent_transaction),
        formatVal(obj.id),
        formatVal(obj.integration_id),
        formatVal(obj.is_3d_secure),
        formatVal(obj.is_auth),
        formatVal(obj.is_capture),
        formatVal(obj.is_refunded),
        formatVal(obj.is_standalone_payment),
        formatVal(obj.is_voided),
        formatVal(obj.order?.id),
        formatVal(obj.owner),
        formatVal(obj.pending),
        formatVal(obj.source_data?.pan),
        formatVal(obj.source_data?.sub_type),
        formatVal(obj.source_data?.type),
        formatVal(obj.success),
      ];

      const transactionConcat = transactionFields.join('');
      const calculatedTransactionHmac = crypto
        .createHmac('sha512', secret)
        .update(transactionConcat)
        .digest('hex')
        .toLowerCase();

      console.log(`  Payload Format         : TRANSACTION (obj)`);
      console.log(`  Transaction ID         : ${obj.id ?? 'N/A'}`);
      console.log(`  Order ID               : ${obj.order?.id ?? 'N/A'}`);
      console.log(`  Merchant Order ID      : ${obj.order?.merchant_order_id ?? 'N/A'}`);
      console.log(`  Amount (Cents)         : ${transactionFields[0]}`);
      console.log(`  Success Status         : ${transactionFields[19]}`);
      console.log(`  Concatenated String    : "${transactionConcat}"`);
      console.log(`  Calculated SHA-512 HMAC: ${calculatedTransactionHmac}`);
      console.log(`  Received HMAC Signature: ${receivedHmac.trim().toLowerCase()}`);

      if (this.safeCompareHmac(calculatedTransactionHmac, receivedHmac)) {
        console.log(`  Verification Result    : [SUCCESS] HMAC MATCH (timing-safe equal: true)`);
        console.log(`=======================================================================\n`);
        return true;
      }

      console.warn(
        `  Verification Result    : [FAILED] HMAC MISMATCH for transaction ID ${obj.id}.`,
      );
      console.log(`=======================================================================\n`);

      return false;
    } catch (err: any) {
      console.error(
        '  Verification Result    : [ERROR] Error during HMAC verification calculation:',
        err?.message || err,
      );
      console.log(`=======================================================================\n`);
      return false;
    }
  }
}
