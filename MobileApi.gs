/**
 * ===================================================================
 * モバイルアプリ（PWA）用のWeb API（2026/8/22追加）
 * ===================================================================
 * 機材シート2026のデータを、スマホ用の別アプリ（PWA）から読み書きできるように
 * するための窓口（Web App）。PC版のGoogleスプレッドシートはそのまま変更せず、
 * データの保存場所（機材リストシート）を共通にすることで、PCとスマホで
 * 同じデータを見られるようにする。
 *
 * 【2026/8/27変更】社員ごとに別々の合言葉（トークン）を発行できるようにした。
 * 以前は全員共通の1つの合言葉（MOBILE_API_TOKEN）だけで守られていたが、これだと
 * 「誰が操作したか分からない」「1人だけアクセスを止められない（全員分を変えるしかない）」
 * という問題があった。社員は機材シート2026のスプレッドシート自体（PC版）も直接見られる
 * ため、合言葉をシートの中に置くと全員に見えてしまい危険。そこで、合言葉は
 * スプレッドシートの外側にあるApps Scriptの「スクリプト プロパティ」という場所に保存する
 * （Apps Scriptプロジェクトの編集権限を持つ人＝中村さんだけが見られる場所）。
 *
 * 【社員を追加する方法（コードを触らずにできる）】
 * 1. Apps Scriptエディタの左メニュー、歯車アイコン「プロジェクトの設定」を開く
 * 2. 一番下の「スクリプト プロパティ」→「スクリプト プロパティを追加」
 * 3. プロパティ名に「mobile_token_（社員名など、分かればよい任意の名前）」
 *    例: mobile_token_田中
 * 4. 値に、その人専用の合言葉（他人に推測されないランダムな英数字20文字程度）を入力
 * 5. 「スクリプト プロパティを保存」を押す
 * 6. その社員に、Webアプリのurlと、今設定した合言葉をアプリの設定画面に入力してもらう
 * （コードの変更・再デプロイは不要。プロパティを保存した瞬間から使える）
 *
 * 【社員のアクセスを止める方法】
 * 同じ「スクリプト プロパティ」画面で、その人の行のゴミ箱アイコンを押して削除するだけ。
 * 削除した瞬間からその合言葉は使えなくなる。
 *
 * 【誰が使ったかの記録】
 * 予約の追加・編集・削除・ガントチャート更新をすると、シート内に自動でできる
 * 「アクセスログ」タブに、日時・社員名（プロパティ名から自動判定）・操作内容が記録される。
 * 一覧の閲覧（bookings等の読み取り）はログが多くなりすぎるため記録していない。
 *
 * 【はじめての人（中村さん）が最初にやること】
 * 上記の手順で、まず自分自身の分を1件登録してから使い始めてください
 * （例: mobile_token_中村 に、今まで使っていた合言葉、または新しい合言葉を設定）。
 *
 * 【Web Appのデプロイ設定（変更なし）】
 * 1. Apps Scriptエディタ右上の「デプロイ」→「新しいデプロイ」
 * 2. 種類の選択で歯車アイコン→「ウェブアプリ」を選ぶ
 * 3. 「次のユーザーとして実行」は「自分（自分のメールアドレス）」
 * 4. 「アクセスできるユーザー」は「全員」を選ぶ
 *    （↑ここが「全員」になっていないと、スマホ側からアクセスできない。
 *      その代わり、各社員専用の合言葉が実質的な鍵になる）
 * 5. 「デプロイ」を押す→初回は権限確認画面が出るので許可する
 * 6. 発行された「ウェブアプリのURL」（.../exec で終わるもの）をコピーする
 * 7. ブラウザで「そのURL + ?action=bookings&token=（自分用に設定した合言葉）」を開き、
 *    JSON形式でデータが返ってくれば成功
 *
 * 【コードを変更したとき】
 * doGet/doPostの中身を直しても、それだけでは公開中のWeb Appには反映されない。
 * 「デプロイ」→「デプロイを管理」→ 既存のデプロイの鉛筆アイコン→
 * 「バージョン」を「新バージョン」にして「デプロイ」を押す必要がある
 * （URLは変わらないので、スマホ側の設定を変える必要はない）。
 * ===================================================================
 */

