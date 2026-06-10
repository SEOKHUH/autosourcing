// =============================================
// 모바일 소싱 후보 동기화 + 소싱 원장 — Apps Script Web App
// =============================================
// 배포 설정: 실행 계정 = "나", 액세스 = "Anyone"
// 엔드포인트:
//   GET  ?action=pending  → 미처리 행 목록 반환
//   POST ?action=add      → 새 행 추가 { url, title }
//   POST ?action=done     → 처리 완료 마킹 { rowIds: [..] }
//   POST ?action=ledger   → 소싱 원장 기록 { url1688, rows: [...] }

var SHEET_NAME = 'sourcing';
var HEADERS    = ['timestamp', 'url', 'title', 'status'];

// ── 헬퍼 ──────────────────────────────────────

function getSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(data, status) {
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── GET: ?action=pending ───────────────────────

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'pending') {
    return handlePending();
  }
  // POST 리다이렉트가 GET으로 변환될 때를 위한 폴백
  if (action === 'done') {
    var rowIdsParam = e.parameter.rowIds || '';
    var rowIds = rowIdsParam ? rowIdsParam.split(',').map(function(s) { return s.trim(); }) : [];
    return handleDone({ rowIds: rowIds });
  }
  return jsonResponse({ error: 'unknown action' });
}

function handlePending() {
  var sheet  = getSheet();
  var data   = sheet.getDataRange().getValues();
  var result = [];

  // data[0] = 헤더, data[1~] = 데이터 행
  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var status = String(row[3]).trim();
    if (status === 'pending') {
      result.push({
        rowId     : i + 1,           // 시트 실제 행 번호 (1-based, 헤더 포함)
        timestamp : String(row[0]),
        url       : String(row[1]),
        title     : String(row[2])
      });
    }
  }
  return jsonResponse(result);
}

// ── POST: ?action=add / ?action=done ──────────

function doPost(e) {
  var action = e && e.parameter && e.parameter.action;
  var body   = {};

  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    // form-encoded 폴백 (iOS 단축어 일부 버전)
    body = e.parameter || {};
  }

  if (action === 'add') {
    return handleAdd(body);
  }
  if (action === 'done') {
    return handleDone(body);
  }
  if (action === 'ledger') {
    return handleLedger(body);
  }
  return jsonResponse({ error: 'unknown action' });
}

function handleAdd(body) {
  var url   = String(body.url   || '').trim();
  var title = String(body.title || '').trim();

  if (!url) {
    return jsonResponse({ ok: false, error: 'url required' });
  }

  var sheet = getSheet();

  // 중복 체크 (같은 URL이 이미 pending이면 스킵)
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === url && String(data[i][3]).trim() === 'pending') {
      return jsonResponse({ ok: true, duplicate: true });
    }
  }

  var timestamp = new Date().toISOString();
  sheet.appendRow([timestamp, url, title, 'pending']);
  return jsonResponse({ ok: true });
}

// ── POST: ?action=ledger ──────────────────────

function ensureLedgerSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ledger');
  if (!sheet) {
    sheet = ss.insertSheet('ledger');
    var headers = ['현황', '1688링크', '상품명', '색상', '수량', '중국원가', '공급가', '판매가', '월판매량', 'END ROAS'];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);

    // 현황 드롭다운 (A2:A1000)
    var statusRange = sheet.getRange('A2:A1000');
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['제안중', '통과', '반려', '수입완료'], true)
      .setAllowInvalid(false)
      .build();
    statusRange.setDataValidation(rule);

    // 조건부 서식 (현황 값에 따라 행 배경색)
    var fullRange = sheet.getRange('A2:J1000');
    var rules = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$A2="통과"')
        .setBackground('#b7e1cd')
        .setRanges([fullRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$A2="반려"')
        .setBackground('#f4c7c3')
        .setRanges([fullRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$A2="수입완료"')
        .setBackground('#eeeeee')
        .setRanges([fullRange])
        .build(),
    ];
    sheet.setConditionalFormatRules(rules);
  }
  return sheet;
}

function handleLedger(body) {
  var url1688 = String(body.url1688 || '').trim();
  if (!url1688) return jsonResponse({ ok: false, error: 'url1688 required' });

  var rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) return jsonResponse({ ok: false, error: 'rows required' });

  var sheet = ensureLedgerSheet();

  // 마이그레이션: '월판매량' 열이 없으면 END ROAS(I열) 앞에 자동 삽입
  var headerVals = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headerVals.indexOf('월판매량') === -1) {
    var endRoasCol = headerVals.indexOf('END ROAS') + 1; // 1-based
    if (endRoasCol > 0) {
      sheet.insertColumnBefore(endRoasCol);
      sheet.getRange(1, endRoasCol).setValue('월판매량');
    }
  }

  // 중복 체크: 같은 url1688이 이미 있으면 skip
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === url1688) {
      return jsonResponse({ ok: true, duplicate: true });
    }
  }

  var n = rows.length;
  var hadData = data.length > 1; // 헤더 외 기존 행이 있는지

  // 헤더(row 1) 바로 아래에 n개 행 삽입 → 최신이 맨 위
  sheet.insertRowsAfter(1, n);

  var values = rows.map(function(row) {
    return [
      '제안중',                   // A: 현황
      row.url1688 || url1688,    // B: 1688링크
      row.productName || '',     // C: 상품명
      row.color || '',           // D: 색상
      row.qty || '',             // E: 수량
      row.yuan || 0,             // F: 중국원가
      '',                        // G: 공급가 (수식)
      '',                        // H: 판매가 (수식)
      row.monthlySales || 0,     // I: 월판매량
      '',                        // J: END ROAS (수식)
    ];
  });
  sheet.getRange(2, 1, n, 10).setValues(values);

  // 공급가·판매가 수식 적용 (행별 참조 행 번호 동적 계산)
  var supplyFormulas = [], sellingFormulas = [];
  for (var r = 0; r < n; r++) {
    var rowNum = 2 + r;
    supplyFormulas.push(['=CEILING(F' + rowNum + '*400+3000,100)']);
    sellingFormulas.push(['=CEILING(G' + rowNum + '/0.6,100)']);
  }
  sheet.getRange(2, 7, n, 1).setFormulas(supplyFormulas);
  sheet.getRange(2, 8, n, 1).setFormulas(sellingFormulas);

  // 삽입된 행에 현황 드롭다운 재적용 (insertRowsAfter 시 유효성 검사 미상속)
  var newStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['제안중', '통과', '반려', '수입완료'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 1, n, 1).setDataValidation(newStatusRule);

  // END ROAS 수식 적용
  var endRoasFormulas = [];
  for (var r = 0; r < n; r++) {
    var rn = 2 + r;
    endRoasFormulas.push(['=IFERROR((H' + rn + '/(G' + rn + '-F' + rn + '*400))*1.1,"-")']);
  }
  sheet.getRange(2, 10, n, 1).setFormulas(endRoasFormulas);

  SpreadsheetApp.flush();
  return jsonResponse({ ok: true, inserted: n });
}

// ── 커스텀 메뉴 ──────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('소싱 원장')
    .addItem('수입완료 보관', 'moveCompletedRows')
    .addItem('시트 서식 재적용', 'ensureLedgerSheet')
    .addToUi();
}

function moveCompletedRows() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var ledger = ss.getSheetByName('ledger');
  if (!ledger) { SpreadsheetApp.getUi().alert('ledger 시트가 없습니다.'); return; }

  var archive = ss.getSheetByName('완료(보관)');
  if (!archive) {
    archive = ss.insertSheet('완료(보관)');
    archive.appendRow(['현황', '1688링크', '상품명', '색상', '수량', '중국원가', '공급가', '판매가', 'END ROAS']);
    archive.setFrozenRows(1);
  }

  var data     = ledger.getDataRange().getValues();
  var toArchive = [];
  var toDelete  = []; // 1-based row indices, 역순(아래→위) 삭제용

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === '수입완료') {
      toArchive.unshift(data[i]);  // 순서 유지
      toDelete.push(i + 1);        // 1-based, 이미 역순
    }
  }

  if (toDelete.length === 0) { SpreadsheetApp.getUi().alert('수입완료 항목이 없습니다.'); return; }

  if (toArchive.length > 0) {
    archive.getRange(archive.getLastRow() + 1, 1, toArchive.length, 9).setValues(toArchive);
  }

  toDelete.forEach(function(rowNum) { ledger.deleteRow(rowNum); });

  SpreadsheetApp.getUi().alert(toDelete.length + '개 행을 완료(보관) 시트로 이동했습니다.');
}

// ─────────────────────────────────────────────

function handleDone(body) {
  var rowIds = body.rowIds;
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return jsonResponse({ ok: false, error: 'rowIds array required' });
  }

  var sheet = getSheet();
  var count = 0;

  rowIds.forEach(function(rowId) {
    var n = parseInt(rowId, 10);
    if (isNaN(n) || n < 2) return;  // 헤더 행(1) 이하는 무시
    try {
      // status 컬럼 = D열 = 4번째 열
      sheet.getRange(n, 4).setValue('done');
      count++;
    } catch (err) {
      // 범위 오류 무시
    }
  });

  SpreadsheetApp.flush();
  return jsonResponse({ ok: true, count: count });
}
