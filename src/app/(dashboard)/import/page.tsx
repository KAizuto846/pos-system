'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, XCircle, FileJson, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import toast from 'react-hot-toast';

interface ImportData {
  departments?: { name: string; description?: string }[];
  suppliers?: { name: string; contact?: string; phone?: string; email?: string; address?: string }[];
  products?: {
    name: string;
    barcode?: string;
    price: number;
    cost?: number;
    stock?: number;
    minStock?: number;
    departmentName?: string;
    supplierName?: string;
  }[];
}

interface ImportCounts {
  departments: { created: number; skipped: number };
  suppliers: { created: number; skipped: number };
  products: { created: number; skipped: number; errors: { name: string; barcode: string; error: string }[] };
}

const SAMPLE_TEMPLATE: ImportData = {
  departments: [
    { name: "Línea X", description: "Importado de Aspel" },
    { name: "Línea Y", description: "Importado de Aspel" },
  ],
  suppliers: [
    { name: "Proveedor Ejemplo", contact: "RFC123", phone: "555-0000", email: "contacto@ejemplo.com", address: "Calle Principal 123" },
  ],
  products: [
    { name: "Producto Ejemplo", barcode: "7501234567890", price: 99.50, cost: 50.00, stock: 100, minStock: 5, departmentName: "Línea X", supplierName: "Proveedor Ejemplo" },
    { name: "Producto Ejemplo 2", barcode: "7509876543210", price: 199.99, cost: 120.00, stock: 50, minStock: 10, departmentName: "Línea Y" },
  ],
};

