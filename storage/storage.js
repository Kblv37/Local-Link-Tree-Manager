import { normalizeTree, clone } from '../core/tree.js';
import { mergeSettings, DEFAULT_SETTINGS } from '../core/settings.js';

export const STORAGE_KEY   = 'linkTree';
export const BACKUP_KEY    = 'linkTree_backup';
export const SETTINGS_KEY  = 'appSettings';
export const COLLAPSE_KEY  = 'popupCollapsed';
export const SAVEDTABS_KEY = 'savedTabs';

const cache = {
    tree:      [],
    settings:  { ...DEFAULT_SETTINGS },
    collapsed: [],
    savedTabs: []
};

export function loadAll() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY, COLLAPSE_KEY, SAVEDTABS_KEY], (raw) => {
            if (chrome.runtime.lastError) {
                console.warn('[storage] loadAll error:', chrome.runtime.lastError.message);
                resolve({ tree: [], settings: { ...DEFAULT_SETTINGS }, collapsed: [], savedTabs: [] });
                return;
            }
            const tree      = normalizeTree(raw[STORAGE_KEY]);
            const settings  = mergeSettings(raw[SETTINGS_KEY] || {});
            const collapsed = Array.isArray(raw[COLLAPSE_KEY]) ? raw[COLLAPSE_KEY] : [];
            const savedTabs = Array.isArray(raw[SAVEDTABS_KEY]) ? raw[SAVEDTABS_KEY] : [];

            cache.tree      = clone(tree);
            cache.settings  = { ...settings };
            cache.collapsed = [...collapsed];
            cache.savedTabs = [...savedTabs];

            resolve({ tree, settings, collapsed, savedTabs });
        });
    });
}

export function saveTree(tree) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [BACKUP_KEY]: cache.tree, [STORAGE_KEY]: tree }, () => {
            cache.tree = clone(tree);
            resolve();
        });
    });
}

export function saveSettings(settings) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
            cache.settings = { ...settings };
            resolve();
        });
    });
}

export function saveCollapsed(ids) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [COLLAPSE_KEY]: ids }, () => {
            cache.collapsed = [...ids];
            resolve();
        });
    });
}

export function saveSavedTabs(tabs) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [SAVEDTABS_KEY]: tabs }, () => {
            cache.savedTabs = [...tabs];
            resolve();
        });
    });
}

export function loadBackup() {
    return new Promise((resolve) => {
        chrome.storage.local.get([BACKUP_KEY], (raw) => {
            resolve(normalizeTree(raw?.[BACKUP_KEY]));
        });
    });
}

export function getCachedTree()      { return cache.tree; }
export function getCachedSettings()  { return cache.settings; }
export function getCachedCollapsed() { return cache.collapsed; }
export function getCachedSavedTabs() { return cache.savedTabs; }