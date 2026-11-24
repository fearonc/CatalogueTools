(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.state.isOpen) {
    CT.state.cleanup?.();
    return;
  }

  const PALETTE_ID = "__tool_palette__";
  const STYLE_ID = "__tool_palette_style__";

  if (document.getElementById(PALETTE_ID)) {
    document.getElementById(PALETTE_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;

  style.textContent = `
    #${PALETTE_ID} {
      position: fixed;
      right: 14px;
      bottom: 14px;
      width: 320px;
      max-height: calc(100vh - 28px);
      z-index: 2147483649;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    #${PALETTE_ID} * {
      box-sizing: border-box;
    }

    #${PALETTE_ID} .tp-box {
      width: 100%;
      max-height: calc(100vh - 28px);
      background: rgba(15,17,23,.96);
      color: #e8ecf3;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
      overflow: hidden;
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
    }

    #${PALETTE_ID} .tp-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 12px 12px 10px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      font-size: 12px;
      letter-spacing: .03em;
      color: #aab4c3;
      cursor: move;
      user-select: none;
    }

    #${PALETTE_ID} .tp-title {
      font-size: 14px;
      color: #fff;
      margin-bottom: 3px;
    }

    #${PALETTE_ID} .tp-close {
      border: 0;
      background: rgba(255,255,255,.06);
      color: #cfd7e3;
      width: 24px;
      height: 24px;
      border-radius: 7px;
      cursor: pointer;
      font: 16px/1 monospace;
    }

    #${PALETTE_ID} .tp-close:hover {
      background: rgba(255,255,255,.12);
      color: #fff;
    }

    /* ---- Page toggle (Catalogue / Supplier) ---- */
    #${PALETTE_ID} .tp-pages {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin: 10px 12px 2px;
      padding: 3px;
      background: rgba(255,255,255,.06);
      border-radius: 999px;
      flex: 0 0 auto;
    }

    #${PALETTE_ID} .tp-pages-pill {
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: 3px;
      width: calc(50% - 3px);
      border-radius: 999px;
      background: #3b4a6b;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
      transition: transform .28s cubic-bezier(.4,0,.2,1);
    }

    #${PALETTE_ID} .tp-pages button {
      position: relative;
      z-index: 1;
      border: 0;
      background: transparent;
      color: #94a0b3;
      font: 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: .03em;
      padding: 8px 0;
      border-radius: 999px;
      cursor: pointer;
      transition: color .2s;
    }

    #${PALETTE_ID} .tp-pages button:hover {
      color: #dce3ee;
    }

    #${PALETTE_ID} .tp-pages button.on {
      color: #fff;
    }

    /* ---- Sliding pages ---- */
    #${PALETTE_ID} .tp-viewport {
      position: relative;
      overflow: hidden;
      flex: 0 1 auto;
      min-height: 0;
      transition: height .28s cubic-bezier(.4,0,.2,1);
    }

    #${PALETTE_ID} .tp-track {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 200%;
      display: flex;
      transition: transform .28s cubic-bezier(.4,0,.2,1);
    }

    #${PALETTE_ID} .tp-page {
      flex: 0 0 50%;
      width: 50%;
      height: 100%;
      padding: 8px;
      overflow-y: auto;
    }

    @media (prefers-reduced-motion: reduce) {
      #${PALETTE_ID} .tp-pages-pill,
      #${PALETTE_ID} .tp-viewport,
      #${PALETTE_ID} .tp-track {
        transition: none;
      }
    }

    #${PALETTE_ID} .tp-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      color: #dce3ee;
      margin-bottom: 4px;
    }

    #${PALETTE_ID} .tp-item:last-child {
      margin-bottom: 0;
    }

    #${PALETTE_ID} .tp-item:hover,
    #${PALETTE_ID} .tp-item.active {
      background: rgba(255,255,255,.06);
    }

    #${PALETTE_ID} .tp-left {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }

    #${PALETTE_ID} .tp-num {
      width: 20px;
      height: 20px;
      border-radius: 6px;
      background: rgba(255,255,255,.08);
      display: grid;
      place-items: center;
      font-size: 11px;
      color: #fff;
      flex: 0 0 auto;
    }

    #${PALETTE_ID} .tp-name {
      font-size: 13px;
    }

    #${PALETTE_ID} .tp-desc {
      font-size: 11px;
      color: #94a0b3;
    }

    #${PALETTE_ID} .tp-status {
      font-size: 10px;
      padding: 3px 6px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: #cfd7e3;
      flex: 0 0 auto;
    }

    #${PALETTE_ID} .tp-status.on {
      background: rgba(80,200,120,.18);
      color: #9ff0b3;
    }

    #${PALETTE_ID} .tp-toggles {
      border-top: 1px solid rgba(255,255,255,.08);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #${PALETTE_ID} .tp-toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    #${PALETTE_ID} .tp-toggle-label {
      font-size: 13px;
      color: #dce3ee;
    }

    #${PALETTE_ID} .tp-switch {
      position: relative;
      display: inline-block;
      width: 42px;
      height: 22px;
      flex-shrink: 0;
      margin: 0;
    }

    #${PALETTE_ID} .tp-switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }

    #${PALETTE_ID} .tp-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background-color: rgba(255,255,255,0.15);
      transition: .3s;
      border-radius: 22px;
    }

    #${PALETTE_ID} .tp-knob {
      position: absolute;
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      border-radius: 50%;
      transition: .3s;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #111827;
      font-size: 11px;
      line-height: 1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    #${PALETTE_ID} .tp-switch input:checked + .tp-slider.dark-slider {
      background-color: #22c55e;
    }

    #${PALETTE_ID} .tp-switch input:checked + .tp-slider.pink-slider {
      background-color: #ec4899;
    }

    #${PALETTE_ID} .tp-switch input:checked + .tp-slider .tp-knob {
      transform: translateX(20px);
    }

    #${PALETTE_ID} .tp-switch input:checked + .tp-slider.dark-slider .tp-knob {
      filter: invert(1);
    }

    #${PALETTE_ID} .tp-foot {
      padding: 8px 12px;
      border-top: 1px solid rgba(255,255,255,.08);
      font-size: 11px;
      color: #8e99aa;
    }
  `;

  document.head.appendChild(style);

  /*
   * Every tool in the toolkit.
   *
   * i    = the tool's number. Must match the `if (i === N)` block in run().
   * key  = the name used by the RUN/ON badge (data-s).
   *
   * To add a tool: add an entry here, then list its `i` under the
   * page(s) it should appear on in PAGES below.
   */
  const TOOLS = [
    {
      i: 0,
      key: "bulk",
      name: "Relationship Option Bulk Update",
      desc: "Paste from Excel to update Relationship options"
    },
    {
      i: 1,
      key: "bulkAddAndUpdate",
      name: "Bulk Add & Update Children",
      desc: "Add and/or update child SKUs in bulk"
    },
    {
      i: 2,
      key: "bulkLinkedOptions",
      name: "Bulk Add & Update Linked SKUs",
      desc: "Add and/or update linked SKUs in bulk"
    },
    {
      i: 3,
      key: "shadeDuplicateCheck",
      name: "Shade Duplicate Check",
      desc: "Find duplicate HEX codes or shade names"
    },
    {
      i: 4,
      key: "imageTools",
      name: "Matrix Image Tools",
      desc: "Reorder images or free up / normalise slots"
    },
    {
      i: 5,
      key: "auditSearch",
      name: "Audit History Search",
      desc: "Search collapsed audit rows and navigate matches"
    },
    {
      i: 6,
      key: "quoteWrap",
      name: 'Wrap for SQL "In" list',
      desc: "Type or paste from Excel to wrap in quotes"
    },
    {
      i: 7,
      key: "jsonViewer",
      name: "JSON Viewer",
      desc: "Pretty JSON with search"
    },
    {
      i: 8,
      key: "tableFilter",
      name: "Table Filter & Sort",
      desc: "Filter and sort the table by column"
    }
  ];

  /*
   * Which tools each team page shows, in display order.
   * A tool can be listed on more than one page.
   * (The toggle and slide layout are built for exactly two pages.)
   */
  const PAGES = [
    {
      id: "catalogue",
      label: "Catalogue",
      tools: [0, 1, 2, 3, 5, 6, 7, 8]
    },
    {
      id: "supplier",
      label: "Supplier",
      tools: [4, 7, 5]
    }
  ];

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const itemHTML = (tool, number) => `
    <div class="tp-item" data-i="${tool.i}">
      <div class="tp-left">
        <div class="tp-num">${number}</div>

        <div>
          <div class="tp-name">${esc(tool.name)}</div>
          <div class="tp-desc">${esc(tool.desc)}</div>
        </div>
      </div>

      <div class="tp-status" data-s="${tool.key}">RUN</div>
    </div>
  `;

  const pageHTML = (page) => `
    <div class="tp-page" data-page="${page.id}">
      <div class="tp-page-inner">
        ${page.tools
          .map((id) => TOOLS.find((tool) => tool.i === id))
          .filter(Boolean)
          .map((tool, index) => itemHTML(tool, index + 1))
          .join("")}
      </div>
    </div>
  `;

  const root = document.createElement("div");
  root.id = PALETTE_ID;

  root.innerHTML = `
    <div class="tp-box">
      <div class="tp-head">
        <div>
          <div class="tp-title">Catalogue & SC Tool Kit</div>
          <div>Draggable • Esc to close</div>
        </div>

        <button class="tp-close" title="Close">×</button>
      </div>

      <div class="tp-pages" role="tablist" aria-label="Team page">
        <div class="tp-pages-pill"></div>
        ${PAGES.map((page, n) => `<button type="button" role="tab" data-page-btn="${n}">${esc(page.label)}</button>`).join("")}
      </div>

      <div class="tp-viewport">
        <div class="tp-track">
          ${PAGES.map(pageHTML).join("")}
        </div>
      </div>

      <div class="tp-toggles">
        <div class="tp-toggle-row">
          <span class="tp-toggle-label">
            Dark Mode Overlay
          </span>

          <label class="tp-switch">
            <input
              type="checkbox"
              id="__ct_dark_toggle__"
            >

            <span class="tp-slider dark-slider">
              <span class="tp-knob">☽</span>
            </span>
          </label>
        </div>

        <div class="tp-toggle-row">
          <span class="tp-toggle-label">
            Pink Mode Overlay
          </span>

          <label class="tp-switch">
            <input
              type="checkbox"
              id="__ct_pink_toggle__"
            >

            <span class="tp-slider pink-slider">
              <span class="tp-knob"></span>
            </span>
          </label>
        </div>
      </div>

      <div class="tp-foot">
        Click items to run
      </div>
    </div>
  `;

  document.body.appendChild(root);

  CT.state.bulkUpdateOpen = false;
  CT.state.bulkAddAndUpdateOpen = false;
  CT.state.bulkLinkedOptionsOpen = false;
  CT.state.shadeDuplicateCheckOpen = false;
  CT.state.quoteWrapOpen = false;

  CT.state.tableFilterOpen =
    !!document.getElementById(
      "ct-table-filter-bar"
    );

  CT.state.auditSearchOpen =
    !!document.getElementById(
      "__audit_search_panel__"
    );

  CT.state.jsonViewerOpen =
    !!document.getElementById(
      "__json_viewer_overlay__"
    );

  CT.state.imageToolsOpen =
    !!window.__thgImageToolsOpen ||
    !!window.__thgReorderToolOpen;

  const statusBulk =
    root.querySelectorAll(
      '[data-s="bulk"]'
    );

  const statusBulkAddAndUpdate =
    root.querySelectorAll(
      '[data-s="bulkAddAndUpdate"]'
    );

  const statusBulkLinkedOptions =
    root.querySelectorAll(
      '[data-s="bulkLinkedOptions"]'
    );

  const statusShadeDuplicateCheck =
    root.querySelectorAll(
      '[data-s="shadeDuplicateCheck"]'
    );

  const statusImageTools =
    root.querySelectorAll(
      '[data-s="imageTools"]'
    );

  const statusAuditSearch =
    root.querySelectorAll(
      '[data-s="auditSearch"]'
    );

  const statusQuoteWrap =
    root.querySelectorAll(
      '[data-s="quoteWrap"]'
    );

  const statusJsonViewer =
    root.querySelectorAll(
      '[data-s="jsonViewer"]'
    );

  const statusTableFilter =
    root.querySelectorAll(
      '[data-s="tableFilter"]'
    );

  function refreshStatus() {
    // A tool can appear on more than one page, so each status lookup
    // returns every matching badge (a NodeList) and all are updated.
    const set = (elements, isOn) => {
      if (!elements) return;

      elements.forEach((element) => {
        element.textContent =
          isOn ? "ON" : "RUN";

        element.classList.toggle(
          "on",
          !!isOn
        );
      });
    };

    set(
      statusBulk,
      CT.state.bulkUpdateOpen === true
    );

    set(
      statusBulkAddAndUpdate,
      CT.state.bulkAddAndUpdateOpen === true
    );

    set(
      statusBulkLinkedOptions,
      CT.state.bulkLinkedOptionsOpen === true
    );

    set(
      statusShadeDuplicateCheck,
      CT.state.shadeDuplicateCheckOpen === true
    );

    set(
      statusImageTools,
      CT.state.imageToolsOpen === true ||
      window.__thgImageToolsOpen === true ||
      window.__thgReorderToolOpen === true
    );

    set(
      statusAuditSearch,
      CT.state.auditSearchOpen === true
    );

    set(
      statusQuoteWrap,
      CT.state.quoteWrapOpen === true
    );

    set(
      statusJsonViewer,
      CT.state.jsonViewerOpen === true
    );

    set(
      statusTableFilter,
      CT.state.tableFilterOpen === true
    );
  }

  CT.tools.refreshStatus = refreshStatus;

  const closeBtn =
    root.querySelector(".tp-close");

  const head =
    root.querySelector(".tp-head");

  const darkToggle =
    root.querySelector(
      "#__ct_dark_toggle__"
    );

  const pinkToggle =
    root.querySelector(
      "#__ct_pink_toggle__"
    );

  darkToggle.checked =
    !!document.getElementById(
      "sdp-dark-overlay-style"
    );

  pinkToggle.checked =
    !!document.getElementById(
      "sdp-pink-overlay-style"
    );

  let drag = false;
  let sx = 0;
  let sy = 0;
  let startL = 0;
  let startT = 0;

  function setActiveItem(item) {
    root
      .querySelectorAll(".tp-item.active")
      .forEach((element) => {
        element.classList.remove("active");
      });

    item?.classList.add("active");
  }

  // ---- Pages (Catalogue / Supplier) ----
  const pagesBar =
    root.querySelector(".tp-pages");

  const pill =
    root.querySelector(".tp-pages-pill");

  const pageBtns = [
    ...root.querySelectorAll("[data-page-btn]")
  ];

  const viewport =
    root.querySelector(".tp-viewport");

  const track =
    root.querySelector(".tp-track");

  const pageEls = [
    ...root.querySelectorAll(".tp-page")
  ];

  const PAGE_KEY = "__ct_active_page__";

  // Remember the last page: first within this page load,
  // then across page loads, so a team doesn't have to re-select it.
  const readSavedPage = () => {
    try {
      const saved = Number(
        localStorage.getItem(PAGE_KEY)
      );

      return Number.isInteger(saved) &&
        saved >= 0 &&
        saved < PAGES.length
        ? saved
        : 0;
    } catch {
      return 0;
    }
  };

  let pageIdx = Number.isInteger(CT.state.activePage)
    ? CT.state.activePage
    : readSavedPage();

  // Size the viewport to the active page so the box grows/shrinks
  // smoothly instead of leaving empty space under the shorter page.
  function fitHeight() {
    const inner = pageEls[pageIdx]?.firstElementChild;

    if (inner) {
      viewport.style.height =
        inner.offsetHeight + 16 + "px";
    }
  }

  function showPage(n, animate = true) {
    pageIdx = n;
    CT.state.activePage = n;

    try {
      localStorage.setItem(PAGE_KEY, String(n));
    } catch {}

    const animated = [track, pill, viewport];

    if (!animate) {
      animated.forEach((element) => {
        element.style.transition = "none";
      });
    }

    track.style.transform =
      `translateX(${-50 * n}%)`;

    pill.style.transform =
      `translateX(${100 * n}%)`;

    pageBtns.forEach((button, index) => {
      button.classList.toggle("on", index === n);

      button.setAttribute(
        "aria-selected",
        String(index === n)
      );
    });

    pageEls.forEach((page, index) => {
      page.setAttribute(
        "aria-hidden",
        String(index !== n)
      );

      try {
        page.inert = index !== n;
      } catch {}
    });

    fitHeight();

    setActiveItem(
      pageEls[n]?.querySelector(".tp-item")
    );

    if (!animate) {
      // Force a reflow so the un-animated position is applied
      // before transitions are switched back on.
      void track.offsetWidth;

      animated.forEach((element) => {
        element.style.transition = "";
      });
    }
  }

  function run(i) {
    // Restore the table (unhide rows / original order) before any other tool
    // runs, so bulk tools never work against a filtered or re-sorted table
    if (i !== 8) {
      CT.state.tableFilterCleanup?.();
    }

    if (i === 0) {
      CT.tools.runBulkUpdateTool?.();
    }

    if (i === 1) {
      CT.tools.runBulkAddAndUpdateTool?.();
    }

    if (i === 2) {
      CT.tools.runBulkLinkedOptionsTool?.();
    }

    if (i === 3) {
      CT.tools.runShadeDuplicateCheckTool?.();
    }

    if (i === 4) {
      CT.tools.runImageReorderTool?.();
    }

    if (i === 5) {
      CT.tools.runAuditHistorySearchTool?.();
    }

    if (i === 6) {
      CT.tools.runQuoteWrapTool?.();
    }

    if (i === 7) {
      CT.tools.runJsonViewerTool?.();
    }

    if (i === 8) {
      CT.tools.runTableFilterTool?.();
    }

    refreshStatus();
  }

  function onKey(event) {
    if (event.key === "Escape") {
      cleanup();
    }
  }

  function onClick(event) {
    const item =
      event.target.closest(".tp-item");

    if (item) {
      run(Number(item.dataset.i));
    }
  }

  function onDragStart(event) {
    if (
      event.target.closest(".tp-close")
    ) {
      return;
    }

    if (
      event.target.closest(".tp-item")
    ) {
      return;
    }

    drag = true;

    const rect =
      root.getBoundingClientRect();

    root.style.left =
      rect.left + "px";

    root.style.top =
      rect.top + "px";

    root.style.right = "auto";
    root.style.bottom = "auto";

    sx = event.clientX;
    sy = event.clientY;
    startL = rect.left;
    startT = rect.top;

    event.preventDefault();
  }

  function onDragMove(event) {
    if (!drag) return;

    let left =
      startL + (event.clientX - sx);

    let top =
      startT + (event.clientY - sy);

    const maxLeft =
      window.innerWidth -
      root.offsetWidth -
      8;

    const maxTop =
      window.innerHeight -
      root.offsetHeight -
      8;

    left = Math.max(
      8,
      Math.min(maxLeft, left)
    );

    top = Math.max(
      8,
      Math.min(maxTop, top)
    );

    root.style.left =
      left + "px";

    root.style.top =
      top + "px";
  }

  function onDragEnd() {
    drag = false;
  }

  darkToggle?.addEventListener(
    "change",
    (event) => {
      if (event.target.checked) {
        pinkToggle.checked = false;

        CT.tools.disablePinkOverlay?.();
        CT.tools.enableDarkOverlay?.();
      } else {
        CT.tools.disableDarkOverlay?.();
      }
    }
  );

  pinkToggle?.addEventListener(
    "change",
    (event) => {
      if (event.target.checked) {
        darkToggle.checked = false;

        CT.tools.disableDarkOverlay?.();
        CT.tools.enablePinkOverlay?.();
      } else {
        CT.tools.disablePinkOverlay?.();
      }
    }
  );

  function cleanup() {
    window.removeEventListener(
      "keydown",
      onKey,
      true
    );

    window.removeEventListener(
      "mousemove",
      onDragMove,
      true
    );

    window.removeEventListener(
      "mouseup",
      onDragEnd,
      true
    );

    root.remove();
    style.remove();

    delete CT.tools.refreshStatus;

    CT.state.isOpen = false;

    delete CT.state.cleanup;
  }

  root.addEventListener("mouseover", (event) => {
    const item =
      event.target.closest(".tp-item");

    if (item) setActiveItem(item);
  });

  pageBtns.forEach((button, index) => {
    button.addEventListener("click", () => {
      if (index !== pageIdx) showPage(index);
    });
  });

  root.addEventListener(
    "mousedown",
    onClick
  );

  closeBtn.addEventListener(
    "click",
    cleanup
  );

  head.addEventListener(
    "mousedown",
    onDragStart
  );

  window.addEventListener(
    "mousemove",
    onDragMove,
    true
  );

  window.addEventListener(
    "mouseup",
    onDragEnd,
    true
  );

  window.addEventListener(
    "keydown",
    onKey,
    true
  );

  showPage(pageIdx, false);

  refreshStatus();

  CT.state.isOpen = true;
  CT.state.cleanup = cleanup;
})();
