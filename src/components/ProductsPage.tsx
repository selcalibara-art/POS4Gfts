import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  PackagePlus,
  AlertTriangle,
  Wand2,
  X,
} from 'lucide-react';
import { Product } from '../types/pos';
import {
  calculateProductProfit,
  findDuplicateBarcode,
  formatPHP,
  generateNextSku,
} from '../utils/posLogic';

interface ProductsPageProps {
  products: Product[];
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onRestockProduct: (productId: string, addQty: number) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({
  products,
  onSaveProduct,
  onDeleteProduct,
  onRestockProduct,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showCapitalAndProfit, setShowCapitalAndProfit] = useState(false);

  // Add / Edit Product Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Gift Items');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [sellingPriceStr, setSellingPriceStr] = useState('15.00');
  const [capitalPriceStr, setCapitalPriceStr] = useState('10.00');
  const [stockStr, setStockStr] = useState('20');
  const [note, setNote] = useState('');

  // Quick Restock Modal State
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);
  const [restockQtyStr, setRestockQtyStr] = useState('10');

  const categories = useMemo(() => {
    const base = [
      'Gift Items',
      'Wrappers',
      'Toys',
      'Snacks',
      'School Supplies',
    ];
    for (const p of products) {
      if (p.category && !base.includes(p.category)) {
        base.push(p.category);
      }
    }
    return base;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, categoryFilter]);

  const openAddProductModal = () => {
    setEditingProductId(null);
    setBarcode('');
    setName('');
    setCategory('Gift Items');
    setCustomCategory('');
    setIsCustomCategory(false);
    setSellingPriceStr('15.00');
    setCapitalPriceStr('10.00');
    setStockStr('25');
    setNote('');
    setIsProductModalOpen(true);
  };

  const loadProductIntoForm = (product: Product) => {
    setEditingProductId(product.id);
    setBarcode(product.barcode);
    setName(product.name);
    setCategory(product.category);
    setIsCustomCategory(false);
    setCustomCategory('');
    setSellingPriceStr(String(product.sellingPrice));
    setCapitalPriceStr(String(product.capitalPrice));
    setStockStr(String(product.stock));
    setNote(product.note || '');
    setIsProductModalOpen(true);
  };

  const duplicateProduct = useMemo(
    () => findDuplicateBarcode(products, barcode, editingProductId || undefined),
    [products, barcode, editingProductId]
  );

  const liveProfit = useMemo(
    () =>
      calculateProductProfit(
        parseFloat(sellingPriceStr) || 0,
        parseFloat(capitalPriceStr) || 0
      ),
    [sellingPriceStr, capitalPriceStr]
  );

