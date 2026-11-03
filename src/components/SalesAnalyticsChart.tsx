import React, { useMemo, useState } from 'react';
import { BarChart3, CalendarDays } from 'lucide-react';
import {
  CashDrawerAdjustment,
  SaleTransaction,
  UtangPaymentTransaction,
} from '../types/pos';
import {
  SalesChartBucket,
  computeDailySalesSeries,
  computeWeeklySalesSeries,
  formatPHP,
  roundCurrency,
} from '../utils/posLogic';

interface SalesAnalyticsChartProps {
  sales: SaleTransaction[];
  utangPayments: UtangPaymentTransaction[];
  adjustments?: CashDrawerAdjustment[];
  selectedDayKey?: string;
  onSelectDayKey?: (dateKey: string) => void;
}

type ChartPeriod = 'DAILY' | 'WEEKLY';

const MAX_BAR_HEIGHT_PX = 144;

export const SalesAnalyticsChart: React.FC<SalesAnalyticsChartProps> = ({
  sales,
  utangPayments,
  adjustments = [],
  selectedDayKey,
  onSelectDayKey,
}) => {
  const [period, setPeriod] = useState<ChartPeriod>('DAILY');
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(
    null
  );

  const dailySeries = useMemo(
    () => computeDailySalesSeries(sales, utangPayments, 7, new Date(), adjustments),
    [sales, utangPayments, adjustments]
  );

  const weeklySeries = useMemo(
    () => computeWeeklySalesSeries(sales, utangPayments, 6, new Date(), adjustments),
    [sales, utangPayments, adjustments]
  );

  const activeSeries: SalesChartBucket[] =
    period === 'DAILY' ? dailySeries : weeklySeries;

  const maxMetricValue = useMemo(() => {
    let maxVal = 0;
    for (const b of activeSeries) {
      if (b.grossSales > maxVal) maxVal = b.grossSales;
      if (b.cashCollected + b.gcashCollected > maxVal) {
        maxVal = b.cashCollected + b.gcashCollected;
      }
    }
    return maxVal > 0 ? Math.ceil(maxVal / 50) * 50 : 500;
  }, [activeSeries]);

  const periodTotals = useMemo(() => {
    let gross = 0;
    let profit = 0;
    let cash = 0;
    let gcash = 0;
    let utang = 0;
    let expenses = 0;
    let txCount = 0;

    for (const b of activeSeries) {
      gross += b.grossSales;
      profit += b.netProfit;
      cash += b.cashCollected;
      gcash += b.gcashCollected;
      utang += b.utangIssued;
      expenses += b.expensesOut;
      txCount += b.transactionsCount;
    }

    const avgGross =
      activeSeries.length > 0 ? roundCurrency(gross / activeSeries.length) : 0;

    return {
      gross: roundCurrency(gross),
      profit: roundCurrency(profit),
      netAfterExpenses: roundCurrency(profit - expenses),
      cash: roundCurrency(cash),
      gcash: roundCurrency(gcash),
      utang: roundCurrency(utang),
      expenses: roundCurrency(expenses),
      txCount,
      avgGross,
    };
  }, [activeSeries]);

  const effectiveKey =
    period === 'DAILY' && selectedDayKey && selectedDayKey !== 'ALL'
      ? selectedDayKey
      : selectedBucketKey;

  const inspectedBucket: SalesChartBucket = useMemo(() => {
    if (effectiveKey) {
      const found = activeSeries.find((b) => b.key === effectiveKey);
      if (found) return found;
    }
    return activeSeries[activeSeries.length - 1];
  }, [activeSeries, effectiveKey]);

  const yTicks = useMemo(() => {
    return [
      maxMetricValue,
      roundCurrency(maxMetricValue * 0.75),
      roundCurrency(maxMetricValue * 0.5),
      roundCurrency(maxMetricValue * 0.25),
      0,
    ];
  }, [maxMetricValue]);

  const handleBarClick = (bucketKey: string) => {
    setSelectedBucketKey(bucketKey);
    if (period === 'DAILY' && onSelectDayKey) {
      onSelectDayKey(bucketKey);
    }
  };

  return (
    <div
      data-testid="sales-analytics-chart"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Chart Header & Period Switcher */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-4 h-4 text-slate-800 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {period === 'DAILY'
                ? 'Daily Sales & Profit Trend (Last 7 Days)'
                : 'Weekly Sales & Profit Trend (Last 6 Weeks)'}
            </h3>
            <p className="text-xs text-slate-500">
              Compare Gross Sales (₱) vs. Realized Net Profit (₱) · Click any day bar to inspect & filter shift reconciliation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-slate-900 inline-block" />
              <span>Gross Sales (₱)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
              <span>Net Profit (₱)</span>
            </span>
          </div>

          {/* Daily vs Weekly Segmented Toggle */}
          <div
            role="group"
            aria-label="Chart Period Selector"
            className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg"
          >
            <button
              type="button"
              onClick={() => {
                setPeriod('DAILY');
                setSelectedBucketKey(null);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                period === 'DAILY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily (7 Days)
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod('WEEKLY');
                setSelectedBucketKey(null);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                period === 'WEEKLY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Weekly (6 Weeks)
            </button>
          </div>
        </div>
      </div>

      {/* Main Chart Body: Left Bar Visualization + Right Period & Selected Bucket Inspector */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Bar Chart Area (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between">
          <div className="relative flex">
            {/* Y-Axis Labels aligned to the 144px plot height */}
            <div
              style={{ height: `${MAX_BAR_HEIGHT_PX}px` }}
              className="w-16 pr-2 mt-6 flex flex-col justify-between text-right font-mono text-[11px] text-slate-400 select-none"
            >
              {yTicks.map((tick, idx) => (
                <span key={idx} className="leading-none">
                  ₱{tick.toLocaleString('en-PH')}
                </span>
              ))}
            </div>

            {/* Plot Area with Horizontal Gridlines & Grouped Bars */}
            <div className="flex-1 relative">
              {/* Grid lines matching the exact 144px bar height area */}
              <div
                style={{ height: `${MAX_BAR_HEIGHT_PX}px` }}
                className="absolute inset-x-0 top-6 flex flex-col justify-between pointer-events-none"
              >
                {yTicks.map((_, idx) => (
                  <div
                    key={idx}
                    className="border-b border-dashed border-slate-200 w-full h-0"
                  />
                ))}
              </div>

              {/* Bars Row */}
              <div className="relative z-10 flex items-end justify-around gap-2 px-2">
                {activeSeries.map((bucket) => {
                  const grossHeightPx =
                    bucket.grossSales > 0
                      ? Math.max(
                          6,
                          Math.round(
                            (bucket.grossSales / maxMetricValue) *
                              MAX_BAR_HEIGHT_PX
                          )
                        )
                      : 2;
                  const profitHeightPx =
                    bucket.netProfit > 0
                      ? Math.max(
                          6,
                          Math.round(
                            (bucket.netProfit / maxMetricValue) *
                              MAX_BAR_HEIGHT_PX
                          )
                        )
                      : 2;
                  const isSelected = inspectedBucket?.key === bucket.key;

                  return (
                    <button
                      key={`${period}-${bucket.key}`}
                      type="button"
                      onClick={() => handleBarClick(bucket.key)}
                      aria-label={`Inspect ${bucket.label}: Gross Sales ${formatPHP(
                        bucket.grossSales
                      )}, Net Profit ${formatPHP(bucket.netProfit)}`}
                      className={`group flex-1 flex flex-col items-center rounded-lg px-1.5 py-1.5 focus:outline-none ${
                        isSelected
                          ? 'bg-slate-100 ring-1 ring-slate-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Fixed-height plot track so bars grow upward from the baseline */}
                      <div
                        style={{ height: `${MAX_BAR_HEIGHT_PX + 18}px` }}
                        className="w-full max-w-[56px] flex flex-col justify-end items-center"
                      >
                        <div
                          className={`font-mono text-[10px] mb-1 whitespace-nowrap ${
                            bucket.grossSales > 0
                              ? 'font-bold text-slate-900'
                              : 'font-medium text-slate-400'
                          }`}
                        >
                          {bucket.grossSales > 0
                            ? formatPHP(bucket.grossSales)
                            : '₱0'}
                        </div>

                        <div className="w-full flex items-end justify-center gap-1">
                          {/* Gross Sales Bar */}
                          <div
                            style={{ height: `${grossHeightPx}px` }}
                            className={`w-1/2 rounded-t-sm ${
                              bucket.grossSales > 0
                                ? 'bg-slate-900'
                                : 'bg-slate-200'
                            }`}
                            title={`Gross Sales: ${formatPHP(bucket.grossSales)}`}
                          />

                          {/* Net Profit Bar */}
                          <div
                            style={{ height: `${profitHeightPx}px` }}
                            className={`w-1/2 rounded-t-sm ${
                              bucket.netProfit > 0
                                ? 'bg-emerald-600'
                                : 'bg-slate-200'
                            }`}
                            title={`Net Profit: ${formatPHP(bucket.netProfit)}`}
                          />
                        </div>
                      </div>

                      {/* X-Axis Bucket Label */}
                      <div
                        className={`mt-2 text-[11px] whitespace-nowrap truncate max-w-full ${
                          isSelected
                            ? 'font-bold text-slate-900'
                            : 'font-medium text-slate-600'
                        }`}
                      >
                        {bucket.shortLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Breakdown Inspector Panel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-6 space-y-4">
          {inspectedBucket && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-700" />
                  <span>{inspectedBucket.label}</span>
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {inspectedBucket.transactionsCount}{' '}
                  {inspectedBucket.transactionsCount === 1 ? 'sale' : 'sales'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500">Gross Sales</div>
                  <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
                    {formatPHP(inspectedBucket.grossSales)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <div className="text-[11px] text-emerald-800">Net Profit</div>
                  <div className="font-mono text-base font-bold text-emerald-700 mt-0.5">
                    {formatPHP(inspectedBucket.netProfit)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between text-slate-600">
                  <span>Cash Collected (Sales + Utang):</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatPHP(inspectedBucket.cashCollected)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GCash Collected:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatPHP(inspectedBucket.gcashCollected)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>New Utang Issued:</span>
                  <span className="font-mono font-semibold text-amber-700">
                    {formatPHP(inspectedBucket.utangIssued)}
                  </span>
                </div>
                {inspectedBucket.expensesOut > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Petty Cash / Expenses Out:</span>
                    <span className="font-mono font-semibold text-red-600">
                      -{formatPHP(inspectedBucket.expensesOut)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Period Summary Footer */}
          <div className="pt-3 border-t border-slate-200 space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>
                {period === 'DAILY' ? '7-Day Total Sales:' : '6-Week Total Sales:'}
              </span>
              <span className="font-mono font-bold text-slate-900">
                {formatPHP(periodTotals.gross)} ({periodTotals.txCount} sales)
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>
                {period === 'DAILY' ? 'Daily Average:' : 'Weekly Average:'}
              </span>
              <span className="font-mono font-semibold text-slate-800">
                {formatPHP(periodTotals.avgGross)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>
                {period === 'DAILY'
                  ? '7-Day Net Profit (After Exp):'
                  : '6-Week Net Profit (After Exp):'}
              </span>
              <span className="font-mono font-bold text-emerald-700">
                {formatPHP(periodTotals.netAfterExpenses)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
