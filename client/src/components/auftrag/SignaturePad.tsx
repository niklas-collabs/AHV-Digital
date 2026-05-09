import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SignaturePadProps {
  /** Aktuelle Unterschrift als data-URL (image/png) oder null */
  value: string | null;
  /** Wird beim Stroke-End oder beim Clear aufgerufen */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

/**
 * Touch- und Maus-fähiges Unterschriften-Feld auf einem HTML-Canvas.
 * - 200 px hoch, responsive Breite
 * - devicePixelRatio-aware für scharfe Linien auf Retina/Handy-Displays
 * - emittet bei jedem Stroke-Ende eine PNG-data-URL nach oben
 */
export function SignaturePad({ value, onChange, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasContent, setHasContent] = useState(!!value);

  // Setup: Canvas-Größe + initialer Inhalt aus value
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const setupCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = 200 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '200px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f1117';

      // Wenn schon eine Unterschrift hinterlegt ist, zeichne sie.
      if (value && value.startsWith('data:image/')) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, rect.width, 200);
          // einpassen mit aspect
          const targetW = rect.width;
          const targetH = 200;
          const scale = Math.min(targetW / img.width, targetH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (targetW - w) / 2;
          const y = (targetH - h) / 2;
          ctx.drawImage(img, x, y, w, h);
        };
        img.src = value;
      }
    };

    setupCanvas();
    const ro = new ResizeObserver(setupCanvas);
    ro.observe(container);
    return () => ro.disconnect();
    // value bewusst weglassen — wenn value sich ändert, wollen wir nicht neu rendern
    // (außer beim ersten Mount). Sonst wird beim onChange-Callback der Inhalt verworfen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCtx = (): CanvasRenderingContext2D | null => {
    return canvasRef.current?.getContext('2d') ?? null;
  };

  const getPos = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    setHasContent(true);
    const dataUrl = canvasRef.current?.toDataURL('image/png');
    if (dataUrl) onChange(dataUrl);
  };

  const handleClear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasContent(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-md border border-border bg-white"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none', display: 'block' }}
          className="cursor-crosshair"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{hasContent ? 'Unterschrift erfasst' : 'Mit Finger oder Maus unterschreiben'}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled || !hasContent}
        >
          <Eraser className="h-4 w-4" />
          Löschen
        </Button>
      </div>
    </div>
  );
}
