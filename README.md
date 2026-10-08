Create a bookmark/favourite in your browser.

Add the below in the URL field:

javascript:(()=>{const u='https://fearonc.github.io/CatalogueTools/js/bootstrap.js';const id='__toolpanel_loader__';document.getElementById(id)?.remove();const s=document.createElement(%27script%27);s.id=id;s.src=u+%27?v=%27+(Date.now());s.onerror=()=>alert(%27Could not load bootstrap.js%27);document.documentElement.appendChild(s)})();

## Adding a new tool to the toolkit

> You don't need to be a developer to do this. If you have the JavaScript for a new tool (for example, written by an AI), follow the steps below in order. Allow about 15 minutes.

### The short version

Adding a tool means touching **three files**:

| # | File | What you do |
|---|------|-------------|
| 1 | `js/tools/your-tool.js` | Save the tool's JavaScript here (a new file) |
| 2 | `js/bootstrap.js` | Add **1 line** so the tool gets loaded |
| 3 | `js/ui.js` | Add **5 small pieces** so the tool appears in the menu and its RUN/ON badge works |

The tool's JavaScript must also follow a few house rules (names, open/close flags). **Step 2 gives you an AI prompt that checks and fixes this for you, and writes the exact text to paste into `bootstrap.js` and `ui.js`.** That is the easiest route.

---

### Before you start

You need:
- The JavaScript code for the new tool.
- A GitHub account with permission to edit this repo.
- A browser tab with the page the tool is for, so you can test it afterwards.

**Tip:** if you can, test the tool first by pasting its code into the browser console (press `F12`, click **Console**, paste, press Enter). If it works there, it will work in the toolkit once these steps are done.

---

### Step 1 – Save the tool file

1. In the repo, open the `js` folder, then the `tools` folder.
2. Click **Add file → Create new file**.
3. Name it using lowercase words joined with dashes, ending in `.js`. For example: `table-filter.js`.
4. Paste in the tool's code.
5. Click **Commit changes**.

> Remember the file name exactly. It is case-sensitive: `Table-Filter.js` and `table-filter.js` are different files.

---

### Step 2 – Use the AI prompt to check the tool and get your snippets

Every tool has to follow some house rules so the menu can find it and show whether it's running. Rather than checking these by hand, give your tool's code to an AI (Claude, ChatGPT, etc.) with the prompt below.

**First, find your "last number":**
1. Open `js/ui.js` in the repo.
2. Press `Ctrl+F` (or `Cmd+F` on Mac) and search for `data-i=`.
3. Jump to the **last** result. Note the number in quotes. For example, `data-i="8"` means your last number is **8**.

**Then copy this whole prompt**, replace `LAST_NUMBER_HERE` with that number, and paste your tool's code at the very bottom:

````
I'm adding a new tool to a browser toolkit (a bookmarklet that loads JavaScript files from GitHub). Below is the JavaScript for my new tool. Please do ALL of the parts below.

The highest existing menu number in ui.js is: LAST_NUMBER_HERE

=== PART 1: Check and fix the tool ===
Every tool file in this toolkit must follow these rules. Check my code against each rule, fix anything that doesn't comply, and otherwise leave what the tool does unchanged.

Choose a short camelCase name for the tool (e.g. "tableFilter") and use it consistently. Call it NAME below.

1. The whole file is wrapped in (() => { ... })();
2. It starts with exactly this setup:
   const CT = (window.CatalogueTools = window.CatalogueTools || { loaded: {}, tools: {}, utils: {}, state: {} });
3. Straight after that is this guard:
   if (CT.loaded.NAME) return;
   and the last line inside the wrapper is:
   CT.loaded.NAME = true;
4. The tool is registered like this (the function name is "run" + NAME with first letter capitalised + "Tool"):
   CT.tools.runNAMETool = function () { ... };
   It must NOT run automatically when the file loads. It only runs when that function is called.
5. Inside that function there is this helper:
   const setToolOpen = (isOpen) => {
     CT.state.NAMEOpen = !!isOpen;
     CT.tools.refreshStatus?.();
   };
   setToolOpen(true) must be called when the tool opens. setToolOpen(false) must be called EVERY way the tool can close: Close button, Cancel button, Esc key, finishing the job, and any clean-up.
