import { loadAll, saveTree, saveSavedTabs, getCachedTree, getCachedSavedTabs } from './storage/storage.js';
import { applySettingsToDOM } from './core/settings.js';
import { mount, focusSearch, updateCachedTree } from './ui/popup-ui.js';
import { prewarmFavicons, configureFavicons, loadFaviconCache } from './utils/favicon.js';
import { uid, clone } from './core/tree.js';
import { setLanguage, t, applyI18nToDOM } from './utils/i18n.js';

window.addEventListener('load', async () => {
    const searchEl = document.getElementById('popupSearch');
    if (searchEl) searchEl.value = '';

    const { tree, settings, collapsed, savedTabs } = await loadAll();

    setLanguage(settings.language || 'ru');
    applySettingsToDOM(settings);
    configureFavicons(settings);
    loadFaviconCache();
    prewarmFavicons(tree);

    const saveTabsBtnEl = document.getElementById('saveTabsBtn');
    if (saveTabsBtnEl) saveTabsBtnEl.style.display = settings.saveTabs ? '' : 'none';

    applyI18nToDOM();
    _applyI18n();

    const treeEl = document.getElementById('tree');

    async function handleSavePage(targetFolderId, customTitle) {
        let tab;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            tab = tabs[0];
        } catch { alert(t('noTabAccess')); return; }

        if (!tab?.url) { alert(t('noTabUrl')); return; }

        const linkTitle = customTitle || tab.title || tab.url;
        const newLink = { id: uid(), title: linkTitle, url: tab.url, description: '' };
        const updatedTree = clone(getCachedTree());

        if (targetFolderId) {
            function insertLink(nodes) {
                for (const n of nodes) {
                    if (!n) continue;
                    if (n.id === targetFolderId) { n.links = n.links || []; n.links.push(newLink); return true; }
                    if (insertLink(n.children || [])) return true;
                }
                return false;
            }
            insertLink(updatedTree);
        } else {
            if (updatedTree.length === 0) {
                updatedTree.push({ id: uid(), type: 'folder', title: t('savedPagesFolder'), children: [], links: [newLink] });
            } else {
                updatedTree[0].links = updatedTree[0].links || [];
                updatedTree[0].links.push(newLink);
            }
        }

        await saveTree(updatedTree);
        updateCachedTree(updatedTree);
        prewarmFavicons(updatedTree);
    }

    async function handleSaveTabs() {
        if (!settings.saveTabs) { alert(t('tabsDisabled')); return; }
        let tabs;
        try { tabs = await chrome.tabs.query({ currentWindow: true }); }
        catch { alert(t('noTabAccess')); return; }

        const validTabs = tabs.filter(t2 => t2.url && !t2.url.startsWith('chrome://') && !t2.url.startsWith('about:'));
        if (validTabs.length === 0) { alert(t('noSaveableTabs')); return; }

        const session = {
            id:    uid(),
            date:  new Date().toLocaleString(),
            title: `Session ${new Date().toLocaleDateString()}`,
            tabs:  validTabs.map(t2 => ({ id: uid(), title: t2.title || t2.url, url: t2.url }))
        };

        const existing = getCachedSavedTabs();
        const updated  = [session, ...existing];
        await saveSavedTabs(updated);
        alert(t('tabsSaved', validTabs.length));
    }

    mount(treeEl, {
        tree,
        settings,
        collapsed: new Set(collapsed),
        savedTabs,
        onSavePage: handleSavePage,
        onSaveTabs: handleSaveTabs
    });

    focusSearch();
});

function _applyI18n() {
    const searchEl = document.getElementById('popupSearch');
    if (searchEl) searchEl.placeholder = t('search');
}