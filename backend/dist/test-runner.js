import assert from 'node:assert/strict';
import { checkToolVersion, loadConfig } from './config/paths.js';
async function diagnose() {
    const config = loadConfig();
    const tools = await Promise.all([checkToolVersion(config.ytdlpPath), checkToolVersion(config.ffmpegPath, '-version')]);
    for (const tool of tools) {
        console.log(`${tool.path}: ${tool.available ? 'disponível' : 'indisponível'} (${tool.source}, ${tool.integrity})`);
        assert.ok(tool.available, 'Uma ferramenta necessária não está disponível');
    }
}
void diagnose().catch(error => { console.error(error.message); process.exitCode = 1; });
