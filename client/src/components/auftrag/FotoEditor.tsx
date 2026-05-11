import { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useReplaceFoto } from '@/hooks/useAuftragFotos';
import { cn } from '@/lib/utils';

const COLORS = [
  { value: '#ef4444', label: 'Rot' },
  { value: '#22c55e', label: 'Grün' },
  { value: '#3b82f6', label: 'Blau' },
  { value: '#facc15', label: 'Gelb' },
  { value: '#ffffff', label: 'Weiß' },
] as const;

const STROKE_WIDTH = 6; // Pixel auf Canvas-Original-Auflösung

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  points: Point[];
}

interface FotoEditorProps {
  auftragId: string;
  filename: string;
  /** Optionaler Cache-Bust-Counter — verhindert, dass nach einer
   *  vorherigen Annotation der Browser/SW eine veraltete Version lädt. */
  version?: number;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Vollbild-Foto-Editor (SPEC 2.4):
 * - lädt das Foto auf ein HTML-Canvas
 * - Pinsel zum Zeichnen (5 Farben)
 * - Undo (entfernt letzten Strich, Canvas wird neu gerendert)
 * - Speichern: JPEG-Blob via PUT — Server überschreibt das Original
 */
export function FotoEditor({ auftragId, filename, version, onClose, onSaved }: FotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Bild in Original-Auflösung im Speicher — wird bei jedem Re-Render
  // wieder als Hintergrund auf den Canvas gemalt.
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [imageLoaded, setImageLoaded] = useState(false);
  const replace = useReplaceFoto();

  const baseUrl = `/api/auftraege/${encodeURIComponent(auftragId)}/fotos/${encodeURIComponent(filename)}`;
  const fotoUrl = version ? `${baseUrl}?v=${version}` : baseUrl;

  // Bild laden + Canvas auf Originalmaße bringen
  useEffect(() => {
    const img = new Image();
    // Foto kommt vom selben Origin (Cookie-Auth) — kein crossOrigin nötig.
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      setImageLoaded(true);
    };
    img.onerror = () => {
      toast.error('Foto konnte nicht geladen werden');
      onClose();
    };
    img.src = fotoUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bei Änderung der strokes: Canvas neu zeichnen (Bild + alle Striche)
  useEffect(() => {
    if (!imageLoaded) return;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, imageLoaded]);

  function redraw(extra?: Stroke) {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    for (const s of strokes) drawStroke(ctx, s);
    if (extra) drawStroke(ctx, extra);
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length === 0) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    ctx.moveTo(first!.x, first!.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  // Pointer-Position in Canvas-Koordinaten umrechnen (Canvas wird via
  // CSS skaliert, Originalauflösung kann größer sein)
  function getCanvasPos(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageLoaded || replace.isPending) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    currentStrokeRef.current = { color, points: [getCanvasPos(e)] };
    redraw(currentStrokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    currentStrokeRef.current.points.push(getCanvasPos(e));
    redraw(currentStrokeRef.current);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    // Auch ein Tap ohne Move (= Punkt) wird gespeichert — sonst irritiert,
    // dass ein Klick im aktuellen Farb-Modus nichts macht.
    setStrokes((s) => [...s, stroke]);
  };

  const handleUndo = () => {
    if (replace.isPending) return;
    setStrokes((s) => s.slice(0, -1));
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Konnte Bild nicht exportieren');
          return;
        }
        replace.mutate(
          { auftragId, filename, blob },
          {
            onSuccess: () => {
              toast.success('Bearbeitung gespeichert');
              onSaved();
            },
            onError: (err) =>
              toast.error(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen'),
          },
        );
      },
      'image/jpeg',
      0.9,
    );
  };

  const dirty = strokes.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top-Bar: Schließen + Undo + Speichern */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/80 p-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (dirty && !confirm('Änderungen verwerfen?')) return;
            onClose();
          }}
          disabled={replace.isPending}
          className="text-white hover:bg-white/10 hover:text-white"
          aria-label="Schließen"
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={!dirty || replace.isPending}
          className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
          Zurück
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || replace.isPending || !imageLoaded}
        >
          {replace.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>

      {/* Canvas-Bereich */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        {!imageLoaded && (
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        )}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
          className={cn(
            'max-h-full max-w-full cursor-crosshair object-contain',
            !imageLoaded && 'hidden',
          )}
        />
      </div>

      {/* Bottom-Bar: Farb-Auswahl */}
      <div className="border-t border-white/10 bg-black/80 p-3">
        <div className="mx-auto flex max-w-md items-center justify-around gap-2">
          {COLORS.map((c) => {
            const active = color === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                aria-label={c.label}
                title={c.label}
                className={cn(
                  'h-10 w-10 rounded-full border-2 transition-transform',
                  active
                    ? 'scale-110 border-white shadow-lg'
                    : 'border-white/30 hover:border-white/60',
                )}
                style={{ backgroundColor: c.value }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
