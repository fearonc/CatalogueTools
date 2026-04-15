(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.auditSearch) return;

  CT.tools.runAuditHistorySearchTool = function () {
    (async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

      const term = prompt("Search audit history for term:");
      if (!term || !term.trim()) return;

      const needle = term.trim().toLowerCase();

      const START_ROW_SELECTOR = 'tr[data-ng-repeat-start="history in history"]';
      const TOGGLE_SELECTOR = '[data-ng-click="toggleExpandHistory(history)"]';
      const TABLE_SELECTOR = 'table.table';
      const PANEL_ID = "__audit_search_panel__";

     document.getElementById(PANEL_ID)?.remove();
window.__auditSearchObserver__?.disconnect?.();
delete window.__auditSearchObserver__;
CT.state.auditSearchOpen = false;
CT.tools.refreshStatus?.();

      const startRows = [...document.querySelectorAll(START_ROW_SELECTOR)];
      if (!startRows.length) {
        alert("No audit history rows found.");
        return;
      }

      const table = document.querySelector(TABLE_SELECTOR) || startRows[0]?.closest("table");
      if (!table) {
        alert("Could not find the audit history table.");
        return;
      }

      const clearRowStyles = () => {
        document.querySelectorAll("[data-audit-match='1'], [data-audit-dim='1'], [data-audit-active='1']").forEach(el => {
          el.style.outline = "";
          el.style.background = "";
          el.style.opacity = "";
          el.style.boxShadow = "";
          delete el.dataset.auditMatch;
          delete el.dataset.auditDim;
          delete el.dataset.auditActive;
        });
      };

      const clearMarks = root => {
        if (!root) return;
        root.querySelectorAll("mark[data-audit-hit='1']").forEach(mark => {
          mark.replaceWith(document.createTextNode(mark.textContent));
        });
        root.normalize();
      };

      const getDetailRow = row => {
        const next = row?.nextElementSibling;
        if (!next) return null;
        if (next.matches(START_ROW_SELECTOR)) return null;
        return next.tagName === "TR" ? next : null;
      };

      const isExpanded = row => {
        const icon = row.querySelector(".glyphicon");
        return !!icon?.classList.contains("glyphicon-chevron-down");
      };

      const expandRow = async row => {
        if (!row) return null;
        const toggle = row.querySelector(TOGGLE_SELECTOR);
        if (!toggle) return null;

        let detailRow = getDetailRow(row);
        if (detailRow) return detailRow;

        if (!isExpanded(row)) {
          toggle.click();
          await sleep(50);
        }

        const start = performance.now();
        while ((performance.now() - start) < 1400) {
          detailRow = getDetailRow(row);
          if (detailRow) return detailRow;
          await sleep(30);
        }

        return getDetailRow(row);
      };

      const highlightTermInElement = (root, searchTerm) => {
        if (!root || !searchTerm) return [];

        clearMarks(root);

        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest("mark[data-audit-hit='1']")) return NodeFilter.FILTER_REJECT;
              if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        const marks = [];

        for (const textNode of textNodes) {
          const text = textNode.nodeValue;
          const lower = text.toLowerCase();
          if (!lower.includes(searchTerm)) continue;

          const frag = document.createDocumentFragment();
          let lastIndex = 0;
          let idx = 0;

          while ((idx = lower.indexOf(searchTerm, lastIndex)) !== -1) {
            if (idx > lastIndex) {
              frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
            }

            const mark = document.createElement("mark");
            mark.setAttribute("data-audit-hit", "1");
            mark.style.background = "#fde68a";
            mark.style.color = "#111";
            mark.style.padding = "0 2px";
            mark.style.borderRadius = "3px";
            mark.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,.08)";
            mark.textContent = text.slice(idx, idx + searchTerm.length);
            frag.appendChild(mark);
            marks.push(mark);

            lastIndex = idx + searchTerm.length;
          }

          if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
          }

          textNode.parentNode.replaceChild(frag, textNode);
        }

        return marks;
      };

      clearRowStyles();

      const results = [];

      for (let i = 0; i < startRows.length; i++) {
        const row = startRows[i];
        const detailRow = await expandRow(row);

        const headerText = norm(row.innerText || row.textContent || "");
        const detailText = norm(detailRow?.innerText || detailRow?.textContent || "");
        const matched = headerText.includes(needle) || detailText.includes(needle);

        if (matched) {
          row.dataset.auditMatch = "1";
          row.style.outline = "2px solid #16a34a";
          row.style.background = "#f0fdf4";
          row.style.opacity = "1";

          if (detailRow) {
            detailRow.dataset.auditMatch = "1";
            detailRow.style.outline = "2px solid #16a34a";
            detailRow.style.background = "#f0fdf4";
            detailRow.style.opacity = "1";
          }

          const cells = row.querySelectorAll("td");
          results.push({
            index: i,
            row,
            date: cells[1]?.innerText?.trim() || "",
            type: cells[2]?.innerText?.trim() || "",
            user: cells[3]?.innerText?.trim() || ""
          });
        } else {
          row.dataset.auditDim = "1";
          row.style.opacity = "0.28";
          if (detailRow) {
            detailRow.dataset.auditDim = "1";
            detailRow.style.opacity = "0.28";
          }
        }
      }

     if (!results.length) {
  CT.state.auditSearchOpen = false;
  CT.tools.refreshStatus?.();
  alert(`No matches found for "${term}".`);
  return;
}

      let activeIndex = 0;

      const matchedRows = new Set(results.map(r => r.row));

      const applyHighlightToOpenMatchedRow = () => {
        const openRow = [...document.querySelectorAll(START_ROW_SELECTOR)].find(isExpanded);
        if (!openRow) return;

        const detailRow = getDetailRow(openRow);
        if (!detailRow) return;

        clearMarks(detailRow);

        if (matchedRows.has(openRow)) {
          const marks = highlightTermInElement(detailRow, needle);
          if (marks.length) {
            marks[0].style.background = "#f59e0b";
            marks[0].style.outline = "2px solid #b45309";
          }
        }
      };

      const panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.style.cssText = [
        "position:fixed",
        "right:16px",
        "bottom:16px",
        "z-index:2147483647",
        "background:#111827",
        "color:#fff",
        "border-radius:12px",
        "box-shadow:0 10px 30px rgba(0,0,0,.35)",
        "padding:12px",
        "min-width:280px",
        "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"
      ].join(";");

      panel.innerHTML = `
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Audit search</div>
        <div data-summary style="font-size:12px;color:#d1d5db;line-height:1.4;margin-bottom:10px;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button data-prev style="border:0;background:#374151;color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:700;">Previous</button>
          <button data-next style="border:0;background:#2563eb;color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:700;">Next</button>
          <button data-clear style="border:0;background:#f3f4f6;color:#111827;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:700;">Clear</button>
        </div>
      `;
      document.body.appendChild(panel);

      CT.state.auditSearchOpen = true;
      CT.tools.refreshStatus?.();

      const updatePanel = () => {
        panel.querySelector("[data-summary]").innerHTML = `
          <div><b>Term:</b> ${term}</div>
          <div><b>Matching rows:</b> ${results.length}</div>
          <div><b>Current:</b> ${activeIndex + 1}/${results.length}</div>
          <div style="margin-top:4px;color:#93c5fd;">${results[activeIndex]?.date || ""} · ${results[activeIndex]?.type || ""} · ${results[activeIndex]?.user || ""}</div>
        `;
      };

      const focusResult = async idx => {
        if (idx < 0 || idx >= results.length) return;
        activeIndex = idx;

        document.querySelectorAll("[data-audit-active='1']").forEach(el => {
          el.style.boxShadow = "";
          delete el.dataset.auditActive;
        });

        const result = results[activeIndex];
        const row = result.row;
        const detailRow = await expandRow(row);

        row.dataset.auditActive = "1";
        row.style.boxShadow = "inset 0 0 0 2px #f59e0b";

        if (detailRow) {
          detailRow.dataset.auditActive = "1";
          detailRow.style.boxShadow = "inset 0 0 0 2px #f59e0b";

          const marks = highlightTermInElement(detailRow, needle);

          if (marks.length) {
            marks[0].style.background = "#f59e0b";
            marks[0].style.outline = "2px solid #b45309";
            marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        updatePanel();
      };

      const clearAll = () => {
        document.getElementById(PANEL_ID)?.remove();
        window.__auditSearchObserver__?.disconnect?.();
        delete window.__auditSearchObserver__;
        clearRowStyles();
        document.querySelectorAll("tr").forEach(tr => clearMarks(tr));

        CT.state.auditSearchOpen = false;
        CT.tools.refreshStatus?.();
      };

      panel.querySelector("[data-prev]").addEventListener("click", () => {
        focusResult((activeIndex - 1 + results.length) % results.length);
      });

      panel.querySelector("[data-next]").addEventListener("click", () => {
        focusResult((activeIndex + 1) % results.length);
      });

      panel.querySelector("[data-clear]").addEventListener("click", clearAll);

      updatePanel();
      await focusResult(0);

      let reapplyTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(reapplyTimer);
        reapplyTimer = setTimeout(() => {
          applyHighlightToOpenMatchedRow();
        }, 150);
      });

      observer.observe(table.tBodies[0] || table, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });

      window.__auditSearchObserver__ = observer;

      table.addEventListener("click", () => {
        clearTimeout(reapplyTimer);
        reapplyTimer = setTimeout(() => {
          applyHighlightToOpenMatchedRow();
        }, 250);
      }, true);

      console.clear();
      console.log(`Search term: "${term}"`);
      console.log(`Matching rows: ${results.length}`);
      console.table(results.map((r, i) => ({
        "#": i + 1,
        "Date Uploaded": r.date,
        "Upload Type": r.type,
        "Username": r.user
      })));
    })();
  };

  CT.loaded.auditSearch = true;
})();
