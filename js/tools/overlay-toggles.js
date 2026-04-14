(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.overlayToggles) return;

  CT.tools.enableDarkOverlay = function () {
    console.log("Dark overlay placeholder");
  };

  CT.tools.disableDarkOverlay = function () {
    console.log("Dark overlay off placeholder");
  };

  CT.tools.enablePinkOverlay = function () {
    console.log("Pink overlay placeholder");
  };

  CT.tools.disablePinkOverlay = function () {
    console.log("Pink overlay off placeholder");
  };

  CT.loaded.overlayToggles = true;
})();
