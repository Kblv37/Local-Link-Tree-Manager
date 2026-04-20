const RU = 'йцукенгшщзхъфывапролджэячсмитьбю';
const EN = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.';
const RU_UP = 'ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ';
const EN_UP = 'QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>';

const ruToEn = new Map();
const enToRu = new Map();

for (let i = 0; i < RU.length; i++) {
    ruToEn.set(RU[i], EN[i]);
    enToRu.set(EN[i], RU[i]);
}
for (let i = 0; i < RU_UP.length; i++) {
    ruToEn.set(RU_UP[i], EN_UP[i]);
    enToRu.set(EN_UP[i], RU_UP[i]);
}

function convertLayout(str, map) {
    return str.split('').map(c => map.get(c) ?? c).join('');
}

export function layoutVariants(query) {
    if (!query) return [query];
    const variants = new Set([query]);
    variants.add(convertLayout(query, ruToEn));
    variants.add(convertLayout(query, enToRu));
    return [...variants].filter(Boolean);
}

export function filterTreeWithLayout(list, query, filterTreeFn, cloneFn) {
    if (!query || !query.trim()) return cloneFn(list);
    const variants = layoutVariants(query.toLowerCase());
    for (const v of variants) {
        const result = filterTreeFn(list, v);
        if (result.length > 0) return result;
    }
    return [];
}