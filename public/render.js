// PMDA 添付文書 XML（新記載要領）を比較表示用の HTML に変換する。
// 章（項目）ごとに取り出せるよう、sections() で「行キー → DOM 要素」の対応を返す。

import { ITEM_BY_TAG, ITEM_MASTER, PARENT_TAGS } from "./item-master.js";

export const NS = "http://info.pmda.go.jp/namespace/prescription_drugs/package_insert/1.0";

// 項目番号・名称は項目マスタ（item-master.js）に従う
export const SECTION_LABELS = Object.fromEntries(ITEM_MASTER.map((it) => [it.tag, [it.no, it.name]]));

// 構造化された項目（表の欄など）に付ける見出し
const FIELD_LABELS = {
  ApprovalBrandName: "販売名", YJCode: "YJコード", TrademarkName: "欧文商標名",
  ApprovalNo: "承認番号", StartingDateOfMarketing: "販売開始", StorageMethod: "貯法",
  ShelfLife: "有効期間", StandardNameDetail: "基準名", RegulatoryClassification: "規制区分",
  ActiveIngredientName: "有効成分", ValueAndUnit: "分量", ListOfAdditives: "添加剤",
  IndividualAdditives: "添加剤", CompositionComments: "備考",
  Formulation: "剤形", ColorTone: "色調", Shape: "外形", ShapeFront: "表", ShapeBack: "裏",
  ShapeSide: "側面", OtherShape: "外形", Size: "大きさ", SizeDiameter: "直径",
  SizeThickness: "厚さ", OtherSize: "大きさ", Weight: "質量", IdCode: "識別コード", pH: "pH",
  OsmoticRatio: "浸透圧比", OtherProperty: "その他",
  GeneralName: "一般的名称", ChemicalName: "化学名", MolecularFormula: "分子式",
  MolecularWeight: "分子量", StructuralFormula: "構造式", DescriptionOfActiveIngredients: "性状",
  PartitionCoefficient: "分配係数",
};

// 表示しない要素（他の要素の描画時に参照するもの）
const SKIP = new Set(["WidthDefinition", "Col", "StandardNameCategoryCode",
  "CategoryDefinition", "FrequencyDefinition", "BrandNameInHiragana", "NameInHiragana"]);

const COMBI_COLUMNS = [["DrugName", "薬剤名等"], ["ClinSymptomsAndMeasures", "臨床症状・措置方法"],
  ["MechanismAndRiskFactors", "機序・危険因子"]];

export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML を解析できませんでした");
  return doc;
}

const kids = (el, name) => [...el.children].filter((c) => !name || c.localName === name);
const kid = (el, name) => kids(el, name)[0];

// 要素の日本語テキスト（Lang xml:lang="ja" を優先）
export function textOf(el) {
  if (!el) return "";
  const lang = [...el.getElementsByTagNameNS(NS, "Lang")].find((l) => (l.getAttribute("xml:lang") || "ja") === "ja");
  return (lang || el).textContent.replace(/\s+/g, " ").trim();
}

export class PackageInsert {
  constructor(xmlText, docId, figBase) {
    this.doc = parseXml(xmlText);
    this.root = this.doc.documentElement;
    this.docId = docId;
    this.figBase = figBase;
    this.numbers = new Map(); // 要素 id → 表示番号（例 HDR_ContraIndications_1 → 2.1）
    this.brands = new Map();  // BRD_Drug1 → 販売名
    for (const b of this.root.getElementsByTagNameNS(NS, "DetailBrandName")) {
      this.brands.set(b.getAttribute("id"), textOf(kid(b, "ApprovalBrandName")));
    }
    this.assignNumbers(this.root, null);
  }

  // ---- メタ情報
  get brandNames() { return [...this.brands.values()]; }
  get genericName() { return textOf(kid(this.root, "GenericName")); }
  get therapeuticClass() { return textOf(kid(this.root, "TherapeuticClassification")); }
  get revision() {
    const cur = this.root.querySelector("DateOfPreparationOrRevision > PreparationOrRevision");
    if (!cur) return "";
    return `${cur.querySelector("YearMonth")?.textContent ?? ""} ${textOf(kid(cur, "Version"))}`.trim();
  }

  // ---- 番号付け（相互参照の表示用）
  assignNumbers(el, base) {
    for (const c of el.children) {
      let num = base;
      const label = SECTION_LABELS[c.localName];
      if (label && c.getAttribute("heading") === "fixing") num = label[0];
      if (c.localName === "OrderedList" && num) {
        let i = 0;
        for (const item of kids(c, "Item")) {
          i += 1;
          const n = `${num}.${i}`;
          if (item.id) this.numbers.set(item.id, n);
          item.dataset_number = n;
          this.assignNumbers(item, n);
        }
        continue;
      }
      if (c.id && num) this.numbers.set(c.id, num);
      this.assignNumbers(c, num);
    }
  }

