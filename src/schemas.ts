import { z } from 'zod';

const deliveryAddressSchema = z.object({
  label:    z.string().default('Home'),
  line1:    z.string().min(1),
  line2:    z.string().optional(),
  city:     z.string().min(1),
  district: z.string().min(1),
  state:    z.string().min(1),
  pincode:  z.string().length(6),
  lat:      z.number(),
  lng:      z.number(),
});

const orderItemInputSchema = z.object({
  productId:   z.string().min(1),
  productName: z.string().min(1),
  sellerId:    z.string().min(1),
  sellerName:  z.string().min(1),
  quantity:    z.number().int().positive(),
  unitPrice:   z.number().int().positive(),
  unit:        z.string().min(1),
  imageUrl:    z.string().optional(),
});

export const placeOrderSchema = z.object({
  buyerId:         z.string().min(1),
  buyerName:       z.string().min(1),
  buyerPhone:      z.string().min(10),
  items:           z.array(orderItemInputSchema).min(1),
  deliveryAddress: deliveryAddressSchema,
  paymentMethod:   z.enum(['upi', 'card', 'cod', 'wallet']),
});

export const updateStatusSchema = z.object({
  status: z.enum(['confirmed','processing','dispatched','in_transit','delivered','cancelled','refund_initiated','refunded']),
  reason: z.string().optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

export const paymentCallbackSchema = z.object({
  success:   z.boolean(),
  paymentId: z.string().optional(),
  reason:    z.string().optional(),
});

export const trackingUpdateSchema = z.object({
  trackingId:        z.string().min(1),
  estimatedDelivery: z.string().optional(),
});

export const verifyDeliveryOtpSchema = z.object({
  otp: z.string().length(4, 'OTP must be exactly 4 digits').regex(/^\d{4}$/, 'OTP must be numeric'),
});

export const agentUpdateStatusSchema = z.object({
  status:  z.enum(['confirmed','processing','dispatched','in_transit','delivered','cancelled','refund_initiated','refunded']),
  agentId: z.string().optional(),
  reason:  z.string().optional(),
});
