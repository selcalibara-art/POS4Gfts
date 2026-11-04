import React, { useMemo, useState } from 'react';
import {
  Printer,
  RotateCcw,
  Search,
  Banknote,
  Smartphone,
  BookOpen,
  TrendingUp,
  Wallet,
  PlusCircle,
  CheckCircle2,
  FileText,
  X,
  Trash2,
} from 'lucide-react';
import {
  CashDrawerAdjustment,
  DailyShiftRecord,
  SaleTransaction,
  UtangPaymentTransaction,
  ZReadingReportData,
} from '../types/pos';
import {
  computeDailyDrawerMetrics,
  formatLocalDateKey,
  formatPHP,
  getTodayLocalDateString,
  isSameLocalDay,
} from '../utils/posLogic';
import { SalesAnalyticsChart } from './SalesAnalyticsChart';

interface TransactionsReportPageProps {
  sales: SaleTransaction[];
  utangPayments: UtangPaymentTransaction[];
  shifts: DailyShiftRecord[];
  adjustments: CashDrawerAdjustment[];
  onReprintSaleReceipt: (sale: SaleTransaction) => void;
  onVoidSale: (saleId: string) => void;
  onUpdateShiftRecord: (record: DailyShiftRecord) => void;
  onAddCashAdjustment: (adj: Omit<CashDrawerAdjustment, 'id'>) => void;
  onDeleteCashAdjustment: (adjId: string) => void;
  onPrintZReading: (zData: ZReadingReportData) => void;
}

