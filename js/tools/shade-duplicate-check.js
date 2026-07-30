(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.shadeDuplicateCheck) return;

  CT.tools.runShadeDuplicateCheckTool = function () {
    (() => {
      const norm = (value) =>
        (value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const esc = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char]));

      const { makeModal } = CT.utils;

      if (!makeModal) {
        alert("Shared modal helper not loaded.");
        return;
      }

      const setToolOpen = (isOpen) => {
        CT.state.shadeDuplicateCheckOpen = !!isOpen;
        CT.tools.refreshStatus?.();
      };

      const ROOT = document.querySelector("#complexForm") || document;
      const TABLE = ROOT.querySelector("table.data-table");

      if (!TABLE) {
        alert("Couldn't find table.data-table.");
        return;
      }

      const rows = [
        ...TABLE.querySelectorAll("tbody tr[data-ng-repeat]")
      ];

      if (!rows.length) {
        alert("No relationship rows were found.");
        return;
      }

      const headers = [...TABLE.querySelectorAll("thead th")].map((th) =>
        th.textContent.trim()
      );

      const skuIdx = headers.findIndex(
        (header) => norm(header) === "sku"
      );

      const getSkuFromRow = (row) => {
        if (!row) return "";

        if (skuIdx >= 0) {
          const skuCell =
            row.querySelectorAll(":scope > td")[skuIdx];

          const link = skuCell?.querySelector("a");

          return (
            link?.textContent ||
            skuCell?.textContent ||
            ""
          ).trim();
        }

        const firstCell =
          row.querySelector(":scope > td:first-child");

        const link =
          firstCell?.querySelector("a");

        return (
          link?.textContent ||
          firstCell?.textContent ||
          ""
        ).trim();
      };

      const STYLE_ID =
        "__ct_shade_duplicate_style__";

      const DUPLICATE_CLASS =
        "__ct_shade_duplicate__";

      let style =
        document.getElementById(STYLE_ID);

      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;

        style.textContent = `
          input.${DUPLICATE_CLASS} {
            color: #b91c1c !important;
            border-color: #dc2626 !important;
            background: #fef2f2 !important;
            box-shadow:
              0 0 0 1px #dc2626 inset !important;
            font-weight: 700 !important;
          }
        `;

        document.head.appendChild(style);
      }

      /*
       * Remove highlights left by the previous scan.
       */
      TABLE
        .querySelectorAll(
          `input.${DUPLICATE_CLASS}`
        )
        .forEach((input) => {
          input.classList.remove(
            DUPLICATE_CLASS
          );

          input.removeAttribute(
            "data-ct-shade-duplicate"
          );

          if (
            input.dataset.ctShadeOriginalTitle !==
            undefined
          ) {
            input.title =
              input.dataset.ctShadeOriginalTitle;

            delete input.dataset
              .ctShadeOriginalTitle;
          }
        });

      /*
       * Valid formats include:
       *
       * #8a593d||9.5W Mahogany
       * #FFF||White
       * #FFAA0088||Transparent orange
       *
       * 3, 6 and 8 character HEX codes are accepted.
       */
      const parseShade = (value) => {
        const match = String(value || "").match(
          /^\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})\s*\|\|\s*(.+?)\s*$/
        );

        if (!match) return null;

        const hex =
          match[1].toUpperCase();

        const shadeName =
          match[2]
            .replace(/\s+/g, " ")
            .trim();

        if (!shadeName) return null;

        return {
          hex,
          hexKey: hex.toLowerCase(),
          shadeName,
          shadeKey: norm(shadeName)
        };
      };

      const occurrences = [];

      /*
       * Scan every text input in every relationship row.
       * Inputs that do not match the shade format are ignored.
       */
      for (const row of rows) {
        const sku =
          getSkuFromRow(row);

        const inputs = [
          ...row.querySelectorAll(
            "input[type='text'], input:not([type])"
          )
        ];

        for (const input of inputs) {
          const parsed =
            parseShade(input.value);

          if (!parsed) continue;

          occurrences.push({
            ...parsed,
            sku,
            input,
            fullValue: input.value.trim()
          });
        }
      }

      const hexGroups = new Map();
      const shadeGroups = new Map();

      for (const occurrence of occurrences) {
        if (
          !hexGroups.has(
            occurrence.hexKey
          )
        ) {
          hexGroups.set(
            occurrence.hexKey,
            []
          );
        }

        hexGroups
          .get(occurrence.hexKey)
          .push(occurrence);

        if (
          !shadeGroups.has(
            occurrence.shadeKey
          )
        ) {
          shadeGroups.set(
            occurrence.shadeKey,
            []
          );
        }

        shadeGroups
          .get(occurrence.shadeKey)
          .push(occurrence);
      }

      const duplicateHexGroups = [
        ...hexGroups.values()
      ]
        .filter((group) =>
          group.length > 1
        )
        .sort((a, b) =>
          a[0].hex.localeCompare(
            b[0].hex
          )
        );

      const duplicateShadeGroups = [
        ...shadeGroups.values()
      ]
        .filter((group) =>
          group.length > 1
        )
        .sort((a, b) =>
          a[0].shadeName.localeCompare(
            b[0].shadeName,
            undefined,
            {
              sensitivity: "base"
            }
          )
        );

      /*
       * A single textbox may be duplicated for:
       *
       * - Its HEX code
       * - Its shade name
       * - Both
       */
      const duplicateReasons =
        new Map();

      const addReason = (
        input,
        reason
      ) => {
        if (
          !duplicateReasons.has(input)
        ) {
          duplicateReasons.set(
            input,
            []
          );
        }

        duplicateReasons
          .get(input)
          .push(reason);
      };

      for (
        const group of duplicateHexGroups
      ) {
        for (
          const occurrence of group
        ) {
          addReason(
            occurrence.input,
            `Duplicate HEX: ${occurrence.hex}`
          );
        }
      }

      for (
        const group of duplicateShadeGroups
      ) {
        for (
          const occurrence of group
        ) {
          addReason(
            occurrence.input,
            `Duplicate shade name: ${occurrence.shadeName}`
          );
        }
      }

      /*
       * Apply red highlighting and add a tooltip
       * explaining why each input was flagged.
       */
      for (
        const [input, reasons]
        of duplicateReasons
      ) {
        input.classList.add(
          DUPLICATE_CLASS
        );

        input.dataset.ctShadeDuplicate =
          "true";

        input.dataset.ctShadeOriginalTitle =
          input.title || "";

        input.title =
          reasons.join("\n");
      }

      const duplicateInputCount =
        duplicateReasons.size;

      const hasDuplicates =
        duplicateHexGroups.length > 0 ||
        duplicateShadeGroups.length > 0;

      const formatGroupDetails = (
        group
      ) =>
        group
          .map((item) => {
            const skuText =
              item.sku
                ? `SKU ${item.sku}`
                : "Unknown SKU";

            return (
              `${skuText} — ` +
              `${item.fullValue}`
            );
          })
          .join("\n");

      const buildHexColumn = () => {
        if (
          !duplicateHexGroups.length
        ) {
          return `
            <div style="
              color:#6b7280;
              font-size:13px;
            ">
              No duplicate HEX codes detected.
            </div>
          `;
        }

        return duplicateHexGroups
          .map((group) => `
            <div style="
              padding:10px;
              border:1px solid #fecaca;
              background:#fef2f2;
              border-radius:10px;
            ">
              <div style="
                font-weight:900;
                color:#991b1b;
              ">
                ${esc(group[0].hex)}
                × ${group.length}
              </div>

              <div style="
                margin-top:6px;
                color:#4b5563;
                font-family:
                  ui-monospace,
                  SFMono-Regular,
                  Menlo,
                  Monaco,
                  Consolas,
                  monospace;
                font-size:12px;
                white-space:pre-wrap;
              ">${esc(
                formatGroupDetails(group)
              )}</div>
            </div>
          `)
          .join("");
      };

      const buildShadeColumn = () => {
        if (
          !duplicateShadeGroups.length
        ) {
          return `
            <div style="
              color:#6b7280;
              font-size:13px;
            ">
              No duplicate shade names detected.
            </div>
          `;
        }

        return duplicateShadeGroups
          .map((group) => `
            <div style="
              padding:10px;
              border:1px solid #fecaca;
              background:#fef2f2;
              border-radius:10px;
            ">
              <div style="
                font-weight:900;
                color:#991b1b;
              ">
                ${esc(
                  group[0].shadeName
                )}
                × ${group.length}
              </div>

              <div style="
                margin-top:6px;
                color:#4b5563;
                font-family:
                  ui-monospace,
                  SFMono-Regular,
                  Menlo,
                  Monaco,
                  Consolas,
                  monospace;
                font-size:12px;
                white-space:pre-wrap;
              ">${esc(
                formatGroupDetails(group)
              )}</div>
            </div>
          `)
          .join("");
      };

      const summary = hasDuplicates
        ? (
          `${duplicateInputCount} textbox` +
          `${duplicateInputCount === 1 ? "" : "es"} ` +
          `highlighted. ` +
          `${duplicateHexGroups.length} duplicate ` +
          `HEX code group` +
          `${duplicateHexGroups.length === 1 ? "" : "s"} ` +
          `and ${duplicateShadeGroups.length} duplicate ` +
          `shade-name group` +
          `${duplicateShadeGroups.length === 1 ? "" : "s"} ` +
          `found.`
        )
        : (
          `No duplicate HEX codes or shade names ` +
          `were detected across ${occurrences.length} ` +
          `valid shade value` +
          `${occurrences.length === 1 ? "" : "s"}.`
        );

      setToolOpen(true);

      const reportModal = makeModal({
        title: hasDuplicates
          ? "Shade duplicate check — duplicates found"
          : "Shade duplicate check — no duplicates",

        width: "1100px",

        onClose: () =>
          setToolOpen(false),

        bodyHTML: `
          <div style="
            display:flex;
            flex-direction:column;
            gap:12px;
          ">
            <div style="
              padding:10px;
              border:1px solid ${
                hasDuplicates
                  ? "#fecaca"
                  : "#bbf7d0"
              };
              background:${
                hasDuplicates
                  ? "#fef2f2"
                  : "#f0fdf4"
              };
              color:${
                hasDuplicates
                  ? "#991b1b"
                  : "#166534"
              };
              border-radius:12px;
              font-weight:800;
              line-height:1.4;
            ">
              ${esc(summary)}
            </div>

            <div style="
              display:grid;
              grid-template-columns:
                minmax(0,1fr)
                minmax(0,1fr);
              gap:12px;
              align-items:start;
            ">
              <div style="
                min-width:0;
                padding:12px;
                border:1px solid #e5e7eb;
                border-radius:12px;
                background:#fff;
              ">
                <div style="
                  font-weight:900;
                  color:#111827;
                  margin-bottom:10px;
                ">
                  Duplicate HEX codes
                </div>

                <div style="
                  display:flex;
                  flex-direction:column;
                  gap:8px;
                ">
                  ${buildHexColumn()}
                </div>
              </div>

              <div style="
                min-width:0;
                padding:12px;
                border:1px solid #e5e7eb;
                border-radius:12px;
                background:#fff;
              ">
                <div style="
                  font-weight:900;
                  color:#111827;
                  margin-bottom:10px;
                ">
                  Duplicate shade names
                </div>

                <div style="
                  display:flex;
                  flex-direction:column;
                  gap:8px;
                ">
                  ${buildShadeColumn()}
                </div>
              </div>
            </div>

            <div style="
              color:#6b7280;
              font-size:12px;
              line-height:1.4;
            ">
              Valid shades are recognised in the
              format <code>#HEX||Shade name</code>.
              Textboxes with either a duplicate HEX
              code or duplicate shade name are
              highlighted red in the table.
            </div>
          </div>
        `,

        footerHTML: `
          <button
            data-clear
            style="
              border:0;
              background:#f3f4f6;
              color:#111827;
              border-radius:12px;
              padding:10px 14px;
              cursor:pointer;
              font-weight:800;
            "
          >
            Clear highlights
          </button>

          <button
            data-close
            style="
              border:0;
              background:#111827;
              color:#fff;
              border-radius:12px;
              padding:10px 14px;
              cursor:pointer;
              font-weight:800;
            "
          >
            Close
          </button>
        `
      });

      reportModal
        .qs("[data-close]")
        .addEventListener(
          "click",
          reportModal.close
        );

      reportModal
        .qs("[data-clear]")
        .addEventListener(
          "click",
          () => {
            TABLE
              .querySelectorAll(
                `input.${DUPLICATE_CLASS}`
              )
              .forEach((input) => {
                input.classList.remove(
                  DUPLICATE_CLASS
                );

                input.removeAttribute(
                  "data-ct-shade-duplicate"
                );

                if (
                  input.dataset
                    .ctShadeOriginalTitle !==
                  undefined
                ) {
                  input.title =
                    input.dataset
                      .ctShadeOriginalTitle;

                  delete input.dataset
                    .ctShadeOriginalTitle;
                }
              });

            reportModal.close();
          }
        );
    })();
  };

  CT.loaded.shadeDuplicateCheck = true;
})();
