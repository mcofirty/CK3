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
  const root = document.documentElement;
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches;
  const portrait = window.innerHeight >= window.innerWidth;
  const screenH = portrait
    ? Math.max(screen.width, screen.height)
    : Math.min(screen.width, screen.height);
  const raw = standalone ? screenH - window.innerHeight : 0;
  const gap = raw > 0 && raw <= 100 ? raw : 0;
  root.style.setProperty('--vh-gap', `${gap}px`);
  // Un élément fixe ancré en bas : s'arrête-t-il déjà au bas réel de l'écran ?
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:1px;pointer-events:none;visibility:hidden';
  (document.getElementById('root') ?? document.body).appendChild(probe);
  const bottom = probe.getBoundingClientRect().bottom;
  probe.remove();
  const missing = gap > 0 ? Math.round(screenH - bottom) : 0;
  root.style.setProperty('--fixed-gap', `${missing > 0 && missing <= 100 ? missing : 0}px`);
}
fixViewport();
requestAnimationFrame(fixViewport);
window.addEventListener('load', fixViewport);
window.addEventListener('resize', fixViewport);
window.addEventListener('orientationchange', () => setTimeout(fixViewport, 300));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
