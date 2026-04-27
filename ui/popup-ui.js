import { filterTree, safeArray, countLinks, findNode, findParentAndIndex, findLinkParent } from '../core/tree.js';
import { getFaviconUrl } from '../utils/favicon.js';
import { debounce } from '../utils/debounce.js';
import { t } from '../utils/i18n.js';
import { filterTreeWithLayout } from '../utils/layout.js';
import { saveCollapsed, saveTree, getCachedTree } from '../storage/storage.js';

const _svgCache = new Map();
function svgEl(s) {
  if (!_svgCache.has(s)) {
    const d = document.createElement('div');
    d.innerHTML = s;
    _svgCache.set(s, d.firstElementChild);
  }
  return _svgCache.get(s).cloneNode(true);
}

const IC = {
  folder:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  chevD:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>',
  chevR:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
  openAll: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  copy:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  back:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
  link:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  home:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
};

let _mounted          = false;
let _treeEl           = null;
let _searchEl         = null;
let _descPanel        = null;
let _collapsed        = new Set();
let _cachedTree       = [];
let _query            = '';
let _layoutCorrection = true;
let _onSavePage       = null;
let _onSaveTabs       = null;
let _navIndex         = -1;
let _navItems         = [];
let _descTimer        = null;
let _dragData         = null;

const _saveCollapsedD = debounce((ids) => saveCollapsed(ids), 500);

const _searchDebounced = debounce(() => {
  _query = _searchEl ? _searchEl.value.trim() : '';
  _doRender();
}, 120);

export function mount(container, state) {
  if (_mounted) {
    _cachedTree       = state.tree;
    _collapsed        = state.collapsed instanceof Set ? state.collapsed : new Set(state.collapsed);
    _layoutCorrection = (state.settings || {}).layoutCorrection !== false;
    _onSavePage       = state.onSavePage;
    _onSaveTabs       = state.onSaveTabs;
    _doRender();
    return;
  }
  _mounted = true;

  _treeEl           = container;
  _collapsed        = state.collapsed instanceof Set ? state.collapsed : new Set(state.collapsed);
  _cachedTree       = state.tree;
  _layoutCorrection = (state.settings || {}).layoutCorrection !== false;
  _onSavePage       = state.onSavePage;
  _onSaveTabs       = state.onSaveTabs;

  _searchEl  = document.getElementById('popupSearch');
  _descPanel = document.getElementById('descPanel');

  _treeEl.addEventListener('click', _handleTreeClick);

  document.getElementById('toggleAll')?.addEventListener('click', _handleToggleAll);
  document.getElementById('openOptions')?.addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); } catch { window.open('options.html', '_blank'); }
  });
  document.getElementById('savePageBtn')?.addEventListener('click', _showSavePageUI);
  document.getElementById('saveTabsBtn')?.addEventListener('click', () => _onSaveTabs?.());

  if (_searchEl) _searchEl.addEventListener('input', _searchDebounced);

  document.addEventListener('keydown', _handleKeydown);
  _doRender();
}

export function focusSearch() {
  if (_searchEl) { _searchEl.focus(); _searchEl.select(); }
}

export function updateCachedTree(tree) {
  _cachedTree = tree;
  _doRender();
}

export function renderTree(list, query, collapsed) {
  if (collapsed !== undefined)
    _collapsed = collapsed instanceof Set ? collapsed : new Set(collapsed);
  if (query !== undefined) _query = query;

  _treeEl.innerHTML = '';
  _resetNav();

  const nodes = (list && list.length > 0) ? list : safeArray(_cachedTree);
  if (!nodes.length) { _renderEmpty(); return; }

  const frag = document.createDocumentFragment();
  for (const node of nodes) _renderNode(node, frag);
  _treeEl.appendChild(frag);
}

