import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
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
import { INITIAL_PRODUCTS, detectReadableDeviceName } from '../utils/posLogic';

export const SHARED_STORE_OWNER_ID = 'four_gifts_store_main';

export const CLOUD_STORAGE_KEYS = {
  LAST_SYNC: 'fgs_pos_last_sync_v1',
  LOCAL_CUSTOMIZED: 'fgs_pos_local_customized_v1',
  GAS_WEBHOOK_URL: 'fgs_pos_gas_webhook_url_v1',
};

export const DEVICE_STORAGE_KEYS = {
  DEVICE_ID: 'fgs_pos_device_id_v1',
  DEVICE_NAME: 'fgs_pos_device_name_v1',
  DEVICE_APPROVED: 'fgs_pos_device_approved_v1',
};

export type DeviceAccessStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PosDeviceRecord {
  id: string;
  deviceName: string;
  userAgent: string;
  status: DeviceAccessStatus;
  requestedAt: string;
  approvedBy: string;
  updatedAt: string;
}

export function getOrCreateLocalDeviceIdentity(): {
  deviceId: string;
  deviceName: string;
  userAgent: string;
} {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 220) : '';
  const defaultName = detectReadableDeviceName(ua);

  let deviceId = '';
  let deviceName = defaultName;
  try {
    deviceId = localStorage.getItem(DEVICE_STORAGE_KEYS.DEVICE_ID) || '';
    if (!deviceId) {
      deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    const savedName = localStorage.getItem(DEVICE_STORAGE_KEYS.DEVICE_NAME);
    if (savedName && savedName.trim()) {
      deviceName = savedName.trim();
    } else {
      localStorage.setItem(DEVICE_STORAGE_KEYS.DEVICE_NAME, defaultName);
    }
  } catch {
    deviceId = `dev_session_${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    deviceId: sanitizeSafeId(deviceId, 80),
    deviceName: clampString(deviceName, 120, defaultName) || defaultName,
    userAgent: clampString(ua, 240),
  };
}

/**
 * Strips verbose parenthetical timezone suffixes (e.g.
 * "Sat Oct 17 2026 00:00:00 GMT+0800 (Standard na Oras sa Singapore)")
 * and normalizes date strings cleanly.
 */
export function sanitizeLocaleDateString(raw: string | undefined | null, fallbackIso?: string): string {
  if (!raw) return fallbackIso || new Date().toISOString();
  const stripped = String(raw).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stripped)) {
    return stripped;
  }
  const parsed = new Date(stripped);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return stripped || fallbackIso || new Date().toISOString();
}

export function normalizeDayKeyString(raw: string | undefined | null): string {
  if (!raw) return toLocalDayKey(new Date());
  const stripped = String(raw).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stripped)) {
    return stripped;
  }
  const parsed = new Date(stripped);
  return toLocalDayKey(parsed);
}

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

async function fetchDocFresh(ref: ReturnType<typeof doc>) {
  try {
    return await getDocFromServer(ref);
  } catch {
    return await getDoc(ref);
  }
}

async function fetchDocsFresh(q: ReturnType<typeof query>) {
  try {
    return await getDocsFromServer(q);
  } catch {
    return await getDocs(q);
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

/**
 * Detects whether a store state is still the untouched default 6-product + 7-day sample simulation.
 * Used by the Empty-Overwrite & First-Boot Customization Guard so a device with real user changes
 * always pushes its data over default sample simulation data.
 */
export function isUntouchedDefaultSimulation(state: FullStoreState): boolean {
  if (state.parkedCarts.length > 0) return false;

  // Check if products match INITIAL_PRODUCTS (same 6 barcodes and names/prices)
  if (state.products.length !== INITIAL_PRODUCTS.length) return false;
  const sortedLocal = [...state.products].sort((a, b) => a.barcode.localeCompare(b.barcode));
  const sortedInit = [...INITIAL_PRODUCTS].sort((a, b) => a.barcode.localeCompare(b.barcode));
  for (let i = 0; i < sortedInit.length; i++) {
    if (
      sortedLocal[i].barcode !== sortedInit[i].barcode ||
      sortedLocal[i].name !== sortedInit[i].name ||
      Number(sortedLocal[i].sellingPrice) !== Number(sortedInit[i].sellingPrice) ||
      Number(sortedLocal[i].capitalPrice) !== Number(sortedInit[i].capitalPrice) ||
      Number(sortedLocal[i].stock) !== Number(sortedInit[i].stock)
    ) {
      return false;
    }
  }

  // Check if any sale was created by the user (non-simulation ID) or if sales count differs from default 15
  if (state.sales.length !== 15) return false;
  if (state.sales.some((s) => !String(s.id).startsWith('sim-sale-'))) return false;
  // In default simulation, only sim-sale-8 is voided
  const voidedIds = state.sales.filter((s) => s.voided).map((s) => s.id);
  if (voidedIds.length !== 1 || voidedIds[0] !== 'sim-sale-8') return false;

  if (state.utangPayments.length !== 3) return false;
  if (state.utangPayments.some((u) => !String(u.id).startsWith('sim-utgpay-'))) return false;

  if (state.adjustments.length !== 3) return false;
  if (state.adjustments.some((a) => !String(a.id).startsWith('sim-adj-'))) return false;

  return true;
}

/**
 * Creates a deterministic canonical JSON signature for Deep-Equality Diffing (JSON.stringify comparison)
 * so background polling only updates React state and shows the toast when a real data change occurred.
 */
export function createCanonicalStateSignature(state: FullStoreState): string {
  const canonical = {
    settings: {
      storeName: String(state.settings.storeName || '').trim(),
      subtitle: String(state.settings.subtitle || '').trim(),
      address: String(state.settings.address || '').trim(),
      contactNumber: String(state.settings.contactNumber || '').trim(),
      footerMessage: String(state.settings.footerMessage || '').trim(),
      paperSize: state.settings.paperSize === '80mm' ? '80mm' : '58mm',
      autoPrint: Boolean(state.settings.autoPrint),
    },
    products: [...state.products]
      .map((p) => ({
        id: sanitizeSafeId(p.id, 100),
        barcode: String(p.barcode || '').trim(),
        name: String(p.name || '').trim(),
        category: String(p.category || '').trim(),
        capitalPrice: Number(p.capitalPrice || 0),
        sellingPrice: Number(p.sellingPrice || 0),
        stock: Number(p.stock || 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    sales: [...state.sales]
      .map((s) => ({
        id: sanitizeSafeId(s.id, 100),
        receiptNo: String(s.receiptNo || '').trim(),
        grandTotal: Number(s.grandTotal || 0),
        subtotal: Number(s.subtotal || 0),
        discount: Number(s.discount || 0),
        paymentType: s.paymentType,
        amountTendered: Number(s.amountTendered || 0),
        utangAmount: Number(s.utangAmount || 0),
        customerName: String(s.customerName || '').trim(),
        voided: Boolean(s.voided),
        totalItems: Number(s.totalItems || 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    utangPayments: [...state.utangPayments]
      .map((u) => ({
        id: sanitizeSafeId(u.id, 100),
        receiptNo: String(u.receiptNo || '').trim(),
        customerName: String(u.customerName || '').trim(),
        paymentMethod: u.paymentMethod,
        amountPaid: Number(u.amountPaid || 0),
        remainingBalance: Number(u.remainingBalance || 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    shifts: [...state.shifts]
      .map((sh) => ({
        dateKey: normalizeDayKeyString(sh.dateKey),
        openingFloat: Number(sh.openingFloat || 0),
        actualClosingCashCounted:
          sh.actualClosingCashCounted !== undefined
            ? Number(sh.actualClosingCashCounted)
            : null,
        closingNote: String(sh.closingNote || '').trim(),
      }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    adjustments: [...state.adjustments]
      .map((adj) => ({
        id: sanitizeSafeId(adj.id, 100),
        type: adj.type,
        amount: Number(adj.amount || 0),
        reason: String(adj.reason || '').trim(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    parkedCarts: [...state.parkedCarts]
      .map((pk) => ({
        id: sanitizeSafeId(pk.id, 100),
        label: String(pk.label || '').trim(),
        discount: Number(pk.discount || 0),
        itemCount: (pk.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  return JSON.stringify(canonical);
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
  const safeId = sanitizeSafeId(product.id, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_products/${docId}`;
  const ref = doc(db, 'pos_products', docId);
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
  const safeId = sanitizeSafeId(productId, 100);
  const docId = makeCloudDocId(uid, safeId);
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
  const safeId = sanitizeSafeId(sale.id, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_sales/${docId}`;
  const ref = doc(db, 'pos_sales', docId);

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
          voidedAt: clampString(
            sanitizeLocaleDateString(sale.voidedAt),
            64
          ),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      await setDoc(ref, {
        ownerId: uid,
        id: safeId,
        receiptNo: clampString(sale.receiptNo, 64, '#FGS-0001') || '#FGS-0001',
        timestamp: clampString(
          sanitizeLocaleDateString(sale.createdAt),
          64,
          new Date().toISOString()
        ) || new Date().toISOString(),
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
        voidedAt: sale.voided
          ? clampString(sanitizeLocaleDateString(sale.voidedAt), 64)
          : '',
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
  const safeId = sanitizeSafeId(payment.id, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_utang_payments/${docId}`;
  const ref = doc(db, 'pos_utang_payments', docId);

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
        timestamp: clampString(
          sanitizeLocaleDateString(payment.createdAt),
          64,
          new Date().toISOString()
        ) || new Date().toISOString(),
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
  const validDayKey = normalizeDayKeyString(shift.dateKey);
  const docId = makeCloudDocId(uid, validDayKey);
  const path = `pos_shifts/${docId}`;
  const ref = doc(db, 'pos_shifts', docId);

  const isClosed = shift.actualClosingCashCounted !== undefined;
  const editableFields = {
    openingFloat: clampNumber(shift.openingFloat, 0, 10000000),
    openedAt: clampString(
      sanitizeLocaleDateString(shift.openedAt),
      64,
      new Date().toISOString()
    ) || new Date().toISOString(),
    status: isClosed ? 'CLOSED' : 'OPEN',
    closingCountedCash: clampNumber(shift.actualClosingCashCounted ?? 0, 0, 10000000),
    expectedCashAtClose: 0,
    variance: 0,
    closingNote: clampString(shift.closingNote, 200),
    closedAt: isClosed
      ? clampString(sanitizeLocaleDateString(shift.closedAt), 64)
      : '',
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
  const safeId = sanitizeSafeId(adj.id, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_adjustments/${docId}`;
  const ref = doc(db, 'pos_adjustments', docId);
  const validDayKey = normalizeDayKeyString(adj.createdAt);
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
        timestamp: clampString(
          sanitizeLocaleDateString(adj.createdAt),
          64,
          new Date().toISOString()
        ) || new Date().toISOString(),
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
  const safeId = sanitizeSafeId(adjustmentId, 100);
  const docId = makeCloudDocId(uid, safeId);
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
  const safeId = sanitizeSafeId(parked.id, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_parked_carts/${docId}`;
  const ref = doc(db, 'pos_parked_carts', docId);

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
        parkedAt: clampString(
          sanitizeLocaleDateString(parked.createdAt),
          64,
          new Date().toISOString()
        ) || new Date().toISOString(),
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
  const safeId = sanitizeSafeId(parkedId, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_parked_carts/${docId}`;
  const ref = doc(db, 'pos_parked_carts', docId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Optional Google Apps Script Web App Webhook Push (CORS preflight bypass via text/plain;charset=utf-8 + no-cors fallback)
 */
async function pushToGoogleAppsScriptWebhook(state: FullStoreState): Promise<void> {
  let scriptUrl = '';
  try {
    scriptUrl = (localStorage.getItem(CLOUD_STORAGE_KEYS.GAS_WEBHOOK_URL) || '').trim();
  } catch {
    return;
  }
  if (!scriptUrl || !scriptUrl.startsWith('https://script.google.com/')) return;

  const payload = JSON.stringify({
    action: 'SYNC_ALL',
    ...state,
    timestamp: new Date().toISOString(),
  });

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      redirect: 'follow',
    });
  } catch {
    try {
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
      });
    } catch {
      // ignore webhook network errors
    }
  }
}

/**
 * Write Pipeline: saveAllToCloud (syncFullStoreStateToCloud)
 * Reconciles the complete L1 store state into the L2 Cloud Store:
 * - Removes any deleted/orphan documents in Firestore that are no longer in `state`
 * - Upserts all current documents
 * - Touches `pos_settings/{uid}.updatedAt` last to notify all other connected devices
 */
let activeSaveChain: Promise<void> = Promise.resolve();

export function syncFullStoreStateToCloud(
  uid: string,
  state: FullStoreState,
  _replaceExisting = false
): Promise<void> {
  const runSave = async () => {
    const [
      existingProductsSnap,
      existingSalesSnap,
      existingUtangSnap,
      existingShiftsSnap,
      existingAdjustmentsSnap,
      existingParkedSnap,
    ] = await Promise.all([
      getDocs(query(collection(db, 'pos_products'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'pos_sales'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'pos_utang_payments'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'pos_shifts'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'pos_adjustments'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'pos_parked_carts'), where('ownerId', '==', uid))),
    ]);

    const wantedProductDocIds = new Set(
      state.products.map((p) => makeCloudDocId(uid, sanitizeSafeId(p.id, 100)))
    );
    const wantedSaleDocIds = new Set(
      state.sales.map((s) => makeCloudDocId(uid, sanitizeSafeId(s.id, 100)))
    );
    const wantedUtangDocIds = new Set(
      state.utangPayments.map((u) => makeCloudDocId(uid, sanitizeSafeId(u.id, 100)))
    );
    const wantedShiftDocIds = new Set(
      state.shifts.map((sh) => makeCloudDocId(uid, normalizeDayKeyString(sh.dateKey)))
    );
    const wantedAdjDocIds = new Set(
      state.adjustments.map((a) => makeCloudDocId(uid, sanitizeSafeId(a.id, 100)))
    );
    const wantedParkedDocIds = new Set(
      state.parkedCarts.map((pk) => makeCloudDocId(uid, sanitizeSafeId(pk.id, 100)))
    );

    const orphanDeletes: Promise<void>[] = [];
    existingProductsSnap.docs.forEach((d) => {
      if (!wantedProductDocIds.has(d.id)) orphanDeletes.push(deleteDoc(d.ref));
    });
    existingSalesSnap.docs.forEach((d) => {
      if (!wantedSaleDocIds.has(d.id)) orphanDeletes.push(deleteDoc(d.ref));
    });
    existingUtangSnap.docs.forEach((d) => {
      if (!wantedUtangDocIds.has(d.id)) orphanDeletes.push(deleteDoc(d.ref));
    });
    existingShiftsSnap.docs.forEach((d) => {
      if (!wantedShiftDocIds.has(d.id)) orphanDeletes.push(deleteDoc(d.ref));
    });
    existingAdjustmentsSnap.docs.forEach((d) => {
      if (!wantedAdjDocIds.has(d.id)) orphanDeletes.push(deleteDoc(d.ref));
    });
    existingParkedSnap.docs.forEach((d) => {
      if (!wantedParkedDocIds.has(d.id)) orphanDeletes.push(deleteDoc(d.ref));
    });

    if (orphanDeletes.length > 0) {
      await Promise.all(orphanDeletes);
    }

    // Upsert only changed or missing products
    const existingProductsMap = new Map(
      existingProductsSnap.docs.map((d) => [d.id, d.data()])
    );
    const productWrites = state.products.map(async (p) => {
      const safeId = sanitizeSafeId(p.id, 100);
      const docId = makeCloudDocId(uid, safeId);
      const existing = existingProductsMap.get(docId);
      const barcode = clampString(p.barcode, 64, safeId) || safeId;
      const name = clampString(p.name, 160, 'Unnamed Product') || 'Unnamed Product';
      const category = clampString(p.category, 80, 'General') || 'General';
      const costPrice = clampNumber(p.capitalPrice, 0, 10000000);
      const sellingPrice = clampNumber(p.sellingPrice, 0, 10000000);
      const stock = clampNumber(p.stock, -100000, 1000000);

      if (
        existing &&
        existing.barcode === barcode &&
        existing.name === name &&
        existing.category === category &&
        Number(existing.costPrice) === costPrice &&
        Number(existing.sellingPrice) === sellingPrice &&
        Number(existing.stock) === stock
      ) {
        return;
      }
      await saveProductToCloud(uid, p);
    });

    // Upsert only new or newly-voided sales
    const existingSalesMap = new Map(
      existingSalesSnap.docs.map((d) => [d.id, d.data()])
    );
    const saleWrites = state.sales.map(async (s) => {
      const safeId = sanitizeSafeId(s.id, 100);
      const docId = makeCloudDocId(uid, safeId);
      const existing = existingSalesMap.get(docId);
      const wantedStatus = s.voided ? 'VOIDED' : 'COMPLETED';
      if (existing && existing.status === wantedStatus) {
        return;
      }
      if (existing && existing.status === 'VOIDED' && wantedStatus === 'COMPLETED') {
        await deleteDoc(doc(db, 'pos_sales', docId));
      }
      await saveSaleToCloud(uid, s);
    });

    // Upsert only new or changed utang payments
    const existingUtangMap = new Map(
      existingUtangSnap.docs.map((d) => [d.id, d.data()])
    );
    const utangWrites = state.utangPayments.map(async (u) => {
      const safeId = sanitizeSafeId(u.id, 100);
      const docId = makeCloudDocId(uid, safeId);
      const existing = existingUtangMap.get(docId);
      if (
        existing &&
        Number(existing.amountPaid) === clampNumber(u.amountPaid, 0.01, 10000000) &&
        String(existing.note || '') === clampString(u.note, 200)
      ) {
        return;
      }
      await saveUtangPaymentToCloud(uid, u);
    });

    // Upsert only new or changed shifts
    const existingShiftsMap = new Map(
      existingShiftsSnap.docs.map((d) => [d.id, d.data()])
    );
    const shiftWrites = state.shifts.map(async (sh) => {
      const validDayKey = normalizeDayKeyString(sh.dateKey);
      const docId = makeCloudDocId(uid, validDayKey);
      const existing = existingShiftsMap.get(docId);
      const isClosed = sh.actualClosingCashCounted !== undefined;
      const status = isClosed ? 'CLOSED' : 'OPEN';
      const openingFloat = clampNumber(sh.openingFloat, 0, 10000000);
      const closingCountedCash = clampNumber(sh.actualClosingCashCounted ?? 0, 0, 10000000);
      if (
        existing &&
        Number(existing.openingFloat) === openingFloat &&
        existing.status === status &&
        Number(existing.closingCountedCash) === closingCountedCash &&
        String(existing.closingNote || '') === clampString(sh.closingNote, 200)
      ) {
        return;
      }
      await saveShiftToCloud(uid, sh);
    });

    // Upsert only new or changed adjustments
    const existingAdjMap = new Map(
      existingAdjustmentsSnap.docs.map((d) => [d.id, d.data()])
    );
    const adjWrites = state.adjustments.map(async (adj) => {
      const safeId = sanitizeSafeId(adj.id, 100);
      const docId = makeCloudDocId(uid, safeId);
      const existing = existingAdjMap.get(docId);
      const cloudType = adj.type === 'CASH_IN' ? 'CASH_IN' : 'CASH_OUT';
      if (
        existing &&
        existing.type === cloudType &&
        Number(existing.amount) === clampNumber(adj.amount, 0.01, 10000000) &&
        existing.reason === (clampString(adj.reason, 200, 'Store adjustment') || 'Store adjustment')
      ) {
        return;
      }
      await saveAdjustmentToCloud(uid, adj);
    });

    // Upsert parked carts
    const parkedWrites = state.parkedCarts.map((pk) => saveParkedCartToCloud(uid, pk));

    await Promise.all([
      ...productWrites,
      ...saleWrites,
      ...utangWrites,
      ...shiftWrites,
      ...adjWrites,
      ...parkedWrites,
    ]);

    // Commit settings & touch updatedAt last so listeners on other devices pull the completed state
    await saveSettingsToCloud(uid, state.settings);

    // Also push to optional Google Apps Script webhook if configured
    await pushToGoogleAppsScriptWebhook(state);

    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, nowIso);
    } catch {
      // ignore storage errors
    }
  };

  activeSaveChain = activeSaveChain.then(runSave, runSave);
  return activeSaveChain;
}

/**
 * Read & Reconciliation Pipeline: fetchStoreStateFromCloud (GET_ALL equivalent)
 * Pulls fresh authoritative documents directly from the server, normalizes locale dates,
 * and returns `{ isEmpty, state }`.
 */
export async function fetchStoreStateFromCloud(
  uid: string
): Promise<{ isEmpty: boolean; state: FullStoreState }> {
  const settingsRef = doc(db, 'pos_settings', uid);
  const [
    settingsSnap,
    productsSnap,
    salesSnap,
    utangSnap,
    shiftsSnap,
    adjustmentsSnap,
    parkedSnap,
  ] = await Promise.all([
    fetchDocFresh(settingsRef),
    fetchDocsFresh(query(collection(db, 'pos_products'), where('ownerId', '==', uid))),
    fetchDocsFresh(query(collection(db, 'pos_sales'), where('ownerId', '==', uid))),
    fetchDocsFresh(query(collection(db, 'pos_utang_payments'), where('ownerId', '==', uid))),
    fetchDocsFresh(query(collection(db, 'pos_shifts'), where('ownerId', '==', uid))),
    fetchDocsFresh(query(collection(db, 'pos_adjustments'), where('ownerId', '==', uid))),
    fetchDocsFresh(query(collection(db, 'pos_parked_carts'), where('ownerId', '==', uid))),
  ]);

  const isEmpty =
    !settingsSnap.exists() &&
    productsSnap.empty &&
    salesSnap.empty &&
    utangSnap.empty &&
    shiftsSnap.empty;

  const sData = settingsSnap.exists() ? (settingsSnap.data() as Record<string, unknown>) : {};
  const settings: StoreSettings = {
    storeName: String(sData.storeName || 'FOUR GIFTS STORE'),
    subtitle: String(sData.subtitle ?? 'Gifts, Wrappers, Toys & Everyday Essentials'),
    address: String(sData.address ?? 'Poblacion Market Road, Brgy. San Jose'),
    contactNumber: String(sData.contactPhone ?? '0917-555-0444'),
    footerMessage: String(sData.footerMessage ?? 'Thank you for shopping at Four Gifts Store!'),
    paperSize: sData.paperSize === '80mm' ? '80mm' : '58mm',
    autoPrint: sData.autoPrint !== undefined ? Boolean(sData.autoPrint) : true,
  };

  const products: Product[] = productsSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const ts = d.updatedAt as { toDate?: () => Date } | undefined;
      return {
        id: String(d.id || docSnap.id),
        barcode: String(d.barcode || ''),
        name: String(d.name || 'Unnamed Product'),
        category: String(d.category || 'General'),
        capitalPrice: Number(d.costPrice ?? 0),
        sellingPrice: Number(d.sellingPrice ?? 0),
        stock: Number(d.stock ?? 0),
        note: '',
        updatedAt: ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : '2026-01-01T00:00:00.000Z',
      };
    })
    .sort((a, b) => a.barcode.localeCompare(b.barcode));

  const sales: SaleTransaction[] = salesSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const isSplit = d.paymentType === 'SPLIT_CASH_UTANG';
      const mappedPaymentType =
        d.paymentType === 'GCASH'
          ? 'GCASH'
          : d.paymentType === 'UTANG'
          ? 'UTANG'
          : 'CASH';
      const grandTotal = Number(d.total ?? 0);
      const netProfit = Number(d.totalProfit ?? 0);
      const amountTendered = Number(d.amountTendered ?? 0);
      const utangAmount = Number(d.utangAmount ?? 0);
      const paidPortion = Math.max(0, grandTotal - utangAmount);
      const cashCollected =
        mappedPaymentType === 'CASH' ||
        (mappedPaymentType === 'UTANG' && amountTendered > 0)
          ? paidPortion
          : 0;
      const gcashCollected = mappedPaymentType === 'GCASH' ? paidPortion : 0;

      const rawItems: CartItem[] = ((d.items as Record<string, unknown>[]) || []).map(
        (it) => ({
          productId: String(it.productId || 'p_item'),
          barcode: String(it.barcode || '0000'),
          name: String(it.name || 'Item'),
          category: String(it.category || 'Gifts'),
          unitPrice: Number(it.unitPrice ?? 0),
          originalSellingPrice: Number(it.originalSellingPrice ?? it.unitPrice ?? 0),
          capitalPrice: Number(it.capitalPrice ?? it.costPrice ?? 0),
          quantity: Number(it.quantity ?? 1),
          currentStock: Number(it.currentStock ?? 0),
        })
      );

      return {
        id: String(d.id || docSnap.id),
        receiptNo: String(d.receiptNo || '#FGS-0001'),
        createdAt: sanitizeLocaleDateString(String(d.timestamp || '')),
        items: rawItems,
        totalItems: Number(d.totalItems ?? 1),
        subtotal: Number(d.subtotal ?? grandTotal),
        discount: Number(d.discount ?? 0),
        grandTotal,
        totalCapital: Math.max(0, grandTotal - netProfit),
        netProfit,
        paymentType: mappedPaymentType,
        amountTendered,
        cashCollected,
        gcashCollected,
        changeGiven: Number(d.change ?? 0),
        utangAmount,
        splitToUtang: isSplit,
        customerName: d.customerName ? String(d.customerName) : undefined,
        gcashRefNo: d.gcashRef ? String(d.gcashRef) : undefined,
        dueDateOrNote: d.dueDateNote ? String(d.dueDateNote) : undefined,
        voided: d.status === 'VOIDED',
        voidedAt: d.voidedAt ? sanitizeLocaleDateString(String(d.voidedAt)) : undefined,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const utangPayments: UtangPaymentTransaction[] = utangSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      return {
        id: String(d.id || docSnap.id),
        receiptNo: String(d.receiptNo || '#UTG-0001'),
        createdAt: sanitizeLocaleDateString(String(d.timestamp || '')),
        customerName: String(d.customerName || 'Customer'),
        paymentMethod: d.paymentMethod === 'GCASH' ? 'GCASH' : 'CASH',
        gcashRefNo: d.gcashRef ? String(d.gcashRef) : undefined,
        previousBalance: Number(d.previousBalance ?? 0),
        amountPaid: Number(d.amountPaid ?? 0),
        remainingBalance: Number(d.remainingBalance ?? 0),
        note: d.note ? String(d.note) : undefined,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const shifts: DailyShiftRecord[] = shiftsSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      return {
        dateKey: normalizeDayKeyString(String(d.dayKey || '')),
        openingFloat: Number(d.openingFloat ?? 0),
        openedAt: sanitizeLocaleDateString(String(d.openedAt || '')),
        closedAt: d.closedAt ? sanitizeLocaleDateString(String(d.closedAt)) : undefined,
        actualClosingCashCounted:
          d.status === 'CLOSED' ? Number(d.closingCountedCash ?? 0) : undefined,
        closingNote: d.closingNote ? String(d.closingNote) : undefined,
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const adjustments: CashDrawerAdjustment[] = adjustmentsSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      return {
        id: String(d.id || docSnap.id),
        createdAt: sanitizeLocaleDateString(String(d.timestamp || '')),
        type: d.type === 'CASH_IN' ? 'CASH_IN' : 'EXPENSE_OUT',
        amount: Number(d.amount ?? 0),
        reason: String(d.reason || 'Store adjustment'),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const parkedCarts: ParkedCart[] = parkedSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const rawItems: CartItem[] = ((d.items as Record<string, unknown>[]) || []).map(
        (it) => ({
          productId: String(it.productId || 'p_item'),
          barcode: String(it.barcode || '0000'),
          name: String(it.name || 'Item'),
          category: String(it.category || 'Gifts'),
          unitPrice: Number(it.unitPrice ?? 0),
          originalSellingPrice: Number(it.originalSellingPrice ?? it.unitPrice ?? 0),
          capitalPrice: Number(it.capitalPrice ?? it.costPrice ?? 0),
          quantity: Number(it.quantity ?? 1),
          currentStock: Number(it.currentStock ?? 0),
        })
      );
      return {
        id: String(d.id || docSnap.id),
        label: String(d.label || 'Parked Cart'),
        createdAt: sanitizeLocaleDateString(String(d.parkedAt || '')),
        items: rawItems,
        discount: Number(d.discount ?? 0),
        customerName: d.note ? String(d.note) : undefined,
        note: d.note ? String(d.note) : undefined,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    isEmpty,
    state: {
      settings,
      products,
      sales,
      utangPayments,
      shifts,
      adjustments,
      parkedCarts,
    },
  };
}

/**
 * Subscribes to `pos_settings/{uid}` so any remote `saveAllToCloud` call triggers an immediate
 * callback on all other open devices within <1 second.
 */
export function subscribeToCloudPulse(
  uid: string,
  onPulse: () => void
): Unsubscribe {
  const settingsRef = doc(db, 'pos_settings', uid);
  let isInitial = true;
  return onSnapshot(
    settingsRef,
    () => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      onPulse();
    },
    () => {
      // ignore transient listener errors; polling & focus triggers provide fallback
    }
  );
}

/**
 * Device Security Gate Cloud Operations (`/pos_devices/{deviceId}`)
 */
function parseDeviceDoc(docSnap: { id: string; data: () => Record<string, unknown> }): PosDeviceRecord {
  const d = docSnap.data();
  const ts = d.updatedAt as { toDate?: () => Date } | undefined;
  const rawStatus = String(d.status || 'PENDING');
  const status: DeviceAccessStatus =
    rawStatus === 'APPROVED' || rawStatus === 'REJECTED' ? rawStatus : 'PENDING';
  return {
    id: String(d.id || docSnap.id),
    deviceName: String(d.deviceName || 'POS Device'),
    userAgent: String(d.userAgent || ''),
    status,
    requestedAt: sanitizeLocaleDateString(String(d.requestedAt || '')),
    approvedBy: String(d.approvedBy || ''),
    updatedAt:
      ts && typeof ts.toDate === 'function'
        ? ts.toDate().toISOString()
        : sanitizeLocaleDateString(String(d.requestedAt || '')),
  };
}

export async function fetchAllDevicesFromCloud(uid: string): Promise<PosDeviceRecord[]> {
  const q = query(collection(db, 'pos_devices'), where('ownerId', '==', uid));
  const snap = await fetchDocsFresh(q);
  return snap.docs
    .map((d) => parseDeviceDoc({ id: d.id, data: () => d.data() as Record<string, unknown> }))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export async function upsertDeviceRecordToCloud(
  uid: string,
  device: {
    id: string;
    deviceName: string;
    userAgent: string;
    status: DeviceAccessStatus;
    requestedAt: string;
    approvedBy: string;
  }
): Promise<void> {
  const safeId = sanitizeSafeId(device.id, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_devices/${docId}`;
  const ref = doc(db, 'pos_devices', docId);
  const editableFields = {
    deviceName: clampString(device.deviceName, 120, 'POS Device') || 'POS Device',
    userAgent: clampString(device.userAgent, 240),
    status:
      device.status === 'APPROVED' || device.status === 'REJECTED'
        ? device.status
        : ('PENDING' as const),
    requestedAt:
      clampString(
        sanitizeLocaleDateString(device.requestedAt),
        64,
        new Date().toISOString()
      ) || new Date().toISOString(),
    approvedBy: clampString(device.approvedBy, 120),
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

export async function deleteDeviceFromCloud(uid: string, deviceId: string): Promise<void> {
  const safeId = sanitizeSafeId(deviceId, 100);
  const docId = makeCloudDocId(uid, safeId);
  const path = `pos_devices/${docId}`;
  const ref = doc(db, 'pos_devices', docId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToDevicesInCloud(
  uid: string,
  onDevicesChanged: (devices: PosDeviceRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'pos_devices'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => parseDeviceDoc({ id: d.id, data: () => d.data() as Record<string, unknown> }))
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      onDevicesChanged(list);
    },
    () => {
      // ignore transient errors; fallback polling handles updates
    }
  );
}