  // ---- 行キー → 要素
  // 返り値: Map<key, {label:[番号, 名称], el, own?, parent?}>
  //   own=true の場合、el の子のうち小項目の行に分けたもの以外だけを描画する
  // 小項目は項目マスタに親子関係があるもの。マスタにない要素でも heading="fixing" なら小項目として扱う。
  sections() {
    const map = new Map();
    let started = false;
    for (const c of this.root.children) {
      if (c.localName === "GenericName") { started = true; continue; }
      if (!started) continue;
      const key = c.localName;
      const label = SECTION_LABELS[key] || ["", textOf(kid(c, "Header")) || key];
      const subs = [...c.children].filter((sub) => isSubItem(key, sub));
      if (PARENT_TAGS.has(key) || subs.length) {
        map.set(key, { label, el: c, own: true });
        for (const sub of subs) {
          map.set(`${key}/${sub.localName}`, {
            label: SECTION_LABELS[sub.localName] || ["", sub.localName], el: sub, parent: key,
          });
        }
      } else {
        map.set(key, { label, el: c });
      }
    }
    return map;
  }

  // ---- 描画
  renderSection(entry) {
    const frag = document.createDocumentFragment();
    const children = entry.own
      ? [...entry.el.childNodes].filter((n) => !(n.nodeType === 1 && isSubItem(entry.el.localName, n)))
      : [...entry.el.childNodes];
    for (const n of children) this.renderNode(n, frag);
    return frag;
  }

  renderApproval() {
    const frag = document.createDocumentFragment();
    const appr = kid(this.root, "ApprovalEtc");
    if (appr) for (const n of appr.childNodes) this.renderNode(n, frag);
    return frag;
  }

