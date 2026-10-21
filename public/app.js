import { EFFECT_GROUPS } from "./effects.js";
import { PackageInsert, h } from "./render.js";

const MAX_ITEMS = 5;
const PMDA = "https://www.pmda.go.jp/PmdaSearch/iyakuDetail";
const STORE_KEY = "xmlpi.selected";

const $ = (sel) => document.querySelector(sel);

const state = {
  selected: loadSelected(),  // [{docId, brand, generic, company, updated}]
  lastQuery: null,
  docs: [],                  // 比較中の PackageInsert
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

  const rows = [
    { key: "_generic", label: ["", "一般名"], render: (d) => document.createTextNode(d.genericName) },
    { key: "_class", label: ["", "薬効分類名"], render: (d) => document.createTextNode(d.therapeuticClass) },
    { key: "_approval", label: ["", "承認・貯法等"], render: (d) => d.renderApproval() },
  ];
  const secMaps = docs.map((d) => d.sections());
  for (const key of mergeKeys(secMaps.map((m) => [...m.keys()]))) {
    const first = secMaps.find((m) => m.has(key)).get(key);
    rows.push({
      key,
      label: first.label,
      sub: Boolean(first.parent),
      render: (d, i) => (secMaps[i].has(key) ? d.renderSection(secMaps[i].get(key)) : null),
    });
  }

  for (const row of rows) {
    const id = `row-${row.key.replace(/\W/g, "_")}`;
    const [num, name] = row.label;
    const label = h("div", `cell row-label sticky-left${row.sub ? " sub" : ""}`);
    label.id = id;
    const toggle = h("button", "row-toggle");
    toggle.append(h("span", "row-num", num), h("span", "row-name", name));
    toggle.title = "クリックで折りたたみ／展開";
    label.append(toggle);
    const cells = docs.map((d, i) => {
      const c = h("div", `cell body${row.sub ? " sub" : ""}`);
      const content = row.render(d, i);
      if (content && (content.nodeType === Node.TEXT_NODE ? content.data.trim() : content.childNodes.length)) {
        c.append(content);
      } else {
        c.classList.add("none");
        c.append(h("span", "muted", "（記載なし）"));
      }
      return c;
    });
    // 中身が全部「記載なし」の親行（小項目だけの章）は見出しとして薄く表示する
    const allEmpty = cells.every((c) => c.classList.contains("none"));
    if (allEmpty && !row.key.startsWith("_")) {
      label.classList.add("heading-only");
      cells.forEach((c) => { c.classList.add("heading-only"); c.replaceChildren(); });
    }
    const texts = cells.map((c) => c.textContent.replace(/\s+/g, ""));
    const same = docs.length > 1 && texts.every((t) => t === texts[0]);
    const group = [label, ...cells];
    for (const el of group) {
      el.dataset.row = row.key;
      if (same) el.classList.add("same");
    }
    toggle.addEventListener("click", () => {
      const collapsed = !label.classList.contains("collapsed");
      for (const el of group) el.classList.toggle("collapsed", collapsed);
    });
    grid.append(...group);

    if (!allEmpty || row.key.startsWith("_")) {
      const o = h("option", null, `${row.sub ? "　" : ""}${num ? num + " " : ""}${name}`);
      o.value = id;
      nav.append(o);
    }
  }
  applyHideSame();
  const head = grid.querySelector(".col-head");
  if (head) grid.style.setProperty("--head-h", `${head.offsetHeight}px`);
}

function applyHideSame() {
  $("#grid").classList.toggle("hide-same", $("#hide-same").checked);
}

function setAllCollapsed(collapsed) {
  for (const el of document.querySelectorAll("#grid .row-label, #grid .body")) {
    el.classList.toggle("collapsed", collapsed);
  }
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
  $("#expand-all").addEventListener("click", () => setAllCollapsed(false));
  $("#collapse-all").addEventListener("click", () => setAllCollapsed(true));
  $("#jump").addEventListener("change", (e) => {
    const target = document.getElementById(e.target.value);
    if (target) {
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