function _doRender() {
  if (_descPanel) { _descPanel.style.display = 'none'; clearTimeout(_descTimer); }

  let list;
  if (_query) {
    list = _layoutCorrection
      ? filterTreeWithLayout(_cachedTree, _query, filterTree)
      : filterTree(_cachedTree, _query);
  } else {
    list = safeArray(_cachedTree);
  }

  _treeEl.innerHTML = '';
  _resetNav();

  if (!list.length) { _renderEmpty(); return; }

  const frag = document.createDocumentFragment();

  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node.__isRoot) {
      const links = node.links;
      if (links) {
        for (let j = 0; j < links.length; j++) {
          const link = links[j];
          if (link && (link.url || link.title)) frag.appendChild(_renderLink(link));
        }
      }
    } else {
      _renderNode(node, frag);
    }
  }

  _treeEl.appendChild(frag);
}

function _renderEmpty() {
  const wrap = document.createElement('div');
  wrap.className = 'empty';

  const title = document.createElement('div');
  title.className = 'empty-title';
  title.textContent = t('noLinks');

  const hint = document.createElement('div');
  hint.className = 'empty-hint';
  hint.textContent = t('noLinksHint');

  const actions = document.createElement('div');
  actions.className = 'empty-actions';

  const btn = document.createElement('button');
  btn.className = 'empty-btn';
  btn.appendChild(svgEl(IC.folder));
  btn.appendChild(document.createTextNode(t('addFolderBtn')));
  btn.addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); } catch { window.open('options.html', '_blank'); }
  });

  actions.appendChild(btn);
  wrap.append(title, hint, actions);
  _treeEl.appendChild(wrap);
}

function _renderNode(node, container) {
  if (!node) return;

  const folder = document.createElement('div');
  folder.className = 'folder';
  folder.dataset.folderId = node.id;

  const row = document.createElement('div');
  row.className = 'folder-row';
  row.dataset.action = 'toggle-folder';
  row.dataset.id = node.id;

  const fi = document.createElement('span');
  fi.className = 'folder-icon';
  fi.appendChild(svgEl(IC.folder));

  const arrow = document.createElement('span');
  arrow.className = 'fold-toggle';
  arrow.innerHTML = _collapsed.has(node.id) ? IC.chevR : IC.chevD;

  const name = document.createElement('span');
  name.className = 'fold-name';
  name.textContent = node.title || t('untitled');

  const lc = countLinks(node);
  if (lc > 0) {
    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.textContent = lc;
    name.appendChild(badge);
  }

  const oaBtn = document.createElement('button');
  oaBtn.className = 'icon-action-btn';
  oaBtn.title = t('openAll');
  oaBtn.dataset.action = 'open-all';
  oaBtn.dataset.id = node.id;
  oaBtn.appendChild(svgEl(IC.openAll));

  row.append(fi, arrow, name, oaBtn);
  folder.appendChild(row);

  const wrap = document.createElement('div');
  wrap.className = 'links';
  if (_collapsed.has(node.id)) wrap.hidden = true;

  const links = node.links;
  if (links) {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (link && (link.url || link.title)) wrap.appendChild(_renderLink(link));
    }
  }

  const children = node.children;
  if (children) {
    for (let i = 0; i < children.length; i++) _renderNode(children[i], wrap);
  }

  folder.appendChild(wrap);
  _wireDrag(folder, 'folder', node.id);
  container.appendChild(folder);
}

