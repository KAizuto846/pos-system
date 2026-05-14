'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, PackageOpen, Search } from 'lucide-react';
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
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
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
  const [formDepartmentId, setFormDepartmentId] = useState('');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Stock adjust
  const [stockAdjust, setStockAdjust] = useState('');

  const LIMIT = 50;

  const fetchProducts = (q?: string, pageNum: number = 1, append: boolean = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(pageNum));
    params.set('limit', String(LIMIT));
    
    fetch(`/api/products?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.products) {
          setProducts(prev => append ? [...prev, ...data.products] : data.products);
          setHasMore(data.pagination.hasMore);
          setTotal(data.pagination.total);
          setPage(pageNum);
        }
        setLoading(false);
        setLoadingMore(false);
      })
      .catch(() => { setLoading(false); setLoadingMore(false); });
  };

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
    fetchProducts();
    fetchDepartments();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(search || undefined, 1, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    fetchProducts(search || undefined, page + 1, true);
  };

  const resetForm = () => {
    setFormName('');
    setFormBarcode('');
    setFormPrice('');
    setFormCost('');
    setFormStock('');
    setFormMinStock('5');
    setFormDepartmentId('');
    setFormSupplierId('');
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    const body = {
      name: formName,
      barcode: formBarcode,
      price: parseFloat(formPrice),
      cost: formCost ? parseFloat(formCost) : 0,
      stock: parseInt(formStock || '0'),
      minStock: parseInt(formMinStock || '5'),
      departmentId: formDepartmentId ? parseInt(formDepartmentId) : null,
      supplierId: formSupplierId ? parseInt(formSupplierId) : null,
      active: true,
    };

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error creating product');
      return;
    }

    setCreateOpen(false);
    resetForm();
    fetchProducts(search);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setFormError('');
    setFormLoading(true);

    const body = {
      name: formName,
      barcode: formBarcode,
      price: parseFloat(formPrice),
      cost: formCost ? parseFloat(formCost) : 0,
      stock: parseInt(formStock || '0'),
      minStock: parseInt(formMinStock || '5'),
      departmentId: formDepartmentId ? parseInt(formDepartmentId) : null,
      supplierId: formSupplierId ? parseInt(formSupplierId) : null,
    };

    const res = await fetch(`/api/products/${selectedProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error updating product');
      return;
    }

    setEditOpen(false);
    resetForm();
    setSelectedProduct(null);
    fetchProducts(search);
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;

    const res = await fetch(`/api/products/${selectedProduct.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setDeleteOpen(false);
      setSelectedProduct(null);
      fetchProducts(search);
    }
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setFormLoading(true);

    const res = await fetch(`/api/products/${selectedProduct.id}/stock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustment: parseInt(stockAdjust) }),
    });

    setFormLoading(false);

    if (res.ok) {
      setStockOpen(false);
      setStockAdjust('');
      setSelectedProduct(null);
      fetchProducts(search);
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
    setFormDepartmentId(product.departmentId ? String(product.departmentId) : '');
    setFormSupplierId(product.supplierId ? String(product.supplierId) : '');
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Products</h2>
          <p className="text-sm text-slate-400 mt-1">Manage product inventory</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Product</DialogTitle>
              <DialogDescription>Add a new product to inventory</DialogDescription>
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
                    <Label htmlFor="create-name">Name</Label>
                    <Input id="create-name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-barcode">Barcode</Label>
                    <Input id="create-barcode" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-price">Price</Label>
                    <Input id="create-price" type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-cost">Cost</Label>
                    <Input id="create-cost" type="number" step="0.01" min="0" value={formCost} onChange={(e) => setFormCost(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-stock">Stock</Label>
                    <Input id="create-stock" type="number" min="0" value={formStock} onChange={(e) => setFormStock(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-minStock">Min Stock</Label>
                    <Input id="create-minStock" type="number" min="0" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Supplier</Label>
                    <Select value={formSupplierId} onValueChange={setFormSupplierId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search by name or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium text-slate-100">{product.name}</TableCell>
                    <TableCell className="text-slate-400 font-mono text-xs">{product.barcode || '—'}</TableCell>
                    <TableCell className="text-slate-200">${product.price.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={product.stock <= product.minStock ? 'destructive' : 'default'}
                      >
                        {product.stock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{product.department?.name || '—'}</TableCell>
                    <TableCell className="text-slate-300">{product.supplier?.name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={product.active ? 'default' : 'secondary'}>
                        {product.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setSelectedProduct(product); setStockAdjust('0'); setStockOpen(true); }}
                          title="Adjust stock"
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
          {/* Pagination controls */}
          <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500">
              Mostrando {products.length} de {total} productos
            </p>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="border-slate-600 text-slate-300"
              >
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
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update product information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="grid gap-4 py-4">
              {formError && (
                <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Barcode</Label>
                  <Input value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Cost</Label>
                  <Input type="number" step="0.01" min="0" value={formCost} onChange={(e) => setFormCost(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stock</Label>
                  <Input type="number" min="0" value={formStock} onChange={(e) => setFormStock(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Min Stock</Label>
                  <Input type="number" min="0" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={formSupplierId} onValueChange={setFormSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} — Current stock: {selectedProduct?.stock}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStockAdjust}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Stock Adjustment (use negative for reduction)</Label>
                <Input
                  type="number"
                  value={stockAdjust}
                  onChange={(e) => setStockAdjust(e.target.value)}
                  placeholder="e.g., 10 or -5"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? 'Adjusting...' : 'Adjust'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedProduct?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
