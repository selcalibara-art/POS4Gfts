import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_PRODUCTS,
  aggregateCustomerUtang,
  calculateCartTotals,
  calculateProductProfit,
  computeCheckoutSettlement,
  computeDailyDrawerMetrics,
  computeDailySalesSeries,
  computeWeeklySalesSeries,
  findDuplicateBarcode,
  formatLocalDateKey,
  formatPHP,
  generateNextSku,
  generateReceiptNumber,
  generateSevenDayStoreSimulation,
} from './posLogic';
import { CartItem, SaleTransaction, UtangPaymentTransaction } from '../types/pos';

test('INITIAL_PRODUCTS contains 6 pre-loaded Four Gifts Store items with barcodes 1001-1006', () => {
  assert.equal(INITIAL_PRODUCTS.length, 6);
  const barcodes = INITIAL_PRODUCTS.map((p) => p.barcode);
  assert.deepEqual(barcodes, ['1001', '1002', '1003', '1004', '1005', '1006']);
  for (const prod of INITIAL_PRODUCTS) {
    assert.equal(prod.capitalPrice, 10.0);
    assert.equal(prod.sellingPrice, 15.0);
  }
});

test('calculateCartTotals computes subtotal, discount, grand total, and net profit accurately', () => {
  const items: CartItem[] = [
    {
      productId: 'prod-1001',
      barcode: '1001',
      name: 'Metallic Wrapper',
      category: 'Wrappers',
      unitPrice: 15,
      originalSellingPrice: 15,
      capitalPrice: 10,
      quantity: 4, // 60 selling, 40 capital
      currentStock: 45,
    },
    {
      productId: 'prod-1002',
      barcode: '1002',
      name: 'Satin Ribbon',
      category: 'Gift Items',
      unitPrice: 15,
      originalSellingPrice: 15,
      capitalPrice: 10,
      quantity: 2, // 30 selling, 20 capital
      currentStock: 60,
    },
  ];

  const totals = calculateCartTotals(items, 5);
  assert.equal(totals.totalItems, 6);
  assert.equal(totals.subtotal, 90);
  assert.equal(totals.discountApplied, 5);
  assert.equal(totals.grandTotal, 85);
  assert.equal(totals.totalCapital, 60);
  assert.equal(totals.netProfit, 25);
});

test('computeCheckoutSettlement handles Cash exact, overpayment, and short-payment split to Utang', () => {
  const overpaid = computeCheckoutSettlement({
    grandTotal: 150,
    paymentType: 'CASH',
    amountPaidInput: 200,
    splitRemainderToUtang: false,
    customerName: '',
  });
  assert.equal(overpaid.canCompleteSale, true);
  assert.equal(overpaid.changeGiven, 50);
  assert.equal(overpaid.cashCollected, 150);
  assert.equal(overpaid.utangBalanceAdded, 0);

  const shortBlocked = computeCheckoutSettlement({
    grandTotal: 150,
    paymentType: 'CASH',
    amountPaidInput: 100,
    splitRemainderToUtang: false,
    customerName: '',
  });
  assert.equal(shortBlocked.canCompleteSale, false);
  assert.equal(shortBlocked.isShortPayment, true);

  const shortSplit = computeCheckoutSettlement({
    grandTotal: 150,
    paymentType: 'CASH',
    amountPaidInput: 100,
    splitRemainderToUtang: true,
    customerName: 'Aling Nena',
  });
  assert.equal(shortSplit.canCompleteSale, true);
  assert.equal(shortSplit.cashCollected, 100);
  assert.equal(shortSplit.utangBalanceAdded, 50);
  assert.equal(shortSplit.changeGiven, 0);
});

