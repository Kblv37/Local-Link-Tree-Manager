import { uid, safeArray } from '../core/tree.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';

export function hasExportableContent(tree) {
    if (!Array.isArray(tree) || tree.length === 0) return false;
    function check(nodes) {
        return nodes.some(n => {
            if (!n) return false;
            if (safeArray(n.links).some(l => l?.url || l?.title)) return true;
            return check(safeArray(n.children));
        });
    }
    return check(tree);
}

export function buildTxtContent(tree) {
    const lines = ['=== LINK TREE EXPORT ===', `Date: ${new Date().toISOString().slice(0, 10)}`, ''];

    function walkLinks(links, pad) {
        for (const link of links) {
            lines.push(`${pad}  Title: ${link.title || ''}`);
            lines.push(`${pad}  URL:   ${link.url || ''}`);
            if (link.description) lines.push(`${pad}  Desc:  ${link.description}`);
            lines.push(`${pad}  ---`);
            if (link.children && link.children.length > 0) {
                walkLinks(link.children, pad + '  ');
            }
        }
    }

    function walk(nodes, depth) {
        const pad = '  '.repeat(depth);
        for (const node of nodes) {
            lines.push(`${pad}[Folder] ${node.title}`);
            walkLinks(safeArray(node.links), pad);
            if (safeArray(node.children).length > 0) walk(node.children, depth + 1);
            if (depth === 0) lines.push('');
        }
    }
    walk(tree, 0);
    return lines.join('\n');
}

