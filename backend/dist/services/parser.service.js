export const PROGRESS_PREFIX = '__PROGRESS__';
export function parseProgressLine(line, current) {
    const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
    // 1. Template estruturado personalizado do yt-dlp
    if (cleanLine.includes(PROGRESS_PREFIX)) {
        const dataPart = cleanLine.substring(cleanLine.indexOf(PROGRESS_PREFIX) + PROGRESS_PREFIX.length);
        const parts = dataPart.split('|');
        if (parts.length >= 5) {
            const percentStr = parts[0]?.trim() || current.percentStr || '0%';
            const rawPercent = parseFloat(percentStr.replace('%', ''));
            const percent = Number.isNaN(rawPercent) ? current.percent : rawPercent;
            const speed = parts[1]?.trim() || current.speed || '0 B/s';
            const totalBytes = parts[2]?.trim() || current.totalBytes || 'Desconhecido';
            const downloadedBytes = parts[3]?.trim() || current.downloadedBytes || '0 B';
            const eta = parts[4]?.trim() || current.eta || '--:--';
            return {
                progress: {
                    percent,
                    percentStr,
                    speed,
                    totalBytes,
                    downloadedBytes,
                    eta,
                    stage: current.stage || 'downloading',
                },
            };
        }
    }
    // 2. Parser de fallback caso caia no formato nativo [download] 45.2% of 12.0MiB at 2.1MiB/s ETA 00:03
    const nativeMatch = cleanLine.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([0-9\.]+\w+)\s+at\s+([0-9\.]+\w+\/s)\s+ETA\s+([0-9:]+)/i);
    if (nativeMatch) {
        const percent = parseFloat(nativeMatch[1]);
        return {
            progress: {
                percent,
                percentStr: `${percent}%`,
                totalBytes: nativeMatch[2],
                downloadedBytes: current.downloadedBytes,
                speed: nativeMatch[3],
                eta: nativeMatch[4],
                stage: 'downloading',
            },
        };
    }
    // 3. Detecção de etapas (stages)
    if (cleanLine.includes('[Merger]') || cleanLine.includes('Merging formats')) {
        return { stage: 'merging' };
    }
    if (cleanLine.includes('[ExtractAudio]') || cleanLine.includes('Destination:') && cleanLine.endsWith('.mp3')) {
        return { stage: 'extracting_audio' };
    }
    if (cleanLine.includes('[ffmpeg]') || cleanLine.includes('[Fixup')) {
        return { stage: 'processing' };
    }
    if (cleanLine.includes('[download] 100%') || cleanLine.includes('100% of')) {
        return { stage: 'processing' };
    }
    return {};
}
