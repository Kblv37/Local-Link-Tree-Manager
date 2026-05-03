chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-search-popup') return;

    let settings = {};
    try {
        const data = await chrome.storage.local.get(['appSettings']);
        settings = data.appSettings || {};
    } catch {}

    const mode = settings.altQMode || 'popup';

    if (mode === 'window') {
        try {
            const url = chrome.runtime.getURL('search.html');
            await chrome.windows.create({
                url,
                type:    'popup',
                width:   480,
                height:  600,
                focused: true
            });
        } catch {
            try { chrome.tabs.create({ url: chrome.runtime.getURL('search.html') }); } catch {}
        }
    } else {
        try {
            await chrome.action.openPopup();
        } catch {}
    }
});