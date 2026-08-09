'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Eye, CheckCircle, Package, Search,
  Calendar, Clock, Calculator, Trash2, Columns, PlusCircle,
  Download, Image as ImageIcon, FileText, AlertCircle, History, AlertTriangle, RefreshCcw, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

// ─── Types ───
interface Supplier {
  id: number; name: string; active: boolean;
}

interface Product {
  id: number; name: string; barcode: string; stock: number; active: boolean;
  price?: number; cost?: number;
  productLines?: Array<{ supplierId: number; supplierPrice: number | null; isPrimary: boolean }>;
}

interface SoldProduct {
  productId: number; name: string; barcode: string;
  price: number; cost: number; stock: number; minStock: number;
  department: { id: number; name: string } | null;
  supplierPrice: number | null; totalSold: number;
  source?: 'ventas' | 'pendiente';
  // Producto sin inventario (fantasma): se rellena como si existiera
  ghost?: boolean;
}

interface ProductSearchResult {
  id: number; name: string; barcode: string;
  price: number; cost: number; stock: number; minStock: number;
  department: { id: number; name: string } | null;
  productLines?: Array<{ supplierId: number; supplierPrice: number | null; isPrimary: boolean }>;
}

interface OrderItem {
  id: number; productId: number | null; quantity: number;
  product: Product | null; receivedQuantity: number; notes: string;
  costPrice?: number | null; extra?: boolean;
  productName?: string; productBarcode?: string;
}

interface ReceiveExtra {
  key: string;
  productId: number;
  name: string;
  quantity: string;
  costPrice: string;
  price: string;
  expiresAt: string;
}

interface Order {
  id: number; supplierId: number; status: string; notes: string;
  createdAt: string; supplier: Supplier; items: OrderItem[];
}

interface Pagination {
  page: number; limit: number; total: number;
  totalPages: number; hasMore: boolean;
}

interface ExtraColumn {
  id: string; name: string; key: string;
}

const EXTRA_COLUMN_OPTIONS: { label: string; key: string }[] = [
  { label: 'Precio Venta', key: 'price' },
  { label: 'Costo', key: 'cost' },
  { label: 'Stock Actual', key: 'stock' },
  { label: 'Stock Mínimo', key: 'minStock' },
  { label: 'Precio Proveedor', key: 'supplierPrice' },
  { label: 'Departamento', key: 'department' },
  { label: 'Texto personalizado', key: 'custom_text' },
];

// Columnas disponibles para la exportación PNG/CSV del pedido
const EXPORT_COLUMN_OPTIONS: { key: string; label: string; required?: boolean }[] = [
  { key: 'index', label: '#' },
  { key: 'barcode', label: 'Código', required: true },
  { key: 'name', label: 'Nombre', required: true },
  { key: 'quantity', label: 'Cantidad', required: true },
  { key: 'received', label: 'Recibido' },
  { key: 'pending', label: 'Pendiente' },
  { key: 'price', label: 'Precio Venta' },
  { key: 'supplierPrice', label: 'P. Proveedor' },
  { key: 'profit', label: 'Ganancia' },
];

const DEFAULT_EXPORT_COLUMNS = ['index', 'barcode', 'name', 'quantity', 'received', 'pending'];

// ─── Helpers ───
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatCurrency(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusBadge(status: string) {
  const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    pending: 'secondary', sent: 'outline', received: 'default', cancelled: 'destructive',
    on_hold: 'secondary', ready: 'default',
  };
  const l: Record<string, string> = {
    pending: 'Pendiente', sent: 'Enviado', received: 'Recibido', cancelled: 'Cancelado',
    on_hold: 'En espera', ready: 'Listo',
  };
  if (status === 'on_hold') {
    return <Badge variant="secondary" className="uppercase text-xs border-amber-600/60 text-amber-400">En espera</Badge>;
  }
  return <Badge variant={v[status] || 'secondary'} className="uppercase text-xs">{l[status] || status}</Badge>;
}

function fmtSold(p: SoldProduct, key: string): string {
  if (key === 'department') return p.department?.name || '—';
  const v = p[key as keyof SoldProduct];
  if (v === null || v === undefined) return '—';
  return typeof v === 'number' ? v.toFixed(2) : String(v);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }

