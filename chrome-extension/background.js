// Background service worker — IOC Capture Extension
chrome.action.onClicked.addListener((tab) => {
  // Khi click icon extension → inject content script nếu chưa có
  if (tab.url && tab.url.includes('dhtn.dcs.vn')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const fab = document.getElementById('ioc-fab');
        if (fab) fab.click();
      }
    });
  } else {
    // Nếu không ở dhtn.dcs.vn → mở xabacha.com/capture/guide
    chrome.tabs.create({ url: 'https://xabacha.com/capture/guide' });
  }
});
