export type OrderStatus =
  | 'pending_payment'    // created, awaiting payment confirmation
  | 'confirmed'          // payment success or COD — seller can see order
  | 'processing'         // seller accepted
  | 'packing'            // seller actively packing the order
  | 'dispatched'         // handed to logistics
  | 'in_transit'         // logistics picked up
  | 'delivered'          // delivered to buyer
  | 'return_requested'   // buyer requested return within window
  | 'return_accepted'    // seller accepted the return
  | 'return_rejected'    // seller rejected the return
  | 'cancelled'          // cancelled before dispatch
  | 'refund_initiated'   // post-payment cancellation
  | 'refunded';          // money returned

export type PaymentMethod = 'upi' | 'card' | 'cod' | 'wallet';

export interface OrderItem {
  productId:   string;
  productName: string;  // denormalized at order time
  sellerId:    string;
  sellerName:  string;  // denormalized
  quantity:    number;
  unitPrice:   number;  // paise — snapshot at order time
  totalPrice:  number;  // paise — unitPrice × quantity
  unit:        string;
  imageUrl?:   string;
}

export interface DeliveryAddress {
  label:    string;
  line1:    string;
  line2?:   string;
  city:     string;
  district: string;
  state:    string;
  pincode:  string;
  lat:      number;
  lng:      number;
}

export interface Order {
  id:              string;
  buyerId:         string;
  buyerName:       string;
  buyerPhone:      string;
  items:           OrderItem[];
  deliveryAddress: DeliveryAddress;
  subtotal:        number;         // paise
  deliveryFee:     number;         // paise — flat ₹40 = 4000
  discount:        number;         // paise — ₹50 first-order discount
  total:           number;         // paise — subtotal + deliveryFee - discount
  paymentMethod:   PaymentMethod;
  paymentId?:      string;
  status:          OrderStatus;
  trackingId?:     string;
  estimatedDelivery?: string;
  cancelledAt?:         string;
  cancelReason?:        string;
  packedAt?:            string;
  deliveredAt?:         string;
  returnWindowDays:     number;          // days buyer can request a return (default 7)
  returnWindowClosedAt?: string;         // ISO — when window expires
  returnRequestedAt?:   string;
  returnReason?:        string;
  createdAt:            string;
  updatedAt:            string;
}
