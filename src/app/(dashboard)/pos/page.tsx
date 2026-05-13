'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ShoppingCart, Plus, Minus, X, Trash2 } from 'lucide-react';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Fetch products
  const fetchProducts = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const url = query ? `/api/products?q=${encodeURIComponent(query)}` : '/api/products';
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProducts(data);
      } else {
        setProducts([]);
      }
    } catch {
      toast.error('Error al cargar productos');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and search fetch
  useEffect(() => {
    fetchProducts(debouncedSearch);
  }, [debouncedSearch, fetchProducts]);

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

  const total = subtotal();
  const count = itemCount();

  // Add product to cart
  const handleAddItem = (product: Product) => {
    addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
    });
  };

  // Checkout
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
        total,
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
        {/* Search */}
        <div className="relative px-4 pt-4 pb-3 lg:px-6">
          <Search className="absolute left-7 lg:left-9 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            placeholder="Buscar productos por nombre o código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-800 border-slate-600 pl-10 pr-20 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
          />
          <span className="absolute right-7 lg:right-9 top-1/2 -translate-y-1/2 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
            F2
          </span>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 lg:px-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Card key={i} className="border-slate-700 bg-slate-800">
                  <CardContent className="p-4">
                    <Skeleton className="mb-2 h-4 w-3/4 bg-slate-700" />
                    <Skeleton className="mb-2 h-5 w-1/2 bg-slate-700" />
                    <Skeleton className="h-4 w-1/3 bg-slate-700" />
                  </CardContent>
                </Card>
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <Card
                  key={product.id}
                  onClick={() => handleAddItem(product)}
                  className="cursor-pointer border-slate-700 bg-slate-800 transition-colors hover:bg-slate-700"
                >
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="truncate text-sm font-medium text-slate-100">
                      {product.name}
                    </span>
                    <span className="text-lg font-bold text-emerald-400">
                      {formatCurrency(product.price)}
                    </span>
                    <Badge
                      variant={product.stock <= 0 ? 'destructive' : product.stock <= (product.minStock || 5) ? 'secondary' : 'outline'}
                      className="w-fit text-xs"
                    >
                      {product.stock <= 0
                        ? 'Sin stock'
                        : `${product.stock} uds.`}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel — Shopping Cart (1/3) */}
      <div className="flex w-1/3 flex-col border-l border-slate-700 bg-slate-800">
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
                  {/* Item details */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatCurrency(item.price)} c/u
                    </p>
                  </div>

                  {/* Quantity controls */}
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

                  {/* Line total */}
                  <span className="w-20 text-right text-sm font-semibold text-slate-100">
                    {formatCurrency(item.price * item.quantity)}
                  </span>

                  {/* Remove button */}
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

        {/* Bottom Section: Subtotal, Payment, Checkout */}
        <div className="border-t border-slate-700 px-4 py-3">
          {/* Subtotal */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-400">Subtotal</span>
            <span className="text-lg font-bold text-slate-100">
              {formatCurrency(total)}
            </span>
          </div>
          <Separator className="my-2" />

          {/* Payment Method */}
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

          {/* Checkout Button */}
          <Button
            size="lg"
            disabled={count === 0}
            onClick={() => setCheckoutOpen(true)}
            className="mt-2 w-full bg-emerald-600 py-6 text-base font-bold text-white hover:bg-emerald-500"
          >
            Cobrar — {formatCurrency(total)}
          </Button>
        </div>
      </div>

      {/* Checkout Confirmation Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              🛒 Confirmar Venta
            </DialogTitle>
            <DialogDescription>
              Revisa los detalles antes de cobrar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
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
                <span className="text-emerald-400">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Items list */}
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
    </div>
  );
}
