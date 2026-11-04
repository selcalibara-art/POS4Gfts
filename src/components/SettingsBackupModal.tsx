import React, { useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  RotateCcw,
  Check,
  Printer,
  Cloud,
  RefreshCw,
  Fingerprint,
  Smartphone,
  Lock,
} from 'lucide-react';
import {
  Product,
  SaleTransaction,
  StoreSettings,
  UtangPaymentTransaction,
} from '../types/pos';
import { CLOUD_STORAGE_KEYS, PosDeviceRecord } from '../services/cloudSync';

interface SettingsBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StoreSettings;
  onSaveSettings: (newSettings: StoreSettings) => void;
  products: Product[];
  sales: SaleTransaction[];
  utangPayments: UtangPaymentTransaction[];
  onRestoreBackup: (data: {
    products: Product[];
    sales: SaleTransaction[];
    utangPayments: UtangPaymentTransaction[];
    settings?: StoreSettings;
  }) => void;
  onResetSampleData: () => void;
  cloudUserEmail?: string | null;
  cloudSyncState?: 'LOCAL_ONLY' | 'SYNCING' | 'CLOUD_SAVED' | 'ERROR';
  lastSavedTime?: string;
  onSignInCloud?: () => void;
  onSignOutCloud?: () => void;
  onSyncCloudNow?: () => void;
  onPullCloudNow?: () => void;
  currentDeviceId?: string;
  registeredDevices?: PosDeviceRecord[];
  onApproveDevice?: (device: PosDeviceRecord) => Promise<void>;
  onRejectDevice?: (device: PosDeviceRecord) => Promise<void>;
  onRemoveDevice?: (deviceId: string) => Promise<void>;
  onLockCurrentDevice?: () => void;
}

