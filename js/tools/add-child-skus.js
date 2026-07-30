(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.bulkAddAndUpdate) return;

  CT.tools.runBulkAddAndUpdateTool = function () {
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const norm = (value) =>
        (value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const esc = (value) =>
        (value || "").replace(/[&<>"']/g, (char) => ({
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
        CT.state.bulkAddAndUpdateOpen = !!isOpen;
        CT.tools.refreshStatus?.();
      };

      const ROOT = document.querySelector("#complexForm") || document;
      const TABLE = ROOT.querySelector("table.data-table");
      const TBODY = TABLE?.querySelector("tbody");

      if (!TABLE || !TBODY) {
        alert("Couldn't find table.data-table.");
        return;
      }

      const addInput = ROOT.querySelector(
        "fieldset > div > div.col-xs-3.ng-scope > div > input"
      );

      const addButton = ROOT.querySelector(
        "fieldset > div > div.col-xs-3.ng-scope > div > span > button"
      );

      if (!addInput) {
        alert("Couldn't find the SKU input field.");
        return;
      }

      if (!addButton) {
        alert("Couldn't find the Add Child button.");
        return;
      }

      const headers = [...TABLE.querySelectorAll("thead th")].map((th) =>
        th.textContent.trim()
      );

      const skuIdx = headers.findIndex(
        (header) => norm(header) === "sku"
      );

      if (skuIdx < 0) {
        alert("Couldn't find SKU header.");
        return;
      }

      const rrpIdx = headers.findIndex(
        (header) => norm(header) === "rrp"
      );

      const firstVarIdx = rrpIdx >= 0
        ? rrpIdx + 1
        : skuIdx + 1;

      const varHeaders = headers.slice(firstVarIdx);

      if (!varHeaders.length) {
        alert("No variation headers detected.");
        return;
      }

      const getRows = () => [
        ...TBODY.querySelectorAll("tr[data-ng-repeat]")
      ];

      const initialRows = getRows();

      if (!initialRows.length) {
        alert(
          "No existing data row was found to detect the option column types."
        );
        return;
      }

      /*
       * Detect whether each variation column is:
       *
       * 1. A normal text input
       * 2. A dropdown
       * 3. A combined value + unit input
       *
       * Combined columns consume two Excel columns.
       */
      const firstRowCells = [
        ...initialRows[0].querySelectorAll(":scope > td")
      ];

      const colSpecs = varHeaders.map((name, index) => {
        const colIdx = firstVarIdx + index;
        const cell = firstRowCells[colIdx];

        const hasInput = !!cell?.querySelector(
          "input[type='text'], input:not([type])"
        );

        const hasDropdown = !!cell?.querySelector(
          "button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle"
        );

        return {
          name,
          colIdx,
          excelCols: hasInput && hasDropdown ? 2 : 1
        };
      });

      /*
       * Build the column instructions displayed in the modal.
       */
      const expectedCols = ["SKU"];

      for (const spec of colSpecs) {
        if (spec.excelCols === 2) {
          expectedCols.push(
            `${spec.name} (value)`,
            `${spec.name} (unit)`
          );
        } else {
          expectedCols.push(spec.name);
        }
      }

      const getSkuFromRow = (row) => {
        if (!row) return "";

        const skuCell = row.querySelectorAll(":scope > td")[skuIdx];
        const link = skuCell?.querySelector("a");

        return (
          link?.textContent ||
          skuCell?.textContent ||
          ""
        ).trim();
      };

      const findRowBySku = (sku) =>
  getRows().find(
    (row) => norm(getSkuFromRow(row)) === norm(sku)
  ) || null;

      /*
       * Set an input value in a way that Angular recognises.
       */
      const setInputValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;

        if (setter) {
          setter.call(input, value);
        } else {
          input.value = value;
        }

        input.dispatchEvent(
          new Event("input", { bubbles: true })
        );

        input.dispatchEvent(
          new Event("change", { bubbles: true })
        );
      };

      const closeAnyOpenDropdowns = () => {
        document
          .querySelectorAll(
            ".uib-dropdown.open, " +
            ".dropdown.open, " +
            ".open .dropdown-menu"
          )
          .forEach((element) => {
            element.classList.remove("open");
          });

        document
          .querySelectorAll("[aria-expanded='true']")
          .forEach((button) => {
            try {
              button.setAttribute("aria-expanded", "false");
            } catch {}
          });

        try {
          document.body.click();
        } catch {}

        try {
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Escape",
              bubbles: true
            })
          );
        } catch {}
      };

      const setDropdownInCell = async (
        cell,
        desiredText
      ) => {
        if (!desiredText) {
          return {
            ok: true,
            skipped: true
          };
        }

        const button = cell.querySelector(
          "button.dropdown-toggle[data-uib-dropdown-toggle], " +
          ".dropdown-toggle"
        );

        const menu = cell.querySelector(
          "ul.dropdown-menu"
        );

        if (!button || !menu) {
          return {
            ok: false,
            reason: "dropdown not found"
          };
        }

        const current = norm(
          button.textContent
            .replace("▾", "")
            .replace("▼", "")
        );

        if (current === norm(desiredText)) {
          return {
            ok: true,
            skipped: true
          };
        }

        button.click();
        await sleep(60);

        const options = [
          ...menu.querySelectorAll("a.ng-binding, a")
        ];

        const target = options.find(
          (option) =>
            norm(option.textContent) === norm(desiredText)
        );

        if (!target) {
          closeAnyOpenDropdowns();

          return {
            ok: false,
            reason: `option not found: "${desiredText}"`
          };
        }

        target.click();

        await sleep(30);
        closeAnyOpenDropdowns();
        await sleep(10);

        return {
          ok: true,
          skipped: false
        };
      };

      /*
       * Wait for the table row count to increase after pressing
       * the Add Child button.
       *
       * When possible, return the newly created row that matches
       * the requested SKU.
       */
      const waitForAddedRow = async (
        sku,
        rowsBefore,
        timeoutMs = 2500
      ) => {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
          const rows = getRows();

          if (rows.length > rowsBefore) {
            const matchingRows = rows.filter(
              (row) =>
                norm(getSkuFromRow(row)) === norm(sku)
            );

            if (matchingRows.length) {
              return matchingRows[
                matchingRows.length - 1
              ];
            }

            /*
             * Fallback if the SKU text has not yet rendered but
             * the new row has appeared.
             */
            return rows[rows.length - 1];
          }

          await sleep(25);
        }

        return null;
      };

      const collectErrorSkus = () => [
        ...new Set(
          [
            ...document.querySelectorAll(
              ".has-error input.form-control"
            )
          ]
            .map((input) =>
              getSkuFromRow(input.closest("tr"))
            )
            .filter(Boolean)
        )
      ];

      /*
       * Parse pasted Excel TSV.
       *
       * The first column is the SKU.
       * All remaining columns are option data.
       *
       * If an SKU appears more than once, the final occurrence
       * supplies the option values.
       */
      const parseTsv = (pasted) => {
        const dataBySku = new Map();
        const orderedSkus = [];
        const duplicateInputSkus = [];

        pasted
          .split(/\r?\n/)
          .map((line) =>
            line.replace(/\s+$/, "")
          )
          .filter((line) =>
            line.trim()
          )
          .forEach((line) => {
            const parts = line.split("\t");
            const sku = (parts[0] || "").trim();

            if (!sku) return;

            if (dataBySku.has(sku)) {
              duplicateInputSkus.push(sku);
            } else {
              orderedSkus.push(sku);
            }

            dataBySku.set(
              sku,
              parts
                .slice(1)
                .map((value) =>
                  (value ?? "").trim()
                )
            );
          });

        return {
          dataBySku,
          orderedSkus,
          duplicateInputSkus: [
            ...new Set(duplicateInputSkus)
          ]
        };
      };

      const showReport = ({
  stats,
  existingSkus,
  failedAdds,
  duplicateInputSkus,
  dupeSkus,
  missingDropdowns
}) => {
        const section = (
          title,
          items,
          emptyText,
          tone = "neutral"
        ) => {
          const styles = {
            neutral: [
              "#e5e7eb",
              "#f9fafb",
              "#374151"
            ],
            error: [
              "#fee2e2",
              "#fef2f2",
              "#991b1b"
            ],
            warning: [
              "#ffedd5",
              "#fff7ed",
              "#9a3412"
            ]
          }[tone];

          return `
            <div style="
              padding:10px;
              border:1px solid ${styles[0]};
              background:${styles[1]};
              border-radius:12px;
            ">
              <div style="
                font-weight:800;
                color:${styles[2]};
              ">
                ${esc(title)}
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
              ">
                ${esc(
                  items.length
                    ? items.join("\n")
                    : emptyText
                )}
              </div>
            </div>
          `;
        };

        const summaryText = [
  "Run summary",
  `Input SKUs: ${stats.inputSkus}`,
  `Newly added: ${stats.added}`,
  `Already in relationship: ${existingSkus.length}`,
  `Failed / no row: ${failedAdds.length}`,
  `Rows updated: ${stats.updatedRows}`,
  `Changed operations: ${stats.changed}`,
  `Skipped blanks / unchanged: ${stats.skipped}`,
  `Dropdown misses: ${missingDropdowns.length}`,
  `Validation-error SKUs: ${dupeSkus.length}`
].join("\n");

        const missingLines = missingDropdowns.map(
          (item) =>
            `SKU ${item.sku} — ` +
            `${item.field}: ${item.desired}`
        );

        cconst allText = [
  summaryText,
  "",
  "Already in relationship:",
  ...(
    existingSkus.length
      ? existingSkus
      : ["(none)"]
  ),
  "",
  "Failed additions:",
          ...(
            failedAdds.length
              ? failedAdds
              : ["(none)"]
          ),
          "",
          "Duplicate SKUs in pasted input (last row used):",
          ...(
            duplicateInputSkus.length
              ? duplicateInputSkus
              : ["(none)"]
          ),
          "",
          "Validation-error SKUs:",
          ...(
            dupeSkus.length
              ? dupeSkus
              : ["(none)"]
          ),
          "",
          "Missing dropdown options:",
          ...(
            missingLines.length
              ? missingLines
              : ["(none)"]
          )
        ].join("\n");

        setToolOpen(true);

        const reportModal = makeModal({
          title: "Bulk add + update — report",
          width: "980px",

          onClose: () => {
            setToolOpen(false);
          },

          bodyHTML: `
            <div style="
              display:flex;
              flex-direction:column;
              gap:10px;
            ">
              <div style="
                padding:10px;
                border:1px solid #e5e7eb;
                background:#f9fafb;
                border-radius:12px;
              ">
                <div style="
                  font-weight:900;
                  color:#111827;
                ">
                  Summary
                </div>

                <div style="
                  margin-top:6px;
                  color:#374151;
                  font-size:13px;
                  line-height:1.4;
                  white-space:pre-wrap;
                ">
                  ${esc(summaryText)}
                </div>
              </div>

              ${section(
  "Already in relationship — options updated",
  existingSkus,
  "None.",
  existingSkus.length
    ? "warning"
    : "neutral"
)}

${section(
  "Failed additions",
  failedAdds,
  "None.",
  failedAdds.length
    ? "error"
    : "neutral"
)}

              ${section(
                "Duplicate SKUs in pasted input (last row used)",
                duplicateInputSkus,
                "None.",
                duplicateInputSkus.length
                  ? "warning"
                  : "neutral"
              )}

              ${section(
                "Duplicate / validation errors (.has-error)",
                dupeSkus,
                "None detected.",
                dupeSkus.length
                  ? "error"
                  : "neutral"
              )}

              ${section(
                "Missing dropdown options",
                missingLines,
                "None.",
                missingLines.length
                  ? "warning"
                  : "neutral"
              )}

              <textarea
                data-out
                style="
                  position:absolute;
                  left:-9999px;
                  top:-9999px;
                "
              >${esc(allText)}</textarea>
            </div>
          `,

          footerHTML: `
            <button
              data-copy
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
              Copy report
            </button>

            <button
              data-close
              style="
                border:0;
                background:#f3f4f6;
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
          .qs("[data-copy]")
          .addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(
                allText
              );
            } catch {
              const output =
                reportModal.qs("[data-out]");

              output.value = allText;
              output.select();

              document.execCommand("copy");
            }

            const button =
              reportModal.qs("[data-copy]");

            button.textContent = "Copied!";

            setTimeout(() => {
              if (button) {
                button.textContent = "Copy report";
              }
            }, 1200);
          });
      };

      setToolOpen(true);

      const pasteModal = makeModal({
        title:
          "Bulk add + update — paste Excel TSV",

        width: "980px",

        onClose: () => {
          setToolOpen(false);
        },

        bodyHTML: `
          <div style="
            display:flex;
            flex-direction:column;
            gap:10px;
          ">
            <div style="
              color:#374151;
              font-size:13px;
              line-height:1.35;
            ">
              Paste tab-separated values copied from Excel.
              The first column is used to add each child SKU.
              After the rows appear, their option fields are
              populated from the remaining columns.

              <br><br>

              You <b>MUST</b> copy <b>ALL</b> expected columns,
              even when some cells are blank, in this order:

              <code style="
                display:block;
                margin-top:6px;
                padding:8px;
                border:1px solid #eee;
                border-radius:10px;
                background:#fafafa;
                white-space:pre-wrap;
              ">${esc(expectedCols.join(" | "))}</code>
            </div>

            <textarea
              data-ta
              placeholder="Paste here…"
              style="
                width:100%;
                min-height:340px;
                resize:vertical;
                padding:10px;
                border:1px solid #d1d5db;
                border-radius:12px;
                font-family:
                  ui-monospace,
                  SFMono-Regular,
                  Menlo,
                  Monaco,
                  Consolas,
                  monospace;
                font-size:12px;
                line-height:1.35;
              "
            ></textarea>

            <div
              data-err
              style="
                display:none;
                color:#b91c1c;
                background:#fef2f2;
                border:1px solid #fecaca;
                border-radius:12px;
                padding:10px;
                font-size:13px;
              "
            ></div>

            <div style="
              display:flex;
              gap:10px;
              align-items:center;
            ">
              <div style="
                flex:1;
                height:10px;
                border-radius:999px;
                background:#eef2f7;
                overflow:hidden;
              ">
                <div
                  data-bar
                  style="
                    height:100%;
                    width:0%;
                    background:#2563eb;
                  "
                ></div>
              </div>

              <div
                data-pct
                style="
                  min-width:52px;
                  text-align:right;
                  font-variant-numeric:
                    tabular-nums;
                  color:#374151;
                "
              >
                0%
              </div>
            </div>

            <div
              data-status
              style="
                font-size:13px;
                color:#4b5563;
              "
            >
              Ready.
            </div>
          </div>
        `,

        footerHTML: `
          <button
            data-cancel
            style="
              border:0;
              background:#f3f4f6;
              border-radius:12px;
              padding:10px 14px;
              cursor:pointer;
              font-weight:700;
            "
          >
            Cancel
          </button>

          <button
            data-start
            style="
              border:0;
              background:#2563eb;
              color:#fff;
              border-radius:12px;
              padding:10px 14px;
              cursor:pointer;
              font-weight:800;
            "
          >
            Start
          </button>
        `
      });

      let cancelled = false;

      pasteModal
        .qs("[data-cancel]")
        .addEventListener("click", () => {
          cancelled = true;
          pasteModal.close();
        });

      const textarea =
        pasteModal.qs("[data-ta]");

      const errorBox =
        pasteModal.qs("[data-err]");

      const progressBar =
        pasteModal.qs("[data-bar]");

      const percentage =
        pasteModal.qs("[data-pct]");

      const status =
        pasteModal.qs("[data-status]");

      const startButton =
        pasteModal.qs("[data-start]");

      const setProgress = (
        done,
        total,
        message
      ) => {
        const value = total
          ? Math.round((done / total) * 100)
          : 0;

        progressBar.style.width =
          `${value}%`;

        percentage.textContent =
          `${value}%`;

        if (message) {
          status.textContent = message;
        }
      };

      startButton.addEventListener(
        "click",
        async () => {
          errorBox.style.display = "none";

          const pasted =
            textarea.value || "";

          if (!pasted.trim()) {
            errorBox.textContent =
              "Paste something first.";

            errorBox.style.display =
              "block";

            return;
          }

          const {
            dataBySku,
            orderedSkus,
            duplicateInputSkus
          } = parseTsv(pasted);

          if (!orderedSkus.length) {
            errorBox.textContent =
              "No valid SKUs were found in the first column.";

            errorBox.style.display =
              "block";

            return;
          }

          startButton.disabled = true;
          startButton.style.opacity = 0.7;
          startButton.style.cursor =
            "not-allowed";

        /*
 * Rows to update includes both newly added rows
 * and rows already present in the relationship.
 */
const targetRows = new Map();
const existingSkus = [];
const newlyAddedSkus = [];
const failedAdds = [];
const missingDropdowns = [];

          let changed = 0;
          let skipped = 0;
          let updatedRows = 0;

          /*
           * One progress step for adding and one for updating.
           */
          const totalSteps =
            orderedSkus.length * 2;

          let completedSteps = 0;

          setProgress(
            0,
            totalSteps,
            "Adding child SKUs…"
          );

         /*
 * Phase 1:
 *
 * Use an existing relationship row when one is already present.
 * Otherwise add the child SKU and wait for its new row.
 */
for (const sku of orderedSkus) {
  if (cancelled) break;

  const existingRow = findRowBySku(sku);

  if (existingRow) {
    targetRows.set(sku, existingRow);
    existingSkus.push(sku);

    completedSteps++;

    setProgress(
      completedSteps,
      totalSteps,
      `Checking child SKUs… ` +
      `(${completedSteps}/${orderedSkus.length})`
    );

    continue;
  }

  const rowsBefore = getRows().length;

  addInput.focus();
  setInputValue(addInput, sku);
  addButton.click();

  const newRow = await waitForAddedRow(
    sku,
    rowsBefore
  );

  if (
    newRow &&
    getRows().length > rowsBefore
  ) {
    targetRows.set(sku, newRow);
    newlyAddedSkus.push(sku);
  } else {
    /*
     * Check once more in case the UI reported the SKU as
     * existing while the script was attempting to add it.
     */
    const rowAfterAttempt = findRowBySku(sku);

    if (rowAfterAttempt) {
      targetRows.set(sku, rowAfterAttempt);
      existingSkus.push(sku);
    } else {
      failedAdds.push(sku);
    }
  }

  completedSteps++;

  setProgress(
    completedSteps,
    totalSteps,
    `Adding child SKUs… ` +
    `(${completedSteps}/${orderedSkus.length})`
  );

  await sleep(20);
}

          /*
           * Phase 2: Apply the option data to each row
           * successfully added in phase 1.
           */
          for (const sku of orderedSkus) {
            if (cancelled) break;

            const row =
  targetRows.get(sku);

            /*
             * If the add failed, consume its update progress
             * step without modifying an existing row.
             */
            if (!row || !row.isConnected) {
              completedSteps++;

              setProgress(
                completedSteps,
                totalSteps,
                `Updating options… ` +
                `(${updatedRows}/${targetRows.size})`
              );

              continue;
            }

            const cells =
              dataBySku.get(sku) || [];

            const rowCells = [
              ...row.querySelectorAll(
                ":scope > td"
              )
            ];

            let pointer = 0;

            for (const spec of colSpecs) {
              const cell =
                rowCells[spec.colIdx];

              if (!cell) {
                pointer += spec.excelCols;
                continue;
              }

              /*
               * Combined value + unit column.
               */
              if (spec.excelCols === 2) {
                const value = (
                  cells[pointer] || ""
                ).trim();

                const unit = (
                  cells[pointer + 1] || ""
                ).trim();

                pointer += 2;

                if (value) {
                  const input =
                    cell.querySelector(
                      "input[type='text'], " +
                      "input:not([type])"
                    );

                  if (input) {
                    setInputValue(
                      input,
                      value
                    );

                    changed++;
                  } else {
                    skipped++;
                  }
                } else {
                  skipped++;
                }

                if (unit) {
                  const result =
                    await setDropdownInCell(
                      cell,
                      unit
                    );

                  if (!result.ok) {
                    missingDropdowns.push({
                      sku,
                      field: spec.name,
                      desired: unit
                    });
                  } else if (result.skipped) {
                    skipped++;
                  } else {
                    changed++;
                  }
                } else {
                  skipped++;
                }
              } else {
                /*
                 * Single Excel column.
                 */
                const desired = (
                  cells[pointer] || ""
                ).trim();

                pointer++;

                if (!desired) {
                  skipped++;
                  continue;
                }

                const input =
                  cell.querySelector(
                    "input[type='text'], " +
                    "input:not([type])"
                  );

                const hasDropdown =
                  !!cell.querySelector(
                    "button.dropdown-toggle" +
                    "[data-uib-dropdown-toggle], " +
                    ".dropdown-toggle"
                  );

                if (
                  input &&
                  !hasDropdown
                ) {
                  setInputValue(
                    input,
                    desired
                  );

                  changed++;
                } else if (hasDropdown) {
                  const result =
                    await setDropdownInCell(
                      cell,
                      desired
                    );

                  if (!result.ok) {
                    missingDropdowns.push({
                      sku,
                      field: spec.name,
                      desired
                    });
                  } else if (
                    result.skipped
                  ) {
                    skipped++;
                  } else {
                    changed++;
                  }
                } else if (input) {
                  setInputValue(
                    input,
                    desired
                  );

                  changed++;
                } else {
                  skipped++;
                }
              }

              await sleep(4);
            }

            updatedRows++;
            completedSteps++;

            setProgress(
              completedSteps,
              totalSteps,
              `Updating options… ` +
              `(${updatedRows}/${targetRows.size})`
            );
          }

          setProgress(
            totalSteps,
            totalSteps,
            "Checking validation errors…"
          );

          /*
           * Give Angular time to display validation errors.
           */
          let dupeSkus = [];

          for (
            let attempt = 0;
            attempt < 6;
            attempt++
          ) {
            await sleep(250);

            dupeSkus =
              collectErrorSkus();

            if (dupeSkus.length) {
              break;
            }
          }

          closeAnyOpenDropdowns();
          pasteModal.close();

          showReport({
  stats: {
    inputSkus: orderedSkus.length,
    added: newlyAddedSkus.length,
    updatedRows,
    changed,
    skipped
  },

  existingSkus,

  failedAdds,

  duplicateInputSkus,

  dupeSkus,

  missingDropdowns
});
        }
      );
    })();
  };

  CT.loaded.bulkAddAndUpdate = true;
})();
