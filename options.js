/* options.js — Redesigned for polished UX
   - Drag & drop for folders and links (use handle on the right)
   - Cut/Paste for folders & links
   - Single Save / Cancel (draft mode)
   - Visual drop indicators, smooth transitions hooks
   - Move handles placed in actions to the right (so the title is left-aligned)
   - No up/down arrows (removed)

   NOTE: This file replaces the earlier options.js. The UI expects certain CSS classes to exist:
   - .drag-handle (stylish right-side handle)
   - .node-row.drop-before / .node-row.drop-after
   - .links (increased indent)
   - .link-row (row layout for link inputs)
   - .drop-highlight optional for children area

   If you want the exact CSS I used for visual polish, tell me and I'll paste it separately.
*/

const STORAGE_KEY = 'linkTree';
const BACKUP_KEY = 'linkTree_backup';

/* ----------------- Utilities ----------------- */
const uid = () => (crypto?.randomUUID?.() ?? ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
const safeArray = v => Array.isArray(v) ? v : [];
function clone(obj) { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }

function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

function isValidUrl(v) {
    try { new URL(v); return true; }
    catch { return false; }
}

function checkDirty() {
    if (JSON.stringify(currentTree) !== JSON.stringify(savedTreeSnapshot)) {
        setUnsaved(true);
    }
}

/* ----------------- Normalization ----------------- */
function normalizeNode(node) {
    if (!node || node.type !== 'folder') return null;
    return {
        id: typeof node.id === 'string' ? node.id : uid(),
        type: 'folder',
        title: typeof node.title === 'string' ? node.title : '',
        children: safeArray(node.children).map(normalizeNode).filter(Boolean),
        links: safeArray(node.links).map(l => ({
            id: typeof l?.id === 'string' ? l.id : uid(),
            title: typeof l?.title === 'string' ? l.title : '',
            url: typeof l?.url === 'string' ? l.url : ''
        }))
    };
}
function normalizeTree(data) { return safeArray(data).map(normalizeNode).filter(Boolean); }

/* ----------------- Storage helpers ----------------- */
function loadFromStorage(cb) {
    chrome.storage.local.get([STORAGE_KEY], res => {
        try { cb(normalizeTree(res?.[STORAGE_KEY])); } catch { cb([]); }
    });
}
function persistToStorage(tree, cb) {
    chrome.storage.local.get([STORAGE_KEY], res => {
        const current = safeArray(res?.[STORAGE_KEY]);
        chrome.storage.local.set({ [BACKUP_KEY]: current }, () => {
            chrome.storage.local.set({ [STORAGE_KEY]: tree }, () => cb && cb());
        });
    });
}
function overwriteWithoutBackup(tree, cb) { chrome.storage.local.set({ [STORAGE_KEY]: tree }, () => cb && cb()); }
function loadBackup(cb) { chrome.storage.local.get([BACKUP_KEY], res => cb(normalizeTree(res?.[BACKUP_KEY]))); }

/* ----------------- Tree helpers ----------------- */
function findParentAndIndex(list, id, parentNode = null) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!n) continue;
        if (n.id === id) return { parentArray: list, index: i, parentNode };
        const res = findParentAndIndex(n.children, id, n);
        if (res) return res;
    }
    return null;
}
function findLinkParent(list, linkId) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!n) continue;
        const idx = safeArray(n.links).findIndex(l => l?.id === linkId);
        if (idx !== -1) return { parentNode: n, index: idx };
        const res = findLinkParent(n.children, linkId);
        if (res) return res;
    }
    return null;
}
function detachNodeById(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!n) continue;
        if (n.id === id) return list.splice(i, 1)[0];
        const childRes = detachNodeById(n.children, id);
        if (childRes) return childRes;
    }
    return null;
}
function detachLinkById(list, linkId) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!n) continue;
        const idx = safeArray(n.links).findIndex(l => l?.id === linkId);
        if (idx !== -1) return n.links.splice(idx, 1)[0];
        const childRes = detachLinkById(n.children, linkId);
        if (childRes) return childRes;
    }
    return null;
}
function insertNodeIntoParent(list, parentId, index, nodeToInsert) {
    if (parentId == null || parentId === '__root__') { list.splice(index, 0, nodeToInsert); return true; }
    const loc = findParentAndIndex(list, parentId); if (!loc) return false;
    const parentNode = loc.parentArray[loc.index]; parentNode.children = safeArray(parentNode.children); parentNode.children.splice(index, 0, nodeToInsert); return true;
}
function insertLinkIntoParent(list, parentId, index, linkToInsert) {
    if (!list) return false; const loc = findParentAndIndex(list, parentId);
    if (!loc) return false; const parentNode = loc.parentArray[loc.index]; parentNode.links = safeArray(parentNode.links); parentNode.links.splice(index, 0, linkToInsert); return true;
}
function swapInArray(arr, i, j) { if (!Array.isArray(arr)) return; if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return; const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
function removeEmptyFolders(list) { if (!Array.isArray(list)) return []; const out = []; for (let i = 0; i < list.length; i++) { const n = list[i]; if (!n) continue; n.children = removeEmptyFolders(n.children); if (safeArray(n.children).length === 0 && safeArray(n.links).length === 0) continue; out.push(n); } return out; }
function sortTreeInPlace(list) { if (!Array.isArray(list)) return; list.sort((a, b) => ((a?.title || '').toLowerCase()).localeCompare((b?.title || '').toLowerCase())); for (let i = 0; i < list.length; i++) { const node = list[i]; if (node && Array.isArray(node.children)) sortTreeInPlace(node.children); if (node && Array.isArray(node.links)) node.links.sort((x, y) => ((x?.title || '').toLowerCase()).localeCompare((y?.title || '').toLowerCase())); } }

function moveLink(linkId, targetFolderId, targetIndex) {
    if (!linkId || !targetFolderId) return;

    const moved = detachLinkById(currentTree, linkId);
    if (!moved) return;

    const loc = findParentAndIndex(currentTree, targetFolderId);
    if (!loc) return;

    const folder = loc.parentArray[loc.index];
    folder.links = safeArray(folder.links);

    if (targetIndex == null) {
        folder.links.push(moved);
    } else {
        const idx = Math.max(0, Math.min(targetIndex, folder.links.length));
        folder.links.splice(idx, 0, moved);
    }
}

/* ----------------- Filter ----------------- */
function filterTree(list, q) { if (!q) return clone(list); const needle = q.toLowerCase(); function filterNode(node) { if (!node) return null; const titleMatch = (node.title || '').toLowerCase().includes(needle); const links = safeArray(node.links).filter(l => (((l?.title || '') + ' ' + (l?.url || '')).toLowerCase().includes(needle))).map(l => ({ ...l })); const children = []; safeArray(node.children).forEach(c => { const fc = filterNode(c); if (fc) children.push(fc); }); if (titleMatch || links.length || children.length) return { id: node.id, type: 'folder', title: node.title, links, children }; return null; } const out = []; safeArray(list).forEach(n => { const f = filterNode(n); if (f) out.push(f); }); return out; }

/* ----------------- UI State ----------------- */
let currentTree = []; let savedTreeSnapshot = []; let unsaved = false; let movingNode = null; let movingLink = null; let currentRenderTree = null; let currentQuery = '';
// drag state
let draggedNodeId = null; let draggedLinkId = null; let draggedType = null; // 'node' or 'link'

function setUnsaved(flag) { unsaved = !!flag; const el = document.getElementById('unsavedIndicator'); if (el) el.style.display = unsaved ? 'inline-block' : 'none'; }




/* ----------------- Rendering ----------------- */
function createNodeRow(node) {
    const row = document.createElement('div'); row.className = 'node-row';
    // left icon + title
    const leftWrap = document.createElement('div'); leftWrap.style.display = 'flex'; leftWrap.style.alignItems = 'center'; leftWrap.style.gap = '8px'; leftWrap.style.flex = '1';
    const icon = document.createElement('div'); icon.className = 'icon'; icon.textContent = '📁';
    const title = document.createElement('input'); title.className = 'title-input'; title.value = node.title || ''; title.addEventListener('input', () => { const loc = findParentAndIndex(currentTree, node.id); if (loc) { loc.parentArray[loc.index].title = title.value; setUnsaved(true); } });
    leftWrap.append(icon, title);

    // right actions: paste, add child/link, cut, delete, drag handle
    const actions = document.createElement('div'); actions.className = 'node-actions'; actions.style.display = 'flex'; actions.style.gap = '6px'; actions.style.alignItems = 'center';

    const btnPaste = document.createElement('button'); btnPaste.className = 'btn small'; btnPaste.textContent = '⤓'; btnPaste.title = 'Paste here'; btnPaste.addEventListener('click', (e) => { e.stopPropagation(); if (movingNode) { const loc = findParentAndIndex(currentTree, node.id); if (!loc) return; loc.parentArray[loc.index].children = safeArray(loc.parentArray[loc.index].children); loc.parentArray[loc.index].children.push(clone(movingNode)); movingNode = null; setUnsaved(true); renderTree(currentTree); } if (movingLink) { const loc = findParentAndIndex(currentTree, node.id); if (!loc) return; loc.parentArray[loc.index].links = safeArray(loc.parentArray[loc.index].links); loc.parentArray[loc.index].links.push(clone(movingLink)); movingLink = null; setUnsaved(true); renderTree(currentTree); } });

    const btnAddF = document.createElement('button'); btnAddF.className = 'btn small'; btnAddF.textContent = '+📁'; btnAddF.title = 'Add child'; btnAddF.addEventListener('click', (e) => { e.stopPropagation(); const loc = findParentAndIndex(currentTree, node.id); if (!loc) return; const target = loc.parentArray[loc.index]; target.children = safeArray(target.children); target.children.push({ id: uid(), type: 'folder', title: 'New folder', children: [], links: [] }); setUnsaved(true); renderTree(currentTree); });

    const btnAddL = document.createElement('button'); btnAddL.className = 'btn small'; btnAddL.textContent = '+🔗'; btnAddL.title = 'Add link'; btnAddL.addEventListener('click', (e) => { e.stopPropagation(); const loc = findParentAndIndex(currentTree, node.id); if (!loc) return; const target = loc.parentArray[loc.index]; target.links = safeArray(target.links); target.links.push({ id: uid(), title: '', url: '' }); setUnsaved(true); renderTree(currentTree); });

    const btnCut = document.createElement('button'); btnCut.className = 'btn small'; btnCut.textContent = '✂'; btnCut.title = 'Cut (move)'; btnCut.addEventListener('click', (e) => { e.stopPropagation(); const loc = findParentAndIndex(currentTree, node.id); if (!loc) return; movingNode = clone(loc.parentArray[loc.index]); loc.parentArray.splice(loc.index, 1); movingLink = null; setUnsaved(true); renderTree(currentTree); });

    const btnDel = document.createElement('button'); btnDel.className = 'btn small btn-danger'; btnDel.textContent = '🗑'; btnDel.title = 'Delete'; btnDel.addEventListener('click', (e) => { e.stopPropagation(); if (!confirm('Delete folder and everything inside?')) return; const loc = findParentAndIndex(currentTree, node.id); if (!loc) return; loc.parentArray.splice(loc.index, 1); setUnsaved(true); renderTree(currentTree); });

    // drag handle on right
    const handle = document.createElement('div'); handle.className = 'drag-handle'; handle.textContent = '≡'; handle.draggable = true; handle.addEventListener('dragstart', (e) => { draggedNodeId = node.id; draggedType = 'node'; try { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'node', id: node.id })); } catch { } e.dataTransfer.effectAllowed = 'move'; handle.classList.add('dragging'); }); handle.addEventListener('dragend', () => { draggedNodeId = null; draggedType = null; handle.classList.remove('dragging'); document.querySelectorAll('.node-row.drop-before,.node-row.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after')); document.querySelectorAll('.links').forEach(el => el.style.outline = ''); });

    actions.append(btnPaste, btnAddF, btnAddL, btnCut, btnDel, handle);
    row.append(leftWrap, actions);

    // row drop behaviour (before/after insert)
    row.addEventListener('dragover', (e) => { e.preventDefault(); document.querySelectorAll('.node-row.drop-before,.node-row.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after')); const rect = row.getBoundingClientRect(); const mid = rect.top + rect.height / 2; if (e.clientY < mid) row.classList.add('drop-before'); else row.classList.add('drop-after'); });
    row.addEventListener('dragleave', () => { row.classList.remove('drop-before', 'drop-after'); });
    row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('drop-before', 'drop-after'); let payload = null; try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { payload = { type: draggedType, id: draggedNodeId || draggedLinkId }; }
        if (!payload || !payload.type) return; if (payload.type === 'node') { if (!payload.id || payload.id === node.id) return; const moved = detachNodeById(currentTree, payload.id); if (!moved) return; const targetLoc = findParentAndIndex(currentTree, node.id); if (!targetLoc) { const arr = currentTree; const idx = arr.findIndex(x => x.id === node.id); const insertIndex = (e.clientY < (row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2)) ? idx : idx + 1; arr.splice(insertIndex, 0, moved); } else { const parentArr = targetLoc.parentArray; const idx = targetLoc.index; const insertIndex = (e.clientY < (row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2)) ? idx : idx + 1; parentArr.splice(insertIndex, 0, moved); } setUnsaved(true); renderTree(currentTree); }
        else if (payload.type === 'link') {
            if (!payload.id) return; const movedLinkObj = detachLinkById(currentTree, payload.id); if (!movedLinkObj) return; // insert link into this folder at computed index
            const loc = findParentAndIndex(currentTree, node.id); if (!loc) { // root -> add as top-level folder? we'll append to root's links can't. skip
                // fallback: append to first root if exists
                if (currentTree.length > 0) { currentTree[0].links = safeArray(currentTree[0].links); currentTree[0].links.push(movedLinkObj); }
            } else {
                const parentNode = loc.parentArray[loc.index]; parentNode.links = safeArray(parentNode.links); parentNode.links.push(movedLinkObj);
            }
            setUnsaved(true); renderTree(currentTree);
        }
    });

    return row;
}

