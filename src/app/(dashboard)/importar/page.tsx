'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Upload, FileSpreadsheet, Database, Check, AlertCircle, Loader2, ArrowLeft, Table2, Settings2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PreviewData {
  columns: string[];
  totalRows: number;
  previewRows: Record<string, unknown>[];
  fileName: string;
  fileType: 'dbf' | 'csv';
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
}

const ENTITY_TYPES = [
  { value: 'products', label: '📦 Productos', icon: 'Package' },
  { value: 'suppliers', label: '🚚 Proveedores', icon: 'Truck' },
  { value: 'departments', label: '🏢 Departamentos', icon: 'Building2' },
] as const;

const FIELD_OPTIONS: Record<string, Array<{ value: string; label: string; required?: boolean }>> = {
  products: [
    { value: 'name', label: 'Nombre del producto', required: true },
    { value: 'barcode', label: 'Código de barras' },
    { value: 'price', label: 'Precio de venta' },
    { value: 'cost', label: 'Costo' },
    { value: 'stock', label: 'Stock actual' },
    { value: 'minStock', label: 'Stock mínimo' },
    { value: 'department', label: 'Departamento' },
    { value: 'supplier', label: 'Proveedor' },
    { value: 'supplierPrice', label: 'Precio proveedor' },
  ],
  suppliers: [
    { value: 'name', label: 'Nombre del proveedor', required: true },
    { value: 'contact', label: 'Contacto' },
    { value: 'phone', label: 'Teléfono' },
    { value: 'email', label: 'Email' },
    { value: 'address', label: 'Dirección' },
  ],
  departments: [
    { value: 'name', label: 'Nombre del departamento', required: true },
    { value: 'description', label: 'Descripción' },
  ],
};

