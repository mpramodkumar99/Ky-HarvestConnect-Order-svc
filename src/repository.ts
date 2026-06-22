import { randomUUID } from 'node:crypto';
import type { Order, OrderStatus } from './types.js';

export interface OrderRepository {
  create(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findAll(filters?: { buyerId?: string; sellerId?: string; status?: OrderStatus }): Promise<Order[]>;
  update(id: string, patch: Partial<Order>): Promise<Order | null>;
  countByBuyer(buyerId: string): Promise<number>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private store = new Map<string, Order>();

  constructor() { this.seed(); }

  async create(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const now   = new Date().toISOString();
    const order: Order = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
    this.store.set(order.id, order);
    return order;
  }

  async findById(id: string): Promise<Order | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filters?: { buyerId?: string; sellerId?: string; status?: OrderStatus }): Promise<Order[]> {
    let results = [...this.store.values()];
    if (filters?.buyerId)  results = results.filter(o => o.buyerId === filters.buyerId);
    if (filters?.sellerId) results = results.filter(o => o.items.some(i => i.sellerId === filters.sellerId));
    if (filters?.status)   results = results.filter(o => o.status === filters.status);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, patch: Partial<Order>): Promise<Order | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Order = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }

  async countByBuyer(buyerId: string): Promise<number> {
    return [...this.store.values()].filter(o => o.buyerId === buyerId && o.status !== 'cancelled').length;
  }

  private seed() {
    const addr = {
      label: 'Home', line1: 'Plot 123', city: 'Hyderabad',
      district: 'Hyderabad', state: 'Telangana', pincode: '500072',
      lat: 17.485, lng: 78.399,
    };
    const orders: Order[] = [
      {
        id: 'order-001',
        buyerId: 'user-b001', buyerName: 'Priya Sharma', buyerPhone: '+919000000001',
        items: [
          { productId: 'prod-turmeric-001', productName: 'Turmeric (Nizamabad Gold)', sellerId: 'seller-105', sellerName: 'Spice Route Nizamabad', quantity: 2, unitPrice: 18000, totalPrice: 36000, unit: 'kg' },
          { productId: 'prod-milk-001', productName: 'Fresh Cow Milk', sellerId: 'seller-112', sellerName: 'Desi Dairy Armoor', quantity: 3, unitPrice: 6500, totalPrice: 19500, unit: 'litre' },
        ],
        deliveryAddress: addr,
        subtotal: 55500, deliveryFee: 4000, discount: 5000, total: 54500,
        paymentMethod: 'upi', paymentId: 'pay-mock-001',
        status: 'delivered', deliveredAt: '2026-06-10T14:00:00.000Z',
        returnWindowDays: 7, returnWindowClosedAt: '2026-06-17T14:00:00.000Z',
        createdAt: '2026-06-09T10:00:00.000Z', updatedAt: '2026-06-10T14:00:00.000Z',
      },
      {
        id: 'order-002',
        buyerId: 'user-b001', buyerName: 'Priya Sharma', buyerPhone: '+919000000001',
        items: [
          { productId: 'prod-ikat-001', productName: 'Handwoven Ikat Saree', sellerId: 'seller-103', sellerName: 'Pochampally Weavers', quantity: 1, unitPrice: 349900, totalPrice: 349900, unit: 'piece' },
        ],
        deliveryAddress: addr,
        subtotal: 349900, deliveryFee: 4000, discount: 0, total: 353900,
        paymentMethod: 'card', paymentId: 'pay-mock-002',
        status: 'in_transit', trackingId: 'HC2026000001', estimatedDelivery: '2026-06-16',
        returnWindowDays: 7,
        createdAt: '2026-06-12T08:00:00.000Z', updatedAt: '2026-06-13T10:00:00.000Z',
      },
      {
        id: 'order-003',
        buyerId: 'user-b001', buyerName: 'Priya Sharma', buyerPhone: '+919000000001',
        items: [
          { productId: 'prod-pickle-001', productName: 'Avakaya (Mango Pickle)', sellerId: 'seller-113', sellerName: 'Amma Kitchen', quantity: 2, unitPrice: 22000, totalPrice: 44000, unit: '500g' },
        ],
        deliveryAddress: addr,
        subtotal: 44000, deliveryFee: 4000, discount: 0, total: 48000,
        paymentMethod: 'cod',
        status: 'processing',
        returnWindowDays: 7,
        createdAt: '2026-06-13T06:00:00.000Z', updatedAt: '2026-06-13T09:00:00.000Z',
      },
    ];
    for (const o of orders) this.store.set(o.id, o);
  }
}
