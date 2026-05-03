import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './lib/query-client';
import { registerServiceWorker } from './lib/register-sw';
import './index.css';

registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root-Element fehlt im DOM');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