test('computeCheckoutSettlement handles Utang with downpayment and requires customer name', () => {
  const missingName = computeCheckoutSettlement({
    grandTotal: 120,
    paymentType: 'UTANG',
    amountPaidInput: 20,
    splitRemainderToUtang: false,
    customerName: '   ',
  });
  assert.equal(missingName.canCompleteSale, false);

  const validUtang = computeCheckoutSettlement({
    grandTotal: 120,
    paymentType: 'UTANG',
    amountPaidInput: 20,
    splitRemainderToUtang: false,
    customerName: 'Mang Kanor',
  });
  assert.equal(validUtang.canCompleteSale, true);
  assert.equal(validUtang.cashCollected, 20);
  assert.equal(validUtang.utangBalanceAdded, 100);
});

test('calculateProductProfit and findDuplicateBarcode work properly', () => {
  const profit = calculateProductProfit(15, 10);
  assert.equal(profit.unitProfit, 5);
  assert.equal(profit.marginPercent, 33.33);
  assert.equal(profit.isBelowCapital, false);

  const loss = calculateProductProfit(8, 10);
  assert.equal(loss.isBelowCapital, true);

  const dup = findDuplicateBarcode(INITIAL_PRODUCTS, '1003');
  assert.equal(dup?.id, 'prod-1003');

  const nextSku = generateNextSku(INITIAL_PRODUCTS);
  assert.equal(nextSku, '1007');
});

test('aggregateCustomerUtang and computeDailyDrawerMetrics reconcile sales, opening float, expenses, and payments', () => {
  const sales: SaleTransaction[] = [
    {
      id: 'sale-1',
      receiptNo: generateReceiptNumber(1, new Date('2026-11-02T10:00:00Z')),
      createdAt: '2026-11-02T10:00:00.000Z',
      items: [],
      totalItems: 3,
      subtotal: 45,
      discount: 0,
      grandTotal: 45,
      totalCapital: 30,
      netProfit: 15,
      paymentType: 'CASH',
      amountTendered: 50,
      cashCollected: 45,
      gcashCollected: 0,
      changeGiven: 5,
      utangAmount: 0,
      splitToUtang: false,
      voided: false,
    },
    {
      id: 'sale-2',
      receiptNo: '#FGS-2026-0002',
      createdAt: '2026-11-02T11:00:00.000Z',
      items: [],
      totalItems: 4,
      subtotal: 60,
      discount: 0,
      grandTotal: 60,
      totalCapital: 40,
      netProfit: 20,
      paymentType: 'UTANG',
      amountTendered: 10,
      cashCollected: 10,
      gcashCollected: 0,
      changeGiven: 0,
      utangAmount: 50,
      splitToUtang: false,
      customerName: 'Elena Cruz',
      voided: false,
    },
  ];

  const payments: UtangPaymentTransaction[] = [
    {
      id: 'pay-1',
      receiptNo: '#UTG-2026-0001',
      createdAt: '2026-11-02T12:00:00.000Z',
      customerName: 'elena cruz',
      paymentMethod: 'CASH',
      previousBalance: 50,
      amountPaid: 20,
      remainingBalance: 30,
    },
  ];

  const ledger = aggregateCustomerUtang(sales, payments);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].currentBalance, 30);
  assert.equal(ledger[0].totalUtangIssued, 50);
  assert.equal(ledger[0].totalUtangPaid, 20);

  const metrics = computeDailyDrawerMetrics(sales, payments);
  assert.equal(metrics.expectedCashInDrawer, 75);
  assert.equal(metrics.newUtangIssuedToday, 50);
  assert.equal(metrics.realizedNetProfit, 35);
  assert.equal(formatPHP(metrics.expectedCashInDrawer), '₱75.00');

  const refDate = new Date('2026-11-02T15:00:00.000Z');
  const dailySeries = computeDailySalesSeries(sales, payments, 7, refDate);
  assert.equal(dailySeries.length, 7);
  const todayBucket = dailySeries[dailySeries.length - 1];
  assert.equal(todayBucket.grossSales, 105);
  assert.equal(todayBucket.netProfit, 35);
  assert.equal(todayBucket.cashCollected, 75);
  assert.equal(todayBucket.utangIssued, 50);
  assert.equal(todayBucket.transactionsCount, 2);

  const weeklySeries = computeWeeklySalesSeries(sales, payments, 6, refDate);
  assert.equal(weeklySeries.length, 6);
  const thisWeekBucket = weeklySeries[weeklySeries.length - 1];
  assert.equal(thisWeekBucket.grossSales, 105);
  assert.equal(thisWeekBucket.netProfit, 35);
  assert.equal(thisWeekBucket.cashCollected, 75);
});

