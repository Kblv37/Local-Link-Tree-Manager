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
    const result = {
        id:          typeof l.id          === 'string' && l.id    ? l.id    : uid(),
        title:       typeof l.title       === 'string' ? l.title       : '',
        url:         typeof l.url         === 'string' ? l.url         : '',
        description: typeof l.description === 'string' ? l.description : ''
    };
    if (Array.isArray(l.children)) {
        result.children = l.children.map(normalizeLink).filter(Boolean);
    }
    return result;
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
    if (!query || !query.trim()) return safeArray(list);
    const needle = query.toLowerCase().trim();

    function linkMatches(l) {
        if (!l) return false;
        const text = (l.title || '') + ' ' + (l.url || '') + ' ' + (l.description || '');
        return text.toLowerCase().includes(needle);
    }

    function filterNode(node) {
        if (!node) return null;

        if (node.__isRoot) {
            const links = safeArray(node.links).filter(linkMatches);
            return links.length ? { ...node, links, children: [] } : null;
        }

        const titleMatch = (node.title || '').toLowerCase().includes(needle);
        const matchedLinks = safeArray(node.links).filter(linkMatches);
        const matchedChildren = safeArray(node.children).map(filterNode).filter(Boolean);

        if (matchedLinks.length || matchedChildren.length) {
            return { ...node, links: matchedLinks, children: matchedChildren };
        }

        if (titleMatch && (safeArray(node.links).length || safeArray(node.children).length)) {
            return { ...node, links: safeArray(node.links), children: safeArray(node.children) };
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
        const links = n.links;
        if (links) {
            for (let j = 0; j < links.length; j++) {
                if (links[j]?.id === linkId) return { parentNode: n, index: j };
            }
        }
        if (n.children) {
            const res = findLinkParent(n.children, linkId);
            if (res) return res;
        }
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
    const links = node.links;
    if (!links) return 0;
    let count = 0;
    for (let i = 0; i < links.length; i++) {
        const l = links[i];
        if (l && (l.url || l.title)) count++;
    }
    return count;
}

export function nodeMatchesQuery(node, query) {
    if (!node) return false;
    const q = query.toLowerCase();
    if ((node.title || '').toLowerCase().includes(q)) return true;
    if (safeArray(node.links).some(l => ((l?.title || '') + ' ' + (l?.url || '') + ' ' + (l?.description || '')).toLowerCase().includes(q))) return true;
    return safeArray(node.children).some(c => nodeMatchesQuery(c, q));
}

export function findNode(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!n) continue;
        if (n.id === id) return n;
        if (n.children) {
            const found = findNode(n.children, id);
            if (found) return found;
        }
    }
    return null;
}

export function filterTreeDeep(list, query) {
    if (!query || !query.trim()) return safeArray(list);
    const needle = query.toLowerCase().trim();

    function linkMatches(link) {
        if (!link) return false;
        const text = (link.title || '') + (link.url || '') + (link.description || '');
        return text.toLowerCase().includes(needle);
    }

    function collectMatchingLinks(links) {
        const result = [];
        for (const link of safeArray(links)) {
            if (!link) continue;
            if (linkMatches(link)) {
                result.push(link);
            } else if (safeArray(link.children).length > 0) {
                const deepMatches = collectMatchingLinks(link.children);
                if (deepMatches.length > 0) {
                    result.push({ ...link, children: deepMatches });
                }
            }
        }
        return result;
    }

    function filterNodeDeep(node) {
        if (!node) return null;
        const matchedLinks = collectMatchingLinks(safeArray(node.links));
        const matchedChildren = safeArray(node.children).map(filterNodeDeep).filter(Boolean);
        return (matchedLinks.length > 0 || matchedChildren.length > 0)
            ? { ...node, links: matchedLinks, children: matchedChildren }
            : null;
    }

    return safeArray(list).map(filterNodeDeep).filter(Boolean);
}

export function findLinkDeep(tree, linkId) {
    function searchLinks(links) {
        for (const link of safeArray(links)) {
            if (!link) continue;
            if (link.id === linkId) return link;
            const found = searchLinks(link.children);
            if (found) return found;
        }
        return null;
    }

    for (const node of safeArray(tree)) {
        if (!node) continue;
        const found = searchLinks(node.links);
        if (found) return found;
        const inChildren = findLinkDeep(node.children, linkId);
        if (inChildren) return inChildren;
    }
    return null;
}