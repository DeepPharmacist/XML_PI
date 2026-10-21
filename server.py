#!/usr/bin/env python3
"""XML_PI 中継サーバー（開発用・個人利用）

PMDA は CORS ヘッダーを返さないため、ブラウザから直接 XML を取得できない。
このサーバーが静的ファイル（public/）を配信し、次の 3 種類だけを PMDA に中継する。

  GET /api/search?q=&target=&match=&effect=&page=   医療用医薬品 情報検索（結果を JSON 化）
  GET /api/doc/{文書ID}                              添付文書 XML（ZIP を展開して JSON で返す）
  GET /api/doc/{文書ID}/fig/{ファイル名}             XML 内の図（GIF など）

PMDA への負荷を抑えるため、
  - PMDA へのリクエストは 1 本ずつ直列化し、最低 MIN_INTERVAL 秒の間隔を空ける
  - 取得結果はメモリに一定時間キャッシュする
標準ライブラリのみで動作する（Python 3.9 以上）。
"""

import html
import http.cookiejar
import io
import json
import mimetypes
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PMDA = "https://www.pmda.go.jp"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
MIN_INTERVAL = float(os.environ.get("PMDA_MIN_INTERVAL", "1.0"))
DOC_TTL = 30 * 60      # 添付文書キャッシュ（秒）
SEARCH_TTL = 10 * 60   # 検索結果キャッシュ（秒）
DOC_CACHE_MAX = 30
USER_AGENT = "XML_PI-prototype/0.1 (personal development use)"
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

DOC_ID_RE = re.compile(r"^\d{6}_[0-9A-Z]{12}_\d+_\d+$")
FIG_RE = re.compile(r"^[0-9A-Za-z_\-]+\.(gif|png|jpe?g|svg)$")


class PmdaError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- PMDA アクセス

_pmda_lock = threading.Lock()
_last_request = 0.0


def pmda_fetch(opener, url, data=None):
    """PMDA へのリクエストを直列化し、間隔を空けて実行する。"""
    global _last_request
    with _pmda_lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
        if data is not None:
            req.add_header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        try:
            with opener.open(req, timeout=30) as res:
                body = res.read()
                ctype = res.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            raise PmdaError(502, f"PMDA が HTTP {e.code} を返しました")
        except urllib.error.URLError as e:
            raise PmdaError(502, f"PMDA に接続できません: {e.reason}")
        finally:
            _last_request = time.monotonic()
        return body, ctype


def new_opener():
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


class TTLCache:
    def __init__(self, ttl, max_items):
        self.ttl, self.max_items = ttl, max_items
        self._data = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            hit = self._data.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl:
                return hit[1]
            self._data.pop(key, None)
            return None

    def put(self, key, value):
        with self._lock:
            if len(self._data) >= self.max_items:
                oldest = min(self._data, key=lambda k: self._data[k][0])
                del self._data[oldest]
            self._data[key] = (time.monotonic(), value)


doc_cache = TTLCache(DOC_TTL, DOC_CACHE_MAX)
search_cache = TTLCache(SEARCH_TTL, 50)


# ---------------------------------------------------------------- 検索

# PMDA の検索フォームは、値が空でも全項目が送られていないと検索画面に戻ってしまう。
# ブラウザが送る項目一式を固定値として持ち、検索語と薬効分類だけを差し替える。
SEARCH_FORM_BASE = [
    ("tglOpFlg", ""),
    *[(f"dispColumnsList[{i}]", v) for i, v in [(0, "1"), (1, "2"), (2, "3"), (3, "23"), (4, "25"), (7, "4"), (8, "11")]],
    *[(f"_dispColumnsList[{i}]", "on") for i in [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]],
    ("infoindicationsorefficacy", ""), ("infoindicationsorefficacyHowtoSearch", "and"),
    ("warnings", ""), ("warningsHowtoSearch", "and"),
    ("contraindicationsAvoidedadministration", ""), ("contraindicationsAvoidedadministrationHowtoSearch", "and"),
    ("contraindicatedcombinationPrecautionsforcombination", ""),
    ("contraindicatedcombinationPrecautionsforcombinationHowtoSearch", "and"),
    ("updateDocFrDt", ""), ("updateDocToDt", ""), ("compNameWord", ""),
    ("iyakuKoumokuSelectSwitchRadio", "2"), ("isNewReleaseDisp", "true"),
    *[x for n in (1, 2, 3) for x in [(f"koumoku{n}Value", ""), (f"koumoku{n}Word", ""), (f"koumoku{n}HowtoSearch", "and")]],
    ("gs1code", ""), ("howtoRdSearchSel", "or"),
    *[x for n in (1, 2, 3) for x in [
        (f"relationDoc{n}Sel", ""), (f"relationDoc{n}check1", "on"), (f"_relationDoc{n}check1", "on"),
        (f"relationDoc{n}check2", "on"), (f"_relationDoc{n}check2", "on"), (f"relationDoc{n}Word", ""),
        (f"relationDoc{n}HowtoSearch", "and"), (f"relationDoc{n}FrDt", ""), (f"relationDoc{n}ToDt", ""),
    ] + ([(f"relationDocHowtoSearchBetween{n}{n + 1}", "and")] if n < 3 else [])],
    ("listCategory", ""), ("btnA.x", "10"), ("btnA.y", "10"),
]
LIST_ROWS = 100