6. If the tool needs a pop-up window, use the shared helper rather than building one from scratch:
   const { makeModal } = CT.utils;
   const modal = makeModal({ title, width, bodyHTML, footerHTML, onClose });
   (modal.qs("selector") finds things inside it, and modal.close() closes it.)
   If the tool builds its own panel instead, that's fine, as long as rule 5 is followed.
7. Anything the tool adds to the page (panels, styles, buttons) uses a unique ID and is fully removed when the tool closes.
8. If the tool CHANGES the page's table (hides rows, re-orders rows, edits values), it must also store a function that undoes everything, and clear it when it closes:
   CT.state.NAMECleanup = function () { ...undo and remove everything... };
   (and set CT.state.NAMECleanup = null when closed). If it doesn't touch the table, skip this rule.

=== PART 2: Names sheet ===
Give me a small table with these items, using the actual values for my tool:
- Menu name (short, shown in the toolkit menu)
- Menu description (one short line)
- File name (lowercase-with-dashes.js)
- NAME
- Run function (CT.tools.runNAMETool)
- State flag (CT.state.NAMEOpen)
- Status key (just NAME)

=== PART 3: Line for bootstrap.js ===
Give me the single line to add to the "files" list in bootstrap.js, in this format (with the trailing comma):
  "tools/FILE-NAME.js",

=== PART 4: Pieces for ui.js ===
Give me these 5 pieces, filled in for my tool, ready to copy and paste. Use data-i = (highest existing number + 1) and show number = (highest existing number + 2).

(a) Menu item:
<div class="tp-item" data-i="NEW_I">
  <div class="tp-left">
    <div class="tp-num">NEW_SHOWN_NUMBER</div>
    <div>
      <div class="tp-name">MENU NAME</div>
      <div class="tp-desc">MENU DESCRIPTION</div>
    </div>
  </div>
  <div class="tp-status" data-s="NAME">RUN</div>
</div>

(b) State line:
CT.state.NAMEOpen = false;

(c) Status element line:
const statusNAME = root.querySelector('[data-s="NAME"]');

(d) Badge line:
set(statusNAME, CT.state.NAMEOpen === true);

(e) Run handler:
if (i === NEW_I) {
  CT.tools.runNAMETool?.();
}

=== PART 5: Output ===
Return, in this order:
1. A short list of anything you changed or anything in my code I should double-check.
2. The complete corrected tool file.
3. The names sheet.
4. The bootstrap.js line.
5. The five ui.js pieces (a) to (e).

=== MY TOOL'S CODE (paste below this line) ===

````

When the AI replies:
1. Go back to your file in `js/tools/`, click the **pencil icon** (Edit), replace everything with the **complete corrected tool file** from the AI, and click **Commit changes**.
2. Keep the AI's reply open. You'll copy from it in the next two steps.

---

### Step 3 – Edit `js/bootstrap.js` (1 line)

1. Open `js/bootstrap.js` and click the **pencil icon** (Edit).
2. Find the list that starts with `const files = [`.
3. Add your line **just above** `"ui.js"`. Do not put it after `"ui.js"`, and keep `"utils.js"` at the top.

```js
const files = [
  "utils.js",
  "tools/dark-overlay.js",
  ...
  "tools/json-viewer.js",
  "tools/your-tool.js",      // <-- your new line goes here
  "ui.js"
];
```

Don't forget the **comma at the end of your line**. Quotes must be straight quotes (`"`), not curly ones.

Don't commit yet. Do Step 4 first, then commit both files.

---

### Step 4 – Edit `js/ui.js` (5 pieces)

Open `js/ui.js` and click the **pencil icon** (Edit). Use `Ctrl+F` (or `Cmd+F`) to find each spot below. Paste the matching piece from the AI's reply (Part 4, items a to e).

#### (a) The menu item

1. Search for `tp-toggles`.
2. Just above it you'll see two lines containing `</div>`:

```html
        </div>        <-- ends the LAST menu item
      </div>          <-- ends the whole menu list
      <div class="tp-toggles">   <-- the thing you searched for
```

3. Paste the **menu item** between those two `</div>` lines. That is, **after** the first one, **before** the second.

#### (b) The state line

