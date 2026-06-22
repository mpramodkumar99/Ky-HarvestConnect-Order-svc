import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryOrderRepository } from './repository.js';
import { PgOrderRepository } from './db/pg-repository.js';
import { db } from './db/client.js';
import { FakeNotificationPort, HttpNotificationPort } from './ports.js';
import { OrderService } from './service.js';
import { registerOrderRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Admin-Key'],
    credentials: true,
  });

  const usePostgres = Boolean(process.env['DATABASE_URL']);
  const orderRepo   = usePostgres ? new PgOrderRepository(db) : new InMemoryOrderRepository();
  const notificationPort = process.env['NOTIFICATION_SVC_URL']
    ? new HttpNotificationPort(process.env['NOTIFICATION_SVC_URL']) // → live notification-svc
    : new FakeNotificationPort();                               // → dev console log

  const service = new OrderService(orderRepo, notificationPort);
  registerOrderRoutes(app, service);

  app.get('/health', async () => ({ status: 'ok', service: 'order-svc' }));

  const PORT = 3004;
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`order-svc storage: ${usePostgres ? 'PostgreSQL' : 'in-memory'}`);
  console.log(`order-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
