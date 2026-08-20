export interface PaymobBillingData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  apartment?: string;
  floor?: string;
  street?: string;
  building?: string;
  shipping_method?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  state?: string;
}

export interface PaymobItem {
  name: string;
  amount_cents: number;
  description?: string;
  quantity: number;
}

export interface CreateIntentionParams {
  bookingId: string;
  transactionId: string;
  amount: number;
  currency?: string;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  items?: PaymobItem[];
  redirectionUrl?: string;
  notificationUrl?: string;
  paymentMethods?: (number | string)[];
}

export interface PaymobIntentionRequest {
  amount: number;
  currency: string;
  payment_methods: (number | string)[];
  items?: PaymobItem[];
  billing_data: PaymobBillingData;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
  special_reference?: string;
  notification_url?: string;
  redirection_url?: string;
}

export interface PaymobIntentionResponse {
  id: string;
  client_secret: string;
  intention_order?: {
    id: number;
  };
  payment_keys?: Array<{
    key: string;
    integration: number;
  }>;
  redirect_url?: string;
}

// 2. Paymob Legacy 3-Step Flow Types
export interface PaymobAuthTokenResponse {
  token: string;
}

export interface PaymobOrderRegistrationRequest {
  auth_token: string;
  delivery_needed: string;
  amount_cents: string;
  currency: string;
  merchant_order_id: string;
  items: PaymobItem[];
}

export interface PaymobOrderRegistrationResponse {
  id: number | string;
}

export interface PaymobPaymentKeyRequest {
  auth_token: string;
  amount_cents: string;
  expiration: number;
  order_id: string;
  billing_data: PaymobBillingData;
  currency: string;
  integration_id: number;
}

export interface PaymobPaymentKeyResponse {
  token: string;
}

// 3. Webhook & Payment Output Types
export interface PaymobCheckoutResult {
  redirectUrl: string;
  orderId?: string;
  paymentKey?: string;
  clientSecret?: string;
  publicKey?: string;
}

export interface PaymobWebhookObject {
  id?: number | string;
  pending?: boolean;
  success?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_standalone_payment?: boolean;
  is_voided?: boolean;
  is_refunded?: boolean;
  is_3d_secure?: boolean;
  amount_cents?: number | string;
  created_at?: string;
  currency?: string;
  error_occured?: boolean | string;
  has_parent_transaction?: boolean | string;
  integration_id?: number | string;
  order?: {
    id?: number | string;
    merchant_order_id?: string;
  };
  merchant_order_id?: string;
  order_id?: number | string;
  owner?: number | string;
  source_data?: {
    pan?: string;
    sub_type?: string;
    type?: string;
  };
}

export interface PaymobWebhookPayload {
  type?: string;
  obj?: PaymobWebhookObject;
  [key: string]: any;
}