export function exportTreeToTxt(tree, useUniqueName = true, onAlert) {
    if (!hasExportableContent(tree)) {
        const msg = 'Nothing to export: tree is empty or contains no links.';
        if (onAlert) onAlert(msg); else alert(msg);
        return;
    }
    const blob = new Blob([buildTxtContent(tree)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    chrome.downloads.download({
        url,
        filename:       `LLTM-links-${today}.txt`,
        conflictAction: useUniqueName ? 'uniquify' : 'overwrite',
        saveAs: false
    });
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function parseTxtToTree(text) {
    if (text.includes('[Folder]')) return parseNewFormat(text);
    if (text.includes('Папка:')) return parseLegacyFormat(text);
    return parseOldFormat(text);
}

function parseNewFormat(text) {
    const root = [];
    const folderStack = [{ depth: -1, node: null, children: root }];
    let linkStack = [];
    let currentLink = null;

    for (const rawLine of text.split('\n')) {
        if (!rawLine.trim()) continue;
        const content = rawLine.trim();
        if (content.startsWith('===') || content.startsWith('Date:')) continue;
        const depth = Math.floor(rawLine.match(/^( *)/)[1].length / 2);

        if (content.startsWith('[Folder]')) {
            const folder = { id: uid(), type: 'folder', title: content.slice(8).trim(), children: [], links: [] };
            while (folderStack.length > 1 && folderStack[folderStack.length - 1].depth >= depth) folderStack.pop();
            folderStack[folderStack.length - 1].children.push(folder);
            folderStack.push({ depth, node: folder, children: folder.children });
            linkStack = [];
            currentLink = null;
        } else if (content.startsWith('Title:')) {
            const parentNode = folderStack[folderStack.length - 1].node;
            if (!parentNode) continue;
            const newLink = { id: uid(), title: content.slice(6).trim(), url: '', description: '', children: [] };

            while (linkStack.length > 0 && linkStack[linkStack.length - 1].depth >= depth) {
                linkStack.pop();
            }

            if (linkStack.length === 0) {
                parentNode.links.push(newLink);
            } else {
                const parentLink = linkStack[linkStack.length - 1].link;
                parentLink.children.push(newLink);
            }

            linkStack.push({ link: newLink, depth });
            currentLink = newLink;
        } else if (content.startsWith('URL:') && currentLink) {
            currentLink.url = content.slice(4).trim();
        } else if (content.startsWith('Desc:') && currentLink) {
            currentLink.description = content.slice(5).trim();
        }
    }

    function cleanLinks(links) {
        for (const link of links) {
            if (link.children && link.children.length === 0) {
                delete link.children;
            } else if (link.children && link.children.length > 0) {
                cleanLinks(link.children);
            }
        }
    }
    function cleanTree(nodes) {
        for (const node of nodes) {
            cleanLinks(node.links || []);
            cleanTree(node.children || []);
        }
    }
    cleanTree(root);

    return root;
}

function parseLegacyFormat(text) {
    const root = [];
    const stack = [{ depth: -1, node: null, children: root }];
    let currentLink = null;
    for (const rawLine of text.split('\n')) {
        if (!rawLine.trim()) continue;
        const content = rawLine.trim();
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
            currentLink = { id: uid(), title: content.slice(11).trim(), url: '', description: '' };
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
            const link = { id: uid(), title: content.replace('🔗', '').trim(), url: '', description: '' };
            const parent = stack[stack.length - 1].node;
            if (parent) { parent.links.push(link); lastLink = link; }
        } else if (content.startsWith('http') && lastLink) {
            lastLink.url = content.trim();
            lastLink = null;
        }
    }
    return root;
}

export function buildSettingsTxt(s) {
    return [
        '=== LLTM SETTINGS ===',
        `theme: ${s.theme}`,
        `compactMode: ${s.compactMode}`,
        `autosave: ${s.autosave}`,
        `showFavicons: ${s.showFavicons}`,
        `uiScale: ${s.uiScale}`,
        `optionsScale: ${s.optionsScale ?? 115}`,
        `saveTabs: ${s.saveTabs}`,
        `language: ${s.language}`,
        `layoutCorrection: ${s.layoutCorrection}`
    ].join('\n');
}

export function parseSettingsTxt(text) {
    if (!text.includes('SETTINGS')) throw new Error('Invalid settings file format.');
    const result = { ...DEFAULT_SETTINGS };
    for (const line of text.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        if (!key || !val) continue;
        if (key === 'theme' && ['light','dark','soft-dark','blue','green','rose'].includes(val)) result.theme = val;
        if (key === 'compactMode')     result.compactMode     = val === 'true';
        if (key === 'autosave')        result.autosave        = val === 'true';
        if (key === 'showFavicons')    result.showFavicons    = val === 'true';
        if (key === 'uiScale')         { const n = parseInt(val,10); if (n>=80&&n<=160) result.uiScale = n; }
        if (key === 'optionsScale')    { const n = parseInt(val,10); if (n>=80&&n<=160) result.optionsScale = n; }
        if (key === 'saveTabs')        result.saveTabs        = val === 'true';
        if (key === 'language'        && (val==='en'||val==='ru')) result.language = val;
        if (key === 'layoutCorrection') result.layoutCorrection = val === 'true';
    }
    return result;
}

export function exportSettingsTxt(settings) {
    const blob = new Blob([buildSettingsTxt(settings)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    chrome.downloads.download({ url, filename: `LLTM-prefs-${today}.txt`, conflictAction: 'uniquify', saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function buildTabSessionsTxt(sessions) {
    const lines = ['=== LLTM TAB SESSIONS ===', ''];
    for (const s of sessions) {
        lines.push(`[Session] ${s.title}`);
        lines.push(`Date: ${s.date}`);
        for (const tab of s.tabs) {
            lines.push(`  Tab: ${tab.title}`);
            lines.push(`  URL: ${tab.url}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

export function exportTabSessionsTxt(sessions, onAlert) {
    if (!sessions || sessions.length === 0) {
        const msg = 'No sessions to export.';
        if (onAlert) onAlert(msg); else alert(msg);
        return;
    }
    const blob = new Blob([buildTabSessionsTxt(sessions)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    chrome.downloads.download({ url, filename: `LLTM-sessions-${today}.txt`, conflictAction: 'uniquify', saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportAllData(tree, settings, sessions) {
    const today = new Date().toISOString().slice(0, 10);
    const parts = [];

    parts.push('[SETTINGS]');
    parts.push(buildSettingsTxt(settings));
    parts.push('');

    parts.push('[LINKS]');
    parts.push(buildTxtContent(tree));
    parts.push('');

    if (sessions && sessions.length > 0) {
        parts.push('[SESSIONS]');
        parts.push(buildTabSessionsTxt(sessions));
        parts.push('');
    }

    const content = parts.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
        url,
        filename: `LLTM-${today}.txt`,
        conflictAction: 'uniquify',
        saveAs: false
    });
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function importAllData(text) {
    const result = { tree: null, settings: null, sessions: null };

    const settingsMatch = text.match(/\[SETTINGS\]([\s\S]*?)(?=\[LINKS\]|\[SESSIONS\]|$)/);
    const linksMatch    = text.match(/\[LINKS\]([\s\S]*?)(?=\[SETTINGS\]|\[SESSIONS\]|$)/);
    const sessionsMatch = text.match(/\[SESSIONS\]([\s\S]*?)(?=\[SETTINGS\]|\[LINKS\]|$)/);

    if (settingsMatch) {
        try { result.settings = parseSettingsTxt(settingsMatch[1]); } catch {}
    }

    if (linksMatch) {
        try {
            const tree = parseTxtToTree(linksMatch[1]);
            if (tree && tree.length > 0) result.tree = tree;
        } catch {}
    }

    if (sessionsMatch) {
        try {
            const sessions = _parseSessionsSection(sessionsMatch[1]);
            if (sessions && sessions.length > 0) result.sessions = sessions;
        } catch {}
    }

    if (!result.tree && !result.settings && !result.sessions) {
        try {
            const tree = parseTxtToTree(text);
            if (tree && tree.length > 0) result.tree = tree;
        } catch {}
    }

    return result;
}

function _parseSessionsSection(text) {
    const sessions = [];
    let current = null;
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[Session]')) {
            if (current && current.tabs.length > 0) sessions.push(current);
            current = {
                id: crypto.randomUUID?.() ?? ('s-' + Date.now() + Math.random()),
                title: trimmed.slice(9).trim(),
                date: '',
                tabs: []
            };
        } else if (trimmed.startsWith('Date:') && current) {
            current.date = trimmed.slice(5).trim();
        } else if (trimmed.startsWith('Tab:') && current) {
            current.tabs.push({
                id: crypto.randomUUID?.() ?? ('t-' + Date.now() + Math.random()),
                title: trimmed.slice(4).trim(),
                url: ''
            });
        } else if (trimmed.startsWith('URL:') && current && current.tabs.length > 0) {
            current.tabs[current.tabs.length - 1].url = trimmed.slice(4).trim();
        }
    }
    if (current && current.tabs.length > 0) sessions.push(current);
    return sessions;
}