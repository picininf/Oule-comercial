/** Confere a sintaxe de todos os arquivos do backend (npm run check). */
import { readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const pastas = ['.', 'config', 'middleware', 'routes', 'services', 'utils', 'validators', 'scripts'];
let erros = 0;
for (const pasta of pastas) {
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.js'))) {
    const caminho = path.join(pasta, arquivo);
    try {
      execFileSync(process.execPath, ['--check', caminho], { stdio: 'pipe' });
    } catch (err) {
      erros += 1;
      console.error(`❌ ${caminho}\n${err.stderr?.toString()}`);
    }
  }
}
console.log(erros === 0 ? '✅ Sintaxe OK em todos os arquivos.' : `❌ ${erros} arquivo(s) com erro.`);
process.exit(erros === 0 ? 0 : 1);
