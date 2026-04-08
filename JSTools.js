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

	const OPEN_TIMEOUT_MS = 7000;
	const CLOSE_TIMEOUT_MS = 15000;
	const STEP_GAP_MS = 60;

	if (window.__thgImageToolsOpen) return;
	window.__thgImageToolsOpen = true;
	window.__thgReorderToolOpen = true; // kept for backwards compatibility
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
		throw new Error(`Timed out waiting for modal to close: ${sel}`);
	}

	function setModalValueViaAngularScope(value) {
		const input = document.querySelector(MODAL_INPUT_SELECTOR);
		if (!input) throw new Error('Modal input not found');

		const ng = window.angular;
		if (!ng?.element) throw new Error('Angular not available on window');

		const el = ng.element(input);
		const scope = el.scope?.();
		if (!scope) throw new Error('Could not get Angular scope for modal input');

		scope.$apply(() => {
			scope.value = String(value);
		});
	}

	function getHeadingText(panel) {
		const heading = panel.querySelector(HEADING_SELECTOR);
		if (!heading) return 'Images';

		const parts = Array.from(heading.querySelectorAll('span'))
			.filter(sp => {
				const cs = window.getComputedStyle(sp);
				return cs.display !== 'none' && cs.visibility !== 'hidden';
			})
			.map(sp => sp.textContent.replace(/\s+/g, ' ').trim())
			.filter(Boolean);

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

	function parsePositions(text) {
		const raw = String(text || '').trim();
		if (!raw) throw new Error('Please enter at least one position.');

		const nums = raw
			.split(',')
			.map(x => x.trim())
			.filter(Boolean)
			.map(x => Number(x));

		if (!nums.length) throw new Error('Please enter at least one position.');
		if (nums.some(n => !Number.isInteger(n) || n < 1)) {
			throw new Error('Positions must be whole numbers of 1 or higher.');
		}

		return [...new Set(nums)].sort((a, b) => a - b);
	}

	function getTempSlot(panel) {
		const state = readPanelState(panel);
		const used = new Set(state.map(x => x.order));
		let tempSlot = (state.length ? Math.max(...state.map(x => x.order)) : 0) + 1000;

		while (used.has(tempSlot)) tempSlot += 1000;
		return tempSlot;
	}

	async function ensureTempSlotFree(panel, setStatus, statusPrefix = '') {
		const tempSlot = getTempSlot(panel);
		const state = readPanelState(panel);
		const atTemp = state.find(x => x.order === tempSlot);

		if (!atTemp) return tempSlot;

		let bump = tempSlot + 1000;
		const used = new Set(state.map(x => x.order));
		while (used.has(bump)) bump += 1000;

		setStatus(`${statusPrefix}Temp slot ${tempSlot} is in use. Moving it to ${bump}...`);
		await setOrderForSrcInPanel(panel, atTemp.src, bump);

		return tempSlot;
	}

	const panels = Array.from(document.querySelectorAll(PANEL_SELECTOR))
		.filter(p => p.querySelector(TABLE_BODY_SELECTOR) && getPanelRows(p).length);

	if (!panels.length) {
		window.__thgImageToolsOpen = false;
		window.__thgReorderToolOpen = false;
		refreshStatus();
		alert('No image tables found on this page.');
		return;
	}

	const overlay = document.createElement('div');
	overlay.style.cssText = `
		position:fixed;
		inset:0;
		background:rgba(0,0,0,.45);
		z-index:2147483647;
		display:flex;
		align-items:center;
		justify-content:center;
		font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
	`;

	const ui = document.createElement('div');
	ui.style.cssText = `
		width:min(1100px,95vw);
		height:min(880px,92vh);
		background:#fff;
		border-radius:12px;
		box-shadow:0 20px 60px rgba(0,0,0,.35);
		display:flex;
		flex-direction:column;
		overflow:hidden;
	`;

	const header = document.createElement('div');
	header.style.cssText = `
		padding:14px 16px;
		border-bottom:1px solid #e6e6e6;
		display:flex;
		justify-content:space-between;
		gap:10px;
		align-items:center;
	`;

	header.innerHTML = `
		<div>
			<div style="font-size:16px; font-weight:650;">Matrix image tools</div>
			<div id="__thg_image_tool_subtitle__" style="font-size:12px; color:#666;">
				Choose a tab below.
			</div>
		</div>
		<div style="display:flex; gap:8px;">
			<button data-a="close" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Close</button>
		</div>
	`;

	const tabBar = document.createElement('div');
	tabBar.style.cssText = `
		display:flex;
		gap:0;
		border-bottom:1px solid #e6e6e6;
		background:#fafafa;
	`;

	const reorderTabBtn = document.createElement('button');
	reorderTabBtn.type = 'button';
	reorderTabBtn.dataset.tab = 'reorder';
	reorderTabBtn.textContent = 'Reorder images';
	reorderTabBtn.style.cssText = `
		padding:10px 14px;
		border:0;
		border-right:1px solid #e6e6e6;
		background:#fff;
		cursor:pointer;
		font-weight:700;
	`;

	const gapTabBtn = document.createElement('button');
	gapTabBtn.type = 'button';
	gapTabBtn.dataset.tab = 'gaps';
	gapTabBtn.textContent = 'Free up / normalise slots';
	gapTabBtn.style.cssText = `
		padding:10px 14px;
		border:0;
		border-right:1px solid #e6e6e6;
		background:#fafafa;
		cursor:pointer;
		font-weight:600;
		color:#444;
	`;

	tabBar.append(reorderTabBtn, gapTabBtn);

	const contentWrap = document.createElement('div');
	contentWrap.style.cssText = `
		flex:1;
		min-height:0;
		display:flex;
		flex-direction:column;
	`;

	const reorderView = document.createElement('div');
	reorderView.style.cssText = `
		flex:1;
		min-height:0;
		display:flex;
		flex-direction:column;
	`;

	const gapView = document.createElement('div');
	gapView.style.cssText = `
		flex:1;
		min-height:0;
		display:none;
		flex-direction:column;
	`;

	contentWrap.append(reorderView, gapView);
	ui.append(header, tabBar, contentWrap);
	overlay.append(ui);
	document.body.appendChild(overlay);

	const subtitleEl = header.querySelector('#__thg_image_tool_subtitle__');

	function close() {
		window.__thgImageToolsOpen = false;
		window.__thgReorderToolOpen = false;
		document.removeEventListener('keydown', onKeyDown, true);
		overlay.remove();
		refreshStatus();
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') close();
	}

	document.addEventListener('keydown', onKeyDown, true);
	header.querySelector('[data-a="close"]').addEventListener('click', close);

	function switchTab(name) {
		const isReorder = name === 'reorder';

		reorderView.style.display = isReorder ? 'flex' : 'none';
		gapView.style.display = isReorder ? 'none' : 'flex';

		reorderTabBtn.style.background = isReorder ? '#fff' : '#fafafa';
		reorderTabBtn.style.fontWeight = isReorder ? '700' : '600';
		reorderTabBtn.style.color = isReorder ? '#111' : '#444';

		gapTabBtn.style.background = isReorder ? '#fafafa' : '#fff';
		gapTabBtn.style.fontWeight = isReorder ? '600' : '700';
		gapTabBtn.style.color = isReorder ? '#444' : '#111';

		subtitleEl.textContent = isReorder
			? 'Drag within a section only. Apply will reorder each section independently.'
			: 'Use “Normalise all sections” to clean up numbering across the whole page, or free up one or more slots in selected sections.';
	}

	reorderTabBtn.addEventListener('click', () => switchTab('reorder'));
	gapTabBtn.addEventListener('click', () => switchTab('gaps'));

	// =========================================================
	// TAB 1: REORDER IMAGES
	// =========================================================
	const reorderBody = document.createElement('div');
	reorderBody.style.cssText = `padding:12px; overflow:auto; flex:1;`;

	const reorderStatus = document.createElement('div');
	reorderStatus.style.cssText = `font-size:12px; color:#444; margin:0 0 10px 0; line-height:1.4; white-space:pre-wrap;`;

	const reorderControls = document.createElement('div');
	reorderControls.style.cssText = `display:flex; justify-content:flex-end; margin:0 0 10px 0;`;

	reorderControls.innerHTML = `
		<button data-a="applyReorder" style="padding:8px 10px; border:1px solid #111; background:#111; color:#fff; border-radius:8px; cursor:pointer;">Apply reorder</button>
	`;

	reorderBody.append(reorderControls, reorderStatus);
	reorderView.append(reorderBody);

	const setReorderStatus = (t) => (reorderStatus.textContent = t);

	const reorderSections = panels.map((panel, idx) => {
		const title = getHeadingText(panel) || `Section ${idx + 1}`;
		const initial = readPanelState(panel);

		const wrap = document.createElement('div');
		wrap.style.cssText = `border:1px solid #e6e6e6; border-radius:12px; padding:10px; margin:10px 0;`;

		const h = document.createElement('div');
		h.style.cssText = `font-size:13px; font-weight:650; margin:0 0 8px 0;`;
		h.textContent = `${title} (${initial.length})`;

		const list = document.createElement('div');
		list.style.cssText = `display:flex; flex-direction:column; gap:8px;`;

		wrap.append(h, list);
		reorderBody.append(wrap);

		return { panel, title, list, initial };
	});

	setReorderStatus(
		`Detected ${reorderSections.length} section(s):\n` +
		`${reorderSections.map(s => `• ${s.title} (${s.initial.length})`).join('\n')}\n\n` +
		`Drag within a section only. Apply will reorder each section independently.`
	);

	let dragEl = null;

	function makeCard(item) {
		const card = document.createElement('div');
		card.draggable = true;
		card.dataset.src = item.src;
		card.style.cssText = `display:flex; align-items:center; gap:10px; border:1px solid #ddd; border-radius:10px; padding:10px; background:#fff; cursor:grab;`;

		const img = document.createElement('img');
		img.src = item.src;
		img.style.cssText = `width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid #eee; background:#fafafa;`;

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

		card.addEventListener('dragstart', (e) => {
			dragEl = card;
			card.style.opacity = '0.55';
			e.dataTransfer.effectAllowed = 'move';
		});

		card.addEventListener('dragend', () => {
			dragEl = null;
			card.style.opacity = '1';
		});

		return card;
	}

	function wireDnD(listEl, onChange) {
		listEl.addEventListener('dragover', (e) => e.preventDefault());
		listEl.addEventListener('drop', (e) => e.preventDefault());

		Array.from(listEl.children).forEach(card => {
			card.addEventListener('dragover', (e) => {
				e.preventDefault();
				card.style.borderColor = '#111';
			});

			card.addEventListener('dragleave', () => {
				card.style.borderColor = '#ddd';
			});

			card.addEventListener('drop', (e) => {
				e.preventDefault();
				card.style.borderColor = '#ddd';

				if (!dragEl || dragEl === card) return;
				if (dragEl.parentElement !== listEl) return;

				const kids = Array.from(listEl.children);
				const from = kids.indexOf(dragEl);
				const to = kids.indexOf(card);

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

	for (const s of reorderSections) {
		s.initial.forEach(it => s.list.appendChild(makeCard(it)));
		updateNewLabels(s.list);
		wireDnD(s.list, () => updateNewLabels(s.list));
	}

	async function applyReorderSection(section, sectionIndex, totalSections) {
		const { panel, title, list } = section;
		const desired = Array.from(list.children).map((c, i) => ({ src: c.dataset.src, want: i + 1 }));

		let state = readPanelState(panel);
		const srcToOrder = new Map(state.map(x => [x.src, x.order]));
		const orderToSrc = new Map(state.map(x => [x.order, x.src]));

		const tempSlot = await ensureTempSlotFree(panel, setReorderStatus, `(${sectionIndex}/${totalSections}) ${title}\n`);

		for (let i = 0; i < desired.length; i++) {
			const { src, want } = desired[i];
			const have = srcToOrder.get(src);
			if (have === want) continue;

			setReorderStatus(
				`(${sectionIndex}/${totalSections}) ${title}\n` +
				`Step ${i + 1}/${desired.length}: place into ${want} (currently ${have})...`
			);

			const srcInWant = orderToSrc.get(want);

			if (srcInWant && srcInWant !== src) {
				await setOrderForSrcInPanel(panel, srcInWant, tempSlot);
				srcToOrder.set(srcInWant, tempSlot);
				orderToSrc.set(tempSlot, srcInWant);
				orderToSrc.delete(want);
			}

			await setOrderForSrcInPanel(panel, src, want);
			srcToOrder.set(src, want);
			orderToSrc.set(want, src);
			orderToSrc.delete(have);

			if (srcInWant && srcInWant !== src) {
				await setOrderForSrcInPanel(panel, srcInWant, have);
				srcToOrder.set(srcInWant, have);
				orderToSrc.set(have, srcInWant);
				orderToSrc.delete(tempSlot);
			}
		}
	}

	async function applyAllReorder() {
		const btn = reorderControls.querySelector('[data-a="applyReorder"]');
		btn.disabled = true;
		btn.textContent = 'Applying…';

		try {
			for (let i = 0; i < reorderSections.length; i++) {
				await applyReorderSection(reorderSections[i], i + 1, reorderSections.length);
			}

			setReorderStatus(`Done.\nIf the table numbers don’t refresh immediately, refresh the page to confirm.`);
			btn.textContent = 'Done';
		} catch (err) {
			console.error(err);
			alert(`Apply failed: ${err.message}`);
			btn.disabled = false;
			btn.textContent = 'Apply reorder';
			setReorderStatus('Apply failed — check console for details.');
		}
	}

	reorderControls.querySelector('[data-a="applyReorder"]').addEventListener('click', applyAllReorder);

	// =========================================================
	// TAB 2: FREE UP / NORMALISE SLOTS (VERSION 2)
	// =========================================================
	const gapBody = document.createElement('div');
	gapBody.style.cssText = `padding:12px; overflow:auto; flex:1;`;

	const gapControls = document.createElement('div');
	gapControls.style.cssText = `
		border:1px solid #e6e6e6;
		border-radius:12px;
		padding:12px;
		margin:0 0 12px 0;
		background:#fafafa;
	`;

	const gapStatus = document.createElement('div');
	gapStatus.style.cssText = `
		font-size:12px;
		color:#444;
		margin:0 0 10px 0;
		line-height:1.4;
		white-space:pre-wrap;
	`;

	const gapSectionsWrap = document.createElement('div');
	gapSectionsWrap.style.cssText = `
		display:flex;
		flex-direction:column;
		gap:10px;
	`;

	gapBody.append(gapControls, gapStatus, gapSectionsWrap);
	gapView.append(gapBody);

	const setGapStatus = (t) => { gapStatus.textContent = t; };

	gapControls.innerHTML = `
		<div style="display:flex; flex-direction:column; gap:12px;">
			<div style="display:flex; flex-wrap:wrap; gap:14px; align-items:end;">
				<div style="display:flex; flex-direction:column; gap:6px;">
					<label style="font-size:12px; color:#555;">Shared positions to free up</label>
					<input data-role="sharedPositions" type="text" value="2"
						placeholder="e.g. 2 or 2,5,7"
						style="width:220px; padding:8px 10px; border:1px solid #ccc; border-radius:8px;">
				</div>

				<label style="display:flex; align-items:center; gap:8px; font-size:13px; user-select:none;">
					<input data-role="uniqueToggle" type="checkbox">
					Use unique positions per section
				</label>

				<div style="display:flex; gap:8px; flex-wrap:wrap;">
					<button data-a="all" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Select all</button>
					<button data-a="none" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Clear</button>
					<button data-a="normaliseAll" style="padding:8px 10px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Normalise all sections</button>
					<button data-a="applyGaps" style="padding:8px 10px; border:1px solid #111; background:#111; color:#fff; border-radius:8px; cursor:pointer;">Apply gaps</button>
				</div>
			</div>

			<div style="font-size:12px; color:#666;">
				Enter one or more positions separated by commas, for example:
				<b>2</b> or <b>2,5,7</b>.
				When using unique positions, each section can have its own list.
			</div>
		</div>
	`;

	const sharedPositionsInput = gapControls.querySelector('[data-role="sharedPositions"]');
	const uniqueToggle = gapControls.querySelector('[data-role="uniqueToggle"]');
	const normaliseBtn = gapControls.querySelector('[data-a="normaliseAll"]');
	const applyGapsBtn = gapControls.querySelector('[data-a="applyGaps"]');

	const gapSections = panels.map((panel, idx) => {
		const title = getHeadingText(panel) || `Section ${idx + 1}`;
		const initial = readPanelState(panel);

		const box = document.createElement('div');
		box.style.cssText = `
			border:1px solid #e6e6e6;
			border-radius:12px;
			padding:10px;
			background:#fff;
		`;

		const topRow = document.createElement('div');
		topRow.style.cssText = `
			display:flex;
			flex-wrap:wrap;
			gap:12px;
			align-items:flex-start;
			justify-content:space-between;
		`;

		const left = document.createElement('label');
		left.style.cssText = `
			display:flex;
			align-items:flex-start;
			gap:10px;
			cursor:pointer;
			flex:1;
		`;

		const cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.checked = idx === 0;
		cb.style.marginTop = '2px';

		const meta = document.createElement('div');
		meta.style.cssText = `display:flex; flex-direction:column; gap:4px;`;

		const top = document.createElement('div');
		top.style.cssText = `font-size:13px; font-weight:650;`;
		top.textContent = `${title} (${initial.length})`;

		const sub = document.createElement('div');
		sub.style.cssText = `font-size:12px; color:#666;`;
		sub.textContent = `Current orders: ${initial.map(x => x.order).join(', ')}`;

		meta.append(top, sub);
		left.append(cb, meta);

		const right = document.createElement('div');
		right.style.cssText = `
			display:none;
			flex-direction:column;
			gap:6px;
			min-width:220px;
		`;

		const rightLabel = document.createElement('label');
		rightLabel.style.cssText = `font-size:12px; color:#555;`;
		rightLabel.textContent = 'Unique positions for this section';

		const uniqueInput = document.createElement('input');
		uniqueInput.type = 'text';
		uniqueInput.placeholder = 'e.g. 2 or 2,5,7';
		uniqueInput.value = '2';
		uniqueInput.style.cssText = `
			width:220px;
			padding:8px 10px;
			border:1px solid #ccc;
			border-radius:8px;
		`;

		right.append(rightLabel, uniqueInput);
		topRow.append(left, right);
		box.append(topRow);
		gapSectionsWrap.append(box);

		return {
			panel,
			title,
			initial,
			checkbox: cb,
			sub,
			uniqueWrap: right,
			uniqueInput
		};
	});

	function updateUniqueModeUI() {
		const uniqueOn = uniqueToggle.checked;
		sharedPositionsInput.disabled = uniqueOn;
		sharedPositionsInput.style.opacity = uniqueOn ? '0.55' : '1';

		for (const s of gapSections) {
			s.uniqueWrap.style.display = uniqueOn ? 'flex' : 'none';
		}
	}

	function setGapBusyState(isBusy, applyText = 'Apply gaps', normaliseText = 'Normalise all sections') {
		applyGapsBtn.disabled = isBusy;
		normaliseBtn.disabled = isBusy;
		sharedPositionsInput.disabled = isBusy || uniqueToggle.checked;
		uniqueToggle.disabled = isBusy;

		gapControls.querySelector('[data-a="all"]').disabled = isBusy;
		gapControls.querySelector('[data-a="none"]').disabled = isBusy;

		for (const s of gapSections) {
			s.checkbox.disabled = isBusy;
			s.uniqueInput.disabled = isBusy;
		}

		applyGapsBtn.textContent = applyText;
		normaliseBtn.textContent = normaliseText;
	}

	async function applyDesiredOrder(panel, desired, title, setStatus, statusPrefix = '') {
		const tempSlot = await ensureTempSlotFree(panel, setStatus, statusPrefix);

		let state = readPanelState(panel);
		const srcToOrder = new Map(state.map(x => [x.src, x.order]));
		const orderToSrc = new Map(state.map(x => [x.order, x.src]));

		for (let i = 0; i < desired.length; i++) {
			const { src, want } = desired[i];
			const have = srcToOrder.get(src);

			if (have === want) continue;

			setStatus(
				`${statusPrefix}${title}\n` +
				`Normalising step ${i + 1}/${desired.length}: ${have} → ${want}`
			);

			const srcInWant = orderToSrc.get(want);

			if (srcInWant && srcInWant !== src) {
				await setOrderForSrcInPanel(panel, srcInWant, tempSlot);
				srcToOrder.set(srcInWant, tempSlot);
				orderToSrc.set(tempSlot, srcInWant);
				orderToSrc.delete(want);
			}

			await setOrderForSrcInPanel(panel, src, want);
			srcToOrder.set(src, want);
			orderToSrc.set(want, src);
			orderToSrc.delete(have);

			if (srcInWant && srcInWant !== src) {
				await setOrderForSrcInPanel(panel, srcInWant, have);
				srcToOrder.set(srcInWant, have);
				orderToSrc.set(have, srcInWant);
				orderToSrc.delete(tempSlot);
			}
		}
	}

	async function normaliseSection(panel, title, setStatus, statusPrefix = '') {
		const state = readPanelState(panel);

		const desired = state
			.slice()
			.sort((a, b) => a.order - b.order)
			.map((item, idx) => ({
				src: item.src,
				want: idx + 1
			}));

		const alreadyNormal = desired.every((d, idx) => {
			const current = state[idx];
			return current && current.src === d.src && current.order === d.want;
		});

		if (alreadyNormal) {
			setStatus(`${statusPrefix}${title}\nAlready normalised.`);
			return;
		}

		await applyDesiredOrder(panel, desired, title, setStatus, statusPrefix);
	}

	async function createSingleGapInSection(panel, title, insertPosition, setStatus, statusPrefix = '') {
		const state = readPanelState(panel).sort((a, b) => a.order - b.order);
		const count = state.length;

		if (insertPosition < 1) {
			throw new Error(`Invalid position for ${title}`);
		}

		if (insertPosition > count + 1) {
			throw new Error(
				`${title}: chosen position ${insertPosition} is too high. ` +
				`This section has ${count} image(s), so max allowed is ${count + 1}.`
			);
		}

		const toShift = state
			.filter(x => x.order >= insertPosition)
			.sort((a, b) => b.order - a.order);

		for (let i = 0; i < toShift.length; i++) {
			const item = toShift[i];
			setStatus(
				`${statusPrefix}${title}\n` +
				`Shift step ${i + 1}/${toShift.length}: ${item.order} → ${item.order + 1}`
			);
			await setOrderForSrcInPanel(panel, item.src, item.order + 1);
		}
	}

	async function createGapsInSection(panel, title, positions, setStatus, statusPrefix = '') {
		await normaliseSection(panel, title, setStatus, statusPrefix);

		for (let i = 0; i < positions.length; i++) {
			const pos = positions[i];
			setStatus(
				`${statusPrefix}${title}\n` +
				`Creating gap ${i + 1}/${positions.length} at position ${pos}...`
			);
			await createSingleGapInSection(panel, title, pos, setStatus, statusPrefix);
		}
	}

	async function refreshGapSectionPreview(section) {
		const now = readPanelState(section.panel);
		section.sub.textContent = `Current orders: ${now.map(x => x.order).join(', ')}`;
	}

	uniqueToggle.addEventListener('change', updateUniqueModeUI);
	updateUniqueModeUI();

	gapControls.querySelector('[data-a="all"]').addEventListener('click', () => {
		gapSections.forEach(s => { s.checkbox.checked = true; });
	});

	gapControls.querySelector('[data-a="none"]').addEventListener('click', () => {
		gapSections.forEach(s => { s.checkbox.checked = false; });
	});

	setGapStatus(
		`Detected ${gapSections.length} section(s):\n` +
		gapSections.map(s => `• ${s.title} (${s.initial.length})`).join('\n') +
		`\n\nUse “Normalise all sections” to clean up the whole page, or choose one or more sections and click “Apply gaps”.`
	);

	async function normaliseAllSections() {
		setGapBusyState(true, 'Apply gaps', 'Normalising…');
		const errors = [];

		try {
			for (let i = 0; i < gapSections.length; i++) {
				const s = gapSections[i];
				const prefix = `(${i + 1}/${gapSections.length}) `;

				try {
					await normaliseSection(s.panel, s.title, setGapStatus, prefix);
					await refreshGapSectionPreview(s);
				} catch (err) {
					console.error(err);
					errors.push(`${s.title}: ${err.message}`);
				}
			}

			if (errors.length) {
				setGapStatus(
					`Normalise finished with some issues.\n\n` +
					errors.map(e => `• ${e}`).join('\n') +
					`\n\nRefresh the page if the table numbers do not update immediately.`
				);
				alert(`Normalise finished with ${errors.length} issue(s). Check the status box / console.`);
			} else {
				setGapStatus(
					`Done.\n` +
					`All sections have been normalised.\n` +
					`Refresh the page if the table numbers do not update immediately.`
				);
			}
		} catch (err) {
			console.error(err);
			alert(`Normalise failed: ${err.message}`);
			setGapStatus('Normalise failed — check console for details.');
		} finally {
			setGapBusyState(false, 'Apply gaps', 'Normalise all sections');
		}
	}

	async function applyAllGaps() {
		const selected = gapSections.filter(s => s.checkbox.checked);

		if (!selected.length) {
			alert('Please select at least one section.');
			return;
		}

		const uniqueOn = uniqueToggle.checked;
		let sharedPositions = null;

		try {
			if (!uniqueOn) {
				sharedPositions = parsePositions(sharedPositionsInput.value);
			}
		} catch (err) {
			alert(err.message);
			return;
		}

		setGapBusyState(true, 'Applying…', 'Normalise all sections');
		const errors = [];

		try {
			for (let i = 0; i < selected.length; i++) {
				const s = selected[i];
				const prefix = `(${i + 1}/${selected.length}) `;

				try {
					const positions = uniqueOn ? parsePositions(s.uniqueInput.value) : sharedPositions;
					await createGapsInSection(s.panel, s.title, positions, setGapStatus, prefix);
					await refreshGapSectionPreview(s);
				} catch (err) {
					console.error(err);
					errors.push(`${s.title}: ${err.message}`);
				}
			}

			if (errors.length) {
				setGapStatus(
					`Finished with some issues.\n\n` +
					errors.map(e => `• ${e}`).join('\n') +
					`\n\nRefresh the page if the table numbers do not update immediately.`
				);
				alert(`Finished with ${errors.length} issue(s). Check the status box / console.`);
			} else {
				setGapStatus(
					`Done.\n` +
					`Gap creation completed in ${selected.length} section(s).\n` +
					`Refresh the page if the table numbers do not update immediately.`
				);
			}
		} catch (err) {
			console.error(err);
			alert(`Apply failed: ${err.message}`);
			setGapStatus('Apply failed — check console for details.');
		} finally {
			setGapBusyState(false, 'Apply gaps', 'Normalise all sections');
		}
	}

	normaliseBtn.addEventListener('click', normaliseAllSections);
	applyGapsBtn.addEventListener('click', applyAllGaps);

	switchTab('reorder');
}

	// ==========================================
	// TOOL 3: AUDIT HISTORY SEARCH (VERSION 1)
	// ==========================================
	function runAuditHistorySearchTool() {
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
	}

	// ==========================================
	// TOOL 4: WRAP EXCEL COLUMN IN QUOTES
	// ==========================================
	function runQuoteWrapTool() {
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
			wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
			wrap.querySelector("[data-x]").addEventListener("click", close);

			return {
				wrap,
				close,
				qs: sel => wrap.querySelector(sel)
			};
		};

		const convertText = raw => {
			const lines = (raw || "")
				.split(/\r?\n/)
				.map(x => (x || "").replace(/\s+/g, " ").trim())
				.filter(Boolean);

			return lines.map((line, i) => {
				const safe = line.replace(/'/g, "''");
				return `'${safe}'${i === lines.length - 1 ? "" : ","}`;
			}).join("\n");
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
				</div>`,
			footerHTML: `
				<button data-close style="border:0;background:#f3f4f6;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:700;">Close</button>
				<button data-run style="border:0;background:#2563eb;color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:800;">Convert + Copy</button>`
		});

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
	}

	// ==========================================
	// TOOL 5: ELEMENT PATH INSPECTOR
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
	// TOOL 6: JSON VIEWER (V2)
	// ==========================================
	function runJsonViewerTool() {
		try {
			const existing = document.getElementById("__json_viewer_overlay__");
			if (existing) {
				existing.remove();
				return;
			}

			const rawText = document.body ? document.body.innerText.trim() : "";
			if (!rawText) throw new Error("No page text found.");

			let data;
			try {
				data = JSON.parse(rawText);
			} catch (err) {
				const pre = document.querySelector("pre");
				const alt = pre ? pre.innerText.trim() : rawText;
				data = JSON.parse(alt);
			}

			const overlay = document.createElement("div");
			overlay.id = "__json_viewer_overlay__";

			overlay.innerHTML = `
				<style>
					#__json_viewer_overlay__ {
						position: fixed;
						inset: 0;
						background: #111827;
						color: #e5e7eb;
						z-index: 2147483647;
						font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
						display: flex;
						flex-direction: column;
					}
					#__json_viewer_overlay__ * { box-sizing: border-box; }
					#__json_viewer_toolbar__ {
						display: flex;
						align-items: center;
						gap: 8px;
						padding: 10px 12px;
						border-bottom: 1px solid #374151;
						background: #0f172a;
						position: sticky;
						top: 0;
						z-index: 1;
						flex: 0 0 auto;
						flex-wrap: wrap;
					}
					#__json_viewer_toolbar__ button,
					#__json_viewer_toolbar__ label,
					#__json_viewer_toolbar__ input {
						background: #1f2937;
						color: #e5e7eb;
						border: 1px solid #374151;
						border-radius: 6px;
						padding: 6px 10px;
						font-size: 12px;
					}
					#__json_viewer_toolbar__ button { cursor: pointer; }
					#__json_viewer_toolbar__ button:hover { background: #374151; }
					#__json_viewer_toolbar__ .spacer { flex: 1; }
					#__json_viewer_status__ { font-size: 12px; color: #93c5fd; }
					#__jv_search__ { min-width: 220px; outline: none; }
					#__json_viewer_container__ {
						overflow: auto;
						padding: 16px;
						line-height: 1.55;
						white-space: normal;
						flex: 1 1 auto;
						min-height: 0;
					}
					.jv-line { white-space: nowrap; }
					.jv-indent { display: inline-block; width: 20px; }
					.jv-toggle {
						display: inline-block;
						width: 16px;
						color: #93c5fd;
						cursor: pointer;
						user-select: none;
						text-align: center;
					}
					.jv-toggle.empty {
						cursor: default;
						color: transparent;
					}
					.jv-key { color: #93c5fd; }
					.jv-string {
						color: #86efac;
						white-space: pre-wrap;
					}
					.jv-number { color: #fca5a5; }
					.jv-boolean { color: #c4b5fd; }
					.jv-null { color: #9ca3af; }
					.jv-punc { color: #e5e7eb; }
					.jv-node { white-space: nowrap; }
					.jv-children { display: block; }
					.jv-collapsed > .jv-children { display: none; }
					.jv-summary {
						color: #9ca3af;
						margin-left: 4px;
					}
					.jv-html-preview {
						margin: 6px 0 8px 40px;
						padding: 10px 12px;
						border: 1px solid #374151;
						border-radius: 8px;
						background: #0b1220;
						white-space: normal;
						font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
					}
					.jv-html-label {
						display: inline-block;
						margin: 6px 0 4px 40px;
						padding: 2px 6px;
						border-radius: 999px;
						background: #1e293b;
						color: #93c5fd;
						font-size: 11px;
						font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
					}
					.jv-raw-html {
						margin: 4px 0 10px 40px;
						color: #86efac;
						white-space: pre-wrap;
						word-break: break-word;
					}
					.jv-hidden { display: none !important; }
					.jv-search-hit {
						background: #facc15;
						color: #111827;
						border-radius: 2px;
						padding: 0 1px;
					}
					.jv-search-hit-current {
						background: #fb7185;
						color: #fff;
					}
				</style>
				<div id="__json_viewer_toolbar__">
					<button id="__jv_expand_all__">Expand all</button>
					<button id="__jv_collapse_all__">Collapse all</button>
					<button id="__jv_copy__">Copy JSON</button>
					<button id="__jv_find__">Find</button>
					<input id="__jv_search__" type="text" placeholder="Find in JSON..." />
					<button id="__jv_prev__">Prev</button>
					<button id="__jv_next__">Next</button>
					<button id="__jv_close__">Close</button>
					<label>
						<input type="checkbox" id="__jv_render_html__" checked />
						Render HTML
					</label>
					<div class="spacer"></div>
					<div id="__json_viewer_status__"></div>
				</div>
				<div id="__json_viewer_container__"></div>
			`;

			document.body.appendChild(overlay);

			const oldHtmlOverflow = document.documentElement.style.overflow;
			const oldBodyOverflow = document.body.style.overflow;
			document.documentElement.style.overflow = "hidden";
			document.body.style.overflow = "hidden";

			const restorePageScroll = () => {
				document.documentElement.style.overflow = oldHtmlOverflow;
				document.body.style.overflow = oldBodyOverflow;
			};

			const container = overlay.querySelector("#__json_viewer_container__");
			const status = overlay.querySelector("#__json_viewer_status__");
			const renderHtmlToggle = overlay.querySelector("#__jv_render_html__");
			const searchInput = overlay.querySelector("#__jv_search__");
			const findButton = overlay.querySelector("#__jv_find__");
			const prevButton = overlay.querySelector("#__jv_prev__");
			const nextButton = overlay.querySelector("#__jv_next__");

			let searchHits = [];
			let currentHitIndex = -1;

			const isHtmlString = (value) => {
				if (typeof value !== "string") return false;
				const s = value.trim();
				if (!s) return false;
				return /<\/?[a-z][\s\S]*>/i.test(s);
			};

			const makeIndent = (depth) => {
				const frag = document.createDocumentFragment();
				for (let i = 0; i < depth; i++) {
					const span = document.createElement("span");
					span.className = "jv-indent";
					frag.appendChild(span);
				}
				return frag;
			};

			const createLine = () => {
				const line = document.createElement("div");
				line.className = "jv-line";
				return line;
			};

			const renderPrimitive = (value, key = "") => {
				const span = document.createElement("span");

				const isTimestamp =
					typeof value === "number" &&
					value > 1000000000000 &&
					/date/i.test(key);

				if (isTimestamp) {
					const date = new Date(value);
					const formatted =
						String(date.getDate()).padStart(2, "0") + "/" +
						String(date.getMonth() + 1).padStart(2, "0") + "/" +
						date.getFullYear();

					span.className = "jv-number";
					span.textContent = value;

					const dateSpan = document.createElement("span");
					dateSpan.style.color = "#fbbf24";
					dateSpan.style.marginLeft = "8px";
					dateSpan.textContent = `(${formatted})`;

					const wrapper = document.createElement("span");
					wrapper.appendChild(span);
					wrapper.appendChild(dateSpan);
					return wrapper;
				}

				if (typeof value === "string") {
					span.className = "jv-string";
					span.textContent = JSON.stringify(value);
				} else if (typeof value === "number") {
					span.className = "jv-number";
					span.textContent = String(value);
				} else if (typeof value === "boolean") {
					span.className = "jv-boolean";
					span.textContent = String(value);
				} else if (value === null) {
					span.className = "jv-null";
					span.textContent = "null";
				} else {
					span.textContent = String(value);
				}

				return span;
			};

			const summaryText = (value) => {
				if (Array.isArray(value)) return `[${value.length}]`;
				return `{${Object.keys(value).length}}`;
			};

			const createToggle = (hasChildren, collapsed = false) => {
				const toggle = document.createElement("span");
				toggle.className = "jv-toggle" + (hasChildren ? "" : " empty");
				toggle.textContent = hasChildren ? (collapsed ? "▸" : "▾") : "•";
				return toggle;
			};

			const renderNode = (key, value, depth, isLast) => {
				const wrapper = document.createElement("div");
				wrapper.className = "jv-node";

				const isObject = value && typeof value === "object";
				const isArray = Array.isArray(value);
				const hasChildren = isObject && Object.keys(value).length > 0;

				const line = createLine();
				line.appendChild(makeIndent(depth));

				const toggle = createToggle(hasChildren, depth > 1);
				line.appendChild(toggle);

				if (key !== null) {
					const keySpan = document.createElement("span");
					keySpan.className = "jv-key";
					keySpan.textContent = JSON.stringify(String(key));
					line.appendChild(keySpan);

					const colon = document.createElement("span");
					colon.className = "jv-punc";
					colon.textContent = ": ";
					line.appendChild(colon);
				}

				if (isObject) {
					const open = document.createElement("span");
					open.className = "jv-punc";
					open.textContent = isArray ? "[" : "{";
					line.appendChild(open);

					const summary = document.createElement("span");
					summary.className = "jv-summary";
					summary.textContent = summaryText(value);
					line.appendChild(summary);

					wrapper.appendChild(line);

					const children = document.createElement("div");
					children.className = "jv-children";

					const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
					entries.forEach(([childKey, childVal], idx) => {
						children.appendChild(renderNode(childKey, childVal, depth + 1, idx === entries.length - 1));
					});

					const closeLine = createLine();
					closeLine.appendChild(makeIndent(depth));
					const spacer = document.createElement("span");
					spacer.className = "jv-toggle empty";
					spacer.textContent = "•";
					closeLine.appendChild(spacer);

					const close = document.createElement("span");
					close.className = "jv-punc";
					close.textContent = (isArray ? "]" : "}") + (isLast ? "" : ",");
					closeLine.appendChild(close);
					children.appendChild(closeLine);

					wrapper.appendChild(children);

					if (depth > 1 && hasChildren) {
						wrapper.classList.add("jv-collapsed");
						summary.classList.remove("jv-hidden");
					} else {
						summary.classList.add("jv-hidden");
					}

					if (hasChildren) {
						toggle.addEventListener("click", () => {
							const collapsed = wrapper.classList.toggle("jv-collapsed");
							toggle.textContent = collapsed ? "▸" : "▾";
							summary.classList.toggle("jv-hidden", !collapsed);
						});
					}
				} else {
					line.appendChild(renderPrimitive(value, key));

					const comma = document.createElement("span");
					comma.className = "jv-punc";
					comma.textContent = isLast ? "" : ",";
					line.appendChild(comma);

					wrapper.appendChild(line);

					if (isHtmlString(value)) {
						const badge = document.createElement("div");
						badge.className = "jv-html-label";
						badge.textContent = "Rendered HTML";

						const preview = document.createElement("div");
						preview.className = "jv-html-preview";
						preview.innerHTML = value;

						const raw = document.createElement("div");
						raw.className = "jv-raw-html";
						raw.textContent = value;

						wrapper.appendChild(badge);
						wrapper.appendChild(preview);
						wrapper.appendChild(raw);

						const syncHtmlMode = () => {
							const on = renderHtmlToggle.checked;
							badge.classList.toggle("jv-hidden", !on);
							preview.classList.toggle("jv-hidden", !on);
						};

						syncHtmlMode();
						renderHtmlToggle.addEventListener("change", syncHtmlMode);
					}
				}

				return wrapper;
			};

			const expandParents = (el) => {
				let current = el.parentElement;
				while (current && current !== container) {
					if (current.classList && current.classList.contains("jv-children")) {
						const node = current.parentElement;
						if (node && node.classList.contains("jv-node")) {
							node.classList.remove("jv-collapsed");
							const toggle = node.querySelector(":scope > .jv-line > .jv-toggle");
							const summary = node.querySelector(":scope > .jv-line > .jv-summary");
							if (toggle && !toggle.classList.contains("empty")) toggle.textContent = "▾";
							if (summary) summary.classList.add("jv-hidden");
						}
					}
					current = current.parentElement;
				}
			};

			const clearSearchHighlights = () => {
				const hits = container.querySelectorAll(".jv-search-hit");
				hits.forEach((hit) => {
					const parent = hit.parentNode;
					if (!parent) return;
					parent.replaceChild(document.createTextNode(hit.textContent), hit);
					parent.normalize();
				});
				searchHits = [];
				currentHitIndex = -1;
			};

			const highlightInTextNode = (textNode, query) => {
				const text = textNode.nodeValue;
				const lowerText = text.toLowerCase();
				const lowerQuery = query.toLowerCase();
				if (!lowerText.includes(lowerQuery)) return;

				const frag = document.createDocumentFragment();
				let start = 0;
				let index;

				while ((index = lowerText.indexOf(lowerQuery, start)) !== -1) {
					if (index > start) {
						frag.appendChild(document.createTextNode(text.slice(start, index)));
					}

					const mark = document.createElement("span");
					mark.className = "jv-search-hit";
					mark.textContent = text.slice(index, index + query.length);
					frag.appendChild(mark);

					start = index + query.length;
				}

				if (start < text.length) {
					frag.appendChild(document.createTextNode(text.slice(start)));
				}

				textNode.parentNode.replaceChild(frag, textNode);
			};

			const focusHit = (index) => {
				searchHits.forEach((hit) => hit.classList.remove("jv-search-hit-current"));
				if (!searchHits.length || index < 0 || index >= searchHits.length) return;

				const hit = searchHits[index];
				expandParents(hit);
				hit.classList.add("jv-search-hit-current");
				hit.scrollIntoView({ block: "center", inline: "nearest" });
				status.textContent = `${index + 1} of ${searchHits.length}`;
			};

			const applySearch = () => {
				const query = searchInput.value.trim();
				clearSearchHighlights();

				if (!query) {
					status.textContent = "";
					return;
				}

				const walker = document.createTreeWalker(
					container,
					NodeFilter.SHOW_TEXT,
					{
						acceptNode(node) {
							if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
							const parentEl = node.parentElement;
							if (!parentEl) return NodeFilter.FILTER_REJECT;
							if (parentEl.closest(".jv-html-preview")) return NodeFilter.FILTER_REJECT;
							return NodeFilter.FILTER_ACCEPT;
						}
					}
				);

				const textNodes = [];
				let node;
				while ((node = walker.nextNode())) textNodes.push(node);

				textNodes.forEach((textNode) => highlightInTextNode(textNode, query));

				searchHits = Array.from(container.querySelectorAll(".jv-search-hit"));
				searchHits.forEach((hit) => expandParents(hit));

				if (searchHits.length) {
					currentHitIndex = 0;
					focusHit(currentHitIndex);
					status.textContent = `${searchHits.length} match${searchHits.length === 1 ? "" : "es"}`;
				} else {
					currentHitIndex = -1;
					status.textContent = "No matches";
				}
			};

			container.innerHTML = "";
			container.appendChild(renderNode(null, data, 0, true));

			const allNodes = () => Array.from(container.querySelectorAll(".jv-node"));

			overlay.querySelector("#__jv_expand_all__").addEventListener("click", () => {
				allNodes().forEach((node) => {
					node.classList.remove("jv-collapsed");
					const toggle = node.querySelector(":scope > .jv-line > .jv-toggle");
					const summary = node.querySelector(":scope > .jv-line > .jv-summary");
					if (toggle && !toggle.classList.contains("empty")) toggle.textContent = "▾";
					if (summary) summary.classList.add("jv-hidden");
				});
			});

			overlay.querySelector("#__jv_collapse_all__").addEventListener("click", () => {
				allNodes().forEach((node, idx) => {
					if (idx === 0) return;
					const children = node.querySelector(":scope > .jv-children");
					const toggle = node.querySelector(":scope > .jv-line > .jv-toggle");
					const summary = node.querySelector(":scope > .jv-line > .jv-summary");
					if (children && toggle && !toggle.classList.contains("empty")) {
						node.classList.add("jv-collapsed");
						toggle.textContent = "▸";
						if (summary) summary.classList.remove("jv-hidden");
					}
				});
				if (searchInput.value.trim()) applySearch();
			});

			overlay.querySelector("#__jv_copy__").addEventListener("click", async () => {
				try {
					await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
					status.textContent = "Copied formatted JSON";
					setTimeout(() => {
						if (status.textContent === "Copied formatted JSON") status.textContent = "";
					}, 1500);
				} catch {
					status.textContent = "Copy failed";
					setTimeout(() => {
						if (status.textContent === "Copy failed") status.textContent = "";
					}, 1500);
				}
			});

			findButton.addEventListener("click", () => {
				searchInput.focus();
				searchInput.select();
			});

			searchInput.addEventListener("input", applySearch);

			searchInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					if (!searchHits.length) {
						applySearch();
					} else {
						currentHitIndex = (currentHitIndex + (e.shiftKey ? -1 : 1) + searchHits.length) % searchHits.length;
						focusHit(currentHitIndex);
					}
				}
			});

			nextButton.addEventListener("click", () => {
				if (!searchHits.length) applySearch();
				if (!searchHits.length) return;
				currentHitIndex = (currentHitIndex + 1) % searchHits.length;
				focusHit(currentHitIndex);
			});

			prevButton.addEventListener("click", () => {
				if (!searchHits.length) applySearch();
				if (!searchHits.length) return;
				currentHitIndex = (currentHitIndex - 1 + searchHits.length) % searchHits.length;
				focusHit(currentHitIndex);
			});

			const closeViewer = () => {
				restorePageScroll();
				overlay.remove();
				document.removeEventListener("keydown", escHandler, true);
			};

			overlay.querySelector("#__jv_close__").addEventListener("click", closeViewer);

			const escHandler = (e) => {
				if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
					e.preventDefault();
					searchInput.focus();
					searchInput.select();
					return;
				}
				if (e.key === "Escape") {
					closeViewer();
				}
			};
			document.addEventListener("keydown", escHandler, true);

			status.textContent = "Viewer loaded";
			setTimeout(() => {
				if (status.textContent === "Viewer loaded") status.textContent = "";
			}, 1200);
		} catch (e) {
			console.error("JSON viewer failed:", e);
			alert("Could not parse valid JSON from this page.");
		}
	}
	
	// ==========================================
	// UI GENERATION & LOGIC
	// ==========================================
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
		#${PALETTE_ID} {
	position: fixed;
	right: 14px;
	bottom: 14px;
	width: 320px;
	max-height: calc(100vh - 28px);
	z-index: 2147483647;
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
		#${PALETTE_ID} .tp-list {
	padding: 8px;
	overflow-y: auto;
	flex: 1 1 auto;
	min-height: 0;
}
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
					<div class="tp-title">Catalogue & SC Tool Kit</div>
					<div>NOTE: This toolkit will not work on our sites due to strict privacy policies</div>
					<div>Draggable • Esc to close</div>
				</div>
				<button class="tp-close" title="Close">×</button>
			</div>

			<div class="tp-list">
				<!-- Tool 1: Relationship Option Bulk Update -->
				<div class="tp-item active" data-i="0">
					<div class="tp-left">
						<div class="tp-num">1</div>
						<div>
							<div class="tp-name">Relationship Option Bulk Update</div>
							<div class="tp-desc">Paste from Excel to update Relationship options</div>
						</div>
					</div>
					<div class="tp-status" data-s="bulk">RUN</div>
				</div>

				<!-- Tool 2: Matrix Image Re-order -->
				<div class="tp-item" data-i="1">
					<div class="tp-left">
						<div class="tp-num">2</div>
						<div>
							<div class="tp-name">Matrix Image Tools</div>
							<div class="tp-desc">Reorder images or free up / normalise slots</div>
						</div>
					</div>
					<div class="tp-status" data-s="reorder">OFF</div>
				</div>

				<!-- Tool 3: Audit History Search -->
				<div class="tp-item" data-i="2">
					<div class="tp-left">
						<div class="tp-num">3</div>
						<div>
							<div class="tp-name">Audit History Search</div>
							<div class="tp-desc">Search collapsed audit rows and navigate matches</div>
						</div>
					</div>
					<div class="tp-status" data-s="auditsearch">RUN</div>
				</div>

				<!-- Tool 4: Wrap Excel Column -->
				<div class="tp-item" data-i="3">
					<div class="tp-left">
						<div class="tp-num">4</div>
						<div>
							<div class="tp-name">Wrap for SQL "In" list</div>
							<div class="tp-desc">Type or paste from Excel to wrap in quotes and comma-separate</div>
						</div>
					</div>
					<div class="tp-status" data-s="quotewrap">RUN</div>
				</div>

				<!-- Tool 5: Inspector -->
				<div class="tp-item" data-i="4">
					<div class="tp-left">
						<div class="tp-num">5</div>
						<div>
							<div class="tp-name">Element Inspector</div>
							<div class="tp-desc">Hover to get CSS path & copy</div>
						</div>
					</div>
					<div class="tp-status" data-s="inspector">OFF</div>
				</div>
			</div>
			<div class="tp-foot">Click items to run/toggle</div>
		</div>

						<!-- Tool 6: JSON Viewer -->
				<div class="tp-item" data-i="5">
					<div class="tp-left">
						<div class="tp-num">6</div>
						<div>
							<div class="tp-name">JSON Viewer V2</div>
							<div class="tp-desc">Pretty JSON, HTML render, dates, search and expand matches</div>
						</div>
					</div>
					<div class="tp-status" data-s="jsonviewer">RUN</div>
				</div>
	`;
	document.body.appendChild(root);

	const items = [...root.querySelectorAll(".tp-item")];
	const closeBtn = root.querySelector(".tp-close");
	const head = root.querySelector(".tp-head");

	const statusReorder = root.querySelector('[data-s="reorder"]');
	const statusInspector = root.querySelector('[data-s="inspector"]');

	let idx = 0; let drag = false; let sx = 0; let sy = 0; let startL = 0; let startT = 0;

	// Update the UI labels ON/OFF based on current state
	function refreshStatus() {
		if (statusReorder) {
			const isOpen = window.__thgImageToolsOpen === true || window.__thgReorderToolOpen === true;
			statusReorder.textContent = isOpen ? "ON" : "OFF";
			statusReorder.classList.toggle("on", isOpen);
		}
		if (statusInspector) {
			statusInspector.textContent = inspectorActive ? "ON" : "OFF";
			statusInspector.classList.toggle("on", inspectorActive);
		}
	}

	function sync() { items.forEach((el, i) => { el.classList.toggle("active", i === idx); }); }

		function run(i) {
		if (i === 0) runBulkUpdateTool();
		if (i === 1) runImageReorderTool();
		if (i === 2) runAuditHistorySearchTool();
		if (i === 3) runQuoteWrapTool();
		if (i === 4) toggleInspector();
		if (i === 5) runJsonViewerTool();
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

		document.getElementById("__audit_search_panel__")?.remove();
		window.__auditSearchObserver__?.disconnect?.();
		delete window.__auditSearchObserver__;

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