function _renderLink(link) {
  const el = document.createElement('div');
  el.className = 'link';
  el.tabIndex = -1;
  el.dataset.action = 'open-link';
  el.dataset.url = link.url || '';
  el.dataset.linkId = link.id;

  const favUrl = getFaviconUrl(link.url);
  if (favUrl) {
    const fav = document.createElement('img');
    fav.className = 'favicon';
    fav.src = favUrl;
    fav.alt = '';
    fav.addEventListener('error', () => fav.remove(), { once: true });
    el.appendChild(fav);
  } else {
    const li = document.createElement('span');
    li.className = 'link-icon';
    li.appendChild(svgEl(IC.link));
    el.appendChild(li);
  }

  const content = document.createElement('div');
  content.className = 'link-content';

  const titleEl = document.createElement('div');
  titleEl.className = 'link-title';
  titleEl.textContent = link.title || link.url || '—';

  const subEl = document.createElement('div');
  subEl.className = 'link-sub';
  subEl.textContent = link.url || '';

  content.append(titleEl, subEl);

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'icon-action-btn';
  openBtn.title = t('openNewTab');
  openBtn.dataset.action = 'open-link';
  openBtn.dataset.url = link.url || '';
  openBtn.appendChild(svgEl(IC.openAll));

  const openCurBtn = document.createElement('button');
  openCurBtn.className = 'icon-action-btn';
  openCurBtn.title = t('openCurTab');
  openCurBtn.dataset.action = 'open-current';
  openCurBtn.dataset.url = link.url || '';
  openCurBtn.appendChild(svgEl(IC.back));

  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-action-btn';
  copyBtn.title = t('copyUrl');
  copyBtn.dataset.action = 'copy-url';
  copyBtn.dataset.url = link.url || '';
  copyBtn.appendChild(svgEl(IC.copy));

  actions.append(openBtn, openCurBtn, copyBtn);
  el.append(content, actions);

  if (link.description) {
    el.addEventListener('mouseenter', () => {
      clearTimeout(_descTimer);
      _descTimer = setTimeout(() => _showDesc(link), 2000);
    });
    el.addEventListener('mouseleave', () => clearTimeout(_descTimer));
  }

  _wireDrag(el, 'link', link.id);
  return el;
}


function _showDesc(link) {
  if (!_descPanel) return;
  let label = _descPanel.querySelector('.desc-label');
  let text  = _descPanel.querySelector('.desc-text');
  if (!label) {
    label = document.createElement('div');
    label.className = 'desc-label';
    label.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:3px';
    text = document.createElement('div');
    text.className = 'desc-text';
    _descPanel.append(label, text);
  }
  label.textContent = t('description');
  text.textContent  = link.description;
  _descPanel.style.display = 'block';
  clearTimeout(_descPanel._hideTimer);
  _descPanel._hideTimer = setTimeout(() => { _descPanel.style.display = 'none'; }, 5000);
}

function _showSavePageUI() {
  const overlay = document.getElementById('savePageOverlay');
  if (!overlay) return;

  const titleInput = document.getElementById('savePageTitleInput');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (titleInput && tabs?.[0]) titleInput.value = tabs[0].title || tabs[0].url || '';
  });

  const folderList = document.getElementById('savePageFolderList');
  if (!folderList) return;
  folderList.innerHTML = '';

  const frag = document.createDocumentFragment();

  const rootItem = document.createElement('div');
  rootItem.className = 'sp-folder-item sp-root selected';
  rootItem.dataset.folderId = '';
  const rootIcon = document.createElement('span');
  rootIcon.className = 'sp-folder-icon';
  rootIcon.appendChild(svgEl(IC.home));
  const rootLabel = document.createElement('span');
  rootLabel.textContent = t('savePageRoot');
  rootItem.append(rootIcon, rootLabel);
  frag.appendChild(rootItem);

  function addItems(nodes, depth) {
    if (!nodes) return;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n || n.__isRoot) continue;
      const item = document.createElement('div');
      item.className = 'sp-folder-item';
      item.dataset.folderId = n.id;
      item.style.paddingLeft = `${12 + depth * 14}px`;
      const icon = document.createElement('span');
      icon.className = 'sp-folder-icon';
      icon.appendChild(svgEl(IC.folder));
      const lbl = document.createElement('span');
      lbl.textContent = n.title || t('untitled');
      item.append(icon, lbl);
      frag.appendChild(item);
      if (n.children && n.children.length) addItems(n.children, depth + 1);
    }
  }
  addItems(_cachedTree, 0);
  folderList.appendChild(frag);

  folderList.onclick = (e) => {
    const item = e.target.closest('.sp-folder-item');
    if (!item) return;
    folderList.querySelector('.selected')?.classList.remove('selected');
    item.classList.add('selected');
  };

  overlay.style.display = 'flex';

  const confirmBtn = document.getElementById('savePageConfirm');
  const cancelBtn  = document.getElementById('savePageCancelBtn');
  const newConfirm = confirmBtn?.cloneNode(true);
  const newCancel  = cancelBtn?.cloneNode(true);
  confirmBtn?.parentNode?.replaceChild(newConfirm, confirmBtn);
  cancelBtn?.parentNode?.replaceChild(newCancel, cancelBtn);

  newConfirm?.addEventListener('click', async () => {
    overlay.style.display = 'none';
    const sel = folderList.querySelector('.selected');
    const folderId = sel?.dataset.folderId || null;
    const customTitle = document.getElementById('savePageTitleInput')?.value?.trim() || null;
    await _onSavePage?.(folderId, customTitle);
  }, { once: true });

  newCancel?.addEventListener('click', () => { overlay.style.display = 'none'; }, { once: true });
}

