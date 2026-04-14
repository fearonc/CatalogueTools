(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.utils) return;

  CT.utils.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  CT.utils.norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  CT.utils.escapeHtml = (s) =>
    (s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));

  CT.utils.makeModal = ({ title, bodyHTML, footerHTML = "", width = "900px" }) => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;";

    wrap.innerHTML = `
      <div style="width:min(${width},98vw);max-height:92vh;background:#fff;border-radius:12px;box-shadow:0 10px 35px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;">
        <div style="padding:14px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="font-size:16px;font-weight:700;">${CT.utils.escapeHtml(title)}</div>
          <button data-x style="border:0;background:#f3f4f6;border-radius:10px;padding:6px 10px;cursor:pointer;font-weight:600;">✕</button>
        </div>
        <div style="padding:14px 16px;overflow:auto;">${bodyHTML}</div>
        <div style="padding:12px 16px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">${footerHTML}</div>
      </div>
    `;

    document.body.appendChild(wrap);

    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close();
    });
    wrap.querySelector("[data-x]")?.addEventListener("click", close);

    return {
      wrap,
      close,
      qs: (sel) => wrap.querySelector(sel),
      qsa: (sel) => [...wrap.querySelectorAll(sel)]
    };
  };

  CT.loaded.utils = true;
})();
