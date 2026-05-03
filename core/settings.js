export const THEMES = ['light', 'dark', 'soft-dark', 'blue', 'green', 'rose'];

export const DEFAULT_SETTINGS = {
    theme:              'light',
    compactMode:        false,
    autosave:           true,
    showFavicons:       true,
    uiScale:            100,
    optionsScale:       115,
    saveTabs:           true,
    language:           'ru',
    layoutCorrection:   false,
    nestedLinksEnabled: false,
    nestedLinksSearch:  false,
    altQMode:           'popup'
};

export function mergeSettings(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const clampScale = (v, def) => (typeof v === 'number' && v >= 80 && v <= 160) ? v : def;
    return {
        theme:              THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
        compactMode:        typeof s.compactMode      === 'boolean' ? s.compactMode      : DEFAULT_SETTINGS.compactMode,
        autosave:           typeof s.autosave         === 'boolean' ? s.autosave         : DEFAULT_SETTINGS.autosave,
        showFavicons:       typeof s.showFavicons     === 'boolean' ? s.showFavicons     : DEFAULT_SETTINGS.showFavicons,
        uiScale:            clampScale(s.uiScale,      DEFAULT_SETTINGS.uiScale),
        optionsScale:       clampScale(s.optionsScale, DEFAULT_SETTINGS.optionsScale),
        saveTabs:           typeof s.saveTabs         === 'boolean' ? s.saveTabs         : DEFAULT_SETTINGS.saveTabs,
        language:           (s.language === 'ru' || s.language === 'en') ? s.language    : DEFAULT_SETTINGS.language,
        layoutCorrection:   typeof s.layoutCorrection === 'boolean' ? s.layoutCorrection : DEFAULT_SETTINGS.layoutCorrection,
        nestedLinksEnabled: typeof s.nestedLinksEnabled === 'boolean' ? s.nestedLinksEnabled : DEFAULT_SETTINGS.nestedLinksEnabled,
        nestedLinksSearch:  typeof s.nestedLinksSearch  === 'boolean' ? s.nestedLinksSearch  : DEFAULT_SETTINGS.nestedLinksSearch,
        altQMode:           ['popup','window'].includes(s.altQMode) ? s.altQMode : DEFAULT_SETTINGS.altQMode
    };
}

export function applySettingsToDOM(settings, treePanel) {
    const theme = THEMES.includes(settings.theme) ? settings.theme : 'light';
    document.documentElement.setAttribute('data-theme', theme);

    const isOptions = !!document.getElementById('treePanel');
    const scale = isOptions ? (settings.optionsScale ?? 115) : (settings.uiScale ?? 100);
    document.documentElement.style.setProperty('--ui-scale', scale / 100);

    if (treePanel) treePanel.classList.toggle('compact', !!settings.compactMode);
}