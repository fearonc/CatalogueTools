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
    #${PALETTE_ID} * { box-sizing: border-box; }

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

    #${PALETTE_ID} .tp-list {
      padding: 8px;
      overflow-y: auto;
      flex: 1 1 auto;
      min-height: 0;
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

      <div class="tp-list">
        <div class="tp-item active" data-i="0">
          <div class="tp-left">
            <div class="tp-num">1</div>
            <div>
              <div class="tp-name">Relationship Option Bulk Update</div>
              <div class="tp-desc">Paste from Excel to update Relationship options</div>
            </div>
          </div>
          <div class="tp-status">RUN</div>
        </div>

        <div class="tp-item" data-i="1">
          <div class="tp-left">
            <div class="tp-num">2</div>
            <div>
              <div class="tp-name">Matrix Image Tools</div>
              <div class="tp-desc">Reorder images or free up / normalise slots</div>
            </div>
          </div>
          <div class="tp-status">RUN</div>
        </div>

        <div class="tp-item" data-i="2">
          <div class="tp-left">
            <div class="tp-num">3</div>
            <div>
              <div class="tp-name">Audit History Search</div>
              <div class="tp-desc">Search collapsed audit rows and navigate matches</div>
            </div>
          </div>
          <div class="tp-status">RUN</div>
        </div>

        <div class="tp-item" data-i="3">
          <div class="tp-left">
            <div class="tp-num">4</div>
            <div>
              <div class="tp-name">Wrap for SQL "In" list</div>
              <div class="tp-desc">Type or paste from Excel to wrap in quotes</div>
            </div>
          </div>
          <div class="tp-status">RUN</div>
        </div>

        <div class="tp-item" data-i="4">
          <div class="tp-left">
            <div class="tp-num">5</div>
            <div>
              <div class="tp-name">JSON Viewer</div>
              <div class="tp-desc">Pretty JSON with search</div>
            </div>
          </div>
          <div class="tp-status">RUN</div>
        </div>
      </div>

  <div class="tp-toggles">
  <div class="tp-toggle-row">
    <span class="tp-toggle-label">Dark Mode Overlay</span>
    <label class="tp-switch">
      <input type="checkbox" id="__ct_dark_toggle__">
      <span class="tp-slider dark-slider">
        <span class="tp-knob">☽</span>
      </span>
    </label>
  </div>
  <div class="tp-toggle-row">
    <span class="tp-toggle-label">Pink Mode Overlay</span>
    <label class="tp-switch">
      <input type="checkbox" id="__ct_pink_toggle__">
      <span class="tp-slider pink-slider">
        <span class="tp-knob"></span>
      </span>
    </label>
  </div>
</div>

      <div class="tp-foot">Click items to run</div>
    </div>
  `;
  document.body.appendChild(root);

  const items = [...root.querySelectorAll(".tp-item")];
  const closeBtn = root.querySelector(".tp-close");
  const head = root.querySelector(".tp-head");
  const darkToggle = root.querySelector("#__ct_dark_toggle__");
  const pinkToggle = root.querySelector("#__ct_pink_toggle__");
  darkToggle.checked = !!document.getElementById("sdp-dark-overlay-style");
pinkToggle.checked = !!document.getElementById("sdp-pink-overlay-style");
  const statusImageTools = root.querySelector('[data-i="1"] .tp-status');

  let idx = 0;
  let drag = false;
  let sx = 0;
  let sy = 0;
  let startL = 0;
  let startT = 0;

  function refreshStatus() {
    if (statusImageTools) {
      const isOpen =
        window.__thgImageToolsOpen === true ||
        window.__thgReorderToolOpen === true;

      statusImageTools.textContent = isOpen ? "ON" : "RUN";
      statusImageTools.classList.toggle("on", isOpen);
    }
  }

  window.__toolPaletteRefreshStatus__ = refreshStatus;

  function sync() {
    items.forEach((el, i) => el.classList.toggle("active", i === idx));
  }

  function run(i) {
    if (i === 0) CT.tools.runBulkUpdateTool?.();
    if (i === 1) CT.tools.runImageReorderTool?.();
    if (i === 2) CT.tools.runAuditHistorySearchTool?.();
    if (i === 3) CT.tools.runQuoteWrapTool?.();
    if (i === 4) CT.tools.runJsonViewerTool?.();
    refreshStatus();
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  function onClick(e) {
    const item = e.target.closest(".tp-item");
    if (item) run(Number(item.dataset.i));
  }

  function onDragStart(e) {
    if (e.target.closest(".tp-close")) return;
    if (e.target.closest(".tp-item")) return;

    drag = true;
    const r = root.getBoundingClientRect();

    root.style.left = r.left + "px";
    root.style.top = r.top + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";

    sx = e.clientX;
    sy = e.clientY;
    startL = r.left;
    startT = r.top;

    e.preventDefault();
  }

  function onDragMove(e) {
    if (!drag) return;

    let left = startL + (e.clientX - sx);
    let top = startT + (e.clientY - sy);

    const maxLeft = window.innerWidth - root.offsetWidth - 8;
    const maxTop = window.innerHeight - root.offsetHeight - 8;

    left = Math.max(8, Math.min(maxLeft, left));
    top = Math.max(8, Math.min(maxTop, top));

    root.style.left = left + "px";
    root.style.top = top + "px";
  }

  function onDragEnd() {
    drag = false;
  }

  darkToggle?.addEventListener("change", (e) => {
  if (e.target.checked) {
    pinkToggle.checked = false;
    CT.tools.disablePinkOverlay?.();
    CT.tools.enableDarkOverlay?.();
  } else {
    CT.tools.disableDarkOverlay?.();
  }
});

pinkToggle?.addEventListener("change", (e) => {
  if (e.target.checked) {
    darkToggle.checked = false;
    CT.tools.disableDarkOverlay?.();
    CT.tools.enablePinkOverlay?.();
  } else {
    CT.tools.disablePinkOverlay?.();
  }
});

  function cleanup() {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousemove", onDragMove, true);
    window.removeEventListener("mouseup", onDragEnd, true);

    root.remove();
    style.remove();

    delete window.__toolPaletteRefreshStatus__;

    CT.state.isOpen = false;
    delete CT.state.cleanup;
  }

  items.forEach((el) => {
    el.addEventListener("mouseenter", () => {
      idx = Number(el.dataset.i);
      sync();
    });
  });

  root.addEventListener("mousedown", onClick);
  closeBtn.addEventListener("click", cleanup);
  head.addEventListener("mousedown", onDragStart);
  window.addEventListener("mousemove", onDragMove, true);
  window.addEventListener("mouseup", onDragEnd, true);
  window.addEventListener("keydown", onKey, true);

  refreshStatus();

  CT.state.isOpen = true;
  CT.state.cleanup = cleanup;
})();
