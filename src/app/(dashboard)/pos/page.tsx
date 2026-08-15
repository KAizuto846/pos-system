'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ShoppingCart, Plus, Minus, X, Trash2, Loader2, User, Percent, Fingerprint, ScanLine, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { usePosStore } from '@/store/pos-store';
import { formatCurrency, cn } from '@/lib/utils';
import { BarcodeScanner } from '@/components/BarcodeScanner';

interface Product {
  id: number;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  active: boolean;
  departmentId: number | null;
  supplierId: number | null;
  loyaltyDiscount?: boolean;
}

interface Customer {
  id: number;
  name: string;
  tier: string;
  purchaseCount: number;
}

interface Department {
  id: number;
  name: string;
}

interface PaymentMethod {
  id: number;
  name: string;
  affectsCash: boolean;
  active: boolean;
}

interface PaginatedResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface SaleTicket {
  id: number;
  total: number;
  discountTotal: number;
  taxBase?: number;
  taxAmount?: number;
  taxPercentage?: number;
  cashReceived?: number;
  change?: number;
  createdAt?: string;
  paymentMethod?: { name: string };
  user?: { name: string };
  items: {
    quantity: number;
    price: number;
    product: { name: string };
  }[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function PosPage() {
  const cart = usePosStore((state) => state.cart);
  const addItem = usePosStore((state) => state.addItem);
  const removeItem = usePosStore((state) => state.removeItem);
  const updateQuantity = usePosStore((state) => state.updateQuantity);
  const clearCart = usePosStore((state) => state.clearCart);
  const itemCount = usePosStore((state) => state.itemCount);

  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const productsAbortRef = useRef<AbortController | null>(null);
  const customersAbortRef = useRef<AbortController | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'code'>('name');
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [lastSale, setLastSale] = useState<SaleTicket | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Loyalty/customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [scanningFingerprint, setScanningFingerprint] = useState(false);

  // Camera barcode scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const handleScan = useCallback((code: string) => {
    setSearchMode('code');
    setSearchTerm(code);
    searchRef.current?.focus();
  }, []);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const LIMIT = 50;

