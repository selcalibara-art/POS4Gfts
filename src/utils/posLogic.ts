import {
  CartItem,
  CashDrawerAdjustment,
  CustomerUtangSummary,
  DailyShiftRecord,
  PaymentType,
  Product,
  SaleTransaction,
  StoreSettings,
  UtangPaymentTransaction,
} from '../types/pos';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'FOUR GIFTS STORE',
  subtitle: 'Gifts, Wrappers, Toys & Everyday Essentials',
  address: 'Poblacion Market Road, Brgy. San Jose',
  contactNumber: '0917-555-0444',
  footerMessage: 'Thank you for shopping at Four Gifts Store!',
  paperSize: '58mm',
  autoPrint: true,
};

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1001',
    barcode: '1001',
    name: 'Metallic Hologram Gift Wrapper (Roll)',
    category: 'Wrappers',
    capitalPrice: 10.0,
    sellingPrice: 15.0,
    stock: 45,
    note: 'Rack A1 - Assorted gold, red, and silver floral patterns',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'prod-1002',
    barcode: '1002',
    name: 'Satin Pull Ribbon Bow (Medium)',
    category: 'Gift Items',
    capitalPrice: 10.0,
    sellingPrice: 15.0,
    stock: 60,
    note: 'Hook B2 - Divisoria supplier bundle of 12',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'prod-1003',
    barcode: '1003',
    name: 'Kraft Gift Bag with Rope Handle (Small)',
    category: 'Wrappers',
    capitalPrice: 10.0,
    sellingPrice: 15.0,
    stock: 30,
    note: 'Shelf A3 - Fits mugs and small perfume boxes',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'prod-1004',
    barcode: '1004',
    name: 'Mini Pull-Back Diecast Toy Car',
    category: 'Toys',
    capitalPrice: 10.0,
    sellingPrice: 15.0,
    stock: 4, // Low stock <= 5 to demonstrate red low-stock indicator
    note: 'Counter Display Bin - High turnover party loot bag filler',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'prod-1005',
    barcode: '1005',
    name: 'Gel Ink Pen 0.5mm (Black / Blue)',
    category: 'School Supplies',
    capitalPrice: 10.0,
    sellingPrice: 15.0,
    stock: 80,
    note: 'Counter Tray 1 - Box of 24 pcs wholesale',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'prod-1006',
    barcode: '1006',
    name: 'Greeting Card with Envelope (All Occasion)',
    category: 'Gift Items',
    capitalPrice: 10.0,
    sellingPrice: 15.0,
    stock: 25,
    note: 'Spinner Rack - Birthday, Anniversary & Thank You designs',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
];

