// popup.js
const STORAGE_KEY = 'linkTree';
const safeArray = v => Array.isArray(v) ? v : [];

/* Tracks which folder IDs are collapsed (persists during popup session) */
const collapsed = new Set();

/* Whether ALL folders are currently collapsed (for toggle button) */
let allCollapsed = false;

function getFavicon(url) {
    try {
        const u = new URL(url);
        return `https://www.google.com/s2/favicons?sz=32&domain=${u.hostname}`;
    } catch {
        return '';
    }
}

function openLink(url) {
    if (!url) return;
    try { chrome.tabs.create({ url }); }
    catch { window.open(url, '_blank'); }
}

/* ─────────────────── Render ─────────────────── */

function renderNode(node, container, query) {
    if (!node) return;

    const folder = document.createElement('div');
    folder.className = 'folder';

    /* ── Folder header row ── */
    const row = document.createElement('div');
    row.className = 'folder-row';

    const ficon = document.createElement('div');
    ficon.className = 'folder-icon';
    ficon.textContent = '📁';

    const toggle = document.createElement('button');
    toggle.className = 'fold-toggle';
    toggle.textContent = collapsed.has(node.id) ? '▶' : '▼';

    const name = document.createElement('div');
    name.className = 'fold-name';
    name.textContent = node.title || 'Без названия';

    /* Link count badge (direct links only) */
    const linkCount = safeArray(node.links).filter(l => l.url || l.title).length;
    if (linkCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'count-badge';
        badge.textContent = linkCount;
        name.appendChild(badge);
    }

    /* "Open all links" button (visible on hover via CSS) */
    const openAllBtn = document.createElement('button');
    openAllBtn.className = 'open-all-btn';
    openAllBtn.textContent = '⤴⤴';
    openAllBtn.title = 'Открыть все ссылки папки';
    openAllBtn.addEventListener('click', e => {
        e.stopPropagation();
        const links = safeArray(node.links).filter(l => l.url);
        if (links.length === 0) { alert('В папке нет ссылок с URL.'); return; }
        if (links.length > 6 && !confirm(`Открыть ${links.length} вкладок?`)) return;
        links.forEach(l => openLink(l.url));
    });

    /* Toggle collapse on row click */
    row.addEventListener('click', () => {
        if (collapsed.has(node.id)) collapsed.delete(node.id);
        else collapsed.add(node.id);
        renderTree(currentTree, currentQuery);
    });

    row.append(ficon, toggle, name, openAllBtn);
    folder.appendChild(row);

    /* ── Children wrapper ── */
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'links';
    if (collapsed.has(node.id)) childrenWrap.style.display = 'none';

    /* ── Links ── */
    safeArray(node.links).forEach(link => {
        if (!link || (!link.url && !link.title)) return;

        if (query) {
            const q = query.toLowerCase();
            if (!((link.title || '').toLowerCase().includes(q) || (link.url || '').toLowerCase().includes(q))) {
                return;
            }
        }

        const linkEl = document.createElement('div');
        linkEl.className = 'link';
        linkEl.tabIndex = -1; // focusable but not in tab order (we manage focus manually)
        linkEl.addEventListener('click', () => openLink(link.url));

        /* Favicon */
        const favUrl = getFavicon(link.url);
        if (favUrl) {
            const fav = document.createElement('img');
            fav.className = 'favicon';
            fav.src = favUrl;
            fav.alt = '';
            fav.addEventListener('error', () => fav.remove());
            linkEl.appendChild(fav);
        }

        /* Title + URL */
        const content = document.createElement('div');
        content.className = 'link-content';

        const titleEl = document.createElement('div');
        titleEl.className = 'link-title';
        titleEl.textContent = link.title || link.url || '—';

        const subEl = document.createElement('div');
        subEl.className = 'link-sub';
        subEl.textContent = link.url || '';

        content.append(titleEl, subEl);

        /* Action buttons */
        const actions = document.createElement('div');
        actions.className = 'link-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'small-btn';
        copyBtn.textContent = '⧉';
        copyBtn.title = 'Копировать URL';
        copyBtn.addEventListener('click', e => {
            e.stopPropagation();
            const text = link.url || '';
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            } else {
                fallbackCopy(text);
            }
        });

        const openBtn = document.createElement('button');
        openBtn.className = 'small-btn';
        openBtn.textContent = '⤴';
        openBtn.title = 'Открыть';
        openBtn.addEventListener('click', e => {
            e.stopPropagation();
            openLink(link.url);
        });

        actions.append(openBtn, copyBtn);
        linkEl.append(content, actions);
        childrenWrap.appendChild(linkEl);
    });

    /* ── Sub-folders (recursive) ── */
    safeArray(node.children).forEach(child => renderNode(child, childrenWrap, query));

    folder.appendChild(childrenWrap);
    container.appendChild(folder);
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
}

