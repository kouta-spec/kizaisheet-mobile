/**
 * ===================================================================
 * モバイルアプリ（PWA）用のWeb API（2026/8/22追加）
 * ===================================================================
 * 機材シート2026のデータを、スマホ用の別アプリ（PWA）から読み書きできるように
 * するための窓口（Web App）。PC版のGoogleスプレッドシートはそのまま変更せず、
 * データの保存場所（機材リストシート）を共通にすることで、PCとスマホで
 * 同じデータを見られるようにする。
 *
 * 【重要】この窓口はAPP_TOKENという合言葉だけで守られている。
 * 下のMOBILE_API_TOKENを、他人に推測されない自分だけの文字列に
 * 必ず書き換えてから使うこと（例：ランダムな英数字20文字程度）。
 * このトークンを知っている人は誰でも機材リストを読み書きできてしまうため、
 * デプロイ後に発行されるWeb AppのURLは、身内以外に絶対に共有しないこと。
 *
 * 【セットアップ手順】
 * 1. 下のMOBILE_API_TOKENを書き換える
 * 2. Apps Scriptエディタ右上の「デプロイ」→「新しいデプロイ」
 * 3. 種類の選択で歯車アイコン→「ウェブアプリ」を選ぶ
 * 4. 「次のユーザーとして実行」は「自分（自分のメールアドレス）」
 * 5. 「アクセスできるユーザー」は「全員」を選ぶ
 *    （↑ここが「全員」になっていないと、スマホ側からアクセスできない。
 *      その代わりMOBILE_API_TOKENが実質的な鍵になる）
 * 6. 「デプロイ」を押す→初回は権限確認画面が出るので許可する
 * 7. 発行された「ウェブアプリのURL」（.../exec で終わるもの）をコピーする
 * 8. ブラウザで「そのURL + ?action=bookings&token=（決めたトークン）」を開き、
 *    JSON形式でデータが返ってくれば成功
 *
 * 【コードを変更したとき】
 * doGet/doPostの中身を直しても、それだけでは公開中のWeb Appには反映されない。
 * 「デプロイ」→「デプロイを管理」→ 既存のデプロイの鉛筆アイコン→
 * 「バージョン」を「新バージョン」にして「デプロイ」を押す必要がある
 * （URLは変わらないので、スマホ側の設定を変える必要はない）。
 * ===================================================================
 */

const MOBILE_API_TOKEN = "ここを自分だけの合言葉に書き換えてください";

/**
 * 機材リストの「実データ」が始まる行（2026/8/24調査で判明）。
 * 1行目: 見出し（作品名・機材名…）
 * 2行目: 入力の使い方メモ（検索方法の説明などの注意書き）
 * 3〜4行目: 空白
 * 5行目〜: 実際の予約データ
 * 以前は2行目からがデータという前提で動いていたが、2行目の注意書きが
 * 機材名として誤って読み込まれる可能性があったため、5行目からに修正した。
 */
const BOOKING_DATA_START_ROW = 5;

/**
 * スマホアプリからのデータ取得（一覧表示用）
 * 例: .../exec?action=bookings&token=xxx
 *     .../exec?action=equipment&token=xxx
 */
function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== MOBILE_API_TOKEN) {
      return mobileApiError_('トークンが正しくありません');
    }
    const action = e.parameter.action;
    if (action === 'bookings') {
      return mobileApiJson_({ ok: true, bookings: getMobileBookings_(e) });
    }
    if (action === 'equipment') {
      return mobileApiJson_({ ok: true, equipment: getMobileEquipmentList_() });
    }
    if (action === 'equipmentByCategory') {
      return mobileApiJson_({ ok: true, categories: getMobileEquipmentByCategory_() });
    }
    if (action === 'supplierList') {
      return mobileApiJson_({ ok: true, suppliers: getMobileSupplierList_() });
    }
    if (action === 'projectList') {
      return mobileApiJson_({ ok: true, projects: getMobileProjectList_() });
    }
    return mobileApiError_('不明なaction: ' + action);
  } catch (err) {
    Logger.log('doGetエラー: ' + err.message);
    return mobileApiError_(err.message);
  }
}