function createLinkRow(link) {
    const row = document.createElement('div'); row.className = 'link-row'; row.style.display = 'flex'; row.style.gap = '6px'; row.style.alignItems = 'center';
    const left = document.createElement('div');
    left.className = 'link-fields'; // ← класс, а не inline-стили

    const title = document.createElement('input');
    title.className = 'link-title';
    title.placeholder = 'Название';
    title.value = link.title || '';
    title.addEventListener('input', debounce(() => {
        link.title = title.value;
        setUnsaved(true);
    }, 300));


    const url = document.createElement('input');
    url.className = 'link-url';
    url.placeholder = 'URL';
    url.value = link.url || '';
    url.addEventListener('input', debounce(() => {
        link.url = url.value;
        setUnsaved(true);
    }, 300));
    url.classList.toggle('invalid', !isValidUrl(url.value));

    left.append(title, url);

    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '6px'; actions.style.alignItems = 'center';
    const btnCut = document.createElement('button'); btnCut.className = 'btn small'; btnCut.textContent = '✂'; btnCut.title = 'Cut link'; btnCut.addEventListener('click', (e) => { e.stopPropagation(); const p = findLinkParent(currentTree, link.id); if (!p) return; movingLink = clone(p.parentNode.links[p.index]); p.parentNode.links.splice(p.index, 1); movingNode = null; setUnsaved(true); renderTree(currentTree); });
    const btnDel = document.createElement('button'); btnDel.className = 'btn small btn-danger'; btnDel.textContent = '🗑'; btnDel.title = 'Delete link'; btnDel.addEventListener('click', (e) => { e.stopPropagation(); const p = findLinkParent(currentTree, link.id); if (!p) return; p.parentNode.links.splice(p.index, 1); setUnsaved(true); renderTree(currentTree); });

    // drag handle for link
    const handle = document.createElement('div'); handle.className = 'drag-handle'; handle.textContent = '≡'; handle.draggable = true; handle.addEventListener('dragstart', (e) => { draggedLinkId = link.id; draggedType = 'link'; try { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'link', id: link.id })); } catch { } e.dataTransfer.effectAllowed = 'move'; handle.classList.add('dragging'); }); handle.addEventListener('dragend', () => { draggedLinkId = null; draggedType = null; handle.classList.remove('dragging'); document.querySelectorAll('.links').forEach(el => el.style.outline = ''); });

    actions.append(btnCut, btnDel, handle);
    row.append(left, actions);

    // allow drop on link-row to reorder links inside same parent or drop before/after
    row.addEventListener('dragover', (e) => {
        e.preventDefault();

        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;

        row.classList.toggle('drop-before', e.clientY < mid);
        row.classList.toggle('drop-after', e.clientY >= mid);
    });

    row.addEventListener('dragleave', () => {
        row.classList.remove('drop-before', 'drop-after');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drop-before', 'drop-after');

        if (draggedType !== 'link' || draggedLinkId === link.id) return;

        const parent = findLinkParent(currentTree, link.id);
        if (!parent) return;

        const rect = row.getBoundingClientRect();
        const insertIndex =
            e.clientY < rect.top + rect.height / 2
                ? parent.index
                : parent.index + 1;

        moveLink(draggedLinkId, parent.parentNode.id, insertIndex);

        setUnsaved(true);
        renderTree(currentTree);
    });

    return row;
}

