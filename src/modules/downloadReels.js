import { URL } from 'url';
import download from 'primesave-dl';

const MEDIA_PATTERNS = [
    'youtube.com/watch?v=',
    'youtu.be/',
    'tiktok.com/@',
    'vm.tiktok.com',
    'instagram.com/reel/',
    'instagram.com/p/',
    'instagram.com/tv/',
    'facebook.com/watch',
    'facebook.com/share',
    'fb.watch',
    'facebook.com/videos',
    'pinterest.com/pin/'
];

const MEDIA_COMMANDS = ['/download', '/reel', '/media', '/save'];

function isSupportedMediaUrl(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const normalized = text.trim();
    return MEDIA_PATTERNS.some(pattern => normalized.includes(pattern));
}

function isMediaCommand(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const trimmed = text.trim();
    return MEDIA_COMMANDS.some(command => trimmed.toLowerCase().startsWith(command));
}

export function shouldTriggerMediaDownload(text) {
    return isSupportedMediaUrl(text) || isMediaCommand(text);
}

export function extractMediaUrl(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const trimmed = text.trim();

    for (const command of MEDIA_COMMANDS) {
        if (trimmed.toLowerCase().startsWith(command)) {
            const afterCommand = trimmed.slice(command.length).trim();
            if (afterCommand) {
                return afterCommand;
            }
            return null;
        }
    }

    try {
        const url = new URL(trimmed);
        if (MEDIA_PATTERNS.some(pattern => url.href.includes(pattern))) {
            return url.href;
        }
    } catch {
        // ignore malformed URLs
    }

    return null;
}

export async function downloadMediaFromText(text) {
    const url = extractMediaUrl(text);
    if (!url) {
        return null;
    }

    const result = await download(url);

    const options = Array.isArray(result?.options)
        ? result.options
        : [];

    if (!options.length) {
        throw new Error('No downloadable media found for this URL.');
    }

    const first = options[0] || {};
    const mediaUrl = first.url || first.link || '';
    const caption = result?.platform
        ? `📥 Downloaded from ${result.platform}`
        : '📥 Here is your media download';

    return {
        url: mediaUrl,
        caption,
        platform: result?.platform || 'unknown'
    };
}