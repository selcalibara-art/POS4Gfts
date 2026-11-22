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
  isCigaretteProduct,
  mergeStoreCatalogWithImports,
  parsePastPosCsv,
} from './posLogic';
import { CartItem, Product, SaleTransaction, UtangPaymentTransaction } from '../types/pos';

test('INITIAL_PRODUCTS contains all 1,122 imported Past POS spreadsheet rows (122 + 1,000 Part 1) plus Cigarette catalog (25 items) with Firestore-safe fields', () => {
  assert.equal(INITIAL_PRODUCTS.length, 1147);
  const cigs = INITIAL_PRODUCTS.filter((p) => isCigaretteProduct(p));
  assert.equal(cigs.length, 28);

  // Every item must satisfy Firestore pos_products security rules and have unique ID & barcode
  const seenIds = new Set<string>();
  const seenBarcodes = new Set<string>();
  const idRegex = /^[a-zA-Z0-9_-]+$/;
  for (const prod of INITIAL_PRODUCTS) {
    assert.ok(
      prod.id.length >= 1 && prod.id.length <= 100 && idRegex.test(prod.id),
      `Invalid Firestore ID: ${prod.id}`
    );
    assert.ok(prod.barcode.length >= 1 && prod.barcode.length <= 64);
    assert.ok(prod.name.length >= 1 && prod.name.length <= 160);
    assert.ok(prod.category.length >= 1 && prod.category.length <= 80);
    assert.equal(prod.capitalPrice, 0);
    assert.ok(prod.sellingPrice >= 0 && prod.sellingPrice <= 10000000);
    assert.ok(prod.stock >= -100000 && prod.stock <= 1000000);

    const idKey = prod.id.toLowerCase();
    assert.equal(seenIds.has(idKey), false, `Duplicate ID found: ${prod.id}`);
    seenIds.add(idKey);

    const bcKey = prod.barcode.toLowerCase();
    assert.equal(seenBarcodes.has(bcKey), false, `Duplicate barcode found: ${prod.barcode}`);
    seenBarcodes.add(bcKey);
  }

  // Spot-check original J&S CALIBARA items & Cigarette items
  const bearBrand = INITIAL_PRODUCTS.find((p) => p.barcode === '4800361395397');
  assert.equal(bearBrand?.name, 'BEAR BRAND MILK W/IRON 13+1/33G-P');
  assert.equal(bearBrand?.sellingPrice, 151.45);

  const testItem = INITIAL_PRODUCTS.find((p) => p.barcode === '41234567890');
  assert.equal(testItem?.name, 'Test Item 2016');
  assert.equal(testItem?.sellingPrice, 15);

  const renewal = INITIAL_PRODUCTS.find((p) => p.barcode === 'renew01');
  assert.equal(renewal?.name, 'Lucky Grocers Card Renewal');

  const camelStick = INITIAL_PRODUCTS.find((p) => p.barcode === '40329055');
  assert.equal(camelStick?.category, 'Cigarettes');
  assert.equal(camelStick?.sellingPrice, 8);

  // Spot-check newly imported products_part1.csv items (including trailing-dot IDs & multi-barcodes)
  const kropek = INITIAL_PRODUCTS.find((p) => p.barcode === '000000');
  assert.equal(kropek?.name, 'kropek');
  assert.equal(kropek?.sellingPrice, 8);

  const happyRegular = INITIAL_PRODUCTS.find((p) => p.id === 'pos-0145');
  const happyDot = INITIAL_PRODUCTS.find((p) => p.id === 'pos-0145_dot');
  assert.ok(happyRegular, 'Expected pos-0145');
  assert.ok(happyDot, 'Expected pos-0145_dot without ID collision');
  assert.equal(happyDot?.barcode, '0145.');
  assert.equal(happyDot?.name, 'happy pants xxl retail');

  const mangTomas = INITIAL_PRODUCTS.find((p) => p.barcode === '4801668100264');
  assert.equal(mangTomas?.name, 'Mang Tomas All-Around Sarsa 325g');
  assert.equal(mangTomas?.sellingPrice, 39);

  const multiBarcodeItem = INITIAL_PRODUCTS.find((p) => p.id === 'pos-10472');
  assert.ok(multiBarcodeItem?.note?.includes('Alt:'));
});

