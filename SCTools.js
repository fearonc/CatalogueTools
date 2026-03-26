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
	// TOOL 1: GOD MODE (Nuke Sticky/Fixed Elements)
	// ==========================================
	function runGodMode() {
		document.querySelectorAll('*').forEach(el => {
			// Do not delete our own tool palette!
			if (el.id === PALETTE_ID || el.closest(`#${PALETTE_ID}`)) return;

			const p = window.getComputedStyle(el).position;
			if (p === 'fixed' || p === 'sticky') {
				el.remove();
			}
		});
		// Force restore scrolling
		document.body.style.setProperty('overflow', 'auto', 'important');
		document.documentElement.style.setProperty('overflow', 'auto', 'important');
		
		// Optional: Little visual feedback on the button
		const btn = document.querySelector('[data-s="godmode"]');
		if(btn) {
			const original = btn.textContent;
			btn.textContent = "DONE!";
			setTimeout(() => btn.textContent = original, 1000);
		}
	}

	// ==========================================
	// TOOL 2: ELEMENT PATH INSPECTOR
	// ==========================================
	let inspectorActive = false;
	const overlayDiv = document.createElement('div');
	const tooltipDiv = document.createElement('div');
	
	// Setup Inspector Elements
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
				selector += '#' + el.id;
				path.unshift(selector);
				break; // IDs are unique, can stop here
			} else {
				let sib = el, nth = 1;
				while (sib = sib.previousElementSibling) {
					if (sib.nodeName.toLowerCase() == selector) nth++;
				}
				if (nth != 1) selector += `:nth-of-type(${nth})`;
			}
			path.unshift(selector);
			el = el.parentNode;
		}
		return path.join(" > ");
	}

	function onInspectorHover(e) {
		if (e.target.closest(`#${PALETTE_ID}`)) {
			overlayDiv.style.display = 'none';
			tooltipDiv.style.display = 'none';
			return;
		}
		const rect = e.target.getBoundingClientRect();
		overlayDiv.style.display = 'block';
		overlayDiv.style.top = rect.top + 'px';
		overlayDiv.style.left = rect.left + 'px';
		overlayDiv.style.width = rect.width + 'px';
		overlayDiv.style.height = rect.height + 'px';

		const path = getCssPath(e.target);
		tooltipDiv.style.display = 'block';
		tooltipDiv.textContent = path;
		
		// Keep tooltip on screen
		let tTop = rect.bottom + 5;
		let tLeft = rect.left;
		if (tTop + 30 > window.innerHeight) tTop = rect.top - 30; // pop above if at bottom
		
		tooltipDiv.style.top = tTop + 'px';
		tooltipDiv.style.left = tLeft + 'px';
	}

	function onInspectorClick(e) {
		if (e.target.closest(`#${PALETTE_ID}`)) return;
		e.preventDefault();
		e.stopPropagation();

		const path = getCssPath(e.target);
		navigator.clipboard.writeText(path).catch(() => {});
		
		// Visual feedback
		tooltipDiv.textContent = "Copied to clipboard!";
		tooltipDiv.style.background = "#059669"; // Green
		
		setTimeout(() => {
			tooltipDiv.style.background = "#111827"; // Reset
			toggleInspector(); // Turn off inspector after selection
			refreshStatus();
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
			overlayDiv.style.display = 'none';
			tooltipDiv.style.display = 'none';
		}
	}

	// ==========================================
	// TOOL 3: PASSWORD REVEALER
	// ==========================================
	function togglePasswords() {
		const inputs = Array.from(document.querySelectorAll('input'));
		const revealed = inputs.filter(i => i.dataset.tpRevealed === 'true');
		
		if (revealed.length > 0) {
			// Turn them back to passwords
			revealed.forEach(i => {
				i.type = 'password';
				delete i.dataset.tpRevealed;
			});
		} else {
			// Find actual passwords and reveal them
			const passwords = inputs.filter(i => i.type === 'password');
			passwords.forEach(i => {
				i.type = 'text';
				i.dataset.tpRevealed = 'true';
			});
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
				<!-- Tool 1: God Mode -->
				<div class="tp-item active" data-i="0">
					<div class="tp-left">
						<div class="tp-num">1</div>
						<div>
							<div class="tp-name">God Mode (Readability)</div>
							<div class="tp-desc">Nukes sticky headers & modals</div>
						</div>
					</div>
					<div class="tp-status" data-s="godmode">RUN</div>
				</div>

				<!-- Tool 2: Inspector -->
				<div class="tp-item" data-i="1">
					<div class="tp-left">
						<div class="tp-num">2</div>
						<div>
							<div class="tp-name">Element Inspector</div>
							<div class="tp-desc">Hover to get CSS path & copy</div>
						</div>
					</div>
					<div class="tp-status" data-s="inspector">OFF</div>
				</div>

				<!-- Tool 3: Password Revealer -->
				<div class="tp-item" data-i="2">
					<div class="tp-left">
						<div class="tp-num">3</div>
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

	const statusInspector = root.querySelector('[data-s="inspector"]');
	const statusPasswords = root.querySelector('[data-s="passwords"]');

	let idx = 0;
	let drag = false; let sx = 0; let sy = 0; let startL = 0; let startT = 0;

	// Update the UI labels ON/OFF based on current state
	function refreshStatus() {
		// Inspector Status
		if (statusInspector) {
			statusInspector.textContent = inspectorActive ? "ON" : "OFF";
			statusInspector.classList.toggle("on", inspectorActive);
		}
		// Password Status
		if (statusPasswords) {
			const hasRevealed = document.querySelector('input[data-tp-revealed="true"]');
			statusPasswords.textContent = hasRevealed ? "ON" : "OFF";
			statusPasswords.classList.toggle("on", !!hasRevealed);
		}
	}

	function sync() {
		items.forEach((el, i) => {
			el.classList.toggle("active", i === idx);
		});
	}

	function run(i) {
		if (i === 0) runGodMode();
		if (i === 1) toggleInspector();
		if (i === 2) togglePasswords();
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
		drag = true;
		const r = root.getBoundingClientRect();
		root.style.left = r.left + "px"; root.style.top = r.top + "px";
		root.style.right = "auto"; root.style.bottom = "auto";
		sx = e.clientX; sy = e.clientY; startL = r.left; startT = r.top;
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
		root.style.left = left + "px"; root.style.top = top + "px";
	}

	function onDragEnd() { drag = false; }

	// Complete teardown and memory cleanup
	function cleanup() {
		window.removeEventListener("keydown", onKey, true);
		window.removeEventListener("mousemove", onDragMove, true);
		window.removeEventListener("mouseup", onDragEnd, true);
		
		// Cleanup Inspector events/DOM if active
		document.removeEventListener('mouseover', onInspectorHover, { capture: true });
		document.removeEventListener('click', onInspectorClick, { capture: true });
		overlayDiv.remove();
		tooltipDiv.remove();

		// Cleanup password state (revert to dots)
		const revealed = document.querySelectorAll('input[data-tp-revealed="true"]');
		revealed.forEach(i => { i.type = 'password'; delete i.dataset.tpRevealed; });

		root.remove();
		style.remove();
		delete window.__toolPaletteCleanup__;
		delete window.__toolPanelBooted__;
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
