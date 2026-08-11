// ISOLATED-world relay: forwards messages from the MAIN-world page bridge
// (window.postMessage) to the extension background, which routes them to the panel.
// Page bridge -> extension (upward).
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.__rrInspector !== true) return;
  try {
    chrome.runtime.sendMessage(d.payload);
  } catch {}
});

// Extension -> page bridge (downward; e.g. toggle console capture).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.__rrToPage) {
    window.postMessage({ __rrInspectorControl: true, payload: msg.payload }, "*");
  }
});