export const SettingsBackupModal: React.FC<SettingsBackupModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  products,
  sales,
  utangPayments,
  onRestoreBackup,
  onResetSampleData,
  cloudSyncState = 'CLOUD_SAVED',
  lastSavedTime,
  onSyncCloudNow,
  onPullCloudNow,
  currentDeviceId,
  registeredDevices = [],
  onApproveDevice,
  onRejectDevice,
  onRemoveDevice,
  onLockCurrentDevice,
}) => {
  const [formState, setFormState] = useState<StoreSettings>(settings);
  const [gasWebhookUrl, setGasWebhookUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(CLOUD_STORAGE_KEYS.GAS_WEBHOOK_URL) || '';
    } catch {
      return '';
    }
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(CLOUD_STORAGE_KEYS.GAS_WEBHOOK_URL, gasWebhookUrl.trim());
    } catch {
      // ignore storage errors
    }
    onSaveSettings(formState);
    setStatusMessage('Store & Cloud Auto-Save settings saved and pushed to Cloud.');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleExportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Four Gifts Store POS',
      settings: formState,
      products,
      sales,
      utangPayments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `four-gifts-store-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('JSON backup downloaded.');
  };

  const handleExportCSV = () => {
    const headers = [
      'Barcode',
      'Product Name',
      'Category',
      'Capital Price (PHP)',
      'Selling Price (PHP)',
      'Unit Profit (PHP)',
      'Current Stock',
      'Note',
    ];
    const rows = products.map((p) => [
      `"${p.barcode.replace(/"/g, '""')}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category.replace(/"/g, '""')}"`,
      p.capitalPrice.toFixed(2),
      p.sellingPrice.toFixed(2),
      (p.sellingPrice - p.capitalPrice).toFixed(2),
      String(p.stock),
      `"${(p.note || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `four-gifts-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Inventory CSV exported.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.products)) {
          setStatusMessage('Invalid backup file: missing products list.');
          return;
        }
        onRestoreBackup({
          products: parsed.products,
          sales: Array.isArray(parsed.sales) ? parsed.sales : [],
          utangPayments: Array.isArray(parsed.utangPayments)
            ? parsed.utangPayments
            : [],
          settings: parsed.settings,
        });
        if (parsed.settings) {
          setFormState(parsed.settings);
        }
        setStatusMessage('Backup restored and auto-saved to Cloud.');
      } catch {
        setStatusMessage('Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-white border border-neutral-200 rounded-2xl max-w-2xl w-full overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-[#F6F6F4]/70">
          <div className="flex items-center gap-3">
            <Printer className="w-5 h-5 text-[#181818]" />
            <h2
              id="settings-modal-title"
              className="text-base leading-6 font-semibold text-[#181818]"
            >
              Receipt, Thermal Printer &amp; Cloud Auto-Save Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings Modal"
            className="p-2 text-neutral-500 hover:text-[#181818] rounded-lg hover:bg-neutral-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-6">
          {statusMessage && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs leading-4 font-semibold text-emerald-800">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Dual-Tier L1 + L2 Cloud Auto-Save Card */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h3 className="text-sm leading-5 font-semibold text-[#181818]">
                    Dual-Tier L1 + L2 Cloud Auto-Save (Always On)
                  </h3>
                </div>
                <p className="text-xs leading-4 font-medium text-neutral-700">
                  <span className="text-emerald-700 font-semibold">
                    {cloudSyncState === 'SYNCING'
                      ? 'Syncing with Cloud Store...'
                      : cloudSyncState === 'ERROR'
                      ? 'Retrying Cloud Sync automatically...'
                      : `Synced to Cloud (${lastSavedTime || 'active'})`}
                  </span>{' '}
                  · Instant L1 Local Cache + Automatic L2 Cloud Push &amp; 4-Trigger Reconciliation across all PCs, phones, and tablets.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onSyncCloudNow && (
                  <button
                    type="button"
                    onClick={() => {
                      onSyncCloudNow();
                      setStatusMessage('Pushed this device state to Cloud Store.');
                      setTimeout(() => setStatusMessage(null), 3000);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs leading-4 font-semibold rounded-lg whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync Cloud Now</span>
                  </button>
                )}
                {onPullCloudNow && (
                  <button
                    type="button"
                    onClick={() => {
                      onPullCloudNow();
                      setStatusMessage('Pulled latest records from Cloud Store.');
                      setTimeout(() => setStatusMessage(null), 3000);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-neutral-50 text-[#181818] border border-emerald-300 text-xs leading-4 font-semibold rounded-lg whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Pull from Cloud</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Connected & Pending Devices (Password + Owner Confirmation Manager) */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-[#F6F6F4] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-[#181818] shrink-0" />
                  <h3 className="text-sm leading-5 font-semibold text-[#181818]">
                    Device Access &amp; Owner Confirmation Gate
                  </h3>
                </div>
                <p className="text-xs leading-4 font-medium text-neutral-600 mt-1">
                  New devices require store password{' '}
                  <code className="font-mono font-semibold text-[#181818]">
                    /Calibara0911
                  </code>{' '}
                  + Owner Confirmation before opening the POS.
                </p>
              </div>
              {onLockCurrentDevice && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLockCurrentDevice();
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-[#181818] hover:bg-[#272727] text-white text-xs leading-4 font-semibold rounded-lg whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock This Device</span>
                </button>
              )}
            </div>

            {registeredDevices.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {registeredDevices.map((dev) => {
                  const isThis = dev.id === currentDeviceId;
                  return (
                    <div
                      key={dev.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-xs leading-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <Smartphone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="font-semibold text-[#181818] truncate">
                          {dev.deviceName}
                        </span>
                        {isThis && (
                          <span className="px-2 py-0.5 rounded bg-[#181818] text-white text-xs leading-4 font-semibold shrink-0">
                            This Device
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-xs leading-4 font-semibold shrink-0 ${
                            dev.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : dev.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {dev.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {dev.status !== 'APPROVED' && onApproveDevice && (
                          <button
                            type="button"
                            onClick={() => void onApproveDevice(dev)}
                            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-md"
                          >
                            Confirm &amp; Allow
                          </button>
                        )}
                        {!isThis && dev.status === 'APPROVED' && onRejectDevice && (
                          <button
                            type="button"
                            onClick={() => void onRejectDevice(dev)}
                            className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-md"
                          >
                            Revoke Access
                          </button>
                        )}
                        {!isThis && dev.status === 'REJECTED' && onRemoveDevice && (
                          <button
                            type="button"
                            onClick={() => void onRemoveDevice(dev.id)}
                            className="px-2 py-1 text-neutral-500 hover:text-[#181818] font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Store & Receipt Header Configuration */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="store-name-input"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-1"
                >
                  Store Header Name
                </label>
                <input
                  id="store-name-input"
                  type="text"
                  required
                  value={formState.storeName}
                  onChange={(e) =>
                    setFormState({ ...formState, storeName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div>
                <label
                  htmlFor="store-contact-input"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-1"
                >
                  Contact / Phone #
                </label>
                <input
                  id="store-contact-input"
                  type="text"
                  value={formState.contactNumber}
                  onChange={(e) =>
                    setFormState({ ...formState, contactNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="store-subtitle-input"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-1"
                >
                  Store Tagline / Subtitle
                </label>
                <input
                  id="store-subtitle-input"
                  type="text"
                  value={formState.subtitle}
                  onChange={(e) =>
                    setFormState({ ...formState, subtitle: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div>
                <label
                  htmlFor="store-address-input"
                  className="block text-xs leading-4 font-medium text-neutral-700 mb-1"
                >
                  Store Address
                </label>
                <input
                  id="store-address-input"
                  type="text"
                  value={formState.address}
                  onChange={(e) =>
                    setFormState({ ...formState, address: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="store-footer-input"
                className="block text-xs leading-4 font-medium text-neutral-700 mb-1"
              >
                Receipt Footer Message
              </label>
              <input
                id="store-footer-input"
                type="text"
                value={formState.footerMessage}
                onChange={(e) =>
                  setFormState({ ...formState, footerMessage: e.target.value })
                }
                className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
              />
            </div>

            <div>
              <label
                htmlFor="gas-webhook-input"
                className="block text-xs leading-4 font-medium text-neutral-700 mb-1"
              >
                Optional Google Apps Script Web App URL (Secondary Google Sheet L2 Mirror)
              </label>
              <input
                id="gas-webhook-input"
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec (optional · Firebase Cloud is already active by default)"
                value={gasWebhookUrl}
                onChange={(e) => setGasWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs leading-4 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <span className="block text-xs leading-4 font-medium text-neutral-700 mb-1">
                  Thermal Printer Paper Width
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormState({ ...formState, paperSize: '58mm' })}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs leading-4 font-semibold border ${
                      formState.paperSize === '58mm'
                        ? 'bg-[#181818] text-white border-[#181818]'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    58mm Roll (Standard Mini)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormState({ ...formState, paperSize: '80mm' })}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs leading-4 font-semibold border ${
                      formState.paperSize === '80mm'
                        ? 'bg-[#181818] text-white border-[#181818]'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    80mm Roll (Wide Desktop)
                  </button>
                </div>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formState.autoPrint}
                    onChange={(e) =>
                      setFormState({ ...formState, autoPrint: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-neutral-300 text-[#181818] focus:ring-[#181818]"
                  />
                  <span className="text-xs leading-4 font-semibold text-neutral-800">
                    Auto-trigger browser print dialog after checkout
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-[#181818] hover:bg-[#272727] text-white text-sm leading-5 font-semibold rounded-xl"
              >
                Save Store &amp; Printer Settings
              </button>
            </div>
          </form>

          <hr className="border-neutral-200" />

          {/* LocalStorage Backup & Restore Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm leading-5 font-semibold text-[#181818]">
                Offline Data Backup &amp; Restore
              </h3>
              <p className="text-xs leading-4 font-medium text-neutral-600 mt-1">
                Export all products, sales history, and Utang ledger records to a file or restore from a previous backup.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="inline-flex items-center gap-2 px-3 py-2 bg-[#181818] hover:bg-[#272727] text-white text-xs leading-4 font-semibold rounded-xl whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Export Backup (.json)</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-neutral-50 text-[#181818] border border-neutral-300 text-xs leading-4 font-semibold rounded-xl whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Inventory (.csv)</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-neutral-50 text-[#181818] border border-neutral-300 text-xs leading-4 font-semibold rounded-xl whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Restore Backup (.json)</span>
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-red-700 hover:bg-red-50 border border-red-200 text-xs leading-4 font-semibold rounded-xl whitespace-nowrap ml-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Sample Data</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onResetSampleData();
                      setConfirmReset(false);
                      setStatusMessage('Reset to initial 6 sample products.');
                    }}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs leading-4 font-semibold rounded-xl whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-2 text-xs leading-4 font-medium text-neutral-600 hover:text-[#181818]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
