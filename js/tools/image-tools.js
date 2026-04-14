(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || { loaded: {}, tools: {}, utils: {}, state: {} });
  if (CT.loaded.imageTools) return;

  CT.tools.runImageReorderTool = function () {
    alert("Image Tools not migrated yet.");
  };

  CT.loaded.imageTools = true;
})();
