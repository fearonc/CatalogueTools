(() => {
  // ---------------------------------------------------------------------------
  // Table filter + sort tool
  // - Adds a filter box and a sort dropdown under every column header
  // - Filters rows live (contains, case-insensitive, all active filters combined)
  // - Rows are only HIDDEN (never removed), and "Remove & restore" puts the table
  //   back exactly as it was (all rows visible, original order, UI removed)
  //
  // AUTO_RUN: true  -> runs immediately (paste straight into the Chrome console)
  //           false -> only registers CT.tools.runTableFilterTool for the bookmarklet loader
  // ---------------------------------------------------------------------------
  const AUTO_RUN = true;

  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  // If an older instance is still active (e.g. you re-pasted the script), clean it up first
  if (CT.state.tableFilterCleanup) {
    try { CT.state.tableFilterCleanup(); } catch {}
  }

  CT.tools.runTableFilterTool = function () {
    if (CT.state.tableFilterCleanup) {
      try { CT.state.tableFilterCleanup(); } catch {}
    }

    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

    const ROOT = document.querySelector("#complexForm") || document;
    const TABLE = ROOT.querySelector("table.data-table");
    if (!TABLE) {
      alert("Couldn't find table.data-table");
      return;
    }

    const headRow = TABLE.querySelector("thead th")?.closest("tr");
    if (!headRow) {
      alert("Couldn't find table header row");
      return;
    }
    const headerCells = [...headRow.children];
    const headerNames = headerCells.map((th) => th.textContent.trim());
    const TBODY = TABLE.querySelector("tbody");
    if (!TBODY) {
      alert("Couldn't find table body");
      return;
    }

    const getRows = () => [...TABLE.querySelectorAll("tbody tr[data-ng-repeat]")];
    const originalOrder = getRows();
    if (!originalOrder.length) {
      alert("No data rows found");
      return;
    }

    // ---- Read the "visible" value of a cell (inputs + dropdown buttons + text) ----
    const cellText = (td) => {
      if (!td) return "";
      const parts = [];

      td.querySelectorAll("input, textarea").forEach((el) => {
        if (!["checkbox", "radio", "hidden", "button", "submit"].includes(el.type)) {
          parts.push(el.value);
        }
      });
      td.querySelectorAll("select").forEach((el) => {
        parts.push(el.options[el.selectedIndex]?.text || "");
      });
      td.querySelectorAll(".dropdown-toggle").forEach((el) => {
        parts.push(el.textContent.replace(/[▾▼]/g, ""));
      });

      // Remaining plain text (e.g. SKU link) - strip controls and hidden dropdown menus first
      const clone = td.cloneNode(true);
      clone
        .querySelectorAll("input, textarea, select, ul.dropdown-menu, .dropdown-toggle, script, style")
        .forEach((el) => el.remove());
      parts.push(clone.textContent);

      return parts.join(" ").replace(/\s+/g, " ").trim();
    };

    // ---- State ----
    const filters = headerCells.map(() => "");
    let sort = null; // { idx, mode }
    let suppressObserver = false;
    let debounceTimer = null;

    // ---- Styles ----
    const STYLE_ID = "ct-table-filter-style";
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      tr[data-ctf-row] td { background:#fff8e1; padding:4px 6px !important; vertical-align:top; }
      tr[data-ctf-row] input, tr[data-ctf-row] select {
        width:100%; box-sizing:border-box; font-size:12px; padding:4px 6px;
        border:1px solid #d1d5db; border-radius:6px; background:#fff; color:#111827; height:auto;
      }
      tr[data-ctf-row] select { margin-top:4px; }
      tr[data-ctf-row] input.ctf-active, tr[data-ctf-row] select.ctf-active {
        border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,.2);
      }
      #ct-table-filter-bar {
        position:fixed; right:16px; bottom:16px; z-index:2147483647;
        background:#111827; color:#fff; border-radius:14px; padding:10px 12px;
        font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        box-shadow:0 8px 24px rgba(0,0,0,.35); max-width:340px;
      }
      #ct-table-filter-bar button {
        border:0; border-radius:10px; padding:6px 10px; cursor:pointer;
        font-weight:700; font-size:12px; background:#374151; color:#fff; margin:6px 6px 0 0;
      }
      #ct-table-filter-bar button[data-remove] { background:#dc2626; }
      #ct-table-filter-bar button:hover { filter:brightness(1.15); }
    `;
    document.head.appendChild(style);

    // ---- Filter / sort controls row (td cells, so existing tools reading "thead th" are unaffected) ----
    const filterRow = document.createElement("tr");
    filterRow.setAttribute("data-ctf-row", "1");

    const inputs = [];
    const selects = [];

    const SORT_OPTIONS = [
      ["", "Sort…"],
      ["az", "A → Z"],
      ["za", "Z → A"],
      ["num-asc", "0 → 9 (low–high)"],
      ["num-desc", "9 → 0 (high–low)"]
    ];

    headerCells.forEach((th, idx) => {
      const td = document.createElement("td");

      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Filter…";
      input.autocomplete = "off";
      input.title = `Filter "${headerNames[idx]}"`;
      input.addEventListener("input", () => {
        filters[idx] = input.value;
        input.classList.toggle("ctf-active", !!norm(input.value));
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyFilters, 120);
      });
      // Stop Enter submitting the page form, and keep keystrokes away from page hotkeys
      ["keydown", "keypress", "keyup"].forEach((evt) =>
        input.addEventListener(evt, (e) => {
          if (e.key === "Enter") e.preventDefault();
          e.stopPropagation();
        })
      );

      const select = document.createElement("select");
      SORT_OPTIONS.forEach(([val, label]) => {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = label;
        select.appendChild(o);
      });
      select.addEventListener("change", () => {
        selects.forEach((s) => {
          if (s !== select) {
            s.value = "";
            s.classList.remove("ctf-active");
          }
        });
        if (!select.value) {
          sort = null;
          select.classList.remove("ctf-active");
          restoreOrder();
        } else {
          sort = { idx, mode: select.value };
          select.classList.add("ctf-active");
          applySort();
        }
      });

      td.appendChild(input);
      td.appendChild(select);
      filterRow.appendChild(td);
      inputs.push(input);
      selects.push(select);
    });

    headRow.after(filterRow);

    // ---- Floating toolbar ----
    const bar = document.createElement("div");
    bar.id = "ct-table-filter-bar";
    bar.innerHTML = `
      <div><b>Table filter</b> — <span data-count>…</span></div>
      <div style="opacity:.75;font-size:12px;margin-top:2px;">Click “Remove &amp; restore” before saving the page.</div>
      <div>
        <button data-clear>Clear filters</button>
        <button data-resetsort>Reset sort</button>
        <button data-reapply>Re-apply</button>
        <button data-remove>Remove &amp; restore</button>
      </div>
    `;
    document.body.appendChild(bar);
    const countEl = bar.querySelector("[data-count]");

    // ---- Core functions ----
    function applyFilters() {
      const active = filters
        .map((v, i) => [i, norm(v)])
        .filter(([, v]) => v);

      const rows = getRows();
      let shown = 0;

      rows.forEach((tr) => {
        const ok = active.every(([i, v]) => norm(cellText(tr.children[i])).includes(v));
        if (ok) {
          if (tr.hasAttribute("data-ctf-hidden")) {
            tr.style.display = "";
            tr.removeAttribute("data-ctf-hidden");
          }
          shown++;
        } else {
          tr.style.display = "none";
          tr.setAttribute("data-ctf-hidden", "1");
        }
      });

      countEl.textContent = `showing ${shown} of ${rows.length} rows`;
    }

    function moveRows(orderedRows) {
      suppressObserver = true;
      orderedRows.forEach((tr) => TBODY.appendChild(tr));
      observer.takeRecords();
      suppressObserver = false;
    }

    function applySort() {
      if (!sort) return;
      const { idx, mode } = sort;
      const numeric = mode.startsWith("num");
      const dir = mode.endsWith("desc") ? -1 : 1;

      const keyed = getRows().map((tr, i) => {
        const t = cellText(tr.children[idx]);
        const m = t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
        return { tr, i, t, n: m ? parseFloat(m[0]) : NaN };
      });

      keyed.sort((a, b) => {
        const aEmpty = numeric ? Number.isNaN(a.n) : !a.t;
        const bEmpty = numeric ? Number.isNaN(b.n) : !b.t;
        // Blank / non-numeric values always go to the bottom
        if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.i - b.i : aEmpty ? 1 : -1;

        const c = numeric
          ? a.n - b.n
          : a.t.localeCompare(b.t, undefined, { numeric: true, sensitivity: "base" });
        return c ? c * dir : a.i - b.i;
      });

      moveRows(keyed.map((k) => k.tr));
    }

    function restoreOrder() {
      moveRows(originalOrder.filter((tr) => tr.isConnected));
    }

    function clearFilters() {
      inputs.forEach((inp, i) => {
        inp.value = "";
        inp.classList.remove("ctf-active");
        filters[i] = "";
      });
      applyFilters();
    }

    function resetSort() {
      selects.forEach((s) => {
        s.value = "";
        s.classList.remove("ctf-active");
      });
      const hadSort = !!sort;
      sort = null;
      if (hadSort) restoreOrder();
    }

    // Re-apply filters if the table rebuilds rows (e.g. Angular re-renders)
    const observer = new MutationObserver(() => {
      if (suppressObserver) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 150);
    });
    observer.observe(TBODY, { childList: true });

    function removeTool() {
      clearTimeout(debounceTimer);
      observer.disconnect();

      // Show every row again
      TABLE.querySelectorAll("tr[data-ctf-hidden]").forEach((tr) => {
        tr.style.display = "";
        tr.removeAttribute("data-ctf-hidden");
      });

      // Put rows back in original order (only if a sort was applied)
      if (sort) {
        sort = null;
        restoreOrder();
      }

      filterRow.remove();
      bar.remove();
      document.getElementById(STYLE_ID)?.remove();
      CT.state.tableFilterCleanup = null;
      CT.state.tableFilterOpen = false;
      CT.tools.refreshStatus?.();
    }

    bar.querySelector("[data-clear]").addEventListener("click", clearFilters);
    bar.querySelector("[data-resetsort]").addEventListener("click", resetSort);
    bar.querySelector("[data-reapply]").addEventListener("click", () => {
      applyFilters();
      applySort();
    });
    bar.querySelector("[data-remove]").addEventListener("click", removeTool);

    CT.state.tableFilterCleanup = removeTool;
    CT.state.tableFilterOpen = true;
    CT.tools.refreshStatus?.();

    applyFilters();
  };

  CT.loaded.tableFilter = true;

  if (AUTO_RUN) CT.tools.runTableFilterTool();
})();
