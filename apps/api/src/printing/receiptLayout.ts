// apps/api/src/printing/receiptLayout.ts

export type PrintLanguage = "MAIN_LOCALIZED" | "MAIN_ONLY" | "LOCALIZED_ONLY";

export type ReceiptSettings = {
  logoUrl?: string | null;
  printLanguage: PrintLanguage;
  mainLanguage: string;
  localizedLanguage?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  invoiceTitle?: string | null;

  showOrderNumber: boolean;
  showCalories: boolean;
  showSubtotal: boolean;
  showRounding: boolean;
  showCloserUsername: boolean;
  showCreatorUsername: boolean;
  showCheckNumber: boolean;
  hideFreeModifierOptions: boolean;
  printCustomerPhoneInPickup: boolean;
};

export type OrderItemModifier = {
  name: string;
  price: number;
  isDefault?: boolean;
};

export type OrderItem = {
  productName: string;
  productNameLocalized?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  calories?: number | null;
  modifiers?: OrderItemModifier[];
  discountAmount?: number;
};

export type OrderPayment = {
  method: string; // e.g. "CASH", "CARD", "STCPAY"
  amount: number;
};

export type OrderForReceipt = {
  orderNo: string;
  checkNo?: string | null;
  type: "DINE_IN" | "PICKUP" | "DELIVERY" | "DRIVE_THRU";
  businessDate: Date;
  openedAt?: Date | null;
  closedAt?: Date | null;
  branchName: string;
  branchCode?: string | null;
  guests?: number | null;
  tableNo?: string | null;

  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  rounding?: number;
  netTotal: number;

  createdByName?: string | null;
  closedByName?: string | null;

  customerName?: string | null;
  customerPhone?: string | null;

  items: OrderItem[];
  payments: OrderPayment[];
};

// ---------- formatting helpers ----------

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return " ".repeat(width - text.length) + text;
}

