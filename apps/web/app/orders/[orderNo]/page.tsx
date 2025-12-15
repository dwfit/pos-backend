"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type OrderItem = {
  id?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  totalPrice: number;
};

type OrderTax = {
  name: string;
  amount: number;
};

type OrderPayment = {
  method: string;
  amount: number;
  addedAt?: string;
  reference?: string;
};

type OrderDetail = {
  id: string;
  orderNo: string;
  status?: string;

  // header
  businessDate?: string;
  type?: string;
  source?: string;
  branchName?: string;
  dueAt?: string;
  openedAt?: string;
  closedAt?: string;
  guests?: number | null;
  createdBy?: string;
  closedBy?: string;
  customerName?: string;
  checkNumber?: string;

  // money
  subtotal?: number;
  discountTotal?: number;
  chargesTotal?: number;
  taxTotal?: number;
  roundingAmount?: number;
  netTotal?: number;
  discountKind?: string | null; // 👈 order-level discount type

  items: OrderItem[];
  taxes: OrderTax[];
  payments: OrderPayment[];

  zatcaStatus?: string;
  zatcaError?: string;
  zatcaQrBase64?: string;
};

type ReceiptSettings = {
  logoUrl?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  invoiceTitle?: string | null;
  branchName?: string | null;
};

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number | undefined | null) {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
  }).format(n || 0);
}

function formatDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("en-SA", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/* HTML builders for print layouts                                    */
/* ------------------------------------------------------------------ */

function buildSimplifiedHtml(
  order: OrderDetail,
  settings?: ReceiptSettings | null
) {
  const logo = settings?.logoUrl || "";
  const headerText = settings?.receiptHeader || "";
  const footerText = settings?.receiptFooter || "";
  const invoiceTitle = settings?.invoiceTitle || "Simplified Tax Invoice";

  const itemsRows = order.items
    .map(
      (i, idx) => `
      <tr>
        <td style="padding:2px 0;">${idx + 1}</td>
        <td style="padding:2px 0;">${i.productName}</td>
        <td style="padding:2px 0; text-align:center;">${i.quantity}</td>
        <td style="padding:2px 0; text-align:right;">${money(i.unitPrice)}</td>
        <td style="padding:2px 0; text-align:right;">${money(i.totalPrice)}</td>
      </tr>
    `
    )
    .join("");

  const totalItems = order.items.reduce(
    (sum, i) => sum + (i.quantity || 0),
    0
  );
  const totalPaid = order.payments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );
  const change = (totalPaid || 0) - (order.netTotal || 0);

  const qrImg =
    order.zatcaQrBase64 && order.zatcaQrBase64 !== ""
      ? `<img src="data:image/png;base64,${
          order.zatcaQrBase64
        }" style="width:160px;height:160px;margin:12px auto 4px;display:block;" />`
      : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Receipt ${order.orderNo}</title>
<style>
  @page { margin: 5mm; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
  }
  .ticket {
    width: 260px;
    margin: 0 auto;
  }
  .center { text-align:center; }
  .bold { font-weight:600; }
  .line { border-top:1px dashed #000; margin:4px 0; }
  table { width:100%; border-collapse:collapse; }
</style>
</head>
<body onload="window.print(); window.close();">
<div class="ticket">
  ${
    logo
      ? `<div class="center"><img src="${logo}" style="max-width:120px;max-height:80px;" /></div>`
      : ""
  }
  <div class="center bold" style="margin-top:4px;">
    ${settings?.branchName || order.branchName || ""}
  </div>
  ${
    headerText
      ? `<div class="center" style="margin-top:2px;">${headerText}</div>`
      : ""
  }
  <div class="line"></div>
  <div class="center bold" style="margin:4px 0;">${invoiceTitle}</div>
  <div class="line"></div>

  <table style="margin-top:4px;">
    <tr><td>Bill Number</td><td style="text-align:right;">${
      order.orderNo
    }</td></tr>
    <tr><td>Invoice Date</td><td style="text-align:right;">${formatDateTime(
      order.closedAt || order.openedAt || order.businessDate
    )}</td></tr>
    ${
      order.createdBy
        ? `<tr><td>Employee</td><td style="text-align:right;">${order.createdBy}</td></tr>`
        : ""
    }
    ${
      order.customerName
        ? `<tr><td>Customer</td><td style="text-align:right;">${order.customerName}</td></tr>`
        : ""
    }
  </table>

  <div class="line"></div>
  <table style="margin-top:4px; font-size:11px;">
    <thead>
      <tr class="bold">
        <th style="text-align:left;">#</th>
        <th style="text-align:left;">Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Price</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${
        itemsRows ||
        `<tr><td colspan="5" style="padding:6px 0;text-align:center;">No items</td></tr>`
      }
    </tbody>
  </table>
  <div class="line"></div>

  <table style="margin-top:4px;">
    <tr><td>Total Items</td><td style="text-align:right;">${totalItems}</td></tr>
    <tr><td>Subtotal</td><td style="text-align:right;">${money(
      order.subtotal
    )}</td></tr>
    <tr><td>Discount</td><td style="text-align:right;">${money(
      order.discountTotal
    )}</td></tr>
    <tr><td>Tax</td><td style="text-align:right;">${money(
      order.taxTotal
    )}</td></tr>
    <tr><td class="bold">Total Due</td><td style="text-align:right;" class="bold">${money(
      order.netTotal
    )}</td></tr>
  </table>

  <div class="line"></div>
  <table style="margin-top:4px;">
    <tr><td>Cash / Card</td><td style="text-align:right;">${money(
      totalPaid
    )}</td></tr>
    <tr><td>Change</td><td style="text-align:right;">${money(change)}</td></tr>
  </table>

  ${qrImg}
  ${
    footerText
      ? `<div class="center" style="margin-top:4px;">${footerText}</div>`
      : ""
  }
  ${
    logo
      ? `<div class="center" style="margin-top:4px;"><img src="${logo}" style="max-width:100px;opacity:0.8;" /></div>`
      : ""
  }
</div>
</body>
</html>
`;
}

function buildStandardHtml(
  order: OrderDetail,
  settings?: ReceiptSettings | null
) {
  const logo = settings?.logoUrl || "";
  const headerText = settings?.receiptHeader || "";
  const footerText = settings?.receiptFooter || "";
  const invoiceTitle =
    settings?.invoiceTitle || "TAX INVOICE / فاتورة ضريبية";

  const itemsRows = order.items
    .map(
      (i, idx) => `
      <tr>
        <td style="border:1px solid #ccc; padding:4px 6px; text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #ccc; padding:4px 6px;">${i.productName}</td>
        <td style="border:1px solid #ccc; padding:4px 6px; text-align:center;">${
          i.quantity
        }</td>
        <td style="border:1px solid #ccc; padding:4px 6px; text-align:right;">${money(
          i.unitPrice
        )}</td>
        <td style="border:1px solid #ccc; padding:4px 6px; text-align:right;">${money(
          i.totalPrice
        )}</td>
      </tr>
    `
    )
    .join("");

  const totalPaid = order.payments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );

  const qrImg =
    order.zatcaQrBase64 && order.zatcaQrBase64 !== ""
      ? `<img src="data:image/png;base64,${
          order.zatcaQrBase64
        }" style="width:180px;height:180px;display:block;margin:auto;" />`
      : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice ${order.orderNo}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    color:#111827;
  }
  .header-grid {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:16px;
  }
  .box {
    border:1px solid #9ca3af;
    padding:8px 10px;
    border-radius:4px;
  }
  .box-title {
    font-weight:600;
    font-size:12px;
    border-bottom:1px solid #9ca3af;
    padding-bottom:4px;
    margin-bottom:4px;
  }
  table { border-collapse:collapse; width:100%; }
  th {
    background:#f3f4f6;
    border:1px solid #d1d5db;
    padding:4px 6px;
    font-size:11px;
    text-align:left;
  }
  .totals-table td {
    padding:3px 4px;
  }
  .btn {
    background:#000;
    color:#fff;
    border-radius:6px;
    padding:8px 14px;
    border:none;
    margin-left:8px;
    cursor:pointer;
    font-size:12px;
  }