const ASPEL_AUTO_MAP: Record<string, Record<string, string>> = {
  // INVE01.DBF typical columns
  nombre: { name: 'name', note: 'Nombre del producto' },
  cve_articulo: { name: 'name', note: 'Se usará como nombre' },
  descripcion: { name: 'name', note: '' },
  descripcion_articulo: { name: 'name', note: '' },
  articulo: { name: 'name', note: '' },
  linea: { name: 'supplier', note: 'Código de línea/proveedor' },
  departamento: { name: 'department', note: 'Código de departamento' },
  stock_minimo: { name: 'minStock', note: '' },
  existencia: { name: 'stock', note: '' },
  codigo_barras: { name: 'barcode', note: '' },
  precio_venta: { name: 'price', note: '' },
  precio: { name: 'price', note: '' },
  costo_promedio: { name: 'cost', note: '' },
  costo_ultimo: { name: 'cost', note: '' },
  costo: { name: 'cost', note: '' },
  stock: { name: 'stock', note: '' },
  minimo: { name: 'minStock', note: '' },
  min: { name: 'minStock', note: '' },
  // INVE_PROV.DBF typical columns
  precio_proveedor: { name: 'supplierPrice', note: '' },
  cve_proveedor: { name: 'supplier', note: 'Código, no nombre' },
  // PROV01.DBF typical columns
  proveedor: { name: 'name', note: '' },
  contacto: { name: 'contact', note: '' },
  telefono: { name: 'phone', note: '' },
  tel: { name: 'phone', note: '' },
  email: { name: 'email', note: '' },
  correo: { name: 'email', note: '' },
  direccion: { name: 'address', note: '' },
  dir: { name: 'address', note: '' },
};

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState<string>('products');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [options, setOptions] = useState({
    updateExisting: false,
    createMissingSuppliers: true,
    createMissingDepartments: true,
  });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    errors: number;
    errorDetails: string[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) return;

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'dbf' && ext !== 'csv') {
      toast.error('Solo se aceptan archivos .dbf o .csv');
      return;
    }

    setFile(selectedFile);
    setPreview(null);
    setFieldMappings([]);
    setImportResult(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/import/preview', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al procesar archivo');
      }

      const data: PreviewData = await res.json();
      setPreview(data);

      // Auto-map fields based on Aspel column names
      const autoMappings: FieldMapping[] = [];
      const fieldKeys = FIELD_OPTIONS[entityType]?.map(f => f.value) || [];

      for (const col of data.columns) {
        const colLower = col.toLowerCase().replace(/\s+/g, '_');
        const aspelMatch = ASPEL_AUTO_MAP[colLower];
        if (aspelMatch && fieldKeys.includes(aspelMatch.name)) {
          autoMappings.push({ sourceField: col, targetField: aspelMatch.name });
        }
      }

      setFieldMappings(autoMappings);
      toast.success(`✅ Archivo cargado: ${data.totalRows.toLocaleString()} registros encontrados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar archivo');
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const updateMapping = useCallback((sourceField: string, targetField: string) => {
    setFieldMappings(prev => {
      const existing = prev.find(m => m.sourceField === sourceField);
      if (existing) {
        return prev.map(m => m.sourceField === sourceField ? { ...m, targetField } : m);
      }
      return [...prev, { sourceField, targetField }];
    });
  }, []);

  const removeMapping = useCallback((sourceField: string) => {
    setFieldMappings(prev => prev.filter(m => m.sourceField !== sourceField));
  }, []);
  const handleImport = useCallback(async () => {
    if (!preview || !file) return;

    const requiredFields = FIELD_OPTIONS[entityType].filter(f => f.required).map(f => f.value);
    const mappedTargets = fieldMappings.map(m => m.targetField);
    const missingRequired = requiredFields.filter(f => !mappedTargets.includes(f));

    if (missingRequired.length > 0) {
      toast.error(`Campos requeridos sin mapear: ${missingRequired.join(', ')}`);
      return;
    }

    setImporting(true);
    setImportProgress(30);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      formData.append('fieldMappings', JSON.stringify(fieldMappings));
      formData.append('options', JSON.stringify(options));

      setImportProgress(50);

      const res = await fetch('/api/import/execute', {
        method: 'POST',
        body: formData,
      });

      setImportProgress(90);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al importar');
      }

      const result = await res.json();
      setImportResult(result);
      setImportProgress(100);
      toast.success(`✅ Importación completada: ${result.imported} nuevos, ${result.updated} actualizados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar');
      setImportResult({ imported: 0, updated: 0, skipped: 0, errors: 1, errorDetails: [String(err)] });
    } finally {
      setImporting(false);
    }
  }, [preview, file, entityType, fieldMappings, options]);

  const resetAll = useCallback(() => {
    setFile(null);
    setPreview(null);
    setFieldMappings([]);
    setImportResult(null);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Importar Datos</h1>
          <p className="mt-1 text-sm text-slate-400">
            Importa productos, proveedores y departamentos desde archivos DBF (Aspel) o CSV
          </p>
        </div>
        {importResult && (
          <Button variant="outline" onClick={resetAll} className="border-slate-700 text-slate-300">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Nueva importación
          </Button>
        )}
      </div>

      {!importResult ? (
        <>
          {/* Step 1: File Upload */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                <Upload className="h-5 w-5 text-emerald-400" />
                1. Selecciona el archivo
              </CardTitle>
              <CardDescription className="text-slate-400">
                Arrastra un archivo .DBF (Aspel) o .CSV, o haz clic para seleccionarlo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
                  dragOver
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/30 hover:border-slate-500',
                  file && 'border-emerald-500/50 bg-emerald-500/5'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dbf,.csv"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                />

                {loading ? (
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
                ) : file ? (
                  <>
                    <FileSpreadsheet className="h-10 w-10 text-emerald-400" />
                    <p className="mt-3 text-sm font-medium text-slate-200">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs text-slate-500 hover:text-red-400"
                      onClick={(e) => { e.stopPropagation(); resetAll(); }}
                    >
                      Quitar archivo
                    </Button>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-slate-500" />
                    <p className="mt-3 text-sm font-medium text-slate-400">
                      Arrastra o haz clic para subir
                    </p>
                    <p className="mt-1 text-xs text-slate-600">DBF (Aspel SAE/INVENTARIOS) o CSV</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Entity Type & Preview */}
          {preview && (
            <>
              <Card className="border-slate-700 bg-slate-800/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                    <Database className="h-5 w-5 text-emerald-400" />
                    2. Configura la importación
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Entity type */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Tipo de datos a importar</Label>
                    <Select value={entityType} onValueChange={setEntityType}>
                      <SelectTrigger className="w-full border-slate-600 bg-slate-800 text-slate-200">
                        <SelectValue placeholder="Selecciona tipo" />
                      </SelectTrigger>
                      <SelectContent className="border-slate-600 bg-slate-800 text-slate-200">
                        {ENTITY_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Options */}
                  <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                    <p className="text-sm font-medium text-slate-300">Opciones</p>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-slate-400">Actualizar registros existentes</Label>
                      <Switch
                        checked={options.updateExisting}
                        onCheckedChange={(v) => setOptions(o => ({ ...o, updateExisting: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-slate-400">Crear proveedores faltantes automáticamente</Label>
                      <Switch
                        checked={options.createMissingSuppliers}
                        onCheckedChange={(v) => setOptions(o => ({ ...o, createMissingSuppliers: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-slate-400">Crear departamentos faltantes automáticamente</Label>
                      <Switch
                        checked={options.createMissingDepartments}
                        onCheckedChange={(v) => setOptions(o => ({ ...o, createMissingDepartments: v }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Preview Table */}
              <Card className="border-slate-700 bg-slate-800/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                    <Table2 className="h-5 w-5 text-emerald-400" />
                    3. Vista previa
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    {preview.totalRows.toLocaleString()} filas · Mostrando primeras {Math.min(preview.previewRows.length, 10)} filas
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="py-2 pr-4 text-xs font-medium uppercase text-slate-500">#</th>
                        {preview.columns.map((col) => (
                          <th key={col} className="px-2 py-2 text-xs font-medium uppercase text-slate-500">
                            {col}
                            {ASPEL_AUTO_MAP[col.toLowerCase()] && (
                              <Badge variant="outline" className="ml-1 border-emerald-700 bg-emerald-900/30 text-[10px] text-emerald-400">
                                auto
                              </Badge>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="py-2 pr-4 text-xs text-slate-600">{i + 1}</td>
                          {preview.columns.map((col) => (
                            <td key={col} className="max-w-[200px] truncate px-2 py-2 text-slate-300">
                              {String(row[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Step 4: Field Mapping */}
              <Card className="border-slate-700 bg-slate-800/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                    <Settings2 className="h-5 w-5 text-emerald-400" />
                    4. Mapeo de campos
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Asigna las columnas del archivo a los campos del sistema
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview.columns.map((col) => {
                    const mapping = fieldMappings.find(m => m.sourceField === col);
                    const currentTarget = mapping?.targetField || '';
                    const fieldOpts = FIELD_OPTIONS[entityType] || [];

                    return (
                      <div key={col} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/30 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-200">{col}</p>
                          <p className="text-xs text-slate-500">
                            {ASPEL_AUTO_MAP[col.toLowerCase()]?.note || 'columna del archivo'}
                          </p>
                        </div>
                        <ArrowLeft className="h-4 w-4 flex-shrink-0 text-slate-600" />
                        <Select
                          value={currentTarget}
                          onValueChange={(val) => {
                            if (val) updateMapping(col, val);
                            else removeMapping(col);
                          }}
                        >
                          <SelectTrigger className={cn(
                            'w-56 border-slate-600 bg-slate-800 text-slate-200',
                            currentTarget && 'border-emerald-600'
                          )}>
                            <SelectValue placeholder="— No mapear —" />
                          </SelectTrigger>
                          <SelectContent className="border-slate-600 bg-slate-800 text-slate-200">
                            <SelectItem value="__none__">— No mapear —</SelectItem>
                            {fieldOpts.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label} {opt.required ? '*' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapping && (
                          <Badge className="bg-emerald-900/40 text-emerald-400 border-emerald-700">
                            <Check className="mr-1 h-3 w-3" />
                            {fieldOpts.find(f => f.value === currentTarget)?.label || currentTarget}
                          </Badge>
                        )}
                      </div>
                    );
                  })}

                  {/* Validate required fields */}
                  {(() => {
                    const requiredFields = FIELD_OPTIONS[entityType].filter(f => f.required).map(f => f.value);
                    const mappedTargets = fieldMappings.map(m => m.targetField);
                    const missingRequired = requiredFields.filter(f => !mappedTargets.includes(f));
                    if (missingRequired.length > 0) {
                      return (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-900/20 p-3 text-sm text-amber-400">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span>
                            Campos requeridos faltantes:{' '}
                            {missingRequired.map(f => {
                              const opt = FIELD_OPTIONS[entityType].find(o => o.value === f);
                              return opt?.label || f;
                            }).join(', ')}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </CardContent>
              </Card>

              {/* Import button */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={resetAll} className="border-slate-700 text-slate-300">
                  Cancelar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || fieldMappings.length === 0}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Iniciar importación
                    </>
                  )}
                </Button>
              </div>

              {importing && (
                <div className="space-y-2">
                  <Progress value={importProgress} className="h-2 bg-slate-700 [&>div]:bg-emerald-500" />
                  <p className="text-center text-xs text-slate-500">Procesando datos...</p>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* Results */
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">📊 Resultado de importación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">{importResult.imported}</p>
                <p className="mt-1 text-xs text-slate-400">Importados</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">{importResult.updated}</p>
                <p className="mt-1 text-xs text-slate-400">Actualizados</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
                <p className="text-3xl font-bold text-slate-400">{importResult.skipped}</p>
                <p className="mt-1 text-xs text-slate-400">Saltados</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-center">
                <p className={cn('text-3xl font-bold', importResult.errors > 0 ? 'text-red-400' : 'text-slate-400')}>
                  {importResult.errors}
                </p>
                <p className="mt-1 text-xs text-slate-400">Errores</p>
              </div>
            </div>

            {importResult.errorDetails.length > 0 && (
              <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-4">
                <p className="mb-2 text-sm font-medium text-red-400">
                  Detalles de errores ({importResult.errorDetails.length})
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {importResult.errorDetails.slice(0, 20).map((err, i) => (
                    <p key={i} className="text-xs text-red-300">{err}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={resetAll} className="bg-emerald-600 text-white hover:bg-emerald-500">
                <Upload className="mr-2 h-4 w-4" />
                Importar otro archivo
              </Button>
              <Button variant="outline" onClick={() => router.push('/products')} className="border-slate-700 text-slate-300">
                Ver productos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
