import { initApp } from './app.js';

// Registra service worker (GitHub Pages é HTTPS)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      // console.log('SW registrado');
    } catch (e) {
      console.warn('Falha ao registrar SW', e);
    }
  });
}

initApp();