function renderNode(node, container) {
    if (!node) return;

    const wrap = document.createElement('div');
    wrap.className = 'folder';

    /* ---------- HEADER (folder row) ---------- */
    const header = createNodeRow(node);
    wrap.appendChild(header);

    /* ---------- LINKS + CHILDREN CONTAINER ---------- */
    const linksWrap = document.createElement('div');
    linksWrap.className = 'links';
    linksWrap.style.transition = 'outline .12s ease';

    /* ---------- DRAG OVER (visual hint) ---------- */
    linksWrap.addEventListener('dragover', (e) => {
        e.preventDefault();
        linksWrap.style.outline = '2px dashed rgba(37,99,235,0.12)';
    });

    linksWrap.addEventListener('dragleave', () => {
        linksWrap.style.outline = '';
    });

    /* ---------- DROP ---------- */
    linksWrap.addEventListener('drop', (e) => {
        e.preventDefault();
        linksWrap.style.outline = '';

        let payload = null;
        try {
            payload = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch {
            payload = { type: draggedType, id: draggedNodeId || draggedLinkId };
        }

        if (!payload || !payload.id) return;

        /* ===== DROP FOLDER INTO FOLDER ===== */
        if (payload.type === 'node') {
            if (payload.id === node.id) return;

            const moved = detachNodeById(currentTree, payload.id);
            if (!moved) return;

            const loc = findParentAndIndex(currentTree, node.id);
            if (loc) {
                const target = loc.parentArray[loc.index];
                target.children = safeArray(target.children);
                target.children.push(moved);
            } else {
                currentTree.push(moved);
            }

            setUnsaved(true);
            renderTree(currentTree);
            return;
        }

        /* ===== DROP LINK INTO FOLDER (append) ===== */
        if (payload.type === 'link') {
            if (!node.links) node.links = [];

            moveLink(payload.id, node.id); // ← ВСЕГДА В КОНЕЦ ПАПКИ

            setUnsaved(true);
            renderTree(currentTree);
            return;
        }
    });

    /* ---------- LINKS ---------- */
    const links = safeArray(node.links);
    for (let i = 0; i < links.length; i++) {
        linksWrap.appendChild(createLinkRow(links[i]));
    }

    /* ---------- CHILD FOLDERS ---------- */
    const children = safeArray(node.children);
    for (let i = 0; i < children.length; i++) {
        renderNode(children[i], linksWrap);
    }

    wrap.appendChild(linksWrap);
    container.appendChild(wrap);
}


function renderTree(tree) {
    document.querySelectorAll('.node-row.drop-before,.node-row.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    currentRenderTree = tree; const root = document.getElementById('tree'); if (!root) return; root.innerHTML = ''; if (!Array.isArray(tree) || tree.length === 0) { root.innerHTML = '<div class="empty">Empty tree — add a root folder</div>'; return; }
    let toRender = tree; if (currentQuery && currentQuery.trim()) toRender = filterTree(tree, currentQuery);
    const frag = document.createDocumentFragment();
    safeArray(toRender).forEach(n => renderNode(n, frag));
    root.appendChild(frag);
}

/* ----------------- Controls wiring ----------------- */
function $(id) { return document.getElementById(id); }
const elAddRoot = $('addRoot'); const elSave = $('saveBtn'); const elCancel = $('cancelBtn'); const elExport = $('exportBtn'); const elImport = $('importFile'); const elSort = $('sortBtn'); const elClean = $('cleanBtn'); const elUndo = $('undoBtn'); const elSearch = $('search'); const elClearSearch = $('clearSearch');

elAddRoot.addEventListener('click', () => { currentTree = safeArray(currentTree); currentTree.push({ id: uid(), type: 'folder', title: 'New root', children: [], links: [] }); setUnsaved(true); renderTree(currentTree); });
// === Replace broken elSave handler with this ===
elSave.addEventListener('click', () => {
    const normalized = normalizeTree(currentTree);

    persistToStorage(normalized, () => {
        savedTreeSnapshot = clone(normalized);
        setUnsaved(false);
        alert('Сохранено');
    });
});

elCancel.addEventListener('click', () => { if (!unsaved) return; if (!confirm('Discard unsaved changes?')) return; currentTree = clone(savedTreeSnapshot); setUnsaved(false); renderTree(currentTree); });
elExport.addEventListener('click', () => { const text = JSON.stringify(currentTree, null, 2); const blob = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'linkTree.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
elImport.addEventListener('change', (e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => { try { const parsed = JSON.parse(r.result); const normalized = normalizeTree(parsed); currentTree = normalized; setUnsaved(true); renderTree(currentTree); } catch { alert('Invalid JSON'); } finally { elImport.value = ''; } }; r.readAsText(file); });
elSort.addEventListener('click', () => { sortTreeInPlace(currentTree); setUnsaved(true); renderTree(currentTree); });
elClean.addEventListener('click', () => { currentTree = removeEmptyFolders(currentTree); setUnsaved(true); renderTree(currentTree); });
elUndo.addEventListener('click', () => { loadBackup(backup => { if (!backup || backup.length === 0) { alert('No backup'); return; } if (!confirm('Restore from backup? This will replace current draft.')) return; currentTree = clone(backup); savedTreeSnapshot = clone(backup); setUnsaved(true); renderTree(currentTree); }); });
elSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') { currentQuery = elSearch.value.trim(); renderTree(currentTree); } }); elClearSearch.addEventListener('click', () => { elSearch.value = ''; currentQuery = ''; renderTree(currentTree); });

window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); elSave.click(); } else if (e.key === 'Escape') { if (unsaved) elCancel.click(); } });
window.addEventListener('beforeunload', (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });

/* ----------------- Boot ----------------- */
async function loadInitial() {
    chrome.storage.local.get([STORAGE_KEY], res => {
        const tree = normalizeTree(res[STORAGE_KEY] || []);
        currentTree = clone(tree);
        savedTreeSnapshot = clone(tree);
        setUnsaved(false);
        renderTree(currentTree);
    });
}

loadInitial();

/* End */
