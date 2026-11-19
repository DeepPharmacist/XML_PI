import { EFFECT_GROUPS } from "./effects.js";
import { ITEM_MASTER, itemKey } from "./item-master.js";
import { PackageInsert, h } from "./render.js";

const MAX_ITEMS = 5;
const PMDA = "https://www.pmda.go.jp/PmdaSearch/iyakuDetail";
const STORE_KEY = "xmlpi.selected";
const OPEN_KEY = "xmlpi.open";

const $ = (sel) => document.querySelector(sel);

const state = {
  selected: loadSelected(),  // [{docId, brand, generic, company, updated}]
  lastQuery: null,
  docs: [],                  // 比較中の PackageInsert
  open: loadOpen(),          // 開いている見出し（既定はすべて折りたたみ）
};

// ------------------------------------------------------------ 保存（この端末のブラウザのみ）

function loadSelected() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
  } catch { return []; }
}

function saveSelected() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.selected)); } catch { /* 保存できなくても動作する */ }
}

async function api(path) {
  const res = await fetch(path);
  let body;
  try { body = await res.json(); } catch { throw new Error(`サーバーの応答を読めません（HTTP ${res.status}）`); }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ------------------------------------------------------------ ステップ 1: 検索・選択

function buildEffectSelect() {
  const sel = $("#effect");
  for (const g of EFFECT_GROUPS) {
    const og = h("optgroup");
    og.label = `${g.code} ${g.name}`;
    const all = h("option", null, `${g.code} ${g.name}（すべて）`);
    all.value = g.code;
    og.append(all);
    for (const it of g.items) {
      const o = h("option", null, `${it.code} ${it.name}`);
      o.value = it.code;
      og.append(o);
    }
    sel.append(og);
  }
}

async function runSearch(page = 1) {
  const q = $("#q").value.trim();
  const effect = $("#effect").value;
  const status = $("#search-status");
  if (!q && !effect) {
    status.textContent = "名称か薬効分類を指定してください。";
    return;
  }
  const params = new URLSearchParams({ q, effect, target: $("#target").value, match: $("#match").value, page });
  state.lastQuery = params;
  status.textContent = "PMDA を検索しています…";
  $("#search-btn").disabled = true;
  try {
    const res = await api(`/api/search?${params}`);
    renderResults(res);
    status.textContent = "";
  } catch (e) {
    status.textContent = `検索に失敗しました: ${e.message}`;
  } finally {
    $("#search-btn").disabled = false;
  }
}

function renderResults(res) {
  const box = $("#results");
  box.replaceChildren();
  const withXml = res.items.filter((i) => i.docId);
  const hidden = res.items.length - withXml.length;
  const summary = h("p", "result-summary",
    `${res.total} 件中 ${res.page}/${Math.max(res.pages, 1)} ページ目` +
    (hidden ? `（XML のない ${hidden} 件は表示していません）` : ""));
  box.append(summary);
  if (!withXml.length) {
    box.append(h("p", "muted", "XML 添付文書のある品目は見つかりませんでした。"));
    return;
  }
  const table = h("table", "result-table");
  const head = h("tr");
  for (const t of ["", "販売名", "一般名", "製造販売業者等", "更新日"]) head.append(h("th", null, t));
  const thead = h("thead");
  thead.append(head);
  table.append(thead);
  const tbody = h("tbody");
  for (const item of withXml) {
    const tr = h("tr");
    const picked = state.selected.some((s) => s.docId === item.docId);
    const btn = h("button", "add-btn", picked ? "選択済" : "追加");
    btn.disabled = picked || state.selected.length >= MAX_ITEMS;
    btn.dataset.docId = item.docId;
    btn.addEventListener("click", () => addItem(item));
    const td0 = h("td");
    td0.append(btn);
    tr.append(td0,
      h("td", "brand", item.brands.join(" / ")),
      h("td", null, item.generic),
      h("td", "company", item.companies.join(" / ")),
      h("td", "date", item.updated || ""));
    tbody.append(tr);
  }
  table.append(tbody);
  const scroll = h("div", "table-scroll");
  scroll.append(table);
  box.append(scroll);

  if (res.pages > 1) {
    const pager = h("div", "pager");
    const prev = h("button", null, "← 前の 100 件");
    prev.disabled = res.page <= 1;
    prev.addEventListener("click", () => runSearch(res.page - 1));
    const next = h("button", null, "次の 100 件 →");
    next.disabled = res.page >= res.pages;
    next.addEventListener("click", () => runSearch(res.page + 1));
    pager.append(prev, next);
    box.append(pager);
  }
}

function refreshAddButtons() {
  for (const btn of document.querySelectorAll(".add-btn")) {
    const picked = state.selected.some((s) => s.docId === btn.dataset.docId);
    btn.textContent = picked ? "選択済" : "追加";
    btn.disabled = picked || state.selected.length >= MAX_ITEMS;
  }
}

function addItem(item) {
  if (state.selected.length >= MAX_ITEMS || state.selected.some((s) => s.docId === item.docId)) return;
  state.selected.push({
    docId: item.docId,
    brand: item.brands.join(" / "),
    generic: item.generic,
    company: item.companies.join(" / "),
    updated: item.updated,
  });
  saveSelected();
  renderTray();
}

function removeItem(docId) {
  state.selected = state.selected.filter((s) => s.docId !== docId);
  saveSelected();
  renderTray();
}

function renderTray() {
  const list = $("#tray-list");
  list.replaceChildren();
  for (const s of state.selected) {
    const chip = h("li", "chip");
    chip.append(h("span", "chip-name", s.brand));
    const x = h("button", "chip-x", "×");
    x.title = "選択を外す";
    x.setAttribute("aria-label", `${s.brand} を外す`);
    x.addEventListener("click", () => removeItem(s.docId));
    chip.append(x);
    list.append(chip);
  }
  $("#tray-count").textContent = `${state.selected.length} / ${MAX_ITEMS}`;
  $("#compare-btn").disabled = state.selected.length === 0;
  $("#tray").classList.toggle("empty", state.selected.length === 0);
  refreshAddButtons();
}

// ------------------------------------------------------------ ステップ 2: XML 取得

async function loadDocs(ids) {
  const progress = $("#progress");
  progress.replaceChildren();
  const lines = ids.map((id) => {
    const sel = state.selected.find((s) => s.docId === id);
    const li = h("li", null, `${sel ? sel.brand : id} … 待機中`);
    progress.append(li);
    return li;
  });
  const docs = [];
  // PMDA への負荷を抑えるため 1 品目ずつ順に取得する（サーバー側でも間隔を空けている）
  for (const [i, id] of ids.entries()) {
    const sel = state.selected.find((s) => s.docId === id);
    const name = sel ? sel.brand : id;
    lines[i].textContent = `${name} … 取得中`;
    try {
      const res = await api(`/api/doc/${encodeURIComponent(id)}`);
      const pi = new PackageInsert(res.xml, res.docId, `/api/doc/${encodeURIComponent(res.docId)}/fig`);
      pi.meta = sel || { docId: res.docId, brand: pi.brandNames.join(" / ") };
      if (res.docId !== id) {
        pi.updatedFrom = id;
        if (sel) { sel.docId = res.docId; saveSelected(); }
      }
      docs.push(pi);
      lines[i].textContent = `${name} … 完了${pi.updatedFrom ? "（新しい版に更新）" : ""}`;
    } catch (e) {
      lines[i].textContent = `${name} … 失敗: ${e.message}`;
      lines[i].className = "error";
    }
  }
  return docs;
}

// ------------------------------------------------------------ ステップ 3: 並列表示

// 各文書の項目キーを、出現順を保ったまま 1 本の並びにまとめる
function mergeKeys(lists) {
  const out = [];
  for (const keys of lists) {
    let prev = -1;
    for (const k of keys) {
      const at = out.indexOf(k);
      if (at === -1) { out.splice(prev + 1, 0, k); prev += 1; } else { prev = at; }
    }
  }
  return out;
}

function renderCompare(docs) {
  const grid = $("#grid");
  grid.replaceChildren();
  grid.style.setProperty("--cols", docs.length);
  const nav = $("#jump");
  nav.replaceChildren(h("option", null, "項目へ移動…"));
  nav.firstChild.value = "";

  // 見出し行（スクロールしても上に固定）
  grid.append(h("div", "cell corner sticky-top sticky-left", "項目"));
  for (const d of docs) {
    const c = h("div", "cell col-head sticky-top");
    c.append(h("div", "col-brand", d.brandNames.join(" / ") || d.meta.brand));
    c.append(h("div", "col-company", d.meta.company || ""));
    c.append(h("div", "col-rev", `改訂: ${d.revision || "不明"}`));
    if (d.updatedFrom) c.append(h("div", "col-note", "選択時より新しい版を表示しています"));
    const links = h("div", "col-links");
    const pdf = h("a", null, "PDF");
    pdf.href = `${PMDA}/ResultDataSetPDF/${d.docId}`;
    const web = h("a", null, "PMDA");
    web.href = `${PMDA}/${d.docId}`;
    for (const a of [pdf, web]) { a.target = "_blank"; a.rel = "noopener"; }
    const rm = h("button", "col-remove", "外す");
    rm.addEventListener("click", () => {
      removeItem(d.docId);
      state.docs = state.docs.filter((x) => x !== d);
      if (state.docs.length) renderCompare(state.docs); else showSelect();
    });
    links.append(pdf, web, rm);
    c.append(links);
    grid.append(c);
  }

  // 行の順序と番号・名称は項目マスタに従う。マスタにない要素は、XML 上の出現位置に挿入する。
  const secMaps = docs.map((d) => d.sections());
  const masterKeys = ITEM_MASTER.map(itemKey);
  const showAll = $("#show-all").checked;
  const rows = [];
  for (const key of mergeKeys([masterKeys, ...secMaps.map((m) => [...m.keys()])])) {
    const master = ITEM_MASTER[masterKeys.indexOf(key)];
    if (master?.header) {
      rows.push({ key, no: master.no, name: master.name, top: key, level: 1,
        render: (d) => d.renderHeaderItem(master.tag) });
      continue;
    }
    const found = secMaps.find((m) => m.has(key));
    if (!found && !showAll) continue;
    const [no, name] = master ? [master.no, master.name] : found.get(key).label;
    rows.push({
      key, no, name,
      top: key.split("/")[0],
      level: key.includes("/") ? 2 : 1,
      render: (d, i) => (secMaps[i].has(key) ? d.renderSection(secMaps[i].get(key)) : null),
    });
  }

  // 1 周目: 各品目の内容を描画し、記載の有無を調べる
  for (const row of rows) {
    row.cells = docs.map((d, i) => {
      const c = h("div", `cell body${row.level === 2 ? " sub" : ""}`);
      const content = row.render(d, i);
      if (content && (content.nodeType === Node.TEXT_NODE ? content.data.trim() : content.childNodes.length)) {
        c.append(content);
      } else {
        c.classList.add("none");
        c.append(h("span", "muted", "（記載なし）"));
      }
      return c;
    });
    row.filled = row.cells.map((c) => !c.classList.contains("none"));
    const texts = row.cells.map((c) => c.textContent.replace(/\s+/g, ""));
    row.same = docs.length > 1 && row.filled.some(Boolean) && texts.every((t) => t === texts[0]);
  }
  for (const row of rows) {
    row.children = rows.filter((r) => r.level === 2 && r.top === row.key);
    // 親項目の記載の有無は、小項目も含めて数える
    row.filledAny = docs.map((_, i) => row.filled[i] || row.children.some((c) => c.filled[i]));
  }

  // 2 周目: 見出し行と内容行を並べる
  for (const row of rows) {
    const id = `row-${row.key.replace(/\W/g, "_")}`;
    const head = h("div", `cell sec-head level${row.level}`);
    head.id = id;
    head.dataset.top = row.top;
    head.dataset.key = row.key;
    head.dataset.level = row.level;
    const btn = h("button", "sec-toggle");
    btn.append(h("span", "chevron"), h("span", "row-num", row.no), h("span", "row-name", row.name));
    const n = (row.level === 1 ? row.filledAny : row.filled).filter(Boolean).length;
    btn.append(h("span", "badge", n === 0 ? "記載なし" : `${n}/${docs.length} 品目に記載`));
    if (row.same) btn.append(h("span", "badge same-badge", "全品目同じ"));
    btn.addEventListener("click", () => toggleOpen(row.key));
    head.append(btn);
    if (row.level === 1 && row.children.length) {
      const all = h("button", "open-children", "小項目をすべて開く");
      all.addEventListener("click", () => {
        state.open.add(row.key);
        for (const c of row.children) state.open.add(c.key);
        applyOpen();
      });
      head.append(all);
    }
    grid.append(head);

    // 小項目を持つ親項目で、親自体の記載がどの品目にもなければ内容行は作らない
    if (row.children.length && !row.filled.some(Boolean)) continue;
    const label = h("div", `cell row-label sticky-left${row.level === 2 ? " sub" : ""}`);
    label.append(h("span", "row-num", row.no), h("span", "row-name", row.name));
    const group = [label, ...row.cells];
    for (const el of group) {
      el.dataset.top = row.top;
      el.dataset.key = row.key;
      el.dataset.level = row.level;
      el.classList.add("content");
      if (row.same) el.classList.add("same");
    }
    grid.append(...group);
  }

  // 項目へ移動（見出しの一覧）
  for (const row of rows) {
    const o = h("option", null, `${row.level === 2 ? "　" : ""}${row.no} ${row.name}`);
    o.value = row.key;
    nav.append(o);
  }
  applyHideSame();
  applyOpen();
  const head = grid.querySelector(".col-head");
  if (head) grid.style.setProperty("--head-h", `${head.offsetHeight}px`);
}

function applyHideSame() {
  $("#grid").classList.toggle("hide-same", $("#hide-same").checked);
}

// 開いている見出しのキー（大項目は要素名、小項目は「親/子」）。この端末のブラウザに保存する
function loadOpen() {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch { return new Set(); }
}

function saveOpen() {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...state.open])); } catch { /* 保存できなくても動作する */ }
}

