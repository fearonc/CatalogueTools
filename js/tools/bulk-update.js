(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || { loaded: {}, tools: {}, utils: {}, state: {} });
  if (CT.loaded.bulkUpdate) return;

  CT.tools.runBulkUpdateTool = function () {
    alert("Bulk Update tool not migrated yet.");
  };

  CT.loaded.bulkUpdate = true;
})();
