(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.imageTools) return;

  CT.tools.runImageReorderTool = async function () {
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

    if (window.__thgImageToolsOpen) return;
    window.__thgImageToolsOpen = true;
    window.__thgReorderToolOpen = true;

    if (typeof window.__toolPaletteRefreshStatus__ === "function") {
      window.__toolPaletteRefreshStatus__();
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const normSrc = (s) => String(s || '').split('?')[0].toLowerCase();

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
      if (!input) throw new Error('Modal input not found');

      const ng = window.angular;
      if (!ng?.element) throw new Error('Angular not available on window');

      const el = ng.element(input);
      const scope = el.scope?.();
      if (!scope) throw new Error('Could not get Angular scope for modal input');

      scope.$apply(() => {
        scope.value = String(value);
      });
    }

    function getHeadingText(panel) {
      const heading = panel.querySelector(HEADING_SELECTOR);
      if (!heading) return 'Images';

      const parts = Array.from(heading.querySelectorAll('span'))
        .filter(sp => {
          const cs = window.getComputedStyle(sp);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        })
        .map(sp => sp.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      return parts.join(' | ').trim() || heading.textContent.replace(/\s+/g, ' ').trim() || 'Images';
    }

    function getPanelRows(panel) {
      const tbody = panel.querySelector(TABLE_BODY_SELECTOR);
      if (!tbody) return [];
      return Array.from(tbody.querySelectorAll(ROW_SELECTOR));
    }

    function readPanelState(panel) {
      const rows = getPanelRows(panel);
      const state = rows.map((row, idx) => {
        const img = row.querySelector(THUMB_SELECTOR);
        const src = normSrc(img?.currentSrc || img?.src || '');
        const orderText = row.querySelector(ORDER_CELL_SELECTOR)?.textContent?.trim();
        const order = Number(orderText) || (idx + 1);
        return { src, order, row };
      }).filter(x => x.src);

      state.sort((a, b) => a.order - b.order);
      return state;
    }

    function findRowInPanelBySrc(panel, srcNorm) {
      for (const row of getPanelRows(panel)) {
        const img = row.querySelector(THUMB_SELECTOR);
        const rowSrc = normSrc(img?.currentSrc || img?.src || '');
        if (rowSrc === srcNorm) return row;
      }
      return null;
    }

    async function setOrderForSrcInPanel(panel, srcNorm, newOrder) {
      const row = findRowInPanelBySrc(panel, srcNorm);
      if (!row) throw new Error(`Could not find row for src in this section: ${srcNorm}`);

      const btn = row.querySelector(REORDER_BTN_SELECTOR);
      if (!btn) throw new Error('Reorder button not found on row');

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
      const raw = String(text || '').trim();
      if (!raw) throw new Error('Please enter at least one position.');

      const nums = raw
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => Number(x));

      if (!nums.length) throw new Error('Please enter at least one position.');
      if (nums.some(n => !Number.isInteger(n) || n < 1)) {
        throw new Error('Positions must be whole numbers of 1 or higher.');
      }

      return [...new Set(nums)].sort((a, b) => a - b);
    }

    function getTempSlot(panel) {
      const state = readPanelState(panel);
      const used = new Set(state.map(x => x.order));
      let tempSlot = (state.length ? Math.max(...state.map(x => x.order)) : 0) + 1000;

      while (used.has(tempSlot)) tempSlot += 1000;
      return tempSlot;
    }

    async function ensureTempSlotFree(panel, setStatus, statusPrefix = '') {
      const tempSlot = getTempSlot(panel);
      const state = readPanelState(panel);
      const atTemp = state.find(x => x.order === tempSlot);

      if (!atTemp) return tempSlot;

      let bump = tempSlot + 1000;
      const used = new Set(state.map(x => x.order));
      while (used.has(bump)) bump += 1000;

      setStatus(`${statusPrefix}Temp slot ${tempSlot} is in use. Moving it to ${bump}...`);
      await setOrderForSrcInPanel(panel, atTemp.src, bump);

      return tempSlot;
    }

    const panels = Array.from(document.querySelectorAll(PANEL_SELECTOR))
      .filter(p => p.querySelector(TABLE_BODY_SELECTOR) && getPanelRows(p).length);

    if (!panels.length) {
      window.__thgImageToolsOpen = false;
      window.__thgReorderToolOpen = false;
      if (typeof window.__toolPaletteRefreshStatus__ === "function") {
        window.__toolPaletteRefreshStatus__();
      }
      alert('No image tables found on this page.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = "__thg_image_tools_overlay__";
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.45);
      z-index:2147483647;
      display:flex;
      align-items:center;
      justify-content:center;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    `;

    const ui = document.createElement('div');
    ui.style.cssText = `
      width:min(1100px,95vw);
      height:min(880px,92vh);
      background:#fff;
      border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,.35);
      display:flex;
      flex-direction:column;
      overflow:hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding:14px 16px;
      border-bottom:1px solid #e6e6e6;
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:center;
    `;

    header.innerHTML = `
      <div>
        <div style="font-size:16px; font-weight:650;">Matrix image tools</div>
        <div id="__thg_image_tool_subtitle__" style="font-size:12px; color:#666;">
          Choose a tab below.
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button data-a="close" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Close</button>
      </div>
    `;

    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display:flex;
      gap:0;
      border-bottom:1px solid #e6e6e6;
      background:#fafafa;
    `;

    const reorderTabBtn = document.createElement('button');
    reorderTabBtn.type = 'button';
    reorderTabBtn.dataset.tab = 'reorder';
    reorderTabBtn.textContent = 'Reorder images';
    reorderTabBtn.style.cssText = `
      padding:10px 14px;
      border:0;
      border-right:1px solid #e6e6e6;
      background:#fff;
      cursor:pointer;
      font-weight:700;
    `;

    const gapTabBtn = document.createElement('button');
    gapTabBtn.type = 'button';
    gapTabBtn.dataset.tab = 'gaps';
    gapTabBtn.textContent = 'Free up / normalise slots';
    gapTabBtn.style.cssText = `
      padding:10px 14px;
      border:0;
      border-right:1px solid #e6e6e6;
      background:#fafafa;
      cursor:pointer;
      font-weight:600;
      color:#444;
    `;

    tabBar.append(reorderTabBtn, gapTabBtn);

    const contentWrap = document.createElement('div');
    contentWrap.style.cssText = `
      flex:1;
      min-height:0;
      display:flex;
      flex-direction:column;
    `;

    const reorderView = document.createElement('div');
    reorderView.style.cssText = `
      flex:1;
      min-height:0;
      display:flex;
      flex-direction:column;
    `;

    const gapView = document.createElement('div');
    gapView.style.cssText = `
      flex:1;
      min-height:0;
      display:none;
      flex-direction:column;
    `;

    contentWrap.append(reorderView, gapView);
    ui.append(header, tabBar, contentWrap);
    overlay.append(ui);
    document.body.appendChild(overlay);

    const subtitleEl = header.querySelector('#__thg_image_tool_subtitle__');

    function close() {
      window.__thgImageToolsOpen = false;
      window.__thgReorderToolOpen = false;
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      if (typeof window.__toolPaletteRefreshStatus__ === "function") {
        window.__toolPaletteRefreshStatus__();
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }

    document.addEventListener('keydown', onKeyDown, true);
    header.querySelector('[data-a="close"]').addEventListener('click', close);

    function switchTab(name) {
      const isReorder = name === 'reorder';

      reorderView.style.display = isReorder ? 'flex' : 'none';
      gapView.style.display = isReorder ? 'none' : 'flex';

      reorderTabBtn.style.background = isReorder ? '#fff' : '#fafafa';
      reorderTabBtn.style.fontWeight = isReorder ? '700' : '600';
      reorderTabBtn.style.color = isReorder ? '#111' : '#444';

      gapTabBtn.style.background = isReorder ? '#fafafa' : '#fff';
      gapTabBtn.style.fontWeight = isReorder ? '600' : '700';
      gapTabBtn.style.color = isReorder ? '#444' : '#111';

      subtitleEl.textContent = isReorder
        ? 'Drag within a section only. Apply will reorder each section independently.'
        : 'Use “Normalise all sections” to clean up numbering across the whole page, or free up one or more slots in selected sections.';
    }

    reorderTabBtn.addEventListener('click', () => switchTab('reorder'));
    gapTabBtn.addEventListener('click', () => switchTab('gaps'));

    const reorderBody = document.createElement('div');
    reorderBody.style.cssText = `padding:12px; overflow:auto; flex:1;`;

    const reorderStatus = document.createElement('div');
    reorderStatus.style.cssText = `font-size:12px; color:#444; margin:0 0 10px 0; line-height:1.4; white-space:pre-wrap;`;

    const reorderControls = document.createElement('div');
    reorderControls.style.cssText = `display:flex; justify-content:flex-end; margin:0 0 10px 0;`;

    reorderControls.innerHTML = `
      <button data-a="applyReorder" style="padding:8px 10px; border:1px solid #111; background:#111; color:#fff; border-radius:8px; cursor:pointer;">Apply reorder</button>
    `;

    reorderBody.append(reorderControls, reorderStatus);
    reorderView.append(reorderBody);

    const setReorderStatus = (t) => (reorderStatus.textContent = t);

    const reorderSections = panels.map((panel, idx) => {
      const title = getHeadingText(panel) || `Section ${idx + 1}`;
      const initial = readPanelState(panel);

      const wrap = document.createElement('div');
      wrap.style.cssText = `border:1px solid #e6e6e6; border-radius:12px; padding:10px; margin:10px 0;`;

      const h = document.createElement('div');
      h.style.cssText = `font-size:13px; font-weight:650; margin:0 0 8px 0;`;
      h.textContent = `${title} (${initial.length})`;

      const list = document.createElement('div');
      list.style.cssText = `display:flex; flex-direction:column; gap:8px;`;

      wrap.append(h, list);
      reorderBody.append(wrap);

      return { panel, title, list, initial };
    });

    setReorderStatus(
      `Detected ${reorderSections.length} section(s):\n` +
      `${reorderSections.map(s => `• ${s.title} (${s.initial.length})`).join('\n')}\n\n` +
      `Drag within a section only. Apply will reorder each section independently.`
    );

    let dragEl = null;

    function makeCard(item) {
      const card = document.createElement('div');
      card.draggable = true;
      card.dataset.src = item.src;
      card.style.cssText = `display:flex; align-items:center; gap:10px; border:1px solid #ddd; border-radius:10px; padding:10px; background:#fff; cursor:grab;`;

      const img = document.createElement('img');
      img.src = item.src;
      img.style.cssText = `width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid #eee; background:#fafafa;`;

      const meta = document.createElement('div');
      meta.style.cssText = `display:flex; flex-direction:column; gap:2px;`;

      const a = document.createElement('div');
      a.style.cssText = `font-size:13px; font-weight:650;`;
      a.textContent = `Current: ${item.order}`;

      const b = document.createElement('div');
      b.style.cssText = `font-size:12px; color:#666;`;
      b.textContent = 'New: ?';

      meta.append(a, b);

      const handle = document.createElement('div');
      handle.style.cssText = `margin-left:auto; font-size:18px; color:#999; user-select:none;`;
      handle.textContent = '⋮⋮';

      card.append(img, meta, handle);

      card.addEventListener('dragstart', (e) => {
        dragEl = card;
        card.style.opacity = '0.55';
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        dragEl = null;
        card.style.opacity = '1';
      });

      return card;
    }

    function wireDnD(listEl, onChange) {
      listEl.addEventListener('dragover', (e) => e.preventDefault());
      listEl.addEventListener('drop', (e) => e.preventDefault());

      Array.from(listEl.children).forEach(card => {
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          card.style.borderColor = '#111';
        });

        card.addEventListener('dragleave', () => {
          card.style.borderColor = '#ddd';
        });

        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.style.borderColor = '#ddd';

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
        const label = c.querySelector('div > div:nth-child(2)');
        if (label) label.textContent = `New: ${i + 1}`;
      });
    }

    for (const s of reorderSections) {
      s.initial.forEach(it => s.list.appendChild(makeCard(it)));
      updateNewLabels(s.list);
      wireDnD(s.list, () => updateNewLabels(s.list));
    }

    async function applyReorderSection(section, sectionIndex, totalSections) {
      const { panel, title, list } = section;
      const desired = Array.from(list.children).map((c, i) => ({ src: c.dataset.src, want: i + 1 }));

      const state = readPanelState(panel);
      const srcToOrder = new Map(state.map(x => [x.src, x.order]));
      const orderToSrc = new Map(state.map(x => [x.order, x.src]));

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
      btn.textContent = 'Applying…';

      try {
        for (let i = 0; i < reorderSections.length; i++) {
          await applyReorderSection(reorderSections[i], i + 1, reorderSections.length);
        }

        setReorderStatus(`Done.\nIf the table numbers don’t refresh immediately, refresh the page to confirm.`);
        btn.textContent = 'Done';
      } catch (err) {
        console.error(err);
        alert(`Apply failed: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Apply reorder';
        setReorderStatus('Apply failed — check console for details.');
      }
    }

    reorderControls.querySelector('[data-a="applyReorder"]').addEventListener('click', applyAllReorder);

    const gapBody = document.createElement('div');
    gapBody.style.cssText = `padding:12px; overflow:auto; flex:1;`;

    const gapControls = document.createElement('div');
    gapControls.style.cssText = `
      border:1px solid #e6e6e6;
      border-radius:12px;
      padding:12px;
      margin:0 0 12px 0;
      background:#fafafa;
    `;

    const gapStatus = document.createElement('div');
    gapStatus.style.cssText = `
      font-size:12px;
      color:#444;
      margin:0 0 10px 0;
      line-height:1.4;
      white-space:pre-wrap;
    `;

    const gapSectionsWrap = document.createElement('div');
    gapSectionsWrap.style.cssText = `
      display:flex;
      flex-direction:column;
      gap:10px;
    `;

    gapBody.append(gapControls, gapStatus, gapSectionsWrap);
    gapView.append(gapBody);

    const setGapStatus = (t) => { gapStatus.textContent = t; };

    gapControls.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:end;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:12px; color:#555;">Shared positions to free up</label>
            <input data-role="sharedPositions" type="text" value="2"
              placeholder="e.g. 2 or 2,5,7"
              style="width:220px; padding:8px 10px; border:1px solid #ccc; border-radius:8px;">
          </div>

          <label style="display:flex; align-items:center; gap:8px; font-size:13px; user-select:none;">
            <input data-role="uniqueToggle" type="checkbox">
            Use unique positions per section
          </label>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button data-a="all" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Select all</button>
            <button data-a="none" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Clear</button>
            <button data-a="normaliseAll" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Normalise all sections</button>
            <button data-a="applyGaps" style="padding:8px 10px; border:1px solid #111; background:#111; color:#fff; border-radius:8px; cursor:pointer;">Apply gaps</button>
          </div>
        </div>

        <div style="font-size:12px; color:#666;">
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

      const box = document.createElement('div');
      box.style.cssText = `
        border:1px solid #e6e6e6;
        border-radius:12px;
        padding:10px;
        background:#fff;
      `;

      const topRow = document.createElement('div');
      topRow.style.cssText = `
        display:flex;
        flex-wrap:wrap;
        gap:12px;
        align-items:flex-start;
        justify-content:space-between;
      `;

      const left = document.createElement('label');
      left.style.cssText = `
        display:flex;
        align-items:flex-start;
        gap:10px;
        cursor:pointer;
        flex:1;
      `;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = idx === 0;
      cb.style.marginTop = '2px';

      const meta = document.createElement('div');
      meta.style.cssText = `display:flex; flex-direction:column; gap:4px;`;

      const top = document.createElement('div');
      top.style.cssText = `font-size:13px; font-weight:650;`;
      top.textContent = `${title} (${initial.length})`;

      const sub = document.createElement('div');
      sub.style.cssText = `font-size:12px; color:#666;`;
      sub.textContent = `Current orders: ${initial.map(x => x.order).join(', ')}`;

      meta.append(top, sub);
      left.append(cb, meta);

      const right = document.createElement('div');
      right.style.cssText = `
        display:none;
        flex-direction:column;
        gap:6px;
        min-width:220px;
      `;

      const rightLabel = document.createElement('label');
      rightLabel.style.cssText = `font-size:12px; color:#555;`;
      rightLabel.textContent = 'Unique positions for this section';

      const uniqueInput = document.createElement('input');
      uniqueInput.type = 'text';
      uniqueInput.placeholder = 'e.g. 2 or 2,5,7';
      uniqueInput.value = '2';
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
      sharedPositionsInput.style.opacity = uniqueOn ? '0.55' : '1';

      for (const s of gapSections) {
        s.uniqueWrap.style.display = uniqueOn ? 'flex' : 'none';
      }
    }

    function setGapBusyState(isBusy, applyText = 'Apply gaps', normaliseText = 'Normalise all sections') {
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

    async function applyDesiredOrder(panel, desired, title, setStatus, statusPrefix = '') {
      const tempSlot = await ensureTempSlotFree(panel, setStatus, statusPrefix);

      const state = readPanelState(panel);
      const srcToOrder = new Map(state.map(x => [x.src, x.order]));
      const orderToSrc = new Map(state.map(x => [x.order, x.src]));

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

    async function normaliseSection(panel, title, setStatus, statusPrefix = '') {
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

    async function createSingleGapInSection(panel, title, insertPosition, setStatus, statusPrefix = '') {
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
        .filter(x => x.order >= insertPosition)
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

    async function createGapsInSection(panel, title, positions, setStatus, statusPrefix = '') {
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
      section.sub.textContent = `Current orders: ${now.map(x => x.order).join(', ')}`;
    }

    uniqueToggle.addEventListener('change', updateUniqueModeUI);
    updateUniqueModeUI();

    gapControls.querySelector('[data-a="all"]').addEventListener('click', () => {
      gapSections.forEach(s => { s.checkbox.checked = true; });
    });

    gapControls.querySelector('[data-a="none"]').addEventListener('click', () => {
      gapSections.forEach(s => { s.checkbox.checked = false; });
    });

    setGapStatus(
      `Detected ${gapSections.length} section(s):\n` +
      gapSections.map(s => `• ${s.title} (${s.initial.length})`).join('\n') +
      `\n\nUse “Normalise all sections” to clean up the whole page, or choose one or more sections and click “Apply gaps”.`
    );

    async function normaliseAllSections() {
      setGapBusyState(true, 'Apply gaps', 'Normalising…');
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
            `Normalise finished with some issues.\n\n` +
            errors.map(e => `• ${e}`).join('\n') +
            `\n\nRefresh the page if the table numbers do not update immediately.`
          );
          alert(`Normalise finished with ${errors.length} issue(s). Check the status box / console.`);
        } else {
          setGapStatus(
            `Done.\n` +
            `All sections have been normalised.\n` +
            `Refresh the page if the table numbers do not update immediately.`
          );
        }
      } catch (err) {
        console.error(err);
        alert(`Normalise failed: ${err.message}`);
        setGapStatus('Normalise failed — check console for details.');
      } finally {
        setGapBusyState(false, 'Apply gaps', 'Normalise all sections');
      }
    }

    async function applyAllGaps() {
      const selected = gapSections.filter(s => s.checkbox.checked);

      if (!selected.length) {
        alert('Please select at least one section.');
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

      setGapBusyState(true, 'Applying…', 'Normalise all sections');
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
            errors.map(e => `• ${e}`).join('\n') +
            `\n\nRefresh the page if the table numbers do not update immediately.`
          );
          alert(`Finished with ${errors.length} issue(s). Check the status box / console.`);
        } else {
          setGapStatus(
            `Done.\n` +
            `Gap creation completed in ${selected.length} section(s).\n` +
            `Refresh the page if the table numbers do not update immediately.`
          );
        }
      } catch (err) {
        console.error(err);
        alert(`Apply failed: ${err.message}`);
        setGapStatus('Apply failed — check console for details.');
      } finally {
        setGapBusyState(false, 'Apply gaps', 'Normalise all sections');
      }
    }

    normaliseBtn.addEventListener('click', normaliseAllSections);
    applyGapsBtn.addEventListener('click', applyAllGaps);

    switchTab('reorder');
  };

  CT.loaded.imageTools = true;
})();
