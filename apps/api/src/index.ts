// apps/api/src/index.ts
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import * as http from 'http';

import { prisma } from './db';
import { config } from './config';
import { hash } from './utils/crypto';
import sessionRouter from "./routes/session";
import organizationsRouter from './routes/organizations';
import brandsRouter from './routes/brands';
import organizationMediaRouter from "./routes/organization-media";
import brandSettings from "./routes/brand-settings";
import brandSettingsRouter from "./routes/brand-settings";
import authRoutes from './routes/auth';
import deviceRoutes from './routes/devices';
import branchRoutes from './routes/branches';
import menuRoutes from './routes/menu';
import pricingRoutes from "./routes/pricing";
import orderRoutes from './routes/orders';
import { initWebSocket } from './ws';
import dashRoutes from './routes/dash';
import callcenterRoutes from './routes/callcenter';
import taxesRoutes from './routes/taxes';
import roleRoutes from './routes/roles';
import userRoutes from './routes/users';
import deviceSettingsRoutes from './routes/deviceSettings';
import devicesRouter from './routes/devices';
import paymentMethodsRoutes from './routes/paymentMethods';
import posConfigRoutes from './routes/pos-config';
import posSyncRouter from './routes/pos-sync';
import posSettingsRouter from './routes/pos-settings';
import discountsRouter from './routes/discounts';
import receiptSettingsRoutes from "./routes/receipt-settings";
import uploadReceiptLogoRoute from "./routes/upload-receipt-logo";
import callCenterSettingsRoutes from "./routes/callcenter-settings";
import cashierSettingsRoutes from "./routes/cashier-settings";
import displaySettingsRoutes from "./routes/display-settings";
import kitchenSettingsRoutes from "./routes/kitchen-settings";
import inventorySettingsRoutes from "./routes/inventory-settings";
import receiptPrintRoutes from "./routes/receipt-print";
import posOrdersRouter from './routes/pos-orders';
import customersRouter from "./routes/customers";
import promotionsRouter from './routes/promotions';
import productSizesRouter from './routes/product-sizes';




console.log(
  'DB:',
  process.env.DATABASE_URL?.replace(/\/\/.*?:.*?@/, '//****:****@'),
);

/* ------------------------------------------------------------------ */
/* Seed default Admin role + user (idempotent)                        */
/* ------------------------------------------------------------------ */

async function seedDefaultAdmin() {
  try {
    const email = config.defaultAdminEmail ?? 'admin@example.com';
    const plainPassword = config.defaultAdminPassword ?? 'Admin@123';

    // 1️⃣ Ensure Admin role exists
    const adminRole = await prisma.role.upsert({
      where: { name: 'Admin' },
      update: {},
      create: {
        name: 'Admin',
        description: 'System administrator',
        permissions: [], // Json field
      },
    });

    // 2️⃣ Ensure admin user exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          name: 'Admin',
          email,
          passwordHash: hash(plainPassword),
          isActive: true,
          // 🔗 connect relation instead of old string enum
          role: {
            connect: { id: adminRole.id },
          },
        },
      });

      console.log('✅ Created default admin user:', email);
    } else {
      console.log('ℹ️ Default admin user already exists:', email);
    }
  } catch (e) {
    console.error('Seeding default admin failed (continuing):', e);
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                          */
/* ------------------------------------------------------------------ */

async function bootstrap() {
  await prisma.$connect();

  const app = express();

  // --- core middleware (define once) ---
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  // health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // static
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // --- routes ---
  app.use("/", sessionRouter);
  app.use("/organizations", organizationsRouter);
  app.use("/organizations/media", organizationMediaRouter);
  app.use("/brands", brandsRouter);
  app.use("/brand-settings", brandSettings);
  app.use('/roles', roleRoutes);
  app.use('/users', userRoutes);
  app.use('/auth', authRoutes);
  app.use('/devices', deviceRoutes);
  app.use("/branches", branchRoutes);

console.log(
  "branches routes:",
  (branchRoutes as any)?.stack?.map((l: any) => l?.route && `${Object.keys(l.route.methods).join(",").toUpperCase()} ${l.route.path}`).filter(Boolean)
);
  app.use('/menu', menuRoutes);
  app.use("/pricing", pricingRoutes);
  app.use('/orders', orderRoutes);
  app.use('/dash', dashRoutes);
  app.use('/api/callcenter', callcenterRoutes);
  app.use('/settings', taxesRoutes);
  app.use(deviceSettingsRoutes);
  app.use('/api/devices', devicesRouter);
  app.use('/payment-methods', paymentMethodsRoutes);
  app.use('/pos', posConfigRoutes);
  app.use('/pos/sync', posSyncRouter);
  app.use('/api/pos-settings', posSettingsRouter);
  app.use('/discounts', discountsRouter);
  app.use("/receipt-settings", receiptSettingsRoutes);
  app.use("/upload", uploadReceiptLogoRoute);
  app.use("/callcenter-settings", callCenterSettingsRoutes);
  app.use("/cashier-settings", cashierSettingsRoutes);
  app.use("/display-settings", displaySettingsRoutes);
  app.use("/kitchen-settings", kitchenSettingsRoutes);
  app.use("/inventory-settings", inventorySettingsRoutes);
  app.use(receiptPrintRoutes);
  app.use('/pos', posOrdersRouter);
  app.use("/api", customersRouter);
  app.use('/promotions', promotionsRouter);
  app.use('/product-sizes', productSizesRouter);
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  
  
  const port = Number(process.env.PORT || config.port || 4000);

  // seed default admin (run before server starts listening)
  await seedDefaultAdmin();

  // create HTTP server + attach WebSocket
  const server = http.createServer(app);
  initWebSocket(server); // start socket.io / WS on same port
  console.log("PID", process.pid, "PORT", port);
  server.listen(port, () => {
    console.log(`API + WS listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
