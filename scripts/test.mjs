import fs from 'node:fs';
import { spawn } from 'node:child_process';
const files = ['backend/test', 'frontend/test', 'scripts/test'].flatMap(directory =>
  fs.readdirSync(directory).filter(name => /\.test\.(?:ts|mjs)$/.test(name)).sort().map(name => `${directory}/${name}`));
if (!files.length) throw new Error('Nenhum teste de regressão encontrado');
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], { shell: false, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
