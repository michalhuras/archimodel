import { loadApartments } from './apartments.js';
import { initRenders } from './renders.js';
import { loadVersion } from './version.js';
import { initI18n } from './i18n.js';

await initI18n();

loadApartments();
initRenders();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadVersion);
} else {
  loadVersion();
}
