(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || { loaded: {}, tools: {}, utils: {}, state: {} });
  if (CT.loaded.auditSearch) return;

  CT.tools.runAuditHistorySearchTool = function () {
    alert("Audit Search tool not migrated yet.");
  };

  CT.loaded.auditSearch = true;
})();