// ─── Component ───
export default function OrdersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  // Datos simbólicos (ganancia/pérdida estimada) solo visibles para admin;
  // el botón permite ocultarlos al cajero.
  const [showProfitInfo, setShowProfitInfo] = useState(false);

  // ── Data ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPagination, setOrderPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, totalPages: 0, hasMore: false,
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Dialogs ──
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveBatches, setReceiveBatches] = useState<Record<number, string>>({});
  const [receiveCosts, setReceiveCosts] = useState<Record<number, string>>({});
  const [receivePrices, setReceivePrices] = useState<Record<number, string>>({});
  const [receiveExtras, setReceiveExtras] = useState<ReceiveExtra[]>([]);
  const [extraSearch, setExtraSearch] = useState('');
  const [extraResults, setExtraResults] = useState<ProductSearchResult[]>([]);
  const [extraSearching, setExtraSearching] = useState(false);
  const [reorderLoading, setReorderLoading] = useState(false);

  // ── Create form ──
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [dateFrom, setDateFrom] = useState(weekAgoStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [timeFrom, setTimeFrom] = useState('06:00');
  const [timeTo, setTimeTo] = useState('22:00');
  const [soldProducts, setSoldProducts] = useState<SoldProduct[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [salesInfo, setSalesInfo] = useState<{ totalProducts: number; totalUnits: number } | null>(null);
  const [extraColumns, setExtraColumns] = useState<ExtraColumn[]>([]);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnKey, setNewColumnKey] = useState('price');
  const [customColumnName, setCustomColumnName] = useState('');
  const [manualColumns, setManualColumns] = useState<Record<string, Record<string, string>>>({});
  const [pendingItems, setPendingItems] = useState<SoldProduct[] | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [exportCols, setExportCols] = useState<Set<string>>(new Set(DEFAULT_EXPORT_COLUMNS));

  // ── Manual product search state ──
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualResults, setManualResults] = useState<SoldProduct[]>([]);
  const [manualSearching, setManualSearching] = useState(false);

  // ── Producto sin inventario (fantasma) ──
  const [ghostName, setGhostName] = useState('');
  const [ghostBarcode, setGhostBarcode] = useState('');
  const [ghostPrice, setGhostPrice] = useState('0');
  const [ghostCost, setGhostCost] = useState('0');
  const [ghostQty, setGhostQty] = useState('1');

  // ── Fetchers ──
  const fetchOrders = useCallback(async (pageNum = 1, signal?: AbortSignal) => {
    await Promise.resolve();
    if (signal?.aborted) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '25' });
      const res = await fetch(`/api/orders?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar pedidos');
      const data: { orders: Order[]; pagination: Pagination } = await res.json();
      setOrders(data.orders);
      setOrderPagination(data.pagination);
      setOrderPage(data.pagination.page);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setOrders([]);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const fetchSuppliers = useCallback(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSuppliers(d.filter((s: Supplier) => s.active)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = setTimeout(() => {
      fetchOrders(1, controller.signal);
      fetchSuppliers();
    }, 0);
    return () => {
      clearTimeout(initialLoad);
      controller.abort();
    };
  }, [fetchOrders, fetchSuppliers]);

  const resetForm = () => {
    setFormSupplierId(''); setFormNotes(''); setDateFrom(weekAgoStr());
    setDateTo(todayStr()); setTimeFrom('06:00'); setTimeTo('22:00');
    setSoldProducts([]); setQuantities({}); setHiddenRows(new Set());
    setSalesInfo(null); setFormError(''); setExtraColumns([]); setPendingItems(null);
    setManualColumns({}); setCustomColumnName('');
    setGhostName(''); setGhostBarcode(''); setGhostPrice('0'); setGhostCost('0'); setGhostQty('1');
  };

  // ── Calculate sales ──
  const calculateSales = async () => {
    if (!formSupplierId) { setFormError('Selecciona un proveedor primero'); return; }
    setFormError(''); setCalculating(true); setSoldProducts([]); setQuantities({}); setHiddenRows(new Set()); setPendingItems(null);
    try {
      const params = new URLSearchParams({ supplierId: formSupplierId, dateFrom, dateTo, timeFrom, timeTo });
      const res = await fetch(`/api/orders/sales-summary?${params}`);
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Error'); return; }
      const sales = (data.products || []) as SoldProduct[];
      const init: Record<string, number> = {};
      sales.forEach((p: SoldProduct) => { init[String(p.productId)] = p.totalSold; });

      // Pendientes de pedidos pasados: para productos donde este proveedor es SECUNDARIO
      // (o que no estén en las ventas del principal), se sugiere solo lo que falta por recibir
      let merged = sales;
      try {
        const pendRes = await fetch(`/api/orders/pending-items?supplierId=${formSupplierId}`);
        const pendData = await pendRes.json();
        if (pendRes.ok && Array.isArray(pendData.products)) {
          const pendProducts = pendData.products as Array<SoldProduct & { pendingQuantity: number }>;
          const existingIds = new Set(sales.map(p => p.productId));
          const newProds = pendProducts.filter(p => !existingIds.has(p.productId));
          if (newProds.length > 0) {
            merged = [...sales, ...newProds.map(p => ({ ...p, totalSold: p.pendingQuantity, source: 'pendiente' as const }))];
            newProds.forEach(p => { init[String(p.productId)] = p.pendingQuantity; });
          }
          setPendingItems(pendProducts);
        }
      } catch {}

      setSoldProducts(merged);
      setSalesInfo({ totalProducts: merged.length, totalUnits: Object.values(init).reduce((s, n) => s + n, 0) });
      setQuantities(init);
    } catch { setFormError('Error de conexión'); }
    finally { setCalculating(false); }
  };

  // ── Load pending items ──
  const loadPendingItems = async () => {
    if (!formSupplierId) return;
    setLoadingPending(true);
    try {
      const res = await fetch(`/api/orders/pending-items?supplierId=${formSupplierId}`);
      const data = await res.json();
      if (res.ok && data.products?.length > 0) {
        const pendingProducts = data.products as Array<SoldProduct & { pendingQuantity: number }>;
        setPendingItems(pendingProducts);
        // Add pending items to sold products if they're not already there
        const existingIds = new Set(soldProducts.map(p => p.productId));
        const newProds = pendingProducts.filter((p) => !existingIds.has(p.productId));
        if (newProds.length > 0) {
          const merged = [...soldProducts, ...newProds];
          setSoldProducts(merged);
          const qty = { ...quantities };
          newProds.forEach((p) => { qty[String(p.productId)] = p.pendingQuantity; });
          setQuantities(qty);
        }
      }
    } catch {}
    finally { setLoadingPending(false); }
  };

  // ── Manual product search ──
  useEffect(() => {
    const query = manualSearch.trim();
    if (!showManualAdd || query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setManualSearching(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(query)}&limit=20`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Error al buscar productos');
        const data = await res.json();
        const supplierPid = formSupplierId ? parseInt(formSupplierId) : null;
        setManualResults((data.products || []).map((p: ProductSearchResult) => {
          const lines = p.productLines || [];
          const line = lines.find(l => l.supplierId === supplierPid && l.isPrimary)
            ?? lines.find(l => l.supplierId === supplierPid);
          return {
            productId: p.id,
            name: p.name,
            barcode: p.barcode,
            price: p.price,
            cost: p.cost,
            stock: p.stock,
            minStock: p.minStock,
            department: p.department || null,
            supplierPrice: line?.supplierPrice ?? null,
            totalSold: 0,
          };
        }));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setManualResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setManualSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [manualSearch, showManualAdd, formSupplierId]);

  const addManualProduct = (product: SoldProduct) => {
    // Check if already in the list
    if (soldProducts.some(p => p.productId === product.productId)) {
      // Just increase quantity
      setQuantities(prev => ({
        ...prev,
        [String(product.productId)]: (prev[String(product.productId)] || 0) + 1,
      }));
      setShowManualAdd(false);
      setManualSearch('');
      setManualResults([]);
      return;
    }
    // Add to sold products list
    setSoldProducts(prev => [...prev, product]);
    setQuantities(prev => ({ ...prev, [String(product.productId)]: 1 }));
    setShowManualAdd(false);
    setManualSearch('');
    setManualResults([]);
  };

  // ── Extra columns ──
  const addExtraColumn = () => {
    if (newColumnKey === 'custom_text') {
      const name = customColumnName.trim() || 'Texto personalizado';
      const colId = `col_${Date.now()}`;
      setExtraColumns(prev => [...prev, { id: colId, name, key: 'custom_text' }]);
      setManualColumns(prev => ({ ...prev, [colId]: {} }));
      setCustomColumnName('');
    } else {
      const opt = EXTRA_COLUMN_OPTIONS.find(o => o.key === newColumnKey);
      if (!opt) return;
      setExtraColumns(prev => [...prev, { id: `col_${Date.now()}`, name: opt.label, key: opt.key }]);
    }
    setShowAddColumn(false);
  };
  const removeExtraColumn = (id: string) => {
    setExtraColumns(prev => prev.filter(c => c.id !== id));
    setManualColumns(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // ── Toggle row visibility ──
  const toggleRow = (productId: number) => {
    setHiddenRows(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // ── Create order ──
  const handleCreate = async (e: React.FormEvent, status?: string) => {
    e.preventDefault();
    setFormError('');
    const items = Object.entries(quantities)
      .filter(([pid, qty]) => qty > 0 && !hiddenRows.has(parseInt(pid)))
      .map(([pid, quantity]) => {
        const productId = parseInt(pid);
        if (productId < 0) {
          // Producto fantasma: se envía con sus datos rellenados
          const ghost = soldProducts.find((p) => p.productId === productId && p.ghost);
          if (!ghost) return null;
          return {
            name: ghost.name,
            barcode: ghost.barcode,
            price: ghost.price,
            cost: ghost.cost,
            quantity,
          };
        }
        return { productId, quantity };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (items.length === 0) { setFormError('No hay productos con cantidad > 0'); return; }
    setFormLoading(true);
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: parseInt(formSupplierId), notes: formNotes, status, items }),
    });
    const data = await res.json();
    setFormLoading(false);
    if (!res.ok) { setFormError(data.error || 'Error al crear'); return; }
    toast.success(status === 'on_hold' ? 'Pedido guardado en espera' : 'Pedido creado');
    setCreateOpen(false); resetForm(); fetchOrders(1);
  };

  const addGhostProduct = () => {
    const name = ghostName.trim();
    if (!name) { setFormError('Indica el nombre del producto'); return; }
    const qty = Math.max(1, parseInt(ghostQty) || 1);
    const id = -Math.floor(Math.random() * 1_000_000) - 1;
    setSoldProducts(prev => [...prev, {
      productId: id,
      name,
      barcode: ghostBarcode.trim(),
      price: parseFloat(ghostPrice) || 0,
      cost: parseFloat(ghostCost) || 0,
      stock: 0,
      minStock: 0,
      department: null,
      supplierPrice: parseFloat(ghostCost) || 0,
      totalSold: 0,
      ghost: true,
    }]);
    setQuantities(prev => ({ ...prev, [String(id)]: qty }));
    setGhostName(''); setGhostBarcode(''); setGhostPrice('0'); setGhostCost('0'); setGhostQty('1');
  };

  // ── Partial receive ──
  const openReceiveDialog = (order: Order) => {
    setSelectedOrder(order);
    const init: Record<number, number> = {};
    const initCost: Record<number, string> = {};
    const initPrice: Record<number, string> = {};
    const initBatch: Record<number, string> = {};
    order.items.forEach(i => {
      init[i.id] = i.receivedQuantity;
      const line = i.product?.productLines?.find(l => l.supplierId === order.supplierId && l.isPrimary)
        ?? i.product?.productLines?.find(l => l.supplierId === order.supplierId);
      initCost[i.id] = String(i.costPrice ?? line?.supplierPrice ?? i.product?.cost ?? 0);
      // Producto fantasma: recuperar el precio de venta guardado en las notas
      const priceMatch = (i.notes || '').match(/P\. venta:\s*([\d.]+)/);
      initPrice[i.id] = priceMatch ? priceMatch[1] : String(i.product?.price ?? 0);
      initBatch[i.id] = '';
    });
    setReceiveQuantities(init);
    setReceiveCosts(initCost);
    setReceivePrices(initPrice);
    setReceiveBatches(initBatch);
    setReceiveExtras([]);
    setExtraSearch('');
    setExtraResults([]);
    setReceiveOpen(true);
  };

  const extraProfit = receiveExtras.reduce((s, e) => {
    const qty = parseInt(e.quantity) || 0;
    const cost = parseFloat(e.costPrice) || 0;
    const price = parseFloat(e.price) || 0;
    return s + qty * (price - cost);
  }, 0);

  const extraTotalCost = receiveExtras.reduce((s, e) => {
    const qty = parseInt(e.quantity) || 0;
    const cost = parseFloat(e.costPrice) || 0;
    return s + qty * cost;
  }, 0);

  // Pérdida por piezas no recibidas (quedan pendientes y nunca entraron a venta)
  const receivePendingLoss = selectedOrder
    ? selectedOrder.items.filter(i => !i.extra).reduce((s, i) => {
        const recv = receiveQuantities[i.id] ?? i.receivedQuantity;
        const cost = i.costPrice ?? i.product?.cost ?? 0;
        return s + Math.max(0, i.quantity - recv) * cost;
      }, 0)
    : 0;
  const receiveNetAfterLoss = extraProfit - receivePendingLoss;

  const handleExtraSearch = (q: string) => {
    setExtraSearch(q);
    if (!q.trim()) { setExtraResults([]); return; }
    setExtraSearching(true);
    fetch(`/api/products?q=${encodeURIComponent(q)}&limit=6`)
      .then(r => r.json())
      .then(d => setExtraResults(d.products || []))
      .catch(() => setExtraResults([]))
      .finally(() => setExtraSearching(false));
  };

  const addExtraProduct = (p: ProductSearchResult) => {
    setReceiveExtras(prev => [
      ...prev,
      {
        key: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: p.id,
        name: p.name,
        quantity: '1',
        costPrice: String(p.cost ?? 0),
        price: String(p.price ?? 0),
        expiresAt: '',
      },
    ]);
    setExtraSearch('');
    setExtraResults([]);
  };

  const updateExtra = (key: string, field: keyof ReceiveExtra, value: string) => {
    setReceiveExtras(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
  };

  const removeExtra = (key: string) => {
    setReceiveExtras(prev => prev.filter(e => e.key !== key));
  };

  const handleReceive = async () => {
    if (!selectedOrder) return;
    setReceiveLoading(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedOrder.items.map(i => ({
            orderItemId: i.id,
            receivedQuantity: receiveQuantities[i.id] ?? i.receivedQuantity,
            expiresAt: (receiveBatches[i.id] || '').trim() || null,
            costPrice: receiveCosts[i.id] !== undefined ? parseFloat(receiveCosts[i.id]) : null,
            price: receivePrices[i.id] !== undefined ? parseFloat(receivePrices[i.id]) : null,
          })),
          extras: receiveExtras.map(e => ({
            productId: e.productId,
            quantity: parseInt(e.quantity) || 0,
            costPrice: e.costPrice ? parseFloat(e.costPrice) : null,
            price: e.price ? parseFloat(e.price) : null,
            expiresAt: e.expiresAt.trim() || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al recibir pedido');
      } else {
        toast.success('Recepción guardada');
        setReceiveOpen(false);
        setSelectedOrder(null);
        fetchOrders(orderPage);
      }
    } catch {
      toast.error('Error al recibir pedido');
    }
    setReceiveLoading(false);
  };

  const handleReorderMissing = async () => {
    if (!selectedOrder) return;
    setReorderLoading(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/reorder-missing`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al repedir faltantes');
      } else {
        toast.success('Pedido de faltantes creado');
        fetchOrders(orderPage);
      }
    } catch {
      toast.error('Error al repedir faltantes');
    }
    setReorderLoading(false);
  };

  // Marca un pedido "en espera" como listo
  const setOrderReady = async (order: Order) => {
    if (!window.confirm(`¿Marcar el pedido #${order.id} como listo?`)) return;
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al marcar como listo');
        return;
      }
      toast.success(`Pedido #${order.id} marcado como listo`);
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => prev ? { ...prev, status: 'ready' } : prev);
      }
      fetchOrders(orderPage);
    } catch {
      toast.error('Error al marcar como listo');
    }
  };

  // ── Edit mode: añadir/quitar items ──
  const [editItemSearch, setEditItemSearch] = useState('');
  const [editItemResults, setEditItemResults] = useState<ProductSearchResult[]>([]);
  const [editGhostName, setEditGhostName] = useState('');
  const [editGhostQty, setEditGhostQty] = useState('1');
  const [editGhostPrice, setEditGhostPrice] = useState('0');
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);

  // ── Edit items ──
  const updateOrderItem = (itemId: number, field: string, value: string | number) => {
    if (!selectedOrder) return;
    setSelectedOrder({
      ...selectedOrder,
      items: selectedOrder.items.map(i =>
        i.id === itemId ? { ...i, [field]: field === 'notes' ? value : parseInt(String(value)) || 0 } : i
      ),
    });
  };

  const removeEditedItem = (itemId: number) => {
    if (!selectedOrder) return;
    setRemovedItemIds(prev => [...prev, itemId]);
    setSelectedOrder({
      ...selectedOrder,
      items: selectedOrder.items.filter(i => i.id !== itemId),
    });
  };

  const addEditedItem = (productId: number, name: string, barcode: string) => {
    if (!selectedOrder) return;
    const existing = selectedOrder.items.find(i => i.productId === productId && i.id > 0);
    if (existing) {
      setSelectedOrder({
        ...selectedOrder,
        items: selectedOrder.items.map(i =>
          i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      setSelectedOrder({
        ...selectedOrder,
        items: [...selectedOrder.items, {
          id: -Date.now(),
          productId,
          quantity: 1,
          product: { id: productId, name, barcode, price: 0, cost: 0, stock: 0, active: true },
          receivedQuantity: 0,
          notes: '',
        }],
      });
    }
    setEditItemSearch('');
    setEditItemResults([]);
  };

  const addEditedGhost = () => {
    if (!selectedOrder || !editGhostName.trim()) return;
    setSelectedOrder({
      ...selectedOrder,
      items: [...selectedOrder.items, {
        id: -Date.now() - 1,
        productId: null,
        productName: editGhostName.trim(),
        productBarcode: '',
        quantity: Math.max(1, parseInt(editGhostQty) || 1),
        product: null,
        receivedQuantity: 0,
        notes: `P. venta: ${parseFloat(editGhostPrice) || 0}`,
      }],
    });
    setEditGhostName('');
    setEditGhostQty('1');
    setEditGhostPrice('0');
  };

  // Búsqueda de productos en modo edición
  useEffect(() => {
    if (!editMode || editItemSearch.trim().length < 2) {
      setEditItemResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(editItemSearch.trim())}&limit=6`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setEditItemResults(res.ok ? data.products || [] : []);
      } catch {
        setEditItemResults([]);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [editItemSearch, editMode]);

  const saveEditedItems = async () => {
    if (!selectedOrder) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedOrder.items.map(i => {
            const base = {
              id: i.id > 0 ? i.id : undefined,
              productId: i.productId ?? undefined,
              name: i.productId === null ? (i.productName || '') : undefined,
              barcode: i.productId === null ? (i.productBarcode || '') : undefined,
              quantity: i.quantity,
              receivedQuantity: i.receivedQuantity,
              notes: i.notes,
              cost: i.productId === null ? (i.costPrice ?? undefined) : undefined,
            };
            if (base.id === undefined) {
              const { id, ...rest } = base;
              return rest;
            }
            return base;
          }),
          removedItemIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar');
        return;
      }
      toast.success('Cambios guardados');
      setEditMode(false);
      setRemovedItemIds([]);
      setEditItemResults([]);
      fetchOrders(orderPage);
    } catch {
      toast.error('Error al guardar');
    }
    setFormLoading(false);
  };

  // ── Export (PNG or CSV) ──
  const handleExport = async (format: 'png' | 'csv') => {
    if (!selectedOrder) return;
    setExporting(true);
    try {
      const { items, supplier, id, createdAt, notes } = selectedOrder;
      const dateStr = new Date(createdAt).toLocaleDateString('es-MX', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      // Columnas seleccionadas para el export (mínimo: código, nombre, cantidad)
      const cols = EXPORT_COLUMN_OPTIONS.filter(c => exportCols.has(c.key));
      const headerCells = cols.map(c => {
        const align = c.key === 'index' || c.key === 'quantity' || c.key === 'received' || c.key === 'pending'
          ? ' class="center"'
          : (c.key === 'price' || c.key === 'supplierPrice' || c.key === 'profit' ? ' class="right"' : '');
        return `<th${align}>${c.label}</th>`;
      }).join('');

      // Build a standalone HTML document for export
      let totalProfit = 0;
      const hasProfitCol = cols.some(c => c.key === 'profit');
      const rowsHtml = items.map((item, idx) => {
        const pending = Math.max(0, item.quantity - item.receivedQuantity);
        const line = item.product?.productLines?.find(l => l.supplierId === supplier?.id && l.isPrimary)
          ?? item.product?.productLines?.find(l => l.supplierId === supplier?.id);
        const unitCost = item.costPrice ?? line?.supplierPrice ?? item.product?.cost ?? 0;
        const unitProfit = (item.product?.price ?? 0) - unitCost;
        const lineProfit = unitProfit * item.quantity;
        totalProfit += lineProfit;

        const styles: Record<string, string> = {
          padding: '6px 8px',
          borderBottom: '1px solid #334155',
          fontSize: '14px',
          color: '#e2e8f0',
        };
        const cell = (extra: Record<string, string>) =>
          `<td style="${Object.entries({ ...styles, ...extra }).map(([k, v]) => `${k}:${v}`).join(';')}">${extra.content}</td>`;

        return `<tr>` + cols.map(c => {
          switch (c.key) {
            case 'index': return cell({ textAlign: 'center', fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8', content: String(idx + 1) });
            case 'barcode': return cell({ fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8', content: item.product?.barcode || item.productBarcode || '—' });
            case 'name': return cell({ content: item.product?.name || item.productName || `#${item.productId ?? '?'}` });
            case 'quantity': return cell({ textAlign: 'center', content: String(item.quantity) });
            case 'received': return cell({ textAlign: 'center', fontSize: '14px', color: '#94a3b8', content: String(item.receivedQuantity) });
            case 'pending': return cell({ textAlign: 'center', fontSize: '14px', color: pending > 0 ? '#fbbf24' : '#34d399', content: pending > 0 ? String(pending) : '✓' });
            case 'price': return cell({ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8', content: (item.product?.price ?? 0) > 0 ? '$' + (item.product?.price ?? 0).toFixed(2) : '—' });
            case 'supplierPrice': return cell({ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8', content: unitCost > 0 ? '$' + unitCost.toFixed(2) : '—' });
            case 'profit': return cell({ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: lineProfit >= 0 ? '#34d399' : '#f87171', content: (lineProfit >= 0 ? '+' : '') + '$' + lineProfit.toFixed(2) });
            default: return '';
          }
        }).join('') + '</tr>';
      }).join('');

      const profitFooter = hasProfitCol ? `<tfoot><tr>
        <td colspan="${cols.length - 1}" style="padding:8px;text-align:right;font-size:14px;color:#e2e8f0;border-top:2px solid #334155">Ganancia neta estimada:</td>
        <td style="padding:8px;text-align:right;font-size:15px;font-weight:600;font-family:monospace;color:${totalProfit >= 0 ? '#34d399' : '#f87171'};border-top:2px solid #334155">${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}</td>
      </tr></tfoot>` : '';

      const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pedido #${id}</title>
<style>
  body { margin:0; padding:20px; background:#0f172a; color:#e2e8f0; font-family:-apple-system,system-ui,sans-serif; }
  .container { max-width:800px; margin:0 auto; }
  h1 { font-size:20px; text-align:center; margin-bottom:4px; }
  .meta { text-align:center; font-size:12px; color:#94a3b8; margin-bottom:16px; }
  .supplier { text-align:center; font-size:14px; margin-bottom:20px; }
  .supplier span { font-weight:600; }
  .notes { text-align:center; font-size:12px; color:#94a3b8; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; }
  th { padding:8px; background:#1e293b; font-size:12px; text-align:left; color:#94a3b8; border-bottom:2px solid #334155; }
  th.center { text-align:center; }
  th.right { text-align:right; }
  .footer { text-align:center; font-size:10px; color:#64748b; margin-top:16px; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>
<div class="container">
  <h1>Pedido #${id}</h1>
  <div class="meta">${dateStr}</div>
  <div class="supplier">Proveedor: <span>${supplier?.name || '—'}</span></div>
  ${notes ? `<div class="notes">Notas: ${notes}</div>` : ''}
  <table>
    <thead><tr>
      ${headerCells}
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    ${profitFooter}
  </table>
  <div class="footer">Generado por POS System — ${new Date().toLocaleString('es-MX')}</div>
</div>
</body></html>`;

      if (format === 'png') {
        // PNG: render HTML to a temporary element and capture with html2canvas
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#0f172a;padding:20px;z-index:-1';
        container.innerHTML = htmlContent;
        document.body.appendChild(container);

        const html2canvas = (await import('html2canvas')).default;
        // Wait for rendering
        await new Promise(r => setTimeout(r, 100));
        const canvas = await html2canvas(container, {
          backgroundColor: '#0f172a',
          scale: 2,
        });
        document.body.removeChild(container);
        const link = document.createElement('a');
        link.download = `pedido_${id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        // CSV: archivo separado por comas. Con BOM para que Excel muestre
        // correctamente caracteres especiales (ñ, tildes).
        const escapeCsv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
        const rows: string[][] = [];
        rows.push(cols.map(c => c.label));

        items.forEach((item, idx) => {
          const pending = Math.max(0, item.quantity - item.receivedQuantity);
          const line = item.product?.productLines?.find(l => l.supplierId === supplier?.id && l.isPrimary)
            ?? item.product?.productLines?.find(l => l.supplierId === supplier?.id);
          const unitCost = item.costPrice ?? line?.supplierPrice ?? item.product?.cost ?? 0;
          const unitProfit = (item.product?.price ?? 0) - unitCost;

          rows.push(cols.map(c => {
            switch (c.key) {
              case 'index': return String(idx + 1);
              case 'barcode': return item.product?.barcode || item.productBarcode || '—';
              case 'name': return item.product?.name || item.productName || `#${item.productId ?? '?'}`;
              case 'quantity': return String(item.quantity);
              case 'received': return String(item.receivedQuantity);
              case 'pending': return pending > 0 ? String(pending) : '0';
              case 'price': return (item.product?.price ?? 0) > 0 ? (item.product?.price ?? 0).toFixed(2) : '';
              case 'supplierPrice': return unitCost > 0 ? unitCost.toFixed(2) : '';
              case 'profit': return unitProfit.toFixed(2);
              default: return '';
            }
          }));
        });

        const csv = '\uFEFF' + rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pedido_${id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
    setExporting(false);
  };

  // ── Computed ──
  const visibleProducts = soldProducts.filter(p => !hiddenRows.has(p.productId));
  const orderedCount = Object.entries(quantities)
    .filter(([pid, q]) => q > 0 && !hiddenRows.has(parseInt(pid))).length;
  const totalUnits = Object.entries(quantities)
    .filter(([pid]) => !hiddenRows.has(parseInt(pid)))
    .reduce((s, [, q]) => s + q, 0);

  // Pérdida estimada: costo de las piezas extra (por encima de las ventas reales).
  // Si esas piezas no se venden, esa cantidad se pierde de la ganancia actual.
  // Es información simbólica: no modifica finanzas ni inventario.
  const unitCostOf = (p: SoldProduct) => p.supplierPrice ?? p.cost;
  const lossBreakdown = visibleProducts
    .map((p) => {
      const qty = quantities[String(p.productId)] || 0;
      const extras = Math.max(0, qty - (p.totalSold || 0));
      const unitCost = unitCostOf(p);
      return { productId: p.productId, name: p.name, qty: extras, unitCost, total: extras * unitCost };
    })
    .filter((p) => p.qty > 0);
  const estimatedLoss = lossBreakdown.reduce((sum, p) => sum + p.total, 0);

  // Ganancia neta proyectada del pedido y resultado tras restar las pérdidas
  const projectedProfit = visibleProducts
    .filter((p) => (quantities[String(p.productId)] || 0) > 0)
    .reduce((s, p) => s + (quantities[String(p.productId)] || 0) * (p.price - unitCostOf(p)), 0);
  const netAfterLoss = projectedProfit - estimatedLoss;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Pedidos a Proveedores</h2>
          <p className="text-sm text-slate-400 mt-1">
            Genera pedidos basados en ventas reales + recepción parcial + exportación
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuevo Pedido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuevo Pedido — Basado en Ventas</DialogTitle>
              <DialogDescription>
                Selecciona proveedor, rango de fechas/horas y calcula qué productos reponer
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="space-y-5 py-4">
                {formError && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">{formError}</div>
                )}

                {/* Pérdida estimada de piezas extra (solo admin, simbólico) */}
                {isAdmin && (
                  <div className="flex flex-col items-end gap-2">
                    <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setShowProfitInfo(v => !v)}>
                      {showProfitInfo ? 'Ocultar datos de ganancia' : 'Ver ganancia estimada'}
                    </Button>
                    {showProfitInfo && orderedCount > 0 && (
                      <div className="rounded-lg border border-red-600/50 bg-red-900/30 px-4 py-2 text-right">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">
                          Pérdida estimada si no se venden las piezas extra
                        </p>
                        <p className="text-xl font-bold text-red-400">{formatCurrency(estimatedLoss)}</p>
                        {lossBreakdown.length > 0 && (
                          <div className="mt-1 space-y-0.5 border-t border-red-800/60 pt-1">
                            {lossBreakdown.map((p) => (
                              <div key={p.productId} className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                                <span className="max-w-[220px] truncate">{p.name} x{p.qty}</span>
                                <span className="font-mono text-slate-300">
                                  {formatCurrency(p.unitCost)} c/u = {formatCurrency(p.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="mt-1 text-[10px] text-slate-500">
                          Total invertido en piezas que no han salido por venta (precio proveedor). Información simbólica.
                        </p>
                        <div className="mt-2 space-y-1 border-t border-red-800/60 pt-2">
                          <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                            <span>Ganancia Neta (proyectada)</span>
                            <span className="font-mono text-emerald-400">{formatCurrency(projectedProfit)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                            <span className="text-slate-200">Ganancia Neta − Pérdidas Totales</span>
                            <span className={`font-mono ${netAfterLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatCurrency(netAfterLoss)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Proveedor */}
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <Select value={formSupplierId} onValueChange={v => { setFormSupplierId(v); setPendingItems(null); }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.length === 0 && <SelectItem value="all" disabled>No hay proveedores</SelectItem>}
                      {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fechas y horas */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-slate-400" />Desde fecha</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-slate-400" />Hasta fecha</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />Desde hora</Label>
                    <Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />Hasta hora</Label>
                    <Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} />
                  </div>
                </div>

                {/* Botones: Calcular + Pendientes + Notas */}
                <div className="flex items-end gap-2 flex-wrap">
                  <Button type="button" className="bg-emerald-700 hover:bg-emerald-600" onClick={calculateSales} disabled={calculating || !formSupplierId}>
                    <Calculator className="mr-2 h-4 w-4" />{calculating ? 'Calculando...' : 'Calcular Ventas'}
                  </Button>
                  {formSupplierId && (
                    <Button type="button" variant="outline" size="sm" onClick={loadPendingItems} disabled={loadingPending}>
                      <History className="mr-2 h-4 w-4" />{loadingPending ? 'Cargando...' : 'Pendientes de recibir'}
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => { setShowManualAdd(true); setManualSearch(''); setManualResults([]); }}>
                    <PlusCircle className="mr-2 h-4 w-4" />Agregar producto
                  </Button>
                  <div className="flex-1 min-w-[200px] space-y-2">
                    <Label>Notas del pedido</Label>
                    <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Opcional" />
                  </div>
                </div>

                {/* Resultados */}
                {salesInfo && (
                  <div className="flex items-center justify-between text-sm bg-slate-700/30 rounded-md px-4 py-2">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-300"><Package className="h-3.5 w-3.5 inline mr-1 text-emerald-400" />{salesInfo.totalProducts} productos vendidos</span>
                      <span className="text-slate-300">{salesInfo.totalUnits} unidades</span>
                      {pendingItems && <Badge variant="outline" className="text-amber-400 border-amber-600">{pendingItems.length} pendientes</Badge>}
                    </div>
                  </div>
                )}

                {/* Tabla */}
                {soldProducts.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">
                        Productos {visibleProducts.length !== soldProducts.length && <Badge variant="secondary" className="ml-1">{visibleProducts.length} mostrados</Badge>}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setHiddenRows(new Set())}>Mostrar todo</Button>
                        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => { const u: Record<string, number> = {}; soldProducts.forEach(p => { u[String(p.productId)] = p.totalSold; }); setQuantities(u); }}>Restaurar ventas</Button>
                        <Button type="button" variant="ghost" size="sm" className="text-xs text-blue-400" onClick={() => setShowAddColumn(!showAddColumn)}><Columns className="h-3 w-3 mr-1" />Columna extra</Button>
                      </div>
                    </div>

                    {showAddColumn && (
                      <div className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-md flex-wrap">
                        <span className="text-xs text-slate-400">Añadir columna:</span>
                        <Select value={newColumnKey} onValueChange={v => { setNewColumnKey(v); setCustomColumnName(''); }}>
                          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EXTRA_COLUMN_OPTIONS.filter(o => !extraColumns.find(ec => ec.key === o.key)).map(o => (
                              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {newColumnKey === 'custom_text' && (
                          <Input
                            value={customColumnName}
                            onChange={e => setCustomColumnName(e.target.value)}
                            placeholder="Nombre de la columna..."
                            className="w-44 h-8 text-xs"
                          />
                        )}
                        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addExtraColumn}><PlusCircle className="h-3 w-3 mr-1" />Agregar</Button>
                      </div>
                    )}

                    <div className="overflow-x-auto border border-slate-700 rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-800/80">
                            <TableHead className="w-8"></TableHead>
                            <TableHead className="w-10 text-center">#</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead className="min-w-[180px]">Nombre</TableHead>
                            <TableHead className="w-28 text-center">Unidades</TableHead>
                            {extraColumns.map(col => (
                              <TableHead key={col.id} className="min-w-[90px] text-right">
                                <div className="flex items-center gap-1 justify-end">
                                  {col.name}
                                  <button type="button" onClick={() => removeExtraColumn(col.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {soldProducts.map((product, idx) => {
                            const hidden = hiddenRows.has(product.productId);
                            return (
                              <TableRow key={product.productId} className={`${hidden ? 'hidden' : ''} hover:bg-slate-700/40 ${(quantities[String(product.productId)] || 0) > 0 ? 'bg-emerald-900/10' : ''}`}>
                                <TableCell>
                                  <button type="button" onClick={() => toggleRow(product.productId)} className="text-red-400 hover:text-red-300 opacity-60 hover:opacity-100" title="Eliminar fila">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TableCell>
                                <TableCell className="text-center text-xs text-slate-500 font-mono">{idx + 1}</TableCell>
                                <TableCell className="font-mono text-xs text-slate-400">{product.barcode || '—'}</TableCell>
                                <TableCell className="text-sm text-slate-200">
                                  {product.name}
                                  {product.ghost && (
                                    <Badge variant="outline" className="ml-2 text-sky-400 border-sky-700 text-[10px]">sin inventario</Badge>
                                  )}
                                  {product.source === 'pendiente' && (
                                    <Badge variant="outline" className="ml-2 text-amber-400 border-amber-600 text-[10px]">pendiente</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Input type="number" min="0" value={quantities[String(product.productId)] || 0}
                                    onChange={e => { const v = parseInt(e.target.value) || 0; setQuantities(prev => ({ ...prev, [String(product.productId)]: Math.max(0, v) })); }}
                                    className="w-20 h-8 text-center text-sm" />
                                </TableCell>
                                {extraColumns.map(col => (
                                  <TableCell key={col.id} className="text-right text-sm text-slate-300">
                                    {col.key === 'custom_text' ? (
                                      <Input
                                        type="text"
                                        value={manualColumns[col.id]?.[String(product.productId)] || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setManualColumns(prev => ({
                                            ...prev,
                                            [col.id]: { ...(prev[col.id] || {}), [String(product.productId)]: val },
                                          }));
                                        }}
                                        placeholder="—"
                                        className="w-full h-7 text-xs text-center"
                                      />
                                    ) : (
                                      <span className="font-mono">{fmtSold(product, col.key)}</span>
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Hidden rows summary */}
                    {hiddenRows.size > 0 && (
                      <div className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {hiddenRows.size} producto(s) oculto(s) — no se incluirán en el pedido
                      </div>
                    )}

                    <div className="text-sm text-slate-400">{orderedCount} productos con pedido · {totalUnits} unidades</div>
                  </>
                )}

                {!formSupplierId && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Selecciona un proveedor, ajusta el rango de fechas y horas, y presiona &quot;Calcular Ventas&quot;
                  </div>
                )}
              </div>

              {/* ── Manual Product Search Dialog ── */}
              <Dialog open={showManualAdd} onOpenChange={setShowManualAdd}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Agregar Producto Manualmente</DialogTitle>
                    <DialogDescription>
                      Busca un producto por nombre o código para agregarlo al pedido
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Buscar producto..."
                        value={manualSearch}
                        onChange={e => {
                          const value = e.target.value;
                          setManualSearch(value);
                          if (value.trim().length < 2) {
                            setManualResults([]);
                            setManualSearching(false);
                          }
                        }}
                        className="pl-10"
                        autoFocus
                      />
                    </div>
<div className="max-h-60 overflow-y-auto space-y-1">
                      {manualSearching ? (
                        <div className="text-center py-4 text-sm text-slate-400">Buscando...</div>
                      ) : manualResults.length === 0 && manualSearch.length >= 2 ? (
                        <div className="text-center py-4 text-sm text-slate-500">Sin resultados</div>
                      ) : manualResults.length === 0 ? (
                        <div className="text-center py-4 text-sm text-slate-500">Escribe al menos 2 caracteres</div>
                      ) : (
                        manualResults.map(p => (
                          <button
                            key={p.productId}
                            type="button"
                            onClick={() => addManualProduct(p)}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-700/60 transition-colors flex items-center justify-between"
                          >
                            <div>
                              <div className="text-sm text-slate-200">{p.name}</div>
                              <div className="text-xs text-slate-500 font-mono">{p.barcode || '—'} · Stock: {p.stock} · ${p.price.toFixed(2)}</div>
                            </div>
                            <PlusCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Producto sin inventario (fantasma) */}
                  <div className="rounded-md border border-dashed border-sky-700/60 bg-sky-950/20 p-3 space-y-2">
                    <div>
                      <span className="text-sm font-medium text-sky-300 flex items-center gap-2">
                        <PlusCircle className="h-4 w-4" /> Producto sin inventario
                      </span>
                      <p className="text-[11px] text-sky-300/70 mt-0.5">
                        Rellénalo como si lo tuvieras: se guarda en el pedido y al confirmar su recepción se crea solo en el inventario.
                      </p>
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5">
                        <Input placeholder="Nombre *" value={ghostName} onChange={e => setGhostName(e.target.value)} />
                      </div>
                      <div className="col-span-4">
                        <Input placeholder="Código (opcional)" value={ghostBarcode} onChange={e => setGhostBarcode(e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min="1" placeholder="Cantidad" value={ghostQty} onChange={e => setGhostQty(e.target.value)} />
                      </div>
                      <div className="col-span-6">
                        <Input type="number" step="0.01" min="0" placeholder="P. Proveedor (costo)" value={ghostCost} onChange={e => setGhostCost(e.target.value)} />
                      </div>
                      <div className="col-span-6">
                        <Input type="number" step="0.01" min="0" placeholder="Precio de venta" value={ghostPrice} onChange={e => setGhostPrice(e.target.value)} />
                      </div>
                    </div>
<Button type="button" size="sm" variant="outline" className="text-sky-300 border-sky-700/60 hover:bg-sky-500/10" onClick={addGhostProduct} disabled={!ghostName.trim()}>
                      <PlusCircle className="h-3.5 w-3.5 mr-1" />Agregar al pedido
                    </Button>
                  </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

              <DialogFooter className="border-t border-slate-700 pt-4">
                <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
                <Button
                  type="button"
                  variant="outline"
                  className="border-amber-600/50 text-amber-400 hover:bg-amber-500/10"
                  disabled={formLoading || orderedCount === 0}
                  onClick={(e) => handleCreate(e, 'on_hold')}
                >
                  {formLoading ? 'Guardando...' : '⏸ Guardar en espera'}
                </Button>
                <Button type="submit" disabled={formLoading || orderedCount === 0}>
                  {formLoading ? 'Creando...' : `Crear Pedido (${orderedCount} prods.)`}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Orders List ── */}
      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Recibidas</TableHead>
                <TableHead>Aprox.</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-slate-700" /></TableCell>)}</TableRow>
              )) : orders.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">No hay pedidos creados</TableCell></TableRow>
              ) : orders.map(order => {
                const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const totalRecv = order.items.reduce((s, i) => s + i.receivedQuantity, 0);
                const approxTotal = order.items.reduce((s, i) => s + i.quantity * (i.costPrice ?? i.product?.cost ?? 0), 0);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-slate-400">#{order.id}</TableCell>
                    <TableCell className="font-medium text-slate-100">{order.supplier?.name || '—'}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-slate-300">{order.items.length}</TableCell>
                    <TableCell className="text-slate-300">{totalQty}</TableCell>
                    <TableCell>
                      {order.status === 'received' ? (
                        <Badge variant={totalRecv >= totalQty ? 'default' : 'secondary'} className={totalRecv < totalQty ? 'bg-amber-900/40 text-amber-400' : ''}>
                          {totalRecv}/{totalQty}
                        </Badge>
                      ) : <span className="text-slate-500">—</span>}
                    </TableCell>
                    <TableCell className={order.status === 'on_hold' ? 'text-amber-400 font-medium' : 'text-slate-500'}>
                      {approxTotal > 0 ? formatCurrency(approxTotal) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedOrder(order); setDetailOpen(true); setEditMode(false); }} title="Ver detalle"><Eye className="h-4 w-4 text-slate-400" /></Button>
                        {order.status === 'on_hold' && (
                          <Button variant="ghost" size="icon" onClick={() => setOrderReady(order)} title="Marcar como listo"><Clock className="h-4 w-4 text-amber-400" /></Button>
                        )}
                        {order.status !== 'received' && order.status !== 'cancelled' && (
                          <Button variant="ghost" size="icon" onClick={() => openReceiveDialog(order)} title="Recibir productos"><CheckCircle className="h-4 w-4 text-emerald-400" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {orderPagination.total > 0
            ? `Página ${orderPagination.page} de ${orderPagination.totalPages} · ${orderPagination.total} pedidos`
            : '0 pedidos'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || orderPage <= 1}
            onClick={() => fetchOrders(orderPage - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !orderPagination.hasMore}
            onClick={() => fetchOrders(orderPage + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* ── Receive Dialog ── */}
      <Dialog open={receiveOpen} onOpenChange={o => { setReceiveOpen(o); if (!o) setSelectedOrder(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
              Recibir Pedido #{selectedOrder?.id}
            </DialogTitle>
            <DialogDescription>
              Ingresa cantidades recibidas, caducidad (opcional), y ajusta precios si es necesario. Las piezas no recibidas quedan como pendientes.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="text-sm text-slate-400 mb-2">
                Proveedor: <span className="text-slate-200 font-medium">{selectedOrder.supplier?.name}</span>
              </div>
              <div className="overflow-x-auto border border-slate-700 rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800/80">
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Pedido</TableHead>
                      <TableHead className="text-center w-20">Recibido</TableHead>
                      <TableHead className="text-center w-24">Caduca (MM/AAAA)</TableHead>
                      <TableHead className="text-center w-28">P. Proveedor</TableHead>
                      <TableHead className="text-center w-24">P. Venta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.filter(i => !i.extra).map(item => {
                      const received = receiveQuantities[item.id] ?? item.receivedQuantity;
                      const pending = Math.max(0, item.quantity - received);
                      const itemName = item.product?.name || item.productName || `#${item.productId ?? '?'}`;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="text-sm font-medium text-slate-200">{itemName}</div>
                            <div className="font-mono text-xs text-slate-500">
                              {item.product?.barcode || item.productBarcode || '—'}
                              {!item.product && <span className="ml-2 rounded bg-sky-950/60 px-1.5 py-0.5 text-[10px] text-sky-400 border border-sky-700/50">se creará al recibir</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-slate-300">{item.quantity}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number" min="0" max={item.quantity}
                              value={received}
                              onChange={e => setReceiveQuantities(prev => ({ ...prev, [item.id]: Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0)) }))}
                              className="w-20 h-8 text-center mx-auto"
                            />
                            {pending > 0 && <div className="text-[10px] text-amber-400 mt-0.5">{pending} faltan</div>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="text"
                              value={receiveBatches[item.id] ?? ''}
                              onChange={e => setReceiveBatches(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="MM/AAAA"
                              className="w-24 h-8 text-center mx-auto text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number" step="0.01" min="0"
                              value={receiveCosts[item.id] ?? ''}
                              onChange={e => setReceiveCosts(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-24 h-8 text-center mx-auto text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number" step="1" min="0"
                              value={receivePrices[item.id] ?? ''}
                              onChange={e => setReceivePrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-24 h-8 text-center mx-auto text-xs"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Extras (piezas que llegaron sin pedirse) */}
              <div className="rounded-md border border-red-800/60 bg-red-950/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-red-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Piezas extras (no pedidas)
                    </span>
                    <p className="text-[11px] text-red-300/70 mt-0.5">
                      Se descuentan de la ganancia neta. Faltante: el costo de las piezas no recibidas se recupera al costo total.
                    </p>
                  </div>
                  {receiveExtras.length > 0 && (
                    <div className="text-right">
                      <div className={`text-sm font-bold ${extraProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        Ganancia neta: {formatCurrency(extraProfit)}
                      </div>
                      <div className="text-[11px] text-slate-400">Costo total: {formatCurrency(extraTotalCost)}</div>
                      <div className={`text-xs font-semibold mt-0.5 ${receiveNetAfterLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        Ganancia Neta − Pérdidas Totales: {formatCurrency(receiveNetAfterLoss)}
                      </div>
                    </div>
                  )}
                </div>

                {receiveExtras.map(extra => (
                  <div key={extra.key} className="grid grid-cols-12 gap-2 items-end rounded-md border border-red-800 bg-red-950/40 p-2">
                    <div className="col-span-3">
                      <Label className="text-[10px] text-red-300/80">Producto</Label>
                      <div className="text-sm text-red-100 font-medium truncate">{extra.name}</div>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-red-300/80">Cantidad</Label>
                      <Input type="number" min="1" value={extra.quantity} onChange={e => updateExtra(extra.key, 'quantity', e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-red-300/80">Caduca (MM/AAAA)</Label>
                      <Input type="text" value={extra.expiresAt} onChange={e => updateExtra(extra.key, 'expiresAt', e.target.value)} placeholder="opcional" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-red-300/80">P. Proveedor</Label>
                      <Input type="number" step="0.01" min="0" value={extra.costPrice} onChange={e => updateExtra(extra.key, 'costPrice', e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-red-300/80">P. Venta</Label>
                      <Input type="number" step="1" min="0" value={extra.price} onChange={e => updateExtra(extra.key, 'price', e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" onClick={() => removeExtra(extra.key)} className="text-red-400 hover:text-red-300 transition-colors" title="Quitar extra">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <Input
                      placeholder="Buscar producto extra por nombre o código..."
                      value={extraSearch}
                      onChange={e => handleExtraSearch(e.target.value)}
                      className="pl-9 h-8 text-xs"
                    />
                    {extraResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                        {extraResults.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addExtraProduct(p)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 transition-colors"
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="font-mono text-slate-500 shrink-0">{p.barcode || '—'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {extraSearching && <span className="text-xs text-slate-500 py-2">Buscando...</span>}
                </div>
              </div>

              {/* Totals */}
              {(() => {
                const totalPedido = selectedOrder.items.filter(i => !i.extra).reduce((s, i) => s + i.quantity, 0);
                const totalRecibido = selectedOrder.items.filter(i => !i.extra).reduce((s, i) => s + (receiveQuantities[i.id] ?? i.receivedQuantity), 0);
                const totalPendiente = totalPedido - totalRecibido;
                return (
                  <div className="flex justify-between text-sm px-1">
                    <span className="text-slate-400">Total pedido: <span className="text-slate-200 font-medium">{totalPedido}</span></span>
                    <span className="text-emerald-400">Recibido: <span className="font-medium">{totalRecibido}</span></span>
                    {totalPendiente > 0 && <span className="text-amber-400">Pendiente: <span className="font-medium">{totalPendiente}</span></span>}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancelar</Button></DialogClose>
            <Button onClick={handleReceive} disabled={receiveLoading} className="bg-emerald-700 hover:bg-emerald-600">
              {receiveLoading ? 'Guardando...' : '✅ Confirmar Recepción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Order Detail Dialog (with Export) ── */}
      <Dialog open={detailOpen} onOpenChange={o => { setDetailOpen(o); if (!o) { setSelectedOrder(null); setEditMode(false); setExportOpen(false); setRemovedItemIds([]); setEditItemResults([]); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Pedido #{selectedOrder?.id}
              {selectedOrder && getStatusBadge(selectedOrder.status)}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder && formatDate(selectedOrder.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <>
              {/* Export buttons + column selector */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 justify-end">
                  {selectedOrder.status !== 'received' && selectedOrder.status !== 'cancelled' && (
                    <Button variant="outline" size="sm" onClick={handleReorderMissing} disabled={reorderLoading} className="text-xs border-amber-600/50 text-amber-400 hover:bg-amber-500/10">
                      <RefreshCcw className="h-3.5 w-3.5 mr-1" />{reorderLoading ? '...' : 'Repedir faltantes'}
                    </Button>
                  )}
                  {selectedOrder.status === 'on_hold' && (
                    <Button variant="outline" size="sm" onClick={() => setOrderReady(selectedOrder)} className="text-xs border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10">
                      <Clock className="h-3.5 w-3.5 mr-1" />Marcar como listo
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleExport('png')} disabled={exporting} className="text-xs">
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />{exporting ? '...' : 'PNG'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting} className="text-xs">
                    <FileText className="h-3.5 w-3.5 mr-1" />{exporting ? '...' : 'CSV'}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-end rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2">
                  <span className="text-xs text-slate-400">Columnas del export:</span>
                  {EXPORT_COLUMN_OPTIONS.map(opt => (
                    <label key={opt.key} className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                      <Checkbox
                        checked={exportCols.has(opt.key)}
                        disabled={opt.required}
                        onCheckedChange={() => {
                          setExportCols(prev => {
                            const next = new Set(prev);
                            if (next.has(opt.key)) next.delete(opt.key);
                            else next.add(opt.key);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5 border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {selectedOrder.status === 'on_hold' && (
                <div className="rounded-md border border-amber-700/60 bg-amber-950/20 px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2 text-amber-300">
                    <Clock className="h-4 w-4" /> Pedido en espera
                  </span>
                  <span className="text-amber-200/90">
                    Total aprox. (precio proveedor):{' '}
                    <span className="font-bold text-amber-200">
                      {formatCurrency(selectedOrder.items.reduce((s, i) => s + i.quantity * (i.costPrice ?? i.product?.cost ?? 0), 0))}
                    </span>
                  </span>
                </div>
              )}

              {/* Exportable content */}
              <div ref={exportRef} className="p-4 rounded-lg" style={{ background: '#1e293b' }}>
                {/* Header info */}
                <div className="text-center mb-4 pb-3 border-b border-slate-600">
                  <h3 className="text-lg font-bold text-slate-100">Pedido #{selectedOrder.id}</h3>
                  <p className="text-xs text-slate-400">{formatDate(selectedOrder.createdAt)}</p>
                  <p className="text-sm text-slate-300 mt-1">Proveedor: <span className="font-medium">{selectedOrder.supplier?.name}</span></p>
                  {selectedOrder.notes && <p className="text-xs text-slate-400 mt-1">Notas: {selectedOrder.notes}</p>}
                </div>

                {/* Export table */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-700/50">
                      <TableHead className="text-slate-300">#</TableHead>
                      <TableHead className="text-slate-300">Código</TableHead>
                      <TableHead className="text-slate-300">Nombre</TableHead>
                      <TableHead className="text-center text-slate-300">Cantidad</TableHead>
                      <TableHead className="text-center text-slate-300">Recibido</TableHead>
                      <TableHead className="text-center text-slate-300">Pendiente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item, idx) => {
                      const pending = Math.max(0, item.quantity - item.receivedQuantity);
                      const isExtra = item.extra === true;
                      return (
                        <TableRow key={item.id} className={isExtra ? 'bg-red-950/40' : pending > 0 ? 'bg-amber-950/20' : ''}>
                          <TableCell className="text-xs text-slate-400 font-mono">
                            {isExtra ? <AlertTriangle className="h-3.5 w-3.5 text-red-400 inline mr-1" /> : `${idx + 1}.`}
                          </TableCell>
                          <TableCell className="text-xs text-slate-400 font-mono">{item.product?.barcode || item.productBarcode || '—'}</TableCell>
                          <TableCell className={`text-sm ${isExtra ? 'text-red-300' : 'text-slate-200'}`}>
                            {item.product?.name || item.productName || `#${item.productId ?? '?'}`}
                            {isExtra && <span className="ml-2 text-[10px] font-bold text-red-400 uppercase">Extra</span>}
                            {!item.product && !isExtra && <span className="ml-2 text-[10px] font-bold text-sky-400 uppercase">Sin inventario</span>}
                          </TableCell>
                          <TableCell className="text-center text-slate-200">{item.quantity}</TableCell>
                          <TableCell className="text-center text-slate-300">{item.receivedQuantity}</TableCell>
                          <TableCell className="text-center">{pending > 0 ? <span className="text-amber-400">{pending}</span> : <span className="text-emerald-400">✓</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="mt-3 text-xs text-slate-500 text-center">
                  Generado por POS System — {new Date().toLocaleString('es-MX')}
                </div>
              </div>

              {/* Edit mode */}
              <div className="flex items-center justify-between mt-4">
                <h4 className="text-sm font-medium text-slate-300">Productos ({selectedOrder.items.length})</h4>
                {selectedOrder.status !== 'received' && selectedOrder.status !== 'cancelled' && (
                  <Button type="button" variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode(!editMode)}>
                    {editMode ? 'Cancelar edición' : 'Editar pedido'}
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-700 rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800/80">
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Solicitado</TableHead>
                      <TableHead className="text-center">Recibido</TableHead>
                      <TableHead className="text-center">Pendiente</TableHead>
                      <TableHead>Notas</TableHead>
                      {editMode && <TableHead className="w-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map(item => {
                      const pending = Math.max(0, item.quantity - item.receivedQuantity);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs text-slate-400">{item.product?.barcode || item.productBarcode || '—'}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-200">
                            {item.product?.name || item.productName || `#${item.productId ?? '?'}`}
                            {!item.product && <span className="ml-2 rounded bg-sky-950/60 px-1.5 py-0.5 text-[10px] text-sky-400 border border-sky-700/50">sin inventario</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {editMode ? (
                              <Input type="number" min="0" value={item.quantity} onChange={e => updateOrderItem(item.id, 'quantity', e.target.value)} className="w-20 h-8 text-center mx-auto" />
                            ) : <span className="text-slate-200">{item.quantity}</span>}
                          </TableCell>
                          <TableCell className="text-center text-slate-300">{item.receivedQuantity}</TableCell>
                          <TableCell className="text-center">{pending > 0 ? <span className="text-amber-400">{pending}</span> : <span className="text-emerald-400">✓</span>}</TableCell>
                          <TableCell>
                            {editMode && item.receivedQuantity > 0 ? (
                              <span className="text-xs text-slate-500">{item.notes || '—'}</span>
                            ) : editMode ? (
                              <Input value={item.notes} onChange={e => updateOrderItem(item.id, 'notes', e.target.value)} className="h-8 text-sm" placeholder="Notas..." />
                            ) : <span className="text-xs text-slate-400">{item.notes || '—'}</span>}
                          </TableCell>
                          {editMode && (
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => removeEditedItem(item.id)}
                                disabled={item.receivedQuantity > 0}
                                className="text-red-400 hover:text-red-300 disabled:opacity-30 transition-colors"
                                title={item.receivedQuantity > 0 ? 'No se puede quitar: ya tiene piezas recibidas' : 'Quitar del pedido'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Agregar items en modo edición */}
              {editMode && (
                <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">Agregar producto</span>
                    {selectedOrder.supplierId > 0 && (
                      <span className="text-[10px] text-slate-500">El costo se toma del proveedor del pedido</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                      <Input
                        placeholder="Buscar por nombre o código..."
                        value={editItemSearch}
                        onChange={e => { setEditItemSearch(e.target.value); }}
                        className="pl-9 h-8 text-xs"
                      />
                      {editItemResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 shadow-lg max-h-48 overflow-y-auto">
                          {editItemResults.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => addEditedItem(p.id, p.name, p.barcode)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 transition-colors"
                            >
                              <span className="truncate">{p.name}</span>
                              <span className="font-mono text-slate-500 shrink-0">{p.barcode || '—'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addEditedGhost} disabled={!editGhostName.trim()}>
                      <PlusCircle className="h-3 w-3 mr-1" />Agregar fantasma
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <Input placeholder="Nombre (sin inventario)..." value={editGhostName} onChange={e => setEditGhostName(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-3">
                      <Input placeholder="Cantidad" type="number" min="1" value={editGhostQty} onChange={e => setEditGhostQty(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-3">
                      <Input placeholder="P. venta" type="number" step="0.01" min="0" value={editGhostPrice} onChange={e => setEditGhostPrice(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                </div>
              )}

              {editMode && (
                <Button className="w-full" onClick={saveEditedItems} disabled={formLoading}>
                  {formLoading ? 'Guardando...' : '💾 Guardar cambios'}
                </Button>
              )}
            </>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cerrar</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
