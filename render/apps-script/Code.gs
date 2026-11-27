/**
 * XML_PI 操作記録の受け口（Google Apps Script）
 *
 * Render 版の server.py から送られてくる操作記録を、このスプレッドシートの「操作記録」シートに書き足す。
 * 設定方法は render/README.md の「操作記録をスプレッドシートに残す」を参照。
 *
 * - スクリプト プロパティ TOKEN と、Render の環境変数 SHEETS_TOKEN が一致したときだけ書き込む
 * - 「=」「+」「-」「@」で始まる値は、数式として動かないよう先頭に ' を付ける
 */

const SHEET_NAME = '操作記録';
const HEADER = ['日時（日本時間）', 'アカウント', '操作', '内容', '品目数', '文書ID'];

function doPost(e) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'JSON ではありません' });
  }
  if (!token || body.token !== token) {
    return reply({ ok: false, error: '合言葉（TOKEN）が一致しません' });
  }

  const rows = (Array.isArray(body.rows) ? body.rows : [])
    .filter(Array.isArray)
    .slice(0, 100)
    .map((r) => HEADER.map((_, i) => clean(r[i])));
  if (!rows.length) return reply({ ok: true, added: 0 });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true, added: rows.length });
}

function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const s = String(v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
