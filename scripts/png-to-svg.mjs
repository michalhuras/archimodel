/**
 * PNG to SVG converter
 * 
 * Metoda 1: Wektoryzacja (tracing) - dla prostych logo, ikon
 * Metoda 2: Osadzenie PNG w SVG - zachowuje oryginalną jakość
 * 
 * Użycie:
 *   node scripts/png-to-svg.mjs input.png output.svg [--embed]
 * 
 * Opcje:
 *   --embed  Osadza PNG jako base64 w SVG (bez wektoryzacji)
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { basename, extname } from 'path';

const args = process.argv.slice(2);
const embedMode = args.includes('--embed');
const files = args.filter(a => !a.startsWith('--'));

const inputFile = files[0];
const outputFile = files[1] || inputFile?.replace(/\.png$/i, '.svg');

if (!inputFile) {
  console.log(`
PNG to SVG Converter

Użycie:
  node scripts/png-to-svg.mjs <input.png> [output.svg] [opcje]

Opcje:
  --embed    Osadza PNG jako base64 w SVG (zachowuje jakość rastrową)
             Bez tej flagi próbuje wektoryzacji przez potrace

Przykłady:
  node scripts/png-to-svg.mjs logo.png
  node scripts/png-to-svg.mjs logo.png logo.svg --embed

Wymagania dla wektoryzacji:
  - ImageMagick (convert)
  - potrace
  
Instalacja (Windows - chocolatey):
  choco install imagemagick potrace

Instalacja (macOS - homebrew):
  brew install imagemagick potrace
`);
  process.exit(1);
}

console.log(`Input:  ${inputFile}`);
console.log(`Output: ${outputFile}`);
console.log(`Mode:   ${embedMode ? 'Embed (base64)' : 'Vectorize (potrace)'}`);
console.log('');

if (embedMode) {
  // Metoda 2: Osadzenie PNG w SVG
  try {
    const pngData = readFileSync(inputFile);
    const base64 = pngData.toString('base64');
    
    // Próba odczytania wymiarów z PNG header
    let width = 200;
    let height = 200;
    
    // PNG header: width at bytes 16-19, height at bytes 20-23 (big-endian)
    if (pngData.length > 24 && pngData.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      width = pngData.readUInt32BE(16);
      height = pngData.readUInt32BE(20);
    }
    
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" 
         xlink:href="data:image/png;base64,${base64}"/>
</svg>`;
    
    writeFileSync(outputFile, svg);
    console.log(`✓ SVG utworzony (embedded PNG, ${width}x${height})`);
    console.log(`  Rozmiar: ${(svg.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('Błąd:', err.message);
    process.exit(1);
  }
} else {
  // Metoda 1: Wektoryzacja przez potrace
  try {
    // Sprawdź czy potrace jest dostępny
    try {
      execSync('potrace --version', { stdio: 'pipe' });
    } catch {
      console.error('Błąd: potrace nie jest zainstalowany.');
      console.error('');
      console.error('Instalacja:');
      console.error('  Windows (chocolatey): choco install potrace');
      console.error('  macOS (homebrew):     brew install potrace');
      console.error('  Ubuntu/Debian:        sudo apt install potrace');
      console.error('');
      console.error('Alternatywnie użyj trybu --embed:');
      console.error(`  node scripts/png-to-svg.mjs ${inputFile} --embed`);
      process.exit(1);
    }
    
    // Sprawdź czy ImageMagick jest dostępny
    let convertCmd = 'convert';
    try {
      execSync('convert --version', { stdio: 'pipe' });
    } catch {
      try {
        execSync('magick --version', { stdio: 'pipe' });
        convertCmd = 'magick';
      } catch {
        console.error('Błąd: ImageMagick nie jest zainstalowany.');
        console.error('');
        console.error('Instalacja:');
        console.error('  Windows (chocolatey): choco install imagemagick');
        console.error('  macOS (homebrew):     brew install imagemagick');
        console.error('  Ubuntu/Debian:        sudo apt install imagemagick');
        process.exit(1);
      }
    }
    
    // Konwertuj PNG do PBM (wymagane przez potrace)
    const tempPbm = inputFile.replace(/\.png$/i, '.pbm');
    console.log('Konwersja PNG → PBM...');
    execSync(`${convertCmd} "${inputFile}" -flatten -threshold 50% "${tempPbm}"`, { stdio: 'inherit' });
    
    // Wektoryzuj PBM do SVG
    console.log('Wektoryzacja PBM → SVG...');
    execSync(`potrace "${tempPbm}" -s -o "${outputFile}"`, { stdio: 'inherit' });
    
    // Usuń tymczasowy plik PBM
    try {
      const fs = await import('fs');
      fs.unlinkSync(tempPbm);
    } catch {}
    
    console.log(`✓ SVG utworzony (wektoryzowany)`);
    
    const svgSize = readFileSync(outputFile).length;
    console.log(`  Rozmiar: ${(svgSize / 1024).toFixed(1)} KB`);
    
  } catch (err) {
    console.error('Błąd wektoryzacji:', err.message);
    console.error('');
    console.error('Spróbuj trybu embed:');
    console.error(`  node scripts/png-to-svg.mjs ${inputFile} --embed`);
    process.exit(1);
  }
}
