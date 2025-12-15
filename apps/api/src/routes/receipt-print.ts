// apps/api/src/routes/receipt-print.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { buildReceiptText } from "../printing/receiptLayout";

const router = Router();

/* ------------ small helper for HTML escaping ------------ */
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------ shared helper to get receipt text --------- */

async function buildReceiptString(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: true,
          modifiers: true,
        },
      },
      payments: true,
      branch: true,
      customer: true,
    },
  });

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const settings = await prisma.posReceiptSettings.findFirst();
  if (!settings) {
    throw new Error("NO_RECEIPT_SETTINGS");
  }

  // ---------- safe number helper ----------
  const num = (v: any, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // ---------- map DB → OrderForReceipt ----------
  const orderForReceipt = {
    orderNo: order.orderNo,
    checkNo: order.checkNo ?? undefined,
    type: order.type as any,
    businessDate: order.businessDate,
    openedAt: order.openedAt,
    closedAt: order.closedAt,
    branchName: order.branch?.name ?? "Branch",
    branchCode: order.branch?.code ?? undefined,
    guests: order.guests,
    tableNo: order.tableNo ?? undefined,

    subtotal: num(order.subtotal),
    discountTotal: num(order.discountTotal),
    taxTotal: num(order.taxTotal),
    rounding:
      order.rounding !== null && order.rounding !== undefined
        ? num(order.rounding)
        : undefined,
    netTotal: num(order.netTotal),

    createdByName:
      (order as any).createdByName ??
      (order as any).createdBy ??
      undefined,
    closedByName:
      (order as any).closedByName ??
      (order as any).closedBy ??
      undefined,

    customerName: order.customer?.name ?? undefined,
    customerPhone: order.customer?.phone ?? undefined,

    items: order.items.map((it) => {
      const quantity = num((it as any).quantity ?? (it as any).qty ?? 1, 1);
      const unitPrice = num((it as any).unitPrice ?? (it as any).price ?? 0);
      const totalPrice = num(
        (it as any).totalPrice ??
          (it as any).lineTotal ??
          (it as any).netTotal ??
          quantity * unitPrice
      );

      return {
        productName: it.productName ?? it.product?.name ?? "",
        productNameLocalized:
          (it as any).productNameLocalized ??
          (it.product as any)?.nameLocalized ??
          null,
        quantity,
        unitPrice,
        totalPrice,
        calories: (it as any).calories ?? null,
        modifiers: ((it as any).modifiers || []).map((m: any) => ({
          name: m.name,
          price: num(m.price),
          isDefault: m.isDefault ?? false,
        })),
        discountAmount: num((it as any).discountAmount, 0),
      };
    }),

    payments: (order.payments || []).map((p: any) => ({
      method: p.method,
      amount: num(p.amount),
    })),
  };

  const receiptSettings = {
    logoUrl: settings.logoUrl,
    printLanguage: settings.printLanguage as any,
    mainLanguage: settings.mainLanguage,
    localizedLanguage: settings.localizedLanguage ?? null,
    receiptHeader: settings.receiptHeader ?? "",
    receiptFooter: settings.receiptFooter ?? "",
    invoiceTitle: settings.invoiceTitle ?? "Simplified Tax Invoice",
    showOrderNumber: settings.showOrderNumber,
    showCalories: settings.showCalories,
    showSubtotal: settings.showSubtotal,
    showRounding: settings.showRounding,
    showCloserUsername: settings.showCloserUsername,
    showCreatorUsername: settings.showCreatorUsername,
    showCheckNumber: settings.showCheckNumber,
    hideFreeModifierOptions: settings.hideFreeModifierOptions,
    printCustomerPhoneInPickup: settings.printCustomerPhoneInPickup,
  };

  const text = buildReceiptText(orderForReceipt, receiptSettings, {
    widthChars: 42, // 58mm: 32, 80mm: 42–48
    brandName: "SADI",
  });

  return { text, orderNo: order.orderNo };
}

/**
 * GET /pos/orders/:id/receipt-text
 * Plain-text receipt for POS / thermal printers
 */
