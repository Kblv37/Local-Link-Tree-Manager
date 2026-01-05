chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-search-popup') {
    chrome.action.openPopup();
  }
});