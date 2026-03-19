/* ════════════════════════════════════════════════════
   popup.js — Link Tree Manager v1.4
   ════════════════════════════════════════════════════ */

const STORAGE_KEY    = 'linkTree';
const SETTINGS_KEY   = 'appSettings';
const COLLAPSE_KEY   = 'popupCollapsed';   // persisted collapsed folder IDs

const safeArray = v => Array.isArray(v) ? v : [];

/* Collapsed state — loaded from storage, updated on toggle */
const collapsed = new Set();
let allCollapsed = false;

/* ─── Settings ─── */
function loadAndApplySettings(cb) {
    chrome.storage.local.get([SETTINGS_KEY], res => {
        const s = { theme: 'light', compactMode: false, ...((res?.[SETTINGS_KEY]) || {}) };
        document.documentElement.setAttribute('data-theme', s.theme === 'dark' ? 'dark' : 'light');
        cb && cb();
    });
}

/* ─── Collapsed state persistence ─── */
function saveCollapsed() {
    chrome.storage.local.set({ [COLLAPSE_KEY]: [...collapsed] });
}

function loadCollapsed(cb) {
    chrome.storage.local.get([COLLAPSE_KEY], res => {
        const ids = res?.[COLLAPSE_KEY];
        if (Array.isArray(ids)) ids.forEach(id => collapsed.add(id));
        cb && cb();
    });
}

/* ─── Helpers ─── */
function getFavicon(url) {
    try {
        const u = new URL(url);
        return `https://www.google.com/s2/favicons?sz=32&domain=${u.hostname}`;
    } catch { return ''; }
}

function openLink(url) {
    if (!url) return;
    try { chrome.tabs.create({ url }); }
    catch { window.open(url, '_blank'); }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
}

/* ─── Render ─── */
function renderNode(node, container, query) {
    if (!node) return;

    const folder = document.createElement('div');
    folder.className = 'folder';

    /* Folder header */
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

    /* Link count badge */
    const linkCount = safeArray(node.links).filter(l => l.url || l.title).length;
    if (linkCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'count-badge';
        badge.textContent = linkCount;
        name.appendChild(badge);
    }

    /* Open-all button */
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

    row.addEventListener('click', () => {
        if (collapsed.has(node.id)) collapsed.delete(node.id);
        else collapsed.add(node.id);
        saveCollapsed();
        renderTree(currentTree, currentQuery);
    });

    row.append(ficon, toggle, name, openAllBtn);
    folder.appendChild(row);

    /* Children wrapper */
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'links';
    if (collapsed.has(node.id)) childrenWrap.style.display = 'none';

    /* Links */
    safeArray(node.links).forEach(link => {
        if (!link || (!link.url && !link.title)) return;

        if (query) {
            const q = query.toLowerCase();
            if (!((link.title || '').toLowerCase().includes(q) || (link.url || '').toLowerCase().includes(q))) return;
        }

        const linkEl = document.createElement('div');
        linkEl.className = 'link';
        linkEl.tabIndex = -1;
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

        /* Actions */
        const actions = document.createElement('div');
        actions.className = 'link-actions';

        const openBtn = document.createElement('button');
        openBtn.className = 'small-btn';
        openBtn.textContent = '⤴';
        openBtn.title = 'Открыть';
        openBtn.addEventListener('click', e => { e.stopPropagation(); openLink(link.url); });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'small-btn';
        copyBtn.textContent = '⧉';
        copyBtn.title = 'Копировать URL';
        copyBtn.addEventListener('click', e => {
            e.stopPropagation();
            const text = link.url || '';
            if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            else fallbackCopy(text);
        });

        actions.append(openBtn, copyBtn);
        linkEl.append(content, actions);
        childrenWrap.appendChild(linkEl);
    });

    /* Sub-folders */
    safeArray(node.children).forEach(child => renderNode(child, childrenWrap, query));

    folder.appendChild(childrenWrap);
    container.appendChild(folder);
}

/* ─── Tree state ─── */
let currentTree  = [];
let currentQuery = '';

function nodeMatchesQuery(node, query) {
    if (!node) return false;
    const q = query.toLowerCase();
    if ((node.title || '').toLowerCase().includes(q)) return true;
    if (safeArray(node.links).some(l => (((l?.title || '') + ' ' + (l?.url || '')).toLowerCase().includes(q)))) return true;
    return safeArray(node.children).some(c => nodeMatchesQuery(c, q));
}

function renderTree(tree, query = '') {
    currentTree  = Array.isArray(tree) ? tree : [];
    currentQuery = query || '';

    const root = document.getElementById('tree');
    root.innerHTML = '';
    resetNav();

    if (currentTree.length === 0) {
        root.innerHTML = '<div class="empty">Нет сохранённых ссылок</div>';
        return;
    }

    safeArray(currentTree).forEach(n => {
        if (currentQuery && !nodeMatchesQuery(n, currentQuery)) return;
        renderNode(n, root, currentQuery);
    });
}

async function loadAndRender(query = '') {
    const res  = await chrome.storage.local.get(STORAGE_KEY);
    const tree = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
    renderTree(tree, query);
}

/* ─── Keyboard navigation ─── */
let navIndex = -1;
let navItems = [];

function updateNavItems() {
    navItems = Array.from(document.querySelectorAll('#tree .link')).filter(el => el.offsetParent !== null);
}

function setNavFocus(index) {
    navItems.forEach(el => el.classList.remove('kb-focused'));
    if (navItems.length === 0) { navIndex = -1; return; }
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

/* ─── Controls ─── */
document.getElementById('openOptions').addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); }
    catch { window.open('options.html', '_blank'); }
});

document.getElementById('toggleAll').addEventListener('click', () => {
    if (allCollapsed) {
        collapsed.clear();
        allCollapsed = false;
    } else {
        function collectIds(nodes) {
            safeArray(nodes).forEach(n => { if (!n) return; collapsed.add(n.id); collectIds(n.children); });
        }
        collectIds(currentTree);
        allCollapsed = true;
    }
    saveCollapsed();
    renderTree(currentTree, currentQuery);
});

const searchEl  = document.getElementById('popupSearch');
let searchTimer = null;

searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAndRender(searchEl.value.trim()), 200);
});

/* ─── Keyboard shortcuts ─── */
document.addEventListener('keydown', e => {
    const inSearch = document.activeElement === searchEl;

    /* ↑ / ↓ — navigate links */
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
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

    /* Alt + Q — focus search
       NOTE: The browser command Alt+Q opens the popup via background.js.
       Once the popup is open, pressing Alt+Q again focuses the search field. */
    if (e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        searchEl.focus();
        searchEl.select();
        return;
    }

    /* Escape — clear search or deselect */
    if (e.key === 'Escape') {
        if (inSearch) {
            searchEl.value = '';
            searchEl.blur();
            loadAndRender('');
        } else {
            navItems.forEach(el => el.classList.remove('kb-focused'));
            navIndex = -1;
        }
    }
});

/* ─── Boot ─── */
window.addEventListener('load', () => {
    searchEl.value = '';

    // Load settings (theme etc.), collapsed state, then tree
    loadAndApplySettings(() => {
        loadCollapsed(() => {
            loadAndRender('');
            searchEl.focus();
            searchEl.select();
        });
    });
});
