import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/**
 * Platzhalter für Listen-Seiten (Aufträge, Kunden, Wartung, …) — sieht aus
 * wie die echten Zeilen und verhindert das "Lädt …"-Text-Geflacker.
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8 w-8 shrink-0" />
        </li>
      ))}
    </ul>
  );
}