test('mergeStoreCatalogWithImports preserves custom existing items while removing untouched placeholders', () => {
  const existingStoreProducts: Product[] = [
    {
      id: 'prod-1001',
      barcode: '1001',
      name: 'Metallic Hologram Gift Wrapper (Roll)',
      category: 'Wrappers',
      capitalPrice: 10,
      sellingPrice: 15,
      stock: 45,
      note: '',
      updatedAt: '2026-11-01T08:00:00.000Z',
    },
    {
      id: 'custom-camel',
      barcode: '40329055',
      name: 'Camel Yellow',
      category: 'Snacks',
      capitalPrice: 0,
      sellingPrice: 9,
      stock: 40,
      note: '',
      updatedAt: '2026-11-10T08:00:00.000Z',
    },
    {
      id: 'custom-wilkins',
      barcode: '4801981126866',
      name: 'wilkins pure 330 ml',
      category: 'Beverages',
      capitalPrice: 0,
      sellingPrice: 15,
      stock: 20,
      note: '',
      updatedAt: '2026-11-10T08:00:00.000Z',
    },
  ];

  const merged = mergeStoreCatalogWithImports(existingStoreProducts, INITIAL_PRODUCTS);
  // Legacy prod-1001 dropped, custom Camel & Wilkins kept, plus remaining 1,146 imported items
  assert.equal(merged.some((p) => p.id === 'prod-1001'), false);
  const keptCamel = merged.find((p) => p.barcode === '40329055');
  assert.equal(keptCamel?.id, 'custom-camel');
  assert.equal(keptCamel?.sellingPrice, 9);
  assert.equal(keptCamel?.category, 'Cigarettes');
  assert.equal(merged.some((p) => p.barcode === '4801981126866'), true);
  assert.equal(merged.length, 1148);
});

test('parsePastPosCsv parses standard Past POS CSV rows, preserves alternate barcodes, and avoids collisions', () => {
  const sampleCsv = [
    'Stock_No,Name,Cost,Retail_Price,Quantity,Barcodes,Tags,Taxes,Tax_Exempt,Description,Enable_Decimal,Enable_Open_Price,Disable_Discount,Disable_Inventory,Supplier_Name,Supplier_List,Category_Name,Subcategory_Name,Status',
    '"5001","Lucky Me Pancit Canton Calamansi","12.00","16.50","25","4807770270017,4807770279999","sc/pwd","","","","","","","","","","","","Active"',
    '"5001.","Special Dot Item","0","10.00","5","","","","","","No","No","No","No","","","","","Active"',
  ].join('\n');

  const parsed = parsePastPosCsv(sampleCsv, INITIAL_PRODUCTS);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'pos-5001');
  assert.equal(parsed[0].barcode, '4807770270017');
  assert.equal(parsed[0].sellingPrice, 16.5);
  assert.equal(parsed[0].capitalPrice, 0);
  assert.equal(parsed[0].category, 'Groceries & Canned');
  assert.ok(parsed[0].note?.includes('Alt: 4807770279999'));
  assert.ok(parsed[0].note?.includes('SC/PWD eligible'));

  assert.equal(parsed[1].id, 'pos-5001_dot');
  assert.equal(parsed[1].barcode, '5001.');
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

  const dup = findDuplicateBarcode(INITIAL_PRODUCTS, '40329055');
  assert.equal(dup?.id, 'cig-camel-yellow-stk');

  const nextSku = generateNextSku(INITIAL_PRODUCTS);
  assert.equal(nextSku, '48001');
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

