/* ════════════════════════════════════════════════════
   options.js — Link Tree Manager v1.4
   ════════════════════════════════════════════════════ */

const STORAGE_KEY  = 'linkTree';
const BACKUP_KEY   = 'linkTree_backup';
const SETTINGS_KEY = 'appSettings';

/* ─── Default settings ─── */
const DEFAULT_SETTINGS = {
    theme:      'light',   // 'light' | 'dark'
    compactMode: false,
    autosave:   false
};

/* ─── Utilities ─── */
const uid = () => (crypto?.randomUUID?.() ?? ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
const safeArray = v => Array.isArray(v) ? v : [];
const $ = id => document.getElementById(id);

function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function isValidUrl(v) {
    try { new URL(v); return true; } catch { return false; }
}

/* ─── Normalization ─── */
function normalizeNode(node) {
    if (!node || node.type !== 'folder') return null;
    return {
        id:       typeof node.id    === 'string' ? node.id    : uid(),
        type:     'folder',
        title:    typeof node.title === 'string' ? node.title : '',
        children: safeArray(node.children).map(normalizeNode).filter(Boolean),
        links:    safeArray(node.links).map(l => ({
            id:    typeof l?.id    === 'string' ? l.id    : uid(),
            title: typeof l?.title === 'string' ? l.title : '',
            url:   typeof l?.url   === 'string' ? l.url   : ''
        }))
    };
}
function normalizeTree(data) { return safeArray(data).map(normalizeNode).filter(Boolean); }

/* ─── Storage ─── */
function persistToStorage(tree, cb) {
    chrome.storage.local.get([STORAGE_KEY], res => {
        const current = safeArray(res?.[STORAGE_KEY]);
        chrome.storage.local.set({ [BACKUP_KEY]: current }, () => {
            chrome.storage.local.set({ [STORAGE_KEY]: tree }, () => cb && cb());
        });
    });
}
function loadBackup(cb) {
    chrome.storage.local.get([BACKUP_KEY], res => cb(normalizeTree(res?.[BACKUP_KEY])));
}

/* ─── Settings storage ─── */
let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettings(cb) {
    chrome.storage.local.get([SETTINGS_KEY], res => {
        const saved = res?.[SETTINGS_KEY] || {};
        currentSettings = { ...DEFAULT_SETTINGS, ...saved };
        cb && cb(currentSettings);
    });
}

function saveSettings(cb) {
    chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings }, () => cb && cb());
}

function applySettings(s) {
    // Theme
    document.documentElement.setAttribute('data-theme', s.theme === 'dark' ? 'dark' : 'light');

    // Compact mode on tree panel
    const panel = $('treePanel');
    if (panel) panel.classList.toggle('compact', !!s.compactMode);

    // Sync checkboxes
    const elDark    = $('settingDark');
    const elCompact = $('settingCompact');
    const elAuto    = $('settingAutosave');
    if (elDark)    elDark.checked    = s.theme === 'dark';
    if (elCompact) elCompact.checked = !!s.compactMode;
    if (elAuto)    elAuto.checked    = !!s.autosave;

    // Autosave
    setupAutosave(!!s.autosave);
}

/* ─── Autosave ─── */
let autosaveTimer = null;

function setupAutosave(enabled) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
    if (!enabled) return;
    autosaveTimer = setInterval(() => {
        if (!unsaved) return;
        const normalized = normalizeTree(currentTree);
        persistToStorage(normalized, () => {
            savedTreeSnapshot = clone(normalized);
            setUnsaved(false);
        });
    }, 30000);
}

/* ─── Export / Import tree ─── */
function hasExportableContent(tree) {
    if (!Array.isArray(tree) || tree.length === 0) return false;
    function check(nodes) {
        return nodes.some(n => {
            if (!n) return false;
            if (safeArray(n.links).some(l => l.url || l.title)) return true;
            return check(safeArray(n.children));
        });
    }
    return check(tree);
}

