import './ui/style.css';
import { App } from './ui/app';

new App(document.getElementById('app')!).start();

if (!__SINGLE_FILE__ && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
