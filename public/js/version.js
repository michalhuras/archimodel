async function loadVersion() {
  try {
    const response = await fetch('/version.json');
    const versionInfo = await response.json();
    
    const versionElements = document.querySelectorAll('.app-version');
    versionElements.forEach(el => {
      el.textContent = versionInfo.fullVersion;
    });
  } catch (error) {
    console.error('Failed to load version info:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadVersion);
} else {
  loadVersion();
}
