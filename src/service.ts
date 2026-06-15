import type { OrderRepository } from './repository.js';
import type { NotificationPort } from './ports.js';
import type { Order, OrderStatus, PaymentMethod } from './types.js';
import { NotFoundError, BadRequestError } from './errors.js';

// Enforce valid state-machine transitions — business rule lives here, not in routes.
const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment:  ['confirmed', 'cancelled'],
  confirmed:        ['processing', 'cancelled'],
  processing:       ['dispatched'],
  dispatched:       ['in_transit'],
  in_transit:       ['delivered', 'refund_initiated'],
  cancelled:        ['refunded'],
  refund_initiated: ['refunded'],
};

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export interface PlaceOrderInput {
  buyerId:         string;
  buyerName:       string;
  buyerPhone:      string;
  items:           Array<{
    productId: string; productName: string;
    sellerId: string; sellerName: string;
    quantity: number; unitPrice: number; unit: string; imageUrl?: string;
  }>;
  deliveryAddress: Order['deliveryAddress'];
  paymentMethod:   PaymentMethod;
}

export class OrderService {
  constructor(
    private repo:              OrderRepository,
    private notificationPort:  NotificationPort,
  ) {}

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    const items      = input.items.map(i => ({ ...i, totalPrice: i.unitPrice * i.quantity }));
    const subtotal   = items.reduce((s, i) => s + i.totalPrice, 0);
    const deliveryFee = 4000; // ₹40 flat
    const count      = await this.repo.countByBuyer(input.buyerId);
    const discount   = count === 0 ? 5000 : 0; // ₹50 first-order discount
    const total      = subtotal + deliveryFee - discount;

    // COD skips pending_payment state — confirms immediately
    const status: OrderStatus = input.paymentMethod === 'cod' ? 'confirmed' : 'pending_payment';

    const order = await this.repo.create({
      buyerId: input.buyerId, buyerName: input.buyerName, buyerPhone: input.buyerPhone,
      items, deliveryAddress: input.deliveryAddress,
      subtotal, deliveryFee, discount, total,
      paymentMethod: input.paymentMethod, status,
    });

    this.notificationPort.notify('order_placed', input.buyerId, {
      orderId: order.id, total: String(total),
    }).catch(() => {});

    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);
    return order;
  }

  async listOrders(filters?: { buyerId?: string; sellerId?: string; status?: OrderStatus }): Promise<Order[]> {
    return this.repo.findAll(filters);
  }

  async updateStatus(id: string, newStatus: OrderStatus, reason?: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);
    if (!canTransition(order.status, newStatus)) {
      throw new BadRequestError(`Cannot transition order from '${order.status}' to '${newStatus}'`);
    }

    const patch: Partial<Order> = { status: newStatus };
    if (newStatus === 'cancelled')  { patch.cancelledAt = new Date().toISOString(); patch.cancelReason = reason; }
    if (newStatus === 'delivered')  { patch.deliveredAt = new Date().toISOString(); }

    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundError(`Order ${id} not found`);

    this.notificationPort.notify(`order_${newStatus}`, order.buyerId, {
      orderId: id, status: newStatus,
    }).catch(() => {});

    return updated;
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);
    if (!canTransition(order.status, 'cancelled')) {
      throw new BadRequestError(`Order in status '${order.status}' cannot be cancelled`);
    }
    return this.updateStatus(id, 'cancelled', reason);
  }

  async handlePaymentCallback(id: string, success: boolean, paymentId?: string, reason?: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);

    if (success) {
      const updated = await this.repo.update(id, { status: 'confirmed', paymentId });
      if (!updated) throw new NotFoundError(`Order ${id} not found`);
      return updated;
    }
    return this.updateStatus(id, 'cancelled', reason ?? 'Payment failed');
  }

  async setTrackingInfo(id: string, trackingId: string, estimatedDelivery?: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);
    const updated = await this.repo.update(id, { trackingId, estimatedDelivery });
    if (!updated) throw new NotFoundError(`Order ${id} not found`);
    return updated;
  }
}
