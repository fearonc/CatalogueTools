(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });
  if (CT.loaded.bulkLinkedOptions) return;

  CT.tools.runBulkLinkedOptionsTool = function () {
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const esc = (s) =>
        (s || "").replace(/[&<>"']/g, (m) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[m]));

      const { makeModal } = CT.utils;
      if (!makeModal) {
        alert("Shared modal helper not loaded.");
        return;
      }

      const setToolOpen = (isOpen) => {
        CT.state.bulkLinkedOptionsOpen = !!isOpen;
        CT.tools.refreshStatus?.();
      };

      // ---- Page structure ----
      const rows = [...document.querySelectorAll('tr[ng-repeat="entry in vm.group.productInfo"]')];
      if (!rows.length) {
        alert('Couldn\'t find any rows (tr[ng-repeat="entry in vm.group.productInfo"]).');
        return;
      }

      const getSkuFromRow = (tr) => {
        const cells = tr.querySelectorAll("td.ng-binding");
        return cells.length >= 2 ? cells[1].textContent.trim() : "";
      };

      const setSelectOption = (select, desiredText) => {
        if (!desiredText) return { ok: true, skipped: true };
        const target = norm(desiredText);
        let match = null;
        for (const opt of select.options) {
          if (norm(opt.label || opt.textContent) === target) {
            match = opt;
            break;
          }
        }
        if (!match) return { ok: false, reason: `option not found: "${desiredText}"` };
        if (select.value === match.value) return { ok: true, skipped: true };

        select.value = match.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, skipped: false };
      };

      const collectErrorSkus = () => {
        const errEls = [...document.querySelectorAll(".has-error select, .has-error input.form-control")];
        return [
          ...new Set(
            errEls
              .map((el) => getSkuFromRow(el.closest("tr")) || "")
              .filter(Boolean)
          )
        ];
      };

      setToolOpen(true);

      // ---- Paste modal ----
      let cancelled = false;
      const pasteModal = makeModal({
        title: "Bulk linked options — paste Excel TSV",
        width: "820px",
        onClose: () => setToolOpen(false),
        bodyHTML: `
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="color:#374151;font-size:13px;line-height:1.35;">
              Paste tab-separated values (TSV) copied from Excel. First column must be <b>SKU</b> (matches the page's SKU column), second column is the <b>Option</b> text to set:<br>
              <code style="display:block;margin-top:6px;padding:8px;border:1px solid #eee;border-radius:10px;background:#fafafa;white-space:pre-wrap;">SKU | Option</code>
            </div>
            <textarea data-ta placeholder="16620552&#9;Black&#10;16620553&#9;Deep Navy&#10;16620554&#9;Amber Gold" style="width:100%;min-height:280px;resize:vertical;padding:10px;border:1px solid #d1d5db;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.35;box-sizing:border-box;"></textarea>
            <div data-err style="display:none;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:10px;font-size:13px;"></div>
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="flex:1;height:10px;border-radius:999px;background:#eef2f7;overflow:hidden;">
                <div data-bar style="height:100%;width:0%;background:#2563eb;"></div>
              </div>
              <div data-pct style="min-width:52px;text-align:right;font-variant-numeric:tabular-nums;color:#374151;">0%</div>
            </div>
            <div data-status style="font-size:13px;color:#4b5563;">Ready.</div>
          </div>
        `,
        footerHTML: `
          <button data-cancel style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:700;">Cancel</button>
          <button data-start style="border:0;background:#2563eb;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Start</button>
        `
      });

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

      // ---- Report modal ----
      const showReport = ({ stats, dupeSkus, missingOptions, skuNotFound }) => {
        const section = (title, color, bg, border, items, formatFn) =>
          items.length
            ? `<div style="margin-top:10px;padding:10px;border:1px solid ${border};background:${bg};border-radius:12px;">
                 <div style="font-weight:800;color:${color};">${esc(title)}</div>
                 <div style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;white-space:pre-wrap;">${esc(items.map(formatFn).join("\n"))}</div>
               </div>`
            : `<div style="margin-top:10px;padding:10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;">
                 <div style="font-weight:800;color:#374151;">${esc(title)}</div>
                 <div style="margin-top:6px;color:#6b7280;">None.</div>
               </div>`;

        const missHTML = section(
          "Missing option text (not found in dropdown)",
          "#9a3412",
          "#fff7ed",
          "#ffedd5",
          missingOptions,
          (m) => `SKU ${m.sku} — wanted: "${m.desired}"`
        );
        const notFoundHTML = section(
          "SKU not found on page",
          "#9a3412",
          "#fff7ed",
          "#ffedd5",
          skuNotFound,
          (s) => `SKU ${s}`
        );
        const dupeHTML = section(
          "Validation errors (.has-error)",
          "#991b1b",
          "#fef2f2",
          "#fee2e2",
          dupeSkus,
          (s) => s
        );

        const summaryText =
          `Run summary\n` +
          `Rows in table: ${stats.rows}\n` +
          `Rows with mapping: ${stats.mappedRows}\n` +
          `Changed: ${stats.changed}\n` +
          `Already correct / skipped: ${stats.skipped}\n` +
          `SKU not found: ${skuNotFound.length}\n` +
          `Option not found: ${missingOptions.length}\n` +
          `Validation-error SKUs: ${dupeSkus.length}`;

        const allText = [
          summaryText,
          "",
          "Missing option text:",
          "",
          ...(missingOptions.length ? missingOptions.map((m) => `SKU ${m.sku} — wanted: "${m.desired}"`) : ["(none)"]),
          "",
          "SKU not found on page:",
          "",
          ...(skuNotFound.length ? skuNotFound : ["(none)"]),
          "",
          "Validation error SKUs:",
          "",
          ...(dupeSkus.length ? dupeSkus : ["(none)"])
        ].join("\n");

        setToolOpen(true);
        const reportModal = makeModal({
          title: "Bulk linked options — report",
          width: "820px",
          onClose: () => setToolOpen(false),
          bodyHTML: `
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;">
                <div style="font-weight:900;color:#111827;">Summary</div>
                <div style="margin-top:6px;color:#374151;font-size:13px;line-height:1.4;white-space:pre-wrap;">${esc(summaryText)}</div>
              </div>
              ${missHTML}
              ${notFoundHTML}
              ${dupeHTML}
              <textarea data-out style="position:absolute;left:-9999px;top:-9999px;">${esc(allText)}</textarea>
            </div>
          `,
          footerHTML: `
            <button data-copy style="border:0;background:#111827;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Copy report</button>
            <button data-close style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Close</button>
          `
        });

        reportModal.qs("[data-close]").addEventListener("click", reportModal.close);
        reportModal.qs("[data-copy]").addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(allText);
          } catch {
            const t = reportModal.qs("[data-out]");
            t.value = allText;
            t.select();
            document.execCommand("copy");
          }
          reportModal.qs("[data-copy]").textContent = "Copied!";
          setTimeout(() => {
            const b = reportModal.qs("[data-copy]");
            if (b) b.textContent = "Copy report";
          }, 1200);
        });

        // The warning that can't be missed.
        if (missingOptions.length || skuNotFound.length) {
          const parts = [];
          if (missingOptions.length) parts.push(`${missingOptions.length} option(s) not found in their dropdown`);
          if (skuNotFound.length) parts.push(`${skuNotFound.length} SKU(s) not found on the page`);
          alert(`Bulk linked options finished with issues:\n\n${parts.join("\n")}\n\nSee the report for details.`);
        }
      };

      // ---- Run ----
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
          .map((l) => l.replace(/\s+$/, ""))
          .filter((l) => l.trim())
          .forEach((line) => {
            let parts = line.split("\t");
            if (parts.length < 2) parts = line.split(/\s{2,}/);
            const sku = (parts[0] || "").trim();
            const optionText = parts.slice(1).join(" ").trim();
            if (sku && optionText) map.set(sku, optionText);
          });

        const missingOptions = [];
        let changed = 0;
        let skipped = 0;
        let mappedRows = 0;
        const totalRows = rows.length;
        let doneRows = 0;
        const remainingSkus = new Set(map.keys());

        setProgress(0, totalRows, "Running…");

        for (const tr of rows) {
          if (cancelled) break;
          const sku = getSkuFromRow(tr);
          doneRows++;

          if (!sku || !map.has(sku)) {
            if (doneRows % 5 === 0) setProgress(doneRows, totalRows, `Running… (${doneRows}/${totalRows})`);
            continue;
          }

          remainingSkus.delete(sku);
          mappedRows++;
          const desired = map.get(sku);
          const select = tr.querySelector("select");

          if (!select) {
            missingOptions.push({ sku, desired });
          } else {
            const r = setSelectOption(select, desired);
            if (!r.ok) {
              missingOptions.push({ sku, desired });
            } else if (!r.skipped) {
              changed++;
            } else {
              skipped++;
            }
          }

          if (doneRows % 5 === 0) {
            setProgress(doneRows, totalRows, `Running… (${doneRows}/${totalRows})`);
            await sleep(4);
          }
        }

        setProgress(totalRows, totalRows, "Checking validation errors…");
        let dupeSkus = [];
        for (let attempt = 0; attempt < 4; attempt++) {
          await sleep(150);
          dupeSkus = collectErrorSkus();
          if (dupeSkus.length) break;
        }

        const skuNotFound = [...remainingSkus];

        pasteModal.close();
        showReport({
          stats: { rows: totalRows, mappedRows, changed, skipped },
          dupeSkus,
          missingOptions,
          skuNotFound
        });
      });
    })();
  };

  CT.loaded.bulkLinkedOptions = true;
})();