/**
 * スマホアプリからの予約の追加・編集
 * リクエストボディ（JSON文字列）に token, action を含めて送る。
 * 【重要】ブラウザ側のfetch()から呼ぶときは、Content-Typeを
 * "text/plain;charset=utf-8" にすること。"application/json"にすると
 * ブラウザがCORSのプリフライト（OPTIONS）を送ってしまい、
 * Apps ScriptのWeb Appはこれに対応していないため失敗する。
 * ボディの中身自体はJSON文字列でよく、サーバー側でJSON.parseする。
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return mobileApiError_('リクエストの中身が空です');
    }
    const body = JSON.parse(e.postData.contents);
    if (body.token !== MOBILE_API_TOKEN) {
      return mobileApiError_('トークンが正しくありません');
    }
    const action = body.action;
    if (action === 'addBooking') {
      return mobileApiJson_(addMobileBooking_(body));
    }
    if (action === 'updateBooking') {
      return mobileApiJson_(updateMobileBooking_(body));
    }
    if (action === 'deleteBooking') {
      return mobileApiJson_(deleteMobileBooking_(body));
    }
    if (action === 'refreshGantt') {
      return mobileApiJson_(refreshMobileGanttChart_());
    }
    return mobileApiError_('不明なaction: ' + action);
  } catch (err) {
    Logger.log('doPostエラー: ' + err.message);
    return mobileApiError_(err.message);
  }
}

function mobileApiJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function mobileApiError_(message) {
  return mobileApiJson_({ ok: false, error: message });
}

/**
 * 機材リストの予約データをスマホ向けに整形して返す。
 * 全件返すと通信量が大きくなるため、既定では「終了日が○日前より新しいもの」だけを返す。
 * ?sinceDays=30 のように指定すれば範囲を広げられる。
 * 【2026/8/24変更】機材リストは1年単位で更新する運用とのことなので、既定値を400日に
 * 引き上げた（アプリ側も同じく400日を指定して呼び出している）。
 */
function getMobileBookings_(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < BOOKING_DATA_START_ROW) return [];
  const numRows = lastRow - BOOKING_DATA_START_ROW + 1;
  const data = sheet.getRange(BOOKING_DATA_START_ROW, 1, numRows, BOOKING_COL_PRICE).getValues();

  // 【2026/8/24追加】機材リストには、作品名は入っているのに機材名の欄に「カメラ」
  // 「レンズ」のようなカテゴリ整理用のラベルだけが書かれた行が紛れていることがある
  // （*始まりの見出し行とは別パターン）。これらは実在の機材ではないため、
  // マスターガントチャートに実在する機材名と完全一致する行だけを予約として扱う。
  // これにより、作品ごとの件数表示や一覧に、整理用ラベル行が混ざらないようにする。
  const validEquipmentSet = {};
  getMobileEquipmentList_().forEach(function (n) { validEquipmentSet[n] = true; });

  const sinceDaysParam = e && e.parameter && e.parameter.sinceDays;
  const sinceDays = sinceDaysParam ? Number(sinceDaysParam) : 400;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - sinceDays);

  const results = [];
  data.forEach(function (row, index) {
    const equipmentNameRaw = row[BOOKING_COL_EQUIPMENT - 1];
    if (!equipmentNameRaw) return;
    const equipmentName = String(equipmentNameRaw).trim();
    if (!validEquipmentSet[equipmentName]) return; // マスターガントチャートに実在しない＝整理用ラベル行など
    // 「*」始まりはA列に入れる整理用ラベル行（*Camera等）なので予約データではない
    const projectRaw = row[BOOKING_COL_PROJECT - 1];
    if (typeof projectRaw === 'string' && projectRaw.trim().indexOf('*') === 0) return;
    const endDateRaw = row[BOOKING_COL_END - 1];
    if (endDateRaw instanceof Date && !isNaN(endDateRaw.getTime()) && endDateRaw < cutoff) {
      return; // 古い予約は返さない（通信量を減らすため）
    }

    results.push({
      row: index + BOOKING_DATA_START_ROW,
      project: row[BOOKING_COL_PROJECT - 1] || '',
      equipment: equipmentName,
      quantity: row[BOOKING_COL_QUANTITY - 1] || '',
      startDate: formatMobileDate_(row[BOOKING_COL_START - 1]),
      endDate: formatMobileDate_(row[BOOKING_COL_END - 1]),
      supplier: row[BOOKING_COL_SUPPLIER - 1] || '',
      note: row[BOOKING_COL_NOTE - 1] || '',
      returnCheck: row[BOOKING_COL_RETURN_CHECK - 1] || '',
      price: row[BOOKING_COL_PRICE - 1] || ''
    });
  });
  return results;
}

function formatMobileDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDate(value);
  }
  return '';
}

/**
 * マスターガントチャートの機材名一覧（B列選択肢用）。
 * 機材名は「マスターガントチャートの表記と完全一致」が必須のルールなので、
 * スマホ側はこの一覧からのみ選ばせる（自由入力させない）ことで、
 * PCと同じ「1文字違うと反映されない」問題を防ぐ。
 */
function getMobileEquipmentList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GANTT_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - GANTT_START_ROW + 1;
  if (numRows <= 0) return [];
  const values = sheet.getRange(GANTT_START_ROW, GANTT_EQUIPMENT_COL, numRows, 1).getValues();
  const names = [];
  values.forEach(function (row) {
    const name = row[0];
    if (name && String(name).trim() !== '') {
      names.push(String(name).trim());
    }
  });
  return names;
}

/**
 * マスターガントチャートの機材を「カテゴリ（B列）ごと」にグループ化して返す。
 * スマホの「予約を追加」画面で、カテゴリを選ぶとその機材だけが選べるようにするために使う。
 * B列がマスターガントチャート上部の目次・区切り行（「*」始まりの見出し）になっている行や、
 * 機材名（C列）自体が「*」で始まる見出し行は、実在する機材ではないため除外する。
 * カテゴリが空欄の行は「（未分類）」としてまとめ、一覧の最後に置く。
 */
function getMobileEquipmentByCategory_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GANTT_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - GANTT_START_ROW + 1;
  if (numRows <= 0) return [];

  const UNCATEGORIZED = '（未分類）';
  // B列（カテゴリ）とC列（機材名）をまとめて1回で取得（GANTT_EQUIPMENT_COLの1つ左がB列）
  const values = sheet.getRange(GANTT_START_ROW, GANTT_EQUIPMENT_COL - 1, numRows, 2).getValues();

  const order = [];
  const map = {};
  values.forEach(function (row) {
    const rawName = row[1];
    const name = rawName ? String(rawName).trim() : '';
    if (!name || name.indexOf('*') === 0) return; // 見出し・区切り行を除外

    const rawCategory = row[0];
    const categoryText = rawCategory ? String(rawCategory).trim() : '';
    const category = (categoryText && categoryText.indexOf('*') !== 0) ? categoryText : UNCATEGORIZED;

    if (!map[category]) { map[category] = []; order.push(category); }
    map[category].push(name);
  });

  // 「未分類」は一覧の最後に回す
  const uncatIndex = order.indexOf(UNCATEGORIZED);
  if (uncatIndex !== -1 && uncatIndex !== order.length - 1) {
    order.splice(uncatIndex, 1);
    order.push(UNCATEGORIZED);
  }

  return order.map(function (category) {
    return { category: category, items: map[category] };
  });
}

