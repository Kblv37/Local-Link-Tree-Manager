const RU_LOWER = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const EN_LOWER = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`';
const RU_UPPER = 'ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЁ';
const EN_UPPER = 'QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>~';

const ruToEn = new Map();
const enToRu = new Map();

for (let i = 0; i < RU_LOWER.length; i++) {
    if (RU_LOWER[i] && EN_LOWER[i]) {
        ruToEn.set(RU_LOWER[i], EN_LOWER[i]);
        enToRu.set(EN_LOWER[i], RU_LOWER[i]);
    }
}
for (let i = 0; i < RU_UPPER.length; i++) {
    if (RU_UPPER[i] && EN_UPPER[i]) {
        ruToEn.set(RU_UPPER[i], EN_UPPER[i]);
        enToRu.set(EN_UPPER[i], RU_UPPER[i]);
    }
}

function convertLayout(str, map) {
    const chars = str.split('');
    for (let i = 0; i < chars.length; i++) {
        const mapped = map.get(chars[i]);
        if (mapped) chars[i] = mapped;
    }
    return chars.join('');
}

const _variantsCache = new Map();
const _CACHE_MAX = 32;

export function layoutVariants(query) {
    if (!query) return [query];
    const lower = query.toLowerCase();

    if (_variantsCache.has(lower)) return _variantsCache.get(lower);

    const set = new Set([lower]);
    set.add(convertLayout(lower, ruToEn));
    set.add(convertLayout(lower, enToRu));
    const result = [...set].filter(Boolean);

    if (_variantsCache.size >= _CACHE_MAX) {
        // Evict oldest entry
        _variantsCache.delete(_variantsCache.keys().next().value);
    }
    _variantsCache.set(lower, result);
    return result;
}

export function filterTreeWithLayout(list, query, filterTreeFn) {
    if (!query || !query.trim()) return list;
    const variants = layoutVariants(query);
    let best = [];
    for (const v of variants) {
        const r = filterTreeFn(list, v);
        if (r.length > best.length) best = r;
    }
    return best;
}