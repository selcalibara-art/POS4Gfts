import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError,
} from '../firebase';
import {
  Product,
  CartItem,
  SaleTransaction,
  UtangPaymentTransaction,
  DailyShiftRecord,
  CashDrawerAdjustment,
  ParkedCart,
  StoreSettings,
} from '../types/pos';

export const SHARED_STORE_OWNER_ID = 'four_gifts_store_main';

function toLocalDayKey(date: Date): string {
  const d = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Sanitize ID strings to match ^[a-zA-Z0-9_\-]+$ and length 1..100
export function sanitizeSafeId(raw: string, maxLen = 100): string {
  const cleaned = String(raw || 'item')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : 'item';
}

export function makeCloudDocId(uid: string, entityId: string): string {
  const safeUid = sanitizeSafeId(uid, 48);
  const safeEntity = sanitizeSafeId(entityId, 70);
  return `${safeUid}_${safeEntity}`.slice(0, 128);
}

function clampString(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const str = String(val ?? fallback).trim();
  return str.slice(0, maxLen);
}

function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export async function saveSettingsToCloud(
  uid: string,
  settings: StoreSettings
): Promise<void> {
  const path = `pos_settings/${uid}`;
  const ref = doc(db, 'pos_settings', uid);
  const baseFields = {
    storeName: clampString(settings.storeName, 120, 'FOUR GIFTS STORE') || 'FOUR GIFTS STORE',
    subtitle: clampString(settings.subtitle, 160),
    address: clampString(settings.address, 200),
    contactPhone: clampString(settings.contactNumber, 60),
    tinOrPermit: '',
    footerMessage: clampString(settings.footerMessage, 240),
    paperSize: settings.paperSize === '80mm' ? '80mm' : '58mm',
    autoPrint: Boolean(settings.autoPrint),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...baseFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...baseFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveProductToCloud(
  uid: string,
  product: Product
): Promise<void> {
  const docId = makeCloudDocId(uid, product.id);
  const path = `pos_products/${docId}`;
  const ref = doc(db, 'pos_products', docId);
  const safeId = sanitizeSafeId(product.id, 100);
  const editableFields = {
    barcode: clampString(product.barcode, 64, safeId) || safeId,
    name: clampString(product.name, 160, 'Unnamed Product') || 'Unnamed Product',
    category: clampString(product.category, 80, 'General') || 'General',
    costPrice: clampNumber(product.capitalPrice, 0, 10000000),
    sellingPrice: clampNumber(product.sellingPrice, 0, 10000000),
    stock: clampNumber(product.stock, -100000, 1000000),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...editableFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: safeId,
        ...editableFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProductFromCloud(
  uid: string,
  productId: string
): Promise<void> {
  const docId = makeCloudDocId(uid, productId);
  const path = `pos_products/${docId}`;
  const ref = doc(db, 'pos_products', docId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveSaleToCloud(
  uid: string,
  sale: SaleTransaction
): Promise<void> {
  const docId = makeCloudDocId(uid, sale.id);
  const path = `pos_sales/${docId}`;
  const ref = doc(db, 'pos_sales', docId);
  const safeId = sanitizeSafeId(sale.id, 100);

  const boundedItems = (sale.items || []).slice(0, 50).map((item) => ({
    productId: sanitizeSafeId(item.productId, 100),
    barcode: clampString(item.barcode, 64, '0000') || '0000',
    name: clampString(item.name, 160, 'Item') || 'Item',
    category: clampString(item.category, 80, 'Gifts') || 'Gifts',
    capitalPrice: clampNumber(item.capitalPrice, 0, 10000000),
    originalSellingPrice: clampNumber(item.originalSellingPrice, 0, 10000000),
    unitPrice: clampNumber(item.unitPrice, 0, 10000000),
    quantity: clampNumber(item.quantity, 1, 100000),
    currentStock: clampNumber(item.currentStock, -100000, 1000000),
  }));

  if (boundedItems.length === 0) {
    boundedItems.push({
      productId: 'p_placeholder',
      barcode: '0000',
      name: 'POS Item',
      category: 'Gifts',
      capitalPrice: 0,
      originalSellingPrice: clampNumber(sale.grandTotal, 0, 10000000),
      unitPrice: clampNumber(sale.grandTotal, 0, 10000000),
      quantity: 1,
      currentStock: 0,
    });
  }

  const cloudPaymentType =
    sale.splitToUtang && sale.paymentType === 'CASH'
      ? 'SPLIT_CASH_UTANG'
      : sale.paymentType === 'GCASH' || sale.paymentType === 'UTANG'
      ? sale.paymentType
      : 'CASH';

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existingData = snap.data();
      if (existingData.status !== 'VOIDED' && sale.voided) {
        await updateDoc(ref, {
          status: 'VOIDED',
          voidedAt: clampString(sale.voidedAt || new Date().toISOString(), 64),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: safeId,
        receiptNo: clampString(sale.receiptNo, 64, '#FGS-0001') || '#FGS-0001',
        timestamp: clampString(sale.createdAt, 64, new Date().toISOString()) || new Date().toISOString(),
        items: boundedItems,
        subtotal: clampNumber(sale.subtotal, 0, 10000000),
        discount: clampNumber(sale.discount, 0, 10000000),
        total: clampNumber(sale.grandTotal, 0, 10000000),
        totalProfit: clampNumber(sale.netProfit, -10000000, 10000000),
        totalItems: clampNumber(sale.totalItems, 1, 100000),
        paymentType: cloudPaymentType,
        amountTendered: clampNumber(sale.amountTendered, 0, 10000000),
        change: clampNumber(sale.changeGiven, 0, 10000000),
        utangAmount: clampNumber(sale.utangAmount, 0, 10000000),
        customerName: clampString(sale.customerName, 120),
        gcashRef: clampString(sale.gcashRefNo, 80),
        dueDateNote: clampString(sale.dueDateOrNote, 200),
        status: sale.voided ? 'VOIDED' : 'COMPLETED',
        voidedAt: clampString(sale.voidedAt, 64),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveUtangPaymentToCloud(
  uid: string,
  payment: UtangPaymentTransaction
): Promise<void> {
  const docId = makeCloudDocId(uid, payment.id);
  const path = `pos_utang_payments/${docId}`;
  const ref = doc(db, 'pos_utang_payments', docId);
  const safeId = sanitizeSafeId(payment.id, 100);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        gcashRef: clampString(payment.gcashRefNo, 80),
        note: clampString(payment.note, 200),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: safeId,
        receiptNo: clampString(payment.receiptNo, 64, '#UTG-0001') || '#UTG-0001',
        timestamp: clampString(payment.createdAt, 64, new Date().toISOString()) || new Date().toISOString(),
        customerName: clampString(payment.customerName, 120, 'Customer') || 'Customer',
        paymentMethod: payment.paymentMethod === 'GCASH' ? 'GCASH' : 'CASH',
        gcashRef: clampString(payment.gcashRefNo, 80),
        previousBalance: clampNumber(payment.previousBalance, 0, 10000000),
        amountPaid: clampNumber(payment.amountPaid, 0.01, 10000000),
        remainingBalance: clampNumber(payment.remainingBalance, 0, 10000000),
        note: clampString(payment.note, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveShiftToCloud(
  uid: string,
  shift: DailyShiftRecord
): Promise<void> {
  const validDayKey = /^\d{4}-\d{2}-\d{2}$/.test(shift.dateKey)
    ? shift.dateKey
    : toLocalDayKey(new Date());
  const docId = makeCloudDocId(uid, validDayKey);
  const path = `pos_shifts/${docId}`;
  const ref = doc(db, 'pos_shifts', docId);

  const isClosed = shift.actualClosingCashCounted !== undefined;
  const editableFields = {
    openingFloat: clampNumber(shift.openingFloat, 0, 10000000),
    openedAt: clampString(shift.openedAt, 64, new Date().toISOString()) || new Date().toISOString(),
    status: isClosed ? 'CLOSED' : 'OPEN',
    closingCountedCash: clampNumber(shift.actualClosingCashCounted ?? 0, 0, 10000000),
    expectedCashAtClose: 0,
    variance: 0,
    closingNote: clampString(shift.closingNote, 200),
    closedAt: clampString(shift.closedAt, 64),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...editableFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        dayKey: validDayKey,
        ...editableFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAdjustmentToCloud(
  uid: string,
  adj: CashDrawerAdjustment
): Promise<void> {
  const docId = makeCloudDocId(uid, adj.id);
  const path = `pos_adjustments/${docId}`;
  const ref = doc(db, 'pos_adjustments', docId);
  const safeId = sanitizeSafeId(adj.id, 100);
  const derivedDayKey = toLocalDayKey(new Date(adj.createdAt));
  const validDayKey = /^\d{4}-\d{2}-\d{2}$/.test(derivedDayKey)
    ? derivedDayKey
    : toLocalDayKey(new Date());

  const cloudType = adj.type === 'CASH_IN' ? 'CASH_IN' : 'CASH_OUT';

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        type: cloudType,
        amount: clampNumber(adj.amount, 0.01, 10000000),
        reason: clampString(adj.reason, 200, 'Store adjustment') || 'Store adjustment',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: safeId,
        dayKey: validDayKey,
        timestamp: clampString(adj.createdAt, 64, new Date().toISOString()) || new Date().toISOString(),
        type: cloudType,
        amount: clampNumber(adj.amount, 0.01, 10000000),
        reason: clampString(adj.reason, 200, 'Store adjustment') || 'Store adjustment',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAdjustmentFromCloud(
  uid: string,
  adjustmentId: string
): Promise<void> {
  const docId = makeCloudDocId(uid, adjustmentId);
  const path = `pos_adjustments/${docId}`;
  const ref = doc(db, 'pos_adjustments', docId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveParkedCartToCloud(
  uid: string,
  parked: ParkedCart
): Promise<void> {
  const docId = makeCloudDocId(uid, parked.id);
  const path = `pos_parked_carts/${docId}`;
  const ref = doc(db, 'pos_parked_carts', docId);
  const safeId = sanitizeSafeId(parked.id, 100);

  const boundedItems = (parked.items || []).slice(0, 50).map((item) => ({
    productId: sanitizeSafeId(item.productId, 100),
    barcode: clampString(item.barcode, 64, '0000') || '0000',
    name: clampString(item.name, 160, 'Item') || 'Item',
    category: clampString(item.category, 80, 'Gifts') || 'Gifts',
    capitalPrice: clampNumber(item.capitalPrice, 0, 10000000),
    originalSellingPrice: clampNumber(item.originalSellingPrice, 0, 10000000),
    unitPrice: clampNumber(item.unitPrice, 0, 10000000),
    quantity: clampNumber(item.quantity, 1, 100000),
    currentStock: clampNumber(item.currentStock, -100000, 1000000),
  }));

  if (boundedItems.length === 0) return;

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        label: clampString(parked.label, 120, 'Parked Cart') || 'Parked Cart',
        note: clampString(parked.note || parked.customerName, 200),
        discount: clampNumber(parked.discount, 0, 10000000),
        items: boundedItems,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: safeId,
        label: clampString(parked.label, 120, 'Parked Cart') || 'Parked Cart',
        note: clampString(parked.note || parked.customerName, 200),
        discount: clampNumber(parked.discount, 0, 10000000),
        parkedAt: clampString(parked.createdAt, 64, new Date().toISOString()) || new Date().toISOString(),
        items: boundedItems,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteParkedCartFromCloud(
  uid: string,
  parkedId: string
): Promise<void> {
  const docId = makeCloudDocId(uid, parkedId);
  const path = `pos_parked_carts/${docId}`;
  const ref = doc(db, 'pos_parked_carts', docId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface FullStoreState {
  settings: StoreSettings;
  products: Product[];
  sales: SaleTransaction[];
  utangPayments: UtangPaymentTransaction[];
  shifts: DailyShiftRecord[];
  adjustments: CashDrawerAdjustment[];
  parkedCarts: ParkedCart[];
}

async function clearCollectionForUser(
  collectionName: string,
  uid: string
): Promise<void> {
  const q = query(collection(db, collectionName), where('ownerId', '==', uid));
  try {
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  }
}

export async function syncFullStoreStateToCloud(
  uid: string,
  state: FullStoreState,
  replaceExisting = false
): Promise<void> {
  if (replaceExisting) {
    await Promise.all([
      clearCollectionForUser('pos_products', uid),
      clearCollectionForUser('pos_sales', uid),
      clearCollectionForUser('pos_utang_payments', uid),
      clearCollectionForUser('pos_shifts', uid),
      clearCollectionForUser('pos_adjustments', uid),
      clearCollectionForUser('pos_parked_carts', uid),
    ]);
  }

  await saveSettingsToCloud(uid, state.settings);

  await Promise.all([
    ...state.products.map((p) => saveProductToCloud(uid, p)),
    ...state.sales.map((s) => saveSaleToCloud(uid, s)),
    ...state.utangPayments.map((u) => saveUtangPaymentToCloud(uid, u)),
    ...state.shifts.map((sh) => saveShiftToCloud(uid, sh)),
    ...state.adjustments.map((adj) => saveAdjustmentToCloud(uid, adj)),
    ...state.parkedCarts.map((pk) => saveParkedCartToCloud(uid, pk)),
  ]);
}

export interface CloudStoreCallbacks {
  onSettings: (settings: StoreSettings) => void;
  onProducts: (products: Product[]) => void;
  onSales: (sales: SaleTransaction[]) => void;
  onUtangPayments: (payments: UtangPaymentTransaction[]) => void;
  onShifts: (shifts: DailyShiftRecord[]) => void;
  onAdjustments: (adjustments: CashDrawerAdjustment[]) => void;
  onParkedCarts: (parkedCarts: ParkedCart[]) => void;
  onSyncActivity: () => void;
  onEmptyCloudDetected: () => Promise<void> | void;
}

export function subscribeToCloudStore(
  uid: string,
  callbacks: CloudStoreCallbacks
): Unsubscribe {
  let unmounted = false;
  const unsubs: Unsubscribe[] = [];

  (async () => {
    const settingsRef = doc(db, 'pos_settings', uid);
    try {
      const initialSettingsSnap = await getDoc(settingsRef);
      if (unmounted) return;

      if (!initialSettingsSnap.exists()) {
        await callbacks.onEmptyCloudDetected();
        if (unmounted) return;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `pos_settings/${uid}`);
    }

    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          callbacks.onSettings({
            storeName: d.storeName || 'FOUR GIFTS STORE',
            subtitle: d.subtitle || '',
            address: d.address || '',
            contactNumber: d.contactPhone || '',
            footerMessage: d.footerMessage || '',
            paperSize: d.paperSize === '80mm' ? '80mm' : '58mm',
            autoPrint: Boolean(d.autoPrint),
          });
          callbacks.onSyncActivity();
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `pos_settings/${uid}`)
    );
    unsubs.push(unsubSettings);

    const qProducts = query(
      collection(db, 'pos_products'),
      where('ownerId', '==', uid)
    );
    const unsubProducts = onSnapshot(
      qProducts,
      (snap) => {
        const list: Product[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id,
              barcode: d.barcode,
              name: d.name,
              category: d.category,
              capitalPrice: Number(d.costPrice),
              sellingPrice: Number(d.sellingPrice),
              stock: Number(d.stock),
              note: '',
              updatedAt: new Date().toISOString(),
            };
          })
          .sort((a, b) => a.barcode.localeCompare(b.barcode));
        callbacks.onProducts(list);
        callbacks.onSyncActivity();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pos_products')
    );
    unsubs.push(unsubProducts);

    const qSales = query(
      collection(db, 'pos_sales'),
      where('ownerId', '==', uid)
    );
    const unsubSales = onSnapshot(
      qSales,
      (snap) => {
        const list: SaleTransaction[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            const isSplit = d.paymentType === 'SPLIT_CASH_UTANG';
            const mappedPaymentType =
              d.paymentType === 'GCASH'
                ? 'GCASH'
                : d.paymentType === 'UTANG'
                ? 'UTANG'
                : 'CASH';
            const grandTotal = Number(d.total);
            const netProfit = Number(d.totalProfit);
            const amountTendered = Number(d.amountTendered);
            const utangAmount = Number(d.utangAmount);
            const paidPortion = Math.max(0, grandTotal - utangAmount);
            const cashCollected =
              mappedPaymentType === 'CASH' ||
              (mappedPaymentType === 'UTANG' && amountTendered > 0)
                ? paidPortion
                : 0;
            const gcashCollected =
              mappedPaymentType === 'GCASH' ? paidPortion : 0;

            const rawItems: CartItem[] = (d.items || []).map(
              (it: Record<string, unknown>) => ({
                productId: String(it.productId || 'p_item'),
                barcode: String(it.barcode || '0000'),
                name: String(it.name || 'Item'),
                category: String(it.category || 'Gifts'),
                unitPrice: Number(it.unitPrice ?? 0),
                originalSellingPrice: Number(
                  it.originalSellingPrice ?? it.unitPrice ?? 0
                ),
                capitalPrice: Number(it.capitalPrice ?? it.costPrice ?? 0),
                quantity: Number(it.quantity ?? 1),
                currentStock: Number(it.currentStock ?? 0),
              })
            );

            return {
              id: d.id,
              receiptNo: d.receiptNo,
              createdAt: d.timestamp,
              items: rawItems,
              totalItems: Number(d.totalItems),
              subtotal: Number(d.subtotal),
              discount: Number(d.discount),
              grandTotal,
              totalCapital: Math.max(0, grandTotal - netProfit),
              netProfit,
              paymentType: mappedPaymentType,
              amountTendered,
              cashCollected,
              gcashCollected,
              changeGiven: Number(d.change),
              utangAmount,
              splitToUtang: isSplit,
              customerName: d.customerName || undefined,
              gcashRefNo: d.gcashRef || undefined,
              dueDateOrNote: d.dueDateNote || undefined,
              voided: d.status === 'VOIDED',
              voidedAt: d.voidedAt || undefined,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        callbacks.onSales(list);
        callbacks.onSyncActivity();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pos_sales')
    );
    unsubs.push(unsubSales);

    const qUtang = query(
      collection(db, 'pos_utang_payments'),
      where('ownerId', '==', uid)
    );
    const unsubUtang = onSnapshot(
      qUtang,
      (snap) => {
        const list: UtangPaymentTransaction[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id,
              receiptNo: d.receiptNo,
              createdAt: d.timestamp,
              customerName: d.customerName,
              paymentMethod: d.paymentMethod === 'GCASH' ? 'GCASH' : 'CASH',
              gcashRefNo: d.gcashRef || undefined,
              previousBalance: Number(d.previousBalance),
              amountPaid: Number(d.amountPaid),
              remainingBalance: Number(d.remainingBalance),
              note: d.note || undefined,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        callbacks.onUtangPayments(list);
        callbacks.onSyncActivity();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pos_utang_payments')
    );
    unsubs.push(unsubUtang);

    const qShifts = query(
      collection(db, 'pos_shifts'),
      where('ownerId', '==', uid)
    );
    const unsubShifts = onSnapshot(
      qShifts,
      (snap) => {
        const list: DailyShiftRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              dateKey: d.dayKey,
              openingFloat: Number(d.openingFloat),
              openedAt: d.openedAt,
              closedAt: d.closedAt || undefined,
              actualClosingCashCounted:
                d.status === 'CLOSED'
                  ? Number(d.closingCountedCash)
                  : undefined,
              closingNote: d.closingNote || undefined,
            };
          })
          .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        callbacks.onShifts(list);
        callbacks.onSyncActivity();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pos_shifts')
    );
    unsubs.push(unsubShifts);

    const qAdjustments = query(
      collection(db, 'pos_adjustments'),
      where('ownerId', '==', uid)
    );
    const unsubAdjustments = onSnapshot(
      qAdjustments,
      (snap) => {
        const list: CashDrawerAdjustment[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id,
              createdAt: d.timestamp,
              type: d.type === 'CASH_IN' ? 'CASH_IN' : 'EXPENSE_OUT',
              amount: Number(d.amount),
              reason: d.reason,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        callbacks.onAdjustments(list);
        callbacks.onSyncActivity();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pos_adjustments')
    );
    unsubs.push(unsubAdjustments);

    const qParked = query(
      collection(db, 'pos_parked_carts'),
      where('ownerId', '==', uid)
    );
    const unsubParked = onSnapshot(
      qParked,
      (snap) => {
        const list: ParkedCart[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            const rawItems: CartItem[] = (d.items || []).map(
              (it: Record<string, unknown>) => ({
                productId: String(it.productId || 'p_item'),
                barcode: String(it.barcode || '0000'),
                name: String(it.name || 'Item'),
                category: String(it.category || 'Gifts'),
                unitPrice: Number(it.unitPrice ?? 0),
                originalSellingPrice: Number(
                  it.originalSellingPrice ?? it.unitPrice ?? 0
                ),
                capitalPrice: Number(it.capitalPrice ?? it.costPrice ?? 0),
                quantity: Number(it.quantity ?? 1),
                currentStock: Number(it.currentStock ?? 0),
              })
            );
            return {
              id: d.id,
              label: d.label,
              createdAt: d.parkedAt,
              items: rawItems,
              discount: Number(d.discount),
              customerName: d.note || undefined,
              note: d.note || undefined,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        callbacks.onParkedCarts(list);
        callbacks.onSyncActivity();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pos_parked_carts')
    );
    unsubs.push(unsubParked);
  })();

  return () => {
    unmounted = true;
    unsubs.forEach((fn) => fn());
  };
}
