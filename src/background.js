// Relay between the DevTools panel (one port per inspected tab) and the
// content script running in that tab. MV3 service worker.
const panelsByTab = new Map(); // tabId -> devtools panel port

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "rr-panel") {
    let tabId = null;
    port.onMessage.addListener((msg) => {
      if (msg.type === "init") {
        tabId = msg.tabId;
        panelsByTab.set(tabId, port);
      } else if (msg.type === "to-page" && tabId != null) {
        // Panel -> page control (e.g. toggle console capture).
        chrome.tabs.sendMessage(tabId, { __rrToPage: true, payload: msg.payload }).catch(() => {});
      }
    });
    port.onDisconnect.addListener(() => {
      if (tabId != null) panelsByTab.delete(tabId);
    });
  }
});

// Content-script messages carry the sender tab; forward to that tab's panel.
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;
  const port = panelsByTab.get(tabId);
  if (port) {
    try { port.postMessage(msg); } catch {}
  }
});
