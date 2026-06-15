// Ports for outbound calls. Fake implementations used in dev.
// Swap in server.ts when downstream services are available — zero changes to service.ts.

export interface NotificationPort {
  notify(event: string, userId: string, data: Record<string, string>): Promise<void>;
}

export class FakeNotificationPort implements NotificationPort {
  async notify(event: string, userId: string, data: Record<string, string>): Promise<void> {
    console.log(`[NOTIFY] ${event} → ${userId}`, data);
  }
}

// Real: POST /v1/notifications/send on notification-svc
export class HttpNotificationPort implements NotificationPort {
  constructor(private baseUrl: string) {}

  async notify(event: string, userId: string, data: Record<string, string>): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, event, channel: 'push', data }),
      });
    } catch {
      // fire-and-forget — notification failure must never fail an order operation
    }
  }
}