export function formatPHP(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNegative = safe < -0.0001;
  const abs = Math.abs(safe);
  const formatted = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-₱${formatted}` : `₱${formatted}`;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface CartTotals {
  totalItems: number;
  subtotal: number;
  discountApplied: number;
  grandTotal: number;
  totalCapital: number;
  netProfit: number;
}

export function calculateCartTotals(items: CartItem[], rawDiscount: number): CartTotals {
  let totalItems = 0;
  let subtotal = 0;
  let totalCapital = 0;

  for (const item of items) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const cap = Math.max(0, Number(item.capitalPrice) || 0);
    totalItems += qty;
    subtotal += qty * price;
    totalCapital += qty * cap;
  }

  subtotal = roundCurrency(subtotal);
  totalCapital = roundCurrency(totalCapital);
  const cleanDiscount = Math.max(0, Number(rawDiscount) || 0);
  const discountApplied = roundCurrency(Math.min(subtotal, cleanDiscount));
  const grandTotal = roundCurrency(Math.max(0, subtotal - discountApplied));
  const netProfit = roundCurrency(grandTotal - totalCapital);

  return {
    totalItems,
    subtotal,
    discountApplied,
    grandTotal,
    totalCapital,
    netProfit,
  };
}

export interface CheckoutSettlementInput {
  grandTotal: number;
  paymentType: PaymentType;
  amountPaidInput: number;
  splitRemainderToUtang: boolean;
  customerName: string;
}

export interface CheckoutSettlementResult {
  amountTendered: number;
  cashCollected: number;
  gcashCollected: number;
  changeGiven: number;
  utangBalanceAdded: number;
  isShortPayment: boolean;
  requiresCustomerName: boolean;
  canCompleteSale: boolean;
  validationMessage?: string;
}

export function computeCheckoutSettlement(
  input: CheckoutSettlementInput
): CheckoutSettlementResult {
  const grandTotal = roundCurrency(Math.max(0, input.grandTotal));
  const paid = roundCurrency(Math.max(0, Number(input.amountPaidInput) || 0));
  const trimmedCustomer = (input.customerName || '').trim();

  if (grandTotal <= 0) {
    return {
      amountTendered: 0,
      cashCollected: 0,
      gcashCollected: 0,
      changeGiven: 0,
      utangBalanceAdded: 0,
      isShortPayment: false,
      requiresCustomerName: false,
      canCompleteSale: false,
      validationMessage: 'Add at least one item to the cart.',
    };
  }

  if (input.paymentType === 'UTANG') {
    const downpayment = Math.min(grandTotal, paid);
    const utangBalanceAdded = roundCurrency(Math.max(0, grandTotal - downpayment));
    const changeGiven = roundCurrency(Math.max(0, paid - grandTotal));
    const canComplete = trimmedCustomer.length > 0;
    return {
      amountTendered: paid,
      cashCollected: downpayment,
      gcashCollected: 0,
      changeGiven,
      utangBalanceAdded,
      isShortPayment: utangBalanceAdded > 0,
      requiresCustomerName: true,
      canCompleteSale: canComplete,
      validationMessage: canComplete
        ? undefined
        : 'Customer Name is required for Utang transactions.',
    };
  }

  if (input.paymentType === 'CASH') {
    const isShortPayment = paid < grandTotal - 0.001;
    if (!isShortPayment) {
      const changeGiven = roundCurrency(Math.max(0, paid - grandTotal));
      return {
        amountTendered: paid,
        cashCollected: grandTotal,
        gcashCollected: 0,
        changeGiven,
        utangBalanceAdded: 0,
        isShortPayment: false,
        requiresCustomerName: false,
        canCompleteSale: true,
      };
    }

    // Short payment in CASH
    const remainder = roundCurrency(grandTotal - paid);
    if (input.splitRemainderToUtang) {
      const canComplete = trimmedCustomer.length > 0;
      return {
        amountTendered: paid,
        cashCollected: paid,
        gcashCollected: 0,
        changeGiven: 0,
        utangBalanceAdded: remainder,
        isShortPayment: true,
        requiresCustomerName: true,
        canCompleteSale: canComplete,
        validationMessage: canComplete
          ? undefined
          : 'Enter Customer Name to charge the remaining balance to Utang.',
      };
    }

    return {
      amountTendered: paid,
      cashCollected: paid,
      gcashCollected: 0,
      changeGiven: 0,
      utangBalanceAdded: 0,
      isShortPayment: true,
      requiresCustomerName: false,
      canCompleteSale: false,
      validationMessage: `Amount tendered is short by ${formatPHP(remainder)}. Enter full cash or toggle "Put remaining balance on Utang".`,
    };
  }

  // GCASH
  const isShortPayment = paid < grandTotal - 0.001;
  if (!isShortPayment) {
    const changeGiven = roundCurrency(Math.max(0, paid - grandTotal));
    return {
      amountTendered: paid,
      cashCollected: 0,
      gcashCollected: grandTotal,
      changeGiven,
      utangBalanceAdded: 0,
      isShortPayment: false,
      requiresCustomerName: false,
      canCompleteSale: true,
    };
  }

  const remainder = roundCurrency(grandTotal - paid);
  if (input.splitRemainderToUtang) {
    const canComplete = trimmedCustomer.length > 0;
    return {
      amountTendered: paid,
      cashCollected: 0,
      gcashCollected: paid,
      changeGiven: 0,
      utangBalanceAdded: remainder,
      isShortPayment: true,
      requiresCustomerName: true,
      canCompleteSale: canComplete,
      validationMessage: canComplete
        ? undefined
        : 'Enter Customer Name to put the remaining balance on Utang.',
    };
  }

  return {
    amountTendered: paid,
    cashCollected: 0,
    gcashCollected: paid,
    changeGiven: 0,
    utangBalanceAdded: 0,
    isShortPayment: true,
    requiresCustomerName: false,
    canCompleteSale: false,
    validationMessage: `GCash amount is short by ${formatPHP(remainder)}. Toggle "Put remaining balance on Utang" or enter full amount.`,
  };
}

export interface ProfitInfo {
  unitProfit: number;
  marginPercent: number;
  isBelowCapital: boolean;
}

export function calculateProductProfit(
  sellingPrice: number,
  capitalPrice: number
): ProfitInfo {
  const sell = Number(sellingPrice) || 0;
  const cap = Number(capitalPrice) || 0;
  const unitProfit = roundCurrency(sell - cap);
  const marginPercent = sell > 0 ? roundCurrency((unitProfit / sell) * 100) : 0;
  return {
    unitProfit,
    marginPercent,
    isBelowCapital: sell < cap - 0.001,
  };
}

export function findDuplicateBarcode(
  products: Product[],
  barcode: string,
  excludeProductId?: string
): Product | undefined {
  const clean = barcode.trim().toLowerCase();
  if (!clean) return undefined;
  return products.find(
    (p) => p.id !== excludeProductId && p.barcode.trim().toLowerCase() === clean
  );
}

export function generateNextSku(products: Product[]): string {
  let maxNum = 1000;
  for (const p of products) {
    const match = p.barcode.match(/^\d+$/);
    if (match) {
      const n = parseInt(p.barcode, 10);
      if (n > maxNum && n < 999999) {
        maxNum = n;
      }
    }
  }
  return String(maxNum + 1);
}

export function generateReceiptNumber(sequenceNumber: number, date = new Date()): string {
  const year = date.getFullYear();
  const padded = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  return `#FGS-${year}-${padded}`;
}

