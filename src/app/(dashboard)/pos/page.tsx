'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ShoppingCart, Plus, Minus, X, Trash2, Loader2, User, Percent, Fingerprint, ScanLine, Printer, FileDown } from 'lucide-react';
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
  const [printingTicket, setPrintingTicket] = useState(false);
  const [printerName, setPrinterName] = useState('');
  const [ticketWidth, setTicketWidth] = useState(32);
  const [printServerUrl, setPrintServerUrl] = useState('');
  const [printToken, setPrintToken] = useState('');

  // Loyalty/customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [scanningFingerprint, setScanningFingerprint] = useState(false);

  // Camera barcode scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const handleScan = useCallback((code: string) => {
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
  }, [addItem, setSearchTerm, selectedDepartmentId]);

  useEffect(() => () => {
    productsAbortRef.current?.abort();
    customersAbortRef.current?.abort();
  }, []);

  // Initial load / search change resets to page 1
  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(debouncedSearch, 1, false), 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, fetchProducts]);

  // Enfocar el buscador al abrir la ventana de POS
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

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

  // Cargar impresora de tickets configurada (Electron)
  useEffect(() => {
    const win = window as unknown as { electronAPI?: { getConfig?: () => Promise<{ ticketPrinter?: string; ticketWidth?: number; printServerUrl?: string; printToken?: string }> } };
    if (win.electronAPI?.getConfig) {
      win.electronAPI.getConfig()
        .then((cfg) => {
          if (cfg.ticketPrinter) setPrinterName(cfg.ticketPrinter);
          if (cfg.ticketWidth) setTicketWidth(cfg.ticketWidth);
          if (cfg.printServerUrl) setPrintServerUrl(cfg.printServerUrl);
          if (cfg.printToken) setPrintToken(cfg.printToken);
        })
        .catch(() => {});
    }
  }, []);

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
          setCashReceived(finalTotal);
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
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, searchTerm, handleBarcodeScan, count, checkoutOpen, receiptOpen, finalTotal]);

  const handleAddItem = (product: Product) => {
    if (product.stock <= 0) {
      toast(`Sin stock: ${product.name}. Podrás cobrarlo pero quedará registrada la falta de existencia.`, {
        icon: '⚠️',
      });
    }
    if (!product.supplierId) {
      toast(`Sin proveedor: ${product.name}. No podrá generarse la orden de compra.`, {
        icon: '🏷️',
      });
    }
    addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
    });
    searchRef.current?.focus();
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

  // Guarda el ticket como archivo de texto plano (.txt) listo para imprimir
  // en la impresora de tickets, o como HTML para imprimir desde el navegador.
  const handleSaveTicket = (sale: SaleTicket, format: 'txt' | 'html' = 'txt') => {
    const text = buildPlainTextTicket(sale, ticketWidth);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (format === 'html') {
      const html = buildTicketHtml(sale, text);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-${sale.id}-${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-${sale.id}-${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    toast.success('Ticket guardado como archivo');
  };

  // Imprime el ticket. Estrategia en orden:
  // 1) Servidor remoto configurado (printServerUrl, app Electron en otra
  //    maquina / Windows): POST con token al server del HOST (la impresora
  //    USB esta pegada ahi). Funciona via Funnel desde cualquier red.
  // 2) Servidor local (POST /api/print/ticket): mismo host, cualquier navegador.
  // 3) Electron (printPlainText): impresora instalada en la misma maquina.
  // 4) window.print(): ultimo recurso (dialogo del navegador).
  const handlePrintSale = async (sale: SaleTicket) => {
    setPrintingTicket(true);
    try {
      const text = buildPlainTextTicket(sale, ticketWidth);

      // 1) Server remoto (Electron configurado con printServerUrl)
      if (printServerUrl) {
        try {
          const url = printServerUrl.replace(/\/+$/, '') + '/api/print/ticket';
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(printToken ? { 'x-print-token': printToken } : {}),
            },
            body: JSON.stringify({ text }),
          });
          if (res.ok) {
            toast.success('Ticket impreso');
            return;
          }
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          toast.error(`Impresora remota: ${err.error || 'error'}`);
          return;
        } catch (e) {
          toast.error(`No se pudo conectar con el servidor de impresión (${printServerUrl})`);
          return;
        }
      }

      // 2) Server local (misma maquina)
      try {
        const res = await fetch('/api/print/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          toast.success('Ticket impreso');
          return;
        }
      } catch {
        // Sin conexion con el server: seguir con los otros metodos.
      }

      // 3) Electron
      const win = window as unknown as {
        electronAPI?: { printPlainText?: (text: string, printer: string) => Promise<{ ok: boolean; error?: string }> };
      };
      if (printerName && win.electronAPI?.printPlainText) {
        const res = await win.electronAPI.printPlainText(text, printerName);
        if (res?.ok) toast.success('Ticket impreso');
        else toast.error(res?.error || 'No se pudo imprimir el ticket');
        return;
      }
      // 4) Navegador
      printTicketHtml(sale);
    } finally {
      setPrintingTicket(false);
    }
  };

  return (
    <div className="relative -m-4 flex min-h-[calc(100vh-4rem)] flex-col gap-0 overflow-hidden lg:-m-6 lg:h-[calc(100vh-4rem)]">
      {/* Floating Search Island */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4 lg:top-5">
        <div className="pointer-events-auto w-full max-w-2xl">
          {/* Island bar */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-600/80 bg-slate-800/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
              <Input
                ref={searchRef}
                placeholder="Buscar por nombre o código de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 border-slate-700 bg-slate-900/70 pl-9 pr-3 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
              />
            </div>
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); searchRef.current?.focus(); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
                title="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 border-slate-600"
              title="Leer código de barras con la cámara"
              onClick={() => setScannerOpen(true)}
            >
              <ScanLine className="h-4 w-4" />
            </Button>
            <span className="hidden shrink-0 rounded bg-slate-700 px-2 py-1 text-xs text-slate-400 sm:inline">
              F2
            </span>
          </div>

          {/* Results — only visible when there's a search */}
          {searchTerm && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50">
              {/* Department chips */}
              {departments.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-b border-slate-800 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

              {/* Results count */}
              <div className="px-3 pt-2 text-xs text-slate-500">
                {total > 0 ? `${products.length} de ${total} resultados` : 'Buscando...'}
              </div>

              {/* Product list */}
              <div ref={gridRef} className="max-h-[55vh] overflow-y-auto p-2">
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
                  <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                    <Search className="mb-2 h-10 w-10" />
                    <p className="text-sm">No se encontraron productos</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {products.map((product) => {
                        const soldOut = product.stock <= 0;
                        return (
                          <div
                            key={product.id}
                            className={cn(
                              'flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                              soldOut
                                ? 'border-amber-800/40 bg-amber-950/20'
                                : 'border-slate-700 bg-slate-800 hover:border-emerald-600/50 hover:bg-slate-700'
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug text-slate-100">
                                {product.name}
                              </p>
                              {product.barcode && (
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
                            <Button
                              size="sm"
                              onClick={() => handleAddItem(product)}
                              className="h-8 w-[84px] shrink-0 bg-emerald-600 text-xs font-bold text-emerald-950 hover:bg-emerald-500"
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Agregar
                            </Button>
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
          )}
        </div>
      </div>

      {/* Full Screen Cart — Venta Actual */}
      <div className="flex min-h-0 w-full flex-1 flex-col">
        {/* Cart Header */}
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/60 px-6 py-3">
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          {count === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <ShoppingCart className="mb-2 h-20 w-20 text-slate-700" />
              <p className="text-base">Agrega productos al carrito</p>
              <p className="mt-1 text-sm text-slate-600">
                Escanea un código de barras o usa el buscador de arriba
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-1.5 px-6 py-4">
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
                      disabled={item.quantity >= item.stock && item.stock > 0}
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
        <div className="border-t border-slate-700 bg-slate-800/60 px-4 py-3 lg:px-6">
          <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-2">
            {/* Left column: customer + payment method */}
            <div className="space-y-3">
              {/* Customer loyalty section */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Cliente (fidelidad)</label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-700 bg-emerald-900/20 p-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-emerald-400">{selectedCustomer.name}</p>
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
                      <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
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

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-400">
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
            </div>

            {/* Right column: totals + charge button */}
            <div className="flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-slate-400">Subtotal</span>
                  <span className="text-lg font-bold text-slate-100">
                    {formatCurrency(taxedTotal)}
                  </span>
                </div>

                {taxState.active && (
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-amber-400 flex items-center gap-1">
                      <Percent className="h-3 w-3" /> Impuesto activo (+{taxState.percentage}%)
                    </span>
                    <span className="text-xs text-amber-300">
                      Precios redondeados al entero
                    </span>
                  </div>
                )}

                {loyaltyDiscount > 0 && (
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <Percent className="h-3 w-3" /> Descuento fidelidad
                    </span>
                    <span className="text-sm font-semibold text-emerald-400">
                      -{formatCurrency(loyaltyDiscount)}
                    </span>
                  </div>
                )}

                <Separator className="my-1.5" />

                <div className="flex items-center justify-between py-1">
                  <span className="text-base font-semibold text-slate-200">Total</span>
                  <span className="text-2xl font-extrabold text-emerald-400">
                    {formatCurrency(finalTotal)}
                  </span>
                </div>
              </div>

              <div>
                <Button
                  size="lg"
                  disabled={count === 0}
                  onClick={() => { setCashReceived(finalTotal); setCheckoutOpen(true); }}
                  className="w-full bg-emerald-600 py-6 text-lg font-bold text-white hover:bg-emerald-500"
                >
                  Cobrar — {formatCurrency(finalTotal)}
                </Button>
                <p className="mt-1.5 text-center text-[11px] text-slate-500">
                  <span className="rounded bg-slate-700 px-1.5 py-0.5">F2</span> escanear · <span className="rounded bg-slate-700 px-1.5 py-0.5">F3</span> cobrar
                </p>
              </div>
            </div>
          </div>
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
            <Button
              variant="outline"
              onClick={() => lastSale && handleSaveTicket(lastSale, 'txt')}
              className="border-slate-600 text-slate-300"
              title="Descarga el ticket como texto plano (.txt) para imprimir en la impresora de tickets"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Guardar .txt
            </Button>
            <Button onClick={() => lastSale && handlePrintSale(lastSale)} className="bg-emerald-600 hover:bg-emerald-500">
              <Printer className="mr-2 h-4 w-4" />
              {printingTicket ? 'Imprimiendo...' : 'Imprimir'}
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

// Genera el ticket como TEXTO PLANO para impresoras de tickets (58mm/80mm).
// Estas impresoras suelen usar driver "Generic / Text Only" que solo imprime
// texto; no soportan imagenes ni HTML.
// Ancho en caracteres por linea: 32 = 58mm estandar, 42/48 = 80mm.
function buildPlainTextTicket(sale: SaleTicket, width = 32): string {
  const W = Math.max(24, Math.min(48, width));
  const line = (char: string) => char.repeat(W);
  const leftRight = (l: string, r: string) => {
    const rtrunc = r.slice(0, Math.max(8, Math.floor(W * 0.4)));
    const ltrunc = l.slice(0, Math.max(8, W - rtrunc.length - 2));
    const pad = Math.max(1, W - ltrunc.length - rtrunc.length);
    return ltrunc + ' '.repeat(pad) + rtrunc;
  };
  const center = (s: string) => {
    const t = s.slice(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    return ' '.repeat(pad) + t;
  };

  const date = sale.createdAt
    ? new Date(sale.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

  const currency = (n: number) => formatCurrency(n);

  const out: string[] = [];
  out.push(center('TICKET DE VENTA'));
  out.push(center('Venta #' + sale.id));
  out.push(center(date));
  out.push(line('='));
  out.push(leftRight('Artículo', 'Importe'));
  out.push(line('-'));

  for (const item of sale.items) {
    out.push(item.product.name.slice(0, W));
    out.push(leftRight(`  ${item.quantity} x ${currency(item.price)}`, currency(item.price * item.quantity)));
  }

  out.push(line('='));

  if (sale.taxBase !== undefined && sale.taxAmount !== undefined && sale.taxAmount > 0) {
    out.push(leftRight('Subtotal (sin impuesto)', currency(sale.taxBase)));
    out.push(leftRight(`Impuesto (+${sale.taxPercentage || 0}%)`, currency(sale.taxAmount)));
  }
  if (sale.discountTotal > 0) {
    out.push(leftRight('Descuento', '-' + currency(sale.discountTotal)));
  }
  if (sale.cashReceived != null && sale.change != null) {
    out.push(leftRight('Efectivo recibido', currency(sale.cashReceived)));
    out.push(leftRight('Cambio', currency(sale.change)));
  }
  out.push(leftRight('TOTAL', currency(sale.total)));
  out.push(line('-'));
  out.push(leftRight('Método de pago', sale.paymentMethod?.name || '—'));
  if (sale.user?.name) out.push(leftRight('Cajero', sale.user.name));
  out.push('');
  out.push(center('¡Gracias por su compra!'));
  out.push('');
  return out.join('\n');
}

// Convierte el ticket de texto plano en un HTML de ancho fijo (80mm) listo
// para imprimir desde el navegador.
function buildTicketHtml(sale: SaleTicket, text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = text.split('\n').map((l) => `<div>${esc(l)}</div>`).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket #${sale.id}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #000;
    width: 72mm;
    margin: 0 auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
</head>
<body>${lines}</body>
</html>`;
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
