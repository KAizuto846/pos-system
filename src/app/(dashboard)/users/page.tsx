'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Power, PowerOff, ClipboardList, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
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

interface User {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

interface WishlistItem {
  id: number;
  userId: number;
  productId: number | null;
  name: string;
  quantity: number | null;
  notes: string;
  product?: { id: number; name: string; barcode: string; price: number } | null;
}

interface ProductSearchResult {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('CASHIER');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // ── Wishlist (lista de medicamentos/productos que la persona necesita) ──
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishSearch, setWishSearch] = useState('');
  const [wishResults, setWishResults] = useState<ProductSearchResult[]>([]);
  const [wishSearching, setWishSearching] = useState(false);
  const [wishName, setWishName] = useState('');
  const [wishQuantity, setWishQuantity] = useState('');
  const [wishNotes, setWishNotes] = useState('');
  const [wishAdding, setWishAdding] = useState(false);

  const loadWishlist = async (userId: number) => {
    setWishlistLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/wishlist`);
      const data = await res.json();
      setWishlist(res.ok ? data.items || [] : []);
    } catch {
      setWishlist([]);
    } finally {
      setWishlistLoading(false);
    }
  };

  const openWishlist = (user: User) => {
    setSelectedUser(user);
    setWishlistOpen(true);
    setWishSearch('');
    setWishResults([]);
    setWishName('');
    setWishQuantity('');
    setWishNotes('');
    loadWishlist(user.id);
  };

  const addWishlistItem = async (productId: number | null) => {
    if (!selectedUser) return;
    setWishAdding(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          name: productId === null ? wishName.trim() : undefined,
          quantity: wishQuantity ? parseInt(wishQuantity) : undefined,
          notes: wishNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al agregar');
        return;
      }
      toast.success('Agregado a la lista');
      setWishName('');
      setWishQuantity('');
      setWishNotes('');
      setWishSearch('');
      setWishResults([]);
      loadWishlist(selectedUser.id);
    } catch {
      toast.error('Error de conexión');
    } finally {
      setWishAdding(false);
    }
  };

  const removeWishlistItem = async (itemId: number) => {
    if (!selectedUser) return;
    try {
      const res = await fetch(`/api/users/${selectedUser.id}/wishlist/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('No se pudo eliminar');
        return;
      }
      setWishlist((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      toast.error('Error de conexión');
    }
  };

  const fetchUsers = () => {
    setLoading(true);
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!wishlistOpen || wishSearch.trim().length < 2) {
      setWishResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setWishSearching(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(wishSearch.trim())}&limit=8`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setWishResults(res.ok ? data.products || [] : []);
      } catch {
        setWishResults([]);
      } finally {
        if (!controller.signal.aborted) setWishSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [wishSearch, wishlistOpen]);

  const resetForm = () => {
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormRole('CASHIER');
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        username: formUsername,
        password: formPassword,
        role: formRole,
        active: true,
      }),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error creating user');
      return;
    }

    setCreateOpen(false);
    resetForm();
    fetchUsers();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError('');
    setFormLoading(true);

    const body: Record<string, unknown> = {
      name: formName,
      username: formUsername,
      role: formRole,
    };
    if (formPassword) body.password = formPassword;

    const res = await fetch(`/api/users/${selectedUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error updating user');
      return;
    }

    setEditOpen(false);
    resetForm();
    setSelectedUser(null);
    fetchUsers();
  };

