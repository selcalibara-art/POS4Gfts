/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Upload,
  Settings,
  ShoppingCart,
  Package,
  BookOpen,
  BarChart3,
  CalendarRange,
  Cloud,
  RefreshCw,
  LogOut,
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
  saveSettingsToCloud,
  saveProductToCloud,
  deleteProductFromCloud,
  saveSaleToCloud,
  saveUtangPaymentToCloud,
  saveShiftToCloud,
  saveAdjustmentToCloud,
  deleteAdjustmentFromCloud,
  saveParkedCartToCloud,
  deleteParkedCartFromCloud,
  syncFullStoreStateToCloud,
  subscribeToCloudStore,
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

  // Persistent State (synced automatically with Firebase Cloud Firestore across all devices)
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

  // Cloud Auto-Save State (Always Active Across All Devices)
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<
    'LOCAL_ONLY' | 'SYNCING' | 'CLOUD_SAVED' | 'ERROR'
  >('SYNCING');
  const [lastSavedTime, setLastSavedTime] = useState<string>(() =>
    formatCurrentTimeShort()
  );

  // Keep latest state in a ref for initial cloud upload when empty cloud DB is detected
  const latestStoreRef = useRef({
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

  // Active Checkout Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [focusBarcodeTrigger, setFocusBarcodeTrigger] = useState<number>(0);

  // Modals
  const [activeReceipt, setActiveReceipt] =
    useState<ActiveReceiptModal | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] =
    useState<boolean>(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  // Track optional Firebase Auth user
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCloudUser(user);
    });
    return () => unsubAuth();
  }, []);

  // Automatically subscribe to shared Firebase Cloud Firestore on EVERY device immediately
  useEffect(() => {
    setCloudSyncState('SYNCING');
    const unsubCloud = subscribeToCloudStore(SHARED_STORE_OWNER_ID, {
      onSettings: (cloudSettings) => setSettings(cloudSettings),
      onProducts: (cloudProducts) => setProducts(cloudProducts),
      onSales: (cloudSales) => setSales(cloudSales),
      onUtangPayments: (cloudPayments) => setUtangPayments(cloudPayments),
      onShifts: (cloudShifts) => setShifts(cloudShifts),
      onAdjustments: (cloudAdjustments) => setAdjustments(cloudAdjustments),
      onParkedCarts: (cloudParked) => setParkedCarts(cloudParked),
      onSyncActivity: () => {
        setCloudSyncState('CLOUD_SAVED');
        setLastSavedTime(formatCurrentTimeShort());
      },
      onEmptyCloudDetected: async () => {
        setCloudSyncState('SYNCING');
        try {
          await syncFullStoreStateToCloud(
            SHARED_STORE_OWNER_ID,
            latestStoreRef.current,
            false
          );
          setCloudSyncState('CLOUD_SAVED');
          setLastSavedTime(formatCurrentTimeShort());
        } catch {
          setCloudSyncState('ERROR');
        }
      },
    });

    return () => unsubCloud();
  }, []);

  // Save to localStorage on change & update auto-save timestamp
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    } catch {
      // ignore
    }
  }, [sales]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.UTANG_PAYMENTS,
        JSON.stringify(utangPayments)
      );
    } catch {
      // ignore
    }
  }, [utangPayments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    } catch {
      // ignore
    }
  }, [shifts]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.ADJUSTMENTS,
        JSON.stringify(adjustments)
      );
    } catch {
      // ignore
    }
  }, [adjustments]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.PARKED_CARTS,
        JSON.stringify(parkedCarts)
      );
    } catch {
      // ignore
    }
  }, [parkedCarts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Always auto-save every mutation directly to Firebase Cloud Firestore
  const triggerCloudSave = (promiseFactory: (uid: string) => Promise<void>) => {
    setCloudSyncState('SYNCING');
    promiseFactory(SHARED_STORE_OWNER_ID)
      .then(() => {
        setCloudSyncState('CLOUD_SAVED');
        setLastSavedTime(formatCurrentTimeShort());
      })
      .catch(() => {
        setCloudSyncState('ERROR');
      });
  };

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
    setCloudSyncState('SYNCING');
    try {
      await syncFullStoreStateToCloud(
        SHARED_STORE_OWNER_ID,
        latestStoreRef.current,
        true
      );
      setCloudSyncState('CLOUD_SAVED');
      setLastSavedTime(formatCurrentTimeShort());
      showQuickNotice('All POS records saved to Firebase Cloud!');
    } catch {
      setCloudSyncState('ERROR');
    }
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

  const showQuickNotice = (msg: string) => {
    setBannerNotice(msg);
    setTimeout(() => {
      setBannerNotice((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  // Load 7-Day Store Simulation Handler
  const handleRunSevenDaySimulation = () => {
    const sim = generateSevenDayStoreSimulation(new Date());
    setProducts(sim.products);
    setSales(sim.sales);
    setUtangPayments(sim.utangPayments);
    setShifts(sim.shifts);
    setAdjustments(sim.adjustments);
    triggerCloudSave((uid) =>
      syncFullStoreStateToCloud(
        uid,
        {
          settings,
          products: sim.products,
          sales: sim.sales,
          utangPayments: sim.utangPayments,
          shifts: sim.shifts,
          adjustments: sim.adjustments,
          parkedCarts,
        },
        true
      )
    );
    showQuickNotice(
      'Loaded 7-Day Store Simulation (Opening Floats, Sales, Utang, Expenses & Z-Readings).'
    );
  };

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
    setParkedCarts((prev) => [...prev, newParked]);
    triggerCloudSave((uid) => saveParkedCartToCloud(uid, newParked));
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
    setParkedCarts((prev) => prev.filter((p) => p.id !== parkedId));
    triggerCloudSave((uid) => deleteParkedCartFromCloud(uid, parkedId));
    showQuickNotice(`Resumed parked cart "${target.label}".`);
  };

  const handleDeleteParkedCart = (parkedId: string) => {
    setParkedCarts((prev) => prev.filter((p) => p.id !== parkedId));
    triggerCloudSave((uid) => deleteParkedCartFromCloud(uid, parkedId));
  };

  // Complete Sale & Deduct Stock
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

    // Deduct product stock quantities
    const updatedProductsList: Product[] = [];
    setProducts((prevProducts) =>
      prevProducts.map((prod) => {
        const soldItem = cart.find((c) => c.productId === prod.id);
        if (!soldItem) return prod;
        const nextProd: Product = {
          ...prod,
          stock: prod.stock - soldItem.quantity,
          updatedAt: new Date().toISOString(),
        };
        updatedProductsList.push(nextProd);
        return nextProd;
      })
    );

    setSales((prevSales) => [newSale, ...prevSales]);
    triggerCloudSave(async (uid) => {
      await saveSaleToCloud(uid, newSale);
      await Promise.all(
        updatedProductsList.map((prod) => saveProductToCloud(uid, prod))
      );
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

  // Inventory Handlers
  const handleSaveProduct = (savedProduct: Product) => {
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === savedProduct.id);
      if (exists) {
        return prev.map((p) => (p.id === savedProduct.id ? savedProduct : p));
      }
      return [savedProduct, ...prev];
    });
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
    triggerCloudSave((uid) => saveProductToCloud(uid, savedProduct));
    showQuickNotice(`Auto-saved product "${savedProduct.name}".`);
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    triggerCloudSave((uid) => deleteProductFromCloud(uid, productId));
  };

  const handleRestockProduct = (productId: string, addQty: number) => {
    let restockedProd: Product | null = null;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        restockedProd = {
          ...p,
          stock: p.stock + addQty,
          updatedAt: new Date().toISOString(),
        };
        return restockedProd;
      })
    );
    if (restockedProd) {
      const targetProd = restockedProd;
      triggerCloudSave((uid) => saveProductToCloud(uid, targetProd));
    }
    showQuickNotice(`Added +${addQty} stock (auto-saved).`);
  };

  // Utang Payment Handler
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

    setUtangPayments((prev) => [newPayment, ...prev]);
    triggerCloudSave((uid) => saveUtangPaymentToCloud(uid, newPayment));
    setActiveReceipt({ kind: 'UTANG_PAYMENT', payment: newPayment });

    if (settings.autoPrint) {
      setTimeout(() => {
        window.print();
      }, 120);
    }
  };

  // Shift & Cash Drawer Adjustment Handlers
  const handleUpdateShiftRecord = (record: DailyShiftRecord) => {
    setShifts((prev) => {
      const exists = prev.some((s) => s.dateKey === record.dateKey);
      if (exists) {
        return prev.map((s) => (s.dateKey === record.dateKey ? record : s));
      }
      return [...prev, record];
    });
    triggerCloudSave((uid) => saveShiftToCloud(uid, record));
    showQuickNotice(`Auto-saved shift cash drawer record for ${record.dateKey}.`);
  };

  const handleAddCashAdjustment = (adj: Omit<CashDrawerAdjustment, 'id'>) => {
    const newAdj: CashDrawerAdjustment = {
      ...adj,
      id: `adj-${Date.now()}`,
    };
    setAdjustments((prev) => [newAdj, ...prev]);
    triggerCloudSave((uid) => saveAdjustmentToCloud(uid, newAdj));
    showQuickNotice(`Auto-saved drawer entry: ${adj.reason}`);
  };

  const handleDeleteCashAdjustment = (adjId: string) => {
    setAdjustments((prev) => prev.filter((a) => a.id !== adjId));
    triggerCloudSave((uid) => deleteAdjustmentFromCloud(uid, adjId));
  };

  const handlePrintZReading = (zReport: ZReadingReportData) => {
    setActiveReceipt({ kind: 'Z_READING', zReport });
    if (settings.autoPrint) {
      setTimeout(() => {
        window.print();
      }, 120);
    }
  };

  // Void Sale & Restore Stock Handler
  const handleVoidSale = (saleId: string) => {
    const targetSale = sales.find((s) => s.id === saleId);
    if (!targetSale || targetSale.voided) return;

    const restoredProducts: Product[] = [];
    setProducts((prevProducts) =>
      prevProducts.map((prod) => {
        const itemInSale = targetSale.items.find(
          (i) => i.productId === prod.id
        );
        if (!itemInSale) return prod;
        const updatedProd: Product = {
          ...prod,
          stock: prod.stock + itemInSale.quantity,
          updatedAt: new Date().toISOString(),
        };
        restoredProducts.push(updatedProd);
        return updatedProd;
      })
    );

    const voidedSale: SaleTransaction = {
      ...targetSale,
      voided: true,
      voidedAt: new Date().toISOString(),
    };

    setSales((prevSales) =>
      prevSales.map((s) => (s.id === saleId ? voidedSale : s))
    );

    triggerCloudSave(async (uid) => {
      await saveSaleToCloud(uid, voidedSale);
      await Promise.all(
        restoredProducts.map((p) => saveProductToCloud(uid, p))
      );
    });

    showQuickNotice(
      `Voided sale ${targetSale.receiptNo} and restored ${targetSale.totalItems} items back to inventory.`
    );
  };

  // One-click Header Export & Restore Handlers
  const handleQuickExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Four Gifts Store POS',
      settings,
      products,
      sales,
      utangPayments,
      shifts,
      adjustments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `four-gifts-store-pos-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showQuickNotice('Exported full POS backup (.json).');
  };

  const handleQuickRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.products)) {
          const nextProducts = parsed.products;
          const nextSales = Array.isArray(parsed.sales) ? parsed.sales : [];
          const nextUtang = Array.isArray(parsed.utangPayments)
            ? parsed.utangPayments
            : [];
          const nextShifts = Array.isArray(parsed.shifts)
            ? parsed.shifts
            : shifts;
          const nextAdjustments = Array.isArray(parsed.adjustments)
            ? parsed.adjustments
            : adjustments;
          const nextSettings = parsed.settings || settings;

          setProducts(nextProducts);
          setSales(nextSales);
          setUtangPayments(nextUtang);
          setShifts(nextShifts);
          setAdjustments(nextAdjustments);
          setSettings(nextSettings);

          triggerCloudSave((uid) =>
            syncFullStoreStateToCloud(
              uid,
              {
                settings: nextSettings,
                products: nextProducts,
                sales: nextSales,
                utangPayments: nextUtang,
                shifts: nextShifts,
                adjustments: nextAdjustments,
                parkedCarts,
              },
              true
            )
          );
          showQuickNotice('Backup restored and auto-saved!');
        } else {
          showQuickNotice('Invalid backup file format.');
        }
      } catch {
        showQuickNotice('Could not read JSON backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
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
            <span>Transactions & Cash Drawer</span>
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
            <span>Receipt & Store Settings</span>
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
              setSettings(next);
              triggerCloudSave((uid) => saveSettingsToCloud(uid, next));
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
          setSettings(next);
          triggerCloudSave((uid) => saveSettingsToCloud(uid, next));
        }}
      />

      {/* Store, Thermal Paper Size & Data Backup Modal */}
      <SettingsBackupModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={(newSettings) => {
          setSettings(newSettings);
          triggerCloudSave((uid) => saveSettingsToCloud(uid, newSettings));
        }}
        products={products}
        sales={sales}
        utangPayments={utangPayments}
        onRestoreBackup={(data) => {
          const nextSettings = data.settings || settings;
          setProducts(data.products);
          setSales(data.sales);
          setUtangPayments(data.utangPayments);
          if (data.settings) setSettings(data.settings);
          triggerCloudSave((uid) =>
            syncFullStoreStateToCloud(
              uid,
              {
                settings: nextSettings,
                products: data.products,
                sales: data.sales,
                utangPayments: data.utangPayments,
                shifts,
                adjustments,
                parkedCarts,
              },
              true
            )
          );
        }}
        onResetSampleData={() => {
          setProducts(INITIAL_PRODUCTS);
          setSales([]);
          setUtangPayments([]);
          setShifts([]);
          setAdjustments([]);
          setParkedCarts([]);
          setCart([]);
          setDiscount(0);
          triggerCloudSave((uid) =>
            syncFullStoreStateToCloud(
              uid,
              {
                settings,
                products: INITIAL_PRODUCTS,
                sales: [],
                utangPayments: [],
                shifts: [],
                adjustments: [],
                parkedCarts: [],
              },
              true
            )
          );
        }}
        cloudUserEmail={cloudUser?.email}
        cloudSyncState={cloudSyncState}
        lastSavedTime={lastSavedTime}
        onSignInCloud={handleGoogleSignIn}
        onSignOutCloud={handleGoogleSignOut}
        onSyncCloudNow={handleManualCloudSync}
      />
    </div>
  );
}
