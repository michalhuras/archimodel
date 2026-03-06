import { loadApartments } from './apartments.js';
import { initRenders } from './renders.js';
import { loadVersion } from './version.js';

loadApartments();
initRenders();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadVersion);
} else {
  loadVersion();
}
