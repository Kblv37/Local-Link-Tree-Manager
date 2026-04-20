import { loadAll, saveTree, saveSettings, loadBackup, saveSavedTabs, getCachedSavedTabs } from './storage/storage.js';
import { applySettingsToDOM } from './core/settings.js';
import { normalizeTree, clone, removeEmptyFolders } from './core/tree.js';
import { mount, renderTree, setUnsaved, setupAutosave, getCurrentTree, isUnsaved, renderSavedTabsPanel } from './ui/options-ui.js';
import { exportTreeToTxt, exportSettingsTxt, parseTxtToTree, parseSettingsTxt, exportTabSessionsTxt, exportAllData, importAllData } from './utils/export.js';
import { configureFavicons, loadFaviconCache } from './utils/favicon.js';
import { setLanguage, t, applyI18nToDOM } from './utils/i18n.js';

(async function init() {
    const { tree, settings, savedTabs } = await loadAll();

    setLanguage(settings.language || 'ru');

    const treePanel = document.getElementById('treePanel');
    applySettingsToDOM(settings, treePanel);
    configureFavicons(settings);
    loadFaviconCache();
    applyI18nToDOM();

    let savedTreeSnapshot = clone(tree);
    let currentSettings   = { ...settings };

    function _showToast(msg) {
        let t2 = document.getElementById('toast');
        if (!t2) { t2=document.createElement('div'); t2.id='toast'; document.body.appendChild(t2); }
        t2.textContent = msg;
        t2.classList.add('show');
        setTimeout(() => t2.classList.remove('show'), 2000);
    }

    async function handleSave() {
        const normalized = normalizeTree(getCurrentTree());
        await saveTree(normalized);
        savedTreeSnapshot = clone(normalized);
        setUnsaved(false);
        _showToast(t('saved'));
    }

    function refreshAutosave() {
        setupAutosave(currentSettings.autosave, async () => {
            const normalized = normalizeTree(getCurrentTree());
            await saveTree(normalized);
            savedTreeSnapshot = clone(normalized);
            setUnsaved(false);
        });
    }
    refreshAutosave();

    function _updateSessionsVisibility(saveTabs) {
        const section = document.getElementById('savedTabsSection');
        if (section) section.style.display = saveTabs ? '' : 'none';
    }
    _updateSessionsVisibility(currentSettings.saveTabs);

    function _refreshTabsPanel() {
        const sessions = getCachedSavedTabs();
        renderSavedTabsPanel(
            sessions,
            (session) => {
                if (!confirm(t('tabsRestore', session.tabs.length))) return;
                session.tabs.forEach(tab => {
                    try { chrome.tabs.create({ url: tab.url }); } catch { window.open(tab.url, '_blank'); }
                });
            },
            async (sessionId) => {
                const updated = getCachedSavedTabs().filter(s => s.id !== sessionId);
                await saveSavedTabs(updated);
                _refreshTabsPanel();
            },
            () => exportTabSessionsTxt(getCachedSavedTabs())
        );
    }
    _refreshTabsPanel();

    document.getElementById('importSessionsFile')?.addEventListener('change', e => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const sessions = _parseSessionsTxt(reader.result);
                if (!sessions || sessions.length === 0) { alert(t('fileNoData')); return; }
                const existing = getCachedSavedTabs();
                const merged = [...sessions, ...existing];
                await saveSavedTabs(merged);
                _refreshTabsPanel();
                _showToast(t('settingsImported'));
            } catch { alert(t('fileError')); }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    function _parseSessionsTxt(text) {
        const sessions = [];
        let current = null;
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('[Session]')) {
                if (current && current.tabs.length > 0) sessions.push(current);
                current = { id: (crypto.randomUUID?.() ?? ('s-' + Date.now() + Math.random())), title: trimmed.slice(9).trim(), date: '', tabs: [] };
            } else if (trimmed.startsWith('Date:') && current) {
                current.date = trimmed.slice(5).trim();
            } else if (trimmed.startsWith('Tab:') && current) {
                current.tabs.push({ id: (crypto.randomUUID?.() ?? ('t-' + Date.now() + Math.random())), title: trimmed.slice(4).trim(), url: '' });
            } else if (trimmed.startsWith('URL:') && current && current.tabs.length > 0) {
                current.tabs[current.tabs.length - 1].url = trimmed.slice(4).trim();
            }
        }
        if (current && current.tabs.length > 0) sessions.push(current);
        return sessions;
    }

    const treeEl = document.getElementById('tree');
    mount(treeEl, {
        tree,
        settings: currentSettings,

        onSave: handleSave,

        onCancel: () => {
            if (!isUnsaved()) return;
            if (!confirm(t('discardConfirm'))) return;
            renderTree(clone(savedTreeSnapshot));
            setUnsaved(false);
        },

        onExport: (unique) => exportTreeToTxt(getCurrentTree(), unique),

        onImport: (file) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const imported = parseTxtToTree(reader.result);
                    if (!imported || imported.length === 0) { alert(t('fileNoData')); return; }
                    renderTree(imported);
                    setUnsaved(true);
                } catch { alert(t('fileError')); }
            };
            reader.readAsText(file);
        },

        onClean: () => {
            const cleaned = removeEmptyFolders(getCurrentTree());
            renderTree(cleaned);
            setUnsaved(true);
        },

        onUndo: async () => {
            const backup = await loadBackup();
            if (!backup || backup.length === 0) { alert(t('noBackup')); return; }
            if (!confirm(t('restoreConfirm'))) return;
            savedTreeSnapshot = clone(backup);
            renderTree(clone(backup));
            setUnsaved(true);
        },

        onSettingChange: async (key, value) => {
            currentSettings = { ...currentSettings, [key]: value };
            if (key === 'language') {
                setLanguage(value);
                applyI18nToDOM();
                renderTree(getCurrentTree());
                _refreshTabsPanel();
            }
            if (key === 'saveTabs') {
                _updateSessionsVisibility(value);
            }
            applySettingsToDOM(currentSettings, treePanel);
            configureFavicons(currentSettings);
            await saveSettings(currentSettings);
            if (key === 'autosave') refreshAutosave();
            if (key === 'uiScale') {
                const el = document.getElementById('settingScaleVal');
                if (el) el.textContent = `${value}%`;
            }
            if (key === 'optionsScale') {
                const el = document.getElementById('settingOptionsScaleVal');
                if (el) el.textContent = `${value}%`;
                applySettingsToDOM(currentSettings, treePanel);
            }
        },

        onExportSettings: () => exportSettingsTxt(currentSettings),

        onImportSettings: (file) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const s = parseSettingsTxt(reader.result);
                    currentSettings = s;
                    setLanguage(s.language || 'en');
                    applyI18nToDOM();
                    applySettingsToDOM(currentSettings, treePanel);
                    configureFavicons(currentSettings);
                    const sync = (id, val) => { const el=document.getElementById(id); if(el) el.checked=val; };
                    sync('settingCompact',  !!s.compactMode);
                    sync('settingAutosave', !!s.autosave);
                    sync('settingFavicons', s.showFavicons!==false);
                    sync('settingSaveTabs', !!s.saveTabs);
                    sync('settingLayout',   s.layoutCorrection!==false);
                    _updateSessionsVisibility(!!s.saveTabs);
                    const themeEl = document.getElementById('settingTheme');
                    if (themeEl) themeEl.value = s.theme || 'light';
                    const langEl = document.getElementById('settingLang');
                    if (langEl) langEl.value = s.language || 'en';
                    const scaleValEl = document.getElementById('settingScaleVal');
                    if (scaleValEl) scaleValEl.textContent = `${s.uiScale ?? 100}%`;
                    const optScaleValEl = document.getElementById('settingOptionsScaleVal');
                    if (optScaleValEl) optScaleValEl.textContent = `${s.optionsScale ?? 115}%`;
                    await saveSettings(currentSettings);
                    refreshAutosave();
                    _showToast(t('settingsImported'));
                } catch (err) { alert(t('settingsError') + err.message); }
            };
            reader.readAsText(file);
        }
    });

    window.addEventListener('keydown', e => {
        if (e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave(); }
        else if (e.key === 'Escape' && isUnsaved()) document.getElementById('cancelBtn')?.click();
    });

    window.addEventListener('beforeunload', e => {
        if (isUnsaved()) { e.preventDefault(); e.returnValue = ''; }
    });

    document.getElementById('exportAll')?.addEventListener('click', () => {
        exportAllData(getCurrentTree(), currentSettings, getCachedSavedTabs());
    });

    document.getElementById('importAll')?.addEventListener('change', e => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const result = importAllData(reader.result);
                if (result.tree && result.tree.length > 0) {
                    renderTree(result.tree);
                    setUnsaved(true);
                }
                if (result.settings) {
                    currentSettings = result.settings;
                    setLanguage(currentSettings.language || 'ru');
                    applyI18nToDOM();
                    applySettingsToDOM(currentSettings, treePanel);
                    configureFavicons(currentSettings);
                    const sync = (id, val) => { const el=document.getElementById(id); if(el) el.checked=val; };
                    sync('settingCompact',  !!currentSettings.compactMode);
                    sync('settingAutosave', !!currentSettings.autosave);
                    sync('settingFavicons', currentSettings.showFavicons!==false);
                    sync('settingSaveTabs', !!currentSettings.saveTabs);
                    sync('settingLayout',   currentSettings.layoutCorrection!==false);
                    _updateSessionsVisibility(!!currentSettings.saveTabs);
                    const themeEl = document.getElementById('settingTheme');
                    if (themeEl) themeEl.value = currentSettings.theme || 'light';
                    const langEl = document.getElementById('settingLang');
                    if (langEl) langEl.value = currentSettings.language || 'ru';
                    const scaleValEl = document.getElementById('settingScaleVal');
                    if (scaleValEl) scaleValEl.textContent = `${currentSettings.uiScale ?? 100}%`;
                    const optScaleValEl = document.getElementById('settingOptionsScaleVal');
                    if (optScaleValEl) optScaleValEl.textContent = `${currentSettings.optionsScale ?? 115}%`;
                    await saveSettings(currentSettings);
                    refreshAutosave();
                }
                if (result.sessions && result.sessions.length > 0) {
                    await saveSavedTabs(result.sessions);
                    _refreshTabsPanel();
                }
                _showToast(t('settingsImported'));
            } catch (err) { alert(t('settingsError') + err.message); }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
})();
