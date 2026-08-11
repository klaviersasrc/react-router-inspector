// Runs in the devtools page context. Creates the "React Router" panel.
chrome.devtools.panels.create(
  "React Router",
  null,
  "panel.html",
  () => {}
);