export default function ImportPage() {
  const [fileData, setFileData] = useState<ImportData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportCounts | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Solo se aceptan archivos .json');
      return;
    }

    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as ImportData;
        setFileData(data);

        const deptCount = data.departments?.length ?? 0;
        const suppCount = data.suppliers?.length ?? 0;
        const prodCount = data.products?.length ?? 0;

        toast.success(
          `Archivo cargado: ${prodCount} productos, ${suppCount} proveedores, ${deptCount} departamentos`
        );
      } catch {
        toast.error('El archivo no contiene un JSON válido');
        setFileData(null);
      }
    };
    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setFileData(null);
    };
    reader.readAsText(file);
  }, []);

  const handleDownloadSample = useCallback(() => {
    const blob = new Blob([JSON.stringify(SAMPLE_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-importacion.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Plantilla descargada');
  }, []);

  const handleImport = useCallback(async () => {
    if (!fileData) {
      toast.error('Selecciona un archivo JSON primero');
      return;
    }

    setImporting(true);
    setResult(null);

    const loadingToast = toast.loading('Importando datos...');

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Error en la importación');
      }

      setResult(data.counts);
      toast.dismiss(loadingToast);
      toast.success('✅ Importación completada exitosamente');
    } catch (err) {
      toast.dismiss(loadingToast);
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`❌ ${message}`);
    } finally {
      setImporting(false);
    }
  }, [fileData]);

  const handleReset = useCallback(() => {
    setFileData(null);
    setFileName('');
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const totalRows = (fileData?.departments?.length ?? 0) +
    (fileData?.suppliers?.length ?? 0) +
    (fileData?.products?.length ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Importar Datos - Aspel SAE 5.0</h1>
        <p className="mt-1 text-sm text-slate-400">
          Importa productos, proveedores y departamentos desde tu sistema Aspel SAE 5.0.
          El archivo debe estar en formato JSON con la estructura esperada.
        </p>
      </div>

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Database className="h-5 w-5 text-emerald-400" />
            Instrucciones
          </CardTitle>
          <CardDescription>
            Sigue estos pasos para importar tus datos correctamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
            <li>
              <span className="font-medium text-slate-100">Exporta tus datos de Aspel SAE 5.0 a CSV</span>
              <p className="ml-5 mt-1 text-slate-400">
                Desde Aspel SAE, exporta tus productos, proveedores y líneas/departamentos
                a archivos CSV separados.
              </p>
            </li>
            <li>
              <span className="font-medium text-slate-100">Convierte a JSON con el script incluido</span>
              <p className="ml-5 mt-1 text-slate-400">
                Usa el script de conversión <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400">convert-aspel.js</code>{' '}
                para transformar los CSV al formato JSON requerido por este sistema.
              </p>
            </li>
            <li>
              <span className="font-medium text-slate-100">Sube el archivo JSON aquí</span>
              <p className="ml-5 mt-1 text-slate-400">
                Selecciona el archivo JSON generado para previsualizar los datos y luego
                haz clic en &quot;Importar&quot; para cargarlos en el sistema.
              </p>
            </li>
          </ol>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadSample}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Descargar Plantilla de Ejemplo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Upload className="h-5 w-5 text-emerald-400" />
            Subir Archivo JSON
          </CardTitle>
          <CardDescription>
            Selecciona un archivo .json con los datos a importar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <label
              htmlFor="json-upload"
              className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                fileData
                  ? 'border-emerald-600/50 bg-emerald-950/20'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
              }`}
            >
              <FileJson className={`mb-2 h-10 w-10 ${fileData ? 'text-emerald-400' : 'text-slate-500'}`} />
              {fileData ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-400">{fileName}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {fileData.products?.length ?? 0} productos,{' '}
                    {fileData.suppliers?.length ?? 0} proveedores,{' '}
                    {fileData.departments?.length ?? 0} departamentos
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-300">
                    Haz clic para seleccionar o arrastra un archivo aquí
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Solo archivos .json</p>
                </div>
              )}
              <input
                id="json-upload"
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>

            {fileData && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={importing}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Table */}
      {fileData && totalRows > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-100">
              Vista Previa
              <Badge variant="secondary" className="ml-2 text-xs">
                {totalRows} registros
              </Badge>
            </CardTitle>
            <CardDescription>
              Revisa los datos que se importarán antes de continuar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Departments preview */}
            {fileData.departments && fileData.departments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-emerald-400">
                  Departamentos ({fileData.departments.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Descripción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileData.departments.slice(0, 10).map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="text-slate-400">{d.description ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {fileData.departments.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-xs text-slate-500">
                          ... y {fileData.departments.length - 10} más
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Suppliers preview */}
            {fileData.suppliers && fileData.suppliers.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-emerald-400">
                  Proveedores ({fileData.suppliers.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileData.suppliers.slice(0, 10).map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-slate-400">{s.contact ?? '—'}</TableCell>
                        <TableCell className="text-slate-400">{s.phone ?? '—'}</TableCell>
                        <TableCell className="text-slate-400">{s.email ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {fileData.suppliers.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-slate-500">
                          ... y {fileData.suppliers.length - 10} más
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Products preview */}
            {fileData.products && fileData.products.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-emerald-400">
                  Productos ({fileData.products.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Código de Barras</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Proveedor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileData.products.slice(0, 10).map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">
                          {p.barcode ?? '—'}
                        </TableCell>
                        <TableCell>${p.price.toFixed(2)}</TableCell>
                        <TableCell className="text-slate-400">
                          {p.cost != null ? `$${p.cost.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell>{p.stock ?? 0}</TableCell>
                        <TableCell className="text-slate-400">{p.departmentName ?? '—'}</TableCell>
                        <TableCell className="text-slate-400">{p.supplierName ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {fileData.products.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-xs text-slate-500">
                          ... y {fileData.products.length - 10} más
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Import Button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={handleImport}
                disabled={importing}
                className="gap-2 px-8"
              >
                {importing ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Importando...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    Importar Datos
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Display */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Resultado de la Importación
            </CardTitle>
            <CardDescription>
              Resumen de los datos procesados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Departments */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="mb-2 text-sm font-medium text-slate-300">Departamentos</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-slate-300">Creados:</span>
                    <span className="font-semibold text-emerald-400">{result.departments.created}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">Omitidos:</span>
                    <span className="font-semibold text-slate-400">{result.departments.skipped}</span>
                  </div>
                </div>
              </div>

              {/* Suppliers */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="mb-2 text-sm font-medium text-slate-300">Proveedores</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-slate-300">Creados:</span>
                    <span className="font-semibold text-emerald-400">{result.suppliers.created}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">Omitidos:</span>
                    <span className="font-semibold text-slate-400">{result.suppliers.skipped}</span>
                  </div>
                </div>
              </div>

              {/* Products */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="mb-2 text-sm font-medium text-slate-300">Productos</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-slate-300">Creados:</span>
                    <span className="font-semibold text-emerald-400">{result.products.created}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">Omitidos:</span>
                    <span className="font-semibold text-slate-400">{result.products.skipped}</span>
                  </div>
                  {result.products.errors.length > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-slate-300">Errores:</span>
                      <span className="font-semibold text-red-400">{result.products.errors.length}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error details */}
            {result.products.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-red-400">
                  <XCircle className="h-4 w-4" />
                  Detalle de Errores ({result.products.errors.length})
                </h4>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-red-800/30 bg-red-950/20 p-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.products.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-red-300">{e.name}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">{e.barcode || '—'}</TableCell>
                          <TableCell className="text-red-300">{e.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <Upload className="h-4 w-4" />
                Importar Otro Archivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