function toggleOpen(key) {
  if (state.open.has(key)) state.open.delete(key); else state.open.add(key);
  applyOpen();
}

// 見出しの開閉状態を表示に反映する
//   大項目の見出し: 常に表示 / 小項目の見出し: 大項目が開いていれば表示
//   内容行: 自分の見出しと（小項目なら）大項目の両方が開いていれば表示
function applyOpen() {
  saveOpen();
  for (const el of document.querySelectorAll("#grid [data-key]")) {
    const topOpen = state.open.has(el.dataset.top);
    const selfOpen = state.open.has(el.dataset.key);
    const isHead = el.classList.contains("sec-head");
    const sub = el.dataset.level === "2";
    let visible;
    if (isHead) visible = !sub || topOpen;
    else visible = topOpen && (!sub || selfOpen);
    el.classList.toggle("folded", !visible);
    if (isHead) {
      el.classList.toggle("open", selfOpen);
      el.querySelector(".sec-toggle").setAttribute("aria-expanded", String(selfOpen));
    }
  }
}

function setAllOpen(open) {
  state.open = open
    ? new Set([...document.querySelectorAll("#grid .sec-head")].map((el) => el.dataset.key))
    : new Set();
  applyOpen();
}

// ------------------------------------------------------------ 画面切り替え

