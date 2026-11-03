import React, { useMemo, useState } from 'react';
import {
  Search,
  Wallet,
  Printer,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  CustomerUtangSummary,
  SaleTransaction,
  UtangPaymentTransaction,
} from '../types/pos';
import { formatPHP, roundCurrency } from '../utils/posLogic';

interface UtangLedgerPageProps {
  customerSummaries: CustomerUtangSummary[];
  onRecordUtangPayment: (payload: {
    customerName: string;
    previousBalance: number;
    amountPaid: number;
    paymentMethod: 'CASH' | 'GCASH';
    gcashRefNo?: string;
    note?: string;
  }) => void;
  onReprintSaleReceipt: (sale: SaleTransaction) => void;
  onReprintPaymentReceipt: (payment: UtangPaymentTransaction) => void;
}

export const UtangLedgerPage: React.FC<UtangLedgerPageProps> = ({
  customerSummaries,
  onRecordUtangPayment,
  onReprintSaleReceipt,
  onReprintPaymentReceipt,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'UNPAID' | 'ALL'>('UNPAID');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  // Settle / Record Payment Modal state
  const [paymentModalCustomer, setPaymentModalCustomer] =
    useState<CustomerUtangSummary | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH'>('CASH');
  const [amountPaidStr, setAmountPaidStr] = useState('');
  const [gcashRefNo, setGcashRefNo] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const totalOutstandingStoreUtang = useMemo(
    () =>
      roundCurrency(
        customerSummaries.reduce((acc, c) => acc + c.currentBalance, 0)
      ),
    [customerSummaries]
  );

  const unpaidCustomersCount = useMemo(
    () => customerSummaries.filter((c) => c.currentBalance > 0.009).length,
    [customerSummaries]
  );

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customerSummaries.filter((c) => {
      if (statusFilter === 'UNPAID' && c.currentBalance <= 0.009) {
        return false;
      }
      if (!q) return true;
      return (
        c.customerName.toLowerCase().includes(q) ||
        c.dueDateOrNotes.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [customerSummaries, searchQuery, statusFilter]);

  const openPaymentModal = (customer: CustomerUtangSummary) => {
    setPaymentModalCustomer(customer);
    setPaymentMethod('CASH');
    setAmountPaidStr(customer.currentBalance.toFixed(2));
    setGcashRefNo('');
    setPaymentNote('');
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalCustomer) return;
    const paid = roundCurrency(
      Math.min(
        paymentModalCustomer.currentBalance,
        Math.max(0.01, parseFloat(amountPaidStr) || 0)
      )
    );
    if (paid <= 0) return;

    onRecordUtangPayment({
      customerName: paymentModalCustomer.customerName,
      previousBalance: paymentModalCustomer.currentBalance,
      amountPaid: paid,
      paymentMethod,
      gcashRefNo: gcashRefNo.trim() || undefined,
      note: paymentNote.trim() || undefined,
    });

    setPaymentModalCustomer(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Utang Summary & Filter Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs font-medium text-slate-500">
              Total Uncollected Store Utang
            </div>
            <div
              data-testid="total-outstanding-utang"
              className="font-mono text-2xl font-bold text-amber-700"
            >
              {formatPHP(totalOutstandingStoreUtang)}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          <div>
            <div className="text-xs font-medium text-slate-500">
              Customers with Active Balance
            </div>
            <div className="font-mono text-lg font-bold text-slate-900">
              {unpaidCustomersCount}{' '}
              <span className="text-xs font-normal text-slate-500">
                of {customerSummaries.length} recorded
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer name or note..."
              aria-label="Search customer name or note"
              className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setStatusFilter('UNPAID')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'UNPAID'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              With Balance ({unpaidCustomersCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Customers ({customerSummaries.length})
            </button>
          </div>
        </div>
      </div>

      {/* Customer Grouped Utang List */}
      {filteredCustomers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-14 px-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-900">
            No unpaid customer Utang balances found
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            When a customer checks out using "Utang (Credit)" or splits a short cash payment to Utang on the Cart Page, their itemized debt and payment history will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((customer) => {
            const isExpanded =
              expandedCustomer === customer.normalizedName ||
              filteredCustomers.length === 1;
            const hasBalance = customer.currentBalance > 0.009;

            return (
              <div
                key={customer.normalizedName}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                {/* Customer Summary Row */}
                <div className="p-4 flex flex-wrap items-center justify-between gap-4 bg-slate-50/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {customer.customerName}
                      </h3>
                      <span className="text-xs text-slate-500">
                        · {customer.sales.length} credit{' '}
                        {customer.sales.length === 1 ? 'purchase' : 'purchases'}
                      </span>
                    </div>
                    {customer.dueDateOrNotes.length > 0 && (
                      <div className="text-xs text-slate-600 mt-0.5">
                        Notes/Due: {customer.dueDateOrNotes.join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-5">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">
                        Total Debt Taken / Paid
                      </div>
                      <div className="font-mono text-xs font-semibold text-slate-700">
                        {formatPHP(customer.totalUtangIssued)} /{' '}
                        <span className="text-emerald-700">
                          {formatPHP(customer.totalUtangPaid)} paid
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-slate-600">
                        Total Combined Debt
                      </div>
                      <div
                        className={`font-mono text-lg font-bold ${
                          hasBalance ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatPHP(customer.currentBalance)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasBalance && (
                        <button
                          type="button"
                          onClick={() => openPaymentModal(customer)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Record Payment / Settle Utang</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCustomer(
                            expandedCustomer === customer.normalizedName
                              ? null
                              : customer.normalizedName
                          )
                        }
                        aria-label={`Toggle itemized history for ${customer.customerName}`}
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <span>Itemized History</span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable Itemized Purchase & Payment History */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Left: Credit Purchases & Items Taken */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 mb-2">
                        Itemized Utang Purchases ({customer.sales.length})
                      </h4>
                      <div className="space-y-2.5">
                        {customer.sales.map((sale) => (
                          <div
                            key={sale.id}
                            className="p-3 border border-slate-200 rounded-lg text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-900">
                                {sale.receiptNo} ·{' '}
                                {new Date(sale.createdAt).toLocaleString(
                                  'en-PH',
                                  {
                                    month: 'short',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => onReprintSaleReceipt(sale)}
                                className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold underline"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Print Slip</span>
                              </button>
                            </div>

                            <div className="divide-y divide-slate-100 border-y border-slate-100 py-1">
                              {sale.items.map((item, i) => (
                                <div
                                  key={`${item.productId}-${i}`}
                                  className="py-0.5 flex justify-between text-slate-700"
                                >
                                  <span>
                                    {item.quantity}x {item.name}
                                  </span>
                                  <span className="font-mono">
                                    {formatPHP(item.quantity * item.unitPrice)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-between font-semibold pt-0.5">
                              <span className="text-slate-600">
                                Total: {formatPHP(sale.grandTotal)} (Paid:{' '}
                                {formatPHP(sale.amountTendered)})
                              </span>
                              <span className="font-mono text-amber-800 font-bold">
                                Utang Added: {formatPHP(sale.utangAmount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Payment Collection History */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 mb-2">
                        Utang Payments Collected ({customer.payments.length})
                      </h4>
                      {customer.payments.length === 0 ? (
                        <div className="p-4 border border-slate-200 rounded-lg text-xs text-slate-500">
                          No payments recorded yet for {customer.customerName}.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {customer.payments.map((pay) => (
                            <div
                              key={pay.id}
                              className="p-3 border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="font-mono font-bold text-slate-900">
                                  {pay.receiptNo} · {pay.paymentMethod}
                                  {pay.gcashRefNo ? ` (${pay.gcashRefNo})` : ''}
                                </div>
                                <div className="text-slate-500">
                                  {new Date(pay.createdAt).toLocaleString(
                                    'en-PH',
                                    {
                                      month: 'short',
                                      day: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                  {' · '}Prev:{' '}
                                  {formatPHP(pay.previousBalance)} → Rem:{' '}
                                  {formatPHP(pay.remainingBalance)}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono font-bold text-emerald-700">
                                  +{formatPHP(pay.amountPaid)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onReprintPaymentReceipt(pay)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 underline mt-0.5"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Receipt</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Record Payment / Settle Utang Modal */}
      {paymentModalCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settle-utang-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h2
                id="settle-utang-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Record Payment / Settle Utang
              </h2>
              <button
                type="button"
                onClick={() => setPaymentModalCustomer(null)}
                aria-label="Close Settle Utang Modal"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Customer Name</div>
                  <div className="text-sm font-bold text-slate-900">
                    {paymentModalCustomer.customerName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Current Balance</div>
                  <div className="font-mono text-lg font-bold text-amber-700">
                    {formatPHP(paymentModalCustomer.currentBalance)}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-800 mb-1.5">
                  Payment Method
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      paymentMethod === 'CASH'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('GCASH')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      paymentMethod === 'GCASH'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    GCash
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="utang-payment-amount"
                    className="text-xs font-bold text-slate-800"
                  >
                    Amount Paid Today (₱) *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setAmountPaidStr(
                        paymentModalCustomer.currentBalance.toFixed(2)
                      )
                    }
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Pay Full ({formatPHP(paymentModalCustomer.currentBalance)})
                  </button>
                </div>
                <input
                  id="utang-payment-amount"
                  type="number"
                  min="0.01"
                  max={paymentModalCustomer.currentBalance}
                  step="0.01"
                  required
                  value={amountPaidStr}
                  onChange={(e) => setAmountPaidStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 font-mono text-lg font-bold text-right border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {paymentMethod === 'GCASH' && (
                <div>
                  <label
                    htmlFor="utang-gcash-ref"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    GCash Reference No. (Optional)
                  </label>
                  <input
                    id="utang-gcash-ref"
                    type="text"
                    value={gcashRefNo}
                    onChange={(e) => setGcashRefNo(e.target.value)}
                    placeholder="e.g. 8091 223 4412"
                    className="w-full px-3 py-2 font-mono text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="utang-payment-note"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Note (Optional)
                </label>
                <input
                  id="utang-payment-note"
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. Partial payment received by cashier"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs font-semibold text-emerald-950">
                <span>Remaining Balance After Payment:</span>
                <span className="font-mono text-sm font-bold">
                  {formatPHP(
                    Math.max(
                      0,
                      paymentModalCustomer.currentBalance -
                        (parseFloat(amountPaidStr) || 0)
                    )
                  )}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentModalCustomer(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Save & Print Utang Payment Receipt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