1. Search for `CT.state.bulkUpdateOpen = false;`
2. Paste your **state line** on the line directly below it.

#### (c) The status element line

1. Search for `function refreshStatus()`
2. Paste your **status element line** on a blank line directly **above** it.

#### (d) The badge line

1. Search for `CT.tools.refreshStatus = refreshStatus;`
2. Just above it you'll see a `}` on its own line. That closes the `refreshStatus` function.
3. Paste your **badge line** just **before** that `}`, with the other `set(` lines:

```js
    set(
      statusJsonViewer,
      CT.state.jsonViewerOpen === true
    );

    set(statusYourTool, CT.state.yourToolOpen === true);   // <-- your line goes here
  }                                                        // <-- the closing brace

  CT.tools.refreshStatus = refreshStatus;                  // <-- what you searched for
```

#### (e) The run handler

1. Search for `function run(i)`
2. Scroll down a little. You'll see a series of blocks that look like `if (i === 7) { ... }`.
3. Paste your **run handler** after the **last** one, and **before** the line that says `refreshStatus();`:

```js
    if (i === 7) {
      CT.tools.runJsonViewerTool?.();
    }

    if (i === 8) {                       // <-- your block goes here
      CT.tools.runYourTool?.();
    }

    refreshStatus();                     // <-- stays below your block
```

#### Finish

Click **Commit changes** once you've done all of Steps 3 and 4.

---

### Step 5 – Test it

1. Wait **1 to 2 minutes**. GitHub Pages takes a moment to publish changes.
2. Go to the page the tool is for and refresh it (`Ctrl+Shift+R` for a hard refresh).
3. Click the toolkit bookmark. Your tool should be at the bottom of the menu.
4. Click it. It should open, and its badge should change from **RUN** to **ON**. When you close it, the badge should go back to **RUN**.

---

### If something goes wrong

| What you see | Most likely cause |
|---|---|
| The toolkit doesn't open at all, or shows nothing | A typo in `ui.js` (missing bracket, missing quote). **Fix:** open the file's **History** on GitHub and revert to the last working version, then redo Step 4 more carefully |
| An alert says "Failed to load tools/…" | The file name in `bootstrap.js` doesn't exactly match the file in `js/tools/` (check capitals and dashes) |
| Menu item appears but clicking does nothing | The number in `if (i === N)` (piece e) doesn't match the `data-i="N"` in the menu item (piece a), or the run function name doesn't match the one in the tool file |
| Tool works, but the badge always says RUN | The state flag (piece b and d) doesn't exactly match the name in the tool file (`CT.state.NAMEOpen`), or the tool never calls `setToolOpen(true)` |
| Badge stays ON after closing | The tool isn't calling `setToolOpen(false)` on every way of closing |
| Tool changes the table and rows stay hidden/out of order after closing | The tool is missing its clean-up function (Rule 8). Re-run the AI prompt in Step 2 |

If you're stuck, take the tool file, the bootstrap line and the ui.js pieces back to the AI, describe what you see from the table above, and ask it to find the mismatch.

---

### Worked example: the Table Filter tool

For reference, here are the values used when "Table Filter & Sort" was added.

| Item | Value |
|---|---|
| File | `js/tools/table-filter.js` |
| NAME | `tableFilter` |
| Menu name | Table Filter & Sort |
| Menu description | Filter and sort the table by column |
| Run function | `CT.tools.runTableFilterTool` |
| State flag | `CT.state.tableFilterOpen` |
| Status key | `tableFilter` |
| `data-i` | `8` (shown as number `9`) |

`bootstrap.js` line:
```js
  "tools/table-filter.js",
```

`ui.js` pieces:
```html
<div class="tp-item" data-i="8">
  <div class="tp-left">
    <div class="tp-num">9</div>
    <div>
      <div class="tp-name">Table Filter & Sort</div>
      <div class="tp-desc">Filter and sort the table by column</div>
    </div>
  </div>
  <div class="tp-status" data-s="tableFilter">RUN</div>
</div>
```
```js
CT.state.tableFilterOpen = false;

const statusTableFilter = root.querySelector('[data-s="tableFilter"]');

set(statusTableFilter, CT.state.tableFilterOpen === true);

if (i === 8) {
  CT.tools.runTableFilterTool?.();
}
```