router.get("/pos/orders/:id/receipt-text", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { text } = await buildReceiptString(id);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(text);
  } catch (err: any) {
    console.error("GET /pos/orders/:id/receipt-text error", err);
    if (err.message === "ORDER_NOT_FOUND") {
      return res.status(404).json({ message: "Order not found" });
    }
    if (err.message === "NO_RECEIPT_SETTINGS") {
      return res
        .status(500)
        .json({ message: "Receipt settings not configured" });
    }
    res.status(500).json({ message: "Failed to build receipt" });
  }
});

/**
 * GET /pos/orders/:id/receipt-html
 * Same layout, but wrapped in HTML <pre> for browser printing
 */
router.get("/pos/orders/:id/receipt-html", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { text, orderNo } = await buildReceiptString(id);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt ${orderNo}</title>
  <style>
    @page {
      size: 80mm auto; /* 🔸 80mm paper width */
      margin: 0;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 12px 0;
      display: flex;
      justify-content: center;
      background: #f3f4f6;
      font-family: "Courier New", monospace;
    }
    .page {
      background: white;
      padding: 8px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
    }
    .ticket {
      width: 80mm;        /* 🔸 visual width matches paper */
      max-width: 80mm;
      margin: 0 auto;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      justify-content: flex-end;
    }
    .btn {
      border: none;
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary {
      background: #000000;
      color: #ffffff;
    }
    .btn-outline {
      background: #ffffff;
      color: #111827;
      border: 1px solid #e5e7eb;
    }
    .receipt-box {
      border-radius: 6px;
      border: 1px dashed #d1d5db;
      padding: 6px;
      background: #ffffff;
    }
    pre {
      margin: 0;
      white-space: pre;
      font-family: "Courier New", monospace;
      font-size: 11px;
      line-height: 1.3;
    }

    /* Print view: hide buttons, full white background */
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .page {
        box-shadow: none;
        border-radius: 0;
        padding: 0;
      }
      .actions {
        display: none;
      }
      .receipt-box {
        border: none;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="ticket">
      <div class="actions">
        <button class="btn btn-outline" onclick="window.close()">Close</button>
        <button class="btn btn-outline" onclick="window.print()">Print</button>
        <button class="btn btn-primary" id="downloadPdfBtn">Download PDF</button>
      </div>
      <div class="receipt-box">
        <pre id="receiptText">${escapeHtml(text)}</pre>
      </div>
    </div>
  </div>

  <!-- jsPDF from CDN for PDF download -->
    <!-- jsPDF from CDN for PDF download -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script>
    (function () {
      const btn = document.getElementById('downloadPdfBtn');
      if (!btn) return;

      btn.addEventListener('click', function () {
        // Try both globals: UMD (window.jspdf.jsPDF) and classic (window.jsPDF)
        var jsPDFCtor = null;
        if (window.jspdf && window.jspdf.jsPDF) {
          jsPDFCtor = window.jspdf.jsPDF;
        } else if (window.jsPDF) {
          jsPDFCtor = window.jsPDF;
        }

        if (!jsPDFCtor) {
          alert('PDF library not available.');
          return;
        }

        var doc = new jsPDFCtor({
          orientation: 'portrait',
          unit: 'mm',
          // 🔸 80mm width, 200mm height
          format: [80, 200],
        });

        var textEl = document.getElementById('receiptText');
        var rawText = textEl ? textEl.innerText : '';

        var marginLeft = 3;
        var marginTop = 4;
        var contentWidth = 80 - marginLeft * 2;

        var lines = doc.splitTextToSize(rawText, contentWidth);
        doc.text(lines, marginLeft, marginTop);

        doc.save('receipt-${orderNo}.pdf');
      });
    })();
  </script>

</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err: any) {
    console.error("GET /pos/orders/:id/receipt-html error", err);
    if (err.message === "ORDER_NOT_FOUND") {
      return res.status(404).send("Order not found");
    }
    if (err.message === "NO_RECEIPT_SETTINGS") {
      return res.status(500).send("Receipt settings not configured");
    }
    res.status(500).send("Failed to build receipt");
  }
});

export default router;