function buildTxtContent(tree) {
    const lines = ['=== LINK TREE ===', ''];
    function walk(nodes, depth) {
        const pad = '  '.repeat(depth);
        for (const node of nodes) {
            lines.push(`${pad}Папка: ${node.title}`);
            const links = safeArray(node.links);
            links.forEach((link, i) => {
                lines.push(`${pad}--название: ${link.title || ''}`);
                lines.push(`${pad}--ссылка: ${link.url || ''}`);
                if (i < links.length - 1) lines.push(`${pad}====`);
            });
            if (safeArray(node.children).length > 0) walk(node.children, depth + 1);
            if (depth === 0) lines.push('');
        }
    }
    walk(tree, 0);
    return lines.join('\n');
}

function exportTreeToTxt(tree, useUniqueName = false) {
    if (!hasExportableContent(tree)) {
        alert('Нечего экспортировать: дерево пустое или не содержит ссылок.');
        return;
    }
    const blob = new Blob([buildTxtContent(tree)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    chrome.downloads.download({
        url,
        filename:       useUniqueName ? `linkTree-${today}.txt` : 'linkTree.txt',
        conflictAction: useUniqueName ? 'uniquify' : 'overwrite',
        saveAs: false
    });
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function parseTxtToTree(text) {
    return text.includes('Папка:') ? parseNewFormat(text) : parseOldFormat(text);
}

function parseNewFormat(text) {
    const root = [];
    const stack = [{ depth: -1, node: null, children: root }];
    let currentLink = null;
    for (const rawLine of text.split('\n')) {
        if (!rawLine.trim()) continue;
        const content   = rawLine.trim();
        if (content === '====' || content.startsWith('=== ')) continue;
        const depth = Math.floor(rawLine.match(/^( *)/)[1].length / 2);
        if (content.startsWith('Папка:')) {
            const folder = { id: uid(), type: 'folder', title: content.slice(6).trim(), children: [], links: [] };
            while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
            stack[stack.length - 1].children.push(folder);
            stack.push({ depth, node: folder, children: folder.children });
            currentLink = null;
        } else if (content.startsWith('--название:')) {
            const parentNode = stack[stack.length - 1].node;
            if (!parentNode) continue;
            currentLink = { id: uid(), title: content.slice(11).trim(), url: '' };
            parentNode.links.push(currentLink);
        } else if (content.startsWith('--ссылка:') && currentLink) {
            currentLink.url = content.slice(9).trim();
            currentLink = null;
        }
    }
    return root;
}

function parseOldFormat(text) {
    const root = [];
    const stack = [{ depth: -1, node: null, children: root }];
    let lastLink = null;
    for (const line of text.split('\n')) {
        if (!line.trim() || line.startsWith('===')) continue;
        const depth   = (line.match(/^ */)[0].length) / 2;
        const content = line.trim();
        if (content.startsWith('📁')) {
            const folder = { id: uid(), type: 'folder', title: content.replace('📁', '').trim(), children: [], links: [] };
            while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
            stack[stack.length - 1].children.push(folder);
            stack.push({ depth, node: folder, children: folder.children });
            lastLink = null;
        } else if (content.startsWith('🔗')) {
            const link = { id: uid(), title: content.replace('🔗', '').trim(), url: '' };
            const parent = stack[stack.length - 1].node;
            if (parent) { parent.links.push(link); lastLink = link; }
        } else if (content.startsWith('http') && lastLink) {
            lastLink.url = content.trim();
            lastLink = null;
        }
    }
    return root;
}

/* ─── Settings export / import ─── */
function buildSettingsTxt(s) {
    return [
        '=== SETTINGS ===',
        `theme: ${s.theme}`,
        `compactMode: ${s.compactMode}`,
        `autosave: ${s.autosave}`
    ].join('\n');
}

function parseSettingsTxt(text) {
    if (!text.includes('=== SETTINGS ===')) throw new Error('Неверный формат файла настроек.');
    const result = { ...DEFAULT_SETTINGS };
    for (const line of text.split('\n')) {
        const [key, ...rest] = line.split(':').map(s => s.trim());
        const val = rest.join(':').trim();
        if (!key || !val) continue;
        if (key === 'theme'       && (val === 'light' || val === 'dark')) result.theme = val;
        if (key === 'compactMode') result.compactMode = val === 'true';
        if (key === 'autosave')   result.autosave    = val === 'true';
    }
    return result;
}

function exportSettingsTxt() {
    const blob = new Blob([buildSettingsTxt(currentSettings)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'linkTree-settings.txt', conflictAction: 'overwrite', saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ─── Tree helpers ─── */
function findParentAndIndex(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i]; if (!n) continue;
        if (n.id === id) return { parentArray: list, index: i };
        const res = findParentAndIndex(n.children, id);
        if (res) return res;
    }
    return null;
}
function findLinkParent(list, linkId) {
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
function swap(arr, i, j) {
    if (!Array.isArray(arr) || i < 0 || j < 0 || i >= arr.length || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
}

function moveFolder(id, dir) {
    const loc = findParentAndIndex(currentTree, id); if (!loc) return;
    const ni = loc.index + dir;
    if (ni < 0 || ni >= loc.parentArray.length) return;
    swap(loc.parentArray, loc.index, ni);
    setUnsaved(true); renderTree(currentTree);
}
function moveLinkUpDown(id, dir) {
    const loc = findLinkParent(currentTree, id); if (!loc) return;
    const ni = loc.index + dir;
    if (ni < 0 || ni >= loc.parentNode.links.length) return;
    swap(loc.parentNode.links, loc.index, ni);
    setUnsaved(true); renderTree(currentTree);
}

function removeEmptyFolders(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(n => {
        if (!n) return false;
        n.children = removeEmptyFolders(n.children);
        return n.children.length > 0 || safeArray(n.links).length > 0;
    });
}

/* ─── Filter ─── */
function filterTree(list, q) {
    if (!q) return clone(list);
    const needle = q.toLowerCase();
    function filterNode(node) {
        if (!node) return null;
        const titleMatch = (node.title || '').toLowerCase().includes(needle);
        const links      = safeArray(node.links).filter(l => (((l?.title || '') + ' ' + (l?.url || '')).toLowerCase().includes(needle))).map(l => ({ ...l }));
        const children   = safeArray(node.children).map(filterNode).filter(Boolean);
        if (titleMatch || links.length || children.length) return { ...node, links, children };
        return null;
    }
    return safeArray(list).map(filterNode).filter(Boolean);
}

/* ─── UI State ─── */
let currentTree        = [];
let savedTreeSnapshot  = [];
let unsaved            = false;
let movingNode         = null;
let movingLink         = null;
let currentQuery       = '';

function setUnsaved(flag) {
    unsaved = !!flag;
    const el = $('unsavedIndicator');
    if (el) el.style.display = unsaved ? 'inline-flex' : 'none';
}

/* ─── Rendering ─── */
function mkBtn(text, title_, cls, handler) {
    const b = document.createElement('button');
    b.className = cls || 'btn small';
    b.textContent = text;
    b.title = title_;
    b.addEventListener('click', e => { e.stopPropagation(); handler(); });
    return b;
}

function createNodeRow(node) {
    const row = document.createElement('div');
    row.className = 'node-row';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';

    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = '📁';

    const title = document.createElement('input');
    title.className = 'title-input';
    title.value = node.title || '';
    title.addEventListener('input', () => {
        const loc = findParentAndIndex(currentTree, node.id);
        if (loc) { loc.parentArray[loc.index].title = title.value; setUnsaved(true); }
    });

    left.append(icon, title);

    const actions = document.createElement('div');
    actions.className = 'node-actions';

    actions.append(
        mkBtn('⤓', 'Вставить сюда', 'btn small', () => {
            const loc = findParentAndIndex(currentTree, node.id); if (!loc) return;
            const target = loc.parentArray[loc.index];
            if (movingNode) {
                target.children = safeArray(target.children);
                target.children.push(clone(movingNode));
                movingNode = null;
            } else if (movingLink) {
                target.links = safeArray(target.links);
                target.links.push(clone(movingLink));
                movingLink = null;
            }
            setUnsaved(true); renderTree(currentTree);
        }),
        mkBtn('+📁', 'Добавить подпапку', 'btn small', () => {
            const loc = findParentAndIndex(currentTree, node.id); if (!loc) return;
            const target = loc.parentArray[loc.index];
            target.children = safeArray(target.children);
            target.children.push({ id: uid(), type: 'folder', title: 'Новая папка', children: [], links: [] });
            setUnsaved(true); renderTree(currentTree);
        }),
        mkBtn('+🔗', 'Добавить ссылку', 'btn small', () => {
            const loc = findParentAndIndex(currentTree, node.id); if (!loc) return;
            const target = loc.parentArray[loc.index];
            target.links = safeArray(target.links);
            target.links.push({ id: uid(), title: '', url: '' });
            setUnsaved(true); renderTree(currentTree);
        }),
        mkBtn('⬆', 'Вверх',  'btn small', () => moveFolder(node.id, -1)),
        mkBtn('⬇', 'Вниз',   'btn small', () => moveFolder(node.id,  1)),
        mkBtn('✂', 'Вырезать', 'btn small', () => {
            const loc = findParentAndIndex(currentTree, node.id); if (!loc) return;
            movingNode = clone(loc.parentArray[loc.index]);
            loc.parentArray.splice(loc.index, 1);
            movingLink = null;
            setUnsaved(true); renderTree(currentTree);
        }),
        (() => {
            const b = document.createElement('button');
            b.className = 'btn small btn-danger';
            b.textContent = '🗑';
            b.title = 'Удалить папку';
            b.addEventListener('click', e => {
                e.stopPropagation();
                if (!confirm('Удалить папку и всё её содержимое?')) return;
                const loc = findParentAndIndex(currentTree, node.id); if (!loc) return;
                loc.parentArray.splice(loc.index, 1);
                setUnsaved(true); renderTree(currentTree);
            });
            return b;
        })()
    );

    row.append(left, actions);
    return row;
}

function createLinkRow(link) {
    const row = document.createElement('div');
    row.className = 'link-row';

    const left = document.createElement('div');
    left.className = 'link-fields';

    const ti = document.createElement('input');
    ti.className = 'link-title';
    ti.placeholder = 'Название';
    ti.value = link.title || '';
    ti.addEventListener('input', debounce(() => { link.title = ti.value; setUnsaved(true); }, 300));

    const ui = document.createElement('input');
    ui.className = 'link-url';
    ui.placeholder = 'URL';
    ui.value = link.url || '';
    ui.classList.toggle('invalid', !isValidUrl(link.url));
    ui.addEventListener('input', debounce(() => {
        link.url = ui.value;
        ui.classList.toggle('invalid', !isValidUrl(ui.value));
        setUnsaved(true);
    }, 300));

    left.append(ti, ui);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0';

    actions.append(
        mkBtn('⬆', 'Вверх',  'btn small', () => moveLinkUpDown(link.id, -1)),
        mkBtn('⬇', 'Вниз',   'btn small', () => moveLinkUpDown(link.id,  1)),
        mkBtn('✂', 'Вырезать', 'btn small', () => {
            const p = findLinkParent(currentTree, link.id); if (!p) return;
            movingLink = clone(p.parentNode.links[p.index]);
            p.parentNode.links.splice(p.index, 1);
            movingNode = null;
            setUnsaved(true); renderTree(currentTree);
        }),
        (() => {
            const b = document.createElement('button');
            b.className = 'btn small btn-danger';
            b.textContent = '🗑';
            b.title = 'Удалить ссылку';
            b.addEventListener('click', e => {
                e.stopPropagation();
                const p = findLinkParent(currentTree, link.id); if (!p) return;
                p.parentNode.links.splice(p.index, 1);
                setUnsaved(true); renderTree(currentTree);
            });
            return b;
        })()
    );

    row.append(left, actions);
    return row;
}

function renderNode(node, container) {
    if (!node) return;
    const wrap = document.createElement('div');
    wrap.className = 'folder';
    wrap.appendChild(createNodeRow(node));

    const linksWrap = document.createElement('div');
    linksWrap.className = 'links';
    safeArray(node.links).forEach(link => linksWrap.appendChild(createLinkRow(link)));
    safeArray(node.children).forEach(child => renderNode(child, linksWrap));

    wrap.appendChild(linksWrap);
    container.appendChild(wrap);
}

function renderTree(tree) {
    const root = $('tree');
    if (!root) return;
    root.innerHTML = '';

    if (!Array.isArray(tree) || tree.length === 0) {
        root.innerHTML = '<div class="empty">Дерево пустое — добавьте корневую папку</div>';
        return;
    }

    const toRender = currentQuery.trim() ? filterTree(tree, currentQuery) : tree;
    const frag = document.createDocumentFragment();
    safeArray(toRender).forEach(n => renderNode(n, frag));
    root.appendChild(frag);
}

/* ─── Controls wiring ─── */
$('addRoot').addEventListener('click', () => {
    currentTree = safeArray(currentTree);
    currentTree.push({ id: uid(), type: 'folder', title: 'Новая папка', children: [], links: [] });
    setUnsaved(true); renderTree(currentTree);
});

$('saveBtn').addEventListener('click', () => {
    const normalized = normalizeTree(currentTree);
    persistToStorage(normalized, () => {
        savedTreeSnapshot = clone(normalized);
        setUnsaved(false);
        alert('Сохранено');
    });
});

$('cancelBtn').addEventListener('click', () => {
    if (!unsaved) return;
    if (!confirm('Отменить несохранённые изменения?')) return;
    currentTree = clone(savedTreeSnapshot);
    setUnsaved(false); renderTree(currentTree);
});

$('exportBtn').addEventListener('click', () => {
    exportTreeToTxt(currentTree, $('exportUnique')?.checked ?? false);
});

$('importFile').addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const tree = parseTxtToTree(reader.result);
            if (!tree || tree.length === 0) { alert('Файл не содержит данных или имеет неверный формат.'); return; }
            currentTree = tree;
            setUnsaved(true); renderTree(currentTree);
        } catch { alert('Ошибка при чтении файла TXT.'); }
        finally { $('importFile').value = ''; }
    };
    reader.readAsText(file);
});

$('cleanBtn').addEventListener('click', () => {
    currentTree = removeEmptyFolders(currentTree);
    setUnsaved(true); renderTree(currentTree);
});

$('undoBtn').addEventListener('click', () => {
    loadBackup(backup => {
        if (!backup || backup.length === 0) { alert('Резервная копия не найдена.'); return; }
        if (!confirm('Восстановить из резервной копии? Текущий черновик будет заменён.')) return;
        currentTree = clone(backup);
        savedTreeSnapshot = clone(backup);
        setUnsaved(true); renderTree(currentTree);
    });
});

$('search').addEventListener('keydown', e => {
    if (e.key === 'Enter') { currentQuery = $('search').value.trim(); renderTree(currentTree); }
});
$('clearSearch').addEventListener('click', () => {
    $('search').value = '';
    currentQuery = '';
    renderTree(currentTree);
});

/* ─── Settings toggles ─── */
$('settingDark').addEventListener('change', e => {
    currentSettings.theme = e.target.checked ? 'dark' : 'light';
    applySettings(currentSettings);
    saveSettings();
});

$('settingCompact').addEventListener('change', e => {
    currentSettings.compactMode = e.target.checked;
    applySettings(currentSettings);
    saveSettings();
});

$('settingAutosave').addEventListener('change', e => {
    currentSettings.autosave = e.target.checked;
    applySettings(currentSettings);
    saveSettings();
});

/* ─── Settings export / import ─── */
$('exportSettings').addEventListener('click', exportSettingsTxt);

$('importSettings').addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const s = parseSettingsTxt(reader.result);
            currentSettings = s;
            applySettings(currentSettings);
            saveSettings(() => alert('Настройки успешно импортированы.'));
        } catch (err) {
            alert('Ошибка импорта настроек: ' + err.message);
        } finally { $('importSettings').value = ''; }
    };
    reader.readAsText(file);
});

/* ─── Global keyboard shortcuts ─── */
window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        $('saveBtn').click();
    } else if (e.key === 'Escape' && unsaved) {
        $('cancelBtn').click();
    }
});

window.addEventListener('beforeunload', e => {
    if (unsaved) { e.preventDefault(); e.returnValue = ''; }
});

/* ─── Boot ─── */
function loadInitial() {
    // Load settings first, then tree
    loadSettings(s => {
        applySettings(s);
        chrome.storage.local.get([STORAGE_KEY], res => {
            const tree = normalizeTree(res[STORAGE_KEY] || []);
            currentTree       = clone(tree);
            savedTreeSnapshot = clone(tree);
            setUnsaved(false);
            renderTree(currentTree);
        });
    });
}

loadInitial();
