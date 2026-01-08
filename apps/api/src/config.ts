// apps/api/src/config.ts
import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "60m",
  jwtRefreshExpiresInDays: Number(
    process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30
  ),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  defaultAdminEmail:
    process.env.DEFAULT_ADMIN_EMAIL || "admin@example.com",
  defaultAdminPassword:
    process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123",
};
