import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Smartphone,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { isValidDeviceAccessPassword } from '../utils/posLogic';
import { PosDeviceRecord } from '../services/cloudSync';

interface DeviceSecurityGateProps {
  storeName: string;
  deviceId: string;
  initialDeviceName: string;
  userAgent: string;
  gateStep: 'PASSWORD' | 'PENDING_CONFIRMATION' | 'REJECTED';
  isSubmitting: boolean;
  onSubmitPasswordRequest: (deviceName: string) => Promise<void>;
  onOwnerDirectApproveSelf: (deviceName: string) => Promise<void>;
  onOwnerGoogleApproveSelf: (deviceName: string) => Promise<void>;
  onRetryCheckStatus: () => Promise<void>;
  onResetToPasswordStep: () => void;
}

export const DeviceSecurityGate: React.FC<DeviceSecurityGateProps> = ({
  storeName,
  deviceId,
  initialDeviceName,
  userAgent,
  gateStep,
  isSubmitting,
  onSubmitPasswordRequest,
  onOwnerDirectApproveSelf,
  onOwnerGoogleApproveSelf,
  onRetryCheckStatus,
  onResetToPasswordStep,
}) => {
  const [deviceName, setDeviceName] = useState(initialDeviceName);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showOwnerOverride, setShowOwnerOverride] = useState(false);
  const [ownerConfirmPass, setOwnerConfirmPass] = useState('');
  const [ownerOverrideError, setOwnerOverrideError] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!deviceName.trim()) {
      setErrorMsg('Please enter a name for this device (e.g., Store PC, Cashier Phone).');
      return;
    }

    if (!isValidDeviceAccessPassword(password)) {
      setErrorMsg('Incorrect store password. Access requires the valid store password.');
      return;
    }

    await onSubmitPasswordRequest(deviceName.trim());
  };

  const handleOwnerPassOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnerOverrideError(null);
    if (!isValidDeviceAccessPassword(ownerConfirmPass)) {
      setOwnerOverrideError('Invalid owner confirmation password.');
      return;
    }
    await onOwnerDirectApproveSelf(deviceName.trim() || initialDeviceName);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 text-slate-900">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Security Header */}
        <div className="bg-slate-950 text-white px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">
                {storeName || 'Four Gifts Store POS'}
              </h1>
              <p className="text-xs text-slate-400">
                New Device Security Gate · Password &amp; Owner Confirmation
              </p>
            </div>
          </div>
        </div>

        {/* Step 1: Password Gate */}
        {gateStep === 'PASSWORD' && (
          <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                  <span>Step 1 of 2: Unrecognized Device</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {deviceId.slice(0, 16)}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Every new device opening this POS requires the store password and owner confirmation before accessing store records.
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="device-label-input"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Device Name / Label
              </label>
              <input
                id="device-label-input"
                type="text"
                required
                maxLength={80}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g., Owner PC, Cashier Phone, Counter Tablet"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="device-password-input"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Store Access Password
              </label>
              <div className="relative">
                <input
                  id="device-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter store access password"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Verifying & Requesting Access...' : 'Verify Password & Request Confirmation'}
              </span>
            </button>
          </form>
        )}

        {/* Step 2: Waiting for Live Owner Confirmation */}
        {gateStep === 'PENDING_CONFIRMATION' && (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Clock className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                <span>Step 2 of 2: Waiting for Owner Confirmation</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Password verified! A live confirmation alert has been sent to your approved owner device. Click{' '}
                <strong className="font-bold">&ldquo;Confirm &amp; Allow Device&rdquo;</strong> on your primary PC or phone to unlock this screen immediately.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Device Name:</span>
                <span className="font-bold text-slate-900">{deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Device ID:</span>
                <span className="font-mono text-slate-700">{deviceId}</span>
              </div>
              {userAgent && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 font-medium shrink-0">Browser:</span>
                  <span className="text-slate-600 truncate text-right">{userAgent}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRetryCheckStatus}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Check Confirmation Status Now</span>
              </button>
              <button
                type="button"
                onClick={onResetToPasswordStep}
                className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Back
              </button>
            </div>

            {/* Owner Self-Confirm Fallback (in case the owner is opening this device themselves) */}
            <div className="pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowOwnerOverride((prev) => !prev)}
                className="w-full text-left text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center justify-between py-1"
              >
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  <span>Are you the Store Owner opening this device yourself?</span>
                </span>
                <span className="text-[11px] underline">
                  {showOwnerOverride ? 'Hide' : 'Confirm Here'}
                </span>
              </button>

              {showOwnerOverride && (
                <div className="mt-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <p className="text-xs text-slate-600">
                    If your other approved PC/phone is not nearby, you can confirm this device directly as the store owner:
                  </p>

                  {ownerOverrideError && (
                    <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                      {ownerOverrideError}
                    </div>
                  )}

                  <form onSubmit={handleOwnerPassOverride} className="space-y-2">
                    <label
                      htmlFor="owner-override-password-input"
                      className="block text-[11px] font-bold text-slate-700"
                    >
                      Re-enter Owner Password to Confirm This Device
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="owner-override-password-input"
                        type="password"
                        value={ownerConfirmPass}
                        onChange={(e) => setOwnerConfirmPass(e.target.value)}
                        placeholder="Owner password"
                        className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        Confirm Device
                      </button>
                    </div>
                  </form>

                  <button
                    type="button"
                    onClick={() => onOwnerGoogleApproveSelf(deviceName.trim() || initialDeviceName)}
                    disabled={isSubmitting}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Or Confirm with Owner Google Account
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rejected State */}
        {gateStep === 'REJECTED' && (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
              <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span>Device Access Denied by Store Owner</span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                The store owner declined or revoked access for this device ({deviceName}). You cannot view or modify POS records without owner approval.
              </p>
            </div>

            <button
              type="button"
              onClick={onResetToPasswordStep}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Return to Password Screen &amp; Request Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface PendingDeviceApprovalBannerProps {
  pendingDevices: PosDeviceRecord[];
  onApproveDevice: (device: PosDeviceRecord) => Promise<void>;
  onRejectDevice: (device: PosDeviceRecord) => Promise<void>;
}

export const PendingDeviceApprovalBanner: React.FC<
  PendingDeviceApprovalBannerProps
> = ({ pendingDevices, onApproveDevice, onRejectDevice }) => {
  if (pendingDevices.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="New Device Access Requests"
      className="no-print bg-amber-500 text-slate-950 border-b border-amber-600 px-4 sm:px-6 py-3 shadow-md"
    >
      <div className="max-w-[1440px] mx-auto flex flex-col gap-2.5">
        {pendingDevices.map((dev) => (
          <div
            key={dev.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/95 backdrop-blur rounded-xl px-4 py-2.5 border border-amber-700/20 shadow-sm"
          >
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <Smartphone className="w-4 h-4 text-amber-800" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                    New Device Confirmation Needed
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {dev.deviceName}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    ({dev.id.slice(0, 14)})
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Entered valid store password · Waiting for your confirmation to access Four Gifts Store POS.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onApproveDevice(dev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm &amp; Allow Device</span>
              </button>
              <button
                type="button"
                onClick={() => onRejectDevice(dev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Deny / Block</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
