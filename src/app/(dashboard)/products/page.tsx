'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, PackageOpen, Search, Download, X, Check } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import toast from 'react-hot-toast';

interface Department {
  id: number;
  name: string;
  description: string;
  active: boolean;
}

interface Supplier {
  id: number;
  name: string;
  active: boolean;
}

interface ProductLineItem {
  id: number;
  productId: number;
  supplierId: number;
  supplierPrice: number | null;
  isPrimary: boolean;
  supplier: Supplier;
}

interface ProductBatchItem {
  id: number;
  productId: number;
  quantity: number;
  expiresAt: string | null;
  costPrice: number;
  createdAt: string;
}

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
  department: Department | null;
  supplier: Supplier | null;
  productLines: ProductLineItem[];
  batches: ProductBatchItem[];
}

interface FormProductLine {
  supplierId: string;
  supplierPrice: string;
  isPrimary: boolean;
}

interface FormBatch {
  id?: number;
  quantity: string;
  month: string;
  year: string;
  costPrice: string;
  removed?: boolean;
}

export default function ProductsPage() {
  const productsAbortRef = useRef<AbortController | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterActive, setFilterActive] = useState('all');
  const [filterPriceMin, setFilterPriceMin] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');
  const [filterCostMin, setFilterCostMin] = useState('');
  const [filterCostMax, setFilterCostMax] = useState('');
  const [filterStockMin, setFilterStockMin] = useState('');
  const [filterStockMax, setFilterStockMax] = useState('');
  const [filterMinStockMin, setFilterMinStockMin] = useState('');
  const [filterMinStockMax, setFilterMinStockMax] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formMinStock, setFormMinStock] = useState('5');
  const [formDepartmentId, setFormDepartmentId] = useState('all');
  const [formProductLines, setFormProductLines] = useState<FormProductLine[]>([]);
  const [formBatches, setFormBatches] = useState<FormBatch[]>([]);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Stock adjust
  const [stockAdjust, setStockAdjust] = useState('');

  const LIMIT = 50;

  const fetchProducts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    productsAbortRef.current?.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;

    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (filterDepartment !== 'all') params.set('departmentId', filterDepartment);
    if (filterSupplier !== 'all') params.set('supplierId', filterSupplier);
    if (filterActive !== 'all') params.set('active', filterActive);
    if (filterPriceMin) params.set('priceMin', filterPriceMin);
    if (filterPriceMax) params.set('priceMax', filterPriceMax);
    if (filterCostMin) params.set('costMin', filterCostMin);
    if (filterCostMax) params.set('costMax', filterCostMax);
    if (filterStockMin) params.set('stockMin', filterStockMin);
    if (filterStockMax) params.set('stockMax', filterStockMax);
    if (filterMinStockMin) params.set('minStockMin', filterMinStockMin);
    if (filterMinStockMax) params.set('minStockMax', filterMinStockMax);
    params.set('page', String(pageNum));
    params.set('limit', String(LIMIT));

    try {
      const res = await fetch(`/api/products?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Error al cargar productos');
      const data = await res.json();
      if (data.products) {
        setProducts(prev => append ? [...prev, ...data.products] : data.products);
        setHasMore(data.pagination.hasMore);
        setTotal(data.pagination.total);
        setPage(pageNum);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setProducts([]);
      }
    } finally {
      if (productsAbortRef.current === controller) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [search, filterDepartment, filterSupplier, filterActive,
      filterPriceMin, filterPriceMax, filterCostMin, filterCostMax,
      filterStockMin, filterStockMax, filterMinStockMin, filterMinStockMax]);

  const fetchDepartments = () => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDepartments(data.filter((d: Department) => d.active));
      })
      .catch(() => {});
  };

  const fetchSuppliers = () => {
    fetch('/api/suppliers')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSuppliers(data.filter((s: Supplier) => s.active));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchDepartments();
    fetchSuppliers();
    return () => productsAbortRef.current?.abort();
  }, []);

  // Debounced search
  useEffect(() => {
    productsAbortRef.current?.abort();
    const timer = setTimeout(() => {
      fetchProducts(1, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    fetchProducts(page + 1, true);
  };

  const emptyProductLine = (): FormProductLine => ({
    supplierId: 'all',
    supplierPrice: '',
    isPrimary: false,
  });

  const resetForm = () => {
    setFormName('');
    setFormBarcode('');
    setFormPrice('');
    setFormCost('');
    setFormStock('');
    setFormMinStock('5');
    setFormDepartmentId('all');
    setFormProductLines([]);
    setFormBatches([]);
    setFormError('');
  };

  const addBatchRow = () => {
    setFormBatches(prev => [...prev, { quantity: '', month: '', year: '', costPrice: '' }]);
  };

  const removeBatchRow = (index: number) => {
    setFormBatches(prev => {
      const updated = prev.map((b, i) => i === index ? { ...b, removed: true } : b);
      return updated.filter(b => !b.removed || b.id !== undefined);
    });
  };

  const updateBatchRow = (index: number, field: keyof FormBatch, value: string) => {
    setFormBatches(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
  };

  // Suma de piezas en lotes (existentes no eliminados + nuevos)
  const batchTotal = formBatches.reduce(
    (s, b) => s + (b.removed ? 0 : parseInt(b.quantity) || 0),
    0
  );

  const addProductLine = () => {
    setFormProductLines(prev => [...prev, emptyProductLine()]);
  };

  const removeProductLine = (index: number) => {
    setFormProductLines(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // If we removed the primary, make the first remaining one primary
      if (updated.length > 0 && !updated.some(pl => pl.isPrimary)) {
        updated[0].isPrimary = true;
      }
      return updated;
    });
  };

  const updateProductLine = (index: number, field: keyof FormProductLine, value: string | boolean) => {
    setFormProductLines(prev => {
      const updated = prev.map((pl, i) => {
        if (i !== index) return pl;
        return { ...pl, [field]: value };
      });

      // If setting isPrimary to true, ensure no other line is primary
      if (field === 'isPrimary' && value === true) {
        return updated.map((pl, i) => ({
          ...pl,
          isPrimary: i === index ? true : false,
        }));
      }

      // Ensure at least one primary if there are lines
      if (updated.length > 0 && !updated.some(pl => pl.isPrimary)) {
        updated[0].isPrimary = true;
      }

      return updated;
    });
  };

  const getAvailableSuppliers = (currentIndex: number, currentLines: FormProductLine[]) => {
    const selectedIds = currentLines
      .filter((_, i) => i !== currentIndex)
      .map(pl => pl.supplierId)
      .filter(id => id !== 'all');
    return suppliers.filter(s => !selectedIds.includes(String(s.id)));
  };

  const buildProductBody = (includeProductLines: boolean = true) => {
    const body: Record<string, unknown> = {
      name: formName,
      barcode: formBarcode,
      price: parseFloat(formPrice),
      cost: formCost ? parseFloat(formCost) : 0,
      stock: parseInt(formStock || '0'),
      minStock: parseInt(formMinStock || '5'),
      departmentId: formDepartmentId !== 'all' ? parseInt(formDepartmentId) : null,
      active: true,
    };

    if (includeProductLines && formProductLines.length > 0) {
      body.productLines = formProductLines
        .filter(pl => pl.supplierId !== 'all')
        .map(pl => ({
          supplierId: parseInt(pl.supplierId),
          supplierPrice: pl.supplierPrice ? parseFloat(pl.supplierPrice) : null,
          isPrimary: pl.isPrimary,
        }));
      // Also set supplierId on product for backward compat
      const primary = formProductLines.find(pl => pl.isPrimary && pl.supplierId !== 'all')
        || formProductLines.find(pl => pl.supplierId !== 'all');
      if (primary) {
        body.supplierId = parseInt(primary.supplierId);
      }
    } else {
      body.supplierId = null;
    }

    return body;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildProductBody()),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error creating product');
      return;
    }

    setCreateOpen(false);
    resetForm();
    fetchProducts(1);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setFormError('');
    setFormLoading(true);

    const body = buildProductBody();
    body.stock = parseInt(formStock, 10) || 0;

    // Lotes: agregar nuevos, eliminar marcados como quitados
    const batchOps: Array<{
      action: string;
      id?: number;
      quantity?: number;
      expiresAt?: string | null;
      costPrice?: number | null;
    }> = formBatches
      .filter(b => !b.removed && b.id === undefined && parseInt(b.quantity) > 0)
      .map(b => ({
        action: 'add',
        quantity: parseInt(b.quantity),
        expiresAt: b.month && b.year ? `${b.month}/${b.year}` : null,
        costPrice: b.costPrice ? parseFloat(b.costPrice) : null,
      }));
    for (const b of formBatches) {
      if (b.removed && b.id !== undefined) {
        batchOps.push({ action: 'delete', id: b.id });
      }
    }
    if (batchOps.length > 0) body.batchOps = batchOps;

    const res = await fetch(`/api/products/${selectedProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setFormLoading(false);
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error || 'Error updating product');
      return;
    }

    setEditOpen(false);
    resetForm();
    setSelectedProduct(null);
    fetchProducts(1);
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    const res = await fetch(`/api/products/${selectedProduct.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeleteOpen(false);
      setSelectedProduct(null);
      fetchProducts(1);
    }
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setFormLoading(true);
    const res = await fetch(`/api/products/${selectedProduct.id}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: parseInt(stockAdjust) }),
    });
    setFormLoading(false);
    if (res.ok) {
      setStockOpen(false);
      setStockAdjust('');
      setSelectedProduct(null);
      fetchProducts(1);
    }
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams({ format: 'csv' });
    if (search) params.set('q', search);
    if (filterDepartment !== 'all') params.set('departmentId', filterDepartment);
    if (filterSupplier !== 'all') params.set('supplierId', filterSupplier);
    if (filterActive !== 'all') params.set('active', filterActive);
    if (filterPriceMin) params.set('priceMin', filterPriceMin);
    if (filterPriceMax) params.set('priceMax', filterPriceMax);
    if (filterCostMin) params.set('costMin', filterCostMin);
    if (filterCostMax) params.set('costMax', filterCostMax);
    if (filterStockMin) params.set('stockMin', filterStockMin);
    if (filterStockMax) params.set('stockMax', filterStockMax);
    if (filterMinStockMin) params.set('minStockMin', filterMinStockMin);
    if (filterMinStockMax) params.set('minStockMax', filterMinStockMax);

    try {
      const res = await fetch(`/api/products/export?${params}`);
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `inventario-${new Date().toISOString().split('T')[0]}.csv`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar inventario');
    }
  };

  const openEdit = (product: Product) => {
    setSelectedProduct(product);
    setFormName(product.name);
    setFormBarcode(product.barcode);
    setFormPrice(String(product.price));
    setFormCost(String(product.cost));
    setFormStock(String(product.stock));
    setFormMinStock(String(product.minStock));
    setFormDepartmentId(product.departmentId ? String(product.departmentId) : 'all');

    // Populate batches from product data
    if (product.batches && product.batches.length > 0) {
      setFormBatches(
        product.batches.map(b => {
          const d = b.expiresAt ? new Date(b.expiresAt) : null;
          return {
            id: b.id,
            quantity: String(b.quantity),
            month: d ? String(d.getMonth() + 1).padStart(2, '0') : '',
            year: d ? String(d.getFullYear()) : '',
            costPrice: b.costPrice ? String(b.costPrice) : '',
            removed: false,
          };
        })
      );
    } else {
      setFormBatches([]);
    }

    // Populate productLines from product data
    if (product.productLines && product.productLines.length > 0) {
      setFormProductLines(
        product.productLines.map(pl => ({
          supplierId: String(pl.supplierId),
          supplierPrice: pl.supplierPrice ? String(pl.supplierPrice) : '',
          isPrimary: pl.isPrimary,
        }))
      );
    } else if (product.supplier) {
      // Fallback: if no productLines but supplier is set, create a line from it
      setFormProductLines([{
        supplierId: String(product.supplier.id),
        supplierPrice: product.cost ? String(product.cost) : '',
        isPrimary: true,
      }]);
    } else {
      setFormProductLines([]);
    }

    setEditOpen(true);
  };

  // Helper to get display supplier text for a product
  const getSupplierDisplay = (product: Product): string => {
    if (product.productLines && product.productLines.length > 0) {
      const primary = product.productLines.find(pl => pl.isPrimary);
      if (primary) return primary.supplier?.name || '—';
      if (product.productLines.length === 1) {
        return product.productLines[0].supplier?.name || '—';
      }
      return 'Múltiples';
    }
    return product.supplier?.name || '—';
  };

  // Render a suppliers section for a form (used in Create, Edit, and Quick-add)
  const renderSuppliersSection = (isQuickAdd: boolean = false) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Proveedores</Label>
        <Button type="button" variant="outline" size="sm" onClick={addProductLine} className="h-7 text-xs border-dashed">
          <Plus className="h-3 w-3 mr-1" />
          Añadir proveedor
        </Button>
      </div>

      {formProductLines.length === 0 ? (
        <p className="text-xs text-slate-500 italic">Sin proveedores asignados</p>
      ) : (
        <div className="space-y-2">
          {formProductLines.map((pl, index) => {
            const available = getAvailableSuppliers(index, formProductLines);
            return (
              <div key={index} className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-800/50 p-2">
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Proveedor</Label>
                      <Select
                        value={pl.supplierId}
                        onValueChange={(v) => updateProductLine(index, 'supplierId', v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Seleccionar...</SelectItem>
                          {available.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Precio proveedor</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={pl.supplierPrice}
                        onChange={(e) => updateProductLine(index, 'supplierPrice', e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={pl.isPrimary}
                        onCheckedChange={(checked) => updateProductLine(index, 'isPrimary', checked === true)}
                      />
                      <span className="text-xs text-slate-400">Principal</span>
                    </label>
                    {!isQuickAdd && (
                      <button
                        type="button"
                        onClick={() => removeProductLine(index)}
                        className="ml-auto text-red-400 hover:text-red-300 transition-colors"
                        title="Eliminar proveedor"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formProductLines.some(pl => pl.supplierId === 'all') && (
        <p className="text-xs text-amber-400">Selecciona un proveedor para cada línea</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Productos</h2>
          <p className="text-sm text-slate-400 mt-1">Administra tu inventario de productos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Crear Producto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crear Producto</DialogTitle>
                <DialogDescription>Añade un nuevo producto al inventario</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate}>
                <div className="grid gap-4 py-4">
                  {formError && (
                    <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                      {formError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-name">Nombre</Label>
                      <Input id="create-name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-barcode">Código</Label>
                      <Input id="create-barcode" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-price">Precio</Label>
                      <Input id="create-price" type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-cost">Costo</Label>
                      <Input id="create-cost" type="number" step="0.01" min="0" value={formCost} onChange={(e) => setFormCost(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-stock">Stock</Label>
                      <Input id="create-stock" type="number" min="0" value={formStock} onChange={(e) => setFormStock(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-minStock">Stock Mín.</Label>
                      <Input id="create-minStock" type="number" min="0" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Departamento</Label>
                      <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Ninguno</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {renderSuppliersSection()}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading ? 'Creando...' : 'Crear Producto'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nombre o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los dptos.</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger>
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los prov.</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Activos e inactivos</SelectItem>
                <SelectItem value="true">Solo activos</SelectItem>
                <SelectItem value="false">Solo inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Precio mín</Label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={filterPriceMin} onChange={(e) => setFilterPriceMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Precio máx</Label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={filterPriceMax} onChange={(e) => setFilterPriceMax(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Costo mín</Label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={filterCostMin} onChange={(e) => setFilterCostMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Costo máx</Label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={filterCostMax} onChange={(e) => setFilterCostMax(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Stock mín</Label>
            <Input type="number" min="0" placeholder="0" value={filterStockMin} onChange={(e) => setFilterStockMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Stock máx</Label>
            <Input type="number" min="0" placeholder="0" value={filterStockMax} onChange={(e) => setFilterStockMax(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Stock mín. mín</Label>
            <Input type="number" min="0" placeholder="0" value={filterMinStockMin} onChange={(e) => setFilterMinStockMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Stock mín. máx</Label>
            <Input type="number" min="0" placeholder="0" value={filterMinStockMax} onChange={(e) => setFilterMinStockMax(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Stock mín.</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-slate-400 py-8">
                    No se encontraron productos
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id} className="group">
                    <TableCell className="font-medium text-slate-100">{product.name}</TableCell>
                    <TableCell className="text-slate-400 font-mono text-xs">{product.barcode || '—'}</TableCell>
                    <TableCell className="text-slate-200">${product.price.toFixed(2)}</TableCell>
                    <TableCell className="text-red-400/80 font-mono text-xs">${product.cost.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={product.stock <= product.minStock ? 'destructive' : 'default'}>
                        {product.stock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs">{product.minStock}</TableCell>
                    <TableCell className="text-slate-300">{product.department?.name || '—'}</TableCell>
                    <TableCell className="text-slate-300">{getSupplierDisplay(product)}</TableCell>
                    <TableCell>
                      <Badge variant={product.active ? 'default' : 'secondary'}>
                        {product.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setSelectedProduct(product); setStockAdjust('0'); setStockOpen(true); }}
                          title="Ajustar stock"
                        >
                          <PackageOpen className="h-4 w-4 text-amber-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                          <Pencil className="h-4 w-4 text-slate-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedProduct(product); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500">
              Mostrando {products.length} de {total} productos
            </p>
            {hasMore && (
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="border-slate-600 text-slate-300">
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                    Cargando...
                  </span>
                ) : (
                  `Cargar más (${total - products.length} restantes)`
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) { resetForm(); setSelectedProduct(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
            <DialogDescription>Actualiza la información del producto</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="grid gap-4 py-4">
              {formError && (
                <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Precio</Label>
                  <Input type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Costo</Label>
                  <Input type="number" step="0.01" min="0" value={formCost} onChange={(e) => setFormCost(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stock</Label>
                  <Input type="number" min="0" value={formStock} onChange={(e) => setFormStock(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Stock Mín.</Label>
                  <Input type="number" min="0" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Ninguno</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {renderSuppliersSection()}
              {/* Batches / Expiration section */}
              <div className="space-y-3 rounded-md border border-slate-700 bg-slate-800/40 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Lotes / Caducidad</Label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Piezas por lote: {batchTotal} · Sin asignar: {Math.max(0, (parseInt(formStock) || 0) - batchTotal)} · Caducidad opcional (día = último del mes)
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addBatchRow} className="h-7 text-xs border-dashed">
                    <Plus className="h-3 w-3 mr-1" />
                    Agregar lote
                  </Button>
                </div>
                {formBatches.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Sin lotes asignados</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {formBatches.map((b, index) => {
                      const isNew = b.id === undefined;
                      return (
                        <div key={index} className={`grid grid-cols-12 gap-2 items-center rounded-md border p-2 ${b.removed ? 'border-red-800 bg-red-950/30 opacity-50' : 'border-slate-700 bg-slate-800/60'}`}>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-[10px] text-slate-500">Piezas</Label>
                            <Input type="number" min="0" value={b.quantity} onChange={(e) => updateBatchRow(index, 'quantity', e.target.value)} className="h-7 text-xs" placeholder="0" disabled={b.removed} />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-[10px] text-slate-500">Mes</Label>
                            <Input type="number" min="1" max="12" value={b.month} onChange={(e) => updateBatchRow(index, 'month', e.target.value)} className="h-7 text-xs" placeholder="MM" disabled={b.removed} />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-[10px] text-slate-500">Año</Label>
                            <Input type="number" min="2020" max="2200" value={b.year} onChange={(e) => updateBatchRow(index, 'year', e.target.value)} className="h-7 text-xs" placeholder="AAAA" disabled={b.removed} />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-[10px] text-slate-500">Costo</Label>
                            <Input type="number" step="0.01" min="0" value={b.costPrice} onChange={(e) => updateBatchRow(index, 'costPrice', e.target.value)} className="h-7 text-xs" placeholder={formCost || '0.00'} disabled={b.removed} />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <button type="button" onClick={() => removeBatchRow(index)} className="text-red-400 hover:text-red-300 transition-colors" title={isNew ? 'Quitar lote' : 'Eliminar lote'}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Stock</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} — Stock actual: {selectedProduct?.stock}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStockAdjust}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Ajuste (usa negativo para reducir)</Label>
                <Input type="number" value={stockAdjust} onChange={(e) => setStockAdjust(e.target.value)} placeholder="ej. 10 o -5" required />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="secondary">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? 'Ajustando...' : 'Ajustar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Producto</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar {selectedProduct?.name}? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancelar</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
