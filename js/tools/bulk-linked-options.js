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
      const sleep = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));

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
        CT.state.bulkLinkedOptionsOpen = !!isOpen;
        CT.tools.refreshStatus?.();
      };

      const DUPLICATE_OPTION_CLASS =
        "__ct_linked_duplicate_option__";

      const DUPLICATE_STYLE_ID =
        "__ct_linked_duplicate_option_style__";

      const ensureDuplicateStyle = () => {
        if (
          document.getElementById(
            DUPLICATE_STYLE_ID
          )
        ) {
          return;
        }

        const style =
          document.createElement("style");

        style.id =
          DUPLICATE_STYLE_ID;

        style.textContent = `
          select.${DUPLICATE_OPTION_CLASS} {
            color: #b91c1c !important;
            border-color: #dc2626 !important;
            background-color: #fef2f2 !important;
            box-shadow:
              0 0 0 1px #dc2626 inset !important;
            font-weight: 700 !important;
          }
        `;

        document.head.appendChild(style);
      };

      const clearDuplicateHighlights = () => {
        document
          .querySelectorAll(
            `select.${DUPLICATE_OPTION_CLASS}`
          )
          .forEach((select) => {
            select.classList.remove(
              DUPLICATE_OPTION_CLASS
            );

            if (
              select.dataset
                .ctOriginalDuplicateTitle !==
              undefined
            ) {
              select.title =
                select.dataset
                  .ctOriginalDuplicateTitle;

              delete select.dataset
                .ctOriginalDuplicateTitle;
            }
          });
      };

      ensureDuplicateStyle();
      clearDuplicateHighlights();

      const ADD_INPUT_SELECTOR =
        "#linkedSkuGroupCreateForm > table > tbody > " +
        "tr:nth-child(16) > td > div > input";

      const ADD_BUTTON_SELECTOR =
        "#linkedSkuGroupCreateForm > table > tbody > " +
        "tr:nth-child(16) > td > div > button";

      const addInput =
        document.querySelector(
          ADD_INPUT_SELECTOR
        );

      const addButton =
        document.querySelector(
          ADD_BUTTON_SELECTOR
        );

      if (!addInput) {
        alert(
          "Couldn't find the linked SKU input field."
        );
        return;
      }

      if (!addButton) {
        alert(
          "Couldn't find the linked SKU add button."
        );
        return;
      }

      const getRows = () => [
        ...document.querySelectorAll(
          'tr[ng-repeat="entry in vm.group.productInfo"]'
        )
      ];

      if (!getRows().length) {
        alert(
          "Couldn't find any linked SKU rows " +
          '(tr[ng-repeat="entry in vm.group.productInfo"]).'
        );
        return;
      }

      const getSkuFromRow = (row) => {
        if (!row) return "";

        const cells =
          row.querySelectorAll(
            "td.ng-binding"
          );

        return cells.length >= 2
          ? cells[1].textContent.trim()
          : "";
      };

      const findRowBySku = (sku) =>
        getRows().find(
          (row) =>
            norm(getSkuFromRow(row)) ===
            norm(sku)
        ) || null;

      const setInputValue = (
        input,
        value
      ) => {
        const setter =
          Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          )?.set;

        if (setter) {
          setter.call(input, value);
        } else {
          input.value = value;
        }

        input.dispatchEvent(
          new Event("input", {
            bubbles: true
          })
        );

        input.dispatchEvent(
          new Event("change", {
            bubbles: true
          })
        );
      };

      const setSelectOption = (
        select,
        desiredText
      ) => {
        if (!desiredText) {
          return {
            ok: true,
            skipped: true
          };
        }

        const target =
          norm(desiredText);

        const match = [
          ...select.options
        ].find((option) =>
          norm(
            option.label ||
            option.textContent ||
            ""
          ) === target
        );

        if (!match) {
          return {
            ok: false,
            reason:
              `option not found: "${desiredText}"`
          };
        }

        if (
          select.value === match.value
        ) {
          return {
            ok: true,
            skipped: true
          };
        }

        select.value =
          match.value;

        select.dispatchEvent(
          new Event("input", {
            bubbles: true
          })
        );

        select.dispatchEvent(
          new Event("change", {
            bubbles: true
          })
        );

        return {
          ok: true,
          skipped: false
        };
      };

      const waitForSkuRow = async (
        sku,
        timeoutMs = 3000
      ) => {
        const deadline =
          Date.now() + timeoutMs;

        while (
          Date.now() < deadline
        ) {
          const row =
            findRowBySku(sku);

          if (row) {
            return row;
          }

          await sleep(30);
        }

        return null;
      };

      const collectErrorSkus = () => [
        ...new Set(
          [
            ...document.querySelectorAll(
              ".has-error select, " +
              ".has-error input.form-control"
            )
          ]
            .map((element) =>
              getSkuFromRow(
                element.closest("tr")
              )
            )
            .filter(Boolean)
        )
      ];

      const scanDuplicateOptions = () => {
        clearDuplicateHighlights();

        const optionGroups =
          new Map();

        for (const row of getRows()) {
          const sku =
            getSkuFromRow(row);

          const select =
            row.querySelector("select");

          if (!select) continue;

          const selectedOption =
            select.options[
              select.selectedIndex
            ];

          const optionText = (
            selectedOption?.label ||
            selectedOption?.textContent ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();

          /*
           * Ignore empty/default dropdown values.
           */
          if (
            !select.value ||
            !optionText
          ) {
            continue;
          }

          const key =
            norm(optionText);

          if (
            !optionGroups.has(key)
          ) {
            optionGroups.set(key, {
              optionText,
              occurrences: []
            });
          }

          optionGroups
            .get(key)
            .occurrences
            .push({
              sku,
              row,
              select
            });
        }

        const duplicateOptions = [
          ...optionGroups.values()
        ]
          .filter(
            (group) =>
              group.occurrences.length > 1
          )
          .sort((a, b) =>
            a.optionText.localeCompare(
              b.optionText,
              undefined,
              {
                sensitivity: "base"
              }
            )
          );

        for (
          const group of duplicateOptions
        ) {
          const affectedSkus =
            group.occurrences
              .map(
                (occurrence) =>
                  occurrence.sku ||
                  "Unknown SKU"
              )
              .join(", ");

          for (
            const occurrence
            of group.occurrences
          ) {
            const { select } =
              occurrence;

            select.classList.add(
              DUPLICATE_OPTION_CLASS
            );

            if (
              select.dataset
                .ctOriginalDuplicateTitle ===
              undefined
            ) {
              select.dataset
                .ctOriginalDuplicateTitle =
                select.title || "";
            }

            select.title =
              `Duplicate option: ${group.optionText}\n` +
              `SKUs: ${affectedSkus}`;
          }
        }

        return duplicateOptions;
      };

      const parseInput = (pasted) => {
        const optionBySku =
          new Map();

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
            let parts =
              line.split("\t");

            if (parts.length < 2) {
              parts =
                line.split(/\s{2,}/);
            }

            const sku =
              (parts[0] || "").trim();

            const optionText =
              parts
                .slice(1)
                .join(" ")
                .trim();

            if (
              !sku ||
              !optionText
            ) {
              return;
            }

            if (
              optionBySku.has(sku)
            ) {
              duplicateInputSkus.push(
                sku
              );
            } else {
              orderedSkus.push(sku);
            }

            optionBySku.set(
              sku,
              optionText
            );
          });

        return {
          optionBySku,
          orderedSkus,
          duplicateInputSkus: [
            ...new Set(
              duplicateInputSkus
            )
          ]
        };
      };

      setToolOpen(true);

      let cancelled = false;

      const pasteModal = makeModal({
        title:
          "Bulk linked SKUs + options — paste Excel TSV",

        width: "880px",

        onClose: () =>
          setToolOpen(false),

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
              Paste tab-separated values copied
              from Excel.

              <br><br>

              The first column must be
              <b>SKU</b>. The second column is
              the <b>Option</b> text.

              <br><br>

              Existing SKUs will have their
              options updated. Missing SKUs will
              be added first and then updated.

              <code style="
                display:block;
                margin-top:8px;
                padding:8px;
                border:1px solid #eee;
                border-radius:10px;
                background:#fafafa;
                white-space:pre-wrap;
              ">SKU | Option</code>
            </div>

            <textarea
              data-ta
              placeholder="16620552&#9;Black&#10;16620553&#9;Deep Navy&#10;16620554&#9;Amber Gold"
              style="
                width:100%;
                min-height:280px;
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
                box-sizing:border-box;
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

      pasteModal
        .qs("[data-cancel]")
        .addEventListener(
          "click",
          () => {
            cancelled = true;
            pasteModal.close();
          }
        );

      const setProgress = (
        done,
        total,
        message
      ) => {
        const progress =
          total
            ? Math.round(
                (done / total) * 100
              )
            : 0;

        progressBar.style.width =
          `${progress}%`;

        percentage.textContent =
          `${progress}%`;

        if (message) {
          status.textContent = message;
        }
      };

      const showReport = ({
        stats,
        existingSkus,
        newlyAddedSkus,
        failedAdds,
        duplicateInputSkus,
        missingOptions,
        duplicateOptions,
        dupeSkus
      }) => {
        const section = (
          title,
          items,
          emptyText,
          tone,
          formatItem
        ) => {
          const tones = {
            neutral: {
              color: "#374151",
              background: "#f9fafb",
              border: "#e5e7eb"
            },

            success: {
              color: "#166534",
              background: "#f0fdf4",
              border: "#bbf7d0"
            },

            warning: {
              color: "#9a3412",
              background: "#fff7ed",
              border: "#ffedd5"
            },

            error: {
              color: "#991b1b",
              background: "#fef2f2",
              border: "#fee2e2"
            }
          };

          const selectedTone =
            tones[tone] ||
            tones.neutral;

          const text =
            items.length
              ? items
                  .map(formatItem)
                  .join("\n")
              : emptyText;

          return `
            <div style="
              padding:10px;
              border:1px solid ${selectedTone.border};
              background:${selectedTone.background};
              border-radius:12px;
            ">
              <div style="
                font-weight:800;
                color:${selectedTone.color};
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
                ${esc(text)}
              </div>
            </div>
          `;
        };

        const missingOptionLines =
          missingOptions.map(
            (item) =>
              `SKU ${item.sku} — ` +
              `wanted: "${item.desired}"`
          );

        const duplicateOptionLines =
          duplicateOptions.map(
            (group) =>
              `${group.optionText} — ` +
              group.occurrences
                .map(
                  (occurrence) =>
                    `SKU ${occurrence.sku}`
                )
                .join(", ")
          );

        const summaryText = [
          "Run summary",
          `Input SKUs: ${stats.inputSkus}`,
          `Already in group: ${existingSkus.length}`,
          `Newly added: ${newlyAddedSkus.length}`,
          `Failed additions: ${failedAdds.length}`,
          `Rows updated: ${stats.updatedRows}`,
          `Options changed: ${stats.changed}`,
          `Already correct / skipped: ${stats.skipped}`,
          `Option not found: ${missingOptions.length}`,
          `Duplicate option groups: ${duplicateOptions.length}`,
          `Validation-error SKUs: ${dupeSkus.length}`
        ].join("\n");

        const allText = [
          summaryText,
          "",
          "Already in group:",
          ...(
            existingSkus.length
              ? existingSkus
              : ["(none)"]
          ),
          "",
          "Newly added:",
          ...(
            newlyAddedSkus.length
              ? newlyAddedSkus
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
          "Missing option text:",
          ...(
            missingOptionLines.length
              ? missingOptionLines
              : ["(none)"]
          ),
          "",
          "Duplicate option selections:",
          ...(
            duplicateOptionLines.length
              ? duplicateOptionLines
              : ["(none)"]
          ),
          "",
          "Validation-error SKUs:",
          ...(
            dupeSkus.length
              ? dupeSkus
              : ["(none)"]
          )
        ].join("\n");

        setToolOpen(true);

        const reportModal = makeModal({
          title:
            "Bulk linked SKUs + options — report",

          width: "900px",

          onClose: () =>
            setToolOpen(false),

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
                "Already in group — options updated",
                existingSkus,
                "None.",
                "neutral",
                (sku) => `SKU ${sku}`
              )}

              ${section(
                "Newly added — options updated",
                newlyAddedSkus,
                "None.",
                "success",
                (sku) => `SKU ${sku}`
              )}

              ${section(
                "Failed additions",
                failedAdds,
                "None.",
                failedAdds.length
                  ? "error"
                  : "neutral",
                (sku) => `SKU ${sku}`
              )}

              ${section(
                "Duplicate SKUs in pasted input (last row used)",
                duplicateInputSkus,
                "None.",
                duplicateInputSkus.length
                  ? "warning"
                  : "neutral",
                (sku) => `SKU ${sku}`
              )}

              ${section(
                "Missing option text (not found in dropdown)",
                missingOptions,
                "None.",
                missingOptions.length
                  ? "warning"
                  : "neutral",
                (item) =>
                  `SKU ${item.sku} — ` +
                  `wanted: "${item.desired}"`
              )}

              ${section(
                "Duplicate option selections — highlighted red",
                duplicateOptions,
                "None.",
                duplicateOptions.length
                  ? "error"
                  : "neutral",
                (group) =>
                  `${group.optionText} — ` +
                  group.occurrences
                    .map(
                      (occurrence) =>
                        `SKU ${occurrence.sku}`
                    )
                    .join(", ")
              )}

              ${section(
                "Validation errors (.has-error)",
                dupeSkus,
                "None.",
                dupeSkus.length
                  ? "error"
                  : "neutral",
                (sku) => `SKU ${sku}`
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
              Clear duplicate highlights
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
          .qs("[data-clear]")
          .addEventListener(
            "click",
            () => {
              clearDuplicateHighlights();

              reportModal
                .qs("[data-clear]")
                .textContent =
                  "Highlights cleared";
            }
          );

        reportModal
          .qs("[data-copy]")
          .addEventListener(
            "click",
            async () => {
              try {
                await navigator.clipboard.writeText(
                  allText
                );
              } catch {
                const output =
                  reportModal.qs(
                    "[data-out]"
                  );

                output.value =
                  allText;

                output.select();

                document.execCommand(
                  "copy"
                );
              }

              const button =
                reportModal.qs(
                  "[data-copy]"
                );

              button.textContent =
                "Copied!";

              setTimeout(() => {
                if (button) {
                  button.textContent =
                    "Copy report";
                }
              }, 1200);
            }
          );

        if (
          failedAdds.length ||
          missingOptions.length ||
          duplicateOptions.length
        ) {
          const issues = [];

          if (failedAdds.length) {
            issues.push(
              `${failedAdds.length} SKU(s) ` +
              `could not be added`
            );
          }

          if (missingOptions.length) {
            issues.push(
              `${missingOptions.length} option(s) ` +
              `were not found`
            );
          }

          if (duplicateOptions.length) {
            issues.push(
              `${duplicateOptions.length} duplicate ` +
              `option group(s) were found`
            );
          }

          alert(
            "Bulk linked SKUs finished with issues:\n\n" +
            issues.join("\n") +
            "\n\nSee the report for details."
          );
        }
      };

      startButton.addEventListener(
        "click",
        async () => {
          errorBox.style.display =
            "none";

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
            optionBySku,
            orderedSkus,
            duplicateInputSkus
          } = parseInput(pasted);

          if (!orderedSkus.length) {
            errorBox.textContent =
              "No valid SKU and Option rows were found.";

            errorBox.style.display =
              "block";

            return;
          }

          startButton.disabled =
            true;

          startButton.style.opacity =
            "0.7";

          startButton.style.cursor =
            "not-allowed";

          const targetRows =
            new Map();

          const existingSkus = [];
          const newlyAddedSkus = [];
          const failedAdds = [];
          const missingOptions = [];

          let changed = 0;
          let skipped = 0;
          let updatedRows = 0;

          const totalSteps =
            orderedSkus.length * 2;

          let completedSteps = 0;

          setProgress(
            0,
            totalSteps,
            "Checking and adding linked SKUs…"
          );

          /*
           * Phase 1:
           * Find existing rows or add missing SKUs.
           */
          for (const sku of orderedSkus) {
            if (cancelled) break;

            const existingRow =
              findRowBySku(sku);

            if (existingRow) {
              targetRows.set(
                sku,
                existingRow
              );

              existingSkus.push(
                sku
              );
            } else {
              addInput.focus();

              setInputValue(
                addInput,
                sku
              );

              addButton.click();

              const addedRow =
                await waitForSkuRow(
                  sku
                );

              if (addedRow) {
                targetRows.set(
                  sku,
                  addedRow
                );

                newlyAddedSkus.push(
                  sku
                );
              } else {
                const lateRow =
                  findRowBySku(sku);

                if (lateRow) {
                  targetRows.set(
                    sku,
                    lateRow
                  );

                  newlyAddedSkus.push(
                    sku
                  );
                } else {
                  failedAdds.push(
                    sku
                  );
                }
              }

              await sleep(30);
            }

            completedSteps++;

            setProgress(
              completedSteps,
              totalSteps,
              `Checking and adding linked SKUs… ` +
              `(${completedSteps}/${orderedSkus.length})`
            );
          }

          /*
           * Phase 2:
           * Update options for existing and added rows.
           */
          for (const sku of orderedSkus) {
            if (cancelled) break;

            let row =
              targetRows.get(sku);

            if (
              !row ||
              !row.isConnected
            ) {
              row =
                findRowBySku(sku);

              if (row) {
                targetRows.set(
                  sku,
                  row
                );
              }
            }

            if (!row) {
              completedSteps++;

              setProgress(
                completedSteps,
                totalSteps,
                `Updating linked options… ` +
                `(${updatedRows}/${targetRows.size})`
              );

              continue;
            }

            const desired =
              optionBySku.get(sku);

            const select =
              row.querySelector("select");

            if (!select) {
              missingOptions.push({
                sku,
                desired
              });
            } else {
              const result =
                setSelectOption(
                  select,
                  desired
                );

              if (!result.ok) {
                missingOptions.push({
                  sku,
                  desired
                });
              } else if (
                result.skipped
              ) {
                skipped++;
              } else {
                changed++;
              }
            }

            updatedRows++;
            completedSteps++;

            setProgress(
              completedSteps,
              totalSteps,
              `Updating linked options… ` +
              `(${updatedRows}/${targetRows.size})`
            );

            await sleep(4);
          }

          setProgress(
            totalSteps,
            totalSteps,
            "Checking validation errors and duplicate options…"
          );

          let dupeSkus = [];

          for (
            let attempt = 0;
            attempt < 5;
            attempt++
          ) {
            await sleep(180);

            dupeSkus =
              collectErrorSkus();

            if (dupeSkus.length) {
              break;
            }
          }

          /*
           * Allow Angular to finish rendering the
           * selected values before scanning.
           */
          await sleep(150);

          const duplicateOptions =
            scanDuplicateOptions();

          pasteModal.close();

          showReport({
            stats: {
              inputSkus:
                orderedSkus.length,

              updatedRows,

              changed,

              skipped
            },

            existingSkus,

            newlyAddedSkus,

            failedAdds,

            duplicateInputSkus,

            missingOptions,

            duplicateOptions,

            dupeSkus
          });
        }
      );
    })();
  };

  CT.loaded.bulkLinkedOptions = true;
})();
