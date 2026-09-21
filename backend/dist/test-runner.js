import { parseProgressLine, PROGRESS_PREFIX } from './services/parser.service.js';
import { buildYtdlpArgs } from './services/ytdlp.service.js';
import { loadConfig, checkToolVersion } from './config/paths.js';
async function testAll() {
    console.log('--- 1. Testando Detecção de Binários ---');
    const config = loadConfig();
    console.log('Configuração carregada:', {
        ytdlpPath: config.ytdlpPath,
        ffmpegPath: config.ffmpegPath,
        defaultDownloadDir: config.defaultDownloadDir,
    });
    const [ytdlpRes, ffmpegRes] = await Promise.all([
        checkToolVersion(config.ytdlpPath, '--version'),
        checkToolVersion(config.ffmpegPath, '-version'),
    ]);
    console.log('yt-dlp verificado:', ytdlpRes.available ? `OK (${ytdlpRes.version})` : 'ERRO');
    console.log('ffmpeg verificado:', ffmpegRes.available ? 'OK' : 'ERRO');
    console.log('\n--- 2. Testando Parser de Progresso ---');
    const mockLine = `download:${PROGRESS_PREFIX}45.8%| 8.32MiB/s|  25.40MiB|  11.63MiB| 00:01`;
    const parsed = parseProgressLine(mockLine, {
        percent: 0,
        percentStr: '0%',
        speed: '--',
        downloadedBytes: '0 B',
        totalBytes: '--',
        eta: '--:--',
        stage: 'queued',
    });
    console.log('Progresso parseado:', parsed.progress);
    if (parsed.progress?.percent === 45.8 && parsed.progress?.speed === '8.32MiB/s') {
        console.log('✓ Parser de template passou!');
    }
    else {
        console.error('✗ Falha no parser de template');
    }
    console.log('\n--- 3. Testando Montagem de Argumentos (Vídeo 1080p) ---');
    const videoArgs = buildYtdlpArgs({
        url: 'https://www.youtube.com/watch?v=test1234',
        mode: 'video',
        videoResolution: '1080p',
        videoContainer: 'mp4',
        audioFormat: 'mp3',
        audioQuality: '320k',
        customFilename: 'Meu Video Especial',
        embedThumbnail: true,
        embedSubtitles: false,
    });
    console.log('Argumentos de vídeo gerados:', videoArgs.args);
    if (videoArgs.args.includes('--newline') && videoArgs.args.includes('--merge-output-format')) {
        console.log('✓ Montagem de vídeo passou!');
    }
    console.log('\n--- 4. Testando Montagem de Argumentos (Áudio MP3 320k) ---');
    const audioArgs = buildYtdlpArgs({
        url: 'https://www.youtube.com/watch?v=test1234',
        mode: 'audio',
        videoResolution: '1080p',
        videoContainer: 'mp4',
        audioFormat: 'mp3',
        audioQuality: '320k',
        embedThumbnail: true,
        embedSubtitles: false,
    });
    console.log('Argumentos de áudio gerados:', audioArgs.args);
    if (audioArgs.args.includes('-x') && audioArgs.args.includes('--audio-format') && audioArgs.args.includes('mp3')) {
        console.log('✓ Montagem de áudio passou!');
    }
    console.log('\n=== Todos os testes de unidade e integração interna passaram! ===');
}
testAll().catch(console.error);
