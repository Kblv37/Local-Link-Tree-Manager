export function uid() {
    return crypto?.randomUUID?.() ?? ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
}

export function safeArray(v) {
    return Array.isArray(v) ? v : [];
}

export function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

export function normalizeLink(l) {
    if (!l) return null;
    return {
        id:          typeof l.id          === 'string' && l.id    ? l.id    : uid(),
        title:       typeof l.title       === 'string' ? l.title       : '',
        url:         typeof l.url         === 'string' ? l.url         : '',
        description: typeof l.description === 'string' ? l.description : ''
    };
}

export function normalizeNode(node) {
    if (!node || node.type !== 'folder') return null;
    const result = {
        id:       typeof node.id    === 'string' && node.id    ? node.id    : uid(),
        type:     'folder',
        title:    typeof node.title === 'string' ? node.title : '',
        children: safeArray(node.children).map(normalizeNode).filter(Boolean),
        links:    safeArray(node.links).map(normalizeLink).filter(Boolean)
    };
    if (node.__isRoot) result.__isRoot = true;
    return result;
}

export function normalizeTree(data) {
    return safeArray(data).map(normalizeNode).filter(Boolean);
}

export function filterTree(list, query) {
    if (!query || !query.trim()) return clone(safeArray(list));
    const needle = query.toLowerCase();

    function filterNode(node) {
        if (!node) return null;

        if (node.__isRoot) {
            const filteredLinks = safeArray(node.links)
                .filter(l => ((l?.title || '') + ' ' + (l?.url || '') + ' ' + (l?.description || '')).toLowerCase().includes(needle))
                .map(l => ({ ...l }));
            if (filteredLinks.length > 0) return { ...node, links: filteredLinks, children: [] };
            return null;
        }

        const titleMatch = (node.title || '').toLowerCase().includes(needle);

        const filteredLinks = safeArray(node.links)
            .filter(l => ((l?.title || '') + ' ' + (l?.url || '') + ' ' + (l?.description || '')).toLowerCase().includes(needle))
            .map(l => ({ ...l }));

        const filteredChildren = safeArray(node.children).map(filterNode).filter(Boolean);

        if (filteredLinks.length > 0 || filteredChildren.length > 0) {
            return { ...node, links: filteredLinks, children: filteredChildren };
        }

        if (titleMatch && safeArray(node.links).length > 0) {
            return { ...node, links: safeArray(node.links).map(l => ({ ...l })), children: [] };
        }

        if (titleMatch && safeArray(node.children).length > 0) {
            const allChildren = safeArray(node.children).map(c => c ? { ...c } : null).filter(Boolean);
            return { ...node, links: [], children: allChildren };
        }

        return null;
    }

    return safeArray(list).map(filterNode).filter(Boolean);
}

export function findParentAndIndex(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i]; if (!n) continue;
        if (n.id === id) return { parentArray: list, index: i };
        const res = findParentAndIndex(n.children, id);
        if (res) return res;
    }
    return null;
}

export function findLinkParent(list, linkId) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i]; if (!n) continue;
        const idx = safeArray(n.links).findIndex(l => l?.id === linkId);
        if (idx !== -1) return { parentNode: n, index: idx };
        const res = findLinkParent(n.children, linkId);
        if (res) return res;
    }
    return null;
}

export function swap(arr, i, j) {
    if (!Array.isArray(arr) || i < 0 || j < 0 || i >= arr.length || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function moveFolder(tree, id, dir) {
    const loc = findParentAndIndex(tree, id); if (!loc) return false;
    const ni = loc.index + dir;
    if (ni < 0 || ni >= loc.parentArray.length) return false;
    swap(loc.parentArray, loc.index, ni); return true;
}

export function moveLink(tree, id, dir) {
    const loc = findLinkParent(tree, id); if (!loc) return false;
    const ni = loc.index + dir;
    if (ni < 0 || ni >= loc.parentNode.links.length) return false;
    swap(loc.parentNode.links, loc.index, ni); return true;
}

export function removeEmptyFolders(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(n => {
        if (!n) return false;
        n.children = removeEmptyFolders(n.children);
        return n.children.length > 0 || safeArray(n.links).length > 0;
    });
}

export function countLinks(node) {
    if (!node) return 0;
    return safeArray(node.links).filter(l => l?.url || l?.title).length;
}

export function nodeMatchesQuery(node, query) {
    if (!node) return false;
    const q = query.toLowerCase();
    if ((node.title || '').toLowerCase().includes(q)) return true;
    if (safeArray(node.links).some(l => ((l?.title || '') + ' ' + (l?.url || '') + ' ' + (l?.description || '')).toLowerCase().includes(q))) return true;
    return safeArray(node.children).some(c => nodeMatchesQuery(c, q));
}

export function findNode(list, id) {
    for (const n of safeArray(list)) {
        if (!n) continue;
        if (n.id === id) return n;
        const found = findNode(n.children, id);
        if (found) return found;
    }
    return null;
}