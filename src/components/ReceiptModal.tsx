import React, { useEffect, useState } from 'react';
import { Printer, Copy, X, CheckCircle2 } from 'lucide-react';
import { ActiveReceiptModal, StoreSettings } from '../types/pos';
import { formatPHP } from '../utils/posLogic';

interface ReceiptModalProps {
  receiptData: ActiveReceiptModal | null;
  settings: StoreSettings;
  onClose: () => void;
  onUpdatePaperSize?: (size: '58mm' | '80mm') => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receiptData,
  settings,
  onClose,
  onUpdatePaperSize,
}) => {
  const [isStoreCopy, setIsStoreCopy] = useState<boolean>(
    Boolean(receiptData?.isStoreCopy)
  );

  useEffect(() => {
    setIsStoreCopy(Boolean(receiptData?.isStoreCopy));
  }, [receiptData]);

  useEffect(() => {
    if (!receiptData) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        window.print();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [receiptData, onClose]);

  if (!receiptData) return null;

  const is58mm = settings.paperSize === '58mm';
  const divider = is58mm
    ? '--------------------------------'
    : '------------------------------------------';

  const handlePrintPrimary = () => {
    setIsStoreCopy(false);
    setTimeout(() => {
      window.print();
    }, 40);
  };

  const handlePrintStoreCopy = () => {
    setIsStoreCopy(true);
    setTimeout(() => {
      window.print();
    }, 40);
  };

  const renderReceiptContent = () => {
    if (receiptData.kind === 'SALE') {
      const { sale } = receiptData;
      const isUtangReceipt = sale.paymentType === 'UTANG' || sale.utangAmount > 0;
      const dt = new Date(sale.createdAt);
      const formattedDate = dt.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
      const formattedTime = dt.toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return (
        <div
          id="printable-receipt"
          data-paper-size={settings.paperSize}
          className={`bg-white text-black font-mono mx-auto select-all ${
            is58mm ? 'w-[240px] text-[11px]' : 'w-[320px] text-[12px]'
          } p-3 leading-snug`}
        >
          {/* Store Header */}
          <div className="text-center">
            <div className="font-bold text-sm tracking-tight uppercase">
              {settings.storeName || 'FOUR GIFTS STORE'}
            </div>
            {settings.subtitle && (
              <div className="text-[10px] leading-tight mt-0.5">{settings.subtitle}</div>
            )}
            {settings.address && (
              <div className="text-[10px] leading-tight">{settings.address}</div>
            )}
            {settings.contactNumber && (
              <div className="text-[10px] leading-tight">Tel: {settings.contactNumber}</div>
            )}
          </div>

          {isStoreCopy && (
            <div className="text-center font-bold mt-1.5 py-0.5 border-y border-black">
              *** STORE COPY ***
            </div>
          )}

          {sale.voided && (
            <div className="text-center font-bold mt-1.5 py-0.5 border-y border-black">
              *** VOIDED / RETURNED SALE ***
            </div>
          )}

          {isUtangReceipt && (
            <div className="text-center font-bold mt-1.5 py-0.5 border-y border-black">
              *** UTANG / CREDIT SLIP ***
            </div>
          )}

          <div className="my-1 text-center">{divider}</div>

          {/* Receipt Metadata */}
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Receipt No:</span>
              <span className="font-bold">{sale.receiptNo}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>
                {formattedDate} {formattedTime}
              </span>
            </div>
            {sale.customerName && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-bold">{sale.customerName}</span>
              </div>
            )}
          </div>

          <div className="my-1 text-center">{divider}</div>

          {/* Item Table */}
          <div className="space-y-1.5">
            {sale.items.map((item, idx) => {
              const lineSubtotal = item.quantity * item.unitPrice;
              return (
                <div key={`${item.productId}-${idx}`} className="leading-tight">
                  <div className="font-semibold break-words">{item.name}</div>
                  <div className="flex justify-between text-[11px]">
                    <span>
                      {item.quantity} x {formatPHP(item.unitPrice)}
                    </span>
                    <span className="font-semibold">{formatPHP(lineSubtotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="my-1 text-center">{divider}</div>

          {/* Totals Section */}
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Items Count:</span>
              <span>{sale.totalItems}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatPHP(sale.subtotal)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatPHP(sale.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-0.5">
              <span>TOTAL (₱):</span>
              <span>{formatPHP(sale.grandTotal)}</span>
            </div>
          </div>

          <div className="my-1 text-center">{divider}</div>

          {/* Standard vs Utang Payment Details */}
          {!isUtangReceipt ? (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span className="font-bold">
                  {sale.paymentType}
                  {sale.paymentType === 'GCASH' && sale.gcashRefNo
                    ? ` (${sale.gcashRefNo})`
                    : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Amount Tendered:</span>
                <span>{formatPHP(sale.amountTendered)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>CHANGE (₱):</span>
                <span>{formatPHP(sale.changeGiven)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Customer Name:</span>
                <span className="font-bold">{sale.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Purchase:</span>
                <span>{formatPHP(sale.grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Downpayment Paid:</span>
                <span>
                  {formatPHP(sale.amountTendered)}
                  {sale.paymentType !== 'UTANG' ? ` (${sale.paymentType})` : ''}
                </span>
              </div>
              <div className="flex justify-between font-bold text-xs pt-0.5">
                <span>UNPAID BALANCE (UTANG):</span>
                <span>{formatPHP(sale.utangAmount)}</span>
              </div>
              {typeof sale.customerCumulativeUtangAfterSale === 'number' && (
                <div className="flex justify-between font-bold pt-0.5">
                  <span>Total Cumulative Utang:</span>
                  <span>{formatPHP(sale.customerCumulativeUtangAfterSale)}</span>
                </div>
              )}
              {sale.dueDateOrNote && (
                <div className="pt-1 text-[10px]">
                  <span className="font-semibold">Due/Note:</span> {sale.dueDateOrNote}
                </div>
              )}
              <div className="pt-5 pb-1 text-[11px]">
                <div>Signed: ______________________</div>
                <div className="text-[10px] text-center mt-0.5">
                  Customer Acknowledgment
                </div>
              </div>
            </div>
          )}

          <div className="my-1 text-center">{divider}</div>

          {/* Footer */}
          <div className="text-center text-[10px] pt-0.5">
            {settings.footerMessage || 'Thank you for shopping at Four Gifts Store!'}
          </div>
        </div>
      );
    }

    if (receiptData.kind === 'UTANG_PAYMENT') {
      const { payment } = receiptData;
      const dt = new Date(payment.createdAt);
      const formattedDate = dt.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
      const formattedTime = dt.toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return (
        <div
          id="printable-receipt"
          data-paper-size={settings.paperSize}
          className={`bg-white text-black font-mono mx-auto select-all ${
            is58mm ? 'w-[240px] text-[11px]' : 'w-[320px] text-[12px]'
          } p-3 leading-snug`}
        >
          <div className="text-center">
            <div className="font-bold text-sm tracking-tight uppercase">
              {settings.storeName || 'FOUR GIFTS STORE'}
            </div>
            {settings.address && (
              <div className="text-[10px] leading-tight">{settings.address}</div>
            )}
            {settings.contactNumber && (
              <div className="text-[10px] leading-tight">
                Tel: {settings.contactNumber}
              </div>
            )}
          </div>

          <div className="text-center font-bold mt-1.5 py-0.5 border-y border-black">
            *** UTANG PAYMENT RECEIPT ***
          </div>

          {isStoreCopy && (
            <div className="text-center font-bold mt-1 py-0.5 border-b border-black">
              *** STORE COPY ***
            </div>
          )}

          <div className="my-1 text-center">{divider}</div>

          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Receipt No:</span>
              <span className="font-bold">{payment.receiptNo}</span>
            </div>
            <div className="flex justify-between">
              <span>Date/Time:</span>
              <span>
                {formattedDate} {formattedTime}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Customer Name:</span>
              <span className="font-bold">{payment.customerName}</span>
            </div>
          </div>

          <div className="my-1 text-center">{divider}</div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Previous Balance:</span>
              <span>{formatPHP(payment.previousBalance)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Amount Paid Today ({payment.paymentMethod}):</span>
              <span>{formatPHP(payment.amountPaid)}</span>
            </div>
            {payment.gcashRefNo && (
              <div className="flex justify-between text-[10px]">
                <span>GCash Ref #:</span>
                <span>{payment.gcashRefNo}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-black">
              <span>Remaining Balance:</span>
              <span>{formatPHP(payment.remainingBalance)}</span>
            </div>
          </div>

          {payment.note && (
            <div className="mt-1.5 text-[10px]">
              <span className="font-semibold">Note:</span> {payment.note}
            </div>
          )}

          <div className="my-1 text-center">{divider}</div>

          <div className="text-center text-[10px] pt-0.5">
            {settings.footerMessage ||
              'Thank you for shopping at Four Gifts Store!'}
          </div>
        </div>
      );
    }

    // Z_READING End-of-Day Closing Report
    const { zReport } = receiptData;
    return (
      <div
        id="printable-receipt"
        data-paper-size={settings.paperSize}
        className={`bg-white text-black font-mono mx-auto select-all ${
          is58mm ? 'w-[240px] text-[11px]' : 'w-[320px] text-[12px]'
        } p-3 leading-snug`}
      >
        <div className="text-center">
          <div className="font-bold text-sm tracking-tight uppercase">
            {settings.storeName || 'FOUR GIFTS STORE'}
          </div>
          {settings.address && (
            <div className="text-[10px] leading-tight">{settings.address}</div>
          )}
        </div>

        <div className="text-center font-bold mt-1.5 py-0.5 border-y border-black">
          *** END-OF-DAY Z-READING ***
        </div>

        <div className="my-1 text-center">{divider}</div>

        <div className="space-y-0.5 text-[11px]">
          <div className="flex justify-between">
            <span>Report Date:</span>
            <span className="font-bold">{zReport.dateLabel}</span>
          </div>
          <div className="flex justify-between">
            <span>Active Sales:</span>
            <span>{zReport.activeSalesCount} txns</span>
          </div>
          <div className="flex justify-between">
            <span>Voided / Returned:</span>
            <span>{zReport.voidedSalesCount} txns</span>
          </div>
        </div>

        <div className="my-1 text-center">{divider}</div>

        <div className="space-y-0.5">
          <div className="font-bold">CASH DRAWER RECONCILIATION</div>
          <div className="flex justify-between">
            <span>Opening Float (Panukli):</span>
            <span>{formatPHP(zReport.openingFloat)}</span>
          </div>
          <div className="flex justify-between">
            <span>+ Cash Sales:</span>
            <span>{formatPHP(zReport.cashSales)}</span>
          </div>
          <div className="flex justify-between">
            <span>+ Utang Paid (Cash):</span>
            <span>{formatPHP(zReport.cashUtangCollected)}</span>
          </div>
          {zReport.cashInAdjustments > 0 && (
            <div className="flex justify-between">
              <span>+ Cash In Added:</span>
              <span>{formatPHP(zReport.cashInAdjustments)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>- Petty Cash / Expenses:</span>
            <span>-{formatPHP(zReport.expenseOutAdjustments)}</span>
          </div>
          <div className="flex justify-between font-bold pt-1 border-t border-dashed border-black">
            <span>EXPECTED CASH:</span>
            <span>{formatPHP(zReport.expectedCashInDrawer)}</span>
          </div>
          {typeof zReport.actualCashCounted === 'number' && (
            <>
              <div className="flex justify-between font-bold">
                <span>ACTUAL COUNTED:</span>
                <span>{formatPHP(zReport.actualCashCounted)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>VARIANCE:</span>
                <span>
                  {zReport.cashVariance === 0
                    ? 'EXACT (₱0.00)'
                    : (zReport.cashVariance || 0) > 0
                    ? `OVER +${formatPHP(zReport.cashVariance || 0)}`
                    : `SHORT ${formatPHP(zReport.cashVariance || 0)}`}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="my-1 text-center">{divider}</div>

        <div className="space-y-0.5">
          <div className="font-bold">NON-CASH & PROFIT SUMMARY</div>
          <div className="flex justify-between">
            <span>GCash Collected:</span>
            <span>{formatPHP(zReport.totalGcashCollected)}</span>
          </div>
          <div className="flex justify-between">
            <span>New Utang Issued:</span>
            <span>{formatPHP(zReport.newUtangIssued)}</span>
          </div>
          <div className="flex justify-between">
            <span>Gross Sales:</span>
            <span>{formatPHP(zReport.grossSales)}</span>
          </div>
          <div className="flex justify-between">
            <span>Item Margin Profit:</span>
            <span>{formatPHP(zReport.grossProfit)}</span>
          </div>
          <div className="flex justify-between font-bold pt-0.5">
            <span>NET PROFIT (After Exp):</span>
            <span>{formatPHP(zReport.netProfitAfterExpenses)}</span>
          </div>
        </div>

        <div className="pt-5 pb-1 text-[11px]">
          <div>Cashier Sign: ________________</div>
        </div>

        <div className="my-1 text-center">{divider}</div>
        <div className="text-center text-[10px]">
          Closed & Reconciled — {settings.storeName}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="bg-white border border-neutral-200 rounded-2xl max-w-xl w-full overflow-hidden shadow-xl">
        {/* Top Modal Header (Hidden when printing) */}
        <div className="no-print flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-[#F6F6F4]/70">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <h2 id="receipt-modal-title" className="text-base font-bold text-[#181818]">
              {receiptData.kind === 'SALE'
                ? 'Thermal Receipt Preview'
                : receiptData.kind === 'UTANG_PAYMENT'
                ? 'Utang Payment Receipt Preview'
                : 'End-of-Day Z-Reading Thermal Report'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {onUpdatePaperSize && (
              <div className="flex items-center bg-[#F6F6F4] border border-neutral-200 p-0.5 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => onUpdatePaperSize('58mm')}
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                    settings.paperSize === '58mm'
                      ? 'bg-white text-[#181818] shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-[#181818]'
                  }`}
                >
                  58mm
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePaperSize('80mm')}
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                    settings.paperSize === '80mm'
                      ? 'bg-white text-[#181818] shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-[#181818]'
                  }`}
                >
                  80mm
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Receipt Modal"
              className="p-1.5 text-neutral-500 hover:text-[#181818] rounded-lg hover:bg-neutral-200/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Paper Container */}
        <div className="bg-[#F6F6F4] py-6 px-4 max-h-[65vh] overflow-y-auto flex justify-center">
          <div className="bg-white border border-neutral-300 shadow-xs">
            {renderReceiptContent()}
          </div>
        </div>

        {/* Receipt Modal Action Controls (Hidden when printing) */}
        <div className="no-print px-5 py-4 bg-white border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={handlePrintPrimary}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#181818] hover:bg-[#272727] text-white text-xs font-semibold rounded-xl whitespace-nowrap"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Print Receipt (Enter)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintStoreCopy}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#F6F6F4] hover:bg-neutral-200 text-[#181818] border border-neutral-300 text-xs font-semibold rounded-xl whitespace-nowrap"
          >
            <Copy className="w-4 h-4 shrink-0" />
            <span>Print 2nd Copy (Store)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl whitespace-nowrap"
          >
            <span>New Sale / Close (Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