/* ─────────────────── Tree state ─────────────────── */

let currentTree = [];
let currentQuery = '';

function renderTree(tree, query = '') {
    currentTree = Array.isArray(tree) ? tree : [];
    currentQuery = query || '';

    const root = document.getElementById('tree');
    root.innerHTML = '';
    resetNav();

    if (currentTree.length === 0) {
        root.innerHTML = '<div class="empty">Нет сохранённых ссылок</div>';
        return;
    }

    safeArray(currentTree).forEach(n => {
        if (currentQuery) {
            if (!nodeMatchesQuery(n, currentQuery)) return;
        }
        renderNode(n, root, currentQuery);
    });
}

function nodeMatchesQuery(node, query) {
    if (!node) return false;
    const q = query.toLowerCase();
    if ((node.title || '').toLowerCase().includes(q)) return true;
    if (safeArray(node.links).some(l => (((l?.title || '') + ' ' + (l?.url || '')).toLowerCase().includes(q)))) return true;
    return safeArray(node.children).some(c => nodeMatchesQuery(c, q));
}

async function loadAndRender(query = '') {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    const tree = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
    renderTree(tree, query);
}

/* ─────────────────── Keyboard navigation ─────────────────── */

let navIndex = -1;
let navItems = [];

function updateNavItems() {
    // Collect all visible .link elements (hidden ones are inside display:none parents)
    navItems = Array.from(document.querySelectorAll('#tree .link')).filter(el => el.offsetParent !== null);
}

function setNavFocus(index) {
    navItems.forEach(el => el.classList.remove('kb-focused'));

    if (navItems.length === 0) { navIndex = -1; return; }

    // Wrap around
    if (index < 0) index = navItems.length - 1;
    if (index >= navItems.length) index = 0;

    navIndex = index;
    navItems[navIndex].classList.add('kb-focused');
    navItems[navIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function resetNav() {
    navIndex = -1;
    navItems = [];
}

/* ─────────────────── Controls ─────────────────── */

document.getElementById('openOptions').addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); }
    catch { window.open('options.html', '_blank'); }
});

/* Expand / Collapse all toggle */
document.getElementById('toggleAll').addEventListener('click', () => {
    if (allCollapsed) {
        collapsed.clear();
        allCollapsed = false;
    } else {
        // Collect all folder IDs in current tree
        function collectIds(nodes) {
            safeArray(nodes).forEach(n => {
                if (!n) return;
                collapsed.add(n.id);
                collectIds(n.children);
            });
        }
        collectIds(currentTree);
        allCollapsed = true;
    }
    renderTree(currentTree, currentQuery);
});

/* Search input */
const searchEl = document.getElementById('popupSearch');
let searchTimer = null;

searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAndRender(searchEl.value.trim()), 200);
});

/* ─────────────────── Keyboard shortcuts ─────────────────── */

document.addEventListener('keydown', e => {
    const inSearch = document.activeElement === searchEl;

    /* ArrowDown / ArrowUp — navigate through links */
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();

        // Blur search so text cursor doesn't interfere
        if (inSearch) searchEl.blur();

        updateNavItems();
        if (navItems.length === 0) return;

        setNavFocus(e.key === 'ArrowDown' ? navIndex + 1 : navIndex - 1);
        return;
    }

    /* Enter — open focused link */
    if (e.key === 'Enter' && !inSearch) {
        if (navIndex >= 0 && navItems[navIndex]) {
            e.preventDefault();
            navItems[navIndex].click();
        }
        return;
    }

    /* Ctrl/Cmd + Q — focus search */
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        searchEl.focus();
        searchEl.select();
        return;
    }

    /* Escape — clear search or blur */
    if (e.key === 'Escape') {
        if (inSearch) {
            searchEl.value = '';
            searchEl.blur();
            loadAndRender('');
        } else {
            // Clear keyboard nav highlight
            navItems.forEach(el => el.classList.remove('kb-focused'));
            navIndex = -1;
        }
    }
});

/* ─────────────────── Boot ─────────────────── */

window.addEventListener('load', () => {
    searchEl.value = '';
    loadAndRender('');
    searchEl.focus();
    searchEl.select();
});
