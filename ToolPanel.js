(() => {
  if (window.__toolPanelBooted__) {
    window.__toolPaletteCleanup__?.();
    delete window.__toolPanelBooted__;
    return;
  }

  window.__toolPanelBooted__ = true;

  const PALETTE_ID = "__tool_palette__";
  const STYLE_ID = "__tool_palette_style__";

  if (document.getElementById(PALETTE_ID)) {
    window.__toolPaletteCleanup__?.();
    delete window.__toolPanelBooted__;
    return;
  }

  function toggleMatrix() {
    const existing = document.getElementById("__matrix_rain_canvas__");
    if (existing) {
      cancelAnimationFrame(existing.__matrixFrame__);
      window.removeEventListener("resize", existing.__resize__);
      existing.remove();
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.id = "__matrix_rain_canvas__";
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483645",
      pointerEvents: "none",
      background: "rgba(0,0,0,.08)"
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    let cols = 0;
    let drops = [];
    const fontSize = 16;
    const chars =
      "アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@$%&*+-<>";

    function resize() {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      cols = Math.floor(innerWidth / fontSize);
      drops = Array(cols).fill(0).map(() => -100 * Math.random());
    }

    function draw() {
      ctx.fillStyle = "rgba(0,0,0,.08)";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillStyle = "#b6ffb6";
        ctx.fillText(ch, x, y);

        ctx.fillStyle = "#00ff41";
        ctx.fillText(ch, x, y - fontSize);

        if (y > innerHeight && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i]++;
      }

      canvas.__matrixFrame__ = requestAnimationFrame(draw);
    }

    resize();
    draw();
    canvas.__resize__ = resize;
    window.addEventListener("resize", resize);
  }

  function runBulkUpdateTool() {
    (async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const esc = s =>
        (s || "").replace(/[&<>"']/g, m => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[m]));

      const makeModal = ({ title, bodyHTML, footerHTML, width = "900px" }) => {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;";
        wrap.innerHTML = `
          <div style="width:min(${width},98vw);max-height:92vh;background:#fff;border-radius:12px;box-shadow:0 10px 35px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;">
            <div style="padding:14px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="font-size:16px;font-weight:700;">${esc(title)}</div>
              <button data-x style="border:0;background:#f3f4f6;border-radius:10px;padding:6px 10px;cursor:pointer;font-weight:600;">✕</button>
            </div>
            <div style="padding:14px 16px;overflow:auto;">${bodyHTML}</div>
            <div style="padding:12px 16px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">${footerHTML || ""}</div>
          </div>`;
        document.body.appendChild(wrap);
        const close = () => wrap.remove();
        wrap.addEventListener("click", e => {
          if (e.target === wrap) close();
        });
        wrap.querySelector("[data-x]").addEventListener("click", close);
        return {
          wrap,
          close,
          qs: sel => wrap.querySelector(sel)
        };
      };

      const ROOT = document.querySelector("#complexForm") || document;
      const TABLE = ROOT.querySelector("table.data-table");
      if (!TABLE) {
        alert("Couldn't find table.data-table");
        return;
      }

      const headers = [...TABLE.querySelectorAll("thead th")].map(th => th.textContent.trim());
      const skuIdx = headers.findIndex(h => norm(h) === "sku");
      if (skuIdx < 0) {
        alert("Couldn't find SKU header");
        return;
      }

      const rrpIdx = headers.findIndex(h => norm(h) === "rrp");
      const firstVarIdx = rrpIdx >= 0 ? rrpIdx + 1 : skuIdx + 1;
      const varHeaders = headers.slice(firstVarIdx);
      if (!varHeaders.length) {
        alert("No variation headers detected");
        return;
      }

      const rows = [...TABLE.querySelectorAll("tbody tr[data-ng-repeat]")];
      if (!rows.length) {
        alert("No data rows found");
        return;
      }

      const firstRowTds = [...rows[0].querySelectorAll(":scope > td")];
      const colSpecs = varHeaders.map((name, i) => {
        const colIdx = firstVarIdx + i;
        const cell = firstRowTds[colIdx];
        const hasInput = !!cell?.querySelector("input[type='text'], input:not([type])");
        const hasDropdown = !!cell?.querySelector(
          "button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle"
        );
        const excelCols = hasInput && hasDropdown ? 2 : 1;
        return { name, colIdx, excelCols };
      });

      const getSkuFromRow = tr => {
        const a = tr.querySelector("td:first-child a");
        const txt = a ? a.textContent : tr.querySelector("td:first-child")?.textContent;
        return (txt || "").trim();
      };

      const setInputValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter ? setter.call(input, value) : (input.value = value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const closeAnyOpenDropdowns = () => {
        document
          .querySelectorAll(".uib-dropdown.open, .dropdown.open, .open .dropdown-menu")
          .forEach(el => el.classList.remove("open"));
        document.querySelectorAll("[aria-expanded='true']").forEach(btn => {
          try {
            btn.setAttribute("aria-expanded", "false");
          } catch {}
        });
        try {
          document.body.click();
        } catch {}
        try {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
          );
        } catch {}
      };

      const setDropdownInCell = async (cell, desiredText) => {
        if (!desiredText) return { ok: true, skipped: true };

        const btn = cell.querySelector(
          "button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle"
        );
        const menu = cell.querySelector("ul.dropdown-menu");
        if (!btn || !menu) return { ok: false, reason: "dropdown not found" };

        const current = norm(btn.textContent.replace("▾", "").replace("▼", ""));
        if (current === norm(desiredText)) return { ok: true, skipped: true };

        btn.click();
        await sleep(60);

        const options = [...menu.querySelectorAll("a.ng-binding, a")];
        const target = options.find(a => norm(a.textContent) === norm(desiredText));
        if (!target) {
          closeAnyOpenDropdowns();
          return { ok: false, reason: `option not found: "${desiredText}"` };
        }

        target.click();
        await sleep(30);
        closeAnyOpenDropdowns();
        await sleep(10);
        return { ok: true, skipped: false };
      };

      const expectedCols = ["SKU"];
      for (const c of colSpecs) {
        if (c.excelCols === 2) {
          expectedCols.push(`${c.name} (value)`, `${c.name} (unit)`);
        } else {
          expectedCols.push(c.name);
        }
      }

      const pasteModal = makeModal({
        title: "Bulk update — paste Excel TSV",
        width: "980px",
        bodyHTML: `
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="color:#374151;font-size:13px;line-height:1.35;">
              Paste tab-separated values (TSV) copied from Excel. First column must be <b>SKU</b>. Expected columns (in order):<br>
              <code style="display:block;margin-top:6px;padding:8px;border:1px solid #eee;border-radius:10px;background:#fafafa;white-space:pre-wrap;">${esc(expectedCols.join("  |  "))}</code>
            </div>
            <textarea data-ta placeholder="Paste here…" style="width:100%;min-height:340px;resize:vertical;padding:10px;border:1px solid #d1d5db;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.35;"></textarea>
            <div data-err style="display:none;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:10px;font-size:13px;"></div>
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="flex:1;height:10px;border-radius:999px;background:#eef2f7;overflow:hidden;">
                <div data-bar style="height:100%;width:0%;background:#2563eb;"></div>
              </div>
              <div data-pct style="min-width:52px;text-align:right;font-variant-numeric:tabular-nums;color:#374151;">0%</div>
            </div>
            <div data-status style="font-size:13px;color:#4b5563;">Ready.</div>
          </div>`,
        footerHTML: `
          <button data-cancel style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:700;">Cancel</button>
          <button data-start style="border:0;background:#2563eb;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Start</button>`
      });

      let cancelled = false;
      pasteModal.qs("[data-cancel]").addEventListener("click", () => {
        cancelled = true;
        pasteModal.close();
      });

      const ta = pasteModal.qs("[data-ta]");
      const errBox = pasteModal.qs("[data-err]");
      const bar = pasteModal.qs("[data-bar]");
      const pct = pasteModal.qs("[data-pct]");
      const status = pasteModal.qs("[data-status]");

      const setProgress = (done, total, msg) => {
        const p = total ? Math.round((done / total) * 100) : 0;
        bar.style.width = p + "%";
        pct.textContent = p + "%";
        if (msg) status.textContent = msg;
      };

      const collectErrorSkus = () => {
        const errInputs = [...document.querySelectorAll(".has-error input.form-control")];
        return [
          ...new Set(
            errInputs
              .map(i => {
                const tr = i.closest("tr");
                return getSkuFromRow(tr) || "";
              })
              .filter(Boolean)
          )
        ];
      };

      const showReport = ({ stats, dupeSkus, missingDropdowns }) => {
        const dupeHTML = dupeSkus.length
          ? `<div style="margin-top:10px;padding:10px;border:1px solid #fee2e2;background:#fef2f2;border-radius:12px;">
              <div style="font-weight:800;color:#991b1b;">Duplicate / validation errors (.has-error)</div>
              <div style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;white-space:pre-wrap;">${esc(dupeSkus.join("\n"))}</div>
            </div>`
          : `<div style="margin-top:10px;padding:10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;">
              <div style="font-weight:800;color:#374151;">Duplicate / validation errors (.has-error)</div>
              <div style="margin-top:6px;color:#6b7280;">None detected.</div>
            </div>`;

        const missHTML = missingDropdowns.length
          ? `<div style="margin-top:10px;padding:10px;border:1px solid #ffedd5;background:#fff7ed;border-radius:12px;">
              <div style="font-weight:800;color:#9a3412;">Missing dropdown options (not found)</div>
              <div style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;white-space:pre-wrap;">${esc(missingDropdowns.map(m => `SKU ${m.sku} — ${m.field}: ${m.desired}`).join("\n"))}</div>
            </div>`
          : `<div style="margin-top:10px;padding:10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;">
              <div style="font-weight:800;color:#374151;">Missing dropdown options</div>
              <div style="margin-top:6px;color:#6b7280;">None.</div>
            </div>`;

        const summaryText = `Run summary

Rows in table: ${stats.rows}
Rows with mapping: ${stats.mappedRows}
Changed ops: ${stats.changed}
Skipped blanks: ${stats.skipped}
Dropdown misses: ${missingDropdowns.length}
Validation-error SKUs: ${dupeSkus.length}`;

        const allText = [
          summaryText,
          "",
          "Validation error SKUs:",
          "",
          ...(dupeSkus.length ? dupeSkus : ["(none)"]),
          "",
          "Missing dropdown options:",
          "",
          ...(missingDropdowns.length
            ? missingDropdowns.map(m => `SKU ${m.sku} — ${m.field}: ${m.desired}`)
            : ["(none)"])
        ].join("\n");

        const m = makeModal({
          title: "Bulk update — report",
          width: "980px",
          bodyHTML: `
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;">
                <div style="font-weight:900;color:#111827;">Summary</div>
                <div style="margin-top:6px;color:#374151;font-size:13px;line-height:1.4;white-space:pre-wrap;">${esc(summaryText)}</div>
              </div>
              ${dupeHTML}
              ${missHTML}
              <textarea data-out style="position:absolute;left:-9999px;top:-9999px;">${esc(allText)}</textarea>
            </div>`,
          footerHTML: `
            <button data-copy style="border:0;background:#111827;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Copy report</button>
            <button data-close style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Close</button>`
        });

        m.qs("[data-close]").addEventListener("click", m.close);
        m.qs("[data-copy]").addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(allText);
          } catch {
            const t = m.qs("[data-out]");
            t.value = allText;
            t.select();
            document.execCommand("copy");
          }
          m.qs("[data-copy]").textContent = "Copied!";
          setTimeout(() => {
            const b = m.qs("[data-copy]");
            if (b) b.textContent = "Copy report";
          }, 1200);
        });
      };

      pasteModal.qs("[data-start]").addEventListener("click", async () => {
        errBox.style.display = "none";
        const pasted = ta.value || "";
        if (!pasted.trim()) {
          errBox.textContent = "Paste something first.";
          errBox.style.display = "block";
          return;
        }

        pasteModal.qs("[data-start]").disabled = true;
        pasteModal.qs("[data-start]").style.opacity = 0.7;
        pasteModal.qs("[data-start]").style.cursor = "not-allowed";

        const map = new Map();
        pasted
          .split(/\r?\n/)
          .map(l => l.replace(/\s+$/, ""))
          .filter(l => l.trim())
          .forEach(line => {
            const parts = line.split("\t");
            const sku = (parts[0] || "").trim();
            if (!sku) return;
            map.set(sku, parts.slice(1).map(x => (x ?? "").trim()));
          });

        const missingDropdowns = [];
        let changed = 0;
        let skipped = 0;
        let notInMap = 0;
        let mappedRows = 0;
        const totalRows = rows.length;
        let doneRows = 0;

        setProgress(0, totalRows, "Running…");

        for (const tr of rows) {
          if (cancelled) break;

          const sku = getSkuFromRow(tr);
          if (!sku) {
            doneRows++;
            setProgress(doneRows, totalRows, `Scanning… (${doneRows}/${totalRows})`);
            continue;
          }

          const cells = map.get(sku);
          if (!cells) {
            notInMap++;
            doneRows++;
            setProgress(doneRows, totalRows, `Running… (${doneRows}/${totalRows})`);
            continue;
          }

          mappedRows++;
          const tds = [...tr.querySelectorAll(":scope > td")];
          let p = 0;

          for (const spec of colSpecs) {
            const cell = tds[spec.colIdx];
            if (!cell) {
              p += spec.excelCols;
              continue;
            }

            if (spec.excelCols === 2) {
              const value = (cells[p] || "").trim();
              const unit = (cells[p + 1] || "").trim();
              p += 2;

              if (value) {
                const input = cell.querySelector("input[type='text'], input:not([type])");
                if (input) {
                  setInputValue(input, value);
                  changed++;
                } else {
                  skipped++;
                }
              } else {
                skipped++;
              }

              if (unit) {
                const r = await setDropdownInCell(cell, unit);
                if (!r.ok) {
                  missingDropdowns.push({ sku, field: spec.name, desired: unit });
                } else if (!r.skipped) {
                  changed++;
                } else {
                  skipped++;
                }
              } else {
                skipped++;
              }
            } else {
              const desired = (cells[p] || "").trim();
              p += 1;

              if (!desired) {
                skipped++;
                continue;
              }

              const input = cell.querySelector("input[type='text'], input:not([type])");
              const hasDropdown = !!cell.querySelector(
                "button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle"
              );

              if (input && !hasDropdown) {
                setInputValue(input, desired);
                changed++;
              } else if (hasDropdown) {
                const r = await setDropdownInCell(cell, desired);
                if (!r.ok) {
                  missingDropdowns.push({ sku, field: spec.name, desired });
                } else if (!r.skipped) {
                  changed++;
                } else {
                  skipped++;
                }
              } else if (input) {
                setInputValue(input, desired);
                changed++;
              } else {
                skipped++;
              }
            }

            await sleep(4);
          }

          doneRows++;
          if (doneRows % 2 === 0) {
            setProgress(doneRows, totalRows, `Running… (${doneRows}/${totalRows})`);
          }
        }

        setProgress(totalRows, totalRows, "Checking validation errors…");

        let dupeSkus = [];
        for (let attempt = 0; attempt < 6; attempt++) {
          await sleep(250);
          dupeSkus = collectErrorSkus();
          if (dupeSkus.length) break;
        }

        closeAnyOpenDropdowns();
        pasteModal.close();

        showReport({
          stats: { rows: totalRows, mappedRows, changed, skipped, notInMap },
          dupeSkus,
          missingDropdowns
        });
      });
    })();
  }

  function removeAll() {
    const matrix = document.getElementById("__matrix_rain_canvas__");
    if (matrix) {
      cancelAnimationFrame(matrix.__matrixFrame__);
      window.removeEventListener("resize", matrix.__resize__);
      matrix.remove();
    }
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PALETTE_ID} {
      position: fixed;
      right: 14px;
      bottom: 14px;
      width: 320px;
      z-index: 2147483647;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    #${PALETTE_ID} * {
      box-sizing: border-box;
    }

    #${PALETTE_ID} .tp-box {
      width: 100%;
      background: rgba(15,17,23,.96);
      color: #e8ecf3;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
      overflow: hidden;
      backdrop-filter: blur(8px);
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
    }

    #${PALETTE_ID} .tp-status.on {
      background: rgba(80,200,120,.18);
      color: #9ff0b3;
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
          <div class="tp-title">JavaScript Tools</div>
          <div>Toggle tools and leave this open</div>
        </div>
        <button class="tp-close" title="Close">×</button>
      </div>

      <div class="tp-list">
        <div class="tp-item active" data-i="0">
          <div class="tp-left">
            <div class="tp-num">1</div>
            <div>
              <div class="tp-name">Matrix Rain</div>
              <div class="tp-desc">Toggle matrix overlay</div>
            </div>
          </div>
          <div class="tp-status" data-s="matrix">OFF</div>
        </div>

        <div class="tp-item" data-i="1">
          <div class="tp-left">
            <div class="tp-num">2</div>
            <div>
              <div class="tp-name">Bulk Update TSV</div>
              <div class="tp-desc">Paste Excel TSV and update table</div>
            </div>
          </div>
          <div class="tp-status">RUN</div>
        </div>

        <div class="tp-item" data-i="2">
          <div class="tp-left">
            <div class="tp-num">3</div>
            <div>
              <div class="tp-name">Remove All Effects</div>
              <div class="tp-desc">Turn matrix off</div>
            </div>
          </div>
        </div>
      </div>

      <div class="tp-foot">Click items to run • Esc closes</div>
    </div>
  `;
  document.body.appendChild(root);

  const items = [...root.querySelectorAll(".tp-item")];
  const closeBtn = root.querySelector(".tp-close");
  const statusMatrix = root.querySelector('[data-s="matrix"]');
  const head = root.querySelector(".tp-head");

  let idx = 0;
  let drag = false;
  let sx = 0;
  let sy = 0;
  let startL = 0;
  let startT = 0;

  function refreshStatus() {
    const matrixOn = !!document.getElementById("__matrix_rain_canvas__");
    if (statusMatrix) {
      statusMatrix.textContent = matrixOn ? "ON" : "OFF";
      statusMatrix.classList.toggle("on", matrixOn);
    }
  }

  function sync() {
    items.forEach((el, i) => {
      el.classList.toggle("active", i === idx);
    });
  }

  function run(i) {
    if (i === 0) toggleMatrix();
    if (i === 1) runBulkUpdateTool();
    if (i === 2) removeAll();
    refreshStatus();
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  function onClick(e) {
    const item = e.target.closest(".tp-item");
    if (item) run(+item.dataset.i);
  }

  function onDragStart(e) {
    if (e.target.closest(".tp-close")) return;

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

  function cleanup() {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousemove", onDragMove, true);
    window.removeEventListener("mouseup", onDragEnd, true);
    root.remove();
    style.remove();
    delete window.__toolPaletteCleanup__;
    delete window.__toolPanelBooted__;
  }

  items.forEach(el => {
    el.addEventListener("mouseenter", () => {
      idx = +el.dataset.i;
      sync();
    });
  });

  root.addEventListener("mousedown", onClick);
  closeBtn.addEventListener("click", cleanup);
  head.addEventListener("mousedown", onDragStart);
  window.addEventListener("mousemove", onDragMove, true);
  window.addEventListener("mouseup", onDragEnd, true);
  window.addEventListener("keydown", onKey, true);

  window.__toolPaletteCleanup__ = cleanup;
  refreshStatus();
})();