export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function aggregateCustomerUtang(
  sales: SaleTransaction[],
  payments: UtangPaymentTransaction[]
): CustomerUtangSummary[] {
  const map = new Map<string, CustomerUtangSummary>();

  for (const sale of sales) {
    if (sale.voided) continue;
    if (sale.utangAmount <= 0 && sale.paymentType !== 'UTANG') continue;
    const rawName = (sale.customerName || 'Walk-in Customer').trim();
    const norm = normalizeCustomerName(rawName);
    if (!norm) continue;

    let entry = map.get(norm);
    if (!entry) {
      entry = {
        customerName: rawName,
        normalizedName: norm,
        totalUtangIssued: 0,
        totalUtangPaid: 0,
        currentBalance: 0,
        lastActivityAt: sale.createdAt,
        dueDateOrNotes: [],
        sales: [],
        payments: [],
      };
      map.set(norm, entry);
    }

    entry.totalUtangIssued = roundCurrency(entry.totalUtangIssued + sale.utangAmount);
    entry.sales.push(sale);
    if (sale.dueDateOrNote && !entry.dueDateOrNotes.includes(sale.dueDateOrNote)) {
      entry.dueDateOrNotes.push(sale.dueDateOrNote);
    }
    if (sale.createdAt > entry.lastActivityAt) {
      entry.lastActivityAt = sale.createdAt;
    }
  }

  for (const pay of payments) {
    const rawName = (pay.customerName || '').trim();
    const norm = normalizeCustomerName(rawName);
    if (!norm) continue;

    let entry = map.get(norm);
    if (!entry) {
      entry = {
        customerName: rawName,
        normalizedName: norm,
        totalUtangIssued: 0,
        totalUtangPaid: 0,
        currentBalance: 0,
        lastActivityAt: pay.createdAt,
        dueDateOrNotes: [],
        sales: [],
        payments: [],
      };
      map.set(norm, entry);
    }

    entry.totalUtangPaid = roundCurrency(entry.totalUtangPaid + pay.amountPaid);
    entry.payments.push(pay);
    if (pay.createdAt > entry.lastActivityAt) {
      entry.lastActivityAt = pay.createdAt;
    }
  }

  const summaries: CustomerUtangSummary[] = [];
  for (const entry of map.values()) {
    entry.currentBalance = roundCurrency(
      Math.max(0, entry.totalUtangIssued - entry.totalUtangPaid)
    );
    entry.sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    entry.payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    summaries.push(entry);
  }

  summaries.sort((a, b) => {
    if (Math.abs(b.currentBalance - a.currentBalance) > 0.009) {
      return b.currentBalance - a.currentBalance;
    }
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });

  return summaries;
}

export interface DailyDrawerMetrics {
  openingFloat: number;
  cashInAdjustments: number;
  expenseOutAdjustments: number;
  netCashFromSalesAndUtang: number;
  expectedCashInDrawer: number;
  actualClosingCashCounted?: number;
  cashVariance?: number;
  cashSalesToday: number;
  cashUtangCollectedToday: number;
  gcashCollectedToday: number;
  gcashSalesToday: number;
  gcashUtangCollectedToday: number;
  newUtangIssuedToday: number;
  realizedNetProfit: number;
  netProfitAfterExpenses: number;
  grossSalesToday: number;
  activeTransactionsCount: number;
  voidedTransactionsCount: number;
}

