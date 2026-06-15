# order-svc Implementation Guide

## Overview
Manages the full order lifecycle — from placement through delivery, cancellation, and refund — for HarvestConnect. Runs on **port 3004**.

---

## Stack
| Item | Version |
|------|---------|
| Fastify | ^5.8.5 |
| Zod | ^4.4.3 |
| TypeScript | ^6.0.3 |

---

## Architecture

```
routes.ts  →  service.ts  →  repository.ts (InMemoryOrderRepository)
                          →  ports.ts (NotificationPort)
```

---

## Key Design Decisions

### State Machine
Every status transition is validated against the `TRANSITIONS` map in `service.ts`. Invalid transitions throw `BadRequestError`.

```
pending_payment → confirmed | cancelled
confirmed       → processing | cancelled
processing      → dispatched
dispatched      → in_transit
in_transit      → delivered | refund_initiated
cancelled       → refunded
refund_initiated → refunded
```

`canTransition(from, to)` is the single source of truth.

### COD Fast-Path
Cash-on-delivery orders skip `pending_payment` and go directly to `confirmed` on placement. This avoids a spurious payment-pending state for a cash order.

### First-Order Discount
`placeOrder` applies a 5,000 paise (₹50) discount if the buyer has no prior orders. Discount is stored as `discountApplied` on the Order.

### Denormalized Snapshots
`OrderItem` stores `productName`, `sellerName`, and `unitPrice` at order time. This preserves order history even if catalog data changes later.

### Fire-and-Forget Notifications
All `notificationPort.send(...)` calls in `service.ts` are wrapped with `.catch(() => {})` so notification failures never fail order operations.

### Tracking Info
Set via `POST /v1/orders/:id/tracking` (called by logistics-svc after shipment creation). Stores `trackingId` and `partnerId` on the order.

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/orders` | Place a new order |
| GET | `/v1/orders` | List orders (filter: buyerId, sellerId, status) |
| GET | `/v1/orders/:id` | Get single order |
| PATCH | `/v1/orders/:id/status` | Advance order status |
| POST | `/v1/orders/:id/cancel` | Cancel order (with reason) |
| POST | `/v1/orders/:id/payment-callback` | Payment gateway result |
| POST | `/v1/orders/:id/tracking` | Set tracking ID from logistics |

---

## Seed Data

| ID | Status | Details |
|----|--------|---------|
| `order-001` | `delivered` | Multi-seller; subtotal 55500p, discount 5000p, total 54500p |
| `order-002` | `in_transit` | seller-103 (Pochampally); trackingId `HC2026000001` |
| `order-003` | `processing` | COD; seller-113 (Amma Kitchen) |

---

## Environment Variables

| Var | Default | Effect |
|-----|---------|--------|
| `NOTIFICATION_SVC_URL` | _(unset)_ | When set, switches to `HttpNotificationPort` |
| `PORT` | `3004` | Listening port |

---

## Files & Responsibilities

| File | Responsibility |
|------|----------------|
| `src/types.ts` | `OrderStatus`, `PaymentMethod`, `OrderItem`, `DeliveryAddress`, `Order` |
| `src/schemas.ts` | Zod schemas: place, updateStatus, cancel, paymentCallback, tracking |
| `src/errors.ts` | `AppError` hierarchy |
| `src/ports.ts` | `NotificationPort` + `FakeNotificationPort` + `HttpNotificationPort` |
| `src/repository.ts` | `InMemoryOrderRepository` with seed orders |
| `src/service.ts` | `OrderService` — state machine, COD fast-path, discount, callbacks |
| `src/routes.ts` | Route registration + `handleError` |
| `src/server.ts` | Dependency wiring, port 3004 |

---

## Changes Required When Real Services Are Available

### DB Available
| File | Change |
|------|--------|
| `src/repository.ts` | Swap `InMemoryOrderRepository` for a Postgres implementation |
| `src/server.ts` | Instantiate and inject the real repository |

### Notification-svc Available
| File | Change |
|------|--------|
| `src/server.ts` | Set `NOTIFICATION_SVC_URL` env var — automatically switches to `HttpNotificationPort` |
