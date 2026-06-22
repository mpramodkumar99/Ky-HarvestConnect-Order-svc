import { randomUUID } from 'node:crypto';
import { eq, and, ne, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import type { OrderRepository } from '../repository.js';
import type { Order, OrderStatus, OrderItem, DeliveryAddress } from '../types.js';

type Db = NodePgDatabase<typeof schema>;

function toOrder(row: typeof schema.orders.$inferSelect): Order {
  return {
    id:                row.id,
    buyerId:           row.buyerId,
    buyerName:         row.buyerName,
    buyerPhone:        row.buyerPhone,
    items:             row.items as OrderItem[],
    deliveryAddress:   row.deliveryAddress as DeliveryAddress,
    subtotal:          row.subtotal,
    deliveryFee:       row.deliveryFee,
    discount:          row.discount,
    total:             row.total,
    paymentMethod:     row.paymentMethod as Order['paymentMethod'],
    paymentId:         row.paymentId ?? undefined,
    status:            row.status as OrderStatus,
    trackingId:        row.trackingId ?? undefined,
    estimatedDelivery: row.estimatedDelivery ?? undefined,
    cancelledAt:          row.cancelledAt ?? undefined,
    cancelReason:         row.cancelReason ?? undefined,
    packedAt:             row.packedAt ?? undefined,
    deliveredAt:          row.deliveredAt ?? undefined,
    returnWindowDays:     row.returnWindowDays,
    returnWindowClosedAt: row.returnWindowClosedAt ?? undefined,
    returnRequestedAt:    row.returnRequestedAt ?? undefined,
    returnReason:         row.returnReason ?? undefined,
    createdAt:            row.createdAt.toISOString(),
    updatedAt:            row.updatedAt.toISOString(),
  };
}

export class PgOrderRepository implements OrderRepository {
  constructor(private db: Db) {}

  async create(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const [row] = await this.db.insert(schema.orders).values({
      id:                randomUUID(),
      buyerId:           data.buyerId,
      buyerName:         data.buyerName,
      buyerPhone:        data.buyerPhone,
      items:             data.items,
      deliveryAddress:   data.deliveryAddress,
      subtotal:          data.subtotal,
      deliveryFee:       data.deliveryFee,
      discount:          data.discount,
      total:             data.total,
      paymentMethod:     data.paymentMethod,
      paymentId:         data.paymentId,
      status:            data.status,
      trackingId:        data.trackingId,
      estimatedDelivery: data.estimatedDelivery,
      cancelledAt:       data.cancelledAt,
      cancelReason:      data.cancelReason,
      deliveredAt:       data.deliveredAt,
    }).returning();
    return toOrder(row!);
  }

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db.select().from(schema.orders).where(eq(schema.orders.id, id));
    return row ? toOrder(row) : null;
  }

  async findAll(filters?: { buyerId?: string; sellerId?: string; status?: OrderStatus }): Promise<Order[]> {
    const conditions = [];
    if (filters?.buyerId) conditions.push(eq(schema.orders.buyerId, filters.buyerId));
    if (filters?.status)  conditions.push(eq(schema.orders.status, filters.status));

    const rows = conditions.length > 0
      ? await this.db.select().from(schema.orders).where(and(...conditions)).orderBy(desc(schema.orders.createdAt))
      : await this.db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt));

    let results = rows.map(toOrder);
    // sellerId filter: check items array in JS since it's a JSONB field
    if (filters?.sellerId) {
      results = results.filter(o => o.items.some(i => i.sellerId === filters.sellerId));
    }
    return results;
  }

  async update(id: string, patch: Partial<Order>): Promise<Order | null> {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...updateFields } = patch;
    const [row] = await this.db.update(schema.orders)
      .set({ ...updateFields, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    return row ? toOrder(row) : null;
  }

  async countByBuyer(buyerId: string): Promise<number> {
    const rows = await this.db.select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.buyerId, buyerId),
        ne(schema.orders.status, 'cancelled'),
      ));
    return rows.length;
  }
}