function center(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const totalPadding = width - text.length;
  const left = Math.floor(totalPadding / 2);
  const right = totalPadding - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

function formatMoney(v: number): string {
  return v.toFixed(2);
}

/**
 * Wrap a string into multiple lines within a given width.
 */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    if (!current.length) {
      current = w;
      continue;
    }
    if ((current + " " + w).length <= width) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

/**
 * Build receipt text (plain) for 58mm or 80mm
 *
 * @param order Order data
 * @param settings Receipt settings from DB
 * @param opts widthChars: 32 for 58mm, 42 or 48 for 80mm
 */
export function buildReceiptText(
  order: OrderForReceipt,
  settings: ReceiptSettings,
  opts?: { widthChars?: number; brandName?: string }
): string {
  const width = opts?.widthChars ?? 42;
  const brandName = opts?.brandName ?? "SADI";

  const lines: string[] = [];
  const divider = "-".repeat(width);

  // ---------- HEADER ----------
  lines.push(center(brandName.toUpperCase(), width));
  lines.push(center(order.branchName, width));

  if (settings.invoiceTitle) {
    lines.push(center(settings.invoiceTitle, width));
  } else {
    lines.push(center("Simplified Tax Invoice", width));
  }

  if (settings.receiptHeader) {
    const headerLines = wrapText(settings.receiptHeader, width);
    headerLines.forEach((l) => lines.push(center(l, width)));
  }

  lines.push(divider);

  // ---------- ORDER INFO ----------
  const dateStr = order.businessDate.toLocaleDateString("en-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeStr = (order.closedAt || order.openedAt || order.businessDate).toLocaleTimeString(
    "en-SA",
    { hour: "2-digit", minute: "2-digit" }
  );

  lines.push(padRight(`Date: ${dateStr}`, width));
  lines.push(padRight(`Time: ${timeStr}`, width));

  if (settings.showOrderNumber) {
    lines.push(padRight(`Order: ${order.orderNo}`, width));
  }
  if (settings.showCheckNumber && order.checkNo) {
    lines.push(padRight(`Check: ${order.checkNo}`, width));
  }

  lines.push(
    padRight(
      `Type: ${
        order.type === "DINE_IN"
          ? "Dine In"
          : order.type === "PICKUP"
          ? "Pickup"
          : order.type === "DELIVERY"
          ? "Delivery"
          : "Drive Thru"
      }`,
      width
    )
  );

  if (order.tableNo) {
    lines.push(padRight(`Table: ${order.tableNo}`, width));
  }
  if (order.guests != null) {
    lines.push(padRight(`Guests: ${order.guests}`, width));
  }

  if (settings.showCreatorUsername && order.createdByName) {
    lines.push(padRight(`Created by: ${order.createdByName}`, width));
  }
  if (settings.showCloserUsername && order.closedByName) {
    lines.push(padRight(`Closed by: ${order.closedByName}`, width));
  }

  if (settings.printCustomerPhoneInPickup && order.type === "PICKUP") {
    if (order.customerPhone) {
      lines.push(padRight(`Customer: ${order.customerPhone}`, width));
    }
  }

  lines.push(divider);

  // ---------- ITEMS HEADER ----------
  // Example layout: QTY NAME .... TOTAL
  const qtyWidth = 3;
  const priceWidth = 7;
  const totalWidth = 8;
  const nameWidth = width - qtyWidth - priceWidth - totalWidth - 3; // spaces

  lines.push(
    padRight("QTY", qtyWidth) +
      " " +
      padRight("ITEM", nameWidth) +
      " " +
      padLeft("PRICE", priceWidth) +
      " " +
      padLeft("TOTAL", totalWidth)
  );
  lines.push(divider);

  // ---------- ITEMS ----------
  for (const item of order.items) {
    const name =
      settings.printLanguage === "LOCALIZED_ONLY" && item.productNameLocalized
        ? item.productNameLocalized
        : item.productName;

    const baseNameLines = wrapText(name, nameWidth);

    // first line with qty + price + total
    const firstLineName = baseNameLines.shift() ?? "";
    const qtyStr = item.quantity.toString();
    const priceStr = formatMoney(item.unitPrice);
    const totalStr = formatMoney(item.totalPrice);

    lines.push(
      padLeft(qtyStr, qtyWidth) +
        " " +
        padRight(firstLineName, nameWidth) +
        " " +
        padLeft(priceStr, priceWidth) +
        " " +
        padLeft(totalStr, totalWidth)
    );

    // remaining name lines
    for (const l of baseNameLines) {
      lines.push(" ".repeat(qtyWidth + 1) + padRight(l, nameWidth));
    }

    // calories (optional)
    if (settings.showCalories && item.calories != null) {
      const calLine = `Calories: ${item.calories}`;
      lines.push(" ".repeat(qtyWidth + 1) + padRight(calLine, nameWidth));
    }

    // modifiers
    if (item.modifiers && item.modifiers.length) {
      for (const m of item.modifiers) {
        if (settings.hideFreeModifierOptions && !m.price) continue;

        const modText = `+ ${m.name}`;
        const modLines = wrapText(modText, nameWidth);
        const modPriceStr = m.price ? formatMoney(m.price) : "";
        const firstMod = modLines.shift() ?? "";

        lines.push(
          " ".repeat(qtyWidth + 1) +
            padRight(firstMod, nameWidth) +
            " " +
            padLeft(modPriceStr, priceWidth) +
            " ".repeat(totalWidth + 1)
        );

        for (const ml of modLines) {
          lines.push(" ".repeat(qtyWidth + 1) + padRight(ml, nameWidth));
        }
      }
    }

    // item discount line
    if (item.discountAmount && item.discountAmount > 0) {
      const text = `Item discount: -${formatMoney(item.discountAmount)}`;
      lines.push(" ".repeat(qtyWidth + 1) + padRight(text, width - qtyWidth - 1));
    }
  }

  lines.push(divider);

  // ---------- TOTALS ----------
  if (settings.showSubtotal) {
    lines.push(
      padRight("Subtotal", width - 10) + padLeft(formatMoney(order.subtotal), 10)
    );
  }

  if (order.discountTotal && order.discountTotal > 0) {
    lines.push(
      padRight("Discount", width - 10) +
        padLeft("-" + formatMoney(order.discountTotal), 10)
    );
  }

  lines.push(
    padRight("VAT", width - 10) + padLeft(formatMoney(order.taxTotal), 10)
  );

  if (settings.showRounding && order.rounding != null && order.rounding !== 0) {
    const label = order.rounding > 0 ? "Rounding (+)" : "Rounding (-)";
    lines.push(
      padRight(label, width - 10) + padLeft(formatMoney(order.rounding), 10)
    );
  }

  lines.push(divider);
  lines.push(
    padRight("TOTAL", width - 10) + padLeft(formatMoney(order.netTotal), 10)
  );

  // ---------- PAYMENTS ----------
  if (order.payments && order.payments.length) {
    lines.push(divider);
    lines.push("Payments:");
    for (const p of order.payments) {
      lines.push(
        padRight(p.method, width - 10) + padLeft(formatMoney(p.amount), 10)
      );
    }

    const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const change = paid - order.netTotal;
    if (Math.abs(change) >= 0.005) {
      lines.push(
        padRight("Change", width - 10) +
          padLeft(formatMoney(change), 10)
      );
    }
  }

  // ---------- FOOTER ----------
  lines.push(divider);

  if (settings.receiptFooter) {
    const footerLines = wrapText(settings.receiptFooter, width);
    footerLines.forEach((l) => lines.push(center(l, width)));
  }

  lines.push(center("Thank you for visiting!", width));

  // Add a few blank lines for the tear
  lines.push("");
  lines.push("");
  lines.push("");

  return lines.join("\n");
}
