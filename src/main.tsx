import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './ui/styles.css';

registerSW({ immediate: true });

/**
 * Lancée depuis l'écran d'accueil, l'app occupe toujours tout l'écran ; or iOS annonce parfois
 * une fenêtre plus courte (sans la barre d'état), et cela varie au démarrage. On donne donc à
 * l'app la hauteur réelle de l'écran (--app-h). Dans Safari, l'app suit simplement la fenêtre.
 */
function fitScreen(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches;
  const root = document.documentElement;
  const portrait = window.innerHeight >= window.innerWidth;
  const screenH = portrait
    ? Math.max(screen.width, screen.height)
    : Math.min(screen.width, screen.height);
  const diff = screenH - window.innerHeight;
  // Petit écart seulement (barre d'état) : au-delà, fenêtre partagée (iPad), on suit la fenêtre.
  if (standalone && diff >= 0 && diff <= 120) root.style.setProperty('--app-h', `${screenH}px`);
  else root.style.removeProperty('--app-h');
}
fitScreen();
window.addEventListener('resize', fitScreen);
window.addEventListener('orientationchange', () => setTimeout(fitScreen, 300));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') fitScreen();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
