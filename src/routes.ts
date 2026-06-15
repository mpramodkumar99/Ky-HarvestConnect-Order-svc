import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { OrderService } from './service.js';
import {
  placeOrderSchema, updateStatusSchema, cancelOrderSchema,
  paymentCallbackSchema, trackingUpdateSchema,
} from './schemas.js';
import { AppError } from './errors.js';
import type { OrderStatus } from './types.js';

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      success: false,
      error: { type: err.name, title: err.message, status: err.statusCode },
    });
  }
  if (err instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: { type: 'validation_error', title: 'Validation error', status: 400, detail: err.flatten().fieldErrors },
    });
  }
  console.error(err);
  return reply.status(500).send({ success: false, error: { type: 'internal_error', title: 'Internal server error', status: 500 } });
}

export function registerOrderRoutes(app: FastifyInstance, service: OrderService) {

  // POST /v1/orders
  app.post('/v1/orders', async (request, reply) => {
    try {
      const body  = placeOrderSchema.parse(request.body);
      const order = await service.placeOrder(body);
      return reply.status(201).send({ success: true, data: order });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /v1/orders?buyerId=&sellerId=&status=
  app.get('/v1/orders', async (request, reply) => {
    try {
      const { buyerId, sellerId, status } = request.query as {
        buyerId?: string; sellerId?: string; status?: string;
      };
      const orders = await service.listOrders({ buyerId, sellerId, status: status as OrderStatus | undefined });
      return reply.send({ success: true, data: orders, meta: { total: orders.length } });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /v1/orders/:id
  app.get('/v1/orders/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const order  = await service.getOrder(id);
      return reply.send({ success: true, data: order });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/orders/:id/status
  app.patch('/v1/orders/:id/status', async (request, reply) => {
    try {
      const { id }  = request.params as { id: string };
      const body    = updateStatusSchema.parse(request.body);
      const updated = await service.updateStatus(id, body.status, body.reason);
      return reply.send({ success: true, data: updated });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/orders/:id/cancel
  app.post('/v1/orders/:id/cancel', async (request, reply) => {
    try {
      const { id }  = request.params as { id: string };
      const body    = cancelOrderSchema.parse(request.body);
      const updated = await service.cancelOrder(id, body.reason);
      return reply.send({ success: true, data: updated });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/orders/:id/payment-callback  (called by payment-svc)
  app.post('/v1/orders/:id/payment-callback', async (request, reply) => {
    try {
      const { id }  = request.params as { id: string };
      const body    = paymentCallbackSchema.parse(request.body);
      const updated = await service.handlePaymentCallback(id, body.success, body.paymentId, body.reason);
      return reply.send({ success: true, data: updated });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/orders/:id/tracking  (called by logistics-svc on dispatch)
  app.post('/v1/orders/:id/tracking', async (request, reply) => {
    try {
      const { id }  = request.params as { id: string };
      const body    = trackingUpdateSchema.parse(request.body);
      const updated = await service.setTrackingInfo(id, body.trackingId, body.estimatedDelivery);
      return reply.send({ success: true, data: updated });
    } catch (err) { return handleError(err, reply); }
  });
}
