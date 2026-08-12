'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogTitle, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScanLine, Camera, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

interface BarcodeDetectorLike {
  new (options?: { formats?: string[] }): {
    detect: (source: HTMLVideoElement | ImageBitmap) => Promise<{ rawValue: string }[]>;
  };
}

// Lector de códigos con la cámara del dispositivo.
// Usa la API nativa BarcodeDetector (Chrome/Edge/Android). En iOS Safari no
// existe; ahí se ofrece escritura manual. La cámara en vivo requiere un
// contexto seguro (HTTPS). En sitios no seguros (IP local en el teléfono) se
// ofrece el modo foto: abre la cámara nativa y decodifica la captura, sin
// necesidad del túnel de internet.
export function BarcodeScanner({ open, onOpenChange, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastCodeRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting');
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [manual, setManual] = useState('');
  const [photoWorking, setPhotoWorking] = useState(false);

  const hasPhotoMode =
    typeof window !== 'undefined' && !window.isSecureContext && 'BarcodeDetector' in window;

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      setStatus('starting');
      setError('');
      setLastCode('');
      lastCodeRef.current = '';
      return;
    }

    let canceled = false;
    const start = async () => {
      if (!window.isSecureContext) {
        if ('BarcodeDetector' in window) {
          setError(
            'Este sitio no es seguro (HTTP), por lo que la cámara en vivo no está disponible. Usa el botón "Escanear con foto": se abre la cámara del celular, tomas la foto y se lee el código automáticamente.'
          );
        } else {
          setError(
            'La cámara solo funciona en un sitio seguro (HTTPS). Desde este dispositivo usa el buscador o el lector de código del escritorio. En el celular, entra por el túnel de internet (Cloudflare) para activar la cámara.'
          );
        }
        setStatus('error');
        return;
      }
      if (!('BarcodeDetector' in window)) {
        setError(
          'Este navegador no tiene lector integrado (disponible en Chrome/Edge/Android). Escribe el código a mano abajo.'
        );
        setStatus('error');
        return;
      }
      setStatus('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (canceled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus('running');
        setError('');

        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorLike }).BarcodeDetector;
        const detector = new Detector({ formats: BARCODE_FORMATS });

        const loop = async () => {
          if (!video || video.readyState < 2 || video.ended) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
          try {
            const codes = await detector.detect(video);
            const code = codes[0]?.rawValue;
            if (code && code !== lastCodeRef.current) {
              lastCodeRef.current = code;
              setLastCode(code);
              onDetected(code);
            }
          } catch {
            // Frame ilegible: se sigue intentando
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        const err = e as DOMException;
        if (err?.name === 'NotAllowedError') {
          setError('Permite el acceso a la cámara en el navegador y vuelve a abrir el lector.');
        } else if (err?.name === 'NotFoundError') {
          setError('No se encontró una cámara en este dispositivo.');
        } else if (err?.name === 'NotReadableError') {
          setError('La cámara está siendo usada por otra aplicación.');
        } else {
          setError(`No se pudo iniciar la cámara: ${err?.message || 'error desconocido'}`);
        }
        setStatus('error');
      }
    };

    start();
    return () => {
      canceled = true;
      stop();
    };
  }, [open, onDetected, stop]);

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    lastCodeRef.current = code;
    setLastCode(code);
    setManual('');
    onDetected(code);
  };

  const handlePhoto = async (file: File) => {
    setPhotoWorking(true);
    try {
      const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorLike }).BarcodeDetector;
      const detector = new Detector({ formats: BARCODE_FORMATS });
      const bitmap = await createImageBitmap(file);
      try {
        const codes = await detector.detect(bitmap);
        const code = codes[0]?.rawValue;
        if (code) {
          lastCodeRef.current = code;
          setLastCode(code);
          onDetected(code);
          toast.success('Código leído: ' + code);
        } else {
          toast.error('No se encontró un código en la foto, intenta de nuevo');
        }
      } finally {
        bitmap.close();
      }
    } catch (e) {
      const err = e as Error;
      toast.error(err?.message || 'No se pudo leer el código de la foto');
    } finally {
      setPhotoWorking(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Leer código de barras
        </DialogTitle>
        <DialogDescription>
          Apunta la cámara al código del producto. Se agrega automáticamente al buscar y sigue activo para el siguiente.
        </DialogDescription>

        <div className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-48 rounded-lg border-2 border-dashed border-primary/70" />
            </div>
            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-slate-300">
                <Camera className="mr-2 h-4 w-4 animate-pulse" />
                Iniciando cámara...
              </div>
            )}
            {status === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/85 p-4 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
                <p className="max-w-xs text-xs text-slate-300">{error}</p>
                {hasPhotoMode && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhoto(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photoWorking}
                      className="mt-1 border-emerald-600 text-emerald-400 hover:bg-emerald-950"
                    >
                      {photoWorking ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                          Leyendo foto...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Escanear con foto
                        </span>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {lastCode && (
            <p className="flex items-center gap-2 rounded-md border border-emerald-700/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Último código leído: <span className="font-mono">{lastCode}</span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="manual-code" className="text-xs text-slate-400">
              O escribe el código a mano
            </Label>
            <div className="flex gap-2">
              <Input
                id="manual-code"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitManual();
                  }
                }}
                placeholder="Ej. 7501022013885"
                autoComplete="off"
                className="border-slate-600 bg-slate-800 text-slate-100"
              />
              <Button variant="outline" onClick={submitManual} disabled={!manual.trim()}>
                Leer
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button
              variant="secondary"
              onClick={() => {
                stop();
                toast.success('Lector cerrado');
              }}
            >
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}