(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.imageTools) return;

  CT.tools.runImageReorderTool = async function () {
    const setToolOpen = (isOpen) => {
      CT.state.imageToolsOpen = !!isOpen;
      CT.tools.refreshStatus?.();
    };

    const PANEL_SELECTOR = 'div.panel.panel-default';
    const HEADING_SELECTOR = '.panel-heading';
    const TABLE_BODY_SELECTOR = 'table.table.table-striped tbody';
    const ROW_SELECTOR = 'tr[ng-repeat*="imageDetails in imageAndSubsiteDetails.images"]';
    const THUMB_SELECTOR = 'img.image-thumbnail';
    const ORDER_CELL_SELECTOR = 'td.center.ng-binding';
    const REORDER_BTN_SELECTOR = 'button.btn.btn-primary[ng-click^="reorderImage"]';

    const MODAL_SELECTOR = '.modal-dialog';
    const MODAL_INPUT_SELECTOR = `${MODAL_SELECTOR} input[ng-model="value"]`;
    const MODAL_OK_SELECTOR = `${MODAL_SELECTOR} .modal-footer .btn-success`;

    const OPEN_TIMEOUT_MS = 7000;
    const CLOSE_TIMEOUT_MS = 15000;
    const STEP_GAP_MS = 60;

    if (CT.state.imageToolsOpen) {
      return;
    }

    setToolOpen(true);

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const normSrc = (s) => String(s || "").split("?")[0].toLowerCase();

    async function waitFor(sel, timeoutMs) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const el = document.querySelector(sel);
        if (el) return el;
        await sleep(20);
      }
      throw new Error(`Timed out waiting for: ${sel}`);
    }

    async function waitGone(sel, timeoutMs) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (!document.querySelector(sel)) return;
        await sleep(20);
      }
      throw new Error(`Timed out waiting for modal to close: ${sel}`);
    }

    function setModalValueViaAngularScope(value) {
      const input = document.querySelector(MODAL_INPUT_SELECTOR);
      if (!input) throw new Error("Modal input not found");

      const ng = window.angular;
      if (!ng?.element) throw new Error("Angular not available on window");

      const el = ng.element(input);
      const scope = el.scope?.();
      if (!scope) throw new Error("Could not get Angular scope for modal input");

      scope.$apply(() => {
        scope.value = String(value);
      });
    }

    function getHeadingText(panel) {
      const heading = panel.querySelector(HEADING_SELECTOR);
      if (!heading) return "Images";

      const parts = Array.from(heading.querySelectorAll("span"))
        .filter((sp) => {
          const cs = window.getComputedStyle(sp);
          return cs.display !== "none" && cs.visibility !== "hidden";
        })
        .map((sp) => sp.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      return parts.join(" | ").trim() || heading.textContent.replace(/\s+/g, " ").trim() || "Images";
    }

    function getPanelRows(panel) {
      const tbody = panel.querySelector(TABLE_BODY_SELECTOR);
      if (!tbody) return [];
      return Array.from(tbody.querySelectorAll(ROW_SELECTOR));
    }

    function readPanelState(panel) {
      const rows = getPanelRows(panel);
      const state = rows
        .map((row, idx) => {
          const img = row.querySelector(THUMB_SELECTOR);
          const src = normSrc(img?.currentSrc || img?.src || "");
          const orderText = row.querySelector(ORDER_CELL_SELECTOR)?.textContent?.trim();
          const order = Number(orderText) || idx + 1;
          return { src, order, row };
        })
        .filter((x) => x.src);

      state.sort((a, b) => a.order - b.order);
      return state;
    }

    function findRowInPanelBySrc(panel, srcNorm) {
      for (const row of getPanelRows(panel)) {
        const img = row.querySelector(THUMB_SELECTOR);
        const rowSrc = normSrc(img?.currentSrc || img?.src || "");
        if (rowSrc === srcNorm) return row;
      }
      return null;
    }

    async function setOrderForSrcInPanel(panel, srcNorm, newOrder) {
      const row = findRowInPanelBySrc(panel, srcNorm);
      if (!row) throw new Error(`Could not find row for src in this section: ${srcNorm}`);

      const btn = row.querySelector(REORDER_BTN_SELECTOR);
      if (!btn) throw new Error("Reorder button not found on row");

      btn.click();
      await waitFor(MODAL_SELECTOR, OPEN_TIMEOUT_MS);
      await waitFor(MODAL_INPUT_SELECTOR, OPEN_TIMEOUT_MS);
      await waitFor(MODAL_OK_SELECTOR, OPEN_TIMEOUT_MS);

      setModalValueViaAngularScope(newOrder);
      document.querySelector(MODAL_OK_SELECTOR).click();

      await waitGone(MODAL_SELECTOR, CLOSE_TIMEOUT_MS);
      await sleep(STEP_GAP_MS);
    }

    function parsePositions(text) {
      const raw = String(text || "").trim();
      if (!raw) throw new Error("Please enter at least one position.");

      const nums = raw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number(x));

      if (!nums.length) throw new Error("Please enter at least one position.");
      if (nums.some((n) => !Number.isInteger(n) || n < 1)) {
        throw new Error("Positions must be whole numbers of 1 or higher.");
      }

      return [...new Set(nums)].sort((a, b) => a - b);
    }

    function getTempSlot(panel) {
      const state = readPanelState(panel);
      const used = new Set(state.map((x) => x.order));
      let tempSlot = (state.length ? Math.max(...state.map((x) => x.order)) : 0) + 1000;

      while (used.has(tempSlot)) tempSlot += 1000;
      return tempSlot;
    }

    async function ensureTempSlotFree(panel, setStatus, statusPrefix = "") {
      const tempSlot = getTempSlot(panel);
      const state = readPanelState(panel);
      const atTemp = state.find((x) => x.order === tempSlot);

      if (!atTemp) return tempSlot;

      let bump = tempSlot + 1000;
      const used = new Set(state.map((x) => x.order));
      while (used.has(bump)) bump += 1000;

      setStatus(`${statusPrefix}Temp slot ${tempSlot} is in use. Moving it to ${bump}...`);
      await setOrderForSrcInPanel(panel, atTemp.src, bump);

      return tempSlot;
    }

    // ─── CDN snapshot ──────────────────────────────────────────────────────────
    //
    // Walks every known panel and captures, for each image row:
    //   • the position/order number
    //   • the full CDN URL from the "ORIGINAL" link (td:nth-child(3) a[title="Original"])
    //   • a filename built from the SKU and section identity, matching the
    //     platform's naming convention:
    //
    //     Base section:             {SKU}-{order}.jpg          e.g. 123456-1.jpg
    //     Channel/locale section:   {SKU}-{order}-{channel}-{locale}.jpg
    //                               e.g. 123456-1-cbeauty-en_GB.jpg
    //
    // The "ORIGINAL" link sits in the 3rd <td> of each row and carries both
    // href (the browser-resolved URL) and ng-href (the Angular template attribute).
    // We prefer href as it is already fully resolved.
    const ORIGINAL_LINK_SELECTOR = 'td:nth-child(3) a[title="Original"]';

    // Extract the SKU from the page URL.
    // URL pattern: /product/{SKU}/images
    // Falls back to "unknown-sku" so filenames are still useful if the pattern
    // ever changes.
    function getSkuFromUrl() {
      const match = window.location.hash.match(/\/product\/([^\/]+)\/images/i);
      return match ? match[1] : "unknown-sku";
    }

    // Parse a section heading into its channel/locale parts, or signal that it
    // is the Base section.
    //
    // Heading examples:
    //   "Channel : cbeauty Locale: en_GB"  → { isBase: false, channel: "cbeauty", locale: "en_GB" }
    //   "Images" / anything unrecognised   → { isBase: true }
    //
    // The regex is intentionally loose with spacing and capitalisation so minor
    // heading variations don't break it.
    function parseSectionHeading(headingText) {
      const m = headingText.match(/channel\s*:\s*(\S+)\s*[\|]?\s*locale\s*:\s*(\S+)/i);
      if (m) {
        return { isBase: false, channel: m[1].trim(), locale: m[2].trim() };
      }
      return { isBase: true };
    }

    // Build the download filename for a single image.
    //   sku      — e.g. "123456"
    //   order    — position number within the section, e.g. 2
    //   heading  — parsed result from parseSectionHeading()
    //   url      — CDN URL, used only to grab the file extension
    function buildFilename(sku, order, heading, url) {
      // Preserve the original file extension (usually .jpg) from the CDN URL.
      let ext = ".jpg";
      try {
        const pathname = new URL(url).pathname;
        const lastSegment = pathname.split("/").filter(Boolean).pop() || "";
        const dotIdx = lastSegment.lastIndexOf(".");
        if (dotIdx !== -1) ext = lastSegment.slice(dotIdx).toLowerCase();
      } catch (_) { /* non-absolute URL — keep .jpg */ }

      if (heading.isBase) {
        // Base:  123456-1.jpg
        return `${sku}-${order}${ext}`;
      }
      // Channel/locale:  123456-1-cbeauty-en_GB.jpg
      return `${sku}-${order}-${heading.channel}-${heading.locale}${ext}`;
    }

    function captureImageSnapshot() {
      const sku = getSkuFromUrl();

      return panels.map((panel) => {
        const title   = getHeadingText(panel);
        const heading = parseSectionHeading(title);
        const rows    = getPanelRows(panel);

        const images = rows.map((row, idx) => {
          const anchor  = row.querySelector(ORIGINAL_LINK_SELECTOR);
          const thumbEl = row.querySelector(THUMB_SELECTOR);

          // href is the live resolved value; ng-href is the Angular template
          // attribute. We prefer href (already resolved by the browser), fall
          // back to ng-href in case Angular hasn't stamped href yet, then to the
          // thumbnail src as a last resort so we always surface something.
          const url =
            anchor?.href ||
            anchor?.getAttribute("ng-href") ||
            thumbEl?.currentSrc ||
            thumbEl?.src ||
            "";

          const orderText = row.querySelector(ORDER_CELL_SELECTOR)?.textContent?.trim();
          const order = Number(orderText) || idx + 1;

          const filename = buildFilename(sku, order, heading, url);

          return { order, url, filename };
        });

        // Sort by current order so the snapshot reads naturally
        images.sort((a, b) => a.order - b.order);

        return { sectionTitle: title, images };
      });
    }

    // ─── Floating badge + panel ────────────────────────────────────────────────
    //
    // buildSnapshotRow(img) — shared between first build and subsequent updates.
    function buildSnapshotRow(img) {
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:8px;font-size:11px;flex-wrap:wrap;padding:3px 0;border-bottom:1px solid #f0e8a0;`;

      const badge = document.createElement("span");
      badge.style.cssText = `min-width:22px;text-align:center;background:#e8e8e8;border-radius:4px;padding:1px 4px;font-weight:700;color:#333;flex-shrink:0;`;
      badge.textContent = img.order;

      const link = document.createElement("a");
      link.href = img.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = img.filename || img.url || "(no URL found)";
      link.style.cssText = `color:#0066cc;text-decoration:underline;word-break:break-all;cursor:pointer;flex:1;min-width:0;`;

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.textContent = "⬇ Download";
      dlBtn.title = `Download ${img.filename}`;
      dlBtn.style.cssText = `flex-shrink:0;padding:3px 10px;font-size:11px;border:1px solid #bbb;border-radius:5px;background:#fff;cursor:pointer;white-space:nowrap;`;
      dlBtn.addEventListener("click", async () => {
        if (!img.url) { alert("No URL available for this image."); return; }
        dlBtn.disabled = true;
        dlBtn.textContent = "Downloading…";
        try {
          const resp = await fetch(img.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = img.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          dlBtn.textContent = "✓ Saved";
        } catch (err) {
          console.error("Download failed:", err);
          window.open(img.url, "_blank", "noopener,noreferrer");
          dlBtn.textContent = "Opened in tab";
        } finally {
          dlBtn.disabled = false;
        }
      });

      row.append(badge, link, dlBtn);
      return row;
    }

    // Builds the full floating badge+panel the first time, then just refreshes
    // the content on subsequent calls (e.g. user runs a second action).
    function showSnapshot(snapshot) {
      const ts = new Date().toLocaleTimeString();

      // ── First call: create the badge and panel from scratch ──────────────────
      if (!snapshotBadge) {

        // Panel — the expanded view, hidden by default
        snapshotPanel = document.createElement("div");
        snapshotPanel.style.cssText = `
          display: none;
          position: fixed;
          bottom: 60px;
          right: 18px;
          width: min(540px, 92vw);
          max-height: 55vh;
          background: #fffbea;
          border: 1px solid #e6d96e;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,.22);
          z-index: 2147483646;
          display: none;
          flex-direction: column;
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
          overflow: hidden;
        `;

        const panelHeader = document.createElement("div");
        panelHeader.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px 8px;
          border-bottom: 1px solid #e6d96e;
          flex-shrink: 0;
        `;

        const panelTitle = document.createElement("div");
        panelTitle.style.cssText = `font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;`;
        panelTitle.innerHTML = `<span>🛡️</span><span>Pre-action image snapshot</span>`;

        const panelClose = document.createElement("button");
        panelClose.type = "button";
        panelClose.textContent = "✕";
        panelClose.title = "Dismiss snapshot (links will be lost)";
        panelClose.style.cssText = `background:none;border:none;font-size:16px;cursor:pointer;color:#888;padding:0 2px;line-height:1;`;
        panelClose.addEventListener("click", () => {
          snapshotPanel.remove();
          snapshotBadge.remove();
          snapshotPanel = null;
          snapshotBadge = null;
          snapshotTimestamp = null;
          snapshotList = null;
        });

        panelHeader.append(panelTitle, panelClose);

        snapshotTimestamp = document.createElement("div");
        snapshotTimestamp.style.cssText = `font-size:11px;color:#666;padding:4px 14px 6px;flex-shrink:0;`;

        snapshotList = document.createElement("div");
        snapshotList.style.cssText = `overflow-y:auto;padding:6px 14px 12px;flex:1;min-height:0;`;

        snapshotPanel.append(panelHeader, snapshotTimestamp, snapshotList);
        document.body.appendChild(snapshotPanel);

        // Badge — the small persistent pill in the corner
        snapshotBadge = document.createElement("button");
        snapshotBadge.type = "button";
        snapshotBadge.innerHTML = `🛡️ <span style="font-size:11px;">Image snapshot</span>`;
        snapshotBadge.style.cssText = `
          position: fixed;
          bottom: 18px;
          right: 18px;
          z-index: 2147483647;
          background: #f5c400;
          color: #222;
          border: none;
          border-radius: 20px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,0,0,.25);
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        `;
        snapshotBadge.addEventListener("click", () => {
          const isOpen = snapshotPanel.style.display === "flex";
          snapshotPanel.style.display = isOpen ? "none" : "flex";
        });
        document.body.appendChild(snapshotBadge);
      }

      // ── Every call: refresh timestamp and content ────────────────────────────
      snapshotTimestamp.textContent = `Snapshot taken at ${ts} — before last action. Close the main tool, scroll to check your images, then come back here if you need to recover one.`;
      snapshotList.innerHTML = "";

      for (const section of snapshot) {
        const sectionTitle = document.createElement("div");
        sectionTitle.style.cssText = `font-size:12px;font-weight:700;margin:8px 0 4px;`;
        sectionTitle.textContent = `${section.sectionTitle} (${section.images.length} image${section.images.length !== 1 ? "s" : ""})`;
        snapshotList.append(sectionTitle);

        for (const img of section.images) {
          snapshotList.append(buildSnapshotRow(img));
        }
      }

      // Open the panel automatically so the user sees it straight away
      snapshotPanel.style.display = "flex";
    }
    // ───────────────────────────────────────────────────────────────────────────

    const panels = Array.from(document.querySelectorAll(PANEL_SELECTOR)).filter(
      (p) => p.querySelector(TABLE_BODY_SELECTOR) && getPanelRows(p).length
    );

    if (!panels.length) {
      setToolOpen(false);
      alert("No image tables found on this page.");
      return;
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    `;

    const ui = document.createElement("div");
    ui.style.cssText = `
      width: min(1100px,95vw);
      height: min(880px,92vh);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      padding: 14px 16px;
      border-bottom: 1px solid #e6e6e6;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    `;

    header.innerHTML = `
      <div>
        <div style="font-size:16px;font-weight:650;">Matrix image tools</div>
        <div id="__thg_image_tool_subtitle__" style="font-size:12px;color:#666;">
          Choose a tab below.
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button data-a="close" style="padding:8px 10px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer;">Close</button>
      </div>
    `;

    // ─── Floating snapshot badge (lives on the page, outside the modal) ─────────
    // Built lazily in showSnapshot() the first time an action runs.
    // Persists after the main UI is closed so the user can always get back
    // to their download links.
    let snapshotBadge      = null;   // the small corner pill
    let snapshotPanel      = null;   // the expanded panel it opens
    let snapshotTimestamp  = null;
    let snapshotList       = null;
    // ───────────────────────────────────────────────────────────────────────────

    const tabBar = document.createElement("div");
    tabBar.style.cssText = `
      display: flex;
      gap: 0;
      border-bottom: 1px solid #e6e6e6;
      background: #fafafa;
    `;

    const reorderTabBtn = document.createElement("button");
    reorderTabBtn.type = "button";
    reorderTabBtn.dataset.tab = "reorder";
    reorderTabBtn.textContent = "Reorder images";
    reorderTabBtn.style.cssText = `
      padding: 10px 14px;
      border: 0;
      border-right: 1px solid #e6e6e6;
      background: #fff;
      cursor: pointer;
      font-weight: 700;
    `;

    const gapTabBtn = document.createElement("button");
    gapTabBtn.type = "button";
    gapTabBtn.dataset.tab = "gaps";
    gapTabBtn.textContent = "Free up / Clean Up slots";
    gapTabBtn.style.cssText = `
      padding: 10px 14px;
      border: 0;
      border-right: 1px solid #e6e6e6;
      background: #fafafa;
      cursor: pointer;
      font-weight: 600;
      color: #444;
    `;

    tabBar.append(reorderTabBtn, gapTabBtn);

    const contentWrap = document.createElement("div");
    contentWrap.style.cssText = `
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    `;

    const reorderView = document.createElement("div");
    reorderView.style.cssText = `
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    `;

    const gapView = document.createElement("div");
    gapView.style.cssText = `
      flex: 1;
      min-height: 0;
      display: none;
      flex-direction: column;
    `;

    contentWrap.append(reorderView, gapView);
    ui.append(header, tabBar, contentWrap);
    overlay.append(ui);
    document.body.appendChild(overlay);

    const subtitleEl = header.querySelector("#__thg_image_tool_subtitle__");

    function close() {
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      setToolOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("keydown", onKeyDown, true);
    header.querySelector('[data-a="close"]').addEventListener("click", close);

    function switchTab(name) {
      const isReorder = name === "reorder";

      reorderView.style.display = isReorder ? "flex" : "none";
      gapView.style.display = isReorder ? "none" : "flex";

      reorderTabBtn.style.background = isReorder ? "#fff" : "#fafafa";
      reorderTabBtn.style.fontWeight = isReorder ? "700" : "600";
      reorderTabBtn.style.color = isReorder ? "#111" : "#444";

      gapTabBtn.style.background = isReorder ? "#fafafa" : "#fff";
      gapTabBtn.style.fontWeight = isReorder ? "600" : "700";
      gapTabBtn.style.color = isReorder ? "#444" : "#111";

      subtitleEl.textContent = isReorder
        ? "Drag within a section only. Apply will reorder each section independently."
        : 'Use "Clean Up all sections" to clean up numbering across the whole page, or free up one or more slots in selected sections.';
    }

    reorderTabBtn.addEventListener("click", () => switchTab("reorder"));
    gapTabBtn.addEventListener("click", () => switchTab("gaps"));

    const reorderBody = document.createElement("div");
    reorderBody.style.cssText = `padding:12px;overflow:auto;flex:1;`;

    const reorderStatus = document.createElement("div");
    reorderStatus.style.cssText = `font-size:12px;color:#444;margin:0 0 10px 0;line-height:1.4;white-space:pre-wrap;`;

    const reorderControls = document.createElement("div");
    reorderControls.style.cssText = `display:flex;justify-content:flex-end;margin:0 0 10px 0;`;

    reorderControls.innerHTML = `
      <button data-a="applyReorder" style="padding:8px 10px;border:1px solid #111;background:#111;color:#fff;border-radius:8px;cursor:pointer;">
        Apply reorder
      </button>
    `;

    reorderBody.append(reorderControls, reorderStatus);
    reorderView.append(reorderBody);

    const setReorderStatus = (t) => (reorderStatus.textContent = t);

    const reorderSections = panels.map((panel, idx) => {
      const title = getHeadingText(panel) || `Section ${idx + 1}`;
      const initial = readPanelState(panel);

      const wrap = document.createElement("div");
      wrap.style.cssText = `border:1px solid #e6e6e6;border-radius:12px;padding:10px;margin:10px 0;`;

      const h = document.createElement("div");
      h.style.cssText = `font-size:13px;font-weight:650;margin:0 0 8px 0;`;
      h.textContent = `${title} (${initial.length})`;

      const list = document.createElement("div");
      list.style.cssText = `display:flex;flex-direction:column;gap:8px;`;

      wrap.append(h, list);
      reorderBody.append(wrap);

      return { panel, title, list, initial };
    });

    setReorderStatus(
      `Detected ${reorderSections.length} section(s):\n` +
      `${reorderSections.map((s) => `• ${s.title} (${s.initial.length})`).join("\n")}\n\n` +
      `Drag within a section only. Apply will reorder each section independently.`
    );

    let dragEl = null;

    function makeCard(item) {
      const card = document.createElement("div");
      card.draggable = true;
      card.dataset.src = item.src;
      card.style.cssText = `display:flex;align-items:center;gap:10px;border:1px solid #ddd;border-radius:10px;padding:10px;background:#fff;cursor:grab;`;

      const img = document.createElement("img");
      img.src = item.src;
      img.style.cssText = `width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #eee;background:#fafafa;`;

      const meta = document.createElement("div");
      meta.style.cssText = `display:flex;flex-direction:column;gap:2px;`;

      const a = document.createElement("div");
      a.style.cssText = `font-size:13px;font-weight:650;`;
      a.textContent = `Current: ${item.order}`;

      const b = document.createElement("div");
      b.style.cssText = `font-size:12px;color:#666;`;
      b.textContent = "New: ?";

      meta.append(a, b);

      const handle = document.createElement("div");
      handle.style.cssText = `margin-left:auto;font-size:18px;color:#999;user-select:none;`;
      handle.textContent = "⋮⋮";

      card.append(img, meta, handle);

      card.addEventListener("dragstart", (e) => {
        dragEl = card;
        card.style.opacity = "0.55";
        e.dataTransfer.effectAllowed = "move";
      });

      card.addEventListener("dragend", () => {
        dragEl = null;
        card.style.opacity = "1";
      });

      return card;
    }

    function wireDnD(listEl, onChange) {
      listEl.addEventListener("dragover", (e) => e.preventDefault());
      listEl.addEventListener("drop", (e) => e.preventDefault());

      Array.from(listEl.children).forEach((card) => {
        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          card.style.borderColor = "#111";
        });

        card.addEventListener("dragleave", () => {
          card.style.borderColor = "#ddd";
        });

        card.addEventListener("drop", (e) => {
          e.preventDefault();
          card.style.borderColor = "#ddd";

          if (!dragEl || dragEl === card) return;
          if (dragEl.parentElement !== listEl) return;

          const kids = Array.from(listEl.children);
          const from = kids.indexOf(dragEl);
          const to = kids.indexOf(card);

          if (from < 0 || to < 0) return;
          if (from < to) listEl.insertBefore(dragEl, card.nextSibling);
          else listEl.insertBefore(dragEl, card);

          onChange();
        });
      });
    }

    function updateNewLabels(listEl) {
      Array.from(listEl.children).forEach((c, i) => {
        const label = c.querySelector("div > div:nth-child(2)");
        if (label) label.textContent = `New: ${i + 1}`;
      });
    }

    for (const s of reorderSections) {
      s.initial.forEach((it) => s.list.appendChild(makeCard(it)));
      updateNewLabels(s.list);
      wireDnD(s.list, () => updateNewLabels(s.list));
    }

    async function applyReorderSection(section, sectionIndex, totalSections) {
      const { panel, title, list } = section;
      const desired = Array.from(list.children).map((c, i) => ({ src: c.dataset.src, want: i + 1 }));

      const state = readPanelState(panel);
      const srcToOrder = new Map(state.map((x) => [x.src, x.order]));
      const orderToSrc = new Map(state.map((x) => [x.order, x.src]));

      const tempSlot = await ensureTempSlotFree(panel, setReorderStatus, `(${sectionIndex}/${totalSections}) ${title}\n`);

      for (let i = 0; i < desired.length; i++) {
        const { src, want } = desired[i];
        const have = srcToOrder.get(src);
        if (have === want) continue;

        setReorderStatus(
          `(${sectionIndex}/${totalSections}) ${title}\n` +
          `Step ${i + 1}/${desired.length}: place into ${want} (currently ${have})...`
        );

        const srcInWant = orderToSrc.get(want);

        if (srcInWant && srcInWant !== src) {
          await setOrderForSrcInPanel(panel, srcInWant, tempSlot);
          srcToOrder.set(srcInWant, tempSlot);
          orderToSrc.set(tempSlot, srcInWant);
          orderToSrc.delete(want);
        }

        await setOrderForSrcInPanel(panel, src, want);
        srcToOrder.set(src, want);
        orderToSrc.set(want, src);
        orderToSrc.delete(have);

        if (srcInWant && srcInWant !== src) {
          await setOrderForSrcInPanel(panel, srcInWant, have);
          srcToOrder.set(srcInWant, have);
          orderToSrc.set(have, srcInWant);
          orderToSrc.delete(tempSlot);
        }
      }
    }

    async function applyAllReorder() {
      const btn = reorderControls.querySelector('[data-a="applyReorder"]');
      btn.disabled = true;
      btn.textContent = "Applying…";

      // Snapshot before any mutations
      showSnapshot(captureImageSnapshot());

      try {
        for (let i = 0; i < reorderSections.length; i++) {
          await applyReorderSection(reorderSections[i], i + 1, reorderSections.length);
        }

        setReorderStatus("Done.\nIf the table numbers don't refresh immediately, refresh the page to confirm.");
        btn.textContent = "Done";
      } catch (err) {
        console.error(err);
        alert(`Apply failed: ${err.message}`);
        btn.disabled = false;
        btn.textContent = "Apply reorder";
        setReorderStatus("Apply failed — check console for details.");
      }
    }

    reorderControls.querySelector('[data-a="applyReorder"]').addEventListener("click", applyAllReorder);

    const gapBody = document.createElement("div");
    gapBody.style.cssText = `padding:12px;overflow:auto;flex:1;`;

    const gapControls = document.createElement("div");
    gapControls.style.cssText = `
      border:1px solid #e6e6e6;
      border-radius:12px;
      padding:12px;
      margin:0 0 12px 0;
      background:#fafafa;
    `;

    const gapStatus = document.createElement("div");
    gapStatus.style.cssText = `
      font-size:12px;
      color:#444;
      margin:0 0 10px 0;
      line-height:1.4;
      white-space:pre-wrap;
    `;

    const gapSectionsWrap = document.createElement("div");
    gapSectionsWrap.style.cssText = `
      display:flex;
      flex-direction:column;
      gap:10px;
    `;

    gapBody.append(gapControls, gapStatus, gapSectionsWrap);
    gapView.append(gapBody);

    const setGapStatus = (t) => {
      gapStatus.textContent = t;
    };

    gapControls.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:end;">
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label style="font-size:12px;color:#555;">Shared positions to free up</label>
            <input data-role="sharedPositions" type="text" value="2"
              placeholder="e.g. 2 or 2,5,7"
              style="width:220px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:13px;user-select:none;">
            <input data-role="uniqueToggle" type="checkbox">
            Use unique positions per section
          </label>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button data-a="all" style="padding:8px 10px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer;">Select all</button>
            <button data-a="none" style="padding:8px 10px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer;">Clear</button>
            <button data-a="normaliseAll" style="padding:8px 10px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer;">Clean Up all sections</button>
            <button data-a="applyGaps" style="padding:8px 10px;border:1px solid #111;background:#111;color:#fff;border-radius:8px;cursor:pointer;">Apply gaps</button>
          </div>
        </div>

        <div style="font-size:12px;color:#666;">
          Enter one or more positions separated by commas, for example:
          <b>2</b> or <b>2,5,7</b>.
          When using unique positions, each section can have its own list.
        </div>
      </div>
    `;

    const sharedPositionsInput = gapControls.querySelector('[data-role="sharedPositions"]');
    const uniqueToggle = gapControls.querySelector('[data-role="uniqueToggle"]');
    const normaliseBtn = gapControls.querySelector('[data-a="normaliseAll"]');
    const applyGapsBtn = gapControls.querySelector('[data-a="applyGaps"]');

    const gapSections = panels.map((panel, idx) => {
      const title = getHeadingText(panel) || `Section ${idx + 1}`;
      const initial = readPanelState(panel);

      const box = document.createElement("div");
      box.style.cssText = `
        border:1px solid #e6e6e6;
        border-radius:12px;
        padding:10px;
        background:#fff;
      `;

      const topRow = document.createElement("div");
      topRow.style.cssText = `
        display:flex;
        flex-wrap:wrap;
        gap:12px;
        align-items:flex-start;
        justify-content:space-between;
      `;

      const left = document.createElement("label");
      left.style.cssText = `
        display:flex;
        align-items:flex-start;
        gap:10px;
        cursor:pointer;
        flex:1;
      `;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = idx === 0;
      cb.style.marginTop = "2px";

      const meta = document.createElement("div");
      meta.style.cssText = `display:flex;flex-direction:column;gap:4px;`;

      const top = document.createElement("div");
      top.style.cssText = `font-size:13px;font-weight:650;`;
      top.textContent = `${title} (${initial.length})`;

      const sub = document.createElement("div");
      sub.style.cssText = `font-size:12px;color:#666;`;
      sub.textContent = `Current orders: ${initial.map((x) => x.order).join(", ")}`;

      meta.append(top, sub);
      left.append(cb, meta);

      const right = document.createElement("div");
      right.style.cssText = `
        display:none;
        flex-direction:column;
        gap:6px;
        min-width:220px;
      `;

      const rightLabel = document.createElement("label");
      rightLabel.style.cssText = `font-size:12px;color:#555;`;
      rightLabel.textContent = "Unique positions for this section";

      const uniqueInput = document.createElement("input");
      uniqueInput.type = "text";
      uniqueInput.placeholder = "e.g. 2 or 2,5,7";
      uniqueInput.value = "2";
      uniqueInput.style.cssText = `
        width:220px;
        padding:8px 10px;
        border:1px solid #ccc;
        border-radius:8px;
      `;

      right.append(rightLabel, uniqueInput);
      topRow.append(left, right);
      box.append(topRow);
      gapSectionsWrap.append(box);

      return {
        panel,
        title,
        initial,
        checkbox: cb,
        sub,
        uniqueWrap: right,
        uniqueInput
      };
    });

    function updateUniqueModeUI() {
      const uniqueOn = uniqueToggle.checked;
      sharedPositionsInput.disabled = uniqueOn;
      sharedPositionsInput.style.opacity = uniqueOn ? "0.55" : "1";

      for (const s of gapSections) {
        s.uniqueWrap.style.display = uniqueOn ? "flex" : "none";
      }
    }

    function setGapBusyState(isBusy, applyText = "Apply gaps", normaliseText = "Clean Up all sections") {
      applyGapsBtn.disabled = isBusy;
      normaliseBtn.disabled = isBusy;
      sharedPositionsInput.disabled = isBusy || uniqueToggle.checked;
      uniqueToggle.disabled = isBusy;

      gapControls.querySelector('[data-a="all"]').disabled = isBusy;
      gapControls.querySelector('[data-a="none"]').disabled = isBusy;

      for (const s of gapSections) {
        s.checkbox.disabled = isBusy;
        s.uniqueInput.disabled = isBusy;
      }

      applyGapsBtn.textContent = applyText;
      normaliseBtn.textContent = normaliseText;
    }

    async function applyDesiredOrder(panel, desired, title, setStatus, statusPrefix = "") {
      const tempSlot = await ensureTempSlotFree(panel, setStatus, statusPrefix);

      const state = readPanelState(panel);
      const srcToOrder = new Map(state.map((x) => [x.src, x.order]));
      const orderToSrc = new Map(state.map((x) => [x.order, x.src]));

      for (let i = 0; i < desired.length; i++) {
        const { src, want } = desired[i];
        const have = srcToOrder.get(src);

        if (have === want) continue;

        setStatus(
          `${statusPrefix}${title}\n` +
          `Normalising step ${i + 1}/${desired.length}: ${have} → ${want}`
        );

        const srcInWant = orderToSrc.get(want);

        if (srcInWant && srcInWant !== src) {
          await setOrderForSrcInPanel(panel, srcInWant, tempSlot);
          srcToOrder.set(srcInWant, tempSlot);
          orderToSrc.set(tempSlot, srcInWant);
          orderToSrc.delete(want);
        }

        await setOrderForSrcInPanel(panel, src, want);
        srcToOrder.set(src, want);
        orderToSrc.set(want, src);
        orderToSrc.delete(have);

        if (srcInWant && srcInWant !== src) {
          await setOrderForSrcInPanel(panel, srcInWant, have);
          srcToOrder.set(srcInWant, have);
          orderToSrc.set(have, srcInWant);
          orderToSrc.delete(tempSlot);
        }
      }
    }

    async function normaliseSection(panel, title, setStatus, statusPrefix = "") {
      const state = readPanelState(panel);

      const desired = state
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item, idx) => ({
          src: item.src,
          want: idx + 1
        }));

      const alreadyNormal = desired.every((d, idx) => {
        const current = state[idx];
        return current && current.src === d.src && current.order === d.want;
      });

      if (alreadyNormal) {
        setStatus(`${statusPrefix}${title}\nAlready normalised.`);
        return;
      }

      await applyDesiredOrder(panel, desired, title, setStatus, statusPrefix);
    }

    async function createSingleGapInSection(panel, title, insertPosition, setStatus, statusPrefix = "") {
      const state = readPanelState(panel).sort((a, b) => a.order - b.order);
      const count = state.length;

      if (insertPosition < 1) {
        throw new Error(`Invalid position for ${title}`);
      }

      if (insertPosition > count + 1) {
        throw new Error(
          `${title}: chosen position ${insertPosition} is too high. ` +
          `This section has ${count} image(s), so max allowed is ${count + 1}.`
        );
      }

      const toShift = state
        .filter((x) => x.order >= insertPosition)
        .sort((a, b) => b.order - a.order);

      for (let i = 0; i < toShift.length; i++) {
        const item = toShift[i];
        setStatus(
          `${statusPrefix}${title}\n` +
          `Shift step ${i + 1}/${toShift.length}: ${item.order} → ${item.order + 1}`
        );
        await setOrderForSrcInPanel(panel, item.src, item.order + 1);
      }
    }

    async function createGapsInSection(panel, title, positions, setStatus, statusPrefix = "") {
      await normaliseSection(panel, title, setStatus, statusPrefix);

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        setStatus(
          `${statusPrefix}${title}\n` +
          `Creating gap ${i + 1}/${positions.length} at position ${pos}...`
        );
        await createSingleGapInSection(panel, title, pos, setStatus, statusPrefix);
      }
    }

    async function refreshGapSectionPreview(section) {
      const now = readPanelState(section.panel);
      section.sub.textContent = `Current orders: ${now.map((x) => x.order).join(", ")}`;
    }

    uniqueToggle.addEventListener("change", updateUniqueModeUI);
    updateUniqueModeUI();

    gapControls.querySelector('[data-a="all"]').addEventListener("click", () => {
      gapSections.forEach((s) => {
        s.checkbox.checked = true;
      });
    });

    gapControls.querySelector('[data-a="none"]').addEventListener("click", () => {
      gapSections.forEach((s) => {
        s.checkbox.checked = false;
      });
    });

    setGapStatus(
      `Detected ${gapSections.length} section(s):\n` +
      gapSections.map((s) => `• ${s.title} (${s.initial.length})`).join("\n") +
      `\n\nUse "Clean Up all sections" to clean up the whole page, or choose one or more sections and click "Apply gaps".`
    );

    async function normaliseAllSections() {
      setGapBusyState(true, "Apply gaps", "Normalising…");

      // Snapshot before any mutations
      showSnapshot(captureImageSnapshot());

      const errors = [];

      try {
        for (let i = 0; i < gapSections.length; i++) {
          const s = gapSections[i];
          const prefix = `(${i + 1}/${gapSections.length}) `;

          try {
            await normaliseSection(s.panel, s.title, setGapStatus, prefix);
            await refreshGapSectionPreview(s);
          } catch (err) {
            console.error(err);
            errors.push(`${s.title}: ${err.message}`);
          }
        }

        if (errors.length) {
          setGapStatus(
            `Clean Up finished with some issues.\n\n` +
            errors.map((e) => `• ${e}`).join("\n") +
            `\n\nRefresh the page if the table numbers do not update immediately.`
          );
          alert(`Clean Up finished with ${errors.length} issue(s). Check the status box / console.`);
        } else {
          setGapStatus(
            `Done.\nAll sections have been cleaned.\nRefresh the page if the table numbers do not update immediately.`
          );
        }
      } catch (err) {
        console.error(err);
        alert(`Clean Up failed: ${err.message}`);
        setGapStatus("Clean Up failed — check console for details.");
      } finally {
        setGapBusyState(false, "Apply gaps", "Clean Up all sections");
      }
    }

    async function applyAllGaps() {
      const selected = gapSections.filter((s) => s.checkbox.checked);

      if (!selected.length) {
        alert("Please select at least one section.");
        return;
      }

      const uniqueOn = uniqueToggle.checked;
      let sharedPositions = null;

      try {
        if (!uniqueOn) {
          sharedPositions = parsePositions(sharedPositionsInput.value);
        }
      } catch (err) {
        alert(err.message);
        return;
      }

      // Snapshot before any mutations
      showSnapshot(captureImageSnapshot());

      setGapBusyState(true, "Applying…", "Clean Up all sections");
      const errors = [];

      try {
        for (let i = 0; i < selected.length; i++) {
          const s = selected[i];
          const prefix = `(${i + 1}/${selected.length}) `;

          try {
            const positions = uniqueOn ? parsePositions(s.uniqueInput.value) : sharedPositions;
            await createGapsInSection(s.panel, s.title, positions, setGapStatus, prefix);
            await refreshGapSectionPreview(s);
          } catch (err) {
            console.error(err);
            errors.push(`${s.title}: ${err.message}`);
          }
        }

        if (errors.length) {
          setGapStatus(
            `Finished with some issues.\n\n` +
            errors.map((e) => `• ${e}`).join("\n") +
            `\n\nRefresh the page if the table numbers do not update immediately.`
          );
          alert(`Finished with ${errors.length} issue(s). Check the status box / console.`);
        } else {
          setGapStatus(
            `Done.\nGap creation completed in ${selected.length} section(s).\nRefresh the page if the table numbers do not update immediately.`
          );
        }
      } catch (err) {
        console.error(err);
        alert(`Apply failed: ${err.message}`);
        setGapStatus("Apply failed — check console for details.");
      } finally {
        setGapBusyState(false, "Apply gaps", "Clean Up all sections");
      }
    }

    normaliseBtn.addEventListener("click", normaliseAllSections);
    applyGapsBtn.addEventListener("click", applyAllGaps);

    switchTab("reorder");
  };

  CT.loaded.imageTools = true;
})();
