import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.get<string>('PAYMOB_API_KEY') || '';
  }

  private get secretKey(): string {
    return (
      this.configService.get<string>('PAYMOB_SECRET_KEY') ||
      this.configService.get<string>('PAYMOB_API_KEY') ||
      ''
    );
  }

  private get publicKey(): string {
    return this.configService.get<string>('PAYMOB_PUBLIC_KEY') || '';
  }

  private get integrationId(): string {
    return this.configService.get<string>('PAYMOB_INTEGRATION_ID') || '';
  }

  private get iframeId(): string {
    return this.configService.get<string>('PAYMOB_IFRAME_ID') || 'sample';
  }

  private get hmacSecret(): string {
    return this.configService.get<string>('PAYMOB_HMAC_SECRET') || '';
  }

  /**
   * Main entry point to create payment intention.
   * Prefers Intention API (v1 / Unified Checkout) if secretKey/publicKey configured,
   * otherwise falls back to 3-step Legacy flow (Auth Token -> Order -> Payment Key).
   */
  async createPaymentIntention(
    params: CreateIntentionParams,
  ): Promise<PaymobCheckoutResult> {
    const { bookingId, transactionId, amount, userEmail, userName, userPhone } =
      params;

    // Split user full name into first and last name
    const nameParts = (userName || 'Customer User').trim().split(' ');
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

    // If Intention API credentials are available, use Intention API (v1)
    if (this.secretKey.startsWith('Key_') || this.publicKey) {
      try {
        return await this.createIntentionV1(
          transactionId,
          amount,
          billingData,
          params.items,
        );
      } catch (error: any) {
        this.logger.error(
          `Paymob Intention API v1 failed: ${error.message}. Falling back to 3-step legacy flow.`,
        );
      }
    }

    // Legacy 3-step flow (Auth -> Order -> Payment Key)
    return this.createLegacyPaymentKey(
      bookingId,
      transactionId,
      amount,
      billingData,
    );
  }

  /**
   * Creates a payment intention using Paymob Intention API (v1 / Unified Checkout).
   */
  private async createIntentionV1(
    transactionId: string,
    amount: number,
    billingData: PaymobBillingData,
    items: any[] = [],
  ): Promise<PaymobCheckoutResult> {
    const amountCents = Math.round(amount * 100);
    const integrationIdNum = Number(this.integrationId);

    const payload: PaymobIntentionRequest = {
      amount: amountCents,
      currency: 'EGP',
      payment_methods: integrationIdNum ? [integrationIdNum] : [],
      items,
      billing_data: billingData,
      special_reference: transactionId,
    };

    const response = await fetch(
      'https://accept.paymob.com/v1/intention/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${this.secretKey}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Paymob Intention API response ${response.status}: ${errText}`);
    }

    const data: PaymobIntentionResponse = await response.json();
    const clientSecret = data.client_secret;

    const redirectUrl = this.publicKey
      ? `https://accept.paymob.com/unifiedcheckout/?pulse=${clientSecret}&pk=${this.publicKey}`
      : `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${clientSecret}`;

    return {
      redirectUrl,
      orderId: data.intention_order?.id?.toString(),
      clientSecret,
    };
  }

  /**
   * Creates payment key via Legacy 3-step flow (Auth Token -> Order -> Payment Key).
   */
  private async createLegacyPaymentKey(
    bookingId: string,
    transactionId: string,
    amount: number,
    billingData: PaymobBillingData,
  ): Promise<PaymobCheckoutResult> {
    if (!this.apiKey || !this.integrationId) {
      this.logger.warn(
        'Paymob API key or Integration ID not configured. Returning simulated gateway link.',
      );
      return {
        redirectUrl: `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${transactionId}`,
      };
    }

    try {
      // Step 1: Auth Token
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey }),
      });
      const authData = await authRes.json();
      const authToken = authData.token;

      if (!authToken) {
        throw new Error('Failed to obtain auth token from Paymob');
      }

      // Step 2: Order Registration
      const amountCents = Math.round(amount * 100);
      const orderRes = await fetch(
        'https://accept.paymob.com/api/ecommerce/orders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_token: authToken,
            delivery_needed: 'false',
            amount_cents: amountCents.toString(),
            currency: 'EGP',
            merchant_order_id: transactionId,
            items: [],
          }),
        },
      );
      const orderData = await orderRes.json();
      const paymobOrderId = orderData.id;

      if (!paymobOrderId) {
        throw new Error('Failed to register order with Paymob');
      }

      // Step 3: Payment Key Request
      const keyRes = await fetch(
        'https://accept.paymob.com/api/acceptance/payment_keys',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_token: authToken,
            amount_cents: amountCents.toString(),
            expiration: 3600,
            order_id: paymobOrderId.toString(),
            billing_data: billingData,
            currency: 'EGP',
            integration_id: Number(this.integrationId),
          }),
        },
      );
      const keyData = await keyRes.json();
      const paymentToken = keyData.token;

      if (!paymentToken) {
        throw new Error('Failed to generate payment key from Paymob');
      }

      const redirectUrl = `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentToken}`;
      return {
        redirectUrl,
        orderId: paymobOrderId.toString(),
        paymentKey: paymentToken,
      };
    } catch (error: any) {
      this.logger.error(
        `Paymob legacy API error: ${error.message}. Returning fallback payment URL.`,
      );
      return {
        redirectUrl: `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${transactionId}`,
      };
    }
  }

  /**
   * Basic POST webhook HMAC SHA-512 check with boolean validation.
   */
  verifyWebhookHmac(
    payload: PaymobWebhookPayload,
    receivedHmac?: string,
  ): boolean {
    if (!this.hmacSecret) {
      this.logger.warn('PAYMOB_HMAC_SECRET not configured. HMAC check bypassed.');
      return true;
    }

    if (!receivedHmac) {
      return false;
    }

    const obj = payload?.obj || payload;
    if (!obj) return false;

    const concatenatedString = [
      obj.amount_cents ?? '',
      obj.created_at ?? '',
      obj.currency ?? '',
      obj.error_occured ?? '',
      obj.has_parent_transaction ?? '',
      obj.id ?? '',
      obj.integration_id ?? '',
      obj.is_3d_secure ?? '',
      obj.is_auth ?? '',
      obj.is_capture ?? '',
      obj.is_refunded ?? '',
      obj.is_standalone_payment ?? '',
      obj.is_voided ?? '',
      obj.order?.id ?? '',
      obj.owner ?? '',
      obj.pending ?? '',
      obj.source_data?.pan ?? '',
      obj.source_data?.sub_type ?? '',
      obj.source_data?.type ?? '',
      obj.success ?? '',
    ].join('');

    const calculatedHmac = crypto
      .createHmac('sha512', this.hmacSecret)
      .update(concatenatedString)
      .digest('hex');

    return calculatedHmac.toLowerCase() === receivedHmac.toLowerCase();
  }
}
