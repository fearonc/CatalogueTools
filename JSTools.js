(() => {
	// 1. Prevent duplicate injections and handle cleanup
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

	// ==========================================
	// TOOL 1: BULK UPDATE TSV
	// ==========================================
	function runBulkUpdateTool() {
		(async () => {
			const sleep = ms => new Promise(r => setTimeout(r, ms));
			const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
			const esc = s =>
				(s || "").replace(/[&<>"']/g, m => ({
					"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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
				wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
				wrap.querySelector("[data-x]").addEventListener("click", close);
				return { wrap, close, qs: sel => wrap.querySelector(sel) };
			};

			const ROOT = document.querySelector("#complexForm") || document;
			const TABLE = ROOT.querySelector("table.data-table");
			if (!TABLE) { alert("Couldn't find table.data-table"); return; }

			const headers = [...TABLE.querySelectorAll("thead th")].map(th => th.textContent.trim());
			const skuIdx = headers.findIndex(h => norm(h) === "sku");
			if (skuIdx < 0) { alert("Couldn't find SKU header"); return; }

			const rrpIdx = headers.findIndex(h => norm(h) === "rrp");
			const firstVarIdx = rrpIdx >= 0 ? rrpIdx + 1 : skuIdx + 1;
			const varHeaders = headers.slice(firstVarIdx);
			if (!varHeaders.length) { alert("No variation headers detected"); return; }

			const rows = [...TABLE.querySelectorAll("tbody tr[data-ng-repeat]")];
			if (!rows.length) { alert("No data rows found"); return; }

			const firstRowTds = [...rows[0].querySelectorAll(":scope > td")];
			const colSpecs = varHeaders.map((name, i) => {
				const colIdx = firstVarIdx + i;
				const cell = firstRowTds[colIdx];
				const hasInput = !!cell?.querySelector("input[type='text'], input:not([type])");
				const hasDropdown = !!cell?.querySelector("button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle");
				const excelCols = hasInput && hasDropdown ? 2 : 1;
				return { name, colIdx, excelCols };
			});

			const getSkuFromRow = tr => {
				const a = tr.querySelector("td:first-child a");
				const txt = a ? a.textContent : tr.querySelector("td:first-child")?.textContent;
				return (txt || "").trim();
			};

			const setInputValue = (input, value) => {
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
				setter ? setter.call(input, value) : (input.value = value);
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new Event("change", { bubbles: true }));
			};

			const closeAnyOpenDropdowns = () => {
				document.querySelectorAll(".uib-dropdown.open, .dropdown.open, .open .dropdown-menu").forEach(el => el.classList.remove("open"));
				document.querySelectorAll("[aria-expanded='true']").forEach(btn => { try { btn.setAttribute("aria-expanded", "false"); } catch {} });
				try { document.body.click(); } catch {}
				try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch {}
			};

			const setDropdownInCell = async (cell, desiredText) => {
				if (!desiredText) return { ok: true, skipped: true };
				const btn = cell.querySelector("button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle");
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
				if (c.excelCols === 2) { expectedCols.push(`${c.name} (value)`, `${c.name} (unit)`); } 
				else { expectedCols.push(c.name); }
			}

			const pasteModal = makeModal({
				title: "Bulk update — paste Excel TSV",
				width: "980px",
				bodyHTML: `
					<div style="display:flex;flex-direction:column;gap:10px;">
						<div style="color:#374151;font-size:13px;line-height:1.35;">
							Paste tab-separated values (TSV) copied from Excel. First column must be <b>SKU</b>. Expected columns (in order):<br>
							<code style="display:block;margin-top:6px;padding:8px;border:1px solid #eee;border-radius:10px;background:#fafafa;white-space:pre-wrap;">${esc(expectedCols.join(" | "))}</code>
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
			pasteModal.qs("[data-cancel]").addEventListener("click", () => { cancelled = true; pasteModal.close(); });

			const ta = pasteModal.qs("[data-ta]");
			const errBox = pasteModal.qs("[data-err]");
			const bar = pasteModal.qs("[data-bar]");
			const pct = pasteModal.qs("[data-pct]");
			const status = pasteModal.qs("[data-status]");

			const setProgress = (done, total, msg) => {
				const p = total ? Math.round((done / total) * 100) : 0;
				bar.style.width = p + "%"; pct.textContent = p + "%";
				if (msg) status.textContent = msg;
			};

			const collectErrorSkus = () => {
				const errInputs = [...document.querySelectorAll(".has-error input.form-control")];
				return [...new Set(errInputs.map(i => { const tr = i.closest("tr"); return getSkuFromRow(tr) || ""; }).filter(Boolean))];
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

				const summaryText = `Run summary\nRows in table: ${stats.rows}\nRows with mapping: ${stats.mappedRows}\nChanged ops: ${stats.changed}\nSkipped blanks: ${stats.skipped}\nDropdown misses: ${missingDropdowns.length}\nValidation-error SKUs: ${dupeSkus.length}`;
				const allText = [
					summaryText, "", "Validation error SKUs:", "", ...(dupeSkus.length ? dupeSkus : ["(none)"]), "",
					"Missing dropdown options:", "", ...(missingDropdowns.length ? missingDropdowns.map(m => `SKU ${m.sku} — ${m.field}: ${m.desired}`) : ["(none)"])
				].join("\n");

				const m = makeModal({
					title: "Bulk update — report", width: "980px",
					bodyHTML: `
						<div style="display:flex;flex-direction:column;gap:10px;">
							<div style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;">
								<div style="font-weight:900;color:#111827;">Summary</div>
								<div style="margin-top:6px;color:#374151;font-size:13px;line-height:1.4;white-space:pre-wrap;">${esc(summaryText)}</div>
							</div>
							${dupeHTML} ${missHTML}
							<textarea data-out style="position:absolute;left:-9999px;top:-9999px;">${esc(allText)}</textarea>
						</div>`,
					footerHTML: `
						<button data-copy style="border:0;background:#111827;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Copy report</button>
						<button data-close style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Close</button>`
				});

				m.qs("[data-close]").addEventListener("click", m.close);
				m.qs("[data-copy]").addEventListener("click", async () => {
					try { await navigator.clipboard.writeText(allText); } 
					catch { const t = m.qs("[data-out]"); t.value = allText; t.select(); document.execCommand("copy"); }
					m.qs("[data-copy]").textContent = "Copied!";
					setTimeout(() => { const b = m.qs("[data-copy]"); if (b) b.textContent = "Copy report"; }, 1200);
				});
			};

			pasteModal.qs("[data-start]").addEventListener("click", async () => {
				errBox.style.display = "none";
				const pasted = ta.value || "";
				if (!pasted.trim()) { errBox.textContent = "Paste something first."; errBox.style.display = "block"; return; }

				pasteModal.qs("[data-start]").disabled = true;
				pasteModal.qs("[data-start]").style.opacity = 0.7;
				pasteModal.qs("[data-start]").style.cursor = "not-allowed";

				const map = new Map();
				pasted.split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim()).forEach(line => {
					const parts = line.split("\t");
					const sku = (parts[0] || "").trim();
					if (!sku) return;
					map.set(sku, parts.slice(1).map(x => (x ?? "").trim()));
				});

				const missingDropdowns = [];
				let changed = 0, skipped = 0, notInMap = 0, mappedRows = 0;
				const totalRows = rows.length;
				let doneRows = 0;

				setProgress(0, totalRows, "Running…");

				for (const tr of rows) {
					if (cancelled) break;
					const sku = getSkuFromRow(tr);
					if (!sku) { doneRows++; setProgress(doneRows, totalRows, `Scanning… (${doneRows}/${totalRows})`); continue; }

					const cells = map.get(sku);
					if (!cells) { notInMap++; doneRows++; setProgress(doneRows, totalRows, `Running… (${doneRows}/${totalRows})`); continue; }

					mappedRows++;
					const tds = [...tr.querySelectorAll(":scope > td")];
					let p = 0;

					for (const spec of colSpecs) {
						const cell = tds[spec.colIdx];
						if (!cell) { p += spec.excelCols; continue; }

						if (spec.excelCols === 2) {
							const value = (cells[p] || "").trim(); const unit = (cells[p + 1] || "").trim(); p += 2;
							if (value) {
								const input = cell.querySelector("input[type='text'], input:not([type])");
								if (input) { setInputValue(input, value); changed++; } else skipped++;
							} else skipped++;

							if (unit) {
								const r = await setDropdownInCell(cell, unit);
								if (!r.ok) missingDropdowns.push({ sku, field: spec.name, desired: unit });
								else if (!r.skipped) changed++; else skipped++;
							} else skipped++;
						} else {
							const desired = (cells[p] || "").trim(); p += 1;
							if (!desired) { skipped++; continue; }
							const input = cell.querySelector("input[type='text'], input:not([type])");
							const hasDropdown = !!cell.querySelector("button.dropdown-toggle[data-uib-dropdown-toggle], .dropdown-toggle");
							if (input && !hasDropdown) { setInputValue(input, desired); changed++; } 
							else if (hasDropdown) {
								const r = await setDropdownInCell(cell, desired);
								if (!r.ok) missingDropdowns.push({ sku, field: spec.name, desired });
								else if (!r.skipped) changed++; else skipped++;
							} 
							else if (input) { setInputValue(input, desired); changed++; } 
							else skipped++;
						}
						await sleep(4);
					}
					doneRows++;
					if (doneRows % 2 === 0) setProgress(doneRows, totalRows, `Running… (${doneRows}/${totalRows})`);
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
				showReport({ stats: { rows: totalRows, mappedRows, changed, skipped, notInMap }, dupeSkus, missingDropdowns });
			});
		})();
	}

	// ==========================================
	// TOOL 2: IMAGE REORDER (ANGULAR/UI-BOOTSTRAP)
	// ==========================================
	async function runImageReorderTool() {
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
		const TEMP_SLOT = 999; const OPEN_TIMEOUT_MS = 7000; const CLOSE_TIMEOUT_MS = 15000; const STEP_GAP_MS = 60;

		if (window.__thgReorderToolOpen) return;
		window.__thgReorderToolOpen = true;
		refreshStatus();

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
		}

		function setModalValueViaAngularScope(value) {
			const input = document.querySelector(MODAL_INPUT_SELECTOR);
			if (!input) throw new Error('Modal input not found');
			const ng = window.angular;
			if (!ng?.element) throw new Error('Angular not available on window');
			const el = ng.element(input);
			const scope = el.scope?.();
			if (!scope) throw new Error('Could not get Angular scope for modal input');
			scope.$apply(() => { scope.value = String(value); });
		}

		function getHeadingText(panel) {
			const heading = panel.querySelector(HEADING_SELECTOR);
			if (!heading) return 'Images';
			const parts = Array.from(heading.querySelectorAll('span')).filter(sp => {
				const cs = window.getComputedStyle(sp);
				return cs.display !== 'none' && cs.visibility !== 'hidden';
			}).map(sp => sp.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
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

		const overlay = document.createElement('div');
		overlay.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;`;
		const ui = document.createElement('div');
		ui.style.cssText = `width:min(980px,94vw); height:min(820px,90vh); background:#fff; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden;`;
		const header = document.createElement('div');
		header.style.cssText = `padding:14px 16px; border-bottom:1px solid #e6e6e6; display:flex; justify-content:space-between; gap:10px; align-items:center;`;
		header.innerHTML = `
			<div>
				<div style="font-size:16px; font-weight:650;">Reorder images (by section)</div>
				<div style="font-size:12px; color:#666;">Each Channel/Locale table is handled independently. Temp slot: ${TEMP_SLOT}.</div>
			</div>
			<div style="display:flex; gap:8px;">
				<button data-a="close" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Close</button>
				<button data-a="apply" style="padding:8px 10px; border:1px solid #111; background:#111; color:#fff; border-radius:8px; cursor:pointer;">Apply</button>
			</div>`;
		const body = document.createElement('div');
		body.style.cssText = `padding:12px; overflow:auto; flex:1;`;
		const status = document.createElement('div');
		status.style.cssText = `font-size:12px; color:#444; margin:0 0 10px 0; line-height:1.4; white-space:pre-wrap;`;
		
		body.append(status); ui.append(header, body); overlay.append(ui); document.body.appendChild(overlay);

		const setStatus = (t) => (status.textContent = t);

		function close() {
			window.__thgReorderToolOpen = false;
			document.removeEventListener('keydown', onKeyDown, true);
			overlay.remove(); refreshStatus();
		}

		function onKeyDown(e) { if (e.key === 'Escape') close(); }
		document.addEventListener('keydown', onKeyDown, true);
		header.querySelector('[data-a="close"]').addEventListener('click', close);

		const panels = Array.from(document.querySelectorAll(PANEL_SELECTOR)).filter(p => p.querySelector(TABLE_BODY_SELECTOR) && getPanelRows(p).length);
		if (!panels.length) { close(); alert('No image tables found on this page.'); return; }

		const sections = panels.map((panel, idx) => {
			const title = getHeadingText(panel) || `Section ${idx + 1}`;
			const initial = readPanelState(panel);
			const wrap = document.createElement('div');
			wrap.style.cssText = `border:1px solid #e6e6e6; border-radius:12px; padding:10px; margin:10px 0;`;
			const h = document.createElement('div');
			h.style.cssText = `font-size:13px; font-weight:650; margin:0 0 8px 0;`;
			h.textContent = `${title} (${initial.length})`;
			const list = document.createElement('div');
			list.style.cssText = `display:flex; flex-direction:column; gap:8px;`;
			wrap.append(h, list); body.append(wrap);
			return { panel, title, list, initial };
		});

		setStatus(`Detected ${sections.length} section(s):\n${sections.map(s => `• ${s.title} (${s.initial.length})`).join('\n')}\n\nDrag within a section only. Apply will reorder each section independently.`);

		let dragEl = null;
		function makeCard(item) {
			const card = document.createElement('div');
			card.draggable = true; card.dataset.src = item.src;
			card.style.cssText = `display:flex; align-items:center; gap:10px; border:1px solid #ddd; border-radius:10px; padding:10px; background:#fff; cursor:grab;`;
			const img = document.createElement('img');
			img.src = item.src; img.style.cssText = `width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid #eee; background:#fafafa;`;
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
			card.addEventListener('dragstart', (e) => { dragEl = card; card.style.opacity = '0.55'; e.dataTransfer.effectAllowed = 'move'; });
			card.addEventListener('dragend', () => { dragEl = null; card.style.opacity = '1'; });
			return card;
		}

		function wireDnD(listEl, onChange) {
			listEl.addEventListener('dragover', (e) => e.preventDefault());
			listEl.addEventListener('drop', (e) => e.preventDefault());
			Array.from(listEl.children).forEach(card => {
				card.addEventListener('dragover', (e) => { e.preventDefault(); card.style.borderColor = '#111'; });
				card.addEventListener('dragleave', () => { card.style.borderColor = '#ddd'; });
				card.addEventListener('drop', (e) => {
					e.preventDefault(); card.style.borderColor = '#ddd';
					if (!dragEl || dragEl === card) return;
					if (dragEl.parentElement !== listEl) return;
					const kids = Array.from(listEl.children);
					const from = kids.indexOf(dragEl); const to = kids.indexOf(card);
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

		for (const s of sections) {
			s.initial.forEach(it => s.list.appendChild(makeCard(it)));
			updateNewLabels(s.list);
			wireDnD(s.list, () => updateNewLabels(s.list));
		}

		async function applySection(section, sectionIndex, totalSections) {
			const { panel, title, list } = section;
			const desired = Array.from(list.children).map((c, i) => ({ src: c.dataset.src, want: i + 1 }));
			let state = readPanelState(panel);
			const srcToOrder = new Map(state.map(x => [x.src, x.order]));
			const orderToSrc = new Map(state.map(x => [x.order, x.src]));

			if (orderToSrc.has(TEMP_SLOT)) {
				const srcAtTemp = orderToSrc.get(TEMP_SLOT);
				const maxOrder = Math.max(...state.map(x => x.order));
				const bump = maxOrder + 1;
				setStatus(`(${sectionIndex}/${totalSections}) ${title}\nTemp slot ${TEMP_SLOT} is in use. Moving that image to ${bump}...`);
				await setOrderForSrcInPanel(panel, srcAtTemp, bump);
				srcToOrder.set(srcAtTemp, bump); orderToSrc.delete(TEMP_SLOT); orderToSrc.set(bump, srcAtTemp);
			}

			for (let i = 0; i < desired.length; i++) {
				const { src, want } = desired[i];
				const have = srcToOrder.get(src);
				if (have === want) continue;
				setStatus(`(${sectionIndex}/${totalSections}) ${title}\nStep ${i + 1}/${desired.length}: place into ${want} (currently ${have})...`);
				const srcInWant = orderToSrc.get(want);
				if (srcInWant && srcInWant !== src) {
					await setOrderForSrcInPanel(panel, srcInWant, TEMP_SLOT);
					srcToOrder.set(srcInWant, TEMP_SLOT); orderToSrc.set(TEMP_SLOT, srcInWant); orderToSrc.delete(want);
				}
				await setOrderForSrcInPanel(panel, src, want);
				srcToOrder.set(src, want); orderToSrc.set(want, src); orderToSrc.delete(have);
				if (srcInWant && srcInWant !== src) {
					await setOrderForSrcInPanel(panel, srcInWant, have);
					srcToOrder.set(srcInWant, have); orderToSrc.set(have, srcInWant); orderToSrc.delete(TEMP_SLOT);
				}
			}
		}

		async function applyAll() {
			const applyBtn = header.querySelector('[data-a="apply"]');
			applyBtn.disabled = true; applyBtn.textContent = 'Applying…';
			try {
				for (let i = 0; i < sections.length; i++) { await applySection(sections[i], i + 1, sections.length); }
				setStatus(`Done.\nIf the table numbers don’t refresh immediately, refresh the page to confirm.`);
				applyBtn.textContent = 'Done';
			} catch (err) {
				console.error(err); alert(`Apply failed: ${err.message}`);
				applyBtn.textContent = 'Apply'; applyBtn.disabled = false;
				setStatus('Apply failed — check console for details.');
			}
		}

		header.querySelector('[data-a="apply"]').addEventListener('click', applyAll);
	}

	// ==========================================
	// TOOL 3: GOD MODE (Nuke Sticky/Fixed Elements)
	// ==========================================
	function runGodMode() {
		document.querySelectorAll('*').forEach(el => {
			if (el.id === PALETTE_ID || el.closest(`#${PALETTE_ID}`)) return;
			const p = window.getComputedStyle(el).position;
			if (p === 'fixed' || p === 'sticky') el.remove();
		});
		document.body.style.setProperty('overflow', 'auto', 'important');
		document.documentElement.style.setProperty('overflow', 'auto', 'important');
		
		const btn = document.querySelector('[data-s="godmode"]');
		if(btn) {
			const original = btn.textContent;
			btn.textContent = "DONE!";
			setTimeout(() => btn.textContent = original, 1000);
		}
	}

	// ==========================================
	// TOOL 4: ELEMENT PATH INSPECTOR
	// ==========================================
	let inspectorActive = false;
	const overlayDiv = document.createElement('div');
	const tooltipDiv = document.createElement('div');
	
	overlayDiv.id = "__tool_inspector_overlay__";
	tooltipDiv.id = "__tool_inspector_tooltip__";
	Object.assign(overlayDiv.style, {
		position: 'fixed', zIndex: '2147483645', pointerEvents: 'none', display: 'none',
		background: 'rgba(59, 130, 246, 0.2)', border: '2px solid #3b82f6', boxSizing: 'border-box', transition: 'all 0.05s linear'
	});
	Object.assign(tooltipDiv.style, {
		position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', display: 'none',
		background: '#111827', color: '#fff', padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace',
		borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', whiteSpace: 'nowrap'
	});
	document.documentElement.appendChild(overlayDiv);
	document.documentElement.appendChild(tooltipDiv);

	function getCssPath(el) {
		if (!(el instanceof Element)) return;
		const path = [];
		while (el.nodeType === Node.ELEMENT_NODE) {
			let selector = el.nodeName.toLowerCase();
			if (el.id) {
				selector += '#' + el.id; path.unshift(selector); break;
			} else {
				let sib = el, nth = 1;
				while (sib = sib.previousElementSibling) { if (sib.nodeName.toLowerCase() == selector) nth++; }
				if (nth != 1) selector += `:nth-of-type(${nth})`;
			}
			path.unshift(selector);
			el = el.parentNode;
		}
		return path.join(" > ");
	}

	function onInspectorHover(e) {
		if (e.target.closest(`#${PALETTE_ID}`)) {
			overlayDiv.style.display = 'none'; tooltipDiv.style.display = 'none'; return;
		}
		const rect = e.target.getBoundingClientRect();
		overlayDiv.style.display = 'block';
		overlayDiv.style.top = rect.top + 'px'; overlayDiv.style.left = rect.left + 'px';
		overlayDiv.style.width = rect.width + 'px'; overlayDiv.style.height = rect.height + 'px';

		const path = getCssPath(e.target);
		tooltipDiv.style.display = 'block'; tooltipDiv.textContent = path;
		let tTop = rect.bottom + 5, tLeft = rect.left;
		if (tTop + 30 > window.innerHeight) tTop = rect.top - 30;
		tooltipDiv.style.top = tTop + 'px'; tooltipDiv.style.left = tLeft + 'px';
	}

	function onInspectorClick(e) {
		if (e.target.closest(`#${PALETTE_ID}`)) return;
		e.preventDefault(); e.stopPropagation();
		navigator.clipboard.writeText(getCssPath(e.target)).catch(() => {});
		tooltipDiv.textContent = "Copied to clipboard!";
		tooltipDiv.style.background = "#059669";
		setTimeout(() => {
			tooltipDiv.style.background = "#111827";
			toggleInspector(); refreshStatus();
		}, 800);
	}

	function toggleInspector() {
		inspectorActive = !inspectorActive;
		if (inspectorActive) {
			document.addEventListener('mouseover', onInspectorHover, { capture: true });
			document.addEventListener('click', onInspectorClick, { capture: true });
		} else {
			document.removeEventListener('mouseover', onInspectorHover, { capture: true });
			document.removeEventListener('click', onInspectorClick, { capture: true });
			overlayDiv.style.display = 'none'; tooltipDiv.style.display = 'none';
		}
	}

	// ==========================================
	// TOOL 5: PASSWORD REVEALER
	// ==========================================
	function togglePasswords() {
		const inputs = Array.from(document.querySelectorAll('input'));
		const revealed = inputs.filter(i => i.dataset.tpRevealed === 'true');
		if (revealed.length > 0) {
			revealed.forEach(i => { i.type = 'password'; delete i.dataset.tpRevealed; });
		} else {
			inputs.filter(i => i.type === 'password').forEach(i => { i.type = 'text'; i.dataset.tpRevealed = 'true'; });
		}
	}

	// ==========================================
	// UI GENERATION & LOGIC
	// ==========================================
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
		#${PALETTE_ID} {
			position: fixed; right: 14px; bottom: 14px; width: 320px; z-index: 2147483647;
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		}
		#${PALETTE_ID} * { box-sizing: border-box; }
		#${PALETTE_ID} .tp-box {
			width: 100%; background: rgba(15,17,23,.96); color: #e8ecf3;
			border: 1px solid rgba(255,255,255,.12); border-radius: 14px;
			box-shadow: 0 20px 60px rgba(0,0,0,.45); overflow: hidden; backdrop-filter: blur(8px);
		}
		#${PALETTE_ID} .tp-head {
			display: flex; justify-content: space-between; align-items: flex-start;
			padding: 12px 12px 10px; border-bottom: 1px solid rgba(255,255,255,.08);
			font-size: 12px; letter-spacing: .03em; color: #aab4c3; cursor: move; user-select: none;
		}
		#${PALETTE_ID} .tp-title { font-size: 14px; color: #fff; margin-bottom: 3px; }
		#${PALETTE_ID} .tp-close {
			border: 0; background: rgba(255,255,255,.06); color: #cfd7e3;
			width: 24px; height: 24px; border-radius: 7px; cursor: pointer; font: 16px/1 monospace;
		}
		#${PALETTE_ID} .tp-close:hover { background: rgba(255,255,255,.12); color: #fff; }
		#${PALETTE_ID} .tp-list { padding: 8px; }
		#${PALETTE_ID} .tp-item {
			display: flex; justify-content: space-between; align-items: center;
			padding: 10px 12px; border-radius: 10px; cursor: pointer; color: #dce3ee; margin-bottom: 4px;
		}
		#${PALETTE_ID} .tp-item:last-child { margin-bottom: 0; }
		#${PALETTE_ID} .tp-item:hover, #${PALETTE_ID} .tp-item.active { background: rgba(255,255,255,.06); }
		#${PALETTE_ID} .tp-left { display: flex; gap: 10px; align-items: center; }
		#${PALETTE_ID} .tp-num {
			width: 20px; height: 20px; border-radius: 6px; background: rgba(255,255,255,.08);
			display: grid; place-items: center; font-size: 11px; color: #fff;
		}
		#${PALETTE_ID} .tp-name { font-size: 13px; }
		#${PALETTE_ID} .tp-desc { font-size: 11px; color: #94a0b3; }
		#${PALETTE_ID} .tp-status {
			font-size: 10px; padding: 3px 6px; border-radius: 999px;
			background: rgba(255,255,255,.08); color: #cfd7e3;
		}
		#${PALETTE_ID} .tp-status.on { background: rgba(80,200,120,.18); color: #9ff0b3; }
		#${PALETTE_ID} .tp-foot {
			padding: 8px 12px; border-top: 1px solid rgba(255,255,255,.08); font-size: 11px; color: #8e99aa;
		}
	`;
	document.head.appendChild(style);

	const root = document.createElement("div");
	root.id = PALETTE_ID;
	root.innerHTML = `
		<div class="tp-box">
			<div class="tp-head">
				<div>
					<div class="tp-title">JS Utility Belt</div>
					<div>Draggable • Esc to close</div>
				</div>
				<button class="tp-close" title="Close">×</button>
			</div>

			<div class="tp-list">
				<!-- Tool 1: Bulk Update TSV -->
				<div class="tp-item active" data-i="0">
					<div class="tp-left">
						<div class="tp-num">1</div>
						<div>
							<div class="tp-name">Bulk Update TSV</div>
							<div class="tp-desc">Paste Excel TSV to update table</div>
						</div>
					</div>
					<div class="tp-status" data-s="bulk">RUN</div>
				</div>

				<!-- Tool 2: Image Reorder -->
				<div class="tp-item" data-i="1">
					<div class="tp-left">
						<div class="tp-num">2</div>
						<div>
							<div class="tp-name">Reorder Images</div>
							<div class="tp-desc">Visual drag-and-drop tool</div>
						</div>
					</div>
					<div class="tp-status" data-s="reorder">OFF</div>
				</div>

				<!-- Tool 3: God Mode -->
				<div class="tp-item" data-i="2">
					<div class="tp-left">
						<div class="tp-num">3</div>
						<div>
							<div class="tp-name">God Mode (Readability)</div>
							<div class="tp-desc">Nukes sticky headers & modals</div>
						</div>
					</div>
					<div class="tp-status" data-s="godmode">RUN</div>
				</div>

				<!-- Tool 4: Inspector -->
				<div class="tp-item" data-i="3">
					<div class="tp-left">
						<div class="tp-num">4</div>
						<div>
							<div class="tp-name">Element Inspector</div>
							<div class="tp-desc">Hover to get CSS path & copy</div>
						</div>
					</div>
					<div class="tp-status" data-s="inspector">OFF</div>
				</div>

				<!-- Tool 5: Password Revealer -->
				<div class="tp-item" data-i="4">
					<div class="tp-left">
						<div class="tp-num">5</div>
						<div>
							<div class="tp-name">Reveal Passwords</div>
							<div class="tp-desc">Toggle text/password inputs</div>
						</div>
					</div>
					<div class="tp-status" data-s="passwords">OFF</div>
				</div>
			</div>
			<div class="tp-foot">Click items to run/toggle</div>
		</div>
	`;
	document.body.appendChild(root);

	const items = [...root.querySelectorAll(".tp-item")];
	const closeBtn = root.querySelector(".tp-close");
	const head = root.querySelector(".tp-head");

	const statusReorder = root.querySelector('[data-s="reorder"]');
	const statusInspector = root.querySelector('[data-s="inspector"]');
	const statusPasswords = root.querySelector('[data-s="passwords"]');

	let idx = 0; let drag = false; let sx = 0; let sy = 0; let startL = 0; let startT = 0;

	// Update the UI labels ON/OFF based on current state
	function refreshStatus() {
		if (statusReorder) {
			const isOpen = window.__thgReorderToolOpen === true;
			statusReorder.textContent = isOpen ? "ON" : "OFF";
			statusReorder.classList.toggle("on", isOpen);
		}
		if (statusInspector) {
			statusInspector.textContent = inspectorActive ? "ON" : "OFF";
			statusInspector.classList.toggle("on", inspectorActive);
		}
		if (statusPasswords) {
			const hasRevealed = document.querySelector('input[data-tp-revealed="true"]');
			statusPasswords.textContent = hasRevealed ? "ON" : "OFF";
			statusPasswords.classList.toggle("on", !!hasRevealed);
		}
	}

	function sync() { items.forEach((el, i) => { el.classList.toggle("active", i === idx); }); }

	function run(i) {
		if (i === 0) runBulkUpdateTool();
		if (i === 1) runImageReorderTool();
		if (i === 2) runGodMode();
		if (i === 3) toggleInspector();
		if (i === 4) togglePasswords();
		refreshStatus();
	}

	function onKey(e) { if (e.key === "Escape") cleanup(); }

	function onClick(e) {
		const item = e.target.closest(".tp-item");
		if (item) run(+item.dataset.i);
	}

	// Window dragging logic
	function onDragStart(e) {
		if (e.target.closest(".tp-close")) return;
		drag = true; const r = root.getBoundingClientRect();
		root.style.left = r.left + "px"; root.style.top = r.top + "px";
		root.style.right = "auto"; root.style.bottom = "auto";
		sx = e.clientX; sy = e.clientY; startL = r.left; startT = r.top; e.preventDefault();
	}

	function onDragMove(e) {
		if (!drag) return;
		let left = startL + (e.clientX - sx); let top = startT + (e.clientY - sy);
		const maxLeft = window.innerWidth - root.offsetWidth - 8;
		const maxTop = window.innerHeight - root.offsetHeight - 8;
		left = Math.max(8, Math.min(maxLeft, left)); top = Math.max(8, Math.min(maxTop, top));
		root.style.left = left + "px"; root.style.top = top + "px";
	}

	function onDragEnd() { drag = false; }

	// Complete teardown and memory cleanup
	function cleanup() {
		window.removeEventListener("keydown", onKey, true);
		window.removeEventListener("mousemove", onDragMove, true);
		window.removeEventListener("mouseup", onDragEnd, true);
		
		document.removeEventListener('mouseover', onInspectorHover, { capture: true });
		document.removeEventListener('click', onInspectorClick, { capture: true });
		overlayDiv.remove(); tooltipDiv.remove();

		const revealed = document.querySelectorAll('input[data-tp-revealed="true"]');
		revealed.forEach(i => { i.type = 'password'; delete i.dataset.tpRevealed; });

		root.remove(); style.remove();
		delete window.__toolPaletteCleanup__; delete window.__toolPanelBooted__;
	}

	// Event Listeners for UI
	items.forEach(el => { el.addEventListener("mouseenter", () => { idx = +el.dataset.i; sync(); }); });
	root.addEventListener("mousedown", onClick);
	closeBtn.addEventListener("click", cleanup);
	head.addEventListener("mousedown", onDragStart);
	window.addEventListener("mousemove", onDragMove, true);
	window.addEventListener("mouseup", onDragEnd, true);
	window.addEventListener("keydown", onKey, true);

	window.__toolPaletteCleanup__ = cleanup;
	refreshStatus();
})();
