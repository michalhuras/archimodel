# Konfiguracja Webpack

Projekt został skonfigurowany do używania webpack 5 jako bundlera modułów.

## Struktura projektu

```
archimodel/
├── src/                    # Pliki źródłowe
│   ├── js/                 # Moduły JavaScript
│   │   ├── main.js        # Entry point dla strony głównej
│   │   ├── login.js       # Entry point dla strony logowania
│   │   ├── auth.js        # Moduł autoryzacji
│   │   ├── apartments.js  # Moduł apartamentów
│   │   ├── renders.js     # Moduł renderów 3D
│   │   ├── utils.js       # Funkcje pomocnicze
│   │   └── version.js     # Moduł wersji
│   ├── index.html         # Szablon strony głównej
│   └── login.html         # Szablon strony logowania
├── dist/                   # Wygenerowane pliki (gitignored)
├── public/                 # Statyczne pliki (stara struktura)
├── webpack.config.js       # Konfiguracja webpack
└── package.json

```

## Dostępne komendy

### Development
```bash
npm run dev
```
Uruchamia webpack dev server na porcie 8080 z hot reload.

### Build
```bash
npm run build
```
Buduje projekt do folderu `dist/` w trybie produkcyjnym:
1. Generuje informacje o wersji (git hash + data)
2. Buduje bundle webpack z minifikacją

### Build pełny (z overlays)
```bash
npm run build:full
```
Wykonuje pełny build włącznie z precompute-layer-overlays.

### Webpack bezpośrednio
```bash
npm run webpack:dev      # Build development
npm run webpack:build    # Build production
npm run webpack:serve    # Dev server
```

## Konfiguracja webpack

### Entry points
- `main.js` - strona główna (index.html)
- `login.js` - strona logowania (login.html)

### Output
- Folder: `dist/`
- Pliki JS: `dist/js/[name].[contenthash].js`
- HTML: automatycznie generowane z szablonów w `src/`

### Funkcje
- **Code splitting** - automatyczne dzielenie kodu na chunki
- **Tree shaking** - usuwanie nieużywanego kodu
- **Minifikacja** - w trybie production
- **Source maps** - w trybie development
- **Hot Module Replacement** - w dev server
- **Cache busting** - przez contenthash w nazwach plików

### Kopiowane pliki
- `public/favicon.ico` → `dist/favicon.ico`
- `netlify/functions/` → `dist/../netlify/functions/`

## Deployment (Netlify)

Netlify automatycznie uruchomi `npm run build` i opublikuje folder `dist/`.

Konfiguracja w `netlify.toml`:
```toml
[build]
  publish = "dist"
  functions = "netlify/functions"
  command = "npm run build"
```

## Migracja z public/ do src/

Pliki zostały przeniesione z `public/` do `src/` i przekonwertowane na moduły ES6:
- Używają `import`/`export` zamiast globalnych zmiennych
- Webpack automatycznie bundluje wszystkie zależności
- Lepsza organizacja kodu i tree shaking

## Wersjonowanie

Numer wersji (git hash + data) jest automatycznie generowany podczas buildu i wyświetlany w stopce strony.
