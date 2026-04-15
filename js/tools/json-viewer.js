(() => {
  const CT = (window.CatalogueTools = window.CatalogueTools || {
    loaded: {},
    tools: {},
    utils: {},
    state: {}
  });

  if (CT.loaded.jsonViewer) return;

  CT.tools.runJsonViewerTool = function () {
    try {
      const existing = document.getElementById("__json_viewer_overlay__");
      if (existing) {
        CT.state.jsonViewerOpen = false;
        CT.tools.refreshStatus?.();
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

      CT.state.jsonViewerOpen = true;
      CT.tools.refreshStatus?.();

      const overlay = document.createElement("div");
      overlay.id = "__json_viewer_overlay__";

      overlay.innerHTML = `
        <style>
          #__json_viewer_overlay__ {
            position: fixed;
            inset: 0;
            background: #111827;
            color: #e5e7eb;
            z-index: 2147483646;
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
          /date/i.test(String(key));

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
            currentHitIndex =
              (currentHitIndex + (e.shiftKey ? -1 : 1) + searchHits.length) % searchHits.length;
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
        CT.state.jsonViewerOpen = false;
        CT.tools.refreshStatus?.();
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
      CT.state.jsonViewerOpen = false;
      CT.tools.refreshStatus?.();
      console.error("JSON viewer failed:", e);
      alert("Could not parse valid JSON from this page.");
    }
  };

  CT.loaded.jsonViewer = true;
})();
