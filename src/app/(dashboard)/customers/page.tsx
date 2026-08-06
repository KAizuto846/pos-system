'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { Search, Plus, Edit, Trash2, Fingerprint, User, Loader2, Star, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  fingerprintHash: string | null;
  totalSpent: number;
  purchaseCount: number;
  lastPurchaseAt: string | null;
  tier: string;
  active: boolean;
  createdAt: string;
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'text-amber-400 border-amber-700 bg-amber-900/30',
  silver: 'text-slate-300 border-slate-500 bg-slate-700/30',
  gold: 'text-yellow-400 border-yellow-600 bg-yellow-900/30',
};

const TIER_LABELS: Record<string, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
};

export default function CustomersPage() {
  const customersAbortRef = useRef<AbortController | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const fetchCustomers = useCallback(async (query: string) => {
    customersAbortRef.current?.abort();
    const controller = new AbortController();
    customersAbortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('limit', '100');
      const res = await fetch(`/api/customers?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Error al cargar clientes');
      }
    } finally {
      if (customersAbortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    customersAbortRef.current?.abort();
    const timer = setTimeout(() => fetchCustomers(search), 300);
    return () => {
      clearTimeout(timer);
      customersAbortRef.current?.abort();
    };
  }, [search, fetchCustomers]);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Cliente creado');
      setShowAddModal(false);
      setForm({ name: '', phone: '', email: '' });
      fetchCustomers(search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedCustomer || !form.name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      toast.success('Cliente actualizado');
      setShowEditModal(false);
      fetchCustomers(search);
    } catch {
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Eliminar a ${customer.name}?`)) return;
    try {
      await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      toast.success('Cliente eliminado');
      fetchCustomers(search);
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const handleEnrollFingerprint = async () => {
    if (!selectedCustomer) return;
    setEnrolling(true);
    try {
      const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const res = await fetch('/api/customers/fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll', customerId: selectedCustomer.id, fingerprintData: hash }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success('Huella registrada');
      fetchCustomers(search);
      setShowDetailModal(false);
    } catch {
      toast.error('Error al registrar huella');
    } finally {
      setEnrolling(false);
    }
  };

  const getTierProgress = (count: number) => {
    if (count < 10) return count / 10 * 100;
    if (count < 30) return (count - 10) / 20 * 100;
    return 100;
  };

  const openEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setForm({ name: customer.name, phone: customer.phone, email: customer.email });
    setShowEditModal(true);
  };

  const openDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailModal(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Clientes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Programa de fidelidad - Gestiona clientes, huellas y descuentos
          </p>
        </div>
        <Button onClick={() => { setForm({ name: '', phone: '', email: '' }); setShowAddModal(true); }} className="bg-emerald-600 hover:bg-emerald-500">
          <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Buscar por nombre, telefono o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 border-slate-600 bg-slate-800 text-slate-100"
        />
      </div>

      {/* Customer Cards */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <User className="mb-2 h-12 w-12" />
          <p>{search ? 'No se encontraron clientes' : 'No hay clientes registrados'}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer border-slate-700 bg-slate-800 hover:border-slate-600 transition-colors"
              onClick={() => openDetail(c)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-100">{c.name}</h3>
                    {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                    {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                  </div>
                  <Badge className={TIER_COLORS[c.tier] || TIER_COLORS.bronze}>
                    {TIER_LABELS[c.tier] || 'Bronce'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {c.purchaseCount} visitas</span>
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {formatCurrency(c.totalSpent)}</span>
                </div>
                <Progress value={getTierProgress(c.purchaseCount)} className="h-1.5 bg-slate-700 [&>div]:bg-emerald-500" />
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="h-8 text-slate-400 hover:text-slate-200">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(c); }} className="h-8 text-slate-400 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="border-slate-700 bg-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
            <DialogDescription className="text-slate-400">Registra un nuevo cliente para el programa de fidelidad</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="border-slate-600 bg-slate-700 text-slate-200" placeholder="Nombre completo" /></div>
            <div className="space-y-2"><Label>Telefono</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="border-slate-600 bg-slate-700 text-slate-200" placeholder="+52 555 123 4567" /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="border-slate-600 bg-slate-700 text-slate-200" placeholder="cliente@email.com" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="border-slate-600 text-slate-300">Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="border-slate-700 bg-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="border-slate-600 bg-slate-700 text-slate-200" /></div>
            <div className="space-y-2"><Label>Telefono</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="border-slate-600 bg-slate-700 text-slate-200" /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="border-slate-600 bg-slate-700 text-slate-200" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)} className="border-slate-600 text-slate-300">Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="border-slate-700 bg-slate-800 text-slate-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-400" />
              {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{selectedCustomer.purchaseCount}</p>
                  <p className="text-xs text-slate-400">Visitas</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{formatCurrency(selectedCustomer.totalSpent)}</p>
                  <p className="text-xs text-slate-400">Total gastado</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
                  <Badge className={TIER_COLORS[selectedCustomer.tier]}>{TIER_LABELS[selectedCustomer.tier]}</Badge>
                  <p className="text-xs text-slate-400 mt-1">Nivel</p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Progreso: {selectedCustomer.tier === 'gold' ? 'Maximo' : selectedCustomer.purchaseCount < 10 ? `${selectedCustomer.purchaseCount}/10 hacia Plata` : `${selectedCustomer.purchaseCount}/30 hacia Oro`}</span>
                </div>
                <Progress value={getTierProgress(selectedCustomer.purchaseCount)} className="h-2 bg-slate-700 [&>div]:bg-emerald-500" />
              </div>

              <div className="space-y-1 text-sm">
                {selectedCustomer.phone && <p className="text-slate-400">Telefono: <span className="text-slate-200">{selectedCustomer.phone}</span></p>}
                {selectedCustomer.email && <p className="text-slate-400">Email: <span className="text-slate-200">{selectedCustomer.email}</span></p>}
                <p className="text-slate-400">
                  Huella: {selectedCustomer.fingerprintHash ? (
                    <span className="text-emerald-400">Registrada</span>
                  ) : (
                    <span className="text-red-400">No registrada</span>
                  )}
                </p>
                {selectedCustomer.lastPurchaseAt && (
                  <p className="text-slate-400">Ultima compra: <span className="text-slate-200">{new Date(selectedCustomer.lastPurchaseAt).toLocaleDateString()}</span></p>
                )}
              </div>

              <Button
                onClick={handleEnrollFingerprint}
                disabled={enrolling}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200"
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                {enrolling ? 'Registrando...' : selectedCustomer.fingerprintHash ? 'Re-registrar huella' : 'Registrar huella'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
