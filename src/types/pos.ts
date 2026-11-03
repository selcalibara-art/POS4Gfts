export type PaymentType = 'CASH' | 'GCASH' | 'UTANG';

export type PaperSize = '58mm' | '80mm';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  sellingPrice: number;
  capitalPrice: number;
  stock: number;
  note: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  barcode: string;
  name: string;
  category: string;
  unitPrice: number; // Editable at checkout for haggled/bulk gift items
  originalSellingPrice: number;
  capitalPrice: number;
  quantity: number;
  currentStock: number;
}

export interface ParkedCart {
  id: string;
  label: string;
  createdAt: string;
  items: CartItem[];
  discount: number;
  customerName?: string;
  note?: string;
}

export interface SaleTransaction {
  id: string;
  receiptNo: string;
  createdAt: string;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  discount: number;
  grandTotal: number;
  totalCapital: number;
  netProfit: number;
  paymentType: PaymentType;
  amountTendered: number; // Cash or GCash or Downpayment paid at checkout
  cashCollected: number; // Actual cash kept in drawer from this sale
  gcashCollected: number; // Actual GCash collected from this sale
  changeGiven: number;
  utangAmount: number; // Unpaid balance added to customer Utang
  splitToUtang: boolean;
  customerName?: string;
  gcashRefNo?: string;
  dueDateOrNote?: string;
  customerCumulativeUtangAfterSale?: number;
  voided: boolean;
  voidedAt?: string;
  voidReason?: string;
}

export interface UtangPaymentTransaction {
  id: string;
  receiptNo: string;
  createdAt: string;
  customerName: string;
  paymentMethod: 'CASH' | 'GCASH';
  gcashRefNo?: string;
  previousBalance: number;
  amountPaid: number;
  remainingBalance: number;
  note?: string;
}

export interface CashDrawerAdjustment {
  id: string;
  createdAt: string;
  type: 'EXPENSE_OUT' | 'CASH_IN';
  amount: number;
  reason: string;
}

export interface DailyShiftRecord {
  dateKey: string; // YYYY-MM-DD
  openingFloat: number;
  openedAt: string;
  closedAt?: string;
  actualClosingCashCounted?: number;
  closingNote?: string;
}

export interface CustomerUtangSummary {
  customerName: string;
  normalizedName: string;
  totalUtangIssued: number;
  totalUtangPaid: number;
  currentBalance: number;
  lastActivityAt: string;
  dueDateOrNotes: string[];
  sales: SaleTransaction[];
  payments: UtangPaymentTransaction[];
}

export interface StoreSettings {
  storeName: string;
  subtitle: string;
  address: string;
  contactNumber: string;
  footerMessage: string;
  paperSize: PaperSize;
  autoPrint: boolean;
}

export interface ZReadingReportData {
  dateLabel: string;
  dateKey: string;
  openingFloat: number;
  cashSales: number;
  cashUtangCollected: number;
  cashInAdjustments: number;
  expenseOutAdjustments: number;
  expectedCashInDrawer: number;
  actualCashCounted?: number;
  cashVariance?: number;
  gcashSales: number;
  gcashUtangCollected: number;
  totalGcashCollected: number;
  newUtangIssued: number;
  grossSales: number;
  grossProfit: number;
  netProfitAfterExpenses: number;
  activeSalesCount: number;
  voidedSalesCount: number;
}

export type ActiveReceiptModal =
  | {
      kind: 'SALE';
      sale: SaleTransaction;
      isStoreCopy?: boolean;
    }
  | {
      kind: 'UTANG_PAYMENT';
      payment: UtangPaymentTransaction;
      isStoreCopy?: boolean;
    }
  | {
      kind: 'Z_READING';
      zReport: ZReadingReportData;
      isStoreCopy?: boolean;
    };
