(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.pinkOverlay) return;

  const STYLE_ID = "sdp-pink-overlay-style";
  const OBSERVER_KEY = "__sdpPinkOverlayObserver";
  const ROOT_ATTR = "data-sdp-pink-overlay";
  const PATCHED_ATTR = "data-sdp-pink-patched";
  const CKEDITOR_STYLE_ID = "sdp-pink-ckeditor-frame-style";

  const LEGACY_BLUE_SET = new Set([
    "rgb(101, 165, 218)",
    "rgb(66, 139, 202)",
    "rgb(10, 90, 156)",
    "rgb(51, 122, 183)"
  ]);

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
    el.style.removeProperty("fill");
  }

  function cleanupPatchedElements() {
    document.querySelectorAll(`[${PATCHED_ATTR}='true']`).forEach((el) => {
      el.removeAttribute(PATCHED_ATTR);
      clearPatchedStyles(el);
    });

    document.querySelectorAll("iframe.cke_wysiwyg_frame").forEach((iframe) => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const style = doc?.getElementById(CKEDITOR_STYLE_ID);
        style?.remove();
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
    if (!el || el.nodeType !== 1) return false;
    return LEGACY_BLUE_SET.has(window.getComputedStyle(el).backgroundColor);
  }

  function patchLegacyBlueElement(el) {
    if (!el || el.nodeType !== 1) return;

    const cs = window.getComputedStyle(el);
    if (!LEGACY_BLUE_SET.has(cs.backgroundColor)) return;

    el.setAttribute(PATCHED_ATTR, "true");
    el.style.setProperty("background", "#de7fb0", "important");
    el.style.setProperty("background-color", "#de7fb0", "important");
    el.style.setProperty("background-image", "none", "important");
    el.style.setProperty("color", isActiveLike(el) ? "#ffffff" : "#ffe2ee", "important");
    el.style.setProperty("border-color", "#cf98b3", "important");
    el.style.setProperty("text-shadow", "none", "important");

    if (isActiveLike(el)) {
      el.style.setProperty("border-bottom-color", "#ff99ca", "important");
      el.style.setProperty("box-shadow", "inset 0 -3px 0 #ff99ca", "important");
    } else {
      el.style.setProperty("border-bottom-color", "#cf98b3", "important");
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
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc?.head) return;

        let style = doc.getElementById(CKEDITOR_STYLE_ID);
        if (!style) {
          style = doc.createElement("style");
          style.id = CKEDITOR_STYLE_ID;
          doc.head.appendChild(style);
        }

        style.textContent = `
          html, body {
            background: #ebb0c8 !important;
            color: #fff6fa !important;
          }
          body { color: #fff6fa !important; }
          p, div, span, li, td, th { color: #fff6fa !important; }
          a { color: #ffb8d8 !important; }
          table, td, th { border-color: #cf98b3 !important; }
          blockquote {
            border-left: 3px solid #ff99ca !important;
            padding-left: 10px !important;
            color: #fff6fa !important;
          }
        `;
      } catch {}
    });
  }

  function applyPinkOverlay() {
    if (document.getElementById(STYLE_ID)) return;

    document.documentElement.setAttribute(ROOT_ATTR, "true");

    const css = `
      :root[${ROOT_ATTR}="true"] {
        --sdp-bg: #24161d;
        --sdp-bg-2: #311d27;
        --sdp-bg-3: #452737;
        --sdp-surface: #8f5d73;
        --sdp-surface-2: #ebb0c8;
        --sdp-surface-3: #553142;
        --sdp-border: #cf98b3;
        --sdp-text: #fff6fa;
        --sdp-text-soft: #ffe2ee;
        --sdp-text-dim: #f6c4d8;
        --sdp-link: #ffb8d8;
        --sdp-accent: #ff99ca;
        --sdp-accent-2: #de7fb0;
        --sdp-success: #22c55e;
        --sdp-warn: #f2b36f;
        --sdp-danger: #ef7f9a;
        --sdp-shadow: 0 8px 24px rgba(0,0,0,.24);
        --sdp-radius: 8px;
        --sdp-active-line: #ff99ca;
      }

      :root[${ROOT_ATTR}="true"],
      :root[${ROOT_ATTR}="true"] body {
        background: var(--sdp-bg) !important;
        color: var(--sdp-text) !important;
        color-scheme: dark !important;
      }

      :root[${ROOT_ATTR}="true"] [style*="background: #fff"],
      :root[${ROOT_ATTR}="true"] [style*="background:#fff"],
      :root[${ROOT_ATTR}="true"] [style*="background: rgb(255, 255, 255)"],
      :root[${ROOT_ATTR}="true"] [style*="background:rgb(255,255,255)"] {
        background: var(--sdp-surface-2) !important;
        background-color: var(--sdp-surface-2) !important;
        background-image: none !important;
        color: var(--sdp-text) !important;
        border-color: var(--sdp-border) !important;
        box-shadow: none !important;
        text-shadow: none !important;
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
      :root[${ROOT_ATTR}="true"] .content {
        background-color: transparent;
        color: var(--sdp-text) !important;
      }

      :root[${ROOT_ATTR}="true"] body *:not(svg):not(path):not(img):not(video):not(canvas):not(iframe) {
        border-color: var(--sdp-border) !important;
        box-shadow: none !important;
      }

      :root[${ROOT_ATTR}="true"] header,
      :root[${ROOT_ATTR}="true"] nav,
      :root[${ROOT_ATTR}="true"] [role="navigation"],
      :root[${ROOT_ATTR}="true"] [class*="header"],
      :root[${ROOT_ATTR}="true"] [class*="topbar"],
      :root[${ROOT_ATTR}="true"] [class*="navbar"],
      :root[${ROOT_ATTR}="true"] [class*="toolbar"] {
        background: var(--sdp-bg-2) !important;
        color: var(--sdp-text) !important;
        border-bottom: 1px solid var(--sdp-border) !important;
      }

      :root[${ROOT_ATTR}="true"] aside,
      :root[${ROOT_ATTR}="true"] [class*="sidebar"],
      :root[${ROOT_ATTR}="true"] [class*="sidemenu"],
      :root[${ROOT_ATTR}="true"] [class*="leftNav"],
      :root[${ROOT_ATTR}="true"] nav.sidebar {
        background: var(--sdp-bg-2) !important;
        color: var(--sdp-text-soft) !important;
        border-right: 1px solid var(--sdp-border) !important;
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
      :root[${ROOT_ATTR}="true"] [class*="modal"] {
        background: var(--sdp-surface) !important;
        background-color: var(--sdp-surface) !important;
        background-image: none !important;
        color: var(--sdp-text) !important;
        border: 1px solid var(--sdp-border) !important;
        border-radius: var(--sdp-radius) !important;
        box-shadow: var(--sdp-shadow) !important;
        text-shadow: none !important;
      }

      :root[${ROOT_ATTR}="true"] .panel-title,
      :root[${ROOT_ATTR}="true"] .modal-title,
      :root[${ROOT_ATTR}="true"] .panel-heading *,
      :root[${ROOT_ATTR}="true"] .modal-header * {
        color: var(--sdp-text) !important;
      }

      :root[${ROOT_ATTR}="true"] table,
      :root[${ROOT_ATTR}="true"] [role="table"] {
        background: var(--sdp-surface) !important;
      }

      :root[${ROOT_ATTR}="true"] table,
      :root[${ROOT_ATTR}="true"] thead,
      :root[${ROOT_ATTR}="true"] tbody,
      :root[${ROOT_ATTR}="true"] tr,
      :root[${ROOT_ATTR}="true"] th,
      :root[${ROOT_ATTR}="true"] td,
      :root[${ROOT_ATTR}="true"] [role="row"],
      :root[${ROOT_ATTR}="true"] [role="cell"] {
        color: #fff !important;
        border-color: var(--sdp-border) !important;
      }

      :root[${ROOT_ATTR}="true"] thead,
      :root[${ROOT_ATTR}="true"] th {
        background: var(--sdp-bg-3) !important;
        color: var(--sdp-text-soft) !important;
      }

      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(odd),
      :root[${ROOT_ATTR}="true"] table > tbody > tr:nth-child(odd),
      :root[${ROOT_ATTR}="true"] .table-striped > tbody > tr:nth-child(odd) > td,
      :root[${ROOT_ATTR}="true"] .table-striped > tbody > tr:nth-child(odd) > th {
        background: #553142 !important;
        background-color: #553142 !important;
        color: #fff !important;
      }

      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(even),
      :root[${ROOT_ATTR}="true"] table > tbody > tr:nth-child(even),
      :root[${ROOT_ATTR}="true"] .table-striped > tbody > tr:nth-child(even) > td,
      :root[${ROOT_ATTR}="true"] .table-striped > tbody > tr:nth-child(even) > th,
      :root[${ROOT_ATTR}="true"] tbody td,
      :root[${ROOT_ATTR}="true"] tbody th {
        background: var(--sdp-surface) !important;
        background-color: var(--sdp-surface) !important;
        color: #fff !important;
      }

      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(odd) td,
      :root[${ROOT_ATTR}="true"] tbody tr:nth-child(odd) th {
        background: linear-gradient(0deg, rgba(255,170,210,.10), rgba(255,170,210,.10)), #553142 !important;
        color: #fff !important;
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child,
      :root[${ROOT_ATTR}="true"] tr.selected-child td,
      :root[${ROOT_ATTR}="true"] tr.selected-child th {
        background: linear-gradient(0deg, rgba(255,170,210,.24), rgba(255,170,210,.24)), #9b667d !important;
        background-color: #9b667d !important;
        color: #fff6fa !important;
        font-weight: 600 !important;
        box-shadow: none !important;
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child td:first-child {
        box-shadow: inset 4px 0 0 var(--sdp-active-line) !important;
      }

      :root[${ROOT_ATTR}="true"] tr.selected-child a,
      :root[${ROOT_ATTR}="true"] tr.selected-child .ng-binding {
        color: #fff6fa !important;
        font-weight: 700 !important;
      }

      :root[${ROOT_ATTR}="true"] tbody tr:hover,
      :root[${ROOT_ATTR}="true"] [role="row"]:hover {
        background: rgba(255,170,210,.30) !important;
      }

      :root[${ROOT_ATTR}="true"] tbody tr:hover td,
      :root[${ROOT_ATTR}="true"] tbody tr:hover th {
        background: linear-gradient(0deg, rgba(255,170,210,.16), rgba(255,170,210,.16)), var(--sdp-surface) !important;
        color: #fff !important;
      }

      :root[${ROOT_ATTR}="true"] input,
      :root[${ROOT_ATTR}="true"] textarea,
      :root[${ROOT_ATTR}="true"] select,
      :root[${ROOT_ATTR}="true"] button,
      :root[${ROOT_ATTR}="true"] .form-control {
        background: var(--sdp-surface-2) !important;
        color: var(--sdp-text) !important;
        border: 1px solid var(--sdp-border) !important;
        border-radius: 6px !important;
      }

      :root[${ROOT_ATTR}="true"] input::placeholder,
      :root[${ROOT_ATTR}="true"] textarea::placeholder {
        color: var(--sdp-text-dim) !important;
      }

      :root[${ROOT_ATTR}="true"] input:focus,
      :root[${ROOT_ATTR}="true"] textarea:focus,
      :root[${ROOT_ATTR}="true"] select:focus,
      :root[${ROOT_ATTR}="true"] .form-control:focus {
        outline: none !important;
        border-color: var(--sdp-accent) !important;
        box-shadow: 0 0 0 2px rgba(255,170,210,.34) !important;
      }

      :root[${ROOT_ATTR}="true"] button,
      :root[${ROOT_ATTR}="true"] .btn,
      :root[${ROOT_ATTR}="true"] [type="button"],
      :root[${ROOT_ATTR}="true"] [type="submit"],
      :root[${ROOT_ATTR}="true"] [class*="btn"],
      :root[${ROOT_ATTR}="true"] button *,
      :root[${ROOT_ATTR}="true"] .btn *,
      :root[${ROOT_ATTR}="true"] [type="button"] *,
      :root[${ROOT_ATTR}="true"] [type="submit"] *,
      :root[${ROOT_ATTR}="true"] [class*="btn"] * {
        color: #fff !important;
        fill: #fff !important;
      }

      :root[${ROOT_ATTR}="true"] .btn-primary,
      :root[${ROOT_ATTR}="true"] button.primary,
      :root[${ROOT_ATTR}="true"] [class*="primary"] {
        background: var(--sdp-accent) !important;
        border-color: var(--sdp-accent-2) !important;
        color: #fff !important;
      }

      :root[${ROOT_ATTR}="true"] a {
        color: var(--sdp-link) !important;
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
      :root[${ROOT_ATTR}="true"] .cke_reset {
        background: #ebb0c8 !important;
        background-color: #ebb0c8 !important;
        color: var(--sdp-text) !important;
        border-color: var(--sdp-border) !important;
      }

      :root[${ROOT_ATTR}="true"] .cke_button,
      :root[${ROOT_ATTR}="true"] .cke_button_label,
      :root[${ROOT_ATTR}="true"] .cke_combo_text,
      :root[${ROOT_ATTR}="true"] .cke_path_item,
      :root[${ROOT_ATTR}="true"] .cke_toolgroup a {
        color: var(--sdp-text) !important;
      }

      :root[${ROOT_ATTR}="true"] .cke_button_icon {
        filter: brightness(0) invert(1) !important;
      }

      :root[${ROOT_ATTR}="true"] img,
      :root[${ROOT_ATTR}="true"] video,
      :root[${ROOT_ATTR}="true"] canvas,
      :root[${ROOT_ATTR}="true"] svg {
        filter: none !important;
      }

      :root[${ROOT_ATTR}="true"] html {
        background: var(--sdp-bg) !important;
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

        if (mutation.type === "attributes" && mutation.target?.nodeType === 1) {
          patchLegacyAreas(mutation.target);
        }
      });

      patchCkeditorFrames();
    });

    function patchLegacyAreas(target) {
      patchLegacyBlueAreas(target);
    }

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-selected"]
    });

    window[OBSERVER_KEY] = observer;
  }

  function removePinkOverlay() {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.removeAttribute(ROOT_ATTR);
    disconnectObserver();
    cleanupPatchedElements();
  }

  CT.tools.enablePinkOverlay = applyPinkOverlay;
  CT.tools.disablePinkOverlay = removePinkOverlay;
  CT.tools.togglePinkOverlay = () => {
    if (document.getElementById(STYLE_ID)) removePinkOverlay();
    else applyPinkOverlay();
  };

  CT.loaded.pinkOverlay = true;
})();