// スクリプト プロパティに保存する、社員トークンのキー名の接頭辞。
// 「mobile_token_田中」のように、この後ろに社員名などを付けて1人1件登録する。
const MOBILE_TOKEN_KEY_PREFIX = 'mobile_token_';

// 予約の追加・編集・削除・ガントチャート更新のログを記録するシート名。
const MOBILE_LOG_SHEET_NAME = 'アクセスログ';

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
 *     .../exec?action=initData&token=xxx （2026/8/27追加。アプリ起動時に必要な
 *       データ（機材・カテゴリ別機材・発注先・作品名・予約一覧）をまとめて返す）
 */
function doGet(e) {
  try {
    const employeeName = findMobileTokenOwner_(e && e.parameter ? e.parameter.token : null);
    if (!employeeName) {
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
    // 【2026/8/27追加・速度改善】アプリ起動時、以前はbookings/equipment/
    // equipmentByCategory/supplierList/projectListの5回に分けて通信していたが、
    // 通信の回数が多いほどApps Script側の呼び出しごとのオーバーヘッドが積み重なり
    // 遅くなるため、起動時に必要な5種類のデータをまとめて1回で返すactionを追加した。
    // 既存の各actionはそのまま残しているので、他の用途（保存後の予約一覧だけの
    // 再取得など）にはこれまで通り個別のactionを使い続けて問題ない。
    if (action === 'initData') {
      return mobileApiJson_({
        ok: true,
        equipment: getMobileEquipmentList_(),
        categories: getMobileEquipmentByCategory_(),
        suppliers: getMobileSupplierList_(),
        projects: getMobileProjectList_(),
        bookings: getMobileBookings_(e)
      });
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
    const employeeName = findMobileTokenOwner_(body.token);
    if (!employeeName) {
      return mobileApiError_('トークンが正しくありません');
    }
    const action = body.action;
    if (action === 'addBooking') {
      const result = addMobileBooking_(body);
      if (result && result.ok) {
        logMobileAccess_(employeeName, '予約追加', (body.project || '') + ' / ' + (body.equipment || ''));
      }
      return mobileApiJson_(result);
    }
    // 【2026/8/27追加・速度改善】新規追加画面は「機材を選んでリストに追加」を繰り返す
    // 複数選択式のため、以前は機材1件ごとに別々の通信（addBooking）を行っていた。
    // 機材が多いほど通信回数が増え、その分Apps Script側の呼び出しごとのオーバーヘッドと
    // 重複チェック（シート全体の読み直し）が積み重なって遅くなっていたため、
    // 選択済みの機材をまとめて1回の通信で送り、サーバー側でも重複チェックを最後に
    // 1回だけ行うようにした。
    if (action === 'addBookingsBatch') {
      const result = addMobileBookingsBatch_(body);
      if (result && result.ok) {
        const savedNames = (result.results || []).filter(r => r.ok).map(r => r.equipment);
        if (savedNames.length) {
          logMobileAccess_(employeeName, '予約追加（まとめて' + savedNames.length + '件）', (body.project || '') + ' / ' + savedNames.join('、'));
        }
      }
      return mobileApiJson_(result);
    }
    if (action === 'updateBooking') {
      const result = updateMobileBooking_(body);
      if (result && result.ok) {
        logMobileAccess_(employeeName, '予約編集', (body.row !== undefined ? ('行' + body.row + ' ') : '') + (body.project || '') + ' / ' + (body.equipment || ''));
      }
      return mobileApiJson_(result);
    }
    if (action === 'deleteBooking') {
      const result = deleteMobileBooking_(body);
      if (result && result.ok) {
        logMobileAccess_(employeeName, '予約削除', '行' + body.row);
      }
      return mobileApiJson_(result);
    }
    if (action === 'refreshGantt') {
      const result = refreshMobileGanttChart_();
      logMobileAccess_(employeeName, 'ガントチャート更新', '');
      return mobileApiJson_(result);
    }
    return mobileApiError_('不明なaction: ' + action);
  } catch (err) {
    Logger.log('doPostエラー: ' + err.message);
    return mobileApiError_(err.message);
  }
}

/**
 * リクエストに付いてきたトークンが、スクリプト プロパティに登録されている
 * 社員トークンのどれかと一致するか調べる。一致すれば、プロパティ名から
 * 「mobile_token_」を取り除いた部分（社員名など）を返す。一致しなければnull。
 */
function findMobileTokenOwner_(token) {
  if (!token) return null;
  const props = PropertiesService.getScriptProperties().getProperties();
  for (const key in props) {
    if (key.indexOf(MOBILE_TOKEN_KEY_PREFIX) === 0 && props[key] === token) {
      return key.substring(MOBILE_TOKEN_KEY_PREFIX.length);
    }
  }
  return null;
}

/**
 * 予約の追加・編集・削除・ガントチャート更新の操作を、シート内の「アクセスログ」タブに
 * 1行ずつ記録する（誰がやったか分かるように）。タブが無ければ自動作成する。
 * 一覧の閲覧（読み取りだけのaction）は記録が膨大になるため対象外にしている。
 */
function logMobileAccess_(employeeName, action, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(MOBILE_LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(MOBILE_LOG_SHEET_NAME);
      sheet.appendRow(['日時', '社員名', '操作', '詳細']);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    }
    ensureMobileLogAnnotation_(sheet);
    sheet.appendRow([new Date(), employeeName, action, detail || '']);
  } catch (logErr) {
    Logger.log('アクセスログの記録に失敗: ' + logErr.message);
  }
}

/**
 * 【2026/8/29追加】「アクセスログ」シートの一番上に、常に見える注記の行を付ける。
 * 新しい記録は（並べ替えなどをしていない限り）シートの一番下に追加される仕組みで、
 * 「新着が上に来ると思っていて見落とした」ということが実際にあったため、その点と、
 * PC側（メールアドレス）とアプリ側（社員名）で記録される名前の形式が違う点を明記する
 * （機材使用率タブの注記と同じく、ホバーしないと見えないセルの注釈ではなく、
 * 常に見える行にした）。
 *
 * すでに大量の記録が入っている既存のシートにも、データを消さずに反映できるよう、
 * 1行目がまだ旧ヘッダー（'日時'）のままなら、その上に1行差し込んで注記を入れる
 * （＝既存の記録行は1行下にずれるだけで、内容はそのまま残る）。
 * 1行目がすでに注記済みなら何もしない（保存のたびに毎回呼ばれるが、2回目以降は
 * セル1個の読み取りだけで済む軽い処理）。
 */
function ensureMobileLogAnnotation_(sheet) {
  var firstCell = sheet.getRange(1, 1).getValue();
  if (String(firstCell).indexOf('このシートは') !== -1) {
    return; // すでに注記済み（先頭に「※ 」が付くため、位置ではなく含まれるかで判定する）
  }
  if (firstCell === '日時') {
    sheet.insertRowBefore(1); // 旧ヘッダー・既存の記録行はそのまま1行下にずれる
  }
  sheet.getRange(1, 1, 1, 4).merge();
  sheet.getRange(1, 1).setValue(
    '※ このシートは、予約の追加・編集・削除・ガントチャート更新の操作記録です。新しい記録は一番下に追加されます（新しい順に並んでいるわけではありません）。' +
    'PC（マスターガントチャートのA1チェックボックス）からの操作はGoogleアカウントのメールアドレスで、スマホアプリからの操作は社員名で記録されます。'
  );
  sheet.getRange(1, 1).setFontStyle('italic').setFontColor('#5b5f7a').setFontSize(10)
    .setWrap(true).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(2);
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
    const newRow = findMobileGroupInsertRow_(sheet, body.project, startDate);
    if (newRow <= lastRow) {
      sheet.insertRowBefore(newRow); // 既存の行をずらして、その位置に空き行を作る
    }
    // 【2026/8/27速度改善】以前はA〜G列を1列ずつ計7回setValue()していたが、
    // Apps ScriptはSpreadsheetサービスを呼ぶたびに毎回オーバーヘッドがかかるため、
    // 呼び出し回数が多いほど遅くなる。A〜G列は連続した列なので、1回のsetValues()に
    // まとめて書き込み回数を7回→1回に減らし、保存にかかる時間を短縮した
    // （書き込む内容自体は変えていない）。
    const rowValues = [
      sanitizeMobileText_(body.project),
      body.equipment,
      sanitizeMobileQuantity_(body.quantity),
      startDate,
      endDate,
      sanitizeMobileText_(body.supplier || ''),
      sanitizeMobileText_(body.note || '')
    ];
    sheet.getRange(newRow, BOOKING_COL_PROJECT, 1, rowValues.length).setValues([rowValues]);

    return runMobileSavePipeline_(ss, newRow);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 【2026/8/27追加・速度改善】複数の機材をまとめて一度に追加する（新規追加画面の
 * 「機材を選んでリストに追加」を繰り返した結果を、1回の通信でまとめて保存するため）。
 * body.items は addMobileBooking_のbodyから token/action/project を除いたものの配列
 * （{equipment, quantity, supplier, startDate, endDate, note}）。
 * body.project は全件共通（新規追加画面は1つの作品名に対して機材を複数選ぶ作りのため）。
 *
 * addMobileBooking_をそのままitems.length回呼ぶのではなく、次の2点をまとめることで
 * 高速化している。
 * 1. 挿入位置探し（findMobileGroupInsertRow_、機材リスト全列を読む処理）は、
 *    同じ作品名グループへの追加なので最初の1件だけ行えば良い。2件目以降は
 *    「その直前に追加した行のすぐ下」に順番に挿入していく（挿入するたびに
 *    それより下の行番号が1つずつ下がるため、この位置はそのまま使い続けられる）。
 * 2. 期間重複チェック（getEquipmentOverlapSummary、シート全体を読み直す処理）は、
 *    1件ごとではなく全件書き込み終わったあとに1回だけ行う。
 */
function addMobileBookingsBatch_(body) {
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
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return { ok: false, error: '機材を1つ以上リストに追加してください' };
    }

    const equipmentList = getMobileEquipmentList_();
    // 先に全件を検証する（書き込みは1件も行わず、内容のチェックだけ）。
    // 機材名の不一致・日付の形式ミスなどがあった行は、書き込まずにエラーとして返す
    // （他の正しい行はそのまま保存される＝1件のミスで全滅させない）。
    const checked = items.map(function (item) {
      if (equipmentList.indexOf(item.equipment) === -1) {
        return { ok: false, equipment: item.equipment, error: '機材名がマスターガントチャートの一覧と一致しません: ' + item.equipment };
      }
      const startDate = parseMobileDate_(item.startDate);
      const endDate = parseMobileDate_(item.endDate);
      if (!startDate || !endDate) {
        return { ok: false, equipment: item.equipment, error: '開始日・終了日の形式が正しくありません（例: 2026/09/01）' };
      }
      if (startDate > endDate) {
        return { ok: false, equipment: item.equipment, error: '開始日が終了日より後になっています' };
      }
      return { ok: true, equipment: item.equipment, item: item, startDate: startDate, endDate: endDate };
    });

    // 挿入位置は最初の1回だけ探す。
    // 【2026/8/29追加】新しい作品名を開始日順に挿入する際、まとめて追加する複数機材の
    // 中で一番早い開始日を代表値として使う（このバッチはすべて同じ作品名なので、
    // 最も早い予定を基準にしておけば、その作品グループ全体が正しい位置に収まる）。
    const okItemsForSort = checked.filter(function (c) { return c.ok; });
    let earliestStartDate = null;
    okItemsForSort.forEach(function (c) {
      if (!earliestStartDate || c.startDate < earliestStartDate) earliestStartDate = c.startDate;
    });
    const insertRow = findMobileGroupInsertRow_(sheet, body.project, earliestStartDate);
    const currentLastRow = sheet.getLastRow();
    const okItems = checked.filter(function (c) { return c.ok; });

    // 【2026/8/28速度改善】以前はここで機材1件ごとに「insertRowBefore（行を1行ずらす）」
    // →「setValues（その1行に書き込む）」を繰り返していた。件数ぶん通信回数が増えるだけ
    // でなく、行の挿入・削除は機材リストシートにかかっている条件付き書式・入力規則
    // （何千行にもわたって設定されている）を毎回ずらし直す必要があり、Googleスプレッド
    // シート側でとりわけ時間のかかる操作になっている。以前の計測で「18件の追加で
    // 約20秒」かかっていたのはこれが主な原因。
    // 保存する機材はすべて同じ作品名グループの連続した位置にまとめて挿入するので、
    // 必要な行数ぶんを1回のinsertRowsBefore()でまとめて確保し、書き込みも1回の
    // setValues()にまとめることで、この「行ずらし」コストをitems.length回→1回に
    // 減らした（書き込む内容自体は変えていない）。
    if (okItems.length > 0) {
      if (insertRow <= currentLastRow) {
        sheet.insertRowsBefore(insertRow, okItems.length); // 必要な行数ぶん、まとめて空き行を作る
      }
      const valuesMatrix = okItems.map(function (c) {
        return [
          sanitizeMobileText_(body.project),
          c.equipment,
          sanitizeMobileQuantity_(c.item.quantity),
          c.startDate,
          c.endDate,
          sanitizeMobileText_(c.item.supplier || ''),
          sanitizeMobileText_(c.item.note || '')
        ];
      });
      sheet.getRange(insertRow, BOOKING_COL_PROJECT, okItems.length, 7).setValues(valuesMatrix);
      okItems.forEach(function (c, i) { c.savedRow = insertRow + i; });
    }

    // 期間重複チェックは全件書き込み終わったあとに1回だけ行う。
    const pipeline = runMobileSavePipeline_(ss, null);

    return {
      ok: true,
      results: checked.map(function (c) {
        return c.ok
          ? { ok: true, equipment: c.equipment, row: c.savedRow }
          : { ok: false, equipment: c.equipment, error: c.error };
      }),
      overlap: pipeline.overlap,
      overlapMessage: pipeline.overlapMessage,
      message: pipeline.message
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 新しい予約をどの行に挿入するか決める（2026/8/24再設計、2026/8/29修正）。
 * ルール:
 * ・A列が「*」で始まる行（*Camera, *Lensなどの整理用ラベル行）はマッチ対象から除外する
 *   （実際の作品名ではないため）。
 * ・作品名が完全一致、または前方一致（例:「大追跡2」で始まる「大追跡2 Bcam」なども
 *   同じグループとみなす）する行のうち、一番下にあるものを探す。
 * ・見つかったら、その行のすぐ下に挿入する＝既存グループの並び順は一切変えず、
 *   グループの最後尾に追加する。
 * ・【2026/8/29修正】1件も見つからない場合（本当に新しい作品名）は、以前は必ず
 *   実データの一番上に挿入していたが、「新しい作品名は一番上ではなく開始日順に
 *   並んでほしい」との要望に対応し、既存の各作品グループの最も早い開始日と
 *   比較して、日付順に収まる位置（＝開始日が新しい予約より後になる最初の
 *   グループの直前）に挿入するようにした。すべてのグループより開始日が
 *   遅い（＝一番未来の予定である）場合は、データの一番下に追加する。
 *   なお、既存グループへの追加（作品名が一致した場合）の並び順は今まで通り
 *   変更していない（グループ内の順番や、*Camera等のラベル行の位置を壊さない
 *   ため、あえて日付順の並べ替えはグループ内には適用しない）。
 */
function findMobileGroupInsertRow_(sheet, projectName, startDateForSort) {
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

  if (lastMatchRow !== -1) {
    return lastMatchRow + 1; // 既存の同じ作品グループの最後尾の直後（従来通り）
  }

  // ここから先は「本当に新しい作品名」の場合。開始日を基準に挿入位置を探す。
  // 開始日が渡されていない・解釈できない異常系は、従来通り安全側（一番上）に倒す。
  if (!(startDateForSort instanceof Date) || isNaN(startDateForSort.getTime())) {
    return BOOKING_DATA_START_ROW;
  }

  // 行を上から順に見ていき、「作品名が変わった行」を新しいグループの先頭とみなして、
  // グループごとの最も早い開始日（groupMinDate）を求める。
  const startCol = sheet.getRange(BOOKING_DATA_START_ROW, BOOKING_COL_START, numRows, 1).getValues();
  const groups = []; // { row: グループ先頭の行番号, minDate: そのグループの最も早い開始日 }
  let curName = null;
  let curGroup = null;

  function isSameGroup(a, b) {
    return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  for (let i = 0; i < numRows; i++) {
    const raw = projects[i][0];
    const name = raw ? String(raw).trim() : '';
    if (!name || name.indexOf('*') === 0) continue; // 空欄・整理用ラベル行は無視（グループ扱いしない）

    const rowNum = i + BOOKING_DATA_START_ROW;
    const rowDateRaw = startCol[i][0];
    const rowDate = (rowDateRaw instanceof Date && !isNaN(rowDateRaw.getTime())) ? rowDateRaw : null;

    if (curGroup && isSameGroup(name, curName)) {
      if (rowDate && (!curGroup.minDate || rowDate < curGroup.minDate)) {
        curGroup.minDate = rowDate;
      }
    } else {
      curGroup = { row: rowNum, minDate: rowDate };
      curName = name;
      groups.push(curGroup);
    }
  }

  for (let g = 0; g < groups.length; g++) {
    if (groups[g].minDate && groups[g].minDate.getTime() > startDateForSort.getTime()) {
      return groups[g].row; // このグループより開始日が早い→この直前に挿入
    }
  }
  return lastRow + 1; // どのグループより開始日が遅い（一番未来）→ データの一番下に追加
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

    // 【2026/8/27速度改善】以前は変更のあった項目ごとに1つずつsetValue()を呼んでいたが
    // （最大6回）、addMobileBooking_と同じ理由でこれをまとめる。A〜G列を一度だけ
    // 読み込み、変更があった項目だけ書き換えたうえで、最後に1回のsetValues()で
    // まとめて書き戻す（変更が1つもない場合は書き込み自体を行わない）。
    // あわせて、以前は日付の形式チェックでエラーになった場合でも、それより前の
    // 項目（作品名など）はすでに書き込まれてしまっていたが、この変更により
    // 全項目の検証が終わってからまとめて書き込むようになったため、その中途半端な
    // 書き込みも起きなくなった。
    const existingRow = sheet.getRange(row, BOOKING_COL_PROJECT, 1, 7).getValues()[0];
    let rowChanged = false;
    if (body.project !== undefined) { existingRow[BOOKING_COL_PROJECT - 1] = sanitizeMobileText_(body.project); rowChanged = true; }
    if (body.equipment !== undefined) { existingRow[BOOKING_COL_EQUIPMENT - 1] = body.equipment; rowChanged = true; }
    if (body.quantity !== undefined) { existingRow[BOOKING_COL_QUANTITY - 1] = sanitizeMobileQuantity_(body.quantity); rowChanged = true; }
    if (body.startDate !== undefined) {
      const startDate = parseMobileDate_(body.startDate);
      if (!startDate) return { ok: false, error: '開始日の形式が正しくありません（例: 2026/09/01）' };
      existingRow[BOOKING_COL_START - 1] = startDate;
      rowChanged = true;
    }
    if (body.endDate !== undefined) {
      const endDate = parseMobileDate_(body.endDate);
      if (!endDate) return { ok: false, error: '終了日の形式が正しくありません（例: 2026/09/01）' };
      existingRow[BOOKING_COL_END - 1] = endDate;
      rowChanged = true;
    }
    if (body.supplier !== undefined) { existingRow[BOOKING_COL_SUPPLIER - 1] = sanitizeMobileText_(body.supplier); rowChanged = true; }
    if (body.note !== undefined) { existingRow[BOOKING_COL_NOTE - 1] = sanitizeMobileText_(body.note); rowChanged = true; }
    if (rowChanged) {
      sheet.getRange(row, BOOKING_COL_PROJECT, 1, 7).setValues([existingRow]);
    }
    if (body.returnCheck !== undefined) sheet.getRange(row, BOOKING_COL_RETURN_CHECK).setValue(body.returnCheck);

    return runMobileSavePipeline_(ss, row);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 予約の削除。
 * 【2026/8/28速度改善】以前はsheet.deleteRow(row)で行そのものを削除していたが、
 * 機材リストシートには何千行にもわたる条件付き書式・入力規則が設定されており、
 * 行の削除（＝それより下の行がすべて1つずつ繰り上がる）のたびにこれらを
 * ずらし直す必要があるため、特に時間のかかる操作になっていた（実測で1件の
 * 削除に約10秒）。行を削除するかわりに「その行の中身だけを空にする」方式に
 * 変更した。行そのものは残るため、他の行がずれ直す処理が発生せず、大幅に速くなる。
 * 空になった行は、一覧の取得・重複チェックなど（機材名が空の行は元々無視する
 * つくりになっている）には影響しないが、機材リスト上には空白行として残る。
 * これは「ガントチャートを更新」を押したときに、まとめて詰めて片付けるように
 * した（compactMobileBookingSheet_、refreshMobileGanttChart_から呼び出し）。
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

    // A列（作品名）〜I列（金額）までの実データ列だけを空にする（行自体は削除しない）。
    sheet.getRange(row, BOOKING_COL_PROJECT, 1, BOOKING_COL_PRICE - BOOKING_COL_PROJECT + 1).clearContent();

    // 【2026/8/27速度改善】追加・編集のあとは「新たに重複が発生していないか」を
    // 確認する必要があるためシート全体を読み直して重複チェックしているが、
    // 削除は予約を1件減らすだけの操作なので、他の予約同士の重複関係が
    // 削除によって新たに発生することは理論上あり得ない（今回削除した予約が
    // 関係していた重複が解消される可能性があるだけ）。そのため削除のときだけは
    // この重複チェックを省略し、その分だけ高速化した。ガントチャート上の見た目
    // （赤いセルなど）は「ガントチャートを更新」を押したときに正しく再計算される。
    return {
      ok: true,
      row: null,
      overlap: false,
      message: '機材リストから削除しました。ガントチャートへの反映は「ガントチャートを更新」で行ってください。'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 【2026/8/28追加】deleteMobileBooking_で「削除」の代わりに中身だけ空にした行を、
 * まとめて片付ける（実際に行を取り除く）。1件消すたびに片付けると、それはそれで
 * 行の削除と同じだけ時間がかかってしまい意味がないため、「ガントチャートを更新」を
 * 押したタイミングでまとめて1回だけ行う。
 * 「空行」の判定は、削除時にclearContentする範囲（A列〜I列）がすべて空になっている
 * 行だけを対象にする。A列（作品名）だけに「*Camera」のような整理用ラベルが手動で
 * 入っている行はB列（機材名）が空でもA列には値があるため対象にならず、誤って
 * 消してしまうことはない。
 * 下の行から上へ向かって、連続した空行のかたまりごとにまとめて削除する
 * （上から削除すると、それより下の行番号がずれてしまうため、必ず下から処理する）。
 */
function compactMobileBookingSheet_(ss) {
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < BOOKING_DATA_START_ROW) return 0;
  const numRows = lastRow - BOOKING_DATA_START_ROW + 1;
  const data = sheet.getRange(BOOKING_DATA_START_ROW, 1, numRows, BOOKING_COL_PRICE).getValues();

  const isBlankRow = data.map(function (row) {
    return row.every(function (v) { return v === '' || v === null; });
  });

  let removedCount = 0;
  let i = numRows - 1;
  while (i >= 0) {
    if (!isBlankRow[i]) { i--; continue; }
    let j = i;
    while (j >= 0 && isBlankRow[j]) j--;
    // インデックス(j+1)〜iが、連続した空行のかたまり
    const blockStartRow = (j + 1) + BOOKING_DATA_START_ROW;
    const blockEndRow = i + BOOKING_DATA_START_ROW;
    sheet.deleteRows(blockStartRow, blockEndRow - blockStartRow + 1);
    removedCount += (blockEndRow - blockStartRow + 1);
    i = j;
  }
  return removedCount;
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

  // 【2026/8/28追加】スマホからの削除で空のまま残っている行を、ここでまとめて片付ける。
  // 失敗してもガントチャート更新自体は続行できるよう、try/catchで囲んでおく。
  try {
    compactMobileBookingSheet_(ss);
  } catch (compactError) {
    Logger.log('機材リストの空行の片付けに失敗: ' + compactError.message);
  }

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
