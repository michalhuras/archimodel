import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  const gitDate = execSync('git log -1 --format=%cd --date=format:"%Y-%m-%d %H:%M"', { encoding: 'utf-8' }).trim();
  
  const versionInfo = {
    hash: gitHash,
    date: gitDate,
    fullVersion: `${gitHash} (${gitDate})`
  };

  const outputPath = join(__dirname, '..', 'public', 'version.json');
  writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));
  
  console.log(`Version info generated: ${versionInfo.fullVersion}`);
} catch (error) {
  console.error('Error generating version info:', error.message);
  
  const fallbackVersion = {
    hash: 'dev',
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    fullVersion: 'dev (local)'
  };
  
  const outputPath = join(__dirname, '..', 'public', 'version.json');
  writeFileSync(outputPath, JSON.stringify(fallbackVersion, null, 2));
}
