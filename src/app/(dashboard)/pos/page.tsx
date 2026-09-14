'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ShoppingCart, Plus, Minus, X, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
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
import { formatCurrency } from '@/lib/utils';

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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function PosPage() {
  const {
    cart,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    itemCount,
  } = usePosStore();

  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [batchInfo, setBatchInfo] = useState<Record<number, { nearestExpiry: string | null }>>({});

  const debouncedSearch = useDebounce(searchTerm, 300);

  const LIMIT = 50;

  // Fetch products with pagination
  const fetchProducts = useCallback(async (query: string, pageNum: number, append: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('page', String(pageNum));
      params.set('limit', String(LIMIT));
      
      const res = await fetch(`/api/products?${params}`);
      const data: PaginatedResponse = await res.json();
      
      if (data.products) {
        setProducts(prev => append ? [...prev, ...data.products] : data.products);
        setHasMore(data.pagination.hasMore);
        setTotal(data.pagination.total);
        setPage(pageNum);
      }
    } catch {
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load / search change resets to page 1
  useEffect(() => {
    setProducts([]);
    setPage(1);
    setHasMore(true);
    fetchProducts(debouncedSearch, 1, false);
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

  // Fetch batch expiry info
  useEffect(() => {
    const fetchBatchInfo = async () => {
      try {
        const res = await fetch('/api/stock-batches/expiry-summary');
        if (res.ok) {
          const data = await res.json();
          const map: Record<number, { nearestExpiry: string | null }> = {};
          for (const group of [...(data.expiringToday || []), ...(data.nearExpiry || []), ...(data.expired || [])]) {
            if (!map[group.product.id]) {
              map[group.product.id] = { nearestExpiry: group.nearestExpiry };
            }
          }
          setBatchInfo(map);
        }
      } catch {}
    };
    fetchBatchInfo();
    const interval = setInterval(fetchBatchInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalAmount = subtotal();
  const count = itemCount();

  const handleAddItem = (product: Product) => {
    addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
    });
  };

  const handleCheckout = async () => {
    if (!selectedPaymentMethodId) {
      toast.error('Selecciona un método de pago');
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
        total: totalAmount,
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

      toast.success('✅ Venta realizada con éxito');
      clearCart();
      setCheckoutOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear venta';
      toast.error(message);
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 -m-4 lg:-m-6">
      {/* Left Panel — Product Search & Grid (2/3) */}
      <div className="flex w-2/3 flex-col overflow-hidden">
        {/* Search bar with count */}
        <div className="relative px-4 pt-4 pb-3 lg:px-6">
          <Search className="absolute left-7 lg:left-9 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <Input
            ref={searchRef}
            placeholder="Buscar productos por nombre o código de barras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-surface-2 border-line-strong pl-10 pr-32 text-fg placeholder:text-fg-subtle focus-visible:ring-brand"
          />
          <span className="absolute right-7 lg:right-9 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-xs text-fg-subtle">
              {total > 0 ? `${products.length}/${total}` : ''}
            </span>
            <span className="rounded bg-line px-2 py-0.5 text-xs text-fg-muted">
              F2
            </span>
          </span>
        </div>

        {/* Product Grid with infinite scroll */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto px-4 pb-4 lg:px-6"
        >
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Card key={i} className="bg-surface-2/50">
                  <CardContent className="p-4">
                    <Skeleton className="mb-2 h-4 w-3/4 bg-line" />
                    <Skeleton className="mb-2 h-5 w-1/2 bg-line" />
                    <Skeleton className="h-4 w-1/3 bg-line" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-fg-subtle">
              <Search className="mb-2 h-12 w-12" />
              <p className="text-sm">
                {searchTerm
                  ? 'No se encontraron productos'
                  : 'No hay productos disponibles'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => (
                  <Card
                    key={product.id}
                    onClick={() => handleAddItem(product)}
                    className="cursor-pointer bg-surface-2/50 transition-colors hover:bg-line"
                  >
                    <CardContent className="flex flex-col gap-1 p-4">
                      <span className="truncate text-sm font-medium text-fg">
                        {product.name}
                      </span>
                      <span className="text-lg font-bold text-brand">
                        {formatCurrency(product.price)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge
                          variant={product.stock <= 0 ? 'destructive' : product.stock <= (product.minStock || 5) ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {product.stock <= 0
                            ? 'Sin stock'
                            : `${product.stock} uds.`}
                        </Badge>
                        {batchInfo[product.id]?.nearestExpiry && (
                          (() => {
                            const days = Math.ceil((new Date(batchInfo[product.id].nearestExpiry!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                            if (days <= 0) return <Badge variant="destructive" className="text-[10px]">VENCIDO</Badge>;
                            if (days <= 7) return <Badge variant="destructive" className="text-[10px]">{days}d</Badge>;
                            return null;
                          })()
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-brand" />
                  <span className="ml-2 text-sm text-fg-muted">Cargando más productos...</span>
                </div>
              )}

              {!hasMore && products.length > 0 && (
                <div className="py-4 text-center text-xs text-line-strong">
                  — Todos los productos cargados ({total} en total) —
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel — Shopping Cart (1/3) */}
      <div className="flex w-1/3 flex-col border-l bg-surface-2/50">
        {/* Cart Header */}
        <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
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
              className="h-8 text-xs text-fg-muted hover:text-red-400"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Vaciar
            </Button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {count === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-fg-subtle">
              <ShoppingCart className="mb-2 h-16 w-16" />
              <p className="text-sm">Agrega productos al carrito</p>
            </div>
          ) : (
            <div className="space-y-1 px-4 py-2">
              {cart.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-2 rounded-lg bg-surface-2/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {item.name}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {formatCurrency(item.price)} c/u
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
                      className="h-7 w-7 rounded-full bg-brand-strong text-white hover:bg-brand-strong"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="flex h-7 w-8 items-center justify-center text-sm font-semibold text-fg">
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      className="h-7 w-7 rounded-full bg-brand-strong text-white hover:bg-brand-strong disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <span className="w-20 text-right text-sm font-semibold text-fg">
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
        <div className="border-t border-line/60 px-4 py-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-fg-muted">Subtotal</span>
            <span className="text-lg font-bold text-fg">
              {formatCurrency(totalAmount)}
            </span>
          </div>
          <Separator className="my-2" />

          <div className="py-2">
            <label className="mb-1.5 block text-xs font-medium text-fg-muted">
              Método de pago
            </label>
            <Select
              value={selectedPaymentMethodId}
              onValueChange={setSelectedPaymentMethodId}
            >
              <SelectTrigger className="w-full border-line-strong bg-surface text-fg">
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
            onClick={() => setCheckoutOpen(true)}
            className="mt-2 w-full bg-brand-strong py-6 text-base font-bold text-white hover:bg-brand"
          >
            Cobrar — {formatCurrency(totalAmount)}
          </Button>
        </div>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fg">
              🛒 Confirmar Venta
            </DialogTitle>
            <DialogDescription>
              Revisa los detalles antes de cobrar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-surface-2/50 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-fg-muted">Artículos</span>
                <span className="text-fg font-medium">
                  {count} {count === 1 ? 'producto' : 'productos'}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-fg-muted">Método de pago</span>
                <span className="text-fg font-medium">
                  {paymentMethods.find(
                    (pm) => String(pm.id) === selectedPaymentMethodId
                  )?.name || '—'}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span className="text-fg-muted">Total</span>
                <span className="text-brand">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                Productos
              </h4>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between rounded-md bg-surface-2/30 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-fg">
                      {item.name}
                      <span className="ml-1.5 text-xs text-fg-subtle">
                        x{item.quantity}
                      </span>
                    </span>
                    <span className="ml-2 shrink-0 text-fg">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="secondary" disabled={checkingOut}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="bg-brand-strong hover:bg-brand"
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
    </div>
  );
}
