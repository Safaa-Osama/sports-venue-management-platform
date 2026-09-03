import * as crypto from 'crypto';
import { PaymobService } from './paymob.service';

describe('PaymobService (HMAC Verification)', () => {
  let paymobService: PaymobService;
  const testSecret = 'TEST_PAYMOB_HMAC_SECRET_KEY_123456';

  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = testSecret;
    paymobService = new PaymobService();
  });

  afterEach(() => {
    delete process.env.PAYMOB_HMAC_SECRET;
  });

  function computeHmac(txn: any, secret: string): string {
    const fields = [
      String(txn.amount_cents ?? ''),
      String(txn.created_at ?? ''),
      String(txn.currency ?? ''),
      String(txn.error_occured ?? ''),
      String(txn.has_parent_transaction ?? ''),
      String(txn.id ?? ''),
      String(txn.integration_id ?? ''),
      String(txn.is_3d_secure ?? ''),
      String(txn.is_auth ?? ''),
      String(txn.is_capture ?? ''),
      String(txn.is_refunded ?? ''),
      String(txn.is_standalone_payment ?? ''),
      String(txn.is_voided ?? ''),
      String(txn.order?.id ?? txn.order ?? ''),
      String(txn.owner ?? ''),
      String(txn.pending ?? ''),
      String(txn.source_data?.pan ?? ''),
      String(txn.source_data?.sub_type ?? ''),
      String(txn.source_data?.type ?? ''),
      String(txn.success ?? ''),
    ];
    return crypto.createHmac('sha512', secret).update(fields.join('')).digest('hex').toLowerCase();
  }

  it('should verify valid 20-field transaction webhook HMAC and log formatted verification process', () => {
    const sampleTxn = {
      id: 99882233,
      amount_cents: 45000,
      created_at: '2026-08-30T08:35:00.123456',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      integration_id: 5822598,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 7891234 },
      owner: 100,
      pending: false,
      source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
      success: true,
    };

    const validHmac = computeHmac(sampleTxn, testSecret);
    const payload = { obj: sampleTxn } as any;

    const result = paymobService.verifyWebhookHmac(payload, validHmac);
    expect(result).toBe(true);
  });

  it('should verify exact real-world Paymob webhook payload from production support', () => {
    const realPayload = {
      type: 'TRANSACTION',
      obj: {
        id: 524925027,
        pending: false,
        amount_cents: 15000,
        success: true,
        is_auth: false,
        is_capture: false,
        is_standalone_payment: true,
        is_voided: false,
        is_refunded: false,
        is_3d_secure: true,
        integration_id: 3143838,
        profile_id: 644046,
        has_parent_transaction: false,
        order: {
          id: 597965733,
          created_at: '2026-08-30T11:48:33.880190',
          merchant_order_id: 'TXN-MTFKHSXR-4AA46C8C',
        },
        created_at: '2026-08-30T11:48:50.794886',
        currency: 'EGP',
        source_data: {
          pan: '1111',
          type: 'card',
          sub_type: 'Visa',
        },
        error_occured: false,
        owner: 1087444,
      },
    };

    const validHmac = computeHmac(realPayload.obj, testSecret);
    const result = paymobService.verifyWebhookHmac(realPayload as any, validHmac);
    expect(result).toBe(true);
  });

  it('should reject tampered HMAC signature', () => {
    const sampleTxn = {
      id: 99882233,
      amount_cents: 45000,
      created_at: '2026-08-30T08:35:00.123456',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      integration_id: 5822598,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 7891234 },
      owner: 100,
      pending: false,
      source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
      success: true,
    };

    const invalidHmac = '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    const payload = { obj: sampleTxn } as any;

    const result = paymobService.verifyWebhookHmac(payload, invalidHmac);
    expect(result).toBe(false);
  });
});
