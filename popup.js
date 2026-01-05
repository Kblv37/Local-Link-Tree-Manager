const STORAGE_KEY = 'linkTree';
const safeArray = v => Array.isArray(v) ? v : [];
const collapsed = new Set();

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
  try { chrome.tabs.create({ url }); } catch { window.open(url, '_blank'); }
}

/* render one folder node recursively */
function renderNode(node, container, query) {
  if (!node) return;

  const folder = document.createElement('div');
  folder.className = 'folder';

  // header row (clickable)
  const row = document.createElement('div');
  row.className = 'folder-row';

  // folder icon (мини-маркер)
  const ficon = document.createElement('div');
  ficon.className = 'folder-icon';
  ficon.textContent = '📁';

  // collapse toggle (secondary)
  const toggle = document.createElement('button');
  toggle.className = 'fold-toggle';
  toggle.textContent = collapsed.has(node.id) ? '▶' : '▼';


  // name container (click on it or on row toggles)
  const name = document.createElement('div');
  name.className = 'fold-name';
  name.textContent = node.title || 'Без названия';

  // clicking row toggles collapse (except clicks on child interactive elements)
  row.addEventListener('click', (e) => {
    // If click came from a link action (we stopPropagation there), this won't run.
    if (collapsed.has(node.id)) collapsed.delete(node.id);
    else collapsed.add(node.id);
    renderTree(currentTree, currentQuery);
  });

  // assemble header: icon, toggle, name
  // Put icon first so user sees folder marker
  row.appendChild(ficon);
  row.appendChild(toggle);
  row.appendChild(name);
  folder.appendChild(row);

  // children wrapper (links + subfolders)
  const childrenWrap = document.createElement('div');
  childrenWrap.className = 'links';
  if (collapsed.has(node.id)) childrenWrap.style.display = 'none';

  // links
  safeArray(node.links).forEach(link => {
    if (!link || (!link.url && !link.title)) return;

    // search filter
    if (query) {
      const q = query.toLowerCase();
      if (!((link.title || '').toLowerCase().includes(q) || (link.url || '').toLowerCase().includes(q))) {
        return;
      }
    }

    const linkEl = document.createElement('div');
    linkEl.className = 'link';
    // click on whole row opens link
    linkEl.addEventListener('click', () => openLink(link.url));
    // ensure clicks on actions don't bubble to linkEl
    linkEl.addEventListener('auxclick', (e) => e.stopPropagation());

    const fav = document.createElement('img');
    fav.className = 'favicon';
    const favUrl = getFavicon(link.url);
    if (favUrl) {
      fav.src = favUrl;
      // hide image on error
      fav.addEventListener('error', () => fav.remove());
    } else {
      fav.remove(); // no favicon available
    }

    const content = document.createElement('div');
    content.className = 'link-content';
    const title = document.createElement('div');
    title.className = 'link-title';
    title.textContent = link.title || link.url || '—';
    const sub = document.createElement('div');
    sub.className = 'link-sub';
    sub.textContent = link.url || '';
    content.appendChild(title);
    content.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'link-actions';

    // copy button — stop propagation so row click doesn't trigger
    const copy = document.createElement('button');
    copy.className = 'small-btn';
    copy.textContent = '⧉';
    copy.title = 'Копировать URL';
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      try { navigator.clipboard.writeText(link.url || ''); } catch {
        const ta = document.createElement('textarea');
        ta.value = link.url || '';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    });

    // open icon button (optional, duplicates row click) — stop propagation then open
    const openBtn = document.createElement('button');
    openBtn.className = 'small-btn';
    openBtn.textContent = '⤴';
    openBtn.title = 'Открыть';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLink(link.url);
    });

    actions.appendChild(openBtn);
    actions.appendChild(copy);

    // append elements (favicon may be removed)
    if (fav && fav.parentElement === null && fav.src) linkEl.appendChild(fav);
    linkEl.appendChild(content);
    linkEl.appendChild(actions);

    childrenWrap.appendChild(linkEl);
  });

  // subfolders (recursion)
  safeArray(node.children).forEach(child => {
    renderNode(child, childrenWrap, query);
  });

  folder.appendChild(childrenWrap);
  container.appendChild(folder);
}

let currentTree = [];
let currentQuery = '';

function renderTree(tree, query = '') {
  currentTree = Array.isArray(tree) ? tree : [];
  currentQuery = query || '';
  const root = document.getElementById('tree');
  root.innerHTML = '';

  if (currentTree.length === 0) {
    root.innerHTML = `<div class="empty">Нет сохранённых ссылок</div>`;
    return;
  }

  safeArray(currentTree).forEach(n => {
    // if searching — skip root nodes without matches
    if (currentQuery) {
      const q = currentQuery.toLowerCase();
      const nodeMatches = (node) => {
        if (!node) return false;
        if ((node.title || '').toLowerCase().includes(q)) return true;
        if (safeArray(node.links).some(l => (((l?.title||'') + ' ' + (l?.url||'')).toLowerCase().includes(q)))) return true;
        return safeArray(node.children).some(c => nodeMatches(c));
      };
      if (!nodeMatches(n)) return;
    }
    renderNode(n, root, currentQuery);
  });
}

async function loadAndRender(query = '') {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  const tree = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
  renderTree(tree, query);
}

/* wiring */
document.getElementById('openOptions').addEventListener('click', () => {
  try { chrome.runtime.openOptionsPage(); } catch { window.open('options.html', '_blank'); }
});

const searchEl = document.getElementById('popupSearch');
let timer = null;
searchEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => loadAndRender(searchEl.value.trim()), 200);
});

// initial load
loadAndRender();

// hotkeys (popup only)
document.addEventListener('keydown', (e) => {
  // Ctrl + Q / Cmd + Q → фокус в поиск
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
    return;
  }

  // Esc → очистить поиск и вернуть дерево
  if (e.key === 'Escape') {
    if (document.activeElement === searchEl) {
      searchEl.value = '';
      searchEl.blur();
      loadAndRender('');
    }
  }
});

window.addEventListener('load', () => {
  searchEl.value = '';
  loadAndRender('');
  searchEl.focus();
  searchEl.select();
});