</style>
</head>
<body>
<div id="invoiceContainer" style="max-width:800px;margin:0 auto;">

  <!-- Top actions (screen only, will be hidden for PDF) -->
  <div id="topActions" style="text-align:right; margin:8px 0 12px;">
    <button class="btn" onclick="window.print()">Print</button>
    <button id="downloadA4PdfBtn" class="btn">Download PDF</button>
  </div>

  <div className="header-grid">
    <div style="display:flex;gap:12px;align-items:center;">
      ${
        logo
          ? `<img src="${logo}" style="width:90px;height:auto;object-fit:contain;" />`
          : ""
      }
      <div>
        <div style="font-size:16px;font-weight:700;">${
          settings?.branchName || order.branchName || ""
        }</div>
        ${
          headerText
            ? `<div style="font-size:11px;margin-top:4px;">${headerText}</div>`
            : ""
        }
      </div>
    </div>
    <div style="text-align:right;font-size:11px;">
      <div>Bill #: <strong>${order.orderNo}</strong></div>
      <div>Date: <strong>${formatDateTime(
        order.closedAt || order.openedAt || order.businessDate
      )}</strong></div>
      ${
        order.customerName
          ? `<div>Customer: <strong>${order.customerName}</strong></div>`
          : ""
      }
    </div>
  </div>

  <h2 style="margin:16px 0 8px; text-align:center; font-size:14px; font-weight:700;">
    ${invoiceTitle}
  </h2>

  <div style="display:flex; gap:12px; margin-top:8px;">
    <div style="flex:1;" class="box">
      <div class="box-title">Invoice Details / تفاصيل الفاتورة</div>
      <table style="font-size:11px;">
        <tr><td>Invoice No:</td><td>${order.orderNo}</td></tr>
        <tr><td>Invoice Date:</td><td>${formatDateTime(
          order.closedAt || order.openedAt || order.businessDate
        )}</td></tr>
        <tr><td>Type:</td><td>${order.type || ""}</td></tr>
        <tr><td>Source:</td><td>${order.source || ""}</td></tr>
        ${
          order.createdBy
            ? `<tr><td>Employee:</td><td>${order.createdBy}</td></tr>`
            : ""
        }
      </table>
    </div>

    <div style="flex:1;" class="box">
      <div class="box-title">Customer Details / تفاصيل العميل</div>
      <table style="font-size:11px;">
        <tr><td>Name:</td><td>${order.customerName || "-"}</td></tr>
        <tr><td>Branch:</td><td>${order.branchName || "-"}</td></tr>
      </table>
    </div>

    <div style="width:190px; text-align:center;" class="box">
      ${qrImg || "<div style='font-size:10px;margin-top:60px;'>QR Code</div>"}
    </div>
  </div>

  <div style="margin-top:16px;">
    <table>
      <thead>
        <tr>
          <th style="width:40px;text-align:center;">#</th>
          <th>Item Description / البيان</th>
          <th style="width:60px;text-align:center;">Qty</th>
          <th style="width:80px;text-align:right;">Price</th>
          <th style="width:90px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${
          itemsRows ||
          `<tr><td colspan="5" style="border:1px solid #d1d5db;padding:6px;text-align:center;">No items</td></tr>`
        }
      </tbody>
    </table>
  </div>

  <div style="display:flex; gap:16px; margin-top:16px;">
    <div style="flex:1;" class="box">
      <div class="box-title">Amount Invoiced / المبالغ المفوترة</div>
      <div style="font-size:11px; margin-top:4px;">
        Total Items: ${order.items.length}<br/>
        Total Paid: ${money(totalPaid)}
      </div>
    </div>

    <div style="flex:1;" class="box">
      <div class="box-title">Totals / الإجماليات</div>
      <table class="totals-table" style="font-size:11px;width:100%;">
        <tr><td>Total (Excl. VAT)</td><td style="text-align:right;">${money(
          order.subtotal
        )}</td></tr>
        <tr><td>Discount</td><td style="text-align:right;">${money(
          order.discountTotal
        )}</td></tr>
        <tr><td>Taxable Amount</td><td style="text-align:right;">${money(
          order.subtotal
        )}</td></tr>
        <tr><td>Total VAT</td><td style="text-align:right;">${money(
          order.taxTotal
        )}</td></tr>
        <tr style="font-weight:600;"><td>Total Amount</td><td style="text-align:right;">${money(
          order.netTotal
        )}</td></tr>
      </table>
    </div>
  </div>

  <div style="margin-top:24px; font-size:10px; display:flex; justify-content:space-between;">
    <div>Sales Manager: ____________________</div>
    <div>Accountant: ____________________</div>
    <div>Receivers: ____________________</div>
  </div>

  <div style="margin-top:16px; font-size:10px; text-align:center;">
    ${footerText || ""}
  </div>

  ${
    logo
      ? `<div style="margin-top:6px; text-align:center;"><img src="${logo}" style="height:26px;object-fit:contain;opacity:0.9;" /></div>`
      : ""
  }
