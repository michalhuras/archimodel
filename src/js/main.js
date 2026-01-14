import { checkAuth, logout } from './auth.js';
import { loadApartments } from './apartments.js';
import { initRenders } from './renders.js';
import { loadVersion } from './version.js';

checkAuth();

window.logout = logout;

loadApartments();
initRenders();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadVersion);
} else {
  loadVersion();
}
