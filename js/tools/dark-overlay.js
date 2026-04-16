(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.darkOverlay) return;

  const STYLE_ID = "sdp-dark-overlay-style";
  const OBSERVER_KEY = "__sdpDarkOverlayObserver";
  const ROOT_ATTR = "data-sdp-dark-overlay";
  const PATCHED_ATTR = "data-sdp-purple-patched";
  const CKEDITOR_STYLE_ID = "sdp-dark-ckeditor-frame-style";

  const LEGACY_BLUE_SET = new Set([
    "rgb(101, 165, 218)",
    "rgb(66, 139, 202)",
    "rgb(10, 90, 156)",
    "rgb(51, 122, 183)"
  ]);

  const ACTIVE_BG = "#7f5a86";
  const HOVER_BG = "rgba(190,133,191,0.12)";
  const ACTIVE_TEXT = "#ffffff";
  const BORDER = "#334155";
  const ACTIVE_LINE = "#22c55e";

  function disconnectObserver() {
    if (window[OBSERVER_KEY]) {
      window[OBSERVER_KEY].disconnect();
      delete window[OBSERVER_KEY];
    }
  }

  function clearPatchedStyles(el) {
    el.style.removeProperty("background");
    el.style.removeProperty("background-color");
    el.style.removeProperty("background-image");
    el.style.removeProperty("color");
    el.style.removeProperty("border-color");
    el.style.removeProperty("border-bottom-color");
    el.style.removeProperty("box-shadow");
    el.style.removeProperty("text-shadow");
    el.style.removeProperty("font-weight");
    el.style.removeProperty("filter");
  }

  function cleanupPatchedElements() {
    document.querySelectorAll(`[${PATCHED_ATTR}='true']`).forEach((el) => {
      el.removeAttribute(PATCHED_ATTR);
      clearPatchedStyles(el);
    });

    document.querySelectorAll("iframe.cke_wysiwyg_frame").forEach((iframe) => {
      try {
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        const style = doc && doc.getElementById(CKEDITOR_STYLE_ID);
        if (style) style.remove();
      } catch {}
    });
  }

  function isActiveLike(el) {
    if (!el || el.nodeType !== 1) return false;

    const cls = String(el.className || "").toLowerCase();
    const ariaSelected = el.getAttribute("aria-selected");
    const role = (el.getAttribute("role") || "").toLowerCase();

    return (
      ariaSelected === "true" ||
      (role === "tab" && ariaSelected === "true") ||
      cls.includes("active") ||
      cls.includes("selected") ||
      cls.includes("current") ||
      cls.includes("ui-tabs-active") ||
      cls.includes("tabactive") ||
      !!el.closest("li.active, li.selected, li.current, .ui-tabs-active")
    );
  }

  function hasLegacyBlueBackground(el) {
    return !!el && el.nodeType === 1 && LEGACY_BLUE_SET.has(window.getComputedStyle(el).backgroundColor);
  }

  function patchLegacyBlueElement(el) {
    if (!el || el.nodeType !== 1) return;

    const cs = window.getComputedStyle(el);
    if (!LEGACY_BLUE_SET.has(cs.backgroundColor)) return;

    el.setAttribute(PATCHED_ATTR, "true");
    el.style.setProperty("background", ACTIVE_BG, "important");
    el.style.setProperty("background-color", ACTIVE_BG, "important");
    el.style.setProperty("background-image", "none", "important");
    el.style.setProperty("color", isActiveLike(el) ? ACTIVE_TEXT : "#b6c2d2", "important");
    el.style.setProperty("border-color", BORDER, "important");
    el.style.setProperty("text-shadow", "none", "important");

    if (isActiveLike(el)) {
      el.style.setProperty("border-bottom-color", ACTIVE_LINE, "important");
      el.style.setProperty("box-shadow", `inset 0 -3px 0 ${ACTIVE_LINE}`, "important");
    } else {
      el.style.setProperty("border-bottom-color", BORDER, "important");
      el.style.setProperty("box-shadow", "none", "important");
    }
  }

  function patchLegacyBlueAreas(root) {
    const scope = root && root.querySelectorAll ? root : document;

    if (root && root.nodeType === 1 && hasLegacyBlueBackground(root)) {
      patchLegacyBlueElement(root);
    }

    scope.querySelectorAll("*").forEach((el) => {
      if (hasLegacyBlueBackground(el)) patchLegacyBlueElement(el);
    });
  }

  function patchCkeditorFrames() {
    document.querySelectorAll("iframe.cke_wysiwyg_frame").forEach((iframe) => {
      try {
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (!doc || !doc.head) return;

        let style = doc.getElementById(CKEDITOR_STYLE_ID);
        if (!style) {
          style = doc.createElement("style");
          style.id = CKEDITOR_STYLE_ID;
          doc.head.appendChild(style);
        }

        style.textContent = `
          html,body{background:#263445!important;color:#e5edf7!important}
          body{color:#e5edf7!important}
          p,div,span,li,td,th{color:#e5edf7!important}
          a{color:#be85bf!important}
          table,td,th{border-color:#334155!important}
          blockquote{border-left:3px solid #22c55e!important;padding-left:10px!important;color:#e5edf7!important}
        `;
      } catch {}
    });
  }

  function applyDarkOverlay() {
    if (document.getElementById(STYLE_ID)) return;

    document.documentElement.setAttribute(ROOT_ATTR, "true");

    const css = `
      :root[${ROOT_ATTR}="true"]{
        --sdp-bg:#111827;
        --sdp-bg-2:#17212f;
        --sdp-bg-3:#1f2937;
        --sdp-surface:#202b3a;
        --sdp-surface-2:#263445;
        --sdp-surface-3:#0e1420;
        --sdp-border:#334155;
        --sdp-text:#e5edf7;
        --sdp-text-soft:#b6c2d2;
        --sdp-text-dim:#8b9bb0;
        --sdp-link:#be85bf;
        --sdp-accent:#be85bf;
        --sdp-accent-2:#7f5a86;
        --sdp-success:#22c55e;
        --sdp-warn:#f59e0b;
        --sdp-danger:#ef4444;
        --sdp-shadow:0 8px 24px rgba(0,0,0,.28);
        --sdp-radius:8px;
        --sdp-active-line:#22c55e
      }

      :root[${ROOT_ATTR}="true"],
      :root[${ROOT_ATTR}="true"] body{
        background:var(--sdp-bg)!important;
        color:var(--sdp-text)!important;
        color-scheme:dark!important
      }

      :root[${ROOT_ATTR}="true"] body,
      :root[${ROOT_ATTR}="true"] div,
      :root[${ROOT_ATTR}="true"] section,
      :root[${ROOT_ATTR}="true"] article,
      :root[${ROOT_ATTR}="true"] main,
      :root[${ROOT_ATTR}="true"] aside,
      :root[${ROOT_ATTR}="true"] header,
      :root[${ROOT_ATTR}="true"] footer,
      :root[${ROOT_ATTR}="true"] nav,
      :root[${ROOT_ATTR}="true"] form,
      :root[${ROOT_ATTR}="true"] fieldset,
      :root[${ROOT_ATTR}="true"] .container,
      :root[${ROOT_ATTR}="true"] .content{
        background-color:transparent;
        color:var(--sdp-text)!important
      }

      :root[${ROOT_ATTR}="true"] body *:not(svg):not(path):not(img):not(video):not(canvas):not(iframe){
        border-color:var(--sdp-border)!important;
        box-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] header,
      :root[${ROOT_ATTR}="true"] nav,
      :root[${ROOT_ATTR}="true"] [role="navigation"],
      :root[${ROOT_ATTR}="true"] [class*="header"],
      :root[${ROOT_ATTR}="true"] [class*="topbar"],
      :root[${ROOT_ATTR}="true"] [class*="navbar"],
      :root[${ROOT_ATTR}="true"] [class*="toolbar"]{
        background:var(--sdp-bg-2)!important;
        color:var(--sdp-text)!important;
        border-bottom:1px solid var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] aside,
      :root[${ROOT_ATTR}="true"] [class*="sidebar"],
      :root[${ROOT_ATTR}="true"] [class*="sidemenu"],
      :root[${ROOT_ATTR}="true"] [class*="leftNav"],
      :root[${ROOT_ATTR}="true"] nav.sidebar{
        background:var(--sdp-bg-2)!important;
        color:var(--sdp-text-soft)!important;
        border-right:1px solid var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] .card,
      :root[${ROOT_ATTR}="true"] .panel,
      :root[${ROOT_ATTR}="true"] .panel-default,
      :root[${ROOT_ATTR}="true"] .panel-body,
      :root[${ROOT_ATTR}="true"] .panel-heading,
      :root[${ROOT_ATTR}="true"] .well,
      :root[${ROOT_ATTR}="true"] .modal-content,
      :root[${ROOT_ATTR}="true"] .modal-header,
      :root[${ROOT_ATTR}="true"] .modal-body,
      :root[${ROOT_ATTR}="true"] .modal-footer,
      :root[${ROOT_ATTR}="true"] .dialog,
      :root[${ROOT_ATTR}="true"] .popup,
      :root[${ROOT_ATTR}="true"] .thumbnail,
      :root[${ROOT_ATTR}="true"] .help-block,
      :root[${ROOT_ATTR}="true"] [class*="card"],
      :root[${ROOT_ATTR}="true"] [class*="panel"],
      :root[${ROOT_ATTR}="true"] [class*="dialog"],
      :root[${ROOT_ATTR}="true"] [class*="modal"]{
        background:var(--sdp-surface)!important;
        background-color:var(--sdp-surface)!important;
        background-image:none!important;
        color:var(--sdp-text)!important;
        border:1px solid var(--sdp-border)!important;
        border-radius:var(--sdp-radius)!important;
        box-shadow:var(--sdp-shadow)!important;
        text-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] .panel-title,
      :root[${ROOT_ATTR}="true"] .modal-title,
      :root[${ROOT_ATTR}="true"] .panel-heading *,
      :root[${ROOT_ATTR}="true"] .modal-header *{
        color:var(--sdp-text)!important
      }

      :root[${ROOT_ATTR}="true"] table,
      :root[${ROOT_ATTR}="true"] [role="table"]{
        background:var(--sdp-surface)!important
      }

      :root[${ROOT_ATTR}="true"] table,
      :root[${ROOT_ATTR}="true"] thead,
      :root[${ROOT_ATTR}="true"] tbody,
      :root[${ROOT_ATTR}="true"] tr,
      :root[${ROOT_ATTR}="true"] th,
      :root[${ROOT_ATTR}="true"] td,
      :root[${ROOT_ATTR}="true"] [role="row"],
      :root[${ROOT_ATTR}="true"] [role="cell"]{
        color:#fff!important;
        border-color:var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] thead,
      :root[${ROOT_ATTR}="true"] th{
        background:var(--sdp-bg-3)!important;
        color:var(--sdp-text-soft)!important
      }

      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(odd),
      :root[${ROOT_ATTR}="true"] table>tbody>tr:nth-child(odd),
      :root[${ROOT_ATTR}="true"] .table-striped>tbody>tr:nth-child(odd)>td,
      :root[${ROOT_ATTR}="true"] .table-striped>tbody>tr:nth-child(odd)>th{
        background:#0e1420!important;
        background-color:#0e1420!important;
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(even),
      :root[${ROOT_ATTR}="true"] table>tbody>tr:nth-child(even),
      :root[${ROOT_ATTR}="true"] .table-striped>tbody>tr:nth-child(even)>td,
      :root[${ROOT_ATTR}="true"] .table-striped>tbody>tr:nth-child(even)>th,
      :root[${ROOT_ATTR}="true"] tbody td,
      :root[${ROOT_ATTR}="true"] tbody th{
        background:var(--sdp-surface)!important;
        background-color:var(--sdp-surface)!important;
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(odd) td,
      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(odd) th{
        background:linear-gradient(0deg,rgba(190,133,191,.05),rgba(190,133,191,.05)),#0e1420!important;
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child,
      :root[${ROOT_ATTR}="true"] tr.selected-child td,
      :root[${ROOT_ATTR}="true"] tr.selected-child th{
        background:linear-gradient(0deg,rgba(190,133,191,.22),rgba(190,133,191,.22)),#24182a!important;
        background-color:#24182a!important;
        color:#f3e8ff!important;
        font-weight:600!important;
        box-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child td:first-child{
        box-shadow:inset 4px 0 0 var(--sdp-active-line)!important
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child a,
      :root[${ROOT_ATTR}="true"] tr.selected-child .ng-binding{
        color:#f3e8ff!important;
        font-weight:700!important
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child:hover,
      :root[${ROOT_ATTR}="true"] tr.selected-child:hover td,
      :root[${ROOT_ATTR}="true"] tr.selected-child:hover th{
        background:linear-gradient(0deg,rgba(190,133,191,.28),rgba(190,133,191,.28)),#2a1c31!important;
        background-color:#2a1c31!important;
        box-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child:hover td:first-child{
        box-shadow:inset 4px 0 0 var(--sdp-active-line)!important
      }

      :root[${ROOT_ATTR}="true"] tr[style*="background"],
      :root[${ROOT_ATTR}="true"] tr[class*="white"],
      :root[${ROOT_ATTR}="true"] tr[class*="alt"],
      :root[${ROOT_ATTR}="true"] td[style*="background"],
      :root[${ROOT_ATTR}="true"] th[style*="background"]{
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] tbody tr:hover,
      :root[${ROOT_ATTR}="true"] [role="row"]:hover{
        background:${HOVER_BG}!important
      }

      :root[${ROOT_ATTR}="true"] tbody tr:hover td,
      :root[${ROOT_ATTR}="true"] tbody tr:hover th{
        background:linear-gradient(0deg,rgba(190,133,191,.12),rgba(190,133,191,.12)),var(--sdp-surface)!important;
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] input,
      :root[${ROOT_ATTR}="true"] textarea,
      :root[${ROOT_ATTR}="true"] select,
      :root[${ROOT_ATTR}="true"] button,
      :root[${ROOT_ATTR}="true"] .form-control{
        background:var(--sdp-surface-2)!important;
        color:var(--sdp-text)!important;
        border:1px solid var(--sdp-border)!important;
        border-radius:6px!important
      }

      :root[${ROOT_ATTR}="true"] input::placeholder,
      :root[${ROOT_ATTR}="true"] textarea::placeholder{
        color:var(--sdp-text-dim)!important
      }

      :root[${ROOT_ATTR}="true"] input:focus,
      :root[${ROOT_ATTR}="true"] textarea:focus,
      :root[${ROOT_ATTR}="true"] select:focus,
      :root[${ROOT_ATTR}="true"] .form-control:focus{
        outline:none!important;
        border-color:var(--sdp-accent)!important;
        box-shadow:0 0 0 2px rgba(190,133,191,.25)!important
      }

      :root[${ROOT_ATTR}="true"] button,
      :root[${ROOT_ATTR}="true"] .btn,
      :root[${ROOT_ATTR}="true"] [type="button"],
      :root[${ROOT_ATTR}="true"] [type="submit"]{
        background:var(--sdp-surface-2)!important;
        color:var(--sdp-text)!important
      }

      :root[${ROOT_ATTR}="true"] .btn-primary,
      :root[${ROOT_ATTR}="true"] button.primary,
      :root[${ROOT_ATTR}="true"] [class*="primary"]{
        background:var(--sdp-accent)!important;
        border-color:var(--sdp-accent-2)!important;
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] a{
        color:var(--sdp-link)!important
      }

      :root[${ROOT_ATTR}="true"] .my-drop-zone,
      :root[${ROOT_ATTR}="true"] [class*="drop-zone"],
      :root[${ROOT_ATTR}="true"] .nv-file-over,
      :root[${ROOT_ATTR}="true"] .another-file-over-class{
        background:var(--sdp-surface)!important;
        background-color:var(--sdp-surface)!important;
        background-image:none!important;
        color:var(--sdp-text)!important;
        border-color:var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] .alert,
      :root[${ROOT_ATTR}="true"] .alert-warning,
      :root[${ROOT_ATTR}="true"] .alert-info,
      :root[${ROOT_ATTR}="true"] .alert-success,
      :root[${ROOT_ATTR}="true"] .alert-danger,
      :root[${ROOT_ATTR}="true"] .panel-warning,
      :root[${ROOT_ATTR}="true"] .panel-info,
      :root[${ROOT_ATTR}="true"] .panel-success,
      :root[${ROOT_ATTR}="true"] .panel-danger,
      :root[${ROOT_ATTR}="true"] .bg-warning,
      :root[${ROOT_ATTR}="true"] .bg-info,
      :root[${ROOT_ATTR}="true"] .bg-success,
      :root[${ROOT_ATTR}="true"] .bg-danger,
      :root[${ROOT_ATTR}="true"] [class*="alert"]{
        background:var(--sdp-surface)!important;
        background-color:var(--sdp-surface)!important;
        background-image:none!important;
        color:#fff!important;
        text-shadow:none!important;
        border-color:var(--sdp-border)!important;
        box-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li a,
      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li.nav-submenu ul.overrides a{
        background:var(--sdp-accent-2)!important;
        background-color:var(--sdp-accent-2)!important;
        color:var(--sdp-text-soft)!important;
        border-color:var(--sdp-border)!important;
        border-bottom-color:var(--sdp-border)!important;
        box-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li a:hover,
      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li.nav-submenu ul.overrides a:hover{
        background:${HOVER_BG}!important;
        color:var(--sdp-text)!important;
        border-bottom-color:var(--sdp-border)!important;
        box-shadow:none!important
      }

      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li.active>a,
      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li.active a,
      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li.current>a,
      :root[${ROOT_ATTR}="true"] nav.sidebar ul.links li.selected>a{
        background:var(--sdp-accent-2)!important;
        background-color:var(--sdp-accent-2)!important;
        color:#fff!important;
        border-color:var(--sdp-border)!important;
        border-bottom-color:var(--sdp-active-line)!important;
        box-shadow:inset 0 -3px 0 var(--sdp-active-line)!important
      }

      :root[${ROOT_ATTR}="true"] [role="tab"],
      :root[${ROOT_ATTR}="true"] .tab,
      :root[${ROOT_ATTR}="true"] [class*="tab"],
      :root[${ROOT_ATTR}="true"] .tabs a,
      :root[${ROOT_ATTR}="true"] .nav-tabs a,
      :root[${ROOT_ATTR}="true"] li>a{
        color:var(--sdp-text-soft)!important;
        border-color:var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] [role="tab"]:hover,
      :root[${ROOT_ATTR}="true"] .tab:hover,
      :root[${ROOT_ATTR}="true"] [class*="tab"]:hover,
      :root[${ROOT_ATTR}="true"] .tabs a:hover,
      :root[${ROOT_ATTR}="true"] .nav-tabs a:hover{
        background:${HOVER_BG}!important;
        color:var(--sdp-text)!important
      }

      :root[${ROOT_ATTR}="true"] .active,
      :root[${ROOT_ATTR}="true"] .selected,
      :root[${ROOT_ATTR}="true"] .current,
      :root[${ROOT_ATTR}="true"] .ui-tabs-active,
      :root[${ROOT_ATTR}="true"] .tabActive,
      :root[${ROOT_ATTR}="true"] [class*="tab"].active,
      :root[${ROOT_ATTR}="true"] [class*="tab"].selected,
      :root[${ROOT_ATTR}="true"] [class*="tab"].current,
      :root[${ROOT_ATTR}="true"] [class*="tab"][aria-selected="true"],
      :root[${ROOT_ATTR}="true"] [role="tab"][aria-selected="true"],
      :root[${ROOT_ATTR}="true"] .active>a,
      :root[${ROOT_ATTR}="true"] .selected>a,
      :root[${ROOT_ATTR}="true"] .current>a,
      :root[${ROOT_ATTR}="true"] .ui-tabs-active>a{
        background:${ACTIVE_BG}!important;
        background-color:${ACTIVE_BG}!important;
        color:${ACTIVE_TEXT}!important;
        border-color:${BORDER}!important;
        border-bottom-color:${ACTIVE_LINE}!important;
        box-shadow:inset 0 -3px 0 ${ACTIVE_LINE}!important
      }

      :root[${ROOT_ATTR}="true"] ul,
      :root[${ROOT_ATTR}="true"] ol,
      :root[${ROOT_ATTR}="true"] menu,
      :root[${ROOT_ATTR}="true"] [class*="dropdown"],
      :root[${ROOT_ATTR}="true"] [class*="menu"],
      :root[${ROOT_ATTR}="true"] [role="menu"],
      :root[${ROOT_ATTR}="true"] [role="listbox"]{
        color:var(--sdp-text)!important;
        border-color:var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] [class*="dropdown"],
      :root[${ROOT_ATTR}="true"] [class*="menu"],
      :root[${ROOT_ATTR}="true"] [role="menu"],
      :root[${ROOT_ATTR}="true"] [role="listbox"]{
        background:var(--sdp-surface)!important;
        box-shadow:var(--sdp-shadow)!important
      }

      :root[${ROOT_ATTR}="true"] .success,
      :root[${ROOT_ATTR}="true"] [class*="success"]{
        color:var(--sdp-success)!important
      }

      :root[${ROOT_ATTR}="true"] .warning,
      :root[${ROOT_ATTR}="true"] [class*="warn"]{
        color:var(--sdp-warn)!important
      }

      :root[${ROOT_ATTR}="true"] .danger,
      :root[${ROOT_ATTR}="true"] .error,
      :root[${ROOT_ATTR}="true"] [class*="danger"],
      :root[${ROOT_ATTR}="true"] [class*="error"]{
        color:var(--sdp-danger)!important
      }

      :root[${ROOT_ATTR}="true"] .cke,
      :root[${ROOT_ATTR}="true"] .cke_inner,
      :root[${ROOT_ATTR}="true"] .cke_top,
      :root[${ROOT_ATTR}="true"] .cke_bottom,
      :root[${ROOT_ATTR}="true"] .cke_contents,
      :root[${ROOT_ATTR}="true"] .cke_toolbar,
      :root[${ROOT_ATTR}="true"] .cke_toolgroup,
      :root[${ROOT_ATTR}="true"] .cke_combo_button,
      :root[${ROOT_ATTR}="true"] .cke_path,
      :root[${ROOT_ATTR}="true"] .cke_reset{
        background:#263445!important;
        background-color:#263445!important;
        color:var(--sdp-text)!important;
        border-color:var(--sdp-border)!important
      }

      :root[${ROOT_ATTR}="true"] .cke_button,
      :root[${ROOT_ATTR}="true"] .cke_button_label,
      :root[${ROOT_ATTR}="true"] .cke_combo_text,
      :root[${ROOT_ATTR}="true"] .cke_path_item,
      :root[${ROOT_ATTR}="true"] .cke_toolgroup a{
        color:var(--sdp-text)!important
      }

      :root[${ROOT_ATTR}="true"] .cke_button:hover,
      :root[${ROOT_ATTR}="true"] .cke_combo_button:hover,
      :root[${ROOT_ATTR}="true"] .cke_path_item:hover{
        background:rgba(190,133,191,.12)!important;
        color:#fff!important
      }

      :root[${ROOT_ATTR}="true"] .cke_button.cke_button_on,
      :root[${ROOT_ATTR}="true"] .cke_button.cke_button_off:hover{
        background:#7f5a86!important;
        color:#fff!important;
        border-color:#334155!important
      }

      :root[${ROOT_ATTR}="true"] .cke_wysiwyg_frame{
        background:#263445!important
      }

      :root[${ROOT_ATTR}="true"] .cke_button_icon{
        filter:brightness(0) invert(1)!important
      }

      :root[${ROOT_ATTR}="true"] .cke_button:hover .cke_button_icon,
      :root[${ROOT_ATTR}="true"] .cke_button.cke_button_on .cke_button_icon{
        filter:brightness(0) invert(1) drop-shadow(0 0 2px rgba(255,255,255,.3))!important
      }

      :root[${ROOT_ATTR}="true"] img,
      :root[${ROOT_ATTR}="true"] video,
      :root[${ROOT_ATTR}="true"] canvas,
      :root[${ROOT_ATTR}="true"] svg{
        filter:none!important
      }

      :root[${ROOT_ATTR}="true"] html{
        background:var(--sdp-bg)!important
      }
    `;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);

    patchLegacyBlueAreas(document);
    patchCkeditorFrames();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) patchLegacyBlueAreas(node);
          });
        }

        if (mutation.type === "attributes" && mutation.target && mutation.target.nodeType === 1) {
          patchLegacyBlueAreas(mutation.target);
        }
      });

      patchCkeditorFrames();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-selected"]
    });

    window[OBSERVER_KEY] = observer;
    console.log("SDP dark purple overlay applied");
  }

  function removeDarkOverlay() {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.removeAttribute(ROOT_ATTR);
    disconnectObserver();
    cleanupPatchedElements();
    console.log("SDP dark overlay removed");
  }

  CT.tools.enableDarkOverlay = applyDarkOverlay;
  CT.tools.disableDarkOverlay = removeDarkOverlay;
  CT.tools.toggleDarkOverlay = () => {
    if (document.getElementById(STYLE_ID)) removeDarkOverlay();
    else applyDarkOverlay();
  };

  CT.loaded.darkOverlay = true;
})();