function showSelect() {
  $("#view-select").hidden = false;
  $("#view-compare").hidden = true;
  if (location.hash) history.replaceState(null, "", location.pathname);
  renderTray();
}

async function showCompare(ids) {
  $("#view-select").hidden = true;
  $("#view-compare").hidden = false;
  $("#grid").replaceChildren();
  $("#progress-box").hidden = false;
  const want = `#compare=${ids.join(",")}`;
  if (location.hash !== want) history.replaceState(null, "", want);
  state.docs = await loadDocs(ids);
  if (state.docs.length) {
    $("#progress-box").hidden = !$("#progress .error");
    renderCompare(state.docs);
    history.replaceState(null, "", `#compare=${state.docs.map((d) => d.docId).join(",")}`);
  }
}

function init() {
  buildEffectSelect();
  $("#search-form").addEventListener("submit", (e) => { e.preventDefault(); runSearch(1); });
  $("#compare-btn").addEventListener("click", () => showCompare(state.selected.map((s) => s.docId)));
  $("#back-btn").addEventListener("click", showSelect);
  $("#hide-same").addEventListener("change", applyHideSame);
  $("#show-all").addEventListener("change", () => { if (state.docs.length) renderCompare(state.docs); });
  $("#expand-all").addEventListener("click", () => setAllOpen(true));
  $("#collapse-all").addEventListener("click", () => setAllOpen(false));
  $("#jump").addEventListener("change", (e) => {
    const key = e.target.value;
    const target = document.querySelector(`#grid .sec-head[data-key="${CSS.escape(key)}"]`);
    if (target) {
      // 移動先の見出しを開き（小項目なら大項目も開く）、見出しが表の上端に来るようにスクロールする
      state.open.add(target.dataset.top);
      state.open.add(key);
      applyOpen();
      const grid = $("#grid");
      const head = grid.querySelector(".col-head");
      grid.scrollTo({ top: target.offsetTop - (head ? head.offsetHeight : 0), behavior: "smooth" });
    }
    e.target.value = "";
  });

  const m = /^#compare=([0-9A-Z_,]+)$/.exec(location.hash);
  if (m) {
    const ids = m[1].split(",").filter(Boolean).slice(0, MAX_ITEMS);
    for (const id of ids) {
      if (!state.selected.some((s) => s.docId === id) && state.selected.length < MAX_ITEMS) {
        state.selected.push({ docId: id, brand: id });
      }
    }
    renderTray();
    showCompare(ids);
  } else {
    showSelect();
  }
}

init();
