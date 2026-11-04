import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Printer,
  ShoppingBag,
  X,
} from 'lucide-react';
import {
  CartItem,
  CustomerUtangSummary,
  ParkedCart,
  PaymentType,
  Product,
} from '../types/pos';
import {
  calculateCartTotals,
  computeCheckoutSettlement,
  formatPHP,
  roundCurrency,
} from '../utils/posLogic';

interface CartPageProps {
  products: Product[];
  cart: CartItem[];
  discount: number;
  parkedCarts: ParkedCart[];
  customerSummaries: CustomerUtangSummary[];
  autoPrint: boolean;
  onToggleAutoPrint: (checked: boolean) => void;
  onAddProductToCart: (product: Product) => void;
  onUpdateCartQuantity: (productId: string, newQty: number) => void;
  onUpdateCartUnitPrice: (productId: string, newPrice: number) => void;
  onRemoveCartItem: (productId: string) => void;
  onUpdateDiscount: (discount: number) => void;
  onClearCart: () => void;
  onParkCurrentCart: (note?: string) => void;
  onResumeParkedCart: (parkedId: string) => void;
  onDeleteParkedCart: (parkedId: string) => void;
  onCompleteSale: (payload: {
    paymentType: PaymentType;
    amountTendered: number;
    splitRemainderToUtang: boolean;
    customerName: string;
    gcashRefNo: string;
    dueDateOrNote: string;
  }) => void;
  focusTrigger: number;
}

