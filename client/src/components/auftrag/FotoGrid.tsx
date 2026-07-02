import { useRef, useState } from 'react';
import { Camera, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useDeleteFoto, useUploadFoto } from '@/hooks/useAuftragFotos';
import { cn } from '@/lib/utils';
import { FotoEditor } from './FotoEditor';

const MAX_FOTOS = 20;

interface FotoGridProps {
  auftragId: string;
  fotos: string[];
  disabled?: boolean;
}

export function FotoGrid({ auftragId, fotos, disabled }: FotoGridProps) {
  const upload = useUploadFoto();
  const remove = useDeleteFoto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editingFilename, setEditingFilename] = useState<string | null>(null);
  // Cache-Bust: nach Annotation hat das Bild den gleichen Pfad — der
  // Browser zeigt sonst die alte Version. Wir hängen ?v=<n> an.
  const [versions, setVersions] = useState<Record<string, number>>({});

  const fotoSrc = (filename: string): string => {
    const v = versions[filename];
    const base = `/api/auftraege/${encodeURIComponent(auftragId)}/fotos/${encodeURIComponent(filename)}`;
    return v ? `${base}?v=${v}` : base;
  };

  const isFull = fotos.length >= MAX_FOTOS;
  const isPending = upload.isPending || remove.isPending;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Mehrfach-Auswahl unterstützen — sequentiell, sonst überfordern wir den Server
    void uploadSequential(Array.from(files));
    e.target.value = '';
  };

  async function uploadSequential(files: File[]) {
    for (const file of files) {
      if (fotos.length + 1 > MAX_FOTOS) {
        toast.error(`Maximal ${MAX_FOTOS} Fotos pro Auftrag`);
        break;
      }
      try {
        await upload.mutateAsync({ auftragId, file });
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : 'Foto-Upload fehlgeschlagen',
        );
        break;
      }
    }
  }

  const handleRemove = async (filename: string) => {
    const ok = await confirmDialog({
      title: 'Foto löschen?',
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(
      { auftragId, filename },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen'),
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((filename, idx) => (
          <div
            key={filename}
            className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
          >
            <button
              type="button"
              onClick={() => setPreviewIndex(idx)}
              className="block h-full w-full"
              aria-label={`Foto ${idx + 1} öffnen`}
            >
              <img
                src={fotoSrc(filename)}
                alt={`Foto ${idx + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(filename)}
                disabled={isPending}
                className={cn(
                  'absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full',
                  'bg-black/60 text-white shadow-md transition-opacity',
                  'hover:bg-black/80 disabled:opacity-50',
                )}
                aria-label="Foto löschen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {!disabled && !isFull && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-md',
              'border-2 border-dashed border-border bg-muted/30 text-xs text-muted-foreground',
              'hover:border-primary hover:text-primary transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {upload.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Camera className="h-6 w-6" />
                <span>Foto</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <p className="text-xs text-muted-foreground">
        {fotos.length} / {MAX_FOTOS} Fotos
        {isFull && ' — Limit erreicht'}
      </p>

      {previewIndex !== null && fotos[previewIndex] && (
        <FotoPreview
          auftragId={auftragId}
          filenames={fotos}
          fotoSrc={fotoSrc}
          index={previewIndex}
          disabled={disabled}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
          onEdit={(filename) => {
            setPreviewIndex(null);
            setEditingFilename(filename);
          }}
        />
      )}

      {editingFilename && (
        <FotoEditor
          auftragId={auftragId}
          filename={editingFilename}
          version={versions[editingFilename]}
          onClose={() => setEditingFilename(null)}
          onSaved={() => {
            // Cache-Bust: alle img-Tags neu laden (auch im Editor selbst,
            // falls er gleich nochmal geöffnet wird)
            setVersions((v) => ({ ...v, [editingFilename]: (v[editingFilename] ?? 0) + 1 }));
            setEditingFilename(null);
          }}
        />
      )}
    </div>
  );
}

interface FotoPreviewProps {
  auftragId: string;
  filenames: string[];
  fotoSrc: (filename: string) => string;
  index: number;
  disabled?: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onEdit: (filename: string) => void;
}

function FotoPreview({
  auftragId: _auftragId,
  filenames,
  fotoSrc,
  index,
  disabled,
  onClose,
  onNavigate,
  onEdit,
}: FotoPreviewProps) {
  const filename = filenames[index];
  if (!filename) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Schließen"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={fotoSrc(filename)}
        alt={`Foto ${index + 1}`}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <div
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
        >
          ◀
        </Button>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">
          {index + 1} / {filenames.length}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === filenames.length - 1}
          onClick={() => onNavigate(index + 1)}
        >
          ▶
        </Button>
        {!disabled && (
          <Button type="button" size="sm" onClick={() => onEdit(filename)}>
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </Button>
        )}
      </div>
    </div>
  );
}