export function isSameLocalDay(isoDateString: string, targetDateString?: string): boolean {
  if (!targetDateString) return true; // All-time mode if no target date provided
  const d = new Date(isoDateString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` === targetDateString;
}

export function getTodayLocalDateString(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeDailyDrawerMetrics(
  sales: SaleTransaction[],
  utangPayments: UtangPaymentTransaction[],
  targetDateStr?: string,
  shifts: DailyShiftRecord[] = [],
  adjustments: CashDrawerAdjustment[] = []
): DailyDrawerMetrics {
  let cashSalesToday = 0;
  let gcashSalesToday = 0;
  let newUtangIssuedToday = 0;
  let realizedNetProfit = 0;
  let grossSalesToday = 0;
  let activeTransactionsCount = 0;
  let voidedTransactionsCount = 0;

  for (const sale of sales) {
    if (!isSameLocalDay(sale.createdAt, targetDateStr)) continue;
    if (sale.voided) {
      voidedTransactionsCount += 1;
      continue;
    }
    activeTransactionsCount += 1;
    cashSalesToday += sale.cashCollected;
    gcashSalesToday += sale.gcashCollected;
    newUtangIssuedToday += sale.utangAmount;
    realizedNetProfit += sale.netProfit;
    grossSalesToday += sale.grandTotal;
  }

  let cashUtangCollectedToday = 0;
  let gcashUtangCollectedToday = 0;

  for (const pay of utangPayments) {
    if (!isSameLocalDay(pay.createdAt, targetDateStr)) continue;
    if (pay.paymentMethod === 'CASH') {
      cashUtangCollectedToday += pay.amountPaid;
    } else {
      gcashUtangCollectedToday += pay.amountPaid;
    }
  }

  let cashInAdjustments = 0;
  let expenseOutAdjustments = 0;
  for (const adj of adjustments) {
    if (!isSameLocalDay(adj.createdAt, targetDateStr)) continue;
    if (adj.type === 'CASH_IN') {
      cashInAdjustments += adj.amount;
    } else {
      expenseOutAdjustments += adj.amount;
    }
  }

  let openingFloat = 0;
  let actualClosingCashCounted: number | undefined;
  if (targetDateStr) {
    const shift = shifts.find((s) => s.dateKey === targetDateStr);
    if (shift) {
      openingFloat = roundCurrency(shift.openingFloat);
      if (typeof shift.actualClosingCashCounted === 'number') {
        actualClosingCashCounted = roundCurrency(shift.actualClosingCashCounted);
      }
    }
  }

  cashSalesToday = roundCurrency(cashSalesToday);
  cashUtangCollectedToday = roundCurrency(cashUtangCollectedToday);
  gcashSalesToday = roundCurrency(gcashSalesToday);
  gcashUtangCollectedToday = roundCurrency(gcashUtangCollectedToday);
  cashInAdjustments = roundCurrency(cashInAdjustments);
  expenseOutAdjustments = roundCurrency(expenseOutAdjustments);
  realizedNetProfit = roundCurrency(realizedNetProfit);

  const netCashFromSalesAndUtang = roundCurrency(
    cashSalesToday + cashUtangCollectedToday
  );
  const expectedCashInDrawer = roundCurrency(
    openingFloat +
      netCashFromSalesAndUtang +
      cashInAdjustments -
      expenseOutAdjustments
  );
  const cashVariance =
    typeof actualClosingCashCounted === 'number'
      ? roundCurrency(actualClosingCashCounted - expectedCashInDrawer)
      : undefined;

  return {
    openingFloat,
    cashInAdjustments,
    expenseOutAdjustments,
    netCashFromSalesAndUtang,
    expectedCashInDrawer,
    actualClosingCashCounted,
    cashVariance,
    cashSalesToday,
    cashUtangCollectedToday,
    gcashCollectedToday: roundCurrency(gcashSalesToday + gcashUtangCollectedToday),
    gcashSalesToday,
    gcashUtangCollectedToday,
    newUtangIssuedToday: roundCurrency(newUtangIssuedToday),
    realizedNetProfit,
    netProfitAfterExpenses: roundCurrency(
      realizedNetProfit - expenseOutAdjustments
    ),
    grossSalesToday: roundCurrency(grossSalesToday),
    activeTransactionsCount,
    voidedTransactionsCount,
  };
}

export interface SalesChartBucket {
  key: string;
  label: string;
  shortLabel: string;
  grossSales: number;
  netProfit: number;
  cashCollected: number;
  gcashCollected: number;
  utangIssued: number;
  expensesOut: number;
  transactionsCount: number;
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeDailySalesSeries(
  sales: SaleTransaction[],
  utangPayments: UtangPaymentTransaction[],
  daysCount = 7,
  referenceDate = new Date(),
  adjustments: CashDrawerAdjustment[] = []
): SalesChartBucket[] {
  const count = Math.max(1, daysCount);
  const buckets: SalesChartBucket[] = [];
  const bucketMap = new Map<string, SalesChartBucket>();

  const baseDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - i);
    const key = formatLocalDateKey(d);
    const label = d.toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
    });
    const shortLabel = d.toLocaleDateString('en-PH', {
      weekday: 'short',
      day: '2-digit',
    });
    const bucket: SalesChartBucket = {
      key,
      label,
      shortLabel: i === 0 ? `Today (${shortLabel})` : shortLabel,
      grossSales: 0,
      netProfit: 0,
      cashCollected: 0,
      gcashCollected: 0,
      utangIssued: 0,
      expensesOut: 0,
      transactionsCount: 0,
    };
    buckets.push(bucket);
    bucketMap.set(key, bucket);
  }

  for (const sale of sales) {
    if (sale.voided) continue;
    const key = formatLocalDateKey(new Date(sale.createdAt));
    const b = bucketMap.get(key);
    if (!b) continue;
    b.grossSales = roundCurrency(b.grossSales + sale.grandTotal);
    b.netProfit = roundCurrency(b.netProfit + sale.netProfit);
    b.cashCollected = roundCurrency(b.cashCollected + sale.cashCollected);
    b.gcashCollected = roundCurrency(b.gcashCollected + sale.gcashCollected);
    b.utangIssued = roundCurrency(b.utangIssued + sale.utangAmount);
    b.transactionsCount += 1;
  }

  for (const pay of utangPayments) {
    const key = formatLocalDateKey(new Date(pay.createdAt));
    const b = bucketMap.get(key);
    if (!b) continue;
    if (pay.paymentMethod === 'CASH') {
      b.cashCollected = roundCurrency(b.cashCollected + pay.amountPaid);
    } else {
      b.gcashCollected = roundCurrency(b.gcashCollected + pay.amountPaid);
    }
  }

  for (const adj of adjustments) {
    if (adj.type !== 'EXPENSE_OUT') continue;
    const key = formatLocalDateKey(new Date(adj.createdAt));
    const b = bucketMap.get(key);
    if (!b) continue;
    b.expensesOut = roundCurrency(b.expensesOut + adj.amount);
  }

  return buckets;
}

export function getStartOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 is Sun, 1 is Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function computeWeeklySalesSeries(
  sales: SaleTransaction[],
  utangPayments: UtangPaymentTransaction[],
  weeksCount = 6,
  referenceDate = new Date(),
  adjustments: CashDrawerAdjustment[] = []
): SalesChartBucket[] {
  const count = Math.max(1, weeksCount);
  const currentWeekMonday = getStartOfWeekMonday(referenceDate);
  const buckets: SalesChartBucket[] = [];
  const bucketMap = new Map<string, SalesChartBucket>();

  for (let i = count - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekMonday);
    weekStart.setDate(currentWeekMonday.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const key = formatLocalDateKey(weekStart);
    const startFmt = weekStart.toLocaleDateString('en-PH', {
      month: 'short',
      day: '2-digit',
    });
    const endFmt = weekEnd.toLocaleDateString('en-PH', {
      month: 'short',
      day: '2-digit',
    });

    const bucket: SalesChartBucket = {
      key,
      label: `${startFmt} – ${endFmt}`,
      shortLabel: i === 0 ? `This Wk (${startFmt})` : `${startFmt}`,
      grossSales: 0,
      netProfit: 0,
      cashCollected: 0,
      gcashCollected: 0,
      utangIssued: 0,
      expensesOut: 0,
      transactionsCount: 0,
    };
    buckets.push(bucket);
    bucketMap.set(key, bucket);
  }

  for (const sale of sales) {
    if (sale.voided) continue;
    const monday = getStartOfWeekMonday(new Date(sale.createdAt));
    const key = formatLocalDateKey(monday);
    const b = bucketMap.get(key);
    if (!b) continue;
    b.grossSales = roundCurrency(b.grossSales + sale.grandTotal);
    b.netProfit = roundCurrency(b.netProfit + sale.netProfit);
    b.cashCollected = roundCurrency(b.cashCollected + sale.cashCollected);
    b.gcashCollected = roundCurrency(b.gcashCollected + sale.gcashCollected);
    b.utangIssued = roundCurrency(b.utangIssued + sale.utangAmount);
    b.transactionsCount += 1;
  }

  for (const pay of utangPayments) {
    const monday = getStartOfWeekMonday(new Date(pay.createdAt));
    const key = formatLocalDateKey(monday);
    const b = bucketMap.get(key);
    if (!b) continue;
    if (pay.paymentMethod === 'CASH') {
      b.cashCollected = roundCurrency(b.cashCollected + pay.amountPaid);
    } else {
      b.gcashCollected = roundCurrency(b.gcashCollected + pay.amountPaid);
    }
  }

  for (const adj of adjustments) {
    if (adj.type !== 'EXPENSE_OUT') continue;
    const monday = getStartOfWeekMonday(new Date(adj.createdAt));
    const key = formatLocalDateKey(monday);
    const b = bucketMap.get(key);
    if (!b) continue;
    b.expensesOut = roundCurrency(b.expensesOut + adj.amount);
  }

  return buckets;
}

export interface SevenDaySimulationResult {
  products: Product[];
  sales: SaleTransaction[];
  utangPayments: UtangPaymentTransaction[];
  shifts: DailyShiftRecord[];
  adjustments: CashDrawerAdjustment[];
}

/**
 * Generates a realistic 7-day operational simulation for Four Gifts Store:
 * - Daily opening floats (₱1,000.00 each morning)
 * - Cash, GCash, Utang, and Short-Cash Split-to-Utang sales across all 7 days
 * - Bulk haggled discounts & 1 voided return sale
 * - Partial & full Utang debt settlements (Cash & GCash)
 * - Petty cash store expenses (plastic bags, thermal paper rolls, tricycle delivery)
 * - Closing cash counts for Days 1–6 and an open active shift for Day 7 (Today)
 */
export function generateSevenDayStoreSimulation(
  referenceDate = new Date()
): SevenDaySimulationResult {
  const products: Product[] = INITIAL_PRODUCTS.map((p) => ({ ...p }));
  const sales: SaleTransaction[] = [];
  const utangPayments: UtangPaymentTransaction[] = [];
  const shifts: DailyShiftRecord[] = [];
  const adjustments: CashDrawerAdjustment[] = [];

  const baseDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const makeTime = (daysAgo: number, hour: number, minute: number): Date => {
    const d = new Date(baseDay);
    d.setDate(baseDay.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const makeCartItem = (prodIndex: number, qty: number, customPrice?: number): CartItem => {
    const p = products[prodIndex];
    return {
      productId: p.id,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      unitPrice: customPrice ?? p.sellingPrice,
      originalSellingPrice: p.sellingPrice,
      capitalPrice: p.capitalPrice,
      quantity: qty,
      currentStock: p.stock,
    };
  };

  let receiptSeq = 1;
  let utangPaySeq = 1;

  const recordSale = (params: {
    daysAgo: number;
    hour: number;
    minute: number;
    items: CartItem[];
    discount?: number;
    paymentType: PaymentType;
    amountTendered: number;
    splitToUtang?: boolean;
    customerName?: string;
    gcashRefNo?: string;
    dueDateOrNote?: string;
    voided?: boolean;
  }) => {
    const dt = makeTime(params.daysAgo, params.hour, params.minute);
    const totals = calculateCartTotals(params.items, params.discount || 0);
    const settlement = computeCheckoutSettlement({
      grandTotal: totals.grandTotal,
      paymentType: params.paymentType,
      amountPaidInput: params.amountTendered,
      splitRemainderToUtang: Boolean(params.splitToUtang),
      customerName: params.customerName || '',
    });

    let cumulativeAfter: number | undefined;
    if (settlement.utangBalanceAdded > 0 && params.customerName) {
      const currentSummaries = aggregateCustomerUtang(sales, utangPayments);
      const norm = normalizeCustomerName(params.customerName);
      const existing = currentSummaries.find((c) => c.normalizedName === norm);
      cumulativeAfter = roundCurrency(
        (existing ? existing.currentBalance : 0) + settlement.utangBalanceAdded
      );
    }

    const sale: SaleTransaction = {
      id: `sim-sale-${receiptSeq}`,
      receiptNo: generateReceiptNumber(receiptSeq, dt),
      createdAt: dt.toISOString(),
      items: params.items,
      totalItems: totals.totalItems,
      subtotal: totals.subtotal,
      discount: totals.discountApplied,
      grandTotal: totals.grandTotal,
      totalCapital: totals.totalCapital,
      netProfit: totals.netProfit,
      paymentType: params.paymentType,
      amountTendered: settlement.amountTendered,
      cashCollected: settlement.cashCollected,
      gcashCollected: settlement.gcashCollected,
      changeGiven: settlement.changeGiven,
      utangAmount: settlement.utangBalanceAdded,
      splitToUtang: Boolean(params.splitToUtang),
      customerName: params.customerName,
      gcashRefNo: params.gcashRefNo,
      dueDateOrNote: params.dueDateOrNote,
      customerCumulativeUtangAfterSale: cumulativeAfter,
      voided: Boolean(params.voided),
      voidedAt: params.voided
        ? makeTime(params.daysAgo, params.hour + 1, 10).toISOString()
        : undefined,
    };

    receiptSeq += 1;
    sales.push(sale);
  };

  const recordUtangPayment = (params: {
    daysAgo: number;
    hour: number;
    minute: number;
    customerName: string;
    paymentMethod: 'CASH' | 'GCASH';
    amountPaid: number;
    gcashRefNo?: string;
    note?: string;
  }) => {
    const dt = makeTime(params.daysAgo, params.hour, params.minute);
    const currentSummaries = aggregateCustomerUtang(sales, utangPayments);
    const norm = normalizeCustomerName(params.customerName);
    const existing = currentSummaries.find((c) => c.normalizedName === norm);
    const prevBal = existing ? existing.currentBalance : params.amountPaid;
    const remBal = roundCurrency(Math.max(0, prevBal - params.amountPaid));

    utangPayments.push({
      id: `sim-utgpay-${utangPaySeq}`,
      receiptNo: `#UTG-${dt.getFullYear()}-${String(utangPaySeq).padStart(4, '0')}`,
      createdAt: dt.toISOString(),
      customerName: params.customerName,
      paymentMethod: params.paymentMethod,
      gcashRefNo: params.gcashRefNo,
      previousBalance: prevBal,
      amountPaid: params.amountPaid,
      remainingBalance: remBal,
      note: params.note,
    });
    utangPaySeq += 1;
  };

  // --- DAY 1 (6 Days Ago): Opening -> Cash & GCash Sales -> Plastic Bag Expense -> Closing ---
  recordSale({
    daysAgo: 6,
    hour: 9,
    minute: 15,
    items: [makeCartItem(0, 4), makeCartItem(1, 2)], // 90 PHP
    paymentType: 'CASH',
    amountTendered: 100,
  });
  recordSale({
    daysAgo: 6,
    hour: 14,
    minute: 30,
    items: [makeCartItem(2, 3), makeCartItem(5, 2)], // 75 PHP
    paymentType: 'GCASH',
    amountTendered: 75,
    gcashRefNo: '9011-220-341',
  });
  adjustments.push({
    id: 'sim-adj-1',
    createdAt: makeTime(6, 16, 0).toISOString(),
    type: 'EXPENSE_OUT',
    amount: 40,
    reason: 'Plastic sando bags & scotch tape',
  });

  // --- DAY 2 (5 Days Ago): Bulk Discount Sale + Aling Nena Utang ---
  recordSale({
    daysAgo: 5,
    hour: 10,
    minute: 20,
    items: [makeCartItem(4, 8), makeCartItem(0, 2)], // 150 PHP - 10 discount = 140 PHP
    discount: 10,
    paymentType: 'CASH',
    amountTendered: 150,
  });
  recordSale({
    daysAgo: 5,
    hour: 15,
    minute: 45,
    items: [makeCartItem(1, 3), makeCartItem(5, 2)], // 75 PHP Utang
    paymentType: 'UTANG',
    amountTendered: 0,
    customerName: 'Aling Nena',
    dueDateOrNote: 'Pay on Saturday market day',
  });

  // --- DAY 3 (4 Days Ago): Mang Kanor Split Cash+Utang + Aling Nena Partial Payment ---
  recordSale({
    daysAgo: 4,
    hour: 11,
    minute: 10,
    items: [makeCartItem(2, 4), makeCartItem(3, 2)], // 90 PHP, pays 50 Cash + 40 Utang
    paymentType: 'CASH',
    amountTendered: 50,
    splitToUtang: true,
    customerName: 'Mang Kanor',
    dueDateOrNote: 'Balance next week',
  });
  recordSale({
    daysAgo: 4,
    hour: 13,
    minute: 5,
    items: [makeCartItem(0, 5), makeCartItem(4, 3)], // 120 PHP
    paymentType: 'GCASH',
    amountTendered: 120,
    gcashRefNo: '9014-882-119',
  });
  recordUtangPayment({
    daysAgo: 4,
    hour: 16,
    minute: 20,
    customerName: 'Aling Nena',
    paymentMethod: 'CASH',
    amountPaid: 45,
    note: 'Partial payment in cash',
  });

  // --- DAY 4 (3 Days Ago): Busy Sales + 1 Voided Return Sale + Thermal Paper Expense ---
  recordSale({
    daysAgo: 3,
    hour: 9,
    minute: 40,
    items: [makeCartItem(0, 6), makeCartItem(1, 4), makeCartItem(2, 2)], // 180 PHP
    paymentType: 'CASH',
    amountTendered: 200,
  });
  recordSale({
    daysAgo: 3,
    hour: 12,
    minute: 15,
    items: [makeCartItem(3, 2)], // 30 PHP - Voided/Returned
    paymentType: 'CASH',
    amountTendered: 30,
    voided: true,
  });
  adjustments.push({
    id: 'sim-adj-2',
    createdAt: makeTime(3, 15, 0).toISOString(),
    type: 'EXPENSE_OUT',
    amount: 50,
    reason: '58mm thermal receipt paper rolls (2 pcs)',
  });

  // --- DAY 5 (2 Days Ago): Elena Cruz Utang with Downpayment + Cash Sales ---
  recordSale({
    daysAgo: 2,
    hour: 10,
    minute: 50,
    items: [makeCartItem(2, 4), makeCartItem(5, 4)], // 120 PHP, 20 downpayment, 100 Utang
    paymentType: 'UTANG',
    amountTendered: 20,
    customerName: 'Elena Cruz',
    dueDateOrNote: 'Brgy. Teacher - Payday 15th',
  });
  recordSale({
    daysAgo: 2,
    hour: 15,
    minute: 30,
    items: [makeCartItem(4, 6), makeCartItem(1, 4)], // 150 PHP
    paymentType: 'CASH',
    amountTendered: 200,
  });

  // --- DAY 6 (Yesterday): Weekend Rush + Mang Kanor & Elena Cruz Utang Payments ---
  recordSale({
    daysAgo: 1,
    hour: 9,
    minute: 30,
    items: [makeCartItem(0, 8), makeCartItem(1, 6)], // 210 PHP - 10 discount = 200 PHP
    discount: 10,
    paymentType: 'CASH',
    amountTendered: 200,
  });
  recordSale({
    daysAgo: 1,
    hour: 13,
    minute: 45,
    items: [makeCartItem(4, 4), makeCartItem(5, 4)], // 120 PHP
    paymentType: 'GCASH',
    amountTendered: 120,
    gcashRefNo: '9018-551-903',
  });
  recordUtangPayment({
    daysAgo: 1,
    hour: 15,
    minute: 10,
    customerName: 'Mang Kanor',
    paymentMethod: 'GCASH',
    amountPaid: 40,
    gcashRefNo: '9018-774-209',
    note: 'Full settlement via GCash',
  });
  recordUtangPayment({
    daysAgo: 1,
    hour: 17,
    minute: 0,
    customerName: 'Elena Cruz',
    paymentMethod: 'CASH',
    amountPaid: 40,
    note: 'Partial payment',
  });

  // --- DAY 7 (Today): Morning Shift Opened -> Cash, GCash & Utang Activity ---
  recordSale({
    daysAgo: 0,
    hour: 8,
    minute: 45,
    items: [makeCartItem(0, 4), makeCartItem(1, 2)], // 90 PHP Cash
    paymentType: 'CASH',
    amountTendered: 100,
  });
  recordSale({
    daysAgo: 0,
    hour: 10,
    minute: 15,
    items: [makeCartItem(2, 3), makeCartItem(5, 2)], // 75 PHP GCash
    paymentType: 'GCASH',
    amountTendered: 75,
    gcashRefNo: '9021-334-812',
  });
  recordSale({
    daysAgo: 0,
    hour: 11,
    minute: 30,
    items: [makeCartItem(4, 4)], // 60 PHP, paid 20 Cash, 40 Utang for Aling Nena
    paymentType: 'CASH',
    amountTendered: 20,
    splitToUtang: true,
    customerName: 'Aling Nena',
    dueDateOrNote: 'Added to Saturday tab',
  });
  adjustments.push({
    id: 'sim-adj-3',
    createdAt: makeTime(0, 12, 0).toISOString(),
    type: 'EXPENSE_OUT',
    amount: 35,
    reason: 'Tricycle delivery fee for wrapper restock',
  });

  // Build DailyShiftRecords for all 7 days (Days 6..1 closed with exact cash count; Day 0 open)
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const d = makeTime(daysAgo, 8, 0);
    const dateKey = formatLocalDateKey(d);
    const openingFloat = 1000;
    const tempShift: DailyShiftRecord = {
      dateKey,
      openingFloat,
      openedAt: d.toISOString(),
    };
    const dayMetrics = computeDailyDrawerMetrics(
      sales,
      utangPayments,
      dateKey,
      [tempShift],
      adjustments
    );

    if (daysAgo > 0) {
      tempShift.closedAt = makeTime(daysAgo, 19, 30).toISOString();
      tempShift.actualClosingCashCounted = dayMetrics.expectedCashInDrawer;
      tempShift.closingNote = 'Drawer balanced at store closing';
    }
    shifts.push(tempShift);
  }

  // Sort newest first for UI display
  sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  utangPayments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  adjustments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    products,
    sales,
    utangPayments,
    shifts,
    adjustments,
  };
}

/**
 * Validates the store access password required for every new device.
 * Accepts '/Calibara0911' (and 'Calibara0911' without the leading slash).
 */
export function isValidDeviceAccessPassword(input: string): boolean {
  const cleaned = String(input || '').trim();
  return cleaned === '/Calibara0911' || cleaned === 'Calibara0911';
}

/**
 * Generates a human-readable device label from a User-Agent string
 * so the owner can easily identify which PC, phone, or tablet is requesting access.
 */
export function detectReadableDeviceName(userAgent = ''): string {
  const ua = String(userAgent || '');
  let os = 'Device';
  if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android Phone';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux PC';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return `${os} · ${browser}`;
}

