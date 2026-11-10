export type OrderType = "pickup" | "delivery" | "dine_in";
export type OrderStatus = "received" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "gcash" | "online";
export type PaymentStatus = "unpaid" | "for_verification" | "paid" | "awaiting_payment" | "refunded";

export interface StoreSettings {
  id: number;
  store_name: string;
  is_open: boolean;
  open_time: string; // "HH:MM:SS"
  close_time: string;
  timezone: string;
  min_delivery_order: number;
  prep_minutes: number;
  closed_message: string;
  gcash_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  logo_url: string | null;
  background_url: string | null;
  background_fade: number;
  header_color: string | null;
  staff_header_color: string | null;
  staff_title: string;
  online_payments_enabled: boolean;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ItemOption {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  selection: "single" | "multi";
  is_required: boolean;
  max_select: number | null;
  sort_order: number;
  item_options?: ItemOption[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  photo_url: string | null;
  is_sold_out: boolean;
  is_active: boolean;
  sort_order: number;
  menu_item_option_groups?: { group_id: string; sort_order: number }[];
}

export interface Zone {
  id: string;
  name: string;
  fee: number;
  is_active: boolean;
  sort_order: number;
}

export interface Rider {
  id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  is_active: boolean;
}

export interface SelectedOption {
  id: string;
  group: string;
  name: string;
  price_delta: number;
}

export interface OrderItemRow {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  options: { group: string; name: string; price_delta: number }[];
}

export interface Order {
  id: string;
  order_number: string;
  public_token: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  order_type: OrderType;
  status: OrderStatus;
  scheduled_for: string | null;
  zone_id: string | null;
  zone_name: string | null;
  street: string | null;
  landmark: string | null;
  rider_notes: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  gcash_reference: string | null;
  payment_proof_path: string | null;
  paymongo_checkout_id?: string | null;
  paymongo_payment_id?: string | null;
  paymongo_refund_id?: string | null;
  checkout_url?: string | null;
  payment_expires_at?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  rider_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  completed_at: string | null;
  order_items?: OrderItemRow[];
}
