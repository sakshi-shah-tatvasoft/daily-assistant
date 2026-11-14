import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
// Gujarati letters (Poppins already covers English and Hindi/Devanagari). Only downloaded when Gujarati text is shown.
import '@fontsource/noto-sans-gujarati/gujarati-400.css'
import '@fontsource/noto-sans-gujarati/gujarati-500.css'
import '@fontsource/noto-sans-gujarati/gujarati-600.css'
import '@fontsource/noto-sans-gujarati/gujarati-700.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { installErrorReporting } from './lib/errorReport'

installErrorReporting();

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;   // false on very first visit
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  const checkForUpdate = () => navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  window.setInterval(checkForUpdate, 30 * 60_000);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
