import type { OrderRepository } from './repository.js';
import type { NotificationPort } from './ports.js';
import type { Order, OrderStatus, PaymentMethod } from './types.js';
import { NotFoundError, BadRequestError } from './errors.js';

const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment:  ['confirmed', 'cancelled'],
  confirmed:        ['processing', 'cancelled'],
  processing:       ['packing', 'cancelled'],
  packing:          ['dispatched'],
  dispatched:       ['in_transit'],
  in_transit:       ['delivered', 'refund_initiated'],
  delivered:        ['return_requested'],
  return_requested: ['return_accepted', 'return_rejected'],
  return_accepted:  ['refund_initiated'],
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

  async placeOrder(input: PlaceOrderInput): Promise<Order[]> {
    // Group items by seller — each seller gets their own isolated order record.
    // This prevents one seller's status changes from being visible to other sellers.
    const sellerGroups = new Map<string, typeof input.items>();
    for (const item of input.items) {
      const group = sellerGroups.get(item.sellerId) ?? [];
      group.push(item);
      sellerGroups.set(item.sellerId, group);
    }

    const isFirstOrder = (await this.repo.countByBuyer(input.buyerId)) === 0;
    const status: OrderStatus = (input.paymentMethod === 'cod' || input.paymentMethod === 'wallet')
      ? 'confirmed'
      : 'pending_payment';

    const created: Order[] = [];
    let firstSubOrder = true;

    for (const [sellerId, rawItems] of sellerGroups) {
      const items       = rawItems.map(i => ({ ...i, totalPrice: i.unitPrice * i.quantity }));
      const subtotal    = items.reduce((s, i) => s + i.totalPrice, 0);
      // Delivery fee (₹40) and first-order discount (₹50) apply only to the first sub-order
      const deliveryFee = firstSubOrder ? 4000 : 0;
      const discount    = firstSubOrder && isFirstOrder ? 5000 : 0;
      const total       = subtotal + deliveryFee - discount;
      firstSubOrder     = false;

      const order = await this.repo.create({
        buyerId: input.buyerId, buyerName: input.buyerName, buyerPhone: input.buyerPhone,
        items, deliveryAddress: input.deliveryAddress,
        subtotal, deliveryFee, discount, total,
        paymentMethod: input.paymentMethod, status,
        returnWindowDays: 7,
      });

      this.notificationPort.notify('order_received', sellerId, {
        orderId:   order.id,
        buyerName: input.buyerName,
        itemCount: String(items.length),
        total:     String(total),
      }).catch(() => {});

      created.push(order);
    }

    const grandTotal = created.reduce((s, o) => s + o.total, 0);
    this.notificationPort.notify('order_placed', input.buyerId, {
      orderId: created[0]?.id ?? '', total: String(grandTotal),
    }).catch(() => {});

    return created;
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
    const now = new Date().toISOString();
    if (newStatus === 'cancelled')         { patch.cancelledAt = now; patch.cancelReason = reason; }
    if (newStatus === 'packing')           { patch.packedAt = now; }
    if (newStatus === 'delivered')         {
      patch.deliveredAt = now;
      const windowClose = new Date(Date.now() + order.returnWindowDays * 86_400_000);
      patch.returnWindowClosedAt = windowClose.toISOString();
    }
    if (newStatus === 'return_requested')  { patch.returnRequestedAt = now; patch.returnReason = reason; }

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

  async requestReturn(id: string, reason: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);
    if (order.status !== 'delivered') {
      throw new BadRequestError('Returns can only be requested for delivered orders');
    }
    if (order.returnWindowClosedAt && new Date() > new Date(order.returnWindowClosedAt)) {
      throw new BadRequestError('Return window has closed for this order');
    }
    return this.updateStatus(id, 'return_requested', reason);
  }

  async getInvoiceData(id: string): Promise<{
    invoiceNumber: string;
    order: Order;
    issuedAt: string;
    sellerGstin?: string;
  }> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`Order ${id} not found`);
    return {
      invoiceNumber: `INV-${id.slice(-8).toUpperCase()}`,
      order,
      issuedAt: order.deliveredAt ?? order.updatedAt,
    };
  }
}