/**
 * 機材リストの発注先（F列）に設定されているプルダウン（データ入力規則・リスト）の
 * 選択肢をそのまま返す。スマホの「予約を追加」画面の発注先もこれと同じ選択肢だけに
 * することで、PC側のプルダウンと表記が完全に一致するようにする（2026/8/25変更、
 * 以前は機材リストへの過去の入力値から集計していたが、それだと本来のレンタル会社名の
 * 一覧と食い違う可能性があったため、実際のプルダウン設定を直接参照する方式に変更）。
 * 列のどこかにリストが設定されていれば良いので、F列のデータ範囲を上から順に見ていき、
 * 最初に見つかった「リスト」タイプの入力規則の選択肢を採用する。将来Google Sheets側で
 * プルダウンの選択肢を増やしたり変えたりしても、コードの変更なしに反映される。
 */
function getMobileSupplierList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < BOOKING_DATA_START_ROW) return [];
  const numRows = lastRow - BOOKING_DATA_START_ROW + 1;
  const validations = sheet.getRange(BOOKING_DATA_START_ROW, BOOKING_COL_SUPPLIER, numRows, 1).getDataValidations();

  for (let i = 0; i < validations.length; i++) {
    const rule = validations[i][0];
    if (!rule) continue;
    if (rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      return rule.getCriteriaValues()[0];
    }
  }
  return [];
}

/**
 * 機材リストに既に登録されている作品名（A列）を、重複なく並べて返す。
 * スマホの「予約を追加」画面で、作品名の入力候補（選択式）として使う。発注先・機材名と
 * 違って作品名は新しい作品が随時増えていくものなので、プルダウンで一覧に縛るのではなく、
 * 「候補は出すが自由入力もできる」形にする（既存作品名の表記ゆれによる意図しない
 * グループ分裂を防ぎつつ、新しい作品名も問題なく登録できるようにするため）。
 * 「*」で始まる区切り・見出し行は実在する作品ではないため除外する。
 *
 * 並び順は、予約一覧タブでの作品グループの並び順（開始日が遅い＝未来の作品ほど上）と
 * 揃える。作品ごとに、機材リスト上のすべての行から開始日（D列）の最大値を求め、
 * それが遅い作品から順に並べる。開始日が読み取れない作品名は一番下に回す。
 */
function getMobileProjectList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < BOOKING_DATA_START_ROW) return [];
  const numRows = lastRow - BOOKING_DATA_START_ROW + 1;
  const projectValues = sheet.getRange(BOOKING_DATA_START_ROW, BOOKING_COL_PROJECT, numRows, 1).getValues();
  const startValues = sheet.getRange(BOOKING_DATA_START_ROW, BOOKING_COL_START, numRows, 1).getValues();

  const maxStart = {};
  const order = [];
  for (let i = 0; i < projectValues.length; i++) {
    const raw = projectValues[i][0];
    const name = raw ? String(raw).trim() : '';
    if (!name || name.indexOf('*') === 0) continue; // 区切り・見出し行を除外
    if (!(name in maxStart)) { maxStart[name] = null; order.push(name); }

    const startRaw = startValues[i][0];
    if (startRaw instanceof Date && !isNaN(startRaw.getTime())) {
      if (!maxStart[name] || startRaw > maxStart[name]) maxStart[name] = startRaw;
    }
  }

  order.sort(function (a, b) {
    const da = maxStart[a], db = maxStart[b];
    if (!da && !db) return 0;
    if (!da) return 1;  // 開始日不明は下へ
    if (!db) return -1;
    return db - da; // 降順（開始日が遅い作品ほど上）
  });
  return order;
}