  renderNode(node, parent) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      if (node.data.trim()) parent.append(node.data.replace(/^\s*\n\s*|\s*\n\s*$/g, ""));
      return;
    }
    if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      if (node.target === "enter") parent.append(h("br"));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    const name = el.localName;
    if (SKIP.has(name)) return;
    const lang = el.getAttribute("xml:lang");
    if (name === "Lang" && lang && lang !== "ja") return;

    const into = (tag, cls) => {
      const out = h(tag, cls);
      for (const c of el.childNodes) this.renderNode(c, out);
      parent.append(out);
      return out;
    };

    switch (name) {
      case "Lang": for (const c of el.childNodes) this.renderNode(c, parent); return;
      case "Detail": into("div", "detail"); return;
      case "Header": into("div", "hdr"); return;
      case "Sup": into("sup"); return;
      case "Sub": into("sub"); return;
      case "Italic": into("i"); return;
      case "OrderedList": {
        const ol = h("ol", "ordered");
        for (const item of kids(el, "Item")) {
          const li = h("li");
          const n = item.dataset_number;
          if (n) li.append(h("span", "num", n));
          const body = h("div", "item-body");
          for (const c of item.childNodes) this.renderNode(c, body);
          li.append(body);
          ol.append(li);
        }
        parent.append(ol);
        return;
      }
      case "UnorderedList": this.renderList(el, parent, "ul", "unordered"); return;
      case "SimpleList": this.renderList(el, parent, "ul", "simple"); return;
      case "HeaderRef": {
        const n = this.numbers.get(el.getAttribute("ref"));
        parent.append(h("span", "xref", n ? `［${n}参照］` : "［参照］"));
        return;
      }
      case "ReferenceBookRef": {
        const m = /(\d+)$/.exec(el.getAttribute("ref") || "");
        parent.append(h("sup", "lit", m ? `${Number(m[1])})` : ")"));
        return;
      }
      case "CommentRef": {
        const m = /(\d+)$/.exec(el.getAttribute("ref") || "");
        parent.append(h("sup", "note", m ? `注${Number(m[1])})` : "注)"));
        return;
      }
      case "Comment": {
        const m = /(\d+)$/.exec(el.id || "");
        const d = h("div", "comment");
        d.append(h("span", "note", m ? `注${Number(m[1])}) ` : "注) "));
        for (const c of el.childNodes) this.renderNode(c, d);
        parent.append(d);
        return;
      }
      case "Graphic": into("figure"); return;
      case "GraphicCaption": into("figcaption"); return;
      case "TblCaption": into("div", "tbl-caption"); return;
      case "GraphicBody":
      case "InlineGraphic": {
        const f = el.getAttribute("gfname") || el.getAttribute("gfName");
        if (f) {
          const img = h("img", name === "InlineGraphic" ? "inline" : "fig");
          img.loading = "lazy";
          img.alt = "図";
          img.src = `${this.figBase}/${encodeURIComponent(f)}`;
          parent.append(img);
        }
        for (const c of el.childNodes) this.renderNode(c, parent);
        return;
      }
      case "TblBlock": into("div", "tbl-block"); return;
      // 規制区分はコードのみ収載されている（名称との対応表は未確認のためコードを表示）
      case "RegulatoryClassificationCode": parent.append(h("span", "code", `コード ${el.textContent.trim()}`)); return;
      case "SimpleTable": this.renderTable(el, parent); return;
      case "SimpTblFoot": into("div", "tbl-foot"); return;
      case "OtherAdverse": this.renderAdverseMatrix(el, parent); return;
      case "CompositionForBrand":
      case "PropertyForBrand": {
        const box = h("div", "brand-block");
        const brand = this.brands.get(el.getAttribute("ref"));
        if (brand && this.brands.size > 1) box.append(h("div", "brand-name", brand));
        for (const c of el.childNodes) this.renderNode(c, box);
        parent.append(box);
        return;
      }
      case "DetailBrandName": {
        const box = h("div", "brand-block");
        for (const c of el.childNodes) this.renderNode(c, box);
        parent.append(box);
        return;
      }
      default:
        break;
    }

    if (kids(el, "Drug").length) { this.renderCombi(el, parent); return; }

    const label = FIELD_LABELS[name];
    if (label) {
      const row = h("div", "field");
      row.append(h("span", "field-label", label));
      const val = h("div", "field-value");
      for (const c of el.childNodes) this.renderNode(c, val);
      row.append(val);
      parent.append(row);
      return;
    }
    // 見出し付きの小項目（heading="fixing" の下位）
    if (el.getAttribute("heading") === "fixing" && SECTION_LABELS[name]) {
      const [n, t] = SECTION_LABELS[name];
      parent.append(h("div", "subhead", `${n} ${t}`));
    }
    for (const c of el.childNodes) this.renderNode(c, parent);
  }

  renderList(el, parent, tag, cls) {
    const list = h(tag, cls);
    for (const item of kids(el, "Item")) {
      const li = h("li");
      for (const c of item.childNodes) this.renderNode(c, li);
      list.append(li);
    }
    parent.append(list);
  }

  colWidths(el) {
    const wd = kid(el.parentElement, "WidthDefinition") || kid(el, "WidthDefinition");
    return wd ? kids(wd, "Col").map((c) => c.getAttribute("width")) : [];
  }

  renderTable(el, parent) {
    const table = h("table", "pi-table");
    const widths = this.colWidths(el);
    if (widths.length) {
      const cg = h("colgroup");
      for (const w of widths) { const col = h("col"); if (w) col.style.width = w; cg.append(col); }
      table.append(cg);
    }
    const tbody = h("tbody");
    for (const row of kids(el, "SimpTblRow")) {
      const tr = h("tr");
      for (const cell of kids(row, "SimpTblCell")) {
        const td = h("td");
        const rs = cell.getAttribute("rspan"), cs = cell.getAttribute("cspan");
        if (rs) td.rowSpan = Number(rs);
        if (cs) td.colSpan = Number(cs);
        if (cell.getAttribute("align")) td.style.textAlign = cell.getAttribute("align");
        if (cell.getAttribute("valign")) td.style.verticalAlign = cell.getAttribute("valign");
        for (const c of cell.childNodes) this.renderNode(c, td);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    parent.append(wrapScroll(table));
    for (const c of kids(el)) if (c.localName !== "SimpTblRow") this.renderNode(c, parent);
  }

  renderCombi(el, parent) {
    const table = h("table", "pi-table");
    const head = h("tr");
    for (const [, t] of COMBI_COLUMNS) head.append(h("th", null, t));
    table.append(thead(head));
    const tbody = h("tbody");
    for (const drug of kids(el, "Drug")) {
      const tr = h("tr");
      for (const [tag] of COMBI_COLUMNS) {
        const td = h("td");
        const part = kid(drug, tag);
        if (part) for (const c of part.childNodes) this.renderNode(c, td);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    parent.append(wrapScroll(table));
    for (const c of kids(el)) if (c.localName !== "Drug") this.renderNode(c, parent);
  }

  // その他の副作用: 器官分類 × 頻度 のマトリクス
  renderAdverseMatrix(el, parent) {
    const cats = el.querySelectorAll("CategoryDefinition > Category");
    const freqs = [...el.querySelectorAll("FrequencyDefinition > Frequency")];
    const descs = [...el.getElementsByTagNameNS(NS, "AdverseReactionDescription")];
    const table = h("table", "pi-table");
    const head = h("tr");
    head.append(h("th"));
    for (const f of freqs) { const th = h("th"); this.renderChildren(f, th); head.append(th); }
    table.append(thead(head));
    const tbody = h("tbody");
    for (const cat of cats) {
      const tr = h("tr");
      const th = h("th");
      this.renderChildren(cat, th);
      tr.append(th);
      for (const f of freqs) {
        const td = h("td");
        for (const d of descs) {
          if (d.getAttribute("categoryRef") === cat.id && d.getAttribute("frequencyRef") === f.id) {
            this.renderChildren(d, td);
          }
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    parent.append(wrapScroll(table));
  }

  renderChildren(el, parent) {
    for (const c of el.childNodes) this.renderNode(c, parent);
  }
}

function isSubItem(parentTag, el) {
  const item = ITEM_BY_TAG.get(el.localName);
  if (item) return item.parent === parentTag;
  return el.getAttribute("heading") === "fixing";
}

function thead(row) {
  const t = h("thead");
  t.append(row);
  return t;
}

function wrapScroll(table) {
  const d = h("div", "table-scroll");
  d.append(table);
  return d;
}

export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
