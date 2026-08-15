'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, PackageOpen, Search, Download, X, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, History, ScanLine } from 'lucide-react';
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
import { BarcodeScanner } from '@/components/BarcodeScanner';

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
  // Valores originales (solo para lotes existentes) para detectar cambios
  origQuantity?: string;
  origMonth?: string;
  origYear?: string;
  origCostPrice?: string;
}

interface PieceBox {
  id: number;
  name: string;
  barcode: string;
  stock: number;
  price: number;
  cost: number;
  minStock: number;
  piecesPerUnit: number | null;
  piecesTracked: boolean;
  detected: boolean;
  openedBoxes: number;
  piece: {
    id: number;
    name: string;
    barcode: string;
    stock: number;
    price: number;
    cost: number;
    active: boolean;
  } | null;
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
  const [jumpPage, setJumpPage] = useState('');
  const [lastVisited, setLastVisited] = useState<{ sig: string; page: number } | null>(null);

  const LIMIT = 50;
  const LAST_PAGE_KEY = 'pos-products-last-page';

  const filtersSig = [
    search, filterDepartment, filterSupplier, filterActive,
    filterPriceMin, filterPriceMax, filterCostMin, filterCostMax,
    filterStockMin, filterStockMax, filterMinStockMin, filterMinStockMax,
  ].join('|');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_PAGE_KEY);
      if (raw) setLastVisited(JSON.parse(raw));
    } catch {
      // Sin último guardado: no se muestra el botón
    }
  }, []);

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

  // Gestión de piezas
  const [pieceBoxes, setPieceBoxes] = useState<PieceBox[]>([]);
  const [pieceBusy, setPieceBusy] = useState<number | null>(null);
  const [piecesOpen, setPiecesOpen] = useState(true);
  const [piecesFilter, setPiecesFilter] = useState('');

  // Camera barcode scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const handleScan = useCallback((code: string) => {
    setSearch(code);
  }, []);

  const filteredPieceBoxes = useMemo(() => {
    const q = piecesFilter.trim().toLowerCase();
    if (!q) return pieceBoxes;
    return pieceBoxes.filter(
      (box) =>
        box.name.toLowerCase().includes(q) ||
        box.barcode.toLowerCase().includes(q) ||
        (box.piece !== null &&
          (box.piece.name.toLowerCase().includes(q) || box.piece.barcode.toLowerCase().includes(q)))
    );
  }, [pieceBoxes, piecesFilter]);

  const [editingPiece, setEditingPiece] = useState<{ id: number; name: string; barcode: string; price: string; cost: string } | null>(null);

  const fetchProducts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    productsAbortRef.current?.abort();
    const controller = new AbortController();
    productsAbortRef.current = controller;

    if (append) setLoadingMore(true);
    else setLoading(true);

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
        try {
          localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ sig: filtersSig, page: pageNum }));
          setLastVisited({ sig: filtersSig, page: pageNum });
        } catch {
          // localStorage no disponible: no se recuerda la página
        }
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
    fetchPieces();
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

  const goToPage = (p: number) => {
    if (p < 1 || p === page || loading || loadingMore) return;
    fetchProducts(p, false);
  };

  const handleJump = () => {
    const totalPages = Math.max(1, Math.ceil(total / LIMIT));
    const p = parseInt(jumpPage, 10);
    if (isNaN(p)) return;
    setJumpPage('');
    goToPage(Math.min(Math.max(1, p), totalPages));
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
    setEditingPiece(null);
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

    // Lotes: agregar nuevos, actualizar existentes y eliminar marcados.
    // Antes solo se enviaban add/delete, por lo que modificar la caducidad o
    // cantidad de un lote existente se ignoraba silenciosamente.
    const batchOps: Array<{
      action: string;
      id?: number;
      quantity?: number;
      expiresAt?: string | null;
      costPrice?: number | null;
    }> = [];
    for (const b of formBatches) {
      const qty = parseInt(b.quantity);
      const expiresAt = b.month && b.year ? `${b.month}/${b.year}` : null;
      const costPrice = b.costPrice ? parseFloat(b.costPrice) : null;

      if (b.removed && b.id !== undefined) {
        batchOps.push({ action: 'delete', id: b.id });
        continue;
      }
      if (b.removed) continue;

      if (b.id === undefined) {
        // Lote nuevo: solo si tiene cantidad
        if (!Number.isNaN(qty) && qty > 0) {
          batchOps.push({ action: 'add', quantity: qty, expiresAt, costPrice });
        }
        continue;
      }

      // Lote existente: detectar si cambió para enviar 'update'
      const origD = b.origMonth && b.origYear ? `${b.origMonth}/${b.origYear}` : null;
      const changed =
        b.quantity !== b.origQuantity ||
        expiresAt !== origD ||
        (b.costPrice || '') !== (b.origCostPrice || '');
      if (changed) {
        batchOps.push({
          action: 'update',
          id: b.id,
          quantity: Number.isNaN(qty) ? 0 : qty,
          expiresAt,
          costPrice,
        });
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

    // Guardar precio/costo de la unidad suelta (pieza) si aplica
    if (editingPiece) {
      const pieceBody: Record<string, unknown> = {
        price: parseFloat(editingPiece.price),
      };
      if (editingPiece.cost) pieceBody.cost = parseFloat(editingPiece.cost);
      const pieceRes = await fetch(`/api/products/${editingPiece.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pieceBody),
      });
      if (!pieceRes.ok) {
        const pieceData = await pieceRes.json().catch(() => ({}));
        setFormError(pieceData.error || 'Error al guardar el precio de la pieza');
        return;
      }
    }

    setEditOpen(false);
    resetForm();
    setSelectedProduct(null);
    fetchProducts(1);
    fetchPieces();
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

  const fetchPieces = useCallback(() => {
    fetch('/api/pieces')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.boxes)) setPieceBoxes(data.boxes);
      })
      .catch(() => {});
  }, []);

  const handleGeneratePieces = async (box: PieceBox) => {
    setPieceBusy(box.id);
    try {
      const res = await fetch('/api/pieces/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: box.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al generar piezas');
        return;
      }
      toast.success(`Caja abierta: ${data.pieces} piezas generadas`);
      fetchProducts(1);
      fetchPieces();
    } catch {
      toast.error('Error al generar piezas');
    } finally {
      setPieceBusy(null);
    }
  };

  const handleRevertPieces = async (box: PieceBox) => {
    const confirmed = window.confirm(
      `¿Revertir las piezas de "${box.name}"? Se restaurará el stock de caja y se dejará de gestionar como piezas.`
    );
    if (!confirmed) return;
    setPieceBusy(box.id);
    try {
      const res = await fetch('/api/pieces/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: box.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al revertir piezas');
        return;
      }
      toast.success('Piezas revertidas');
      fetchProducts(1);
      fetchPieces();
    } catch {
      toast.error('Error al revertir piezas');
    } finally {
      setPieceBusy(null);
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
          const month = d ? String(d.getMonth() + 1).padStart(2, '0') : '';
          const year = d ? String(d.getFullYear()) : '';
          const quantity = String(b.quantity);
          const costPrice = b.costPrice ? String(b.costPrice) : '';
          return {
            id: b.id,
            quantity,
            month,
            year,
            costPrice,
            removed: false,
            origQuantity: quantity,
            origMonth: month,
            origYear: year,
            origCostPrice: costPrice,
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

    // Pieza por unidad suelta (si el producto es una caja gestionada con pieza)
    const box = pieceBoxes.find((b) => b.id === product.id);
    if (box && box.piece) {
      setEditingPiece({
        id: box.piece.id,
        name: box.piece.name,
        barcode: box.piece.barcode,
        price: String(box.piece.price),
        cost: box.piece.cost ? String(box.piece.cost) : '',
      });
    } else {
      setEditingPiece(null);
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
              className="pl-10 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400 hover:text-primary"
              title="Leer código de barras con la cámara"
              onClick={() => setScannerOpen(true)}
            >
              <ScanLine className="h-4 w-4" />
            </Button>
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

      {/* Gestión de piezas */}
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader className="pb-3">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 text-left"
            onClick={() => setPiecesOpen((v) => !v)}
          >
            <span className="text-base font-semibold leading-none tracking-tight flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-sky-400" />
              Gestión de piezas
              <span className="inline-flex items-center rounded-md border border-slate-600 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ml-1">
                {pieceBoxes.length} cajas
              </span>
            </span>
            {piecesOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {piecesOpen && (
            <p className="text-xs text-slate-500">
              Los productos cuyo nombre termina en <span className="font-mono text-slate-400">C/(N)</span> (ej. "Paracetamol C/10")
              se consideran cajas. Abrir una caja consume 1 de stock y genera "Pieza de ..." con código <span className="font-mono text-slate-400">S+</span>.
              Al vender piezas sin stock se abre una caja automáticamente.
            </p>
          )}
        </CardHeader>
        {piecesOpen && (
          <CardContent className="p-0">
            {pieceBoxes.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-slate-500 italic">Sin productos de caja detectados</p>
            ) : (
              <>
                <div className="px-4 pt-2 pb-3">
                  <Input
                    placeholder="Buscar caja o pieza por nombre o código..."
                    value={piecesFilter}
                    onChange={(e) => setPiecesFilter(e.target.value)}
                    className="h-8 text-xs bg-slate-900 border-slate-700"
                  />
                </div>
                <div className="divide-y divide-slate-700/70">
                  {filteredPieceBoxes.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-500 italic">Sin resultados para: {piecesFilter}</p>
                  ) : (
                    filteredPieceBoxes.map((box) => (
                      <div key={box.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100 text-sm truncate">{box.name}</span>
                            {!box.piecesTracked && (
                              <Badge variant="secondary" className="text-[10px]">revertido</Badge>
                            )}
                            {box.detected && (
                              <Badge variant="outline" className="text-[10px] border-sky-700 text-sky-400">detectado</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Piezas por caja: <span className="text-slate-300">{box.piecesPerUnit ?? '—'}</span> · Stock de caja:{' '}
                            <span className={box.stock < 1 ? 'text-red-400' : 'text-slate-300'}>{box.stock}</span> · Cajas abiertas:{' '}
                            <span className="text-slate-300">{box.openedBoxes}</span>
                            {box.piece && (
                              <> · Pieza: <span className="text-slate-300">{box.piece.stock} uds</span> (${box.piece.price.toFixed(2)}·{box.piece.barcode})</>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-sky-700/50 text-sky-400 hover:bg-sky-500/10"
                            disabled={pieceBusy === box.id || box.stock < 1 || !box.piecesPerUnit}
                            title={box.stock < 1 ? 'Sin stock de caja' : 'Abrir una caja y generar piezas'}
                            onClick={() => handleGeneratePieces(box)}
                          >
                            <PackageOpen className="h-3.5 w-3.5 mr-1.5" />
                            Abrir caja
                          </Button>
                          {(box.piecesTracked || box.piece) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-700/50 text-red-400 hover:bg-red-500/10"
                              disabled={pieceBusy === box.id}
                              onClick={() => handleRevertPieces(box)}
                            >
                              <X className="h-3.5 w-3.5 mr-1.5" />
                              Revertir
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-t border-slate-700 px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-xs text-slate-500 flex items-center gap-2">
                Página {page} de {Math.max(1, Math.ceil(total / LIMIT))} · {total} productos
                {loadingMore && <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
                  const busy = loading || loadingMore;
                  return (
                    <>
                      {lastVisited && lastVisited.sig === filtersSig && lastVisited.page !== page && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={busy}
                          onClick={() => goToPage(lastVisited.page)}
                          title={`Ir a la última página visitada (${lastVisited.page})`}
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          Última visitada: {lastVisited.page}
                        </Button>
                      )}
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => { e.preventDefault(); handleJump(); }}
                      >
                        <Input
                          type="number"
                          min={1}
                          max={totalPages}
                          value={jumpPage}
                          onChange={(e) => setJumpPage(e.target.value)}
                          placeholder="N.º"
                          title="Ir a la página"
                          className="h-8 w-16 text-xs"
                          inputMode="numeric"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={busy || !jumpPage.trim()}
                        >
                          Ir
                        </Button>
                      </form>
                    </>
                  );
                })()}
              </div>
            </div>
            {(() => {
              const totalPages = Math.max(1, Math.ceil(total / LIMIT));
              const maxButtons = 7;
              let pages: number[];
              if (totalPages <= maxButtons) {
                pages = Array.from({ length: totalPages }, (_, i) => i + 1);
              } else {
                const start = Math.max(1, Math.min(page - 3, totalPages - maxButtons + 1));
                pages = Array.from({ length: maxButtons }, (_, i) => start + i);
              }
              const busy = loading || loadingMore;
              return (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || busy} onClick={() => goToPage(1)} title="Primera página">
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || busy} onClick={() => goToPage(page - 1)} title="Página anterior">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  {pages.map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="icon"
                      className={`h-8 w-8 text-xs ${p === page ? 'bg-sky-700 hover:bg-sky-600' : ''}`}
                      disabled={busy}
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || busy} onClick={() => goToPage(page + 1)} title="Página siguiente">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || busy} onClick={() => goToPage(totalPages)} title="Última página">
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) { resetForm(); setSelectedProduct(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
              {editingPiece && (
                <div className="space-y-3 rounded-md border border-sky-800/60 bg-sky-950/20 p-3">
                  <div>
                    <Label className="text-slate-300">Precio por unidad suelta</Label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Se guarda en {editingPiece.name} ({editingPiece.barcode})
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Precio</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingPiece.price}
                        onChange={(e) => setEditingPiece((p) => p && { ...p, price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Costo</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingPiece.cost}
                        onChange={(e) => setEditingPiece((p) => p && { ...p, cost: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
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

      {/* Camera barcode scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScan}
      />
    </div>
  );
}