  // Fetch products with pagination
  const fetchProducts = useCallback(async (query: string, pageNum: number, append: boolean) => {
    productsAbortRef.current?.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;

    await Promise.resolve();
    if (controller.signal.aborted) return;

    if (pageNum === 1) {
      setLoading(true);
      if (!append) setProducts([]);
    }
    else setLoadingMore(true);
    
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('view', 'pos');
      params.set('field', searchMode);
      if (selectedDepartmentId) params.set('departmentId', String(selectedDepartmentId));
      params.set('page', String(pageNum));
      params.set('limit', String(LIMIT));
      
      const res = await fetch(`/api/products?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Error al cargar productos');
      const data: PaginatedResponse = await res.json();
      
      if (data.products) {
        setProducts(prev => append ? [...prev, ...data.products] : data.products);
        setHasMore(data.pagination.hasMore);
        setTotal(data.pagination.total);
        setPage(pageNum);

        // Escáner de código de barras: si la búsqueda coincide EXACTAMENTE
        // con un código, el producto se agrega solo al carrito y se limpia
        // el campo para poder escanear el siguiente inmediatamente.
        const term = query.trim();
        if (!append && term) {
          const exact = data.products.find((p) => p.barcode === term);
          if (exact) {
            addItem({
              productId: exact.id,
              name: exact.name,
              barcode: exact.barcode,
              price: exact.price,
              stock: exact.stock,
            });
            setSearchTerm('');
            searchRef.current?.focus();
          }
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Error al cargar productos');
      }
    } finally {
      if (productsAbortRef.current === controller) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [addItem, setSearchTerm, searchMode, selectedDepartmentId]);

  useEffect(() => () => {
    productsAbortRef.current?.abort();
    customersAbortRef.current?.abort();
  }, []);

  // Initial load / search change resets to page 1
  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(debouncedSearch, 1, false), 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, fetchProducts]);

  // Infinite scroll
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handleScroll = () => {
      if (!hasMore || loadingMore || loading) return;
      const { scrollTop, scrollHeight, clientHeight } = grid;
      if (scrollHeight - scrollTop - clientHeight < 400) {
        fetchProducts(debouncedSearch, page + 1, true);
      }
    };

    grid.addEventListener('scroll', handleScroll);
    return () => grid.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loading, debouncedSearch, page, fetchProducts]);

  // Fetch payment methods
  useEffect(() => {
    fetch('/api/payment-methods')
      .then((res) => res.json())
      .then((data: PaymentMethod[]) => {
        if (Array.isArray(data)) {
          const active = data.filter((pm) => pm.active);
          setPaymentMethods(active);
          if (active.length > 0) {
            setSelectedPaymentMethodId(String(active[0].id));
          }
        }
      })
      .catch(() => toast.error('Error al cargar métodos de pago'));
  }, []);

  // Fetch departments for the filter chips
  useEffect(() => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data: Department[]) => {
        if (Array.isArray(data)) {
          setDepartments(data.filter((d) => d.name));
        }
      })
      .catch(() => {});
  }, []);

  // Escaneo de código de barras: agrega el producto y limpia el campo
  // para poder escanear el siguiente inmediatamente.
  const handleBarcodeScan = useCallback((product: Product) => {
    addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
    });
    setSearchTerm('');
    searchRef.current?.focus();
  }, [addItem, setSearchTerm]);

  // Keyboard shortcuts
  const count = itemCount();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (count > 0 && !checkoutOpen && !receiptOpen) {
          setCashReceived(null);
          setCheckoutOpen(true);
        }
      }
      if (e.key === 'Enter' && document.activeElement === searchRef.current) {
        const term = searchTerm.trim();
        if (term && products.length === 1) {
          e.preventDefault();
          handleBarcodeScan(products[0]);
        }
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, searchTerm, handleBarcodeScan, count, checkoutOpen, receiptOpen]);

  // Impuesto/recargo por horario: el servidor decide si esta activo
  const [taxState, setTaxState] = useState<{ active: boolean; percentage: number }>({ active: false, percentage: 0 });
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/tax/status')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (alive && data) setTaxState({ active: Boolean(data.active), percentage: Number(data.percentage) || 0 });
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const tx = (base: number): number => (taxState.active ? Math.ceil(base * (1 + taxState.percentage / 100)) : base);
  const taxedTotal = cart.reduce((sum, i) => sum + tx(i.price) * i.quantity, 0);

  const handleAddItem = (product: Product) => {
    addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
    });
  };

  // Loyalty: search customers
  useEffect(() => {
    customersAbortRef.current?.abort();
    const query = debouncedCustomerSearch.trim();
    if (query.length < 2 || selectedCustomer) {
      return;
    }

    const controller = new AbortController();
    customersAbortRef.current = controller;

    const searchCustomers = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setSearchingCustomer(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(query)}&limit=5`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Error al buscar clientes');
        const data = await res.json();
        setCustomerResults(data.customers || []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCustomerResults([]);
        }
      } finally {
        if (customersAbortRef.current === controller) setSearchingCustomer(false);
      }
    };
    searchCustomers();

    return () => controller.abort();
  }, [debouncedCustomerSearch, selectedCustomer]);

  // Loyalty: simulate fingerprint scan
  const handleFingerprintScan = async () => {
    setScanningFingerprint(true);
    try {
      const hash = 'simulado-' + Date.now();
      const res = await fetch('/api/customers/fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', fingerprintData: hash }),
      });
      const data = await res.json();
      if (data.found && data.customer) {
        setSelectedCustomer(data.customer);
        toast.success(`Cliente: ${data.customer.name} (${data.customer.tier})`);
      } else {
        toast.error('Huella no reconocida');
      }
    } catch { toast.error('Error al escanear huella'); }
    finally { setScanningFingerprint(false); }
  };

  // Loyalty: calculate discounts per product
  const getCustomerDiscount = (product: Product): number => {
    if (!selectedCustomer || !product.loyaltyDiscount) return 0;
    const margin = product.price - (product.cost || 0);
    if (margin <= 0) return 0;
    const tierPct = selectedCustomer.tier === 'gold' ? 33.33 : selectedCustomer.tier === 'silver' ? 20 : 10;
    const tierLimit = (margin * tierPct) / 100;
    const absoluteLimit = margin / 3;
    return Math.round((Math.min(tierLimit, absoluteLimit)) * 100) / 100;
  };

  // Loyalty: calculate total discount
  const loyaltyDiscount = cart.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    if (!product) return sum;
    return sum + getCustomerDiscount(product) * item.quantity;
  }, 0);

  const finalTotal = taxedTotal - loyaltyDiscount;

  // Efectivo recibido / cambio (solo aplica a metodos que afectan caja)
  const selectedPaymentMethod = paymentMethods.find(
    (pm) => String(pm.id) === selectedPaymentMethodId
  );
  const isCashMethod = selectedPaymentMethod?.affectsCash ?? true;
  const change = cashReceived !== null && isCashMethod
    ? Math.max(0, Math.round((cashReceived - finalTotal) * 100) / 100)
    : null;
  const hasEnoughCash = cashReceived !== null && cashReceived >= finalTotal;

  const handleCheckout = async () => {
    if (!selectedPaymentMethodId) {
      toast.error('Selecciona un metodo de pago');
      return;
    }

    if (isCashMethod && !hasEnoughCash) {
      toast.error('El efectivo recibido es insuficiente');
      return;
    }

    setCheckingOut(true);
    try {
      const payload = {
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
        paymentMethodId: parseInt(selectedPaymentMethodId, 10),
        total: finalTotal,
        discountTotal: loyaltyDiscount,
        customerId: selectedCustomer?.id || null,
        cashReceived: isCashMethod && cashReceived !== null ? cashReceived : null,
        change: isCashMethod && change !== null ? change : null,
      };

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Error al crear venta' }));
        throw new Error(errData.error || 'Error al crear venta');
      }

      const sale: SaleTicket = await res.json();
      setLastSale(sale);
      toast.success('Venta realizada con exito');
      const stockAlerts = (sale as { stockAlerts?: Array<{ productName: string; quantitySold: number; shortage: number }> }).stockAlerts || [];
      if (stockAlerts.length > 0) {
        const first = stockAlerts[0];
        const extra = stockAlerts.length > 1 ? ` y ${stockAlerts.length - 1} más` : '';
        toast(`Atención: se cobró ${first.productName} sin existencia${first.shortage ? ` (faltaban ${first.shortage})` : ''}${extra}. El cobro se permitió pero quedó registrado.`);
      }
      clearCart();
      setSelectedCustomer(null);
      setCheckoutOpen(false);
      if (sale?.id) {
        setTimeout(() => setReceiptOpen(true), 150);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear venta';
      toast.error(message);
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="-m-4 flex min-h-[calc(100vh-4rem)] flex-col gap-0 lg:-m-6 lg:h-[calc(100vh-4rem)] lg:flex-row">
      {/* Left Panel — Product Search & List (2/3) */}
      <div className="flex h-[65vh] w-full flex-col overflow-hidden lg:h-auto lg:w-2/3">
        {/* Search bar with mode tabs */}
        <div className="px-4 pt-4 pb-2 lg:px-6">
          <div className="flex items-stretch gap-2">
            {/* Mode tabs */}
            <div className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-slate-600">
              <button
                type="button"
                onClick={() => setSearchMode('name')}
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-semibold transition-colors',
                  searchMode === 'name'
                    ? 'bg-emerald-600 text-emerald-950'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                )}
              >
                Nombre
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('code')}
                className={cn(
                  'flex-1 border-t border-slate-600 px-3 py-1.5 text-xs font-semibold transition-colors',
                  searchMode === 'code'
                    ? 'bg-emerald-600 text-emerald-950'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                )}
              >
                Código
              </button>
            </div>
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-7 lg:left-9 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={searchRef}
                placeholder={searchMode === 'code' ? 'Buscar por código de barras...' : 'Buscar productos por nombre...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-full bg-slate-800 border-slate-600 pl-10 pr-36 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
              />
              <span className="absolute right-7 lg:right-9 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(''); searchRef.current?.focus(); }}
                    className="rounded-full bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
                    title="Limpiar búsqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  title="Leer código de barras con la cámara"
                  onClick={() => setScannerOpen(true)}
                >
                  <ScanLine className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-slate-500">
                  {total > 0 ? `${products.length}/${total}` : ''}
                </span>
                <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  F2
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Department chips */}
        {departments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setSelectedDepartmentId(null)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedDepartmentId === null
                  ? 'border-emerald-600 bg-emerald-600 text-emerald-950'
                  : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
              )}
            >
              Todos
            </button>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDepartmentId(d.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedDepartmentId === d.id
                    ? 'border-emerald-600 bg-emerald-600 text-emerald-950'
                    : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                )}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        {/* Product List with infinite scroll */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto px-4 pb-4 lg:px-6"
        >
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5">
                  <Skeleton className="h-4 w-1/3 bg-slate-700" />
                  <Skeleton className="h-5 w-1/6 bg-slate-700" />
                  <Skeleton className="h-6 w-16 bg-slate-700" />
                  <Skeleton className="h-8 w-20 bg-slate-700" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <Search className="mb-2 h-12 w-12" />
              <p className="text-sm">
                {searchTerm
                  ? 'No se encontraron productos'
                  : 'No hay productos disponibles'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {products.map((product) => {
                  const soldOut = product.stock <= 0;
                  return (
                    <div
                      key={product.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                        soldOut
                          ? 'border-slate-700/40 bg-slate-800/40 opacity-45'
                          : 'border-slate-700 bg-slate-800 hover:border-emerald-600/50 hover:bg-slate-700'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-slate-100">
                          {product.name}
                        </p>
                        {searchMode === 'code' && (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                            {product.barcode}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-bold text-emerald-400">
                        {formatCurrency(tx(product.price))}
                      </span>
                      <Badge
                        variant={soldOut ? 'destructive' : product.stock <= (product.minStock || 5) ? 'secondary' : 'outline'}
                        className="w-[74px] shrink-0 justify-center text-xs"
                      >
                        {soldOut
                          ? 'Sin stock'
                          : `${product.stock} uds.`}
                      </Badge>
                      {!soldOut && (
                        <Button
                          size="sm"
                          onClick={() => handleAddItem(product)}
                          className="h-8 w-[84px] shrink-0 bg-emerald-600 text-xs font-bold text-emerald-950 hover:bg-emerald-500"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Agregar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  <span className="ml-2 text-sm text-slate-400">Cargando más productos...</span>
                </div>
              )}

              {!hasMore && products.length > 0 && (
                <div className="py-4 text-center text-xs text-slate-600">
                  — Todos los productos cargados ({total} en total) —
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel — Shopping Cart (1/3) */}
      <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col border-t border-slate-700 bg-slate-800 lg:min-h-0 lg:w-1/3 lg:border-l lg:border-t-0">
        {/* Cart Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            🛒 Venta Actual
            {count > 0 && (
              <Badge variant="default" className="ml-1 rounded-full px-2 py-0 text-xs">
                {count}
              </Badge>
            )}
          </h2>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('¿Vaciar carrito?')) {
                  clearCart();
                }
              }}
              className="h-8 text-xs text-slate-400 hover:text-red-400"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Vaciar
            </Button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {count === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <ShoppingCart className="mb-2 h-16 w-16" />
              <p className="text-sm">Agrega productos al carrito</p>
            </div>
          ) : (
            <div className="space-y-1 px-4 py-2">
              {cart.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatCurrency(tx(item.price))} c/u
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (item.quantity <= 1) {
                          removeItem(item.productId);
                        } else {
                          updateQuantity(item.productId, item.quantity - 1);
                        }
                      }}
                      className="h-7 w-7 rounded-full bg-emerald-700 text-white hover:bg-emerald-600"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="flex h-7 w-8 items-center justify-center text-sm font-semibold text-slate-100">
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      className="h-7 w-7 rounded-full bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <span className="w-20 text-right text-sm font-semibold text-slate-100">
                    {formatCurrency(item.price * item.quantity)}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.productId)}
                    className="h-7 w-7 shrink-0 text-red-400 hover:bg-red-900/50 hover:text-red-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="border-t border-slate-700 px-4 py-3">
          {/* Customer loyalty section */}
          <div className="mb-3 space-y-2">
            <label className="text-xs font-medium text-slate-400">Cliente (fidelidad)</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-700 bg-emerald-900/20 p-2">
                <div>
                  <p className="text-sm font-medium text-emerald-400">{selectedCustomer.name}</p>
                  <p className="text-xs text-emerald-600">{selectedCustomer.tier} - {selectedCustomer.purchaseCount} visitas</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)} className="h-7 text-xs text-slate-400 hover:text-red-400">Quitar</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex gap-1">
                  <Input
                    placeholder="Buscar cliente..."
                    value={customerSearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomerSearch(value);
                      if (value.trim().length < 2) {
                        setCustomerResults([]);
                        setSearchingCustomer(false);
                      }
                    }}
                    className="h-8 text-xs border-slate-600 bg-slate-900 text-slate-100"
                  />
                  <Button variant="outline" size="sm" onClick={handleFingerprintScan} disabled={scanningFingerprint} className="h-8 border-slate-600 text-slate-300" title="Escanear huella (F5)">
                    <Fingerprint className={`h-4 w-4 ${scanningFingerprint ? 'animate-pulse text-emerald-400' : ''}`} />
                  </Button>
                </div>
                {searchingCustomer && customerSearch.length >= 2 && (
                  <div className="px-3 py-1.5 text-xs text-slate-500">Buscando...</div>
                )}
                {customerResults.length > 0 && customerSearch.length >= 2 && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
                    {customerResults.map((c) => (
                      <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerResults([]); }} className="cursor-pointer px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
                        {c.name} <Badge className="ml-1 text-[10px]">{c.tier || 'bronce'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-400">Subtotal</span>
            <span className="text-lg font-bold text-slate-100">
              {formatCurrency(taxedTotal)}
            </span>
          </div>

          {taxState.active && (
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <Percent className="h-3 w-3" /> Impuesto activo (+{taxState.percentage}%)
              </span>
              <span className="text-xs text-amber-300">
                Precios redondeados al entero
              </span>
            </div>
          )}

          {loyaltyDiscount > 0 && (
            <>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <Percent className="h-3 w-3" /> Descuento fidelidad
                </span>
                <span className="text-sm font-semibold text-emerald-400">
                  -{formatCurrency(loyaltyDiscount)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm font-semibold text-slate-200">Total</span>
                <span className="text-lg font-bold text-emerald-400">
                  {formatCurrency(finalTotal)}
                </span>
              </div>
            </>
          )}
          <Separator className="my-2" />

          <div className="py-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Método de pago
            </label>
            <Select
              value={selectedPaymentMethodId}
              onValueChange={setSelectedPaymentMethodId}
            >
              <SelectTrigger className="w-full border-slate-600 bg-slate-900 text-slate-100">
                <SelectValue placeholder="Seleccionar método" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={String(pm.id)}>
                    {pm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="lg"
            disabled={count === 0}
            onClick={() => { setCashReceived(null); setCheckoutOpen(true); }}
            className="mt-2 w-full bg-emerald-600 py-6 text-base font-bold text-white hover:bg-emerald-500"
          >
            Cobrar — {formatCurrency(finalTotal)}
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-slate-500">
            <span className="rounded bg-slate-700 px-1.5 py-0.5">F2</span> escanear · <span className="rounded bg-slate-700 px-1.5 py-0.5">F3</span> cobrar
          </p>
        </div>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              🛒 Confirmar Venta
            </DialogTitle>
            <DialogDescription>
              Revisa los detalles antes de cobrar
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {selectedCustomer && (
              <div className="rounded-lg border border-emerald-700 bg-emerald-900/20 p-3">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <User className="h-4 w-4" />
                  <span className="font-medium">{selectedCustomer.name}</span>
                  <Badge className="text-[10px]">{selectedCustomer.tier}</Badge>
                </div>
                {loyaltyDiscount > 0 && (
                  <p className="mt-1 text-xs text-emerald-500">
                    Descuento aplicado: {formatCurrency(loyaltyDiscount)}
                  </p>
                )}
              </div>
            )}

            {isCashMethod && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Efectivo recibido
                </h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCashReceived(finalTotal)}
                    className={cn(
                      'border-slate-600 bg-slate-900 text-xs text-slate-200 hover:bg-slate-700',
                      cashReceived === finalTotal && 'border-emerald-500 bg-emerald-900/40 text-emerald-300'
                    )}
                  >
                    Exacto
                  </Button>
                  {[20, 50, 100, 200, 500, 1000].map((bill) => (
                    <Button
                      key={bill}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCashReceived(bill)}
                      className={cn(
                        'border-slate-600 bg-slate-900 text-xs font-bold text-slate-100 hover:bg-slate-700',
                        cashReceived === bill && 'border-emerald-500 bg-emerald-900/40 text-emerald-300'
                      )}
                    >
                      ${bill}
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Otro monto..."
                  value={cashReceived ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCashReceived(v === '' ? null : Math.max(0, Number(v)));
                  }}
                  className="mt-2 h-9 border-slate-600 bg-slate-900 text-slate-100"
                />
                <div className="mt-3 flex items-center justify-between rounded-md bg-slate-950/60 px-3 py-2">
                  <span className="text-sm text-slate-400">Cambio</span>
                  <span
                    className={cn(
                      'text-2xl font-extrabold tabular-nums',
                      cashReceived !== null && cashReceived < finalTotal
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    )}
                  >
                    {cashReceived === null
                      ? '—'
                      : cashReceived < finalTotal
                        ? `Faltan ${formatCurrency(Math.round((finalTotal - cashReceived) * 100) / 100)}`
                        : formatCurrency(change ?? 0)}
                  </span>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Artículos</span>
                <span className="text-slate-100 font-medium">
                  {count} {count === 1 ? 'producto' : 'productos'}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Método de pago</span>
                <span className="text-slate-100 font-medium">
                  {paymentMethods.find(
                    (pm) => String(pm.id) === selectedPaymentMethodId
                  )?.name || '—'}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span className="text-slate-300">Total</span>
                <span className="text-emerald-400">
                  {loyaltyDiscount > 0 ? (
                    <><span className="text-xs text-slate-500 line-through mr-2">{formatCurrency(taxedTotal)}</span> {formatCurrency(finalTotal)}</>
                  ) : (
                    formatCurrency(taxedTotal)
                  )}
                </span>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Productos
              </h4>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between rounded-md bg-slate-800/30 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-slate-200">
                      {item.name}
                      <span className="ml-1.5 text-xs text-slate-500">
                        x{item.quantity}
                      </span>
                    </span>
                    <span className="ml-2 shrink-0 text-slate-100">
                    {formatCurrency(tx(item.price) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 shrink-0">
            <DialogClose asChild>
              <Button variant="secondary" disabled={checkingOut}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={handleCheckout}
              disabled={checkingOut || (isCashMethod && !hasEnoughCash)}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {checkingOut ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Cobrando...
                </span>
              ) : (
                '✅ Confirmar y Cobrar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera barcode scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScan}
      />

      {/* Ticket dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Printer className="h-4 w-4" />
              Ticket de venta
            </DialogTitle>
            <DialogDescription>
              Venta registrada correctamente
            </DialogDescription>
          </DialogHeader>
          {lastSale && <TicketReceipt sale={lastSale} />}
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="secondary">Cerrar</Button>
            </DialogClose>
            <Button onClick={() => lastSale && printTicketHtml(lastSale)} className="bg-emerald-600 hover:bg-emerald-500">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketReceipt({ sale }: { sale: SaleTicket }) {
  const date = sale.createdAt
    ? new Date(sale.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-sm">
      <div className="mb-3 text-center">
        <p className="font-bold text-slate-100">TICKET DE VENTA</p>
        <p className="text-xs text-slate-500">Venta #{sale.id}</p>
        <p className="text-xs text-slate-500">{date}</p>
      </div>
      <div className="space-y-1.5">
        {sale.items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-2 text-slate-200">
            <span className="flex-1">
              <span className="block truncate">{item.product.name}</span>
              <span className="text-xs text-slate-500">
                {item.quantity} x {formatCurrency(item.price)}
              </span>
            </span>
            <span className="shrink-0">{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>
      {sale.taxAmount && sale.taxAmount > 0 && (
        <p className="mt-1 text-[10px] text-slate-500">
          Precios con impuesto incluido
        </p>
      )}
      <div className="mt-3 space-y-1 border-t border-slate-700 pt-2 text-slate-300">
        {sale.taxBase !== undefined && sale.taxAmount !== undefined && sale.taxAmount > 0 && (
          <>
            <div className="flex justify-between">
              <span>Subtotal (sin impuesto)</span>
              <span>{formatCurrency(sale.taxBase)}</span>
            </div>
            <div className="flex justify-between">
              <span>Impuesto (+{sale.taxPercentage || 0}%)</span>
              <span>{formatCurrency(sale.taxAmount)}</span>
            </div>
          </>
        )}
        {sale.discountTotal > 0 && (
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{formatCurrency(sale.discountTotal)}</span>
          </div>
        )}
        {sale.cashReceived != null && sale.change != null && (
          <>
            <div className="flex justify-between">
              <span>Efectivo recibido</span>
              <span>{formatCurrency(sale.cashReceived)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-emerald-400">
              <span>Cambio</span>
              <span>{formatCurrency(sale.change)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-base font-bold text-emerald-400">
          <span>Total</span>
          <span>{formatCurrency(sale.total)}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Método de pago</span>
          <span>{sale.paymentMethod?.name || '—'}</span>
        </div>
        {sale.user?.name && (
          <div className="flex justify-between text-xs text-slate-500">
            <span>Cajero</span>
            <span>{sale.user.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Imprime el ticket en un iframe oculto: funciona en el navegador y en Electron
// sin necesidad de ocultar el resto de la pagina con CSS de impresion.
function printTicketHtml(sale: SaleTicket) {
  const date = sale.createdAt
    ? new Date(sale.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  const currency = (n: number) => formatCurrency(n);

  const itemsHtml = sale.items
    .map(
      (item) => `
        <div class="t-row">
          <div class="t-name">${escapeHtml(item.product.name)}</div>
          <div class="t-sub">${item.quantity} x ${currency(item.price)}</div>
          <div class="t-amt">${currency(item.price * item.quantity)}</div>
        </div>`
    )
    .join('');

  let totalsHtml = '';
  if (sale.taxBase !== undefined && sale.taxAmount !== undefined && sale.taxAmount > 0) {
    totalsHtml += `
      <div class="t-row"><span>Subtotal (sin impuesto)</span><span>${currency(sale.taxBase)}</span></div>
      <div class="t-row"><span>Impuesto (+${sale.taxPercentage || 0}%)</span><span>${currency(sale.taxAmount)}</span></div>`;
  }
  if (sale.discountTotal > 0) {
    totalsHtml += `<div class="t-row"><span>Descuento</span><span>-${currency(sale.discountTotal)}</span></div>`;
  }
  if (sale.cashReceived != null && sale.change != null) {
    totalsHtml += `
      <div class="t-row"><span>Efectivo recibido</span><span>${currency(sale.cashReceived)}</span></div>
      <div class="t-row t-big"><span>Cambio</span><span>${currency(sale.change)}</span></div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket #${sale.id}</title>
<style>
  @page { size: 80mm auto; margin: 5mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #000;
    width: 70mm;
    margin: 0 auto;
  }
  .t-head { text-align: center; margin-bottom: 8px; }
  .t-head .t-title { font-weight: bold; font-size: 14px; }
  .t-head div { line-height: 1.4; }
  .t-sep { border-top: 1px dashed #000; margin: 6px 0; }
  .t-row { display: flex; justify-content: space-between; gap: 8px; line-height: 1.5; }
  .t-row span:last-child { white-space: nowrap; }
  .t-name { font-weight: bold; }
  .t-sub { font-size: 11px; }
  .t-amt { text-align: right; }
  .t-big { font-weight: bold; font-size: 14px; margin-top: 4px; }
</style>
</head>
<body>
  <div class="t-head">
    <div class="t-title">TICKET DE VENTA</div>
    <div>Venta #${sale.id}</div>
    <div>${escapeHtml(date)}</div>
  </div>
  <div class="t-sep"></div>
  ${itemsHtml}
  <div class="t-sep"></div>
  ${totalsHtml}
  <div class="t-row t-big"><span>Total</span><span>${currency(sale.total)}</span></div>
  <div class="t-sep"></div>
  <div class="t-row"><span>Metodo de pago</span><span>${escapeHtml(sale.paymentMethod?.name || '—')}</span></div>
  ${sale.user?.name ? `<div class="t-row"><span>Cajero</span><span>${escapeHtml(sale.user.name)}</span></div>` : ''}
  <div class="t-sep"></div>
  <div class="t-head">¡Gracias por su compra!</div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const cleanup = () => setTimeout(() => iframe.remove(), 2000);

  const doc = iframe.contentDocument;
  if (!doc) {
    window.print();
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Espera a que el iframe renderice el HTML antes de imprimir
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
    cleanup();
  }, 150);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
