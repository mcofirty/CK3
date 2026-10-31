import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './ui/styles.css';

registerSW({ immediate: true });

/**
 * En mode « écran d'accueil », iOS annonce parfois une fenêtre plus courte que l'écran
 * (la hauteur de la barre d'état est retranchée) : l'app s'arrêtait avant le bas de l'écran.
 * On mesure cet écart et on le passe au CSS.
 */
function fixViewport(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches;
  const portrait = window.innerHeight >= window.innerWidth;
  const screenH = portrait
    ? Math.max(screen.width, screen.height)
    : Math.min(screen.width, screen.height);
  const gap = standalone ? screenH - window.innerHeight : 0;
  document.documentElement.style.setProperty('--vh-gap', `${gap > 0 && gap <= 100 ? gap : 0}px`);
}
fixViewport();
window.addEventListener('resize', fixViewport);
window.addEventListener('orientationchange', () => setTimeout(fixViewport, 300));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
