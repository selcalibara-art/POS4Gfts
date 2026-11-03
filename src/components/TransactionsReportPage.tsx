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
    // Stamp adjustment on the currently viewed date so simulating any day works seamlessly
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
    <div className="space-y-5">
      {/* Top Filter & Date Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Daily Cash Drawer, Shift Register & Profit Reconciliation
          </h2>
          <p className="text-xs text-slate-500">
            Track store opening float (Panukli), sales, petty cash expenses, and closing Z-Reading cash count
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select Shift Day to Inspect"
            value={selectedDateKey}
            onChange={(e) => setSelectedDateKey(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Print Z-Reading Report</span>
          </button>
        </div>
      </div>

      {/* Store Opening-to-Closing Shift Register Bar */}
      {selectedDateKey !== 'ALL' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-[11px] font-medium text-slate-500">
                Morning Opening Float (Panukli)
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  data-testid="shift-opening-float"
                  className="font-mono text-base font-bold text-slate-900"
                >
                  {formatPHP(metrics.openingFloat)}
                </span>
                <button
                  type="button"
                  onClick={handleOpenFloatModal}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
                >
                  Edit Float
                </button>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            <div>
              <div className="text-[11px] font-medium text-slate-500">
                Petty Cash Expenses / Cash In
              </div>
              <div className="font-mono text-sm font-bold mt-0.5">
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

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            <div>
              <div className="text-[11px] font-medium text-slate-500">
                Shift Closing Status
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {typeof metrics.actualClosingCashCounted === 'number' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
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
                  <span className="text-xs font-semibold text-amber-700">
                    Shift Open — Pending Closing Cash Count
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Log Petty Cash / Expense</span>
            </button>

            <button
              type="button"
              onClick={handleOpenClosingModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Close Shift & Count Drawer</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Expected Cash in Drawer */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>1. Expected Cash in Drawer (₱)</span>
            <Banknote className="w-4 h-4 text-emerald-700" />
          </div>
          <div
            data-testid="metric-expected-cash"
            className="font-mono text-2xl font-bold text-slate-900"
          >
            {formatPHP(metrics.expectedCashInDrawer)}
          </div>
          <div className="text-[11px] text-slate-500">
            Float: {formatPHP(metrics.openingFloat)} · Cash Sales:{' '}
            {formatPHP(metrics.cashSalesToday)} · Utang Paid:{' '}
            {formatPHP(metrics.cashUtangCollectedToday)}
            {metrics.expenseOutAdjustments > 0
              ? ` · Exp: -${formatPHP(metrics.expenseOutAdjustments)}`
              : ''}
          </div>
        </div>

        {/* 2. GCash Collected Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>2. GCash Collected (₱)</span>
            <Smartphone className="w-4 h-4 text-blue-600" />
          </div>
          <div
            data-testid="metric-gcash-collected"
            className="font-mono text-2xl font-bold text-slate-900"
          >
            {formatPHP(metrics.gcashCollectedToday)}
          </div>
          <div className="text-[11px] text-slate-500">
            GCash Sales: {formatPHP(metrics.gcashSalesToday)} · Utang Paid
            (GCash): {formatPHP(metrics.gcashUtangCollectedToday)}
          </div>
        </div>

        {/* 3. New Utang Issued Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>3. New Utang Issued (₱)</span>
            <BookOpen className="w-4 h-4 text-amber-600" />
          </div>
          <div
            data-testid="metric-new-utang"
            className="font-mono text-2xl font-bold text-amber-700"
          >
            {formatPHP(metrics.newUtangIssuedToday)}
          </div>
          <div className="text-[11px] text-slate-500">
            Uncollected credit issued during selected period
          </div>
        </div>

        {/* 4. Realized Net Profit */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>4. Realized Net Profit (₱)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            data-testid="metric-net-profit"
            className="font-mono text-2xl font-bold text-emerald-700"
          >
            {formatPHP(metrics.netProfitAfterExpenses)}
          </div>
          <div className="text-[11px] text-slate-500">
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
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-900 mb-2">
            Petty Cash & Drawer Adjustments ({filteredAdjustments.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredAdjustments.map((adj) => (
              <div
                key={adj.id}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {adj.reason}
                  </div>
                  <div className="text-[11px] text-slate-500">
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
                    className={`font-mono font-bold ${
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
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Transaction History ({filteredSales.length})
            </h3>
            <p className="text-xs text-slate-500">
              Reprint any thermal receipt or void a returned sale to restore product stock
            </p>
          </div>

          <div className="relative min-w-[260px] sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Receipt #, Customer, or Item..."
              aria-label="Search transactions by Receipt #, Customer, or Item"
              className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Receipt No.</th>
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-3">Items Sold</th>
                <th className="py-3 px-3">Payment / Customer</th>
                <th className="py-3 px-3 text-right">Total (₱)</th>
                <th className="py-3 px-3 text-right">Paid / Utang</th>
                <th className="py-3 px-3 text-right">Net Profit</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 px-4 text-center text-xs text-slate-500"
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
                          ? 'bg-slate-100/70 text-slate-400'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-xs font-bold text-slate-900">
                        <div className={sale.voided ? 'line-through' : ''}>
                          {sale.receiptNo}
                        </div>
                        {sale.voided && (
                          <span className="text-[10px] font-sans font-bold text-red-600">
                            VOIDED (Stock Restored)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {dt.toLocaleDateString('en-PH', {
                          month: 'short',
                          day: '2-digit',
                        })}{' '}
                        {dt.toLocaleTimeString('en-PH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-700 max-w-xs">
                        <div className="truncate font-medium">
                          {sale.items
                            .map((i) => `${i.quantity}x ${i.name}`)
                            .join(', ')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {sale.totalItems} pcs total
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <div className="font-semibold text-slate-900">
                          {sale.paymentType}
                          {sale.splitToUtang ? ' + UTANG SPLIT' : ''}
                        </div>
                        {sale.customerName && (
                          <div className="text-slate-600">
                            Customer: {sale.customerName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {formatPHP(sale.grandTotal)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs">
                        <div>Paid: {formatPHP(sale.amountTendered)}</div>
                        {sale.utangAmount > 0 && (
                          <div className="text-amber-700 font-semibold">
                            Utang: {formatPHP(sale.utangAmount)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-emerald-700">
                        {sale.voided ? '₱0.00' : formatPHP(sale.netProfit)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onReprintSaleReceipt(sale)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Reprint Receipt</span>
                          </button>

                          {!sale.voided && (
                            <>
                              {confirmVoidId !== sale.id ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirmVoidId(sale.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-md transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
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
                                    className="px-2.5 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                                  >
                                    Confirm Void
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmVoidId(null)}
                                    className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="float-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 id="float-modal-title" className="text-sm font-bold text-slate-900">
                Set Morning Opening Cash Float (Panukli)
              </h3>
              <button
                type="button"
                onClick={() => setIsFloatModalOpen(false)}
                aria-label="Close Float Modal"
                className="text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveOpeningFloat} className="space-y-4">
              <div>
                <label
                  htmlFor="opening-float-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 font-mono text-base font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFloatModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 id="expense-modal-title" className="text-sm font-bold text-slate-900">
                Log Petty Cash Expense or Drawer Cash-In
              </h3>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                aria-label="Close Petty Cash Modal"
                className="text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveExpenseAdjustment} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjType('EXPENSE_OUT')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border ${
                    adjType === 'EXPENSE_OUT'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Cash Out (Store Expense)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('CASH_IN')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border ${
                    adjType === 'CASH_IN'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Cash In (Add Change)
                </button>
              </div>

              <div>
                <label
                  htmlFor="adj-amount-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 font-mono text-base font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="adj-reason-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="closing-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 id="closing-modal-title" className="text-sm font-bold text-slate-900">
                Close Shift & Reconcile Physical Cash Drawer
              </h3>
              <button
                type="button"
                onClick={() => setIsClosingModalOpen(false)}
                aria-label="Close Shift Modal"
                className="text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClosingAndPrintZ} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Opening Float (Panukli):</span>
                  <span className="font-mono font-semibold">
                    {formatPHP(metrics.openingFloat)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    + Cash Sales & Cash Utang Collected:
                  </span>
                  <span className="font-mono font-semibold">
                    +{formatPHP(metrics.netCashFromSalesAndUtang)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">- Petty Cash Expenses:</span>
                  <span className="font-mono font-semibold text-red-600">
                    -{formatPHP(metrics.expenseOutAdjustments)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-slate-900 text-sm">
                  <span>Expected Cash in Drawer:</span>
                  <span className="font-mono">
                    {formatPHP(metrics.expectedCashInDrawer)}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="closing-cash-counted-input"
                  className="block text-xs font-bold text-slate-800 mb-1"
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
                  className="w-full px-3.5 py-2.5 font-mono text-lg font-bold text-right border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="closing-note-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Closing Note (Optional)
                </label>
                <input
                  id="closing-note-input"
                  type="text"
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  placeholder="e.g. Left ₱1,000 float for tomorrow morning"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Close Shift & Print Z-Reading</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