  const handleDelete = async () => {
    if (!selectedUser) return;

    const res = await fetch(`/api/users/${selectedUser.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setDeleteOpen(false);
      setSelectedUser(null);
      fetchUsers();
    }
  };

  const toggleActive = async (user: User) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });

    if (res.ok) fetchUsers();
  };

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setFormName(user.name);
    setFormUsername(user.username);
    setFormPassword('');
    setFormRole(user.role);
    setEditOpen(true);
  };

  const openDelete = (user: User) => {
    setSelectedUser(user);
    setDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Users</h2>
          <p className="text-sm text-slate-400 mt-1">Manage system users</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>Add a new user to the system</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="space-y-4 py-4">
                {formError && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="create-name">Full Name</Label>
                  <Input id="create-name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-username">Username</Label>
                  <Input id="create-username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-password">Password</Label>
                  <Input id="create-password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={formRole} onValueChange={setFormRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASHIER">Cashier</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
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

      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-slate-100">{user.name}</TableCell>
                    <TableCell className="text-slate-300">{user.username}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'} className="uppercase">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? 'default' : 'secondary'}>
                        {user.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openWishlist(user)} title="Lista de medicamentos/productos que necesita">
                          <ClipboardList className="h-4 w-4 text-sky-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleActive(user)} title="Toggle active">
                          {user.active ? <PowerOff className="h-4 w-4 text-red-400" /> : <Power className="h-4 w-4 text-emerald-400" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                          <Pencil className="h-4 w-4 text-slate-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(user)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="space-y-4 py-4">
              {formError && (
                <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                  {formError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input id="edit-name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-username">Username</Label>
                <Input id="edit-username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Password (leave blank to keep current)</Label>
                <Input id="edit-password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASHIER">Cashier</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
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

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedUser?.name}? This action cannot be undone.
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

      {/* Lista de medicamentos/productos que la persona necesita */}
      <Dialog open={wishlistOpen} onOpenChange={(o) => { setWishlistOpen(o); if (!o) setSelectedUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-sky-400" />
              Lista de medicamentos — {selectedUser?.name}
            </DialogTitle>
            <DialogDescription>
              Productos que esta persona necesita. Cuando un pedido recibido contenga algo de esta lista,
              aparecerá una alerta hasta que confirmes que su pedido llegó.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Agregar desde inventario */}
            <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 space-y-2">
              <Label className="text-xs text-slate-400">Agregar producto del inventario</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por nombre o código..."
                  value={wishSearch}
                  onChange={(e) => setWishSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {wishSearch.trim().length >= 2 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {wishSearching ? (
                    <p className="text-sm text-slate-400 py-2 text-center">Buscando...</p>
                  ) : wishResults.length === 0 ? (
                    <p className="text-sm text-slate-500 py-2 text-center">Sin resultados</p>
                  ) : (
                    wishResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addWishlistItem(p.id)}
                        disabled={wishAdding}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-slate-700/60 transition-colors text-left"
                      >
                        <div>
                          <div className="text-sm text-slate-200">{p.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{p.barcode || '—'}</div>
                        </div>
                        <Plus className="h-4 w-4 text-emerald-400 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Agregar manual (producto que no está en inventario) */}
            <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 space-y-2">
              <Label className="text-xs text-slate-400">Agregar manualmente</Label>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <Input placeholder="Nombre del medicamento/producto" value={wishName} onChange={(e) => setWishName(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Input type="number" min="1" placeholder="Cant." value={wishQuantity} onChange={(e) => setWishQuantity(e.target.value)} />
                </div>
                <div className="col-span-4">
                  <Input placeholder="Notas (opcional)" value={wishNotes} onChange={(e) => setWishNotes(e.target.value)} />
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-emerald-400 border-emerald-700/60 hover:bg-emerald-500/10"
                disabled={wishAdding || !wishName.trim()}
                onClick={() => addWishlistItem(null)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />Agregar a la lista
              </Button>
            </div>

            {/* Lista actual */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Lista actual ({wishlist.length})</Label>
              {wishlistLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full bg-slate-700" />
                  ))}
                </div>
              ) : wishlist.length === 0 ? (
                <p className="text-sm text-slate-500 py-3 text-center border border-dashed border-slate-700 rounded-md">
                  Sin productos en la lista
                </p>
              ) : (
                <div className="space-y-1.5">
                  {wishlist.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">
                          {item.product ? item.product.name : item.name}
                          {item.quantity && <span className="ml-1.5 text-xs text-slate-400">×{item.quantity}</span>}
                          {!item.productId && (
                            <span className="ml-2 rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-400 border border-amber-700/50">sin inventario</span>
                          )}
                        </div>
                        {(item.notes || item.product?.barcode) && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.product?.barcode ? `${item.product.barcode} · ` : ''}{item.notes}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWishlistItem(item.id)}
                        className="text-red-400 hover:text-red-300 shrink-0"
                        title="Quitar de la lista"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
