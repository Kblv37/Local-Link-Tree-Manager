import { uid, safeArray, clone, filterTree, findParentAndIndex, findLinkParent, swap } from '../core/tree.js';
import { debounce } from '../utils/debounce.js';
import { t } from '../utils/i18n.js';

const $ = id => document.getElementById(id);

const IC = {
  folder:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  up:       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>',
  down:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>',
  cut:      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  paste:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  addF:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
  addL:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="10" y1="20" x2="14" y2="20"/></svg>',
  trash:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  drag:     '<svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>',
  restore:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>'
};

const _svgCache = new Map();
function svgEl(s) {
  if (!_svgCache.has(s)) {
    const d = document.createElement('div');
    d.innerHTML = s;
    _svgCache.set(s, d.firstElementChild);
  }
  return _svgCache.get(s).cloneNode(true);
}

function mkBtn(svgStr, title_, cls, handler) {
  const b = document.createElement('button');
  b.className = cls || 'icon-btn-sm';
  b.title = title_;
  b.appendChild(svgEl(svgStr));
  b.addEventListener('click', e => { e.stopPropagation(); handler(); });
  return b;
}

let _state        = null;
let _currentTree  = [];
let _currentQuery = '';
let _movingNode   = null;
let _movingLink   = null;
let _unsaved      = false;
let _autosaveTimer= null;
let _dragData     = null;

export function mount(container, state) {
  _state       = state;
  _currentTree = state.tree;
  _wireToolbar(state);
  _wireSettings(state);
  _wireSearch();
  renderTree(_currentTree, '');
}
export function renderTree(tree, query) {
  _currentTree  = tree;
  _currentQuery = query !== undefined ? query : _currentQuery;
  const root = $('tree');
  if (!root) return;
  root.innerHTML = '';
  if (!Array.isArray(tree) || tree.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty';

    const titleEl = document.createElement('div');
    titleEl.className = 'empty-title';
    titleEl.textContent = t('treeEmpty');

    const hintEl = document.createElement('div');
    hintEl.className = 'empty-hint';
    hintEl.textContent = t('noLinksHint');

    const actionsEl = document.createElement('div');
    actionsEl.className = 'empty-actions';

    const addFolderBtn = document.createElement('button');
    addFolderBtn.className = 'empty-btn';
    addFolderBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;
    addFolderBtn.appendChild(document.createTextNode(t('addFolderBtn')));
    addFolderBtn.addEventListener('click', () => {
      _currentTree = safeArray(_currentTree);
      _currentTree.push({ id: uid(), type: 'folder', title: t('newFolder'), children: [], links: [] });
      setUnsaved(true);
      renderTree(_currentTree);
    });

    actionsEl.appendChild(addFolderBtn);
    emptyDiv.append(titleEl, hintEl, actionsEl);
    root.appendChild(emptyDiv);
    return;
  }
  const toRender = _currentQuery.trim() ? filterTree(tree, _currentQuery) : tree;
  const frag = document.createDocumentFragment();

  const rootFolder = toRender.find(n => n.__isRoot);
  if (rootFolder && safeArray(rootFolder.links).length > 0) {
    const section = document.createElement('div');
    section.className = 'root-links-section';
    const label = document.createElement('div');
    label.className = 'root-links-label';
    label.textContent = t('rootLinks') || 'Root Links';
    section.appendChild(label);
    const linksWrap = document.createElement('div');
    linksWrap.className = 'links';
    linksWrap.style.marginLeft = '0';
    for (const link of safeArray(rootFolder.links)) linksWrap.appendChild(_createLinkRow(link));
    section.appendChild(linksWrap);
    frag.appendChild(section);
  }

  for (const n of safeArray(toRender)) {
    if (n.__isRoot) continue;
    _renderNode(n, frag);
  }
  root.appendChild(frag);
}

export function setUnsaved(flag) {
  _unsaved = !!flag;
  const el = $('unsavedIndicator');
  if (el) el.style.display = _unsaved ? 'inline-flex' : 'none';
}