export const TransactionsReportPage: React.FC<TransactionsReportPageProps> = ({
  sales,
  utangPayments,
  shifts,
  adjustments,
  onReprintSaleReceipt,
  onVoidSale,
  onUpdateShiftRecord,
  onAddCashAdjustment,
  onDeleteCashAdjustment,
  onPrintZReading,
}) => {
  const todayStr = getTodayLocalDateString();
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);

  // Modals for Opening Float, Petty Cash Expense, and Closing Cash Count
  const [isFloatModalOpen, setIsFloatModalOpen] = useState(false);
  const [openingFloatStr, setOpeningFloatStr] = useState('1000');

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [adjType, setAdjType] = useState<'EXPENSE_OUT' | 'CASH_IN'>(
    'EXPENSE_OUT'
  );
  const [adjAmountStr, setAdjAmountStr] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingCountStr, setClosingCountStr] = useState('');
  const [closingNote, setClosingNote] = useState('');

  // Build last 7 days options for quick date switching
  const recentDayOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const key = formatLocalDateKey(d);
      const fmt = d.toLocaleDateString('en-PH', {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
      });
      opts.push({
        key,
        label: i === 0 ? `Today (${fmt})` : fmt,
      });
    }
    return opts;
  }, []);

  const targetDateFilter =
    selectedDateKey === 'ALL' ? undefined : selectedDateKey;

  const metrics = useMemo(
    () =>
      computeDailyDrawerMetrics(
        sales,
        utangPayments,
        targetDateFilter,
        shifts,
        adjustments
      ),
    [sales, utangPayments, targetDateFilter, shifts, adjustments]
  );

  const currentShift = useMemo(
    () =>
      targetDateFilter
        ? shifts.find((s) => s.dateKey === targetDateFilter)
        : undefined,
    [shifts, targetDateFilter]
  );

  const filteredAdjustments = useMemo(
    () =>
      adjustments.filter((adj) =>
        isSameLocalDay(adj.createdAt, targetDateFilter)
      ),
    [adjustments, targetDateFilter]
  );

  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sales.filter((s) => {
      if (!isSameLocalDay(s.createdAt, targetDateFilter)) return false;
      if (!q) return true;
      return (
        s.receiptNo.toLowerCase().includes(q) ||
        (s.customerName || '').toLowerCase().includes(q) ||
        s.paymentType.toLowerCase().includes(q) ||
        s.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [sales, searchQuery, targetDateFilter]);

  const handleOpenFloatModal = () => {
    setOpeningFloatStr(String(metrics.openingFloat || 1000));
    setIsFloatModalOpen(true);
  };

  const handleSaveOpeningFloat = (e: React.FormEvent) => {
    e.preventDefault();
    const dateKey = targetDateFilter || todayStr;
    const floatVal = Math.max(0, parseFloat(openingFloatStr) || 0);
    onUpdateShiftRecord({
      dateKey,
      openingFloat: floatVal,
      openedAt: currentShift?.openedAt || new Date().toISOString(),
      closedAt: currentShift?.closedAt,
      actualClosingCashCounted: currentShift?.actualClosingCashCounted,
      closingNote: currentShift?.closingNote,
    });
    setIsFloatModalOpen(false);
  };

  const handleSaveExpenseAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0.01, parseFloat(adjAmountStr) || 0);
    if (!adjReason.trim()) return;
    const dateKey = targetDateFilter || todayStr;
    const now = new Date();
    const [y, m, d] = dateKey.split('-').map(Number);
    const stampedDate = new Date(
      y,
      m - 1,
      d,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    );
    onAddCashAdjustment({
      createdAt: stampedDate.toISOString(),
      type: adjType,
      amount: amt,
      reason: adjReason.trim(),
    });
    setAdjAmountStr('');
    setAdjReason('');
    setIsExpenseModalOpen(false);
  };

  const handleOpenClosingModal = () => {
    setClosingCountStr(
      typeof currentShift?.actualClosingCashCounted === 'number'
        ? String(currentShift.actualClosingCashCounted)
        : metrics.expectedCashInDrawer.toFixed(2)
    );
    setClosingNote(currentShift?.closingNote || '');
    setIsClosingModalOpen(true);
  };

  const buildZReportData = (
    overrideActualCount?: number
  ): ZReadingReportData => {
    const dateKey = targetDateFilter || todayStr;
    const dayOpt = recentDayOptions.find((o) => o.key === dateKey);
    const actualCount =
      overrideActualCount !== undefined
        ? overrideActualCount
        : metrics.actualClosingCashCounted;
    const variance =
      typeof actualCount === 'number'
        ? actualCount - metrics.expectedCashInDrawer
        : undefined;

    return {
      dateLabel:
        selectedDateKey === 'ALL'
          ? 'All Recorded Sessions'
          : dayOpt?.label || dateKey,
      dateKey,
      openingFloat: metrics.openingFloat,
      cashSales: metrics.cashSalesToday,
      cashUtangCollected: metrics.cashUtangCollectedToday,
      cashInAdjustments: metrics.cashInAdjustments,
      expenseOutAdjustments: metrics.expenseOutAdjustments,
      expectedCashInDrawer: metrics.expectedCashInDrawer,
      actualCashCounted: actualCount,
      cashVariance: variance,
      gcashSales: metrics.gcashSalesToday,
      gcashUtangCollected: metrics.gcashUtangCollectedToday,
      totalGcashCollected: metrics.gcashCollectedToday,
      newUtangIssued: metrics.newUtangIssuedToday,
      grossSales: metrics.grossSalesToday,
      grossProfit: metrics.realizedNetProfit,
      netProfitAfterExpenses: metrics.netProfitAfterExpenses,
      activeSalesCount: metrics.activeTransactionsCount,
      voidedSalesCount: metrics.voidedTransactionsCount,
    };
  };

  const handleSaveClosingAndPrintZ = (e: React.FormEvent) => {
    e.preventDefault();
    const dateKey = targetDateFilter || todayStr;
    const counted = Math.max(0, parseFloat(closingCountStr) || 0);
    onUpdateShiftRecord({
      dateKey,
      openingFloat: metrics.openingFloat,
      openedAt: currentShift?.openedAt || new Date().toISOString(),
      closedAt: new Date().toISOString(),
      actualClosingCashCounted: counted,
      closingNote: closingNote.trim() || undefined,
    });
    setIsClosingModalOpen(false);
    onPrintZReading(buildZReportData(counted));
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Date Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl leading-7 font-semibold text-[#181818]">
            Daily Cash Drawer, Shift Register &amp; Profit Reconciliation
          </h2>
          <p className="text-sm leading-5 font-normal text-neutral-500 mt-1">
            Track store opening float (Panukli), sales, petty cash expenses, and closing Z-Reading cash count
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select Shift Day to Inspect"
            value={selectedDateKey}
            onChange={(e) => setSelectedDateKey(e.target.value)}
            className="px-3 py-2 text-sm leading-5 font-semibold bg-white border border-neutral-300 rounded-xl text-[#181818] focus:outline-none focus:ring-2 focus:ring-[#181818]"
          >
            {recentDayOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                Shift Day: {opt.label}
              </option>
            ))}
            <option value="ALL">All Recorded Sessions (7-Day Combined)</option>
          </select>

          <button
            type="button"
            onClick={() => onPrintZReading(buildZReportData())}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm leading-5 font-semibold bg-[#181818] hover:bg-[#272727] text-white rounded-xl whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            <span>Print Z-Reading Report</span>
          </button>
        </div>
      </div>

      {/* Store Opening-to-Closing Shift Register Bar */}
      {selectedDateKey !== 'ALL' && (
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs leading-4 font-medium text-neutral-500">
                Morning Opening Float (Panukli)
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  data-testid="shift-opening-float"
                  className="font-mono text-xl leading-7 font-semibold tabular-nums text-[#181818]"
                >
                  {formatPHP(metrics.openingFloat)}
                </span>
                <button
                  type="button"
                  onClick={handleOpenFloatModal}
                  className="text-xs leading-4 font-semibold text-neutral-600 hover:text-[#181818] underline"
                >
                  Edit Float
                </button>
              </div>
            </div>

            <div className="h-8 w-px bg-neutral-200 hidden sm:block" />

            <div>
              <div className="text-xs leading-4 font-medium text-neutral-500">
                Petty Cash Expenses / Cash In
              </div>
              <div className="font-mono text-base leading-6 font-semibold tabular-nums mt-1">
                <span className="text-red-600">
                  -{formatPHP(metrics.expenseOutAdjustments)} out
                </span>
                {metrics.cashInAdjustments > 0 && (
                  <span className="text-emerald-700 ml-2">
                    +{formatPHP(metrics.cashInAdjustments)} in
                  </span>
                )}
              </div>
            </div>

            <div className="h-8 w-px bg-neutral-200 hidden sm:block" />

            <div>
              <div className="text-xs leading-4 font-medium text-neutral-500">
                Shift Closing Status
              </div>
              <div className="flex items-center gap-2 mt-1">
                {typeof metrics.actualClosingCashCounted === 'number' ? (
                  <span className="inline-flex items-center gap-1 text-sm leading-5 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Closed · Counted {formatPHP(metrics.actualClosingCashCounted)}{' '}
                      (
                      {metrics.cashVariance === 0
                        ? 'Exact'
                        : (metrics.cashVariance || 0) > 0
                        ? `Over +${formatPHP(metrics.cashVariance || 0)}`
                        : `Short ${formatPHP(metrics.cashVariance || 0)}`}
                      )
                    </span>
                  </span>
                ) : (
                  <span className="text-sm leading-5 font-semibold text-amber-700">
                    Shift Open · Pending Closing Cash Count
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm leading-5 font-semibold text-[#181818] bg-[#F6F6F4] hover:bg-neutral-200/80 border border-neutral-300 rounded-xl whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Log Petty Cash / Expense</span>
            </button>

            <button
              type="button"
              onClick={handleOpenClosingModal}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm leading-5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
            >
              <Wallet className="w-4 h-4" />
              <span>Close Shift &amp; Count Drawer</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 Financial Metric Cards (Heading 4: text-3xl leading-9 font-semibold tabular-nums) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. Expected Cash in Drawer */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between text-xs leading-4 font-medium text-neutral-600">
            <span>1. Expected Cash in Drawer (₱)</span>
            <Banknote className="w-4 h-4 text-emerald-700" />
          </div>
          <div
            data-testid="metric-expected-cash"
            className="font-mono text-3xl leading-9 font-semibold tabular-nums text-[#181818]"
          >
            {formatPHP(metrics.expectedCashInDrawer)}
          </div>
          <div className="text-xs leading-4 font-normal text-neutral-500">
            Float: {formatPHP(metrics.openingFloat)} · Cash Sales:{' '}
            {formatPHP(metrics.cashSalesToday)} · Utang Paid:{' '}
            {formatPHP(metrics.cashUtangCollectedToday)}
            {metrics.expenseOutAdjustments > 0
              ? ` · Exp: -${formatPHP(metrics.expenseOutAdjustments)}`
              : ''}
          </div>
        </div>

        {/* 2. GCash Collected Today */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between text-xs leading-4 font-medium text-neutral-600">
            <span>2. GCash Collected (₱)</span>
            <Smartphone className="w-4 h-4 text-blue-600" />
          </div>
          <div
            data-testid="metric-gcash-collected"
            className="font-mono text-3xl leading-9 font-semibold tabular-nums text-[#181818]"
          >
            {formatPHP(metrics.gcashCollectedToday)}
          </div>
          <div className="text-xs leading-4 font-normal text-neutral-500">
            GCash Sales: {formatPHP(metrics.gcashSalesToday)} · Utang Paid
            (GCash): {formatPHP(metrics.gcashUtangCollectedToday)}
          </div>
        </div>

        {/* 3. New Utang Issued Today */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between text-xs leading-4 font-medium text-neutral-600">
            <span>3. New Utang Issued (₱)</span>
            <BookOpen className="w-4 h-4 text-amber-600" />
          </div>
          <div
            data-testid="metric-new-utang"
            className="font-mono text-3xl leading-9 font-semibold tabular-nums text-amber-700"
          >
            {formatPHP(metrics.newUtangIssuedToday)}
          </div>
          <div className="text-xs leading-4 font-normal text-neutral-500">
            Uncollected credit issued during selected period
          </div>
        </div>

        {/* 4. Realized Net Profit */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between text-xs leading-4 font-medium text-neutral-600">
            <span>4. Realized Net Profit (₱)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            data-testid="metric-net-profit"
            className="font-mono text-3xl leading-9 font-semibold tabular-nums text-emerald-700"
          >
            {formatPHP(metrics.netProfitAfterExpenses)}
          </div>
          <div className="text-xs leading-4 font-normal text-neutral-500">
            Gross Sales: {formatPHP(metrics.grossSalesToday)} · Item Profit:{' '}
            {formatPHP(metrics.realizedNetProfit)}
          </div>
        </div>
      </div>

      {/* Daily & Weekly Sales & Profit Chart */}
      <SalesAnalyticsChart
        sales={sales}
        utangPayments={utangPayments}
        adjustments={adjustments}
        selectedDayKey={selectedDateKey}
        onSelectDayKey={(dayKey) => setSelectedDateKey(dayKey)}
      />

      {/* Petty Cash / Store Expenses List for Selected Period (if any) */}
      {filteredAdjustments.length > 0 && (
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-6">
          <div className="text-sm leading-5 font-semibold text-[#181818] mb-3">
            Petty Cash &amp; Drawer Adjustments ({filteredAdjustments.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAdjustments.map((adj) => (
              <div
                key={adj.id}
                className="p-3 bg-[#F6F6F4] border border-neutral-200 rounded-xl flex items-center justify-between gap-2 text-sm leading-5"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#181818] truncate">
                    {adj.reason}
                  </div>
                  <div className="text-xs leading-4 font-medium text-neutral-500 mt-0.5">
                    {new Date(adj.createdAt).toLocaleString('en-PH', {
                      month: 'short',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`font-mono text-base leading-6 font-semibold tabular-nums ${
                      adj.type === 'EXPENSE_OUT'
                        ? 'text-red-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    {adj.type === 'EXPENSE_OUT' ? '-' : '+'}
                    {formatPHP(adj.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete adjustment ${adj.reason}`}
                    onClick={() => onDeleteCashAdjustment(adj.id)}
                    className="p-1 text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History Table */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-4 bg-[#F6F6F4]/60">
          <div>
            <h3 className="text-base leading-6 font-semibold text-[#181818]">
              Transaction History ({filteredSales.length})
            </h3>
            <p className="text-xs leading-4 font-normal text-neutral-500 mt-1">
              Reprint any thermal receipt or void a returned sale to restore product stock
            </p>
          </div>

          <div className="relative min-w-[260px] sm:w-80">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Receipt #, Customer, or Item..."
              aria-label="Search transactions by Receipt #, Customer, or Item"
              className="w-full pl-9 pr-3 py-2 text-sm leading-5 font-medium bg-white border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-[#F6F6F4]/70 text-xs leading-4 font-medium text-neutral-500">
                <th className="py-3 px-4 sm:px-6">Receipt No.</th>
                <th className="py-3 px-3">Date &amp; Time</th>
                <th className="py-3 px-4">Items Sold</th>
                <th className="py-3 px-3">Payment / Customer</th>
                <th className="py-3 px-4 text-right">Total (₱)</th>
                <th className="py-3 px-3 text-right">Paid / Utang</th>
                <th className="py-3 px-3 text-right">Net Profit</th>
                <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/80">
              {filteredSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 px-6 text-center text-sm leading-5 font-normal text-neutral-500"
                  >
                    No transactions recorded for this date filter. Switch to "All Recorded Sessions" or complete a sale on the Cart Page.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const dt = new Date(sale.createdAt);
                  return (
                    <tr
                      key={sale.id}
                      className={`transition-colors ${
                        sale.voided
                          ? 'bg-neutral-100/70 text-neutral-400'
                          : 'hover:bg-[#F6F6F4]/60'
                      }`}
                    >
                      <td className="py-4 px-4 sm:px-6 font-mono text-sm leading-5 font-semibold text-[#181818]">
                        <div className={sale.voided ? 'line-through' : ''}>
                          {sale.receiptNo}
                        </div>
                        {sale.voided && (
                          <span className="text-xs leading-4 font-sans font-semibold text-red-600">
                            VOIDED (Stock Restored)
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-3 text-xs leading-4 font-medium text-neutral-600 whitespace-nowrap">
                        {dt.toLocaleDateString('en-PH', {
                          month: 'short',
                          day: '2-digit',
                        })}{' '}
                        {dt.toLocaleTimeString('en-PH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-4 px-4 max-w-xs">
                        <div className="truncate text-base leading-6 font-semibold text-[#181818]">
                          {sale.items
                            .map((i) => `${i.quantity}x ${i.name}`)
                            .join(', ')}
                        </div>
                        <div className="text-xs leading-4 font-medium text-neutral-500 mt-0.5">
                          {sale.totalItems} pcs total
                        </div>
                      </td>
                      <td className="py-4 px-3 text-xs leading-4">
                        <div className="font-semibold text-[#181818]">
                          {sale.paymentType}
                          {sale.splitToUtang ? ' + UTANG SPLIT' : ''}
                        </div>
                        {sale.customerName && (
                          <div className="text-neutral-600 font-medium mt-0.5">
                            Customer: {sale.customerName}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-base leading-6 font-semibold tabular-nums text-[#181818]">
                        {formatPHP(sale.grandTotal)}
                      </td>
                      <td className="py-4 px-3 text-right font-mono text-xs leading-4 tabular-nums">
                        <div className="font-medium text-neutral-700">
                          Paid: {formatPHP(sale.amountTendered)}
                        </div>
                        {sale.utangAmount > 0 && (
                          <div className="text-amber-700 font-semibold mt-0.5">
                            Utang: {formatPHP(sale.utangAmount)}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-3 text-right font-mono text-sm leading-5 font-semibold tabular-nums text-emerald-700">
                        {sale.voided ? '₱0.00' : formatPHP(sale.netProfit)}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onReprintSaleReceipt(sale)}
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs leading-4 font-semibold text-[#181818] bg-[#F6F6F4] hover:bg-neutral-200 border border-neutral-300 rounded-lg"
                          >
                            <Printer className="w-4 h-4" />
                            <span>Reprint Receipt</span>
                          </button>

                          {!sale.voided && (
                            <>
                              {confirmVoidId !== sale.id ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirmVoidId(sale.id)}
                                  className="inline-flex items-center gap-1 px-3 py-2 text-xs leading-4 font-semibold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  <span>Void / Return Sale</span>
                                </button>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onVoidSale(sale.id);
                                      setConfirmVoidId(null);
                                    }}
                                    className="px-3 py-2 text-xs leading-4 font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg"
                                  >
                                    Confirm Void
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmVoidId(null)}
                                    className="px-2 py-2 text-xs leading-4 font-medium text-neutral-600 hover:text-[#181818]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Edit Morning Opening Float (Panukli) */}
      {isFloatModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="float-modal-title"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="float-modal-title" className="text-lg leading-7 font-semibold text-[#181818]">
                Set Morning Opening Cash Float (Panukli)
              </h3>
              <button
                type="button"
                onClick={() => setIsFloatModalOpen(false)}
                aria-label="Close Float Modal"
                className="p-1 text-neutral-400 hover:text-[#181818]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveOpeningFloat} className="space-y-4">
              <div>
                <label
                  htmlFor="opening-float-input"
                  className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
                >
                  Starting Cash / Coins in Drawer (₱)
                </label>
                <input
                  id="opening-float-input"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={openingFloatStr}
                  onChange={(e) => setOpeningFloatStr(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-xl leading-7 font-semibold tabular-nums border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFloatModalOpen(false)}
                  className="px-3 py-2 text-sm leading-5 font-semibold text-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#181818] hover:bg-[#272727] text-white text-sm leading-5 font-semibold rounded-xl"
                >
                  Save Opening Float
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Log Petty Cash Expense / Cash In-Out */}
      {isExpenseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-modal-title"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="expense-modal-title" className="text-lg leading-7 font-semibold text-[#181818]">
                Log Petty Cash Expense or Drawer Cash-In
              </h3>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                aria-label="Close Petty Cash Modal"
                className="p-1 text-neutral-400 hover:text-[#181818]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveExpenseAdjustment} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjType('EXPENSE_OUT')}
                  className={`py-2 px-3 rounded-xl text-sm leading-5 font-semibold border ${
                    adjType === 'EXPENSE_OUT'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-neutral-700 border-neutral-300'
                  }`}
                >
                  Cash Out (Store Expense)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('CASH_IN')}
                  className={`py-2 px-3 rounded-xl text-sm leading-5 font-semibold border ${
                    adjType === 'CASH_IN'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-neutral-700 border-neutral-300'
                  }`}
                >
                  Cash In (Add Change)
                </button>
              </div>

              <div>
                <label
                  htmlFor="adj-amount-input"
                  className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
                >
                  Amount (₱) *
                </label>
                <input
                  id="adj-amount-input"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={adjAmountStr}
                  onChange={(e) => setAdjAmountStr(e.target.value)}
                  placeholder="e.g. 50.00"
                  className="w-full px-3 py-2 font-mono text-xl leading-7 font-semibold tabular-nums border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div>
                <label
                  htmlFor="adj-reason-input"
                  className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
                >
                  Reason / Description *
                </label>
                <input
                  id="adj-reason-input"
                  type="text"
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Plastic sando bags, tricycle delivery, thermal roll..."
                  className="w-full px-3 py-2 text-sm leading-5 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-3 py-2 text-sm leading-5 font-semibold text-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#181818] hover:bg-[#272727] text-white text-sm leading-5 font-semibold rounded-xl"
                >
                  Save Drawer Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Close Shift & Count Physical Cash Drawer */}
      {isClosingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="closing-modal-title"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="closing-modal-title" className="text-lg leading-7 font-semibold text-[#181818]">
                Close Shift &amp; Reconcile Physical Cash Drawer
              </h3>
              <button
                type="button"
                onClick={() => setIsClosingModalOpen(false)}
                aria-label="Close Shift Modal"
                className="p-1 text-neutral-400 hover:text-[#181818]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClosingAndPrintZ} className="space-y-4">
              <div className="p-4 bg-[#F6F6F4] border border-neutral-200 rounded-xl space-y-2 text-xs leading-4">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Opening Float (Panukli):</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatPHP(metrics.openingFloat)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">
                    + Cash Sales &amp; Cash Utang Collected:
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    +{formatPHP(metrics.netCashFromSalesAndUtang)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">- Petty Cash Expenses:</span>
                  <span className="font-mono font-semibold tabular-nums text-red-600">
                    -{formatPHP(metrics.expenseOutAdjustments)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-200 font-semibold text-[#181818] text-sm leading-5">
                  <span>Expected Cash in Drawer:</span>
                  <span className="font-mono text-base leading-6 tabular-nums">
                    {formatPHP(metrics.expectedCashInDrawer)}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="closing-cash-counted-input"
                  className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                >
                  Actual Physical Cash Counted in Box (₱) *
                </label>
                <input
                  id="closing-cash-counted-input"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={closingCountStr}
                  onChange={(e) => setClosingCountStr(e.target.value)}
                  className="w-full px-4 py-3 font-mono text-2xl leading-8 font-semibold tabular-nums text-right border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div>
                <label
                  htmlFor="closing-note-input"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-2"
                >
                  Closing Note (Optional)
                </label>
                <input
                  id="closing-note-input"
                  type="text"
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  placeholder="e.g. Left ₱1,000 float for tomorrow morning"
                  className="w-full px-3 py-2 text-sm leading-5 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="px-3 py-2 text-sm leading-5 font-semibold text-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm leading-5 font-semibold rounded-xl"
                >
                  <Printer className="w-4 h-4" />
                  <span>Close Shift &amp; Print Z-Reading</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