export const CartPage: React.FC<CartPageProps> = ({
  products,
  cart,
  discount,
  parkedCarts,
  customerSummaries,
  autoPrint,
  onToggleAutoPrint,
  onAddProductToCart,
  onUpdateCartQuantity,
  onUpdateCartUnitPrice,
  onRemoveCartItem,
  onUpdateDiscount,
  onClearCart,
  onParkCurrentCart,
  onResumeParkedCart,
  onDeleteParkedCart,
  onCompleteSale,
  focusTrigger,
}) => {
  const [skuQuery, setSkuQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(
    null
  );
  const [warningToast, setWarningToast] = useState<string | null>(null);

  // Checkout state
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [amountPaidStr, setAmountPaidStr] = useState<string>('');
  const [cashManuallyEdited, setCashManuallyEdited] = useState<boolean>(false);
  const [splitRemainderToUtang, setSplitRemainderToUtang] =
    useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] =
    useState<boolean>(false);
  const [gcashRefNo, setGcashRefNo] = useState<string>('');
  const [dueDateOrNote, setDueDateOrNote] = useState<string>('');

  const skuInputRef = useRef<HTMLInputElement | null>(null);

  // Hardware Scanner Buffer (<35ms between keystrokes ending in Enter)
  const scannerBufferRef = useRef<{ chars: string; lastTime: number }>({
    chars: '',
    lastTime: 0,
  });

  const totals = useMemo(
    () => calculateCartTotals(cart, discount),
    [cart, discount]
  );

  // Sync default amountPaid when switching payment types or changing cart totals
  useEffect(() => {
    if (cart.length === 0) {
      setAmountPaidStr('');
      setCashManuallyEdited(false);
      setSplitRemainderToUtang(false);
      return;
    }
    if (paymentType === 'GCASH' && !cashManuallyEdited) {
      setAmountPaidStr(totals.grandTotal.toFixed(2));
    } else if (paymentType === 'UTANG' && !cashManuallyEdited) {
      setAmountPaidStr('0');
    } else if (paymentType === 'CASH' && !cashManuallyEdited) {
      setAmountPaidStr(totals.grandTotal.toFixed(2));
    }
  }, [totals.grandTotal, paymentType, cart.length, cashManuallyEdited]);

  // Refocus barcode insert bar when requested (e.g. after closing receipt modal)
  useEffect(() => {
    skuInputRef.current?.focus();
  }, [focusTrigger]);

  const triggerRowHighlight = (productId: string) => {
    setHighlightedProductId(productId);
    setTimeout(() => {
      setHighlightedProductId((prev) => (prev === productId ? null : prev));
    }, 900);
  };

  const triggerStockToast = (msg: string) => {
    setWarningToast(msg);
    setTimeout(() => {
      setWarningToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleSelectOrScanProduct = (product: Product) => {
    const existingInCart = cart.find((c) => c.productId === product.id);
    const nextQty = (existingInCart?.quantity || 0) + 1;
    if (product.stock <= 0 || nextQty > product.stock) {
      triggerStockToast(
        `Out of stock (${product.name}: ${product.stock} left) · selling into negative inventory`
      );
    }
    onAddProductToCart(product);
    triggerRowHighlight(product.id);
    setSkuQuery('');
    setShowDropdown(false);
  };

  // Global Hardware Barcode Scanner & F9 hotkey listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        handleAttemptCompleteSale();
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const isOtherInputFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT') &&
        activeEl !== skuInputRef.current;

      if (isOtherInputFocused) {
        return;
      }

      const now = performance.now();
      const delta = now - scannerBufferRef.current.lastTime;

      if (e.key === 'Enter') {
        if (scannerBufferRef.current.chars.length >= 3 && delta < 80) {
          const scannedCode = scannerBufferRef.current.chars.trim();
          scannerBufferRef.current = { chars: '', lastTime: 0 };
          const exactProduct = products.find(
            (p) => p.barcode.toLowerCase() === scannedCode.toLowerCase()
          );
          if (exactProduct) {
            e.preventDefault();
            handleSelectOrScanProduct(exactProduct);
            return;
          }
        }
        scannerBufferRef.current = { chars: '', lastTime: 0 };
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (delta < 35) {
          scannerBufferRef.current.chars += e.key;
        } else {
          scannerBufferRef.current.chars = e.key;
        }
        scannerBufferRef.current.lastTime = now;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  const matchingProducts = useMemo(() => {
    const q = skuQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.barcode.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [products, skuQuery]);

  const handleSkuFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = skuQuery.trim();
    if (!q) {
      if (cart.length > 0) {
        handleAttemptCompleteSale();
      }
      return;
    }

    // 1. Exact barcode match first
    const exactMatch = products.find(
      (p) => p.barcode.toLowerCase() === q.toLowerCase()
    );
    if (exactMatch) {
      handleSelectOrScanProduct(exactMatch);
      return;
    }

    // 2. Otherwise first autocomplete match
    if (matchingProducts.length > 0) {
      handleSelectOrScanProduct(matchingProducts[0]);
      return;
    }

    triggerStockToast(`No product found matching "${q}".`);
  };

  const amountPaidNum = useMemo(() => {
    const parsed = parseFloat(amountPaidStr);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [amountPaidStr]);

  const settlement = useMemo(
    () =>
      computeCheckoutSettlement({
        grandTotal: totals.grandTotal,
        paymentType,
        amountPaidInput: amountPaidNum,
        splitRemainderToUtang,
        customerName,
      }),
    [
      totals.grandTotal,
      paymentType,
      amountPaidNum,
      splitRemainderToUtang,
      customerName,
    ]
  );

  const selectedCustomerExistingUtang = useMemo(() => {
    const norm = customerName.trim().toLowerCase();
    if (!norm) return 0;
    const found = customerSummaries.find(
      (c) => c.normalizedName === norm || c.customerName.toLowerCase() === norm
    );
    return found ? found.currentBalance : 0;
  }, [customerName, customerSummaries]);

  const filteredCustomerSuggestions = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    return customerSummaries
      .filter((c) => !q || c.customerName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [customerName, customerSummaries]);

  const handleQuickDenomination = (addAmount: number | 'EXACT') => {
    setCashManuallyEdited(true);
    if (addAmount === 'EXACT') {
      setAmountPaidStr(totals.grandTotal.toFixed(2));
      setSplitRemainderToUtang(false);
      return;
    }
    const base = cashManuallyEdited ? amountPaidNum : 0;
    const next = roundCurrency(base + addAmount);
    setAmountPaidStr(String(next));
  };

  const handlePaymentTabChange = (nextType: PaymentType) => {
    setPaymentType(nextType);
    setCashManuallyEdited(false);
    setSplitRemainderToUtang(false);
    if (nextType === 'UTANG') {
      setAmountPaidStr('0');
    } else {
      setAmountPaidStr(totals.grandTotal > 0 ? totals.grandTotal.toFixed(2) : '');
    }
  };

  const handleAttemptCompleteSale = () => {
    if (!settlement.canCompleteSale) return;
    onCompleteSale({
      paymentType,
      amountTendered: amountPaidNum,
      splitRemainderToUtang,
      customerName: customerName.trim(),
      gcashRefNo: gcashRefNo.trim(),
      dueDateOrNote: dueDateOrNote.trim(),
    });
    // Reset checkout form fields for next customer
    setAmountPaidStr('');
    setCashManuallyEdited(false);
    setSplitRemainderToUtang(false);
    setCustomerName('');
    setGcashRefNo('');
    setDueDateOrNote('');
    setPaymentType('CASH');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT PANEL (7 cols on lg): SKU / Barcode Insert Bar + Customer Cart Table */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
        {/* A. Top Left: SKU / Barcode Insert Bar (Outer rounded-2xl, padding 24px -> inner rounded-xl) */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <label
              htmlFor="sku-barcode-insert"
              className="flex items-center gap-2 text-sm leading-5 font-semibold text-[#181818]"
            >
              <Barcode className="w-4 h-4 text-neutral-700" />
              <span>SKU / Barcode Insert</span>
            </label>
            <span className="text-xs leading-4 font-medium text-neutral-500">
              USB &amp; Bluetooth Scanner Ready · Type SKU (1001 to 1006) or Product Name
            </span>
          </div>

          <form onSubmit={handleSkuFormSubmit} className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={skuInputRef}
                  id="sku-barcode-insert"
                  type="text"
                  autoComplete="off"
                  value={skuQuery}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setSkuQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  placeholder="Scan barcode or type SKU / product name (e.g. 1001, Wrapper, Ribbon)..."
                  className="w-full pl-4 pr-10 py-3 text-base leading-6 font-medium bg-[#F6F6F4] border border-neutral-300 rounded-xl text-[#181818] placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
                {skuQuery && (
                  <button
                    type="button"
                    aria-label="Clear search query"
                    onClick={() => {
                      setSkuQuery('');
                      skuInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[#181818]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-4 py-3 bg-[#181818] hover:bg-[#272727] text-white text-sm leading-5 font-semibold rounded-xl whitespace-nowrap shrink-0"
              >
                Add Item (Enter)
              </button>
            </div>

            {/* Live Autocomplete Dropdown for Manual Lookup */}
            {showDropdown && skuQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 z-30 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                {matchingProducts.length === 0 ? (
                  <div className="px-4 py-3 text-sm leading-5 font-normal text-neutral-500">
                    No matching products found for "{skuQuery}".
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 max-h-64 overflow-y-auto">
                    {matchingProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectOrScanProduct(product)}
                        className="w-full px-4 py-3 text-left hover:bg-[#F6F6F4] flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="text-base leading-6 font-semibold text-[#181818] truncate">
                            {product.name}
                          </div>
                          <div className="text-xs leading-4 font-medium text-neutral-500 flex items-center gap-2">
                            <span className="font-mono font-medium text-neutral-600">
                              #{product.barcode}
                            </span>
                            <span>·</span>
                            <span>{product.category}</span>
                            <span>·</span>
                            <span
                              className={
                                product.stock <= 5
                                  ? 'text-red-600 font-semibold'
                                  : 'text-neutral-600'
                              }
                            >
                              Stock: {product.stock}
                            </span>
                          </div>
                        </div>
                        <div className="font-mono text-base leading-6 font-semibold tabular-nums text-[#181818] shrink-0">
                          {formatPHP(product.sellingPrice)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Quick Sample Barcode Tap Strip: Product Name primary, Price & SKU clearly legible */}
          <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center gap-2">
            <span className="text-xs leading-4 font-medium text-neutral-500 whitespace-nowrap mr-1">
              Quick Tap Items:
            </span>
            {products.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectOrScanProduct(p)}
                className="px-3 py-2 text-sm leading-5 bg-[#F6F6F4] hover:bg-neutral-200/80 text-[#181818] border border-neutral-200/90 rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <span className="font-semibold text-[#181818]">
                  {p.name.split(' (')[0]}
                </span>
                <span className="font-mono text-xs leading-4 font-semibold text-emerald-800">
                  {formatPHP(p.sellingPrice)}
                </span>
                <span className="font-mono text-xs leading-4 font-normal text-neutral-500">
                  #{p.barcode}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Non-blocking Stock Warning Toast */}
        {warningToast && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl text-sm leading-5 font-semibold"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{warningToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setWarningToast(null)}
              className="text-xs leading-4 text-amber-800 hover:text-amber-950 font-semibold py-1 px-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Parked / Held Carts Bar (if any) */}
        {parkedCarts.length > 0 && (
          <div className="bg-white border border-neutral-200/90 rounded-2xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm leading-5 font-semibold text-[#181818]">
              Parked / Held Carts ({parkedCarts.length}):
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {parkedCarts.map((parked) => (
                <div
                  key={parked.id}
                  className="inline-flex items-center gap-2 bg-[#F6F6F4] border border-neutral-200 rounded-lg px-3 py-2 text-xs leading-4"
                >
                  <button
                    type="button"
                    onClick={() => onResumeParkedCart(parked.id)}
                    className="inline-flex items-center gap-2 font-semibold text-[#181818] hover:text-emerald-700"
                  >
                    <PlayCircle className="w-4 h-4 text-emerald-600" />
                    <span>
                      Resume {parked.label} ({parked.items.length} items)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteParkedCart(parked.id)}
                    aria-label={`Delete parked cart ${parked.label}`}
                    className="text-neutral-400 hover:text-red-600 ml-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* B. Main Left Panel: Customer Cart List */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 sm:px-6 py-4 border-b border-neutral-200/90 flex flex-wrap items-center justify-between gap-3 bg-[#F6F6F4]/60">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-neutral-700" />
              <h2 className="text-base leading-6 font-semibold text-[#181818]">
                Customer Cart List
              </h2>
              <span className="text-sm leading-5 font-medium text-neutral-500">
                · {totals.totalItems} {totals.totalItems === 1 ? 'pc' : 'pcs'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => onParkCurrentCart(customerName || undefined)}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs leading-4 font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
              >
                <PauseCircle className="w-4 h-4" />
                <span>Hold / Park Cart</span>
              </button>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={onClearCart}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs leading-4 font-semibold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Cart</span>
              </button>
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <Barcode className="w-8 h-8 text-neutral-400 mx-auto mb-3" />
              <p className="text-base leading-6 font-semibold text-[#181818]">
                Cart is empty · ready for next customer
              </p>
              <p className="text-sm leading-5 font-normal text-neutral-500 mt-2 max-w-md mx-auto">
                Scan any item with your USB or Bluetooth barcode scanner, type a barcode (1001 to 1006) in the insert bar above, or tap a quick item button.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs leading-4 font-medium text-neutral-500 bg-[#F6F6F4]/70">
                    <th className="py-3 px-4 sm:px-6">Product Name</th>
                    <th className="py-3 px-3">Barcode/SKU</th>
                    <th className="py-3 px-3 text-right">Unit Price (₱)</th>
                    <th className="py-3 px-3 text-center">Qty</th>
                    <th className="py-3 px-4 sm:px-6 text-right">Subtotal (₱)</th>
                    <th className="py-3 px-3 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80">
                  {cart.map((item) => {
                    const lineSubtotal = roundCurrency(
                      item.quantity * item.unitPrice
                    );
                    const isHighlighted = highlightedProductId === item.productId;
                    return (
                      <tr
                        key={item.productId}
                        className={`transition-colors ${
                          isHighlighted
                            ? 'bg-emerald-50/90'
                            : 'hover:bg-[#F6F6F4]/60'
                        }`}
                      >
                        <td className="py-4 px-4 sm:px-6">
                          <div className="text-base leading-6 font-semibold text-[#181818]">
                            {item.name}
                          </div>
                          <div className="text-xs leading-4 font-medium text-neutral-500 mt-1">
                            {item.category} · Stock: {item.currentStock}
                          </div>
                        </td>
                        <td className="py-4 px-3 font-mono text-xs leading-4 font-medium text-neutral-600">
                          {item.barcode}
                        </td>
                        <td className="py-4 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            aria-label={`Unit price for ${item.name}`}
                            value={item.unitPrice}
                            onChange={(e) =>
                              onUpdateCartUnitPrice(
                                item.productId,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-24 px-3 py-2 text-right font-mono text-base leading-6 font-semibold tabular-nums text-[#181818] border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#181818]"
                          />
                        </td>
                        <td className="py-4 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${item.name}`}
                              onClick={() =>
                                onUpdateCartQuantity(
                                  item.productId,
                                  item.quantity - 1
                                )
                              }
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              aria-label={`Quantity of ${item.name}`}
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (Number.isFinite(val) && val >= 1) {
                                  onUpdateCartQuantity(item.productId, val);
                                }
                              }}
                              className="w-14 py-1.5 text-center font-mono text-base leading-6 font-semibold tabular-nums text-[#181818] border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#181818]"
                            />
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${item.name}`}
                              onClick={() =>
                                onUpdateCartQuantity(
                                  item.productId,
                                  item.quantity + 1
                                )
                              }
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-right font-mono text-base leading-6 font-semibold tabular-nums text-[#181818]">
                          {formatPHP(lineSubtotal)}
                        </td>
                        <td className="py-4 px-3 text-center">
                          <button
                            type="button"
                            aria-label={`Remove ${item.name} from cart`}
                            onClick={() => onRemoveCartItem(item.productId)}
                            className="p-2 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bottom Cart Footer: Optional Discount (₱) for bulk/haggled gift items */}
          <div className="px-4 sm:px-6 py-4 bg-[#F6F6F4]/70 border-t border-neutral-200/90 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label
                htmlFor="cart-discount-input"
                className="text-sm leading-5 font-medium text-neutral-700"
              >
                Bulk / Haggled Discount (₱):
              </label>
              <input
                id="cart-discount-input"
                type="number"
                min="0"
                step="1"
                value={discount === 0 ? '' : discount}
                placeholder="0.00"
                onChange={(e) =>
                  onUpdateDiscount(Math.max(0, parseFloat(e.target.value) || 0))
                }
                className="w-28 px-3 py-2 text-right font-mono text-sm leading-5 font-semibold tabular-nums bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#181818]"
              />
            </div>

            <div className="flex items-center gap-4 text-sm leading-5 font-medium text-neutral-600">
              <span>
                Subtotal:{' '}
                <strong className="font-mono text-base leading-6 font-semibold tabular-nums text-[#181818]">
                  {formatPHP(totals.subtotal)}
                </strong>
              </span>
              {totals.discountApplied > 0 && (
                <span>
                  Discount:{' '}
                  <strong className="font-mono text-base leading-6 font-semibold tabular-nums text-emerald-700">
                    -{formatPHP(totals.discountApplied)}
                  </strong>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT VERTICAL PANEL (5 cols on lg): Payment Type & Auto-Compute Checkout */}
      <div className="lg:col-span-5 xl:col-span-4 bg-white border border-neutral-200/90 rounded-2xl flex flex-col overflow-hidden">
        {/* Top Section: Type of Payment Selector */}
        <div className="p-4 sm:p-6 border-b border-neutral-200/90">
          <div className="text-sm leading-5 font-semibold text-[#181818] mb-3">
            Type of Payment
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'GCASH', 'UTANG'] as PaymentType[]).map((type) => {
              const active = paymentType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handlePaymentTabChange(type)}
                  className={`py-2 px-3 rounded-xl text-sm leading-5 font-semibold border whitespace-nowrap ${
                    active
                      ? type === 'UTANG'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-[#181818] text-white border-[#181818]'
                      : 'bg-[#F6F6F4] text-neutral-700 border-neutral-300 hover:bg-neutral-200/70'
                  }`}
                >
                  {type === 'CASH'
                    ? 'Cash'
                    : type === 'GCASH'
                    ? 'GCash'
                    : 'Utang (Credit)'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Payment Inputs */}
        <div className="p-4 sm:p-6 space-y-4">
          {paymentType === 'CASH' && (
            <>
              <div>
                <label
                  htmlFor="cash-tendered-input"
                  className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
                >
                  Amount Tendered / Paid (₱)
                </label>
                <input
                  id="cash-tendered-input"
                  type="number"
                  min="0"
                  step="1"
                  value={amountPaidStr}
                  onChange={(e) => {
                    setCashManuallyEdited(true);
                    setAmountPaidStr(e.target.value);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-3 font-mono text-2xl leading-8 font-semibold tabular-nums text-right bg-[#F6F6F4] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              {/* Quick-tap PHP denomination buttons */}
              <div>
                <div className="text-xs leading-4 font-medium text-neutral-500 mb-2">
                  Quick Denomination Tap:
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickDenomination('EXACT')}
                    className="py-2 px-3 text-xs leading-4 font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg"
                  >
                    Exact
                  </button>
                  {[20, 50, 100, 200, 500, 1000].map((denom) => (
                    <button
                      key={denom}
                      type="button"
                      onClick={() => handleQuickDenomination(denom)}
                      className="py-2 px-3 font-mono text-xs leading-4 font-semibold tabular-nums bg-[#F6F6F4] hover:bg-neutral-200/80 text-[#181818] border border-neutral-200 rounded-lg"
                    >
                      +₱{denom}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCashManuallyEdited(true);
                      setAmountPaidStr('0');
                    }}
                    className="py-2 px-3 text-xs leading-4 font-medium bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200 rounded-lg"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Short-Payment / Split to Utang Handling */}
              {totals.grandTotal > 0 && settlement.isShortPayment && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={splitRemainderToUtang}
                      onChange={(e) =>
                        setSplitRemainderToUtang(e.target.checked)
                      }
                      className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-700 focus:ring-amber-600"
                    />
                    <span className="text-sm leading-5 font-semibold text-amber-950">
                      Put remaining balance (
                      {formatPHP(
                        Math.max(0, totals.grandTotal - amountPaidNum)
                      )}
                      ) on Utang
                    </span>
                  </label>
                </div>
              )}
            </>
          )}

          {paymentType === 'GCASH' && (
            <>
              <div>
                <label
                  htmlFor="gcash-paid-input"
                  className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
                >
                  GCash Amount Paid (₱)
                </label>
                <input
                  id="gcash-paid-input"
                  type="number"
                  min="0"
                  step="1"
                  value={amountPaidStr}
                  onChange={(e) => {
                    setCashManuallyEdited(true);
                    setAmountPaidStr(e.target.value);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-3 font-mono text-2xl leading-8 font-semibold tabular-nums text-right bg-[#F6F6F4] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div>
                <label
                  htmlFor="gcash-ref-input"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-2"
                >
                  GCash Reference No. (Optional)
                </label>
                <input
                  id="gcash-ref-input"
                  type="text"
                  value={gcashRefNo}
                  onChange={(e) => setGcashRefNo(e.target.value)}
                  placeholder="e.g. 9012 345 678901"
                  className="w-full px-3 py-2 font-mono text-sm leading-5 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              {totals.grandTotal > 0 && settlement.isShortPayment && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={splitRemainderToUtang}
                      onChange={(e) =>
                        setSplitRemainderToUtang(e.target.checked)
                      }
                      className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-700"
                    />
                    <span className="text-sm leading-5 font-semibold text-amber-950">
                      Put remaining balance (
                      {formatPHP(
                        Math.max(0, totals.grandTotal - amountPaidNum)
                      )}
                      ) on Utang
                    </span>
                  </label>
                </div>
              )}
            </>
          )}

          {paymentType === 'UTANG' && (
            <div>
              <label
                htmlFor="utang-downpayment-input"
                className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
              >
                Downpayment / Partial Paid (₱) (Optional)
              </label>
              <input
                id="utang-downpayment-input"
                type="number"
                min="0"
                step="1"
                value={amountPaidStr}
                onChange={(e) => {
                  setCashManuallyEdited(true);
                  setAmountPaidStr(e.target.value);
                }}
                placeholder="0.00"
                className="w-full px-4 py-3 font-mono text-2xl leading-8 font-semibold tabular-nums text-right bg-[#F6F6F4] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
              />
            </div>
          )}

          {/* Customer Name & Due Date fields when Utang or Split-to-Utang is active */}
          {(paymentType === 'UTANG' || splitRemainderToUtang) && (
            <div className="space-y-4 pt-3 border-t border-neutral-200">
              <div className="relative">
                <label
                  htmlFor="utang-customer-name"
                  className="block text-sm leading-5 font-semibold text-[#181818] mb-2"
                >
                  Customer Name (Required for Utang) *
                </label>
                <input
                  id="utang-customer-name"
                  type="text"
                  required
                  autoComplete="off"
                  value={customerName}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCustomerSuggestions(false), 180)
                  }
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setShowCustomerSuggestions(true);
                  }}
                  placeholder="Type or select existing customer name..."
                  className="w-full px-3 py-2 text-base leading-6 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />

                {selectedCustomerExistingUtang > 0 && (
                  <div className="mt-2 text-xs leading-4 font-semibold text-amber-800">
                    Existing Utang Balance:{' '}
                    <span className="font-mono">
                      {formatPHP(selectedCustomerExistingUtang)}
                    </span>{' '}
                    · New Cumulative:{' '}
                    <span className="font-mono">
                      {formatPHP(
                        selectedCustomerExistingUtang +
                          settlement.utangBalanceAdded
                      )}
                    </span>
                  </div>
                )}

                {showCustomerSuggestions &&
                  filteredCustomerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-neutral-200 rounded-xl shadow-md max-h-40 overflow-y-auto divide-y divide-neutral-100">
                      {filteredCustomerSuggestions.map((c) => (
                        <button
                          key={c.normalizedName}
                          type="button"
                          onMouseDown={() => {
                            setCustomerName(c.customerName);
                            setShowCustomerSuggestions(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm leading-5 hover:bg-[#F6F6F4] flex items-center justify-between"
                        >
                          <span className="font-semibold text-[#181818]">
                            {c.customerName}
                          </span>
                          <span className="font-mono text-amber-700 font-semibold tabular-nums">
                            Owes {formatPHP(c.currentBalance)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
              </div>

              <div>
                <label
                  htmlFor="utang-due-note"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-2"
                >
                  Due Date / Note (Optional)
                </label>
                <input
                  id="utang-due-note"
                  type="text"
                  value={dueDateOrNote}
                  onChange={(e) => setDueDateOrNote(e.target.value)}
                  placeholder="e.g. Pay on Friday payday / Brgy Hall"
                  className="w-full px-3 py-2 text-sm leading-5 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section: High-Visibility Summary & Auto-Compute Change Box */}
        <div className="mt-auto bg-[#181818] text-white p-6 space-y-4">
          <div className="space-y-2 text-sm leading-5 text-neutral-300">
            <div className="flex justify-between">
              <span className="font-medium">Subtotal ({totals.totalItems} items)</span>
              <span className="font-mono font-medium tabular-nums">
                {formatPHP(totals.subtotal)}
              </span>
            </div>
            {totals.discountApplied > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span className="font-medium">Discount (₱)</span>
                <span className="font-mono font-semibold tabular-nums">
                  -{formatPHP(totals.discountApplied)}
                </span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-neutral-800 flex items-baseline justify-between">
            <span className="text-sm leading-5 font-semibold text-neutral-300">
              Grand Total (₱)
            </span>
            <span
              data-testid="checkout-grand-total"
              className="font-mono text-3xl leading-9 font-semibold tabular-nums text-white"
            >
              {formatPHP(totals.grandTotal)}
            </span>
          </div>

          <div className="pt-3 border-t border-neutral-800 space-y-2 text-sm leading-5">
            <div className="flex justify-between text-neutral-300">
              <span className="font-medium">Amount Paid (₱)</span>
              <span className="font-mono text-base leading-6 font-semibold tabular-nums text-white">
                {formatPHP(settlement.amountTendered)}
              </span>
            </div>

            {settlement.utangBalanceAdded > 0 ? (
              <div className="flex justify-between items-baseline text-amber-400 pt-1">
                <span className="font-semibold">Balance Added to Utang (₱)</span>
                <span
                  data-testid="checkout-utang-balance"
                  className="font-mono text-xl leading-7 font-semibold tabular-nums"
                >
                  {formatPHP(settlement.utangBalanceAdded)}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-baseline text-emerald-400 pt-1">
                <span className="font-semibold">Change (₱)</span>
                <span
                  data-testid="checkout-change-due"
                  className="font-mono text-xl leading-7 font-semibold tabular-nums"
                >
                  {formatPHP(settlement.changeGiven)}
                </span>
              </div>
            )}
          </div>

          {settlement.validationMessage && cart.length > 0 && (
            <div className="px-4 py-3 bg-amber-500/15 border border-amber-400/35 rounded-xl text-xs leading-4 text-amber-200 font-medium">
              {settlement.validationMessage}
            </div>
          )}

          <div className="pt-1 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs leading-4 font-medium text-neutral-300">
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => onToggleAutoPrint(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-600 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Auto-Print Receipt</span>
            </label>
          </div>

          <button
            type="button"
            disabled={!settlement.canCompleteSale}
            onClick={handleAttemptCompleteSale}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-[#272727] disabled:text-neutral-500 text-[#181818] text-base leading-6 font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Complete Sale &amp; Print Receipt (F9 / Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