/** "2026/09/01" や "2026-09-01" をDateに変換する */
function parseMobileDate_(value) {
  if (!value) return null;
  const parts = String(value).trim().split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * 【数式インジェクション対策】Googleスプレッドシートは、setValue()に渡した文字列の
 * 先頭が「=」「+」「-」「@」だと、それを数式として解釈して実行してしまう
 * （手入力でセルに直接その文字を打った場合と同じ扱いになるため）。
 * スマホアプリの備考・作品名・発注先などは自由入力を許しているので、そのまま
 * シートに書き込むと、悪意の有無に関わらず意図しない数式が実行されてしまう
 * 危険がある（例: 備考欄に "=IMPORTXML(...)" を含む文字列を貼り付けて保存する等）。
 * 先頭がこれらの記号の場合だけ、半角アポストロフィ(')を先頭に付けて書き込む。
 * これはGoogleスプレッドシートの「強制的に文字列として扱う」ための標準の書き方で、
 * セルに実際に表示される内容やコピペした文字自体は一切変わらない
 * （アポストロフィ自体はセルの値には含まれず、書式が「文字列」になるだけ）。
 */
function sanitizeMobileText_(value) {
  if (value === undefined || value === null) return value;
  var s = String(value);
  if (/^[=+\-@]/.test(s)) {
    return "'" + s;
  }
  return s;
}

/**
 * 数量は本来数値のはずだが、アプリを介さず直接APIを叩かれた場合に備え、
 * サーバー側でも必ず数値へ変換する（変換できない・空の場合は既定値の1にする）。
 * こうしておけば、setValue()に渡る値は必ずJavaScriptのnumber型になり、
 * 文字列としての数式解釈（sanitizeMobileText_の対象）にはそもそも入らない。
 */
function sanitizeMobileQuantity_(value) {
  var n = Number(value);
  return (isFinite(n) && n > 0) ? n : 1;
}

function addMobileBooking_(body) {
  // 【同時保存の排他制御】複数人がほぼ同時に「保存」を押すと、後述のfindMobileGroupInsertRow_が
  // 同じ挿入位置を「空いている」と誤判定し、片方の予約が意図しない位置に入ってしまう事故が
  // 起こり得る。addBooking/updateBooking/deleteBookingの3つで同じスクリプトロックを使うことで、
  // 常にどれか1件の保存処理だけが機材リストへ書き込み中になるようにする。
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockError) {
    return { ok: false, error: '他の人が同時に保存中です。数秒待ってからもう一度お試しください。' };
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);

    if (!body.project) {
      return { ok: false, error: '作品名を入力してください' };
    }
    const equipmentList = getMobileEquipmentList_();
    if (equipmentList.indexOf(body.equipment) === -1) {
      return { ok: false, error: '機材名がマスターガントチャートの一覧と一致しません: ' + body.equipment };
    }
    const startDate = parseMobileDate_(body.startDate);
    const endDate = parseMobileDate_(body.endDate);
    if (!startDate || !endDate) {
      return { ok: false, error: '開始日・終了日の形式が正しくありません（例: 2026/09/01）' };
    }
    if (startDate > endDate) {
      return { ok: false, error: '開始日が終了日より後になっています' };
    }

    // 【2026/8/24再々変更】機材リスト全体を毎回並べ替える方式は、既存グループの中に
    // 手動で入れているcamera/lensなどの整理用ラベル行の並びまで崩してしまうため撤回。
    // 代わりに「並べ替えはせず、対象の作品グループの最後尾に1行挿入する」方式に戻した。
    // これなら既存の並び（ラベル行を含む）はそのまま保たれる。
    const lastRow = sheet.getLastRow();
    const newRow = findMobileGroupInsertRow_(sheet, body.project);
    if (newRow <= lastRow) {
      sheet.insertRowBefore(newRow); // 既存の行をずらして、その位置に空き行を作る
    }
    sheet.getRange(newRow, BOOKING_COL_PROJECT).setValue(sanitizeMobileText_(body.project));
    sheet.getRange(newRow, BOOKING_COL_EQUIPMENT).setValue(body.equipment);
    sheet.getRange(newRow, BOOKING_COL_QUANTITY).setValue(sanitizeMobileQuantity_(body.quantity));
    sheet.getRange(newRow, BOOKING_COL_START).setValue(startDate);
    sheet.getRange(newRow, BOOKING_COL_END).setValue(endDate);
    sheet.getRange(newRow, BOOKING_COL_SUPPLIER).setValue(sanitizeMobileText_(body.supplier || ''));
    sheet.getRange(newRow, BOOKING_COL_NOTE).setValue(sanitizeMobileText_(body.note || ''));

    return runMobileSavePipeline_(ss, newRow);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 新しい予約をどの行に挿入するか決める（2026/8/24再設計）。
 * ルール:
 * ・A列が「*」で始まる行（*Camera, *Lensなどの整理用ラベル行）はマッチ対象から除外する
 *   （実際の作品名ではないため）。
 * ・作品名が完全一致、または前方一致（例:「大追跡2」で始まる「大追跡2 Bcam」なども
 *   同じグループとみなす）する行のうち、一番下にあるものを探す。
 * ・見つかったら、その行のすぐ下に挿入する＝既存グループの並び順は一切変えず、
 *   グループの最後尾に追加する。
 * ・1件も見つからなければ（新しい作品名）→ 実データの一番上（BOOKING_DATA_START_ROW）に挿入する。
 */
function findMobileGroupInsertRow_(sheet, projectName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < BOOKING_DATA_START_ROW) return BOOKING_DATA_START_ROW; // データがまだ1件もない

  const targetName = String(projectName || '').trim();
  const numRows = lastRow - BOOKING_DATA_START_ROW + 1;
  const projects = sheet.getRange(BOOKING_DATA_START_ROW, BOOKING_COL_PROJECT, numRows, 1).getValues();

  let lastMatchRow = -1;
  for (let i = 0; i < projects.length; i++) {
    const raw = projects[i][0];
    const name = raw ? String(raw).trim() : '';
    if (!name || name.indexOf('*') === 0) continue; // 空欄・整理用ラベル行は対象外

    const isMatch = name === targetName ||
      name.indexOf(targetName) === 0 ||   // 例: targetName="大追跡2" が name="大追跡2 Bcam" に含まれる
      targetName.indexOf(name) === 0;     // 例: name="大追跡2" が targetName="大追跡2 Bcam" に含まれる
    if (isMatch) {
      lastMatchRow = i + BOOKING_DATA_START_ROW; // シート上の実際の行番号に変換
    }
  }

  if (lastMatchRow === -1) {
    return BOOKING_DATA_START_ROW; // 新しい作品名 → 実データの一番上
  }
  return lastMatchRow + 1; // 既存の同じ作品グループの最後尾の直後
}

function updateMobileBooking_(body) {
  // addMobileBooking_と同じスクリプトロックを使い、他の追加・編集・削除と排他制御する
  // （このロックを取っている間は、他の保存処理が行番号を動かすことがない）。
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockError) {
    return { ok: false, error: '他の人が同時に保存中です。数秒待ってからもう一度お試しください。' };
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
    const row = Number(body.row);
    if (!row || row < BOOKING_DATA_START_ROW) {
      return { ok: false, error: '行番号が正しくありません' };
    }
    const lastRow = sheet.getLastRow();
    if (row > lastRow) {
      return { ok: false, error: '指定された行が存在しません' };
    }

    if (body.equipment !== undefined) {
      const equipmentList = getMobileEquipmentList_();
      if (equipmentList.indexOf(body.equipment) === -1) {
        return { ok: false, error: '機材名がマスターガントチャートの一覧と一致しません: ' + body.equipment };
      }
    }

    if (body.project !== undefined) sheet.getRange(row, BOOKING_COL_PROJECT).setValue(sanitizeMobileText_(body.project));
    if (body.equipment !== undefined) sheet.getRange(row, BOOKING_COL_EQUIPMENT).setValue(body.equipment);
    if (body.quantity !== undefined) sheet.getRange(row, BOOKING_COL_QUANTITY).setValue(sanitizeMobileQuantity_(body.quantity));
    if (body.startDate !== undefined) {
      const startDate = parseMobileDate_(body.startDate);
      if (!startDate) return { ok: false, error: '開始日の形式が正しくありません（例: 2026/09/01）' };
      sheet.getRange(row, BOOKING_COL_START).setValue(startDate);
    }
    if (body.endDate !== undefined) {
      const endDate = parseMobileDate_(body.endDate);
      if (!endDate) return { ok: false, error: '終了日の形式が正しくありません（例: 2026/09/01）' };
      sheet.getRange(row, BOOKING_COL_END).setValue(endDate);
    }
    if (body.supplier !== undefined) sheet.getRange(row, BOOKING_COL_SUPPLIER).setValue(sanitizeMobileText_(body.supplier));
    if (body.note !== undefined) sheet.getRange(row, BOOKING_COL_NOTE).setValue(sanitizeMobileText_(body.note));
    if (body.returnCheck !== undefined) sheet.getRange(row, BOOKING_COL_RETURN_CHECK).setValue(body.returnCheck);

    return runMobileSavePipeline_(ss, row);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 予約の削除。行を丸ごと削除するため、これより下の行の行番号は1つずつ繰り上がる。
 * スマホアプリ側は削除後に必ず一覧を再取得するので、古い行番号が残ることはない。
 */
function deleteMobileBooking_(body) {
  // addMobileBooking_/updateMobileBooking_と同じスクリプトロックで排他制御する。
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockError) {
    return { ok: false, error: '他の人が同時に保存中です。数秒待ってからもう一度お試しください。' };
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
    const row = Number(body.row);
    if (!row || row < BOOKING_DATA_START_ROW) {
      return { ok: false, error: '行番号が正しくありません' };
    }
    const lastRow = sheet.getLastRow();
    if (row > lastRow) {
      return { ok: false, error: '指定された行が存在しません（すでに削除されている可能性があります）' };
    }

    sheet.deleteRow(row);

    return runMobileSavePipeline_(ss, null);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 予約の追加・編集・削除のあとに呼ぶ共通処理（2026/8/24変更）。
 * 以前はここで毎回ガントチャート全体（updateAllGanttCore等）を自動更新していたが、
 * 件数が多いと数秒〜数十秒かかり保存のたびに待たされるため、
 * 「保存＝機材リストへの反映のみ」に変更した。ガントチャートへの反映は
 * アプリの「ガントチャートを更新」ボタン（refreshMobileGanttChart_）を押した
 * ときだけ行う。
 * 機材リストの並び順自体は、addMobileBooking_内のfindMobileGroupInsertRow_で
 * 追加時に正しい位置へ挿入することで保っているため、ここでは並べ替えを行わない
 * （並べ替えると、既存グループ内のcamera/lensなどの整理用ラベル行の並びが
 * 崩れてしまうため）。
 * 期間重複のチェックだけは保存のたびに行い、重複があれば警告を返す
 * （セルの色付け自体は行わない＝ガントチャートへの書き込みはしない。
 * 色付けも次回の「ガントチャートを更新」で反映される）。
 */
function runMobileSavePipeline_(ss, affectedRow) {
  const overlapSummary = getEquipmentOverlapSummary(ss);
  if (overlapSummary) {
    return {
      ok: true,
      row: affectedRow,
      overlap: true,
      overlapMessage: overlapSummary,
      message: '機材リストに保存しました（期間重複の可能性があります）。ガントチャートへの反映は「ガントチャートを更新」で行ってください。'
    };
  }

  return {
    ok: true,
    row: affectedRow,
    overlap: false,
    message: '機材リストに保存しました。ガントチャートへの反映は「ガントチャートを更新」で行ってください。'
  };
}

/**
 * 「ガントチャートを更新」ボタンから呼ばれる、手動でのガントチャート全体更新。
 * PCのメニュー実行・A1チェックボックスと同じ処理内容（単価・予算集計・
 * ガントチャート全体の再構築）を、スマホアプリからいつでも呼べるようにしたもの。
 * 期間重複がある場合は、以前の自動更新時と同じく重複セルの色付けだけ行い、
 * 単価・予算集計・ガントチャート全体の再構築は行わない（金額を誤って
 * 計算しないための安全策）。
 */
/**
 * 【2026/8/24修正】以前はここでガントチャートの再構築だけを行い、PC側のA1チェックボックス
 * （handleGanttTriggerEdit）が書き込んでいる「B1セルの更新完了時刻」には触れていなかった。
 * そのため、アプリから更新しても、シートを見ている人には「いつ更新されたか」が
 * まったく伝わらなかった（A1のチェックは処理が終わると自動的に外れるだけの一時的な
 * 表示のため、本当に人が見ている目印はB1セルの「✅ 更新完了: HH:mm:ss」の方）。
 * PCのA1チェックボックス経由の処理とできるだけ同じ内容をB1セルに書き込むようにし、
 * アプリからの更新でも同じように「いつ更新されたか」が分かるようにした。
 */
function refreshMobileGanttChart_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GANTT_SHEET_NAME);
  const statusCell = sheet.getRange(STATUS_CELL);
  const triggerCell = sheet.getRange(TRIGGER_CELL);

  // 【2026/8/24追加】PCでA1のチェックボックスを押したときと同じ見た目になるよう、
  // アプリから更新するときもA1に一時的にチェックを入れる（処理が終わったら必ず外す）。
  // Apps Scriptから値を書き換えるだけなので、onEditのトリガーが二重に動くことはない
  // （onEditは人がセルを編集したときだけ発火し、スクリプトによる書き換えでは発火しないため）。
  triggerCell.setValue(true);
  statusCell.setValue('🔎 重複を確認中...（アプリから更新）');
  SpreadsheetApp.flush();

  const overlapSummary = getEquipmentOverlapSummary(ss);
  if (overlapSummary) {
    try {
      updateOverlappingCellsOnly(ss);
    } catch (highlightError) {
      Logger.log('重複セル色付けエラー: ' + highlightError.message);
    }
    const nowOverlap = new Date();
    const timeStrOverlap = Utilities.formatDate(nowOverlap, Session.getScriptTimeZone(), 'HH:mm:ss');
    statusCell.setWrap(true);
    statusCell.setValue(
      overlapSummary +
      '\n\n重複を直してから、もう一度更新してください（単価・予算の更新は行われていません）\n確認時刻: ' + timeStrOverlap + '（アプリから）'
    );
    triggerCell.setValue(false);
    return {
      ok: true,
      overlap: true,
      overlapMessage: overlapSummary,
      message: '期間重複があるため、重複箇所の色付けのみ更新しました。単価・予算・ガントチャート全体の再構築は行われていません。'
    };
  }

  statusCell.setValue('⏳ 更新中...（アプリから更新）');
  SpreadsheetApp.flush();

  try {
    updateAllGanttCore();
    updatePricesAndTotals();
    removeAdditionalEquipmentListSheet();
    updateBudgetSummary();
  } catch (updateError) {
    Logger.log('モバイルAPI ガント更新エラー: ' + updateError.message);
    statusCell.setValue('❌ 更新エラー: ' + updateError.message);
    triggerCell.setValue(false);
    return {
      ok: false,
      error: 'ガントチャートの更新中にエラーが発生しました: ' + updateError.message
    };
  }

  const now2 = new Date();
  const timeStr2 = Utilities.formatDate(now2, Session.getScriptTimeZone(), 'HH:mm:ss');
  statusCell.setValue('✅ 更新完了: ' + timeStr2 + '（アプリから）');
  triggerCell.setValue(false);

  return { ok: true, overlap: false, message: 'ガントチャートを更新しました。' };
}
