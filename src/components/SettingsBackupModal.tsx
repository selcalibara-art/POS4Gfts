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
  LogOut,
} from 'lucide-react';
import {
  Product,
  SaleTransaction,
  StoreSettings,
  UtangPaymentTransaction,
} from '../types/pos';

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
  cloudUserEmail,
  cloudSyncState = 'LOCAL_ONLY',
  lastSavedTime,
  onSignInCloud,
  onSignOutCloud,
  onSyncCloudNow,
}) => {
  const [formState, setFormState] = useState<StoreSettings>(settings);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formState);
    setStatusMessage('Store & thermal printer settings auto-saved.');
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
        setStatusMessage('Backup restored and auto-saved!');
      } catch {
        setStatusMessage('Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-slate-700" />
            <h2 id="settings-modal-title" className="text-base font-bold text-slate-900">
              Receipt, Thermal Printer & Cloud Auto-Save Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings Modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-6">
          {statusMessage && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Free Cloud Auto-Save Card */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-700 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900">
                  Automatic Multi-Device Cloud Auto-Save (Always On)
                </h3>
              </div>
              <p className="text-xs text-slate-700">
                <span className="text-emerald-700 font-semibold">
                  {cloudSyncState === 'SYNCING'
                    ? 'Saving latest changes to Firebase Cloud...'
                    : `Saved to Cloud (${lastSavedTime || 'active'})`}
                </span>{' '}
                · Every sale, product, Utang record, and shift automatically syncs across all your PCs, phones, and tablets.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onSyncCloudNow && (
                <button
                  type="button"
                  onClick={() => {
                    onSyncCloudNow();
                    setStatusMessage('Synced all POS records to Firebase Cloud.');
                    setTimeout(() => setStatusMessage(null), 3000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync Cloud Now</span>
                </button>
              )}
            </div>
          </div>

          {/* Store & Receipt Header Configuration */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="store-name-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="store-contact-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="store-subtitle-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="store-address-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="store-footer-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Thermal Printer Paper Width
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormState({ ...formState, paperSize: '58mm' })}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                      formState.paperSize === '58mm'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    58mm Roll (Standard Mini)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormState({ ...formState, paperSize: '80mm' })}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                      formState.paperSize === '80mm'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    80mm Roll (Wide Desktop)
                  </button>
                </div>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formState.autoPrint}
                    onChange={(e) =>
                      setFormState({ ...formState, autoPrint: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Auto-trigger browser print dialog after checkout
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Save Store & Printer Settings
              </button>
            </div>
          </form>

          <hr className="border-slate-200" />

          {/* LocalStorage Backup & Restore Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Offline Data Backup & Restore
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Export all products, sales history, and Utang ledger records to a file or restore from a previous backup.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportJSON}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Export Backup (.json)</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
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
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Restore Backup (.json)</span>
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-red-700 hover:bg-red-50 border border-red-200 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ml-auto"
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
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
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
