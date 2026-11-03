# Four Gifts Store POS

Production-grade, offline-capable Web Point of Sale (POS) application for **Four Gifts Store** using Philippine Peso (`₱ / PHP`), built with React 19, TypeScript, Tailwind CSS v4, and Firebase Cloud Firestore.

## Features
- **Fast Checkout Terminal**: USB/Bluetooth hardware barcode scanner engine (`<35ms` keystroke buffer), live SKU/name search, haggled unit price overrides, bulk discounts, and Hold/Park Cart support.
- **Cash, GCash & Utang (Store Credit) Checkout**: Instant change computation, quick PHP denomination buttons, split cash-to-Utang handling, and customer debt tracking.
- **58mm & 80mm Thermal Receipt Printing**: Print-isolated `@media print` layouts for Standard Sales Receipts, `*** UTANG / CREDIT SLIP ***`, `*** UTANG PAYMENT RECEIPT ***`, and `*** END-OF-DAY Z-READING ***`.
- **Daily Shift Register & Analytics**: Morning opening cash float (*Panukli*), petty cash expense logging, closing cash count variance reconciliation, and interactive Daily (7-Day) & Weekly (6-Week) sales/profit charts.
- **Automatic Local + Free Cloud Auto-Save**: Instant offline browser persistence backed by real-time Firebase Cloud Firestore synchronization.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Important Note When Hosting on a New Domain (GitHub Pages / Vercel / Netlify)
If you deploy this repository to a custom URL (such as `your-username.github.io` or `your-app.vercel.app`) and use **Google Sign-In for Cloud Auto-Save**:
1. Open the [Firebase Console](https://console.firebase.google.com/project/resonant-chariot-rlj64/authentication/settings).
2. Go to **Authentication → Settings → Authorized domains**.
3. Click **Add domain** and add your new live domain so Google Sign-In popups are permitted.