test('generateSevenDayStoreSimulation produces 7 full days of opening-to-closing operations', () => {
  const refDate = new Date('2026-11-02T16:00:00.000Z');
  const sim = generateSevenDayStoreSimulation(refDate);

  assert.equal(sim.shifts.length, 7);
  assert.ok(sim.sales.length >= 12);
  assert.equal(sim.utangPayments.length, 3);
  assert.equal(sim.adjustments.length, 3);

  // Verify every single day in the 7-day series has active sales
  const dailySeries = computeDailySalesSeries(
    sim.sales,
    sim.utangPayments,
    7,
    refDate,
    sim.adjustments
  );
  assert.equal(dailySeries.length, 7);
  for (const dayBucket of dailySeries) {
    assert.ok(
      dayBucket.grossSales > 0,
      `Expected positive sales on ${dayBucket.key}, got ${dayBucket.grossSales}`
    );
  }

  // Verify customer Utang ledger after 7 days:
  // Aling Nena: +75 (Day 2) - 45 paid (Day 3) + 40 split (Day 7) = 70 owing
  // Mang Kanor: +40 (Day 3) - 40 paid (Day 6) = 0 owing
  // Elena Cruz: +100 (Day 5) - 40 paid (Day 6) = 60 owing
  const ledger = aggregateCustomerUtang(sim.sales, sim.utangPayments);
  const nena = ledger.find((c) => c.normalizedName === 'aling nena');
  const kanor = ledger.find((c) => c.normalizedName === 'mang kanor');
  const elena = ledger.find((c) => c.normalizedName === 'elena cruz');

  assert.equal(nena?.currentBalance, 70);
  assert.equal(kanor?.currentBalance, 0);
  assert.equal(elena?.currentBalance, 60);

  // Verify Today's (Day 7) cash drawer reconciliation including 1000 opening float & 35 expense
  const todayKey = formatLocalDateKey(refDate);
  const todayMetrics = computeDailyDrawerMetrics(
    sim.sales,
    sim.utangPayments,
    todayKey,
    sim.shifts,
    sim.adjustments
  );
  assert.equal(todayMetrics.openingFloat, 1000);
  assert.equal(todayMetrics.cashSalesToday, 110); // 90 cash + 20 split cash
  assert.equal(todayMetrics.expenseOutAdjustments, 35);
  assert.equal(todayMetrics.expectedCashInDrawer, 1075); // 1000 + 110 - 35
});

test('isValidDeviceAccessPassword validates /Calibara0911 and Calibara0911 and rejects invalid passwords', async () => {
  const { isValidDeviceAccessPassword, detectReadableDeviceName } = await import('./posLogic');
  assert.equal(isValidDeviceAccessPassword('/Calibara0911'), true);
  assert.equal(isValidDeviceAccessPassword('  /Calibara0911  '), true);
  assert.equal(isValidDeviceAccessPassword('Calibara0911'), true);
  assert.equal(isValidDeviceAccessPassword('calibara0911'), false);
  assert.equal(isValidDeviceAccessPassword('wrongpass'), false);
  assert.equal(isValidDeviceAccessPassword(''), false);

  assert.equal(
    detectReadableDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'),
    'Windows PC · Chrome'
  );
  assert.equal(
    detectReadableDeviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'),
    'Android Phone · Chrome'
  );
});

