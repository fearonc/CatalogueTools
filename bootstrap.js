(() => {
  const NS = "CatalogueTools";
  const BOOTSTRAP_FLAG = "__catalogueToolsBootstrapLoading__";

  window[NS] = window[NS] || {
    version: "1.0.0",
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  };

  // If toolkit is already open, close it and stop here
  if (window[NS].state.isOpen && typeof window[NS].state.cleanup === "function") {
    window[NS].state.cleanup();
    return;
  }

  if (window[BOOTSTRAP_FLAG]) return;
  window[BOOTSTRAP_FLAG] = true;

  const base = "https://fearonc.github.io/CatalogueTools/js/";
  const files = [
    "utils.js",
    "tools/bulk-update.js",
    "tools/image-tools.js",
    "tools/audit-search.js",
    "tools/quote-wrap.js",
    "tools/json-viewer.js",
    "tools/overlay-toggles.js",
    "ui.js"
  ];

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-ct-src="${src}"]`);
      if (existing) existing.remove();

      const s = document.createElement("script");
      s.src = base + src + "?v=" + Date.now();
      s.async = false;
      s.dataset.ctSrc = src;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.documentElement.appendChild(s);
    });

  (async () => {
    try {
      for (const file of files) {
        await loadScript(file);
      }
    } catch (err) {
      console.error("[CatalogueTools]", err);
      alert(err.message);
    } finally {
      delete window[BOOTSTRAP_FLAG];
    }
  })();
})();