function _handleTreeClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  e.stopPropagation();
  const { action, id, url } = actionEl.dataset;
  switch (action) {
    case 'toggle-folder': _toggleFolder(id); break;
    case 'open-link':     _openLink(url, true); break;
    case 'open-current':  _openLink(url, false); break;
    case 'copy-url':      _copyUrl(url); break;
    case 'open-all':      _openAll(id); break;
  }
}

function _toggleFolder(id) {
  const folderEl = _treeEl.querySelector(`[data-folder-id="${id}"]`);
  if (!folderEl) return;

  let wrap = null;
  for (const child of folderEl.children) {
    if (child.classList.contains('links')) { wrap = child; break; }
  }
  const arrow = folderEl.firstElementChild?.querySelector('.fold-toggle');

  if (_collapsed.has(id)) {
    _collapsed.delete(id);
    if (wrap)  wrap.hidden = false;
    if (arrow) arrow.innerHTML = IC.chevD;
  } else {
    _collapsed.add(id);
    if (wrap)  wrap.hidden = true;
    if (arrow) arrow.innerHTML = IC.chevR;
  }
  _saveCollapsedD([..._collapsed]);
}

function _handleToggleAll() {
  const all = _treeEl.querySelectorAll('[data-folder-id]');
  const shouldCollapse = _collapsed.size === 0;

  for (const f of all) {
    const id = f.dataset.folderId;
    let wrap = null;
    for (const child of f.children) {
      if (child.classList.contains('links')) { wrap = child; break; }
    }
    const arrow = f.firstElementChild?.querySelector('.fold-toggle');

    if (shouldCollapse) {
      _collapsed.add(id);
      if (wrap)  wrap.hidden = true;
      if (arrow) arrow.innerHTML = IC.chevR;
    } else {
      _collapsed.delete(id);
      if (wrap)  wrap.hidden = false;
      if (arrow) arrow.innerHTML = IC.chevD;
    }
  }
  _saveCollapsedD([..._collapsed]);
}

function _openLink(url, newTab = true) {
  if (!url) return;
  if (newTab) { try { chrome.tabs.create({ url }); } catch { window.open(url, '_blank'); } }
  else        { try { chrome.tabs.update({ url }); } catch { window.location.href = url; } }
}

function _copyUrl(url) {
  const text = url || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => _fbCopy(text));
  } else {
    _fbCopy(text);
  }
}

function _fbCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
}

function _openAll(folderId) {
  const node = findNode(_cachedTree, folderId);
  if (!node) return;
  const links = node.links;
  if (!links || !links.length) { alert(t('noLinks')); return; }
  const valid = [];
  for (let i = 0; i < links.length; i++) {
    if (links[i]?.url) valid.push(links[i].url);
  }
  if (!valid.length) { alert(t('noLinks')); return; }
  if (valid.length > 6 && !confirm(`${t('openAll')}: ${valid.length}?`)) return;
  for (let i = 0; i < valid.length; i++) _openLink(valid[i], true);
}

function _updateNavItems() {
  _navItems = Array.from(_treeEl.querySelectorAll('.links:not([hidden]) .link'));
}