ROW_RE = re.compile(r"<tr class=[\"']TrColor0\d[\"']>(.*?)</tr>", re.S)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
TOTAL_RE = re.compile(r"検索結果([\d,]+)件／全([\d,]+)ページ")


def strip_tags(s):
    s = re.sub(r"<a class=[\"']toggle[^\"']*[\"']>.*?</a>", "", s, flags=re.S)
    s = re.sub(r"<div class=[\"']togglem[\"']>.*?</div>", "", s, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


def cell_lines(cell):
    lines = [strip_tags(d) for d in re.findall(r"<div[^>]*>(.*?)</div>", cell, re.S)]
    lines = [x.lstrip(",") for x in lines if x]
    return lines or ([strip_tags(cell)] if strip_tags(cell) else [])


def parse_rows(fragment):
    items = []
    for row in ROW_RE.findall(fragment):
        cells = CELL_RE.findall(row)
        if len(cells) < 4:
            continue
        doc = re.search(r"ResultDataSetXML/([0-9A-Z_]+)", cells[3])
        pdf = re.search(r"PDF\((\d{4})年(\d{2})月(\d{2})日\)", cells[3])
        general = re.search(r"GeneralList/(\w+)", cells[0])
        items.append({
            "generic": strip_tags(cells[0]),
            "brands": cell_lines(cells[1]),
            "companies": cell_lines(cells[2]),
            "docId": doc.group(1) if doc else None,
            "updated": "-".join(pdf.groups()) if pdf else None,
            "generalCode": general.group(1) if general else None,
        })
    return items


def search(q, target, match, effect, page):
    key = (q, target, match, effect, page)
    cached = search_cache.get(key)
    if cached:
        return cached
    form = [("ListRows", str(LIST_ROWS)), ("nameWord", q),
            ("iyakuHowtoNameSearchRadioValue", target), ("howtoMatchRadioValue", match),
            ("effectValue", effect)] + SEARCH_FORM_BASE + [("ListRows", str(LIST_ROWS))]
    data = urllib.parse.urlencode(form).encode("utf-8")
    opener = new_opener()
    body, _ = pmda_fetch(opener, PMDA + "/PmdaSearch/iyakuSearch", data)
    text = body.decode("utf-8", "replace")
    m = TOTAL_RE.search(text)
    if not m:
        if "検索結果" in text and "<title>医療用医薬品 検索結果" in text:
            result = {"total": 0, "pages": 0, "page": 1, "items": []}
            search_cache.put(key, result)
            return result
        raise PmdaError(502, "PMDA の検索結果を読み取れませんでした（画面構成が変わった可能性があります）")
    total, pages = int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))
    if page > 1 and page <= pages:
        # 2 ページ目以降は、同じセッションで PageChangeRequest を送ると JSON で返る
        paged = form + [("pages", "1"), ("totalPages", str(pages))]
        body, _ = pmda_fetch(opener, f"{PMDA}/PmdaSearch/iyakuSearch/PageChangeRequest/{page}",
                             urllib.parse.urlencode(paged).encode("utf-8"))
        try:
            fragment = json.loads(body.decode("utf-8", "replace"))["ResultList"]
        except (ValueError, KeyError):
            raise PmdaError(502, "PMDA の検索結果（2 ページ目以降）を読み取れませんでした")
    else:
        page = 1
        fragment = text
    result = {"total": total, "pages": pages, "page": page, "items": parse_rows(fragment)}
    search_cache.put(key, result)
    return result


# ---------------------------------------------------------------- 添付文書 XML

