import { loadAll } from './storage/storage.js';
import { safeArray } from './core/tree.js';
import { getFaviconUrl } from './utils/favicon.js';
import { setLanguage, t } from './utils/i18n.js';
import { applySettingsToDOM } from './core/settings.js';
import { filterTreeWithLayout } from './utils/layout.js';
import { filterTree } from './core/tree.js';

let _tree     = [];
let _settings = {};
let _navIndex = -1;
let _navItems = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { tree, settings } = await loadAll();
    _tree     = tree     || [];
    _settings = settings || {};

    setLanguage(_settings.language || 'ru');
    applySettingsToDOM(_settings);

    const input = document.getElementById('searchInput');
    if (input) {
        input.focus();
        input.addEventListener('input', () => _render(input.value.trim()));
        input.addEventListener('keydown', _onKeydown);
    }

    _render('');
});

function _search(query) {
    const results = [];
    const isDeep  = (query.startsWith('..') || query.startsWith('\\\\') || query.startsWith('//')) && _settings.nestedLinksSearch !== false;
    const needle  = isDeep
        ? query.slice(2).toLowerCase().trim()
        : query.toLowerCase().trim();

    function matchLink(link) {
        if (!needle) return true;
        return ((link.title || '') + (link.url || '') + (link.description || ''))
            .toLowerCase().includes(needle);
    }

    function collectLinks(links, breadcrumb) {
        for (const link of safeArray(links)) {
            if (!link) continue;
            if (matchLink(link)) {
                results.push({ link, breadcrumb: breadcrumb.slice() });
            }
            if (isDeep && Array.isArray(link.children) && link.children.length > 0) {
                collectLinks(link.children, [...breadcrumb, link.title || link.url || '']);
            }
        }
    }

    function walkNodes(nodes, path) {
        for (const node of safeArray(nodes)) {
            if (!node) continue;
            const nodePath = node.__isRoot ? path : [...path, node.title || ''];
            collectLinks(safeArray(node.links), nodePath);
            walkNodes(safeArray(node.children), nodePath);
        }
    }

    walkNodes(_tree, []);
    return results;
}

function _render(query) {
    const resultsEl = document.getElementById('results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '';
    _navIndex = -1;
    _navItems = [];

    const items = _search(query);

    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'results-empty';
        empty.textContent = query ? 'No results found' : 'No saved links';
        resultsEl.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    for (const item of items) {
        frag.appendChild(_renderItem(item));
    }
    resultsEl.appendChild(frag);

    _navItems = Array.from(resultsEl.querySelectorAll('.result-item'));
}

function _renderItem(item) {
    const { link, breadcrumb } = item;

    const el = document.createElement('div');
    el.className = 'result-item';
    el.tabIndex  = -1;
    el.dataset.url = link.url || '';

    const favUrl = getFaviconUrl(link.url);
    if (favUrl) {
        const img = document.createElement('img');
        img.className = 'result-favicon';
        img.src = favUrl;
        img.alt = '';
        img.addEventListener('error', () => img.remove(), { once: true });
        el.appendChild(img);
    } else {
        const icon = document.createElement('span');
        icon.className = 'result-icon';
        icon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
        el.appendChild(icon);
    }

    const content = document.createElement('div');
    content.className = 'result-content';

    if (breadcrumb && breadcrumb.length > 0) {
        const crumb = document.createElement('div');
        crumb.className = 'result-crumb';
        crumb.textContent = breadcrumb.join(' › ');
        content.appendChild(crumb);
    }

    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = link.title || link.url || '—';

    const url = document.createElement('div');
    url.className = 'result-url';
    url.textContent = link.url || '';

    content.append(title, url);
    el.appendChild(content);

    el.addEventListener('click', (e) => {
        _openUrl(link.url, !e.shiftKey);
    });

    return el;
}

function _onKeydown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        window.close();
        return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!_navItems.length) return;

        if (_navIndex >= 0 && _navIndex < _navItems.length) {
            _navItems[_navIndex].classList.remove('focused');
        }

        if (e.key === 'ArrowDown') {
            _navIndex = _navIndex < _navItems.length - 1 ? _navIndex + 1 : 0;
        } else {
            _navIndex = _navIndex > 0 ? _navIndex - 1 : _navItems.length - 1;
        }

        _navItems[_navIndex].classList.add('focused');
        _navItems[_navIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        if (_navIndex >= 0 && _navItems[_navIndex]) {
            const url = _navItems[_navIndex].dataset.url;
            _openUrl(url, !e.shiftKey);
        } else if (_navItems.length > 0) {
            _openUrl(_navItems[0].dataset.url, !e.shiftKey);
        }
        return;
    }
}

function _openUrl(url, newTab) {
    if (!url) return;
    if (newTab) {
        chrome.tabs.create({ url });
    } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                chrome.tabs.update(tabs[0].id, { url });
            } else {
                chrome.tabs.create({ url });
            }
        });
    }
    window.close();
}