function _setNavFocus(index) {
  if (_navItems.length === 0) { _navIndex = -1; return; }
  if (_navIndex >= 0 && _navIndex < _navItems.length)
    _navItems[_navIndex].classList.remove('kb-focused');

  if (index < 0) index = _navItems.length - 1;
  else if (index >= _navItems.length) index = 0;

  _navIndex = index;
  _navItems[_navIndex].classList.add('kb-focused');
  _navItems[_navIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function _resetNav() { _navIndex = -1; _navItems = []; }

function _handleKeydown(e) {
  const inSearch = document.activeElement === _searchEl;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    _updateNavItems();
    if (!_navItems.length) return;
    _setNavFocus(e.key === 'ArrowDown' ? _navIndex + 1 : _navIndex - 1);
    return;
  }
  if (e.key === 'Enter') {
    if (_navIndex >= 0 && _navItems[_navIndex]) {
      e.preventDefault();
      _openLink(_navItems[_navIndex].dataset.url, true);
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    if (_navIndex >= 0 && _navItems[_navIndex]) {
      e.preventDefault();
      _openLink(_navItems[_navIndex].dataset.url, false);
    }
    return;
  }
  if (e.altKey && e.key.toLowerCase() === 'q') { e.preventDefault(); focusSearch(); return; }
  if (e.key === 'Escape') {
    if (inSearch && _searchEl) {
      _searchEl.value = '';
      _searchEl.blur();
      _query = '';
      _doRender();
    } else {
      if (_navIndex >= 0 && _navIndex < _navItems.length)
        _navItems[_navIndex].classList.remove('kb-focused');
      _navIndex = -1;
    }
  }
}

function _wireDrag(el, type, id) {
  el.draggable = true;

  el.addEventListener('dragstart', (e) => {
    _dragData = { type, id };
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
    if (type === 'link') e.stopPropagation();
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    _clearDropIndicators();
  });

  el.addEventListener('dragover', (e) => {
    if (!_dragData) return;
    e.preventDefault();
    e.stopPropagation();
    _clearDropIndicators();
    const ind = document.createElement('div');
    ind.className = 'drop-indicator';
    el.parentNode.insertBefore(ind, el);
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _clearDropIndicators();
    if (!_dragData || _dragData.id === id) return;
    _handleDrop(_dragData, { type, id });
    _dragData = null;
  });
}

function _clearDropIndicators() {
  const inds = _treeEl.querySelectorAll('.drop-indicator');
  for (const d of inds) d.remove();
}

function _handleDrop(src, target) {
  const tree = getCachedTree();

  if (src.type === 'folder' && target.type === 'folder') {
    const s  = findParentAndIndex(tree, src.id);
    const t2 = findParentAndIndex(tree, target.id);
    if (!s || !t2) return;
    const item = s.parentArray.splice(s.index, 1)[0];
    const ni   = t2.parentArray.findIndex(n => n.id === target.id);
    t2.parentArray.splice(ni < 0 ? 0 : ni, 0, item);

  } else if (src.type === 'link' && target.type === 'link') {
    const s  = findLinkParent(tree, src.id);
    const t2 = findLinkParent(tree, target.id);
    if (!s || !t2) return;
    const item = s.parentNode.links.splice(s.index, 1)[0];
    const ni   = t2.parentNode.links.findIndex(l => l.id === target.id);
    t2.parentNode.links.splice(ni < 0 ? 0 : ni, 0, item);

  } else if (src.type === 'link' && target.type === 'folder') {
    const s  = findLinkParent(tree, src.id);
    const t2 = findParentAndIndex(tree, target.id);
    if (!s || !t2) return;
    const item = s.parentNode.links.splice(s.index, 1)[0];
    const tgtNode = t2.parentArray[t2.index];
    tgtNode.links = tgtNode.links || [];
    tgtNode.links.push(item);
  }

  saveTree(tree).then(() => { _cachedTree = tree; _doRender(); });
}