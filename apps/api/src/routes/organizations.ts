import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const items = await prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
  res.json(items);
});

router.post("/", requireAuth, async (req, res) => {
  const S = z.object({
    id: z.string().optional(),

    code: z.string().min(2),
    name: z.string().min(2),
    isActive: z.boolean().optional(),

    // ✅ LOGO
    logoMediaId: z.string().optional().nullable(),
    logoUrl: z.string().optional().nullable(),

    // ✅ Branding / Contact
    color: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    emailDomain: z.string().optional().nullable(),

    // ✅ Legal
    vatNumber: z.string().optional().nullable(),
    licenseType: z.string().optional().nullable(),
    licenseNo: z.string().optional().nullable(),
    companyId: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),

    // ✅ Address
    addressLine1: z.string().optional().nullable(),
    addressLine2: z.string().optional().nullable(),
    buildingNumber: z.string().optional().nullable(),
    additionalNumber: z.string().optional().nullable(),
    district: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
  });

  const data = S.parse(req.body);

  const org = data.id
    ? await prisma.organization.update({
        where: { id: data.id },
        data: {
          code: data.code,
          name: data.name,
          isActive: data.isActive ?? true,

          logoMediaId: data.logoMediaId ?? null,
          logoUrl: data.logoUrl ?? null,

          color: data.color ?? null,
          phone: data.phone ?? null,
          mobile: data.mobile ?? null,
          email: data.email ?? null,
          website: data.website ?? null,
          emailDomain: data.emailDomain ?? null,

          vatNumber: data.vatNumber ?? null,
          licenseType: data.licenseType ?? null,
          licenseNo: data.licenseNo ?? null,
          companyId: data.companyId ?? null,
          currency: data.currency ?? null,

          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          buildingNumber: data.buildingNumber ?? null,
          additionalNumber: data.additionalNumber ?? null,
          district: data.district ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
          country: data.country ?? null,
        },
      })
    : await prisma.organization.create({
        data: {
          code: data.code,
          name: data.name,
          isActive: data.isActive ?? true,

          logoMediaId: data.logoMediaId ?? null,
          logoUrl: data.logoUrl ?? null,

          color: data.color ?? null,
          phone: data.phone ?? null,
          mobile: data.mobile ?? null,
          email: data.email ?? null,
          website: data.website ?? null,
          emailDomain: data.emailDomain ?? null,

          vatNumber: data.vatNumber ?? null,
          licenseType: data.licenseType ?? null,
          licenseNo: data.licenseNo ?? null,
          companyId: data.companyId ?? null,
          currency: data.currency ?? null,

          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          buildingNumber: data.buildingNumber ?? null,
          additionalNumber: data.additionalNumber ?? null,
          district: data.district ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
          country: data.country ?? null,
        },
      });

  res.json(org);
});

export default router;