def fetch_zip(doc_id):
    """文書 ID の ZIP を取得する。旧版・存在しない版は None（PMDA は 200 でエラー画面を返す）。"""
    body, ctype = pmda_fetch(new_opener(), f"{PMDA}/PmdaSearch/iyakuDetail/ResultDataSetXML/{doc_id}")
    if "octet-stream" not in ctype and not body.startswith(b"PK"):
        return None
    return zipfile.ZipFile(io.BytesIO(body))


def resolve_latest(doc_id):
    """一般名の一覧ページから、版番号を除いた部分が同じ文書の最新 ID を探す。"""
    company, yj, serial, _ = doc_id.split("_")
    body, _ = pmda_fetch(new_opener(), f"{PMDA}/PmdaSearch/iyakuDetail/GeneralList/{yj[:7]}")
    prefix = f"{company}_{yj}_{serial}_"
    for found in re.findall(r"ResultDataSetPDF/(\d{6}_[0-9A-Z]{12}_\d+_\d+)", body.decode("utf-8", "replace")):
        if found.startswith(prefix):
            return found
    return None


def load_doc(doc_id):
    """(実際の文書ID, ZipFile) を返す。キャッシュ → PMDA → 最新版の解決 の順に試す。"""
    hit = doc_cache.get(doc_id)
    if hit:
        return hit
    zf = fetch_zip(doc_id)
    actual = doc_id
    if zf is None:
        latest = resolve_latest(doc_id)
        if latest and latest != doc_id:
            zf = fetch_zip(latest)
            actual = latest
    if zf is None:
        raise PmdaError(404, "PMDA でこの添付文書の XML が見つかりません（販売中止や会社変更の可能性があります）")
    entry = (actual, zf)
    doc_cache.put(doc_id, entry)
    doc_cache.put(actual, entry)
    return entry


def doc_json(doc_id):
    actual, zf = load_doc(doc_id)
    names = zf.namelist()
    xml_name = next((n for n in names if n.lower().endswith(".xml")), None)
    if not xml_name:
        raise PmdaError(502, "ZIP に XML が含まれていません")
    return {
        "requestedId": doc_id,
        "docId": actual,
        "xml": zf.read(xml_name).decode("utf-8"),
        "figures": [n for n in names if n != xml_name],
    }


# ---------------------------------------------------------------- HTTP

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        print("%s %s" % (self.log_date_time_string(), fmt % args))

    def send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if not url.path.startswith("/api/"):
            return super().do_GET()
        try:
            self.handle_api(url)
        except PmdaError as e:
            self.send_json(e.status, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 開発用なので内容をそのまま返す
            self.send_json(500, {"error": f"サーバー内部エラー: {e}"})

    def handle_api(self, url):
        parts = url.path.strip("/").split("/")
        if parts == ["api", "search"]:
            qs = urllib.parse.parse_qs(url.query)
            arg = lambda k, d="": qs.get(k, [d])[0].strip()  # noqa: E731
            q, effect = arg("q")[:80], arg("effect")
            target = arg("target", "1") if arg("target", "1") in ("1", "2", "3") else "1"
            match = arg("match", "1") if arg("match", "1") in ("1", "2") else "1"
            page = int(arg("page", "1")) if arg("page", "1").isdigit() else 1
            if effect and not re.fullmatch(r"\d{2,3}", effect):
                return self.send_json(400, {"error": "薬効分類の指定が不正です"})
            if not q and not effect:
                return self.send_json(400, {"error": "名称か薬効分類を指定してください"})
            return self.send_json(200, search(q, target, match, effect, page))

        if len(parts) >= 3 and parts[:2] == ["api", "doc"]:
            doc_id = parts[2]
            if not DOC_ID_RE.match(doc_id):
                return self.send_json(400, {"error": "文書IDの形式が不正です"})
            if len(parts) == 3:
                return self.send_json(200, doc_json(doc_id))
            if len(parts) == 5 and parts[3] == "fig" and FIG_RE.match(parts[4]):
                _, zf = load_doc(doc_id)
                try:
                    data = zf.read(parts[4])
                except KeyError:
                    return self.send_json(404, {"error": "図が見つかりません"})
                self.send_response(200)
                self.send_header("Content-Type", mimetypes.guess_type(parts[4])[0] or "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "private, max-age=1800")
                self.end_headers()
                self.wfile.write(data)
                return
        self.send_json(404, {"error": "不明な API です"})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"XML_PI: http://{'localhost' if HOST in ('127.0.0.1', '0.0.0.0') else HOST}:{PORT}/ で起動しました（Ctrl+C で終了）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
