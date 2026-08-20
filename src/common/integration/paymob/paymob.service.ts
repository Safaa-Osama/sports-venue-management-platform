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

    const redirectUrl = `https://accept.paymob.com/unifiedcheckout/?pulse=${clientSecret}&pk=${this.publicKey}`;

    return {
      redirectUrl,
      orderId: data.intention_order?.id?.toString(),
      clientSecret,
      publicKey: this.publicKey,
    };
  }

  /**
   * Validates Paymob webhook HMAC signature with strict verification.
   */
  verifyWebhookHmac(
    payload: PaymobWebhookPayload,
    receivedHmac?: string,
  ): boolean {
    if (!this.hmacSecret || !receivedHmac) {
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
