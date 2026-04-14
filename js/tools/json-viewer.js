(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || { loaded: {}, tools: {}, utils: {}, state: {} });
  if (CT.loaded.jsonViewer) return;

  CT.tools.runJsonViewerTool = function () {
    alert("JSON Viewer not migrated yet.");
  };

  CT.loaded.jsonViewer = true;
})();
