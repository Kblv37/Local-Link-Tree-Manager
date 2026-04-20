const FAVICON_CACHE_KEY = 'faviconCache';
const memCache = new Map();
let _showFavicons = true;
let _persistTimer = null;

export function configureFavicons(settings) {
    _showFavicons = settings.showFavicons !== false;
}

export function loadFaviconCache() {
    try {
        chrome.storage.local.get([FAVICON_CACHE_KEY], (raw) => {
            if (chrome.runtime.lastError) return;
            const saved = raw?.[FAVICON_CACHE_KEY];
            if (saved && typeof saved === 'object') {
                for (const [k, v] of Object.entries(saved)) {
                    if (typeof k === 'string' && typeof v === 'string') memCache.set(k, v);
                }
            }
        });
    } catch {}
}

function _schedulePersist() {
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
        try {
            const obj = Object.fromEntries(memCache);
            chrome.storage.local.set({ [FAVICON_CACHE_KEY]: obj });
        } catch {}
    }, 2000);
}

export function getFaviconUrl(url) {
    if (!_showFavicons) return '';
    if (!url) return '';
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return ''; }
    if (!hostname) return '';
    if (memCache.has(hostname)) return memCache.get(hostname);
    const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    memCache.set(hostname, faviconUrl);
    _schedulePersist();
    return faviconUrl;
}

export function prewarmFavicons(tree) {
    if (!Array.isArray(tree)) return;
    for (const node of tree) {
        if (!node) continue;
        if (Array.isArray(node.links)) for (const link of node.links) if (link?.url) getFaviconUrl(link.url);
        if (Array.isArray(node.children)) prewarmFavicons(node.children);
    }
}

export function clearFaviconCache() {
    memCache.clear();
    try { chrome.storage.local.remove(FAVICON_CACHE_KEY); } catch {}
}