export function setupAutosave(enabled, saveFn) {
  clearInterval(_autosaveTimer); _autosaveTimer = null;
  if (!enabled) return;
  _autosaveTimer = setInterval(() => { if (!_unsaved) return; saveFn(); }, 30000);
}

export function getCurrentTree() { return _currentTree; }
export function isUnsaved()      { return _unsaved; }

function _renderNode(node, container) {
  if (!node) return;
  const wrap = document.createElement('div');
  wrap.className = 'folder';
  wrap.dataset.nodeId = node.id;
  wrap.appendChild(_createNodeRow(node));
  const linksWrap = document.createElement('div');
  linksWrap.className = 'links';
  for (const link of safeArray(node.links)) linksWrap.appendChild(_createLinkRow(link));
  for (const child of safeArray(node.children)) _renderNode(child, linksWrap);
  wrap.appendChild(linksWrap);
  _wireDrag(wrap, 'folder', node.id);
  container.appendChild(wrap);
}

function _createNodeRow(node) {
  const row = document.createElement('div');
  row.className = 'node-row';

  const dh = document.createElement('span');
  dh.className = 'drag-handle';
  dh.appendChild(svgEl(IC.drag));

  const icon = document.createElement('span');
  icon.className = 'node-icon';
  icon.appendChild(svgEl(IC.folder));

  const title = document.createElement('input');
  title.className = 'title-input';
  title.value = node.title || '';
  title.placeholder = t('folderName');
  title.addEventListener('input', debounce(() => {
    const loc = findParentAndIndex(_currentTree, node.id);
    if (loc) { loc.parentArray[loc.index].title = title.value; setUnsaved(true); }
  }, 200));

  const actions = document.createElement('div');
  actions.className = 'node-actions';
  actions.append(
    mkBtn(IC.paste, t('pasteHere'),    'icon-btn-sm', () => {
      const loc = findParentAndIndex(_currentTree, node.id); if (!loc) return;
      const tgt = loc.parentArray[loc.index];
      if (_movingNode) { tgt.children=safeArray(tgt.children); tgt.children.push(clone(_movingNode)); _movingNode=null; }
      else if (_movingLink) { tgt.links=safeArray(tgt.links); tgt.links.push(clone(_movingLink)); _movingLink=null; }
      setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.addF,  t('addSubfolder'), 'icon-btn-sm', () => {
      const loc = findParentAndIndex(_currentTree, node.id); if (!loc) return;
      const tgt = loc.parentArray[loc.index];
      tgt.children=safeArray(tgt.children);
      tgt.children.push({ id:uid(), type:'folder', title:t('newFolder'), children:[], links:[] });
      setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.addL,  t('addLink'),      'icon-btn-sm', () => {
      const loc = findParentAndIndex(_currentTree, node.id); if (!loc) return;
      const tgt = loc.parentArray[loc.index];
      tgt.links=safeArray(tgt.links);
      tgt.links.push({ id:uid(), title:'', url:'', description:'' });
      setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.up,    t('moveUp'),       'icon-btn-sm', () => {
      const loc = findParentAndIndex(_currentTree, node.id); if (!loc||loc.index===0) return;
      swap(loc.parentArray, loc.index, loc.index-1); setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.down,  t('moveDown'),     'icon-btn-sm', () => {
      const loc = findParentAndIndex(_currentTree, node.id); if (!loc||loc.index>=loc.parentArray.length-1) return;
      swap(loc.parentArray, loc.index, loc.index+1); setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.cut,   t('cut'),          'icon-btn-sm', () => {
      const loc = findParentAndIndex(_currentTree, node.id); if (!loc) return;
      _movingNode=clone(loc.parentArray[loc.index]); loc.parentArray.splice(loc.index,1); _movingLink=null;
      setUnsaved(true); renderTree(_currentTree);
    }),
    (() => {
      const b=document.createElement('button'); b.className='icon-btn-sm icon-btn-danger'; b.title=t('deleteFolder2');
      b.appendChild(svgEl(IC.trash));
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm(t('deleteFolder'))) return;
        const loc=findParentAndIndex(_currentTree,node.id); if(!loc) return;
        loc.parentArray.splice(loc.index,1); setUnsaved(true); renderTree(_currentTree);
      });
      return b;
    })()
  );

  row.append(dh, icon, title, actions);
  return row;
}

function _isValidUrl(v) { try { new URL(v); return true; } catch { return false; } }

function _createLinkRow(link) {
  const row = document.createElement('div');
  row.className = 'link-row';
  row.dataset.linkId = link.id;

  const dh = document.createElement('span');
  dh.className = 'drag-handle';
  dh.appendChild(svgEl(IC.drag));

  const fields = document.createElement('div');
  fields.className = 'link-fields';

  const ti = document.createElement('input');
  ti.className = 'link-title';
  ti.placeholder = t('titlePlaceholder');
  ti.value = link.title || '';
  ti.addEventListener('input', debounce(() => { link.title=ti.value; setUnsaved(true); }, 200));

  const ui = document.createElement('input');
  ui.className = 'link-url';
  ui.placeholder = t('urlPlaceholder');
  ui.value = link.url || '';
  ui.classList.toggle('invalid', !!link.url && !_isValidUrl(link.url));
  ui.addEventListener('input', debounce(() => {
    link.url=ui.value; ui.classList.toggle('invalid', !!ui.value && !_isValidUrl(ui.value)); setUnsaved(true);
  }, 200));

  const di = document.createElement('input');
  di.className = 'link-desc';
  di.placeholder = t('descPlaceholder');
  di.value = link.description || '';
  di.addEventListener('input', debounce(() => { link.description=di.value; setUnsaved(true); }, 200));

  fields.append(ti, ui, di);

  const actions = document.createElement('div');
  actions.className = 'link-row-actions';
  actions.append(
    mkBtn(IC.up,    t('moveUp'),   'icon-btn-sm', () => {
      const p=findLinkParent(_currentTree,link.id); if(!p||p.index===0) return;
      swap(p.parentNode.links,p.index,p.index-1); setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.down,  t('moveDown'), 'icon-btn-sm', () => {
      const p=findLinkParent(_currentTree,link.id); if(!p||p.index>=p.parentNode.links.length-1) return;
      swap(p.parentNode.links,p.index,p.index+1); setUnsaved(true); renderTree(_currentTree);
    }),
    mkBtn(IC.cut,   t('cut'),      'icon-btn-sm', () => {
      const p=findLinkParent(_currentTree,link.id); if(!p) return;
      _movingLink=clone(p.parentNode.links[p.index]); p.parentNode.links.splice(p.index,1); _movingNode=null;
      setUnsaved(true); renderTree(_currentTree);
    }),
    (() => {
      const b=document.createElement('button'); b.className='icon-btn-sm icon-btn-danger'; b.title=t('deleteLink');
      b.appendChild(svgEl(IC.trash));
      b.addEventListener('click', e => {
        e.stopPropagation();
        const p=findLinkParent(_currentTree,link.id); if(!p) return;
        p.parentNode.links.splice(p.index,1); setUnsaved(true); renderTree(_currentTree);
      });
      return b;
    })()
  );

  row.append(dh, fields, actions);
  _wireDrag(row, 'link', link.id);
  return row;
}

function _clearDropLines() {
  document.querySelectorAll('.drop-line').forEach(d => d.remove());
}

function _wireDrag(el, type, id) {
  el.draggable = true;
  el.addEventListener('dragstart', e => {
    _dragData = { type, id };
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
    if (type === 'link') e.stopPropagation();
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    _clearDropLines();
  });
  el.addEventListener('dragover', e => {
    if (!_dragData) return;
    e.preventDefault();
    e.stopPropagation();
    _clearDropLines();
    const line = document.createElement('div');
    line.className = 'drop-line';
    el.parentNode.insertBefore(line, el);
  });
  el.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    _clearDropLines();
    if (!_dragData || _dragData.id === id) return;
    _applyDrop(_dragData, { type, id });
    _dragData = null;
  });
}

function _applyDrop(src, target) {
  if (src.type==='folder'&&target.type==='folder') {
    const s=findParentAndIndex(_currentTree,src.id), t2=findParentAndIndex(_currentTree,target.id);
    if(!s||!t2) return;
    const item=s.parentArray.splice(s.index,1)[0];
    const ni=t2.parentArray.findIndex(n=>n.id===target.id);
    t2.parentArray.splice(ni<0?0:ni,0,item);
  } else if (src.type==='link'&&target.type==='link') {
    const s=findLinkParent(_currentTree,src.id), t2=findLinkParent(_currentTree,target.id);
    if(!s||!t2) return;
    const item=s.parentNode.links.splice(s.index,1)[0];
    const ni=t2.parentNode.links.findIndex(l=>l.id===target.id);
    t2.parentNode.links.splice(ni<0?0:ni,0,item);
  } else if (src.type==='link'&&target.type==='folder') {
    const s=findLinkParent(_currentTree,src.id), t2=findParentAndIndex(_currentTree,target.id);
    if(!s||!t2) return;
    const item=s.parentNode.links.splice(s.index,1)[0];
    t2.parentArray[t2.index].links=safeArray(t2.parentArray[t2.index].links);
    t2.parentArray[t2.index].links.push(item);
  }
  setUnsaved(true); renderTree(_currentTree);
}

function _wireToolbar(state) {
  $('addRoot')?.addEventListener('click', () => {
    _currentTree=safeArray(_currentTree);
    _currentTree.push({ id:uid(), type:'folder', title:t('newFolder'), children:[], links:[] });
    setUnsaved(true); renderTree(_currentTree);
  });

  $('addRootLink')?.addEventListener('click', () => {
    _currentTree=safeArray(_currentTree);
    let rootFolder = _currentTree.find(n => n.__isRoot);
    if (!rootFolder) {
      rootFolder = { id: uid(), type: 'folder', title: '__ROOT__', __isRoot: true, children: [], links: [] };
      _currentTree.unshift(rootFolder);
    }
    rootFolder.links = safeArray(rootFolder.links);
    rootFolder.links.push({ id: uid(), title: '', url: '', description: '' });
    setUnsaved(true); renderTree(_currentTree);
  });

  $('saveBtn')?.addEventListener('click',   () => state.onSave());
  $('cancelBtn')?.addEventListener('click', () => state.onCancel());
  $('exportBtn')?.addEventListener('click', () => state.onExport($('exportUnique')?.checked ?? true));
  $('importFile')?.addEventListener('change', e => { const f=e.target.files?.[0]; if(!f) return; state.onImport(f); $('importFile').value=''; });
  $('cleanBtn')?.addEventListener('click',  () => state.onClean());
  $('undoBtn')?.addEventListener('click',   () => state.onUndo());
}

function _wireSettings(state) {
  const treePanel = $('treePanel');
  const s = state.settings;

  const sync = (id, val) => { const el=$(id); if(el) el.checked=val; };
  sync('settingCompact',  !!s.compactMode);
  sync('settingAutosave', !!s.autosave);
  sync('settingFavicons', s.showFavicons!==false);
  sync('settingSaveTabs', !!s.saveTabs);
  sync('settingLayout',   s.layoutCorrection!==false);

  const themeSelect = $('settingTheme');
  if (themeSelect) themeSelect.value = s.theme || 'light';
  themeSelect?.addEventListener('change', e => state.onSettingChange('theme', e.target.value));

  const langSelect = $('settingLang');
  if (langSelect) langSelect.value = s.language || 'en';
  langSelect?.addEventListener('change', e => state.onSettingChange('language', e.target.value));

  const scaleValEl = $('settingScaleVal');
  let _popupScale = s.uiScale ?? 100;
  if (scaleValEl) scaleValEl.textContent = `${_popupScale}%`;

  $('scalePopupDec')?.addEventListener('click', () => {
    _popupScale = Math.max(80, _popupScale - 5);
    if (scaleValEl) scaleValEl.textContent = `${_popupScale}%`;
    state.onSettingChange('uiScale', _popupScale);
  });
  $('scalePopupInc')?.addEventListener('click', () => {
    _popupScale = Math.min(160, _popupScale + 5);
    if (scaleValEl) scaleValEl.textContent = `${_popupScale}%`;
    state.onSettingChange('uiScale', _popupScale);
  });

  const optScaleValEl = $('settingOptionsScaleVal');
  let _optScale = s.optionsScale ?? 115;
  if (optScaleValEl) optScaleValEl.textContent = `${_optScale}%`;

  $('scaleOptDec')?.addEventListener('click', () => {
    _optScale = Math.max(80, _optScale - 5);
    if (optScaleValEl) optScaleValEl.textContent = `${_optScale}%`;
    state.onSettingChange('optionsScale', _optScale);
  });
  $('scaleOptInc')?.addEventListener('click', () => {
    _optScale = Math.min(160, _optScale + 5);
    if (optScaleValEl) optScaleValEl.textContent = `${_optScale}%`;
    state.onSettingChange('optionsScale', _optScale);
  });

  $('settingCompact')?.addEventListener('change',  e => state.onSettingChange('compactMode', e.target.checked));
  $('settingAutosave')?.addEventListener('change', e => state.onSettingChange('autosave', e.target.checked));
  $('settingFavicons')?.addEventListener('change', e => state.onSettingChange('showFavicons', e.target.checked));
  $('settingSaveTabs')?.addEventListener('change', e => state.onSettingChange('saveTabs', e.target.checked));
  $('settingLayout')?.addEventListener('change',   e => state.onSettingChange('layoutCorrection', e.target.checked));

  $('exportSettings')?.addEventListener('click', () => state.onExportSettings?.());
  $('importSettings')?.addEventListener('change', e => { const f=e.target.files?.[0]; if(!f) return; state.onImportSettings?.(f); $('importSettings').value=''; });
}

function _wireSearch() {
  $('search')?.addEventListener('input', debounce(() => {
    _currentQuery=$('search').value.trim(); renderTree(_currentTree);
  }, 200));
  $('clearSearch')?.addEventListener('click', () => {
    $('search').value=''; _currentQuery=''; renderTree(_currentTree);
  });
}

export function renderSavedTabsPanel(sessions, onRestore, onDelete, onExport) {
  const panel = $('savedTabsPanel');
  if (!panel) return;
  panel.innerHTML = '';

  if (!sessions || sessions.length === 0) {
    panel.innerHTML = `<div class="empty" style="padding:16px">${t('noTabSessions')}</div>`;
    return;
  }

  for (const session of sessions) {
    const item = document.createElement('div');
    item.className = 'tab-session-item';

    const header = document.createElement('div');
    header.className = 'tab-session-header';

    const title = document.createElement('span');
    title.className = 'tab-session-title';
    title.textContent = `${session.title} · ${t('tabsCount', session.tabs.length)}`;

    const date = document.createElement('span');
    date.className = 'tab-session-date';
    date.textContent = session.date;

    const btns = document.createElement('div');
    btns.className = 'tab-session-btns';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-sm';
    restoreBtn.textContent = t('restore');
    restoreBtn.addEventListener('click', () => onRestore(session));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger-sm';
    delBtn.textContent = '×';
    delBtn.title = t('deleteSession');
    delBtn.addEventListener('click', () => onDelete(session.id));

    btns.append(restoreBtn, delBtn);
    header.append(title, date, btns);
    item.appendChild(header);

    const tabList = document.createElement('div');
    tabList.className = 'tab-list';
    tabList.style.display = 'none';
    for (const tab of session.tabs) {
      const tabItem = document.createElement('div');
      tabItem.className = 'tab-item';
      tabItem.textContent = tab.title || tab.url;
      tabItem.title = tab.url;
      tabList.appendChild(tabItem);
    }
    title.style.cursor = 'pointer';
    title.addEventListener('click', () => {
      tabList.style.display = tabList.style.display === 'none' ? 'block' : 'none';
    });
    item.appendChild(tabList);
    panel.appendChild(item);
  }

  if (onExport) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-sm';
    exportBtn.style.marginTop = '8px';
    exportBtn.textContent = t('exportTabsTxt');
    exportBtn.addEventListener('click', onExport);
    panel.appendChild(exportBtn);
  }
}