</div>

<!-- html2pdf (bundles jsPDF + html2canvas) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  window.addEventListener("load", function () {
    var btn = document.getElementById("downloadA4PdfBtn");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var el = document.getElementById("invoiceContainer") || document.body;
      var actions = document.getElementById("topActions");

      // hide buttons while rendering PDF
      if (actions) actions.style.display = "none";

      var opt = {
        margin:      10,
        filename:    "Invoice-${order.orderNo || ""}.pdf",
        image:       { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" }
      };

      window.html2pdf().set(opt).from(el).save().then(function () {
        // show buttons again after download
        if (actions) actions.style.display = "";
      });
    });
  });
</script>

</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* React component                                                     */
/* ------------------------------------------------------------------ */

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderIdParam = (params?.orderNo ?? params?.id) as string | undefined;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [receiptSettings, setReceiptSettings] =
    useState<ReceiptSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const pageTitle = useMemo(
    () => (order ? `Order (${order.orderNo})` : "Order"),
    [order]
  );

  useEffect(() => {
    if (!orderIdParam) return;

    const token = localStorage.getItem("token") || "";

    setLoading(true);
    setError(null);

    const url = `${API_URL}/orders/${encodeURIComponent(orderIdParam)}`;
    console.log("🔍 Fetching order detail:", url);

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (r.status === 401) throw new Error("unauthorized");
        if (!r.ok) throw new Error("failed");

        const data = await r.json();
        console.log("📦 Raw /orders/:id payload:", data);

        const o: any = Array.isArray(data) ? data[0] : data;

        const branchName =
          o.branch?.name ?? o.branchName ?? o.branch_name ?? o.branch ?? "";

        const businessDate =
          typeof o.businessDate === "string"
            ? o.businessDate
            : o.businessDate
            ? new Date(o.businessDate).toISOString()
            : "";

        const itemsSrc = o.items || o.orderItems || [];
        const taxesSrc =
          o.taxes ||
          o.orderTaxes ||
          o.taxLines ||
          o.taxesBreakdown ||
          [];
        const paymentsSrc = o.payments || o.orderPayments || [];

        const normalized: OrderDetail = {
          id: o.id ?? o.orderId ?? "",
          orderNo: o.orderNo ?? o.number ?? orderIdParam,
          status: o.status ?? "",

          businessDate,
          type: o.orderType ?? o.type ?? "",
          source: o.channel ?? o.source ?? "",
          branchName,
          dueAt: o.dueAt ?? "",
          openedAt:
            o.openedAt ??
            o.startedAt ??
            o.opened_at ??
            o.businessDate ??
            o.createdAt ??
            "",
          closedAt: o.closedAt ?? o.completedAt ?? o.closed_at ?? "",
          guests: o.guests ?? o.covers ?? null,
          createdBy:
            o.createdByUser?.name ?? o.createdBy ?? o.user?.name ?? "",
          closedBy: o.closedByUser?.name ?? o.closedBy ?? "",
          customerName: o.customer?.name ?? o.customerName ?? "",
          checkNumber: o.checkNumber ?? o.checkNo ?? "",

          subtotal: num(o.subtotal ?? o.subTotal),
          discountTotal: num(o.discountTotal ?? o.discount),
          chargesTotal: num(o.chargesTotal ?? o.totalCharges),
          taxTotal: num(o.taxTotal ?? o.totalTax ?? o.totalTaxes),
          roundingAmount: num(o.roundingAmount ?? o.rounding),
          netTotal: num(o.netTotal ?? o.finalPrice ?? o.total),
          discountKind:
            o.discountKind ??
            o.discount_kind ??
            o.discountType ??
            o.discount_type ??
            null,

          items: (itemsSrc as any[]).map((i) => ({
            id: i.id,
            productName:
              i.product?.name ?? i.name ?? i.productName ?? "Item",
            quantity: num(i.quantity ?? i.qty ?? 1),
            unitPrice: num(i.unitPrice ?? i.price ?? i.unitPriceExTax),
            notes: i.notes ?? "",
            totalPrice: num(
              i.totalPrice ?? i.lineTotal ?? i.netTotal ?? i.total ?? 0
            ),
          })),

          taxes: (taxesSrc as any[]).map((t) => ({
            name: t.name ?? t.taxName ?? t.code ?? "Tax",
            amount: num(t.amount ?? t.value ?? t.taxAmount ?? t.total ?? 0),
          })),

          payments: (paymentsSrc as any[]).map((p) => ({
            method:
              p.method?.name ??
              p.paymentMethod?.name ??
              p.paymentType ??
              "Payment",
            amount: num(p.amount ?? p.total),
            addedAt: p.addedAt ?? p.createdAt ?? p.date,
            reference:
              p.reference ?? p.retrievalReferenceNumber ?? p.refNo,
          })),

          zatcaStatus: o.zatcaStatus ?? o.zatca_sync_status,
          zatcaError: o.zatcaError ?? "",
          zatcaQrBase64: o.zatcaQrBase64 ?? o.zatca_qr ?? "",
        };

        setOrder(normalized);
      })
      .catch((err) => {
        console.error("Failed to load order detail", err);
        if ((err as Error).message === "unauthorized") {
          setError("Session expired or unauthorized. Please log in again.");
        } else {
          setError("Unable to load order details. Please try again.");
        }
      })
      .finally(() => setLoading(false));

    // fetch receipt settings (for logo + header/footer)
    fetch(`${API_URL}/receipt-settings`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;

        let logo: string | null =
          data.logoUrl ?? data.logo_url ?? null;

        if (logo && !/^https?:\/\//i.test(logo)) {
          logo = `${API_URL}${logo}`;
        }

        const s: ReceiptSettings = {
          logoUrl: logo,
          receiptHeader: data.receiptHeader ?? data.header ?? "",
          receiptFooter: data.receiptFooter ?? data.footer ?? "",
          invoiceTitle: data.invoiceTitle ?? "",
          branchName: data.branchName ?? "",
        };

        console.log("🧾 Normalized receipt settings:", s);
        setReceiptSettings(s);
      })
      .catch((e) => {
        console.warn("Failed to load receipt-settings", e);
      });
  }, [orderIdParam]);

  function handlePrint(mode: "simplified" | "standard") {
    if (!order) return;

    if (mode === "simplified") {
      const token = localStorage.getItem("token") || "";

      fetch(`${API_URL}/pos/orders/${order.id}/receipt-html`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.text())
        .then((html) => {
          const win = window.open("", "_blank", "width=900,height=900");
          if (!win) return;
          win.document.open();
          win.document.write(html);
          win.document.close();
        })
        .catch((err) => {
          console.error("Failed to print simplified receipt", err);
          alert("Failed to generate simplified receipt.");
        });

      return;
    }

    const html = buildStandardHtml(order, receiptSettings || undefined);
    const win = window.open("", "_blank", "width=900,height=900");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          ← Back
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          Loading order…
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          ← Back
        </button>
        <div className="rounded-2xl border border-rose-100 bg-white p-6 text-sm text-rose-600 shadow-sm">
          {error || "Order not found."}
        </div>
      </div>
    );
  }

  // Taxes to display: real breakdown if exists, otherwise synthesize VAT row
  const taxesToShow: OrderTax[] =
    order.taxes.length > 0
      ? order.taxes
      : order.taxTotal && order.taxTotal > 0
      ? [{ name: "VAT 15%", amount: order.taxTotal }]
      : [];

  // Guests: customer name if exists; else guests count; else "Guest"
  const guestValue =
    order.customerName && order.customerName.trim() !== ""
      ? order.customerName
      : order.guests != null && order.guests > 0
      ? String(order.guests)
      : "Guest";

  const discountKindLabel =
    order.discountKind && order.discountKind.trim() !== ""
      ? order.discountKind
      : "—";

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          ← Back
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            Order ({order.orderNo})
          </span>
          {order.status && (
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
              {order.status}
            </span>
          )}
          <button
            className="rounded-xl bg-black px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-black/90"
            onClick={() => setShowPrintModal(true)}
          >
            Print
          </button>
        </div>
      </div>

      {/* Header info card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            <Field label="Business Date" value={order.businessDate || "—"} />
            <Field label="Type" value={order.type || "—"} />
            <Field label="Branch" value={order.branchName || "—"} />
            <Field label="Guests" value={guestValue} />
            <Field label="Check Number" value={order.checkNumber || "—"} />
          </div>
          <div className="space-y-3 text-sm">
            <Field label="Number" value={order.orderNo} />
            <Field label="Source" value={order.source || "Cashier"} />
            <Field label="Opened At" value={formatDateTime(order.openedAt)} />
            <Field label="Closed At" value={formatDateTime(order.closedAt)} />
            <Field label="Created By" value={order.createdBy || "—"} />
          </div>
        </div>
      </div>

      {/* Totals card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            <Field label="Sub Total" value={money(order.subtotal)} />
            <Field label="Total Charges" value={money(order.chargesTotal)} />
            <Field
              label="Rounding Amount"
              value={money(order.roundingAmount)}
            />
          </div>
          <div className="space-y-3 text-sm">
            <Field label="Discount" value={money(order.discountTotal)} />
            <Field label="Total Taxes" value={money(order.taxTotal)} />
            <Field label="Final Price" value={money(order.netTotal)} strong />
          </div>
        </div>
      </div>

      {/* Tags placeholder */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        You can add tags to this order for reporting or filtering later.
      </div>

      {/* Products */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Products
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3 text-left">Quantity</th>
                <th className="px-6 py-3 text-left">Item</th>
                <th className="px-6 py-3 text-right">Unit Price</th>
                <th className="px-6 py-3 text-right">Discount</th>
                <th className="px-6 py-3 text-left">Notes</th>
                <th className="px-6 py-3 text-right">Total Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {order.items.map((i) => (
                <tr key={i.id ?? i.productName}>
                  <td className="px-6 py-3">{i.quantity}</td>
                  <td className="px-6 py-3">{i.productName}</td>
                  <td className="px-6 py-3 text-right">
                    {money(i.unitPrice)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {discountKindLabel}
                  </td>
                  <td className="px-6 py-3">
                    {i.notes && i.notes.trim() !== "" ? i.notes : "—"}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {money(i.totalPrice)}
                  </td>
                </tr>
              ))}
              {order.items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-6 text-center text-sm text-slate-400"
                  >
                    No products.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Taxes */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Taxes
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {taxesToShow.map((t, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-3">{t.name}</td>
                  <td className="px-6 py-3 text-right">
                    {money(t.amount)}
                  </td>
                </tr>
              ))}
              {taxesToShow.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-6 py-6 text-center text-sm text-slate-400"
                  >
                    No taxes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Payments
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-left">Added</th>
                <th className="px-6 py-3 text-left">
                  Retrieval Reference Number
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {order.payments.map((p, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-3">{p.method}</td>
                  <td className="px-6 py-3 text-right">
                    {money(p.amount)}
                  </td>
                  <td className="px-6 py-3">
                    {p.addedAt ? formatDateTime(p.addedAt) : "—"}
                  </td>
                  <td className="px-6 py-3">
                    {p.reference && p.reference !== "" ? p.reference : "—"}
                  </td>
                </tr>
              ))}
              {order.payments.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-6 text-center text-sm text-slate-400"
                  >
                    No payments recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ZATCA status */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Zatca Sync Status
            </div>
            {order.zatcaError && (
              <div className="text-xs text-rose-600">
                {order.zatcaError}
              </div>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              (order.zatcaStatus || "").toLowerCase() === "success"
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
            }`}
          >
            {order.zatcaStatus || "Unknown"}
          </span>
        </div>
      </div>

      {/* Print options modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-lg font-semibold text-center text-slate-900">
              Select Print Format
            </h2>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  handlePrint("simplified");
                }}
                className="w-full rounded-xl bg-black py-2 text-sm font-medium text-white transition hover:bg-black/90"
              >
                Simplified
              </button>

              <button
                onClick={() => {
                  setShowPrintModal(false);
                  handlePrint("standard");
                }}
                className="w-full rounded-xl bg-black py-2 text-sm font-medium text-white transition hover:bg-black/90"
              >
                Standard
              </button>
            </div>

            <button
              onClick={() => setShowPrintModal(false)}
              className="mt-5 w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* small field component */

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div
        className={`text-sm ${
          strong ? "font-semibold text-slate-900" : "text-slate-700"
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}
