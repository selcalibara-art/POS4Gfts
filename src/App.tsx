/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings,
  ShoppingCart,
  Package,
  BookOpen,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import {
  ActiveReceiptModal,
  CartItem,
  CashDrawerAdjustment,
  DailyShiftRecord,
  PaperSize,
  ParkedCart,
  PaymentType,
  Product,
  SaleTransaction,
  StoreSettings,
  UtangPaymentTransaction,
  ZReadingReportData,
} from './types/pos';
import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_PRODUCTS,
  aggregateCustomerUtang,
  calculateCartTotals,
  computeCheckoutSettlement,
  generateReceiptNumber,
  generateSevenDayStoreSimulation,
  normalizeCustomerName,
  roundCurrency,
} from './utils/posLogic';
import { CartPage } from './components/CartPage';
import { ProductsPage } from './components/ProductsPage';
import { UtangLedgerPage } from './components/UtangLedgerPage';
import { TransactionsReportPage } from './components/TransactionsReportPage';
import { ReceiptModal } from './components/ReceiptModal';
import { SettingsBackupModal } from './components/SettingsBackupModal';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from './firebase';
import {
  SHARED_STORE_OWNER_ID,
  CLOUD_STORAGE_KEYS,
  FullStoreState,
  createCanonicalStateSignature,
  isUntouchedDefaultSimulation,
  syncFullStoreStateToCloud,
  fetchStoreStateFromCloud,
  subscribeToCloudPulse,
} from './services/cloudSync';

type NavTab = 'CART' | 'PRODUCTS' | 'UTANG' | 'REPORTS';

const STORAGE_KEYS = {
  PRODUCTS: 'fgs_pos_products_v1',
  SALES: 'fgs_pos_sales_v1',
  UTANG_PAYMENTS: 'fgs_pos_utang_payments_v1',
  PARKED_CARTS: 'fgs_pos_parked_carts_v1',
  SETTINGS: 'fgs_pos_settings_v1',
  SHIFTS: 'fgs_pos_shifts_v1',
  ADJUSTMENTS: 'fgs_pos_adjustments_v1',
  SIM_SEEDED: 'fgs_pos_sim7d_seeded_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function commitL1CacheSynchronously(state: FullStoreState): void {
  saveToStorage(STORAGE_KEYS.SETTINGS, state.settings);
  saveToStorage(STORAGE_KEYS.PRODUCTS, state.products);
  saveToStorage(STORAGE_KEYS.SALES, state.sales);
  saveToStorage(STORAGE_KEYS.UTANG_PAYMENTS, state.utangPayments);
  saveToStorage(STORAGE_KEYS.SHIFTS, state.shifts);
  saveToStorage(STORAGE_KEYS.ADJUSTMENTS, state.adjustments);
  saveToStorage(STORAGE_KEYS.PARKED_CARTS, state.parkedCarts);
}