  const handleProductFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateProduct) return; // Guarded by Duplicate Barcode Guard

    const finalCategory = isCustomCategory
      ? customCategory.trim() || 'Uncategorized'
      : category;

    const productPayload: Product = {
      id: editingProductId || `prod-${Date.now()}`,
      barcode: barcode.trim(),
      name: name.trim(),
      category: finalCategory,
      sellingPrice: Math.max(0, parseFloat(sellingPriceStr) || 0),
      capitalPrice: Math.max(0, parseFloat(capitalPriceStr) || 0),
      stock: Math.floor(parseFloat(stockStr) || 0),
      note: note.trim(),
      updatedAt: new Date().toISOString(),
    };

    onSaveProduct(productPayload);
    setIsProductModalOpen(false);
  };

  const handleConfirmRestock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    const qty = parseInt(restockQtyStr, 10);
    if (Number.isFinite(qty) && qty !== 0) {
      onRestockProduct(restockTarget.id, qty);
    }
    setRestockTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openAddProductModal}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#181818] hover:bg-[#272727] text-white text-sm leading-5 font-semibold rounded-xl whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>(+) Add Product</span>
          </button>

          {/* Search Input */}
          <div className="relative min-w-[240px] sm:w-80">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Name, Barcode, Type, or Note..."
              aria-label="Filter products by Name, Barcode, Type, or Note"
              className="w-full pl-9 pr-3 py-2 text-sm leading-5 font-medium bg-[#F6F6F4] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
            />
          </div>

          {/* Category Filter Dropdown */}
          <select
            aria-label="Filter by product category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm leading-5 font-medium bg-[#F6F6F4] border border-neutral-300 rounded-xl text-[#181818] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
          >
            <option value="ALL">All Categories ({products.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Privacy Eye Toggle for Capital Price & Profit */}
        <button
          type="button"
          onClick={() => setShowCapitalAndProfit((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm leading-5 font-semibold text-neutral-700 bg-[#F6F6F4] hover:bg-neutral-200/80 border border-neutral-300 rounded-xl whitespace-nowrap"
        >
          {showCapitalAndProfit ? (
            <>
              <EyeOff className="w-4 h-4 text-neutral-700" />
              <span>Hide Capital &amp; Profit</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 text-neutral-700" />
              <span>Show Capital &amp; Profit</span>
            </>
          )}
        </button>
      </div>

      {/* Product List Table */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-[#F6F6F4]/70 text-xs leading-4 font-medium text-neutral-500">
                <th className="py-3 px-4 sm:px-6">Product Name</th>
                <th className="py-3 px-3">Barcode</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-4 text-right">Selling Price</th>
                <th className="py-3 px-3 text-right">Capital Price</th>
                <th className="py-3 px-3 text-right">Profit</th>
                <th className="py-3 px-3 text-right">Stock Left</th>
                <th className="py-3 px-4">Note</th>
                <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/80">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 px-6 text-center text-sm leading-5 font-normal text-neutral-500"
                  >
                    No products match your current filter. Click "(+) Add Product" to add inventory.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const profitInfo = calculateProductProfit(
                    product.sellingPrice,
                    product.capitalPrice
                  );
                  const isLowStock = product.stock <= 5;
                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-[#F6F6F4]/60 transition-colors"
                    >
                      <td className="py-4 px-4 sm:px-6 text-base leading-6 font-semibold text-[#181818]">
                        {product.name}
                      </td>
                      <td className="py-4 px-3 font-mono text-xs leading-4 font-medium text-neutral-600">
                        {product.barcode}
                      </td>
                      <td className="py-4 px-3 text-sm leading-5 font-medium text-neutral-600">
                        {product.category}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-base leading-6 font-semibold tabular-nums text-[#181818]">
                        {formatPHP(product.sellingPrice)}
                      </td>
                      <td className="py-4 px-3 text-right font-mono text-sm leading-5 font-medium tabular-nums text-neutral-600">
                        {showCapitalAndProfit
                          ? formatPHP(product.capitalPrice)
                          : '••••'}
                      </td>
                      <td className="py-4 px-3 text-right font-mono text-sm leading-5 font-semibold tabular-nums text-emerald-700">
                        {showCapitalAndProfit
                          ? `${formatPHP(profitInfo.unitProfit)} (${profitInfo.marginPercent}%)`
                          : '••••'}
                      </td>
                      <td className="py-4 px-3 text-right font-mono text-base leading-6 tabular-nums">
                        <span
                          className={
                            isLowStock
                              ? 'text-red-600 font-semibold'
                              : 'text-[#181818] font-medium'
                          }
                        >
                          {product.stock}
                          {isLowStock ? ' (Low)' : ''}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs leading-4 font-normal text-neutral-500 max-w-xs truncate">
                        {product.note || '—'}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRestockTarget(product);
                              setRestockQtyStr('12');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs leading-4 font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
                          >
                            <PackagePlus className="w-4 h-4" />
                            <span>+ Restock</span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit ${product.name}`}
                            onClick={() => loadProductIntoForm(product)}
                            className="p-2 text-neutral-600 hover:text-[#181818] hover:bg-neutral-100 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${product.name}`}
                            onClick={() => onDeleteProduct(product.id)}
                            className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isProductModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-[#F6F6F4]/70">
              <h2
                id="product-modal-title"
                className="text-xl leading-7 font-semibold text-[#181818]"
              >
                {editingProductId ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                aria-label="Close Product Modal"
                className="p-2 text-neutral-500 hover:text-[#181818] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProductFormSubmit} className="p-6 space-y-4">
              {/* 1. Barcode / SKU + Auto-Generate SKU + Duplicate Guard */}
              <div>
                <label
                  htmlFor="product-barcode-input"
                  className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                >
                  1. Barcode / SKU *
                </label>
                <div className="flex gap-2">
                  <input
                    id="product-barcode-input"
                    type="text"
                    required
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan barcode or enter SKU..."
                    className="flex-1 px-3 py-2 font-mono text-base leading-6 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                  />
                  <button
                    type="button"
                    onClick={() => setBarcode(generateNextSku(products))}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs leading-4 font-semibold bg-[#F6F6F4] hover:bg-neutral-200 text-[#181818] border border-neutral-300 rounded-xl whitespace-nowrap"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>Auto-Generate SKU</span>
                  </button>
                </div>

                {/* Duplicate Barcode Guard */}
                {duplicateProduct && (
                  <div className="mt-3 p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                    <div className="flex items-start gap-2 text-xs leading-4 font-semibold text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Duplicate Barcode Guard: Barcode{' '}
                        <strong className="font-mono">
                          {duplicateProduct.barcode}
                        </strong>{' '}
                        already exists for "{duplicateProduct.name}" (Stock:{' '}
                        {duplicateProduct.stock}).
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadProductIntoForm(duplicateProduct)}
                      className="px-3 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs leading-4 font-semibold rounded-lg"
                    >
                      Load Existing Product for Editing / Restocking
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Product Name */}
              <div>
                <label
                  htmlFor="product-name-input"
                  className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                >
                  2. Product Name *
                </label>
                <input
                  id="product-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Satin Ribbon Gift Bow (Large)"
                  className="w-full px-3 py-2 text-base leading-6 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              {/* 3. Type / Category */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="product-type-select"
                    className="block text-sm leading-5 font-semibold text-neutral-800"
                  >
                    3. Type (Category)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory((prev) => !prev)}
                    className="text-xs leading-4 font-semibold text-neutral-600 hover:text-[#181818] underline"
                  >
                    {isCustomCategory
                      ? 'Choose existing category'
                      : '+ Type custom category'}
                  </button>
                </div>
                {!isCustomCategory ? (
                  <select
                    id="product-type-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Enter new custom category (e.g. Party Balloons)..."
                    className="w-full px-3 py-2 text-sm leading-5 font-medium border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                  />
                )}
              </div>

              {/* 4 & 5. Selling Price & Capital Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="product-selling-price"
                    className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                  >
                    4. Selling Price (`price - selling` ₱) *
                  </label>
                  <input
                    id="product-selling-price"
                    type="number"
                    min="0"
                    step="0.25"
                    required
                    value={sellingPriceStr}
                    onChange={(e) => setSellingPriceStr(e.target.value)}
                    className="w-full px-3 py-2 font-mono text-base leading-6 font-semibold tabular-nums border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="product-capital-price"
                    className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                  >
                    5. Capital Price (`capital price` ₱) *
                  </label>
                  <input
                    id="product-capital-price"
                    type="number"
                    min="0"
                    step="0.25"
                    required
                    value={capitalPriceStr}
                    onChange={(e) => setCapitalPriceStr(e.target.value)}
                    className="w-full px-3 py-2 font-mono text-base leading-6 font-medium tabular-nums border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                  />
                </div>
              </div>

              {/* Validation warning if Selling Price < Capital Price & 6. Live Profit Summary */}
              {liveProfit.isBelowCapital ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs leading-4 font-semibold text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>
                    Warning: Selling Price is lower than Capital Price. Loss per unit:{' '}
                    {formatPHP(liveProfit.unitProfit)}
                  </span>
                </div>
              ) : (
                <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs leading-4 font-semibold text-emerald-900">
                  <span>Live Profit Calculation:</span>
                  <span className="font-mono text-sm leading-5 font-semibold tabular-nums">
                    Unit Profit: {formatPHP(liveProfit.unitProfit)} (
                    {liveProfit.marginPercent}% margin)
                  </span>
                </div>
              )}

              {/* 7. Current Stock Quantity */}
              <div>
                <label
                  htmlFor="product-stock-input"
                  className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                >
                  7. Current Stock Quantity *
                </label>
                <input
                  id="product-stock-input"
                  type="number"
                  step="1"
                  required
                  value={stockStr}
                  onChange={(e) => setStockStr(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-base leading-6 font-semibold tabular-nums border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              {/* 8. Note */}
              <div>
                <label
                  htmlFor="product-note-input"
                  className="block text-sm leading-5 font-semibold text-neutral-800 mb-2"
                >
                  8. Note (`note:`)
                </label>
                <textarea
                  id="product-note-input"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Supplier name, shelf location, or wholesale bundle details..."
                  className="w-full px-3 py-2 text-sm leading-5 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-3 py-2 text-sm leading-5 font-semibold text-neutral-600 hover:text-[#181818]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateProduct)}
                  className="px-4 py-2 bg-[#181818] hover:bg-[#272727] disabled:bg-neutral-300 text-white text-sm leading-5 font-semibold rounded-xl"
                >
                  {editingProductId ? 'Save Changes' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick + Restock Modal */}
      {restockTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818]/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restock-modal-title"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3
              id="restock-modal-title"
              className="text-lg leading-7 font-semibold text-[#181818]"
            >
              Restock: {restockTarget.name}
            </h3>
            <p className="text-xs leading-4 font-medium text-neutral-500 mt-1">
              Barcode #{restockTarget.barcode} · Current Stock:{' '}
              <strong className="font-mono font-semibold text-[#181818]">
                {restockTarget.stock}
              </strong>
            </p>

            <form onSubmit={handleConfirmRestock} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="restock-qty-input"
                  className="block text-sm leading-5 font-medium text-neutral-700 mb-2"
                >
                  Add Quantity to Stock
                </label>
                <input
                  id="restock-qty-input"
                  type="number"
                  min="1"
                  required
                  value={restockQtyStr}
                  onChange={(e) => setRestockQtyStr(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-xl leading-7 font-semibold tabular-nums border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#181818]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRestockTarget(null)}
                  className="px-3 py-2 text-sm leading-5 font-semibold text-neutral-600 hover:text-[#181818]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm leading-5 font-semibold rounded-xl"
                >
                  Confirm Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
