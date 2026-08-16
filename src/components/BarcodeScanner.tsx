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

// Decodificador por software (@zxing): funciona en CUALQUIER navegador y sin
// HTTPS (IP local), a diferencia de la API nativa BarcodeDetector.
// Importación de tipos en runtime: Next.js puede usar @zxing/library en el
// cliente (lib = ESM compatible con browsers).
import type { MultiFormatReader } from '@zxing/library';

let zxingMultiReader: MultiFormatReader | null = null;
async function getZxingReader(): Promise<MultiFormatReader> {
  if (zxingMultiReader) return zxingMultiReader;
  const { MultiFormatReader: Zx, BarcodeFormat, DecodeHintType } = await import('@zxing/library');
  const hints = new Map();
  hints.set(
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
    ]
  );
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new Zx();
  reader.setHints(hints);
  zxingMultiReader = reader;
  return reader;
}

// Decodifica un ImageData (de un <video> o de un archivo de imagen) usando
// zxing. Devuelve el código o null.
async function decodeImageData(imageData: ImageData): Promise<string | null> {
  try {
    const reader = await getZxingReader();
    const { RGBLuminanceSource, BinaryBitmap, HybridBinarizer } = await import('@zxing/library');
    const luminanceSource = new RGBLuminanceSource(
      Uint8ClampedArray.from(imageData.data),
      imageData.width,
      imageData.height
    );
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const result = reader.decode(binaryBitmap);
    return result?.getText?.() || null;
  } catch {
    return null;
  }
}

// Lee el frame actual del video a un canvas y lo decodifica.
async function decodeVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

// Decodifica un archivo de imagen (foto) usando zxing.
async function decodePhotoFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } finally {
    bitmap.close();
  }
}

// Lector de códigos con la cámara del dispositivo.
// Usa la API nativa BarcodeDetector si existe (más rápido), y si no (o si el
// sitio no es HTTPS), cae al decodificador por software @zxing, que funciona en
// cualquier navegador. El modo foto funciona siempre, incluso sin HTTPS.
export function BarcodeScanner({ open, onOpenChange, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastCodeRef = useRef('');
  const canceledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting');
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [manual, setManual] = useState('');
  const [photoWorking, setPhotoWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const hasBarcodeDetector =
    typeof window !== 'undefined' && 'BarcodeDetector' in window;

  // El modo foto siempre está disponible: decodifica con zxing (software),
  // funciona en cualquier navegador y sin HTTPS.
  const hasPhotoMode =
    typeof window !== 'undefined' && !window.isSecureContext;

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || canceledRef.current) return;

    // La cámara EN VIVO siempre requiere HTTPS. Sin HTTPS solo funciona el
    // modo foto (cámara nativa del navegador) o la escritura manual.
    if (!window.isSecureContext) {
      setError(
        'Este sitio no es seguro (HTTP): la cámara en vivo no está disponible en el navegador. Usa "Escanear con foto" (abre la cámara del celular) o escribe el código a mano.'
      );
      setStatus('error');
      return;
    }
    setStatus('starting');
    try {
      // Prueba primero con cámara trasera; si el dispositivo no la soporta
      // (OverconstrainedError), reintenta con cualquier cámara.
      let stream: MediaStream | null = null;
      let lastErr: unknown;
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' } } },
        { video: true },
      ];
      for (const constraints of attempts) {
        if (canceledRef.current) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!stream) {
        if (lastErr === undefined) throw new Error('No se pudo acceder a la cámara');
        throw lastErr;
      }
      if (canceledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      if (canceledRef.current) return;
      setStatus('running');
      setError('');

      let detector: { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } | null = null;
      if (hasBarcodeDetector) {
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorLike }).BarcodeDetector;
        detector = new Detector({ formats: BARCODE_FORMATS });
      }

      const loop = async () => {
        if (!video || video.readyState < 2 || video.ended) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        let code: string | null = null;
        try {
          if (detector) {
            const codes = await detector.detect(video);
            code = codes[0]?.rawValue || null;
          }
          if (!code) {
            // Fallback por software (funciona aunque BarcodeDetector falle)
            code = await decodeVideoFrame(video);
          }
        } catch {
          code = await decodeVideoFrame(video).catch(() => null);
        }
        if (code && code !== lastCodeRef.current) {
          lastCodeRef.current = code;
          setLastCode(code);
          onDetected(code);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const err = e as DOMException;
      if (err?.name === 'NotAllowedError') {
        setError('Permite el acceso a la cámara en el navegador y toca "Reintentar".');
      } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
        setError('No se encontró una cámara en este dispositivo.');
      } else if (err?.name === 'NotReadableError') {
        setError('La cámara está siendo usada por otra aplicación.');
      } else {
        setError(`No se pudo iniciar la cámara: ${err?.message || 'error desconocido'}`);
      }
      setStatus('error');
    }
  }, [onDetected, hasBarcodeDetector]);

  useEffect(() => {
    if (!open) return;
    canceledRef.current = false;
    const id = setTimeout(() => void start(), 0);
    return () => {
      clearTimeout(id);
      canceledRef.current = true;
      stop();
    };
  }, [open, start, stop, attempt]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      canceledRef.current = true;
      stop();
      setStatus('starting');
      setError('');
      setLastCode('');
      lastCodeRef.current = '';
    }
    onOpenChange(next);
  };

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
      let code: string | null = null;
      // Primero intentar con la API nativa (más precisa)
      if (hasBarcodeDetector) {
        try {
          const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorLike }).BarcodeDetector;
          const detector = new Detector({ formats: BARCODE_FORMATS });
          const bitmap = await createImageBitmap(file);
          try {
            const codes = await detector.detect(bitmap);
            code = codes[0]?.rawValue || null;
          } finally {
            bitmap.close();
          }
        } catch {
          code = null;
        }
      }
      // Si falló o no hay API nativa, usar zxing
      if (!code) {
        code = await decodePhotoFile(file);
      }
      if (code) {
        lastCodeRef.current = code;
        setLastCode(code);
        onDetected(code);
        toast.success('Código leído: ' + code);
      } else {
        toast.error('No se encontró un código en la foto, intenta de nuevo');
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus('starting');
                    setError('');
                    setAttempt((a) => a + 1);
                  }}
                  className="mt-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <ScanLine className="h-4 w-4" />
                  Reintentar
                </Button>
              </div>
            )}
          </div>

          {lastCode && (
            <p className="flex items-center gap-2 rounded-md border border-emerald-700/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Último código leído: <span className="font-mono">{lastCode}</span>
            </p>
          )}

          {/* Modo foto: disponible siempre (funciona sin HTTPS y en cualquier navegador) */}
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
            className="w-full border-emerald-600 text-emerald-400 hover:bg-emerald-950"
          >
            {photoWorking ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                Leyendo foto...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Escanear con foto (funciona sin HTTPS)
              </span>
            )}
          </Button>

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