function formatCurrentTimeShort(): string {
  return new Date().toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('CART');

  // Pre-seed the 7-day store simulation locally only as initial fallback before cloud sync
  const initialSim = useMemo(() => {
    try {
      const alreadySeeded = localStorage.getItem(STORAGE_KEYS.SIM_SEEDED);
      const existingSales = localStorage.getItem(STORAGE_KEYS.SALES);
      if (!alreadySeeded && (!existingSales || existingSales === '[]')) {
        const sim = generateSevenDayStoreSimulation(new Date());
        localStorage.setItem(STORAGE_KEYS.SIM_SEEDED, 'true');
        return sim;
      }
    } catch {
      // ignore storage errors
    }
    return null;
  }, []);

  // 1. L1 Local Cache State (Optimistic 0ms Latency)
  const [products, setProducts] = useState<Product[]>(() =>
    loadFromStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS)
  );
  const [sales, setSales] = useState<SaleTransaction[]>(() =>
    initialSim
      ? initialSim.sales
      : loadFromStorage<SaleTransaction[]>(STORAGE_KEYS.SALES, [])
  );
  const [utangPayments, setUtangPayments] = useState<
    UtangPaymentTransaction[]
  >(() =>
    initialSim
      ? initialSim.utangPayments
      : loadFromStorage<UtangPaymentTransaction[]>(
          STORAGE_KEYS.UTANG_PAYMENTS,
          []
        )
  );
  const [shifts, setShifts] = useState<DailyShiftRecord[]>(() =>
    initialSim
      ? initialSim.shifts
      : loadFromStorage<DailyShiftRecord[]>(STORAGE_KEYS.SHIFTS, [])
  );
  const [adjustments, setAdjustments] = useState<CashDrawerAdjustment[]>(() =>
    initialSim
      ? initialSim.adjustments
      : loadFromStorage<CashDrawerAdjustment[]>(STORAGE_KEYS.ADJUSTMENTS, [])
  );
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>(() =>
    loadFromStorage<ParkedCart[]>(STORAGE_KEYS.PARKED_CARTS, [])
  );
  const [settings, setSettings] = useState<StoreSettings>(() =>
    loadFromStorage<StoreSettings>(
      STORAGE_KEYS.SETTINGS,
      DEFAULT_STORE_SETTINGS
    )
  );

  // Cloud Auto-Save Status
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<
    'LOCAL_ONLY' | 'SYNCING' | 'CLOUD_SAVED' | 'ERROR'
  >('SYNCING');
  const [lastSavedTime, setLastSavedTime] = useState<string>(() =>
    formatCurrentTimeShort()
  );

  // Keep latest L1 state in a ref for atomic Write-Through & Reconciliation
  const latestStoreRef = useRef<FullStoreState>({
    settings,
    products,
    sales,
    utangPayments,
    shifts,
    adjustments,
    parkedCarts,
  });
  useEffect(() => {
    latestStoreRef.current = {
      settings,
      products,
      sales,
      utangPayments,
      shifts,
      adjustments,
      parkedCarts,
    };
  }, [
    settings,
    products,
    sales,
    utangPayments,
    shifts,
    adjustments,
    parkedCarts,
  ]);

  // Track whether a local mutation is currently pushing to prevent background poll from clobbering in-flight write
  const isPushingRef = useRef<boolean>(false);

  // Active Checkout Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [focusBarcodeTrigger, setFocusBarcodeTrigger] = useState<number>(0);

  // Modals & Floating Toast
  const [activeReceipt, setActiveReceipt] =
    useState<ActiveReceiptModal | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] =
    useState<boolean>(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const showQuickNotice = useCallback((msg: string) => {
    setBannerNotice(msg);
    setTimeout(() => {
      setBannerNotice((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Track optional Firebase Auth user
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCloudUser(user);
    });
    return () => unsubAuth();
  }, []);

  /**
   * 2. Write Pipeline: Optimistic UI (0ms L1 Commit) + Immediate Cloud Push (saveAllToCloud)
   */
  const saveAllToCloud = useCallback(
    async (nextPartial: Partial<FullStoreState>) => {
      const nextState: FullStoreState = {
        ...latestStoreRef.current,
        ...nextPartial,
      };
      latestStoreRef.current = nextState;

      // Synchronous L1 Commit (0ms latency)
      if (nextPartial.settings !== undefined) setSettings(nextPartial.settings);
      if (nextPartial.products !== undefined) setProducts(nextPartial.products);
      if (nextPartial.sales !== undefined) setSales(nextPartial.sales);
      if (nextPartial.utangPayments !== undefined)
        setUtangPayments(nextPartial.utangPayments);
      if (nextPartial.shifts !== undefined) setShifts(nextPartial.shifts);
      if (nextPartial.adjustments !== undefined)
        setAdjustments(nextPartial.adjustments);
      if (nextPartial.parkedCarts !== undefined)
        setParkedCarts(nextPartial.parkedCarts);

      commitL1CacheSynchronously(nextState);
      try {
        localStorage.setItem(CLOUD_STORAGE_KEYS.LOCAL_CUSTOMIZED, 'true');
      } catch {
        // ignore
      }

      // Immediate L2 Cloud Push
      isPushingRef.current = true;
      setCloudSyncState('SYNCING');
      try {
        await syncFullStoreStateToCloud(SHARED_STORE_OWNER_ID, nextState, true);
        setCloudSyncState('CLOUD_SAVED');
        setLastSavedTime(formatCurrentTimeShort());
      } catch {
        setCloudSyncState('ERROR');
      } finally {
        isPushingRef.current = false;
      }
    },
    []
  );

  /**
   * 3. Read & Reconciliation Pipeline (syncWithCloud)
   * Implements:
   * - Empty-Overwrite Guard (pushes local state UP if remote cloud is empty)
   * - Unpushed Local Customization Guard (if local PC has customized data while remote only has default sample simulation, pushes local PC state UP)
   * - Deep-Equality Diffing (JSON.stringify canonical comparison)
   */
  const syncWithCloud = useCallback(
    async (silent = true) => {
      if (isPushingRef.current) return;
      if (!silent) {
        setCloudSyncState('SYNCING');
      }

      try {
        const remote = await fetchStoreStateFromCloud(SHARED_STORE_OWNER_ID);
        if (isPushingRef.current) return;

        const currentLocal = latestStoreRef.current;

        // Guard 1: Empty-Overwrite Guard
        if (
          remote.isEmpty ||
          (remote.state.products.length === 0 &&
            remote.state.sales.length === 0 &&
            (currentLocal.products.length > 0 || currentLocal.sales.length > 0))
        ) {
          await syncFullStoreStateToCloud(
            SHARED_STORE_OWNER_ID,
            currentLocal,
            true
          );
          setCloudSyncState('CLOUD_SAVED');
          setLastSavedTime(formatCurrentTimeShort());
          return;
        }

        // Guard 2: Unpushed Local Customization Guard
        // If this PC already has user-modified products/sales in localStorage while the cloud still holds the untouched default simulation, push this PC's state UP!
        const localIsCustomized = !isUntouchedDefaultSimulation(currentLocal);
        const remoteIsUntouchedDefault = isUntouchedDefaultSimulation(
          remote.state
        );
        if (localIsCustomized && remoteIsUntouchedDefault) {
          await syncFullStoreStateToCloud(
            SHARED_STORE_OWNER_ID,
            currentLocal,
            true
          );
          setCloudSyncState('CLOUD_SAVED');
          setLastSavedTime(formatCurrentTimeShort());
          return;
        }

        // Deep-Equality Diffing (JSON.stringify canonical comparison)
        const localSig = createCanonicalStateSignature(currentLocal);
        const remoteSig = createCanonicalStateSignature(remote.state);

        if (localSig !== remoteSig) {
          // Preserve local product notes if barcode matches
          const localNoteById = new Map(
            currentLocal.products.map((p) => [p.id, p.note || ''])
          );
          const mergedProducts = remote.state.products.map((rp) => ({
            ...rp,
            note: rp.note || localNoteById.get(rp.id) || '',
          }));

          const normalizedRemote: FullStoreState = {
            ...remote.state,
            products: mergedProducts,
          };

          latestStoreRef.current = normalizedRemote;
          setSettings(normalizedRemote.settings);
          setProducts(normalizedRemote.products);
          setSales(normalizedRemote.sales);
          setUtangPayments(normalizedRemote.utangPayments);
          setShifts(normalizedRemote.shifts);
          setAdjustments(normalizedRemote.adjustments);
          setParkedCarts(normalizedRemote.parkedCarts);
          commitL1CacheSynchronously(normalizedRemote);

          try {
            localStorage.setItem(
              CLOUD_STORAGE_KEYS.LAST_SYNC,
              new Date().toISOString()
            );
          } catch {
            // ignore
          }

          showQuickNotice('Cloud updated automatically');
        }

        setCloudSyncState('CLOUD_SAVED');
        setLastSavedTime(formatCurrentTimeShort());
      } catch {
        setCloudSyncState('ERROR');
      }
    },
    [showQuickNotice]
  );

  // Trigger 1 (Cold Boot Mount), Trigger 2 (20s Periodic Polling + Real-Time Pulse),
  // Trigger 3 (Window Focus & Visibility Change), Trigger 4 (Cross-Tab Storage Listener)
  useEffect(() => {
    // 1. Cold Boot Mount
    void syncWithCloud(true);

    // 2a. Real-Time Cloud Pulse Listener (<1s cross-device notification)
    const unsubPulse = subscribeToCloudPulse(SHARED_STORE_OWNER_ID, () => {
      void syncWithCloud(true);
    });

    // 2b. Periodic Polling Loop (every 20 seconds while tab is open)
    const pollInterval = window.setInterval(() => {
      void syncWithCloud(true);
    }, 20000);

    // 3. Window Focus & Visibility Change Listener
    const handleFocus = () => {
      void syncWithCloud(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncWithCloud(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Cross-Tab Storage Listener (instantaneous sync across tabs on the same PC/device)
    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === STORAGE_KEYS.PRODUCTS && e.newValue) {
        try {
          setProducts(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.SALES && e.newValue) {
        try {
          setSales(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.UTANG_PAYMENTS && e.newValue) {
        try {
          setUtangPayments(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.SHIFTS && e.newValue) {
        try {
          setShifts(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.ADJUSTMENTS && e.newValue) {
        try {
          setAdjustments(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.PARKED_CARTS && e.newValue) {
        try {
          setParkedCarts(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.SETTINGS && e.newValue) {
        try {
          setSettings(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      unsubPulse();
      window.clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [syncWithCloud]);

  // Keep L1 localStorage synced on any state update
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PRODUCTS, products);
  }, [products]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SALES, sales);
  }, [sales]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.UTANG_PAYMENTS, utangPayments);
  }, [utangPayments]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SHIFTS, shifts);
  }, [shifts]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ADJUSTMENTS, adjustments);
  }, [adjustments]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PARKED_CARTS, parkedCarts);
  }, [parkedCarts]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SETTINGS, settings);
  }, [settings]);

  const handleGoogleSignIn = async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        showQuickNotice(`Connected Google account ${cred.user.email}.`);
      }
    } catch {
      // ignore
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  };

  const handleManualCloudSync = async () => {
    await saveAllToCloud({});
    showQuickNotice('All POS records pushed to Cloud Store!');
  };

  const handleManualCloudPull = async () => {
    await syncWithCloud(false);
    showQuickNotice('Pulled latest records from Cloud Store!');
  };

  const customerSummaries = useMemo(
    () => aggregateCustomerUtang(sales, utangPayments),
    [sales, utangPayments]
  );

  const unpaidUtangCount = useMemo(
    () => customerSummaries.filter((c) => c.currentBalance > 0.009).length,
    [customerSummaries]
  );

  const lowStockCount = useMemo(
    () => products.filter((p) => p.stock <= 5).length,
    [products]
  );

  // Cart Handlers
  const handleAddProductToCart = (product: Product) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((i) => i.productId === product.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
          currentStock: product.stock,
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          barcode: product.barcode,
          name: product.name,
          category: product.category,
          unitPrice: product.sellingPrice,
          originalSellingPrice: product.sellingPrice,
          capitalPrice: product.capitalPrice,
          quantity: 1,
          currentStock: product.stock,
        },
      ];
    });
  };

  const handleUpdateCartQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: newQty } : item
      )
    );
  };

  const handleUpdateCartUnitPrice = (productId: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, unitPrice: Math.max(0, newPrice) }
          : item
      )
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
    setDiscount(0);
    setFocusBarcodeTrigger((n) => n + 1);
  };

  const handleParkCurrentCart = (customerLabel?: string) => {
    if (cart.length === 0) return;
    const newParked: ParkedCart = {
      id: `park-${Date.now()}`,
      label:
        customerLabel ||
        `Customer #${parkedCarts.length + 1} (${new Date().toLocaleTimeString(
          'en-PH',
          { hour: '2-digit', minute: '2-digit' }
        )})`,
      createdAt: new Date().toISOString(),
      items: cart,
      discount,
      customerName: customerLabel,
    };
    const nextParked = [...parkedCarts, newParked];
    void saveAllToCloud({ parkedCarts: nextParked });
    setCart([]);
    setDiscount(0);
    showQuickNotice(`Parked cart "${newParked.label}". Ready for next customer.`);
    setFocusBarcodeTrigger((n) => n + 1);
  };

  const handleResumeParkedCart = (parkedId: string) => {
    const target = parkedCarts.find((p) => p.id === parkedId);
    if (!target) return;
    setCart(target.items);
    setDiscount(target.discount);
    const nextParked = parkedCarts.filter((p) => p.id !== parkedId);
    void saveAllToCloud({ parkedCarts: nextParked });
    showQuickNotice(`Resumed parked cart "${target.label}".`);
  };

  const handleDeleteParkedCart = (parkedId: string) => {
    const nextParked = parkedCarts.filter((p) => p.id !== parkedId);
    void saveAllToCloud({ parkedCarts: nextParked });
  };

  // Complete Sale & Deduct Stock (Write-Through: 0ms L1 + Immediate L2 Push)
  const handleCompleteSale = (payload: {
    paymentType: PaymentType;
    amountTendered: number;
    splitRemainderToUtang: boolean;
    customerName: string;
    gcashRefNo: string;
    dueDateOrNote: string;
  }) => {
    if (cart.length === 0) return;
    const totals = calculateCartTotals(cart, discount);
    const settlement = computeCheckoutSettlement({
      grandTotal: totals.grandTotal,
      paymentType: payload.paymentType,
      amountPaidInput: payload.amountTendered,
      splitRemainderToUtang: payload.splitRemainderToUtang,
      customerName: payload.customerName,
    });

    if (!settlement.canCompleteSale) return;

    const receiptNo = generateReceiptNumber(sales.length + 1, new Date());

    let cumulativeUtangAfterSale: number | undefined;
    if (settlement.utangBalanceAdded > 0 && payload.customerName.trim()) {
      const norm = normalizeCustomerName(payload.customerName);
      const existingCustomer = customerSummaries.find(
        (c) => c.normalizedName === norm
      );
      const prevDebt = existingCustomer ? existingCustomer.currentBalance : 0;
      cumulativeUtangAfterSale = roundCurrency(
        prevDebt + settlement.utangBalanceAdded
      );
    }

    const newSale: SaleTransaction = {
      id: `sale-${Date.now()}`,
      receiptNo,
      createdAt: new Date().toISOString(),
      items: cart,
      totalItems: totals.totalItems,
      subtotal: totals.subtotal,
      discount: totals.discountApplied,
      grandTotal: totals.grandTotal,
      totalCapital: totals.totalCapital,
      netProfit: totals.netProfit,
      paymentType: payload.paymentType,
      amountTendered: settlement.amountTendered,
      cashCollected: settlement.cashCollected,
      gcashCollected: settlement.gcashCollected,
      changeGiven: settlement.changeGiven,
      utangAmount: settlement.utangBalanceAdded,
      splitToUtang: payload.splitRemainderToUtang,
      customerName: payload.customerName || undefined,
      gcashRefNo: payload.gcashRefNo || undefined,
      dueDateOrNote: payload.dueDateOrNote || undefined,
      customerCumulativeUtangAfterSale: cumulativeUtangAfterSale,
      voided: false,
    };

    const nextProducts = products.map((prod) => {
      const soldItem = cart.find((c) => c.productId === prod.id);
      if (!soldItem) return prod;
      return {
        ...prod,
        stock: prod.stock - soldItem.quantity,
        updatedAt: new Date().toISOString(),
      };
    });

    const nextSales = [newSale, ...sales];
    void saveAllToCloud({
      products: nextProducts,
      sales: nextSales,
    });

    setCart([]);
    setDiscount(0);
    setActiveReceipt({ kind: 'SALE', sale: newSale });

    if (settings.autoPrint) {
      setTimeout(() => {
        window.print();
      }, 120);
    }
  };

  // Inventory Handlers (Write-Through: 0ms L1 + Immediate L2 Push)
  const handleSaveProduct = (savedProduct: Product) => {
    const exists = products.some((p) => p.id === savedProduct.id);
    const nextProducts = exists
      ? products.map((p) => (p.id === savedProduct.id ? savedProduct : p))
      : [savedProduct, ...products];

    setCart((prev) =>
      prev.map((item) =>
        item.productId === savedProduct.id
          ? {
              ...item,
              name: savedProduct.name,
              barcode: savedProduct.barcode,
              category: savedProduct.category,
              capitalPrice: savedProduct.capitalPrice,
              currentStock: savedProduct.stock,
            }
          : item
      )
    );

    void saveAllToCloud({ products: nextProducts });
    showQuickNotice(`Auto-saved product "${savedProduct.name}" to Cloud.`);
  };

  const handleDeleteProduct = (productId: string) => {
    const nextProducts = products.filter((p) => p.id !== productId);
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    void saveAllToCloud({ products: nextProducts });
    showQuickNotice('Deleted product and updated Cloud Store.');
  };

  const handleRestockProduct = (productId: string, addQty: number) => {
    const nextProducts = products.map((p) =>
      p.id === productId
        ? {
            ...p,
            stock: p.stock + addQty,
            updatedAt: new Date().toISOString(),
          }
        : p
    );
    void saveAllToCloud({ products: nextProducts });
    showQuickNotice(`Added +${addQty} stock (auto-saved to Cloud).`);
  };

  // Utang Payment Handler (Write-Through: 0ms L1 + Immediate L2 Push)
  const handleRecordUtangPayment = (payload: {
    customerName: string;
    previousBalance: number;
    amountPaid: number;
    paymentMethod: 'CASH' | 'GCASH';
    gcashRefNo?: string;
    note?: string;
  }) => {
    const remainingBalance = roundCurrency(
      Math.max(0, payload.previousBalance - payload.amountPaid)
    );
    const year = new Date().getFullYear();
    const seq = String(utangPayments.length + 1).padStart(4, '0');
    const newPayment: UtangPaymentTransaction = {
      id: `utgpay-${Date.now()}`,
      receiptNo: `#UTG-${year}-${seq}`,
      createdAt: new Date().toISOString(),
      customerName: payload.customerName,
      paymentMethod: payload.paymentMethod,
      gcashRefNo: payload.gcashRefNo,
      previousBalance: payload.previousBalance,
      amountPaid: payload.amountPaid,
      remainingBalance,
      note: payload.note,
    };

    const nextUtangPayments = [newPayment, ...utangPayments];
    void saveAllToCloud({ utangPayments: nextUtangPayments });
    setActiveReceipt({ kind: 'UTANG_PAYMENT', payment: newPayment });

    if (settings.autoPrint) {
      setTimeout(() => {
        window.print();
      }, 120);
    }
  };

  // Shift & Cash Drawer Adjustment Handlers (Write-Through: 0ms L1 + Immediate L2 Push)
  const handleUpdateShiftRecord = (record: DailyShiftRecord) => {
    const exists = shifts.some((s) => s.dateKey === record.dateKey);
    const nextShifts = exists
      ? shifts.map((s) => (s.dateKey === record.dateKey ? record : s))
      : [...shifts, record];

    void saveAllToCloud({ shifts: nextShifts });
    showQuickNotice(`Auto-saved shift cash drawer record for ${record.dateKey}.`);
  };

  const handleAddCashAdjustment = (adj: Omit<CashDrawerAdjustment, 'id'>) => {
    const newAdj: CashDrawerAdjustment = {
      ...adj,
      id: `adj-${Date.now()}`,
    };
    const nextAdjustments = [newAdj, ...adjustments];
    void saveAllToCloud({ adjustments: nextAdjustments });
    showQuickNotice(`Auto-saved drawer entry: ${adj.reason}`);
  };

  const handleDeleteCashAdjustment = (adjId: string) => {
    const nextAdjustments = adjustments.filter((a) => a.id !== adjId);
    void saveAllToCloud({ adjustments: nextAdjustments });
  };

  const handlePrintZReading = (zReport: ZReadingReportData) => {
    setActiveReceipt({ kind: 'Z_READING', zReport });
    if (settings.autoPrint) {
      setTimeout(() => {
        window.print();
      }, 120);
    }
  };

  // Void Sale & Restore Stock Handler (Write-Through: 0ms L1 + Immediate L2 Push)
  const handleVoidSale = (saleId: string) => {
    const targetSale = sales.find((s) => s.id === saleId);
    if (!targetSale || targetSale.voided) return;

    const nextProducts = products.map((prod) => {
      const itemInSale = targetSale.items.find((i) => i.productId === prod.id);
      if (!itemInSale) return prod;
      return {
        ...prod,
        stock: prod.stock + itemInSale.quantity,
        updatedAt: new Date().toISOString(),
      };
    });

    const voidedSale: SaleTransaction = {
      ...targetSale,
      voided: true,
      voidedAt: new Date().toISOString(),
    };

    const nextSales = sales.map((s) => (s.id === saleId ? voidedSale : s));
    void saveAllToCloud({
      products: nextProducts,
      sales: nextSales,
    });

    showQuickNotice(
      `Voided sale ${targetSale.receiptNo} and restored ${targetSale.totalItems} items back to inventory.`
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* Floating Non-Intrusive Auto-Sync Toast */}
      {bannerNotice && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-lg border border-slate-700"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{bannerNotice}</span>
        </div>
      )}

      {/* Top Navigation Bar (Strict 3-Zone Contract: Brand — 4 Nav Links — 1 Primary Action) */}
      <header className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-y-2.5 gap-x-8 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#cart"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('CART');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Four Gifts Store POS
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary POS Navigation"
          className="order-3 lg:order-none w-full lg:w-auto flex items-center gap-5 sm:gap-6 text-xs sm:text-sm font-semibold overflow-x-auto pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-100"
        >
          <button
            type="button"
            onClick={() => setActiveTab('CART')}
            className={`inline-flex items-center gap-1.5 py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'CART'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>
              Cart Page{cart.length > 0 ? ` (${cart.length})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PRODUCTS')}
            className={`inline-flex items-center gap-1.5 py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'PRODUCTS'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>
              List of Products
              {lowStockCount > 0 ? ` (${lowStockCount} Low)` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('UTANG')}
            className={`inline-flex items-center gap-1.5 py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'UTANG'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>
              Utang Ledger
              {unpaidUtangCount > 0 ? ` (${unpaidUtangCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('REPORTS')}
            className={`inline-flex items-center gap-1.5 py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'REPORTS'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Transactions &amp; Cash Drawer</span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Receipt &amp; Store Settings</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="no-print flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        {activeTab === 'CART' && (
          <CartPage
            products={products}
            cart={cart}
            discount={discount}
            parkedCarts={parkedCarts}
            customerSummaries={customerSummaries}
            autoPrint={settings.autoPrint}
            onToggleAutoPrint={(checked) => {
              const next = { ...settings, autoPrint: checked };
              void saveAllToCloud({ settings: next });
            }}
            onAddProductToCart={handleAddProductToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onUpdateCartUnitPrice={handleUpdateCartUnitPrice}
            onRemoveCartItem={handleRemoveCartItem}
            onUpdateDiscount={setDiscount}
            onClearCart={handleClearCart}
            onParkCurrentCart={handleParkCurrentCart}
            onResumeParkedCart={handleResumeParkedCart}
            onDeleteParkedCart={handleDeleteParkedCart}
            onCompleteSale={handleCompleteSale}
            focusTrigger={focusBarcodeTrigger}
          />
        )}

        {activeTab === 'PRODUCTS' && (
          <ProductsPage
            products={products}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            onRestockProduct={handleRestockProduct}
          />
        )}

        {activeTab === 'UTANG' && (
          <UtangLedgerPage
            customerSummaries={customerSummaries}
            onRecordUtangPayment={handleRecordUtangPayment}
            onReprintSaleReceipt={(sale) =>
              setActiveReceipt({ kind: 'SALE', sale })
            }
            onReprintPaymentReceipt={(payment) =>
              setActiveReceipt({ kind: 'UTANG_PAYMENT', payment })
            }
          />
        )}

        {activeTab === 'REPORTS' && (
          <TransactionsReportPage
            sales={sales}
            utangPayments={utangPayments}
            shifts={shifts}
            adjustments={adjustments}
            onReprintSaleReceipt={(sale) =>
              setActiveReceipt({ kind: 'SALE', sale })
            }
            onVoidSale={handleVoidSale}
            onUpdateShiftRecord={handleUpdateShiftRecord}
            onAddCashAdjustment={handleAddCashAdjustment}
            onDeleteCashAdjustment={handleDeleteCashAdjustment}
            onPrintZReading={handlePrintZReading}
          />
        )}
      </main>

      {/* Thermal Receipt Preview & Print Modal */}
      <ReceiptModal
        receiptData={activeReceipt}
        settings={settings}
        onClose={() => {
          setActiveReceipt(null);
          if (activeTab === 'CART') {
            setFocusBarcodeTrigger((n) => n + 1);
          }
        }}
        onUpdatePaperSize={(paperSize: PaperSize) => {
          const next = { ...settings, paperSize };
          void saveAllToCloud({ settings: next });
        }}
      />

      {/* Store, Thermal Paper Size & Data Backup Modal */}
      <SettingsBackupModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={(newSettings) => {
          void saveAllToCloud({ settings: newSettings });
        }}
        products={products}
        sales={sales}
        utangPayments={utangPayments}
        onRestoreBackup={(data) => {
          const nextSettings = data.settings || settings;
          void saveAllToCloud({
            settings: nextSettings,
            products: data.products,
            sales: data.sales,
            utangPayments: data.utangPayments,
          });
        }}
        onResetSampleData={() => {
          setCart([]);
          setDiscount(0);
          void saveAllToCloud({
            products: INITIAL_PRODUCTS,
            sales: [],
            utangPayments: [],
            shifts: [],
            adjustments: [],
            parkedCarts: [],
          });
        }}
        cloudUserEmail={cloudUser?.email}
        cloudSyncState={cloudSyncState}
        lastSavedTime={lastSavedTime}
        onSignInCloud={handleGoogleSignIn}
        onSignOutCloud={handleGoogleSignOut}
        onSyncCloudNow={handleManualCloudSync}
        onPullCloudNow={handleManualCloudPull}
      />
    </div>
  );
}
