// Registriert den Service-Worker (vite-plugin-pwa) und zeigt einen Toast,
// wenn eine neue App-Version verfügbar ist.
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

  const updateSW = registerSW({
    onNeedRefresh() {
      toast.info('Neue Version verfügbar', {
        description: 'Tippen, um zu aktualisieren',
        action: {
          label: 'Aktualisieren',
          onClick: () => updateSW(true),
        },
        duration: Infinity,
      });
    },
    onOfflineReady() {
      // Stille — wir wollen keinen Spam-Toast bei jedem Tab-Open
    },
  });
}
