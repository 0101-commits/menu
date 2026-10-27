import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { listenForInstallPrompt } from './lib/install';
import { importCarried } from './lib/visits';
import './index.css';

listenForInstallPrompt();
importCarried();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
