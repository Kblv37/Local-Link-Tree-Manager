import { loadAll, saveTree, saveSavedTabs, getCachedTree, getCachedSavedTabs } from './storage/storage.js';
import { applySettingsToDOM } from './core/settings.js';
import { mount, focusSearch, updateCachedTree, showToast } from './ui/popup-ui.js';
import { prewarmFavicons, configureFavicons, loadFaviconCache } from './utils/favicon.js';
import { uid, clone } from './core/tree.js';
import { setLanguage, t, applyI18nToDOM } from './utils/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
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
    const searchPlaceholder = document.getElementById('popupSearch');
    if (searchPlaceholder) searchPlaceholder.placeholder = t('search');

    const treeEl = document.getElementById('tree');

    async function handleSavePage(targetFolderId, customTitle, targetLinkId) {
        let tab;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            tab = tabs[0];
        } catch { showToast(t('noTabAccess')); return; }

        if (!tab?.url) { showToast(t('noTabUrl')); return; }

        const newLink = { id: uid(), title: customTitle || tab.title || tab.url, url: tab.url, description: '' };
        const updatedTree = clone(getCachedTree());

        if (targetLinkId) {
            (function insertAsChild(nodes) {
                for (const n of nodes) {
                    if (!n) continue;
                    for (const l of (n.links || [])) {
                        if (l.id === targetLinkId) {
                            l.children = l.children || [];
                            l.children.push(newLink);
                            return true;
                        }
                        if (l.children && insertAsChild([{ links: l.children, children: [] }])) return true;
                    }
                    if (insertAsChild(n.children || [])) return true;
                }
                return false;
            })(updatedTree);
        } else if (targetFolderId) {
            (function insertLink(nodes) {
                for (const n of nodes) {
                    if (!n) continue;
                    if (n.id === targetFolderId) { (n.links = n.links || []).push(newLink); return true; }
                    if (insertLink(n.children || [])) return true;
                }
                return false;
            })(updatedTree);
        } else {
            if (!updatedTree.length) {
                updatedTree.push({ id: uid(), type: 'folder', title: t('savedPagesFolder'), children: [], links: [newLink] });
            } else {
                (updatedTree[0].links = updatedTree[0].links || []).push(newLink);
            }
        }

        await saveTree(updatedTree);
        updateCachedTree(updatedTree);
        prewarmFavicons(updatedTree);
    }

    async function handleSaveTabs() {
        if (!settings.saveTabs) { showToast(t('tabsDisabled')); return; }
        let tabs;
        try { tabs = await chrome.tabs.query({ currentWindow: true }); }
        catch { showToast(t('noTabAccess')); return; }

        const validTabs = tabs.filter(t2 => t2.url && !t2.url.startsWith('chrome://') && !t2.url.startsWith('about:'));
        if (!validTabs.length) { showToast(t('noSaveableTabs')); return; }

        const session = {
            id:    uid(),
            date:  new Date().toLocaleString(),
            title: `Session ${new Date().toLocaleDateString()}`,
            tabs:  validTabs.map(t2 => ({ id: uid(), title: t2.title || t2.url, url: t2.url }))
        };

        const updated = [session, ...getCachedSavedTabs()];
        await saveSavedTabs(updated);
        showToast(t('tabsSaved', validTabs.length));
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