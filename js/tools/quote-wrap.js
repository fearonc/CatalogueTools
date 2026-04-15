(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.quoteWrap) return;

  CT.tools.runQuoteWrapTool = function () {
    const { makeModal } = CT.utils;
    if (!makeModal) {
      alert("Shared modal helper not loaded.");
      return;
    }

    const setToolOpen = (isOpen) => {
      CT.state.quoteWrapOpen = !!isOpen;
      CT.tools.refreshStatus?.();
    };

    const watchModalClose = (modalObj, onClosed) => {
      if (!modalObj?.wrap) return;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        onClosed?.();
        observer.disconnect();
      };

      const observer = new MutationObserver(() => {
        if (!document.body.contains(modalObj.wrap)) {
          finish();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      const originalClose = modalObj.close;
      modalObj.close = () => {
        try {
          originalClose?.();
        } finally {
          finish();
        }
      };
    };

    const convertText = (raw) => {
      const lines = (raw || "")
        .split(/\r?\n/)
        .map((x) => (x || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);

      return lines
        .map((line, i) => {
          const safe = line.replace(/'/g, "''");
          return `'${safe}'${i === lines.length - 1 ? "" : ","}`;
        })
        .join("\n");
    };

    const modal = makeModal({
      title: "Wrap Excel column in quotes",
      width: "900px",
      bodyHTML: `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="color:#374151;font-size:13px;line-height:1.4;">
            Paste one column from Excel below. Each non-blank row will be converted to
            <code style="padding:2px 6px;border:1px solid #eee;border-radius:8px;background:#fafafa;">'Value',</code>
            with no comma on the last row.
          </div>

          <textarea data-input placeholder="Paste here..."
            style="color:#111;background:#fff;width:100%;min-height:220px;resize:vertical;padding:10px;border:1px solid #d1d5db;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.35;"></textarea>

          <div data-err style="display:none;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:10px;font-size:13px;"></div>

          <div style="font-size:13px;font-weight:700;color:#111827;">Output</div>

          <textarea data-output readonly
            style="color:#111;background:#f9fafb;width:100%;min-height:220px;resize:vertical;padding:10px;border:1px solid #d1d5db;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.35;"></textarea>
        </div>
      `,
      footerHTML: `
        <button data-close style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:700;">Close</button>
        <button data-run style="border:0;background:#2563eb;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Convert + Copy</button>
      `
    });

    setToolOpen(true);
    watchModalClose(modal, () => setToolOpen(false));

    const input = modal.qs("[data-input]");
    const output = modal.qs("[data-output]");
    const err = modal.qs("[data-err]");

    const refresh = () => {
      err.style.display = "none";
      output.value = convertText(input.value);
    };

    input.addEventListener("input", refresh);
    modal.qs("[data-close]").addEventListener("click", modal.close);

    modal.qs("[data-run]").addEventListener("click", async () => {
      const out = convertText(input.value);

      if (!out.trim()) {
        err.textContent = "Paste something first.";
        err.style.display = "block";
        return;
      }

      output.value = out;

      try {
        await navigator.clipboard.writeText(out);
      } catch {
        output.focus();
        output.select();
        document.execCommand("copy");
      }

      const btn = modal.qs("[data-run]");
      btn.textContent = "Copied!";
      setTimeout(() => {
        const b = modal.qs("[data-run]");
        if (b) b.textContent = "Convert + Copy";
      }, 1200);
    });

    refresh();
  };

  CT.loaded.quoteWrap = true;
})();
