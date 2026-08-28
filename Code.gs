/**
 * ===================================================================
 * 2025.2026機材リスト_スプレッドシート — 管理スクリプト（第一弾・書き直し版）
 * ===================================================================
 *
 * 【このファイルについて】
 * 元のスクリプトを全て置き換える前提で書き直したものです。
 * 既存の機能（メニュー、更新ボタン、今日の日付へ移動、期間重複の警告と
 * ハイライト）はすべてそのまま踏襲しています。
 *
 * 【元のスクリプトから変更した点】
 * 1. ★重要: 機材リストの列位置のズレを修正（9月以降バグの本当の原因かもしれません）
 *    - 画面キャプチャから再現した元のスクリプトは「C列=開始日, D列=終了日,
 *      E列=発注先」という前提で書かれていましたが、実際のシートはヘッダー表示
 *      通り「C列=数量, D列=開始日, E列=終了日, F列=発注先」でした
 *      （2026/8/20、ユーザーに実データで確認済み）。
 *    - この1列分のズレにより、重複チェックやガントチャート反映の一部が、
 *      本来は数量が入っているC列を日付として読もうとして失敗していた
 *      可能性があります。空欄になりがちなC列を無理に日付として読むと、
 *      行によって成功したり失敗したりする不安定な挙動になり得るため、
 *      「9月以降だけ反映されない」という症状とも矛盾しません。
 *    - 今回、開始日・終了日・発注先・数量の列位置をすべて正しい
 *      D列・E列・F列・C列に修正しました。
 *
 * 2. 「9月以降ガントチャートに反映されない」対策（列ズレ修正に加えて）
 *    - jumpToTodayColumn() が使っていた「日付→文字列→日付」という
 *      往復変換をやめ、setHours(0,0,0,0) で直接正規化する方式に統一。
 *      文字列変換の往復は、日付によって解釈がずれて失敗することがある
 *      壊れやすい書き方でした（updateAllGanttCore側は元々setHours方式で
 *      問題なかったため、今回はjumpToTodayColumn側のみ修正しています）。
 *    - updateAllGanttCore() に「日付ヘッダーが読み取れない列」を検知して
 *      画面に警告を出す仕組みを追加。今後もし同じ症状が起きても、
 *      「◯列が読み取れていません」とすぐ分かるようにしました。
 *    - 【2026/8/21修正】この警告が、更新ボタンを押すたびに毎回表示されて
 *      しまう不具合がありました。原因は、GANTT_START_COL_LETTER＝E列が
 *      実データの前の空白の余白列であることを考慮しておらず、正常な状態
 *      でも「読み取れない列」として誤検知していたためです。E列（先頭）を
 *      チェック対象から除外し、誤警告が出ないようにしました。
 *
 * 3. 【廃止】「開始日・終了日を入力した瞬間に重複チェック」（2026/8/21廃止）
 *    - 一時追加していた、機材リストのD列・E列を編集した瞬間に重複を
 *      その場でブロックする機能は、2種類の重複チェックが分かりにくいと
 *      のご要望により廃止しました。重複チェックは更新ボタンを押した際の
 *      まとめチェック（getEquipmentOverlapSummary）のみになりました。
 *    - まとめチェックの警告文には、行番号に加えて作品名（A列）も
 *      表示するようにしました。
 *
 * 4. 未使用だった getEquipmentOverlapInfo() 関数は、どこからも呼ばれて
 *    いない重複コードだったため削除しました（動作に影響はありません）。
 *
 * 5. 【第二弾】価格参照シートとの自動金額反映（PriceData.gs）
 *    - 機材リストにI列「金額」を新規追加。価格参照シートのデータと
 *      機材名（B列）を完全一致で突き合わせ、一致した行だけ「数量×単価」
 *      の金額を自動反映します（数量が空欄の場合は1個として計算、
 *      明示的な0はそのまま0円）。
 *    - 2026/8/21追加: 発注先（F列）が入力されている行（外部レンタル品）
 *      は、完全一致が見つからない場合のみ部分一致（あいまい一致）で
 *      価格を探します。あいまい一致で見つかった金額には「 ※推定」と
 *      付けて区別します。発注先が空欄の行（自社在庫）は完全一致のみです。
 *    - setupPriceSheet() を一度だけ手動実行すると「価格参照」シートが
 *      作成されます。
 *
 * 6. 【廃止】追加機材一覧タブ（2026/8/21）
 *    - 一時追加していた「追加機材一覧」タブは廃止することになりました。
 *      既にスプレッドシート上に作成されている場合に備えて、更新ボタンを
 *      押すたびに該当シートがあれば自動的に削除します（PriceData.gs の
 *      removeAdditionalEquipmentListSheet()）。
 *
 * 5・6はいずれもガントチャート更新ボタンを押したときに自動的に実行され、
 * 手動でこれらの関数を個別に実行する必要はありません。
 * ===================================================================
 */

// ==================== 設定 ====================
const GANTT_SHEET_NAME = "マスターガントチャート";
const BOOKING_SHEET_NAME = "機材リスト";
const GANTT_START_COL_LETTER = "E";
const GANTT_START_ROW = 4;
const GANTT_EQUIPMENT_COL = 3;
const GANTT_DATE_ROW = 2;
const TRIGGER_CELL = "A1";
const STATUS_CELL = "B1";
const JUMP_TO_TODAY_CELL = "D1"; // モバイル版「今日の日付に移動」トリガー

// 機材リストの列位置
// ★2026/8/20修正: 元のスクリプト（画面キャプチャからの再現）はC=開始日,D=終了日,
// E=発注先という前提で書かれていましたが、実際のシートはヘッダー表示通り
// C=数量, D=開始日, E=終了日, F=発注先 でした（ユーザーに実データで確認済み）。
// この列ズレにより、重複チェックや一部のガントチャート反映が数量列を日付として
// 誤読していた可能性があります。9月以降反映されないバグの原因である可能性も
// あるため、正しい列位置に修正しています。
const BOOKING_COL_PROJECT = 1;   // A列: 作品名
const BOOKING_COL_EQUIPMENT = 2; // B列: 機材名
const BOOKING_COL_QUANTITY = 3;  // C列: 数量
const BOOKING_COL_START = 4;     // D列: 開始日
const BOOKING_COL_END = 5;       // E列: 終了日
const BOOKING_COL_SUPPLIER = 6;  // F列: 発注先
const BOOKING_COL_NOTE = 7;          // G列: 備考
const BOOKING_COL_RETURN_CHECK = 8;  // H列: 返却チェック

const PRICE_SHEET_NAME = "価格参照"; // 第二弾: 価格参照シートの名前
const RETURNED_MARKER = "返却済み";  // H列（返却チェック）が「返却済み」ならOK扱い
// ==================== 設定はここまで ====================


/**
 * スプレッドシートのタイムゾーンを取得するヘルパー関数
 */
function getSpreadsheetTimezone() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}


/**
 * スプレッドシートを開いたときに実行される関数
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ガントチャート管理')
    .addItem('【全範囲】ガントチャートを更新', 'updateAllGantt')
    .addSeparator()
    .addItem('初期設定：自動更新トリガーを有効化（初回のみ）', 'setupAutoUpdateTrigger')
    .addSeparator()
    .addItem('今日の日付へ移動', 'jumpToTodayColumn')
    .addSeparator()
    .addItem('日付入力欄にカレンダーを設定', 'setupDateValidation')
    .addSeparator()
    .addItem('発注先ありの行を色分け', 'setupSupplierHighlight')
    .addSeparator()
    .addItem('価格参照シートを作成（初回のみ）', 'setupPriceSheet')
    .addSeparator()
    .addItem('外部業者の料金データを価格参照シートに追加', 'importVendorPriceData')
    .addSeparator()
    .addItem('作品ごとの合計金額を集計', 'updateBudgetSummary')
    .addItem('返却忘れをチェック', 'checkOverdueReturns')
    .addItem('機材使用率を集計', 'updateEquipmentUsageRate')
    .addSeparator()
    .addItem('使用方法タブを作成・更新', 'setupUsageGuideSheet')
    .addToUi();
}


/**
 * 【新規追加・2026/8/21】機材リストのD列（開始日）・E列（終了日）に
 * 日付の入力規則（カレンダーピッカー）を設定する。
 * これを一度実行しておくと、空白のセルをタップ・クリックした時点から
 * カレンダーが表示されるようになる（今までは、一度手入力して日付として
 * 認識された後でないとカレンダーが出なかった）。
 * 日付以外の値を入力した場合は警告は出るが、入力自体は許可する
 * （「2025/9?」のような保留中のメモ的な入力を引き続きできるようにするため）。
 * メニューの「日付入力欄にカレンダーを設定」からいつでも再実行できる
 * （行を大量に追加した後などに再実行すると安心）。
 */
function setupDateValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('機材リストシートが見つかりません');
    return;
  }

  const lastRow = Math.max(sheet.getLastRow() + 200, 2000); // 今後の行追加分にも余裕を持たせる

  const rule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(true) // 日付以外を入力しても警告のみで、入力は許可する
    .setHelpText('日付を入力してください（例: 2026/9/1）')
    .build();

  const startRange = sheet.getRange(2, BOOKING_COL_START, lastRow - 1, 1); // D列: 開始日
  const endRange = sheet.getRange(2, BOOKING_COL_END, lastRow - 1, 1);     // E列: 終了日

  startRange.setDataValidation(rule);
  endRange.setDataValidation(rule);

  // 【2026/8/22追加】入力規則（データの検証）だけでは、空白セルの表示形式が
  // 「日付」になっていない場合にカレンダーが出ないことがあるため、
  // 表示形式も明示的に「日付」に設定する。これにより、まだ何も入力されて
  // いない空白セルでも、最初からカレンダーが表示されるようになる。
  startRange.setNumberFormat('yyyy/mm/dd');
  endRange.setNumberFormat('yyyy/mm/dd');

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `開始日・終了日にカレンダーを設定しました（${lastRow - 1}行分・空白セルも含みます）`, '日付入力規則', 5
  );
}


/**
 * 【新規追加・2026/8/21】機材リストのF列（発注先）が入力されている行を、
 * 薄いオレンジ色で自動的にハイライトする条件付き書式を設定する。
 * スクリプトで毎回色を塗るのではなく、Googleスプレッドシート本体の
 * 「条件付き書式」ルールとして設定するため、更新ボタンを押さなくても、
 * 発注先を入力した瞬間にその場で色が変わる。
 * メニューの「発注先ありの行を色分け」からいつでも再実行できる
 * （再実行しても同じルールが重複して増えることはない）。
 */
function setupSupplierHighlight() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('機材リストシートが見つかりません');
    return;
  }

  const lastRow = Math.max(sheet.getLastRow() + 200, 2000); // 今後の行追加分にも余裕を持たせる
  const range = sheet.getRange(2, 1, lastRow - 1, BOOKING_COL_PRICE); // A列〜I列（金額）まで色を付ける

  const formula = '=$F2<>""'; // F列（発注先）が空欄でなければ対象

  // 同じ数式のルールがすでにあれば、重複しないように一旦取り除く
  const existingRules = sheet.getConditionalFormatRules();
  const keptRules = existingRules.filter(rule => {
    const cond = rule.getBooleanCondition();
    if (!cond) return true;
    const values = cond.getCriteriaValues();
    return !(values && values[0] === formula);
  });

  const newRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground('#FFE0B2') // 薄いオレンジ色
    .setRanges([range])
    .build();

  keptRules.push(newRule);
  sheet.setConditionalFormatRules(keptRules);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '発注先ありの行を薄いオレンジ色にする設定を追加しました', '発注先の色分け', 5
  );
}


/**
 * 今日の日付の列にスクロールする関数
 * 【修正】文字列への変換往復をやめ、setHoursで直接正規化する安全な方式に変更
 */
function jumpToTodayColumn() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(GANTT_SHEET_NAME);
    if (!sheet) {
      SpreadsheetApp.getUi().alert('ガントチャートシートが見つかりません');
      return;
    }
    ss.setActiveSheet(sheet);

    const ganttStartCol = sheet.getRange(GANTT_START_COL_LETTER + "1").getColumn();
    const dateRange = sheet.getRange(GANTT_DATE_ROW, ganttStartCol, 1, sheet.getLastColumn() - ganttStartCol + 1);
    const dateValues = dateRange.getValues()[0];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    let todayColIndex = -1;
    for (let i = 0; i < dateValues.length; i++) {
      try {
        const cellDate = new Date(dateValues[i]);
        if (isNaN(cellDate.getTime())) continue;
        cellDate.setHours(0, 0, 0, 0);
        if (cellDate.getTime() === todayTime) {
          todayColIndex = i;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (todayColIndex === -1) {
      SpreadsheetApp.getActiveSpreadsheet().toast('今日の日付が見つかりませんでした', '日付移動', 3);
      return;
    }

    const targetCol = ganttStartCol + todayColIndex;
    sheet.setActiveRange(sheet.getRange(GANTT_START_ROW, targetCol));
    SpreadsheetApp.getActiveSpreadsheet().toast('今日の日付に移動しました', '日付移動', 2);
  } catch (e) {
    Logger.log('jumpToTodayColumnエラー: ' + e.message);
    SpreadsheetApp.getActiveSpreadsheet().toast('エラーが発生しました', '日付移動', 3);
  }
}


/**
 * セル編集時のトリガー処理本体（マスターガントチャートの更新ボタン/今日移動ボタン）。
 * 【2026/8/21変更】機材リストの即時重複ブロック機能は廃止し、
 * マスターガントチャートの更新ボタン/今日移動ボタンの処理のみを行う。
 * 重複チェックは更新ボタンを押したときのまとめチェックのみになった。
 *
 * 【2026/8/22変更】以前はこれを「onEdit」という名前の関数にして、
 * Apps Scriptが自動で呼び出す「簡易トリガー」として動かしていた。
 * しかし簡易トリガーには (1) 実行時間が最大30秒までしかない、
 * (2) SpreadsheetApp.getUi()（ポップアップ表示）を呼び出すとエラーになる、
 * という2つの制約があり、PC・モバイル問わずポップアップが出ない・
 * 処理が完了しないという不具合の原因になっていた。
 * そのため関数名を onEditInstallable に変え、通常の関数と同じ権限・実行時間（6分）で
 * 動く「インストール型トリガー」として登録する方式に変更した。
 * 登録には、メニューの「初期設定：自動更新トリガーを有効化」を一度だけ実行する必要がある
 * （setupAutoUpdateTrigger() 参照）。
 */
function onEditInstallable(e) {
  if (!e || !e.range) {
    Logger.log('onEdit: eパラメータが無効です');
    return;
  }
  try {
    const ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
    const range = e.range;

    let sheet;
    try {
      sheet = range.getSheet();
    } catch (sheetError) {
      Logger.log('onEdit: シート取得エラー: ' + sheetError.message);
      return;
    }

    let sheetName;
    try {
      sheetName = sheet.getName();
    } catch (nameError) {
      Logger.log('onEdit: シート名取得エラー: ' + nameError.message);
      return;
    }

    if (sheetName === GANTT_SHEET_NAME) {
      const editedCell = range.getA1Notation();
      handleGanttTriggerEdit(ss, sheet, range, editedCell);
      return;
    }
  } catch (globalError) {
    Logger.log('onEditグローバルエラー: ' + globalError.message);
    Logger.log('エラースタック: ' + globalError.stack);
  }
}

/**
 * 「初期設定：自動更新トリガーを有効化」メニューから実行する。
 * マスターガントチャートのA1/D1セル編集時にonEditInstallable()が動くように、
 * インストール型のonEditトリガーを登録する。何度実行しても、
 * 古いトリガーを消してから登録し直すので重複登録にはならない。
 * 実行すると初回のみGoogleの権限確認画面が出るので、指示に従って許可すること。
 */
function setupAutoUpdateTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditInstallable') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onEditInstallable')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '自動更新トリガーを設定しました。マスターガントチャートのA1セルのチェックボックスが使えるようになります。',
    '初期設定完了', 6
  );
}


/**
 * マスターガントチャートのトリガーセル（A1: 更新ボタン, D1: 今日に移動）の処理
 * 【元のロジックのまま】
 */
/**
 * 重複警告の本文（getEquipmentOverlapSummaryの戻り値）から、
 * 機材名だけを抜き出してトースト通知向けの短い文言を作る。
 * スマホ版Googleスプレッドシートアプリでは showModelessDialog による
 * ポップアップが表示されないため、代わりにtoast（画面下に一時的に出る通知）で
 * 「何が重複しているか」を伝える。
 */
function buildOverlapToastMessage_(overlapSummary) {
  const names = [];
  const regex = /機材名「(.+?)」/g;
  let m;
  while ((m = regex.exec(overlapSummary)) !== null) {
    names.push(m[1]);
  }
  if (names.length === 0) {
    return '⚠️ 期間重複が見つかりました。ガントチャートの赤いセルをご確認ください。';
  }
  return `⚠️ 期間重複あり（${names.length}件）: ${names.join('、')}（ガントチャートの赤いセルをご確認ください）`;
}

function handleGanttTriggerEdit(ss, sheet, range, editedCell) {
  // A1セル（ガントチャート更新トリガー）
  //
  // 【重要】onEditInstallable()経由の「インストール型トリガー」として呼ばれる前提。
  // これにより通常の関数と同じ権限・実行時間（6分）で動くため、
  // getUi()のポップアップ（showOverlapDialog）を安全に呼び出せる。
  //
  // 【2026/8/22再修正】toast（画面下の一時通知）はモバイル版Googleスプレッドシート
  // アプリでは表示されないことが実際のテストで確認できた。また、ポップアップが
  // 出るPCではtoastは単なる重複表示で不要とのことだった。そのため、toastは廃止し、
  // 警告内容はステータスセル（普通のセルの値）に直接書き込む方式に変更した。
  // セルの値はPC・モバイルどちらでも必ず同じように表示されるため、
  // これが一番確実にモバイルへ伝える方法になる。ポップアップはPC向けの
  // 補助的な表示として、失敗してもエラーにならないようtry/catchで囲ったまま残す。
  //
  // 【2026/8/22再々修正】期間重複がある間は、単価計算・予算集計・ガントチャート全体の
  // 再構築は行わない。ただし赤い塗りつぶし（updateOverlappingCellsOnly）だけは実行し、
  // 「どこが重複しているか」がガントチャート上でひと目で分かる状態を保つ。
  // 警告文はステータスセルに書いたまま自動で消さず、重複を直して再度更新ボタンを
  // 押すまでそのまま残す。
  if (editedCell === TRIGGER_CELL) {
    const value = range.getValue();
    if (value === true) {
      const statusCell = sheet.getRange(STATUS_CELL);
      try {
        // 【2026/8/22追加】重複が解消しきっていない間、警告文の内容がほぼ変わらず、
        // 更新ボタンを押したこと自体が反映されているのか分かりにくいという指摘があった。
        // そのため、判定に入る前に必ず一度「🔎 確認中...」を書き込んでから処理する。
        // これでボタンを押すたびに必ず表示が変化し、動いていることが分かるようになる。
        statusCell.setValue('🔎 重複を確認中...');
        SpreadsheetApp.flush();

        const overlapSummary = getEquipmentOverlapSummary(ss);
        if (overlapSummary) {
          try {
            showOverlapDialog(overlapSummary);
          } catch (dialogError) {
            Logger.log('ポップアップ表示エラー（無視して続行）: ' + dialogError.message);
          }
          // 赤い塗りつぶしだけは反映する（単価・予算集計・全体再構築は行わない）
          try {
            updateOverlappingCellsOnly(ss);
          } catch (highlightError) {
            Logger.log('重複セル色付けエラー: ' + highlightError.message);
          }
          const nowOverlap = new Date();
          const timeStrOverlap = Utilities.formatDate(nowOverlap, Session.getScriptTimeZone(), 'HH:mm:ss');
          // 【2026/8/22変更】PCのポップアップと同じように、行番号・作品名・期間を
          // 改行付きで見せてほしいという要望に対応。機材名の一覧だけの短い文言ではなく、
          // getEquipmentOverlapSummary()が作る詳細な本文（overlapSummary）をそのまま
          // ステータスセルに書き込む。改行が潰れて見えないと意味がないので、
          // セルの「テキストの折り返し」もあわせて有効にしておく。
          statusCell.setWrap(true);
          statusCell.setValue(
            overlapSummary +
            '\n\n重複を直してから、もう一度更新ボタンを押してください（単価・予算の更新は行われていません）\n確認時刻: ' + timeStrOverlap
          );
          range.setValue(false);
          return;
        }
        // 重複がない場合は通常の全チャート更新
        statusCell.setValue('⏳ 更新中...');
        SpreadsheetApp.flush();
        updateAllGanttCore();
        try {
          updatePricesAndTotals();
          removeAdditionalEquipmentListSheet();
          updateBudgetSummary();
        } catch (priceError) {
          Logger.log('単価更新/追加機材一覧シート削除エラー: ' + priceError.message);
        }
        const now2 = new Date();
        const timeStr2 = Utilities.formatDate(now2, Session.getScriptTimeZone(), 'HH:mm:ss');
        statusCell.setValue('✅ 更新完了: ' + timeStr2);
      } catch (error) {
        Logger.log('更新エラー: ' + error.message);
        Logger.log('エラースタック: ' + error.stack);
        statusCell.setValue('❌ 更新エラー: ' + error.message);
      } finally {
        range.setValue(false);
      }
    }
  }

  // D1セル（今日の日付に移動トリガー - モバイル版）
  if (editedCell === JUMP_TO_TODAY_CELL) {
    const value = range.getValue();
    if (value === true) {
      try {
        jumpToTodayColumn();
        range.setValue(false);
      } catch (error) {
        Logger.log("今日の日付に移動エラー: " + error.message);
        range.setValue(false);
      }
    }
  }
}


/**
 * ガントチャート更新(カスタムメニューから呼び出される)
 * 【元のロジックのまま】
 */
function updateAllGantt() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'ガントチャートの全範囲更新',
    '処理には数分かかる場合があります。続行しますか？',
    ui.ButtonSet.OK_CANCEL
  );
  if (response !== ui.Button.OK) {
    return;
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const overlapSummary = getEquipmentOverlapSummary(ss);
    if (overlapSummary) {
      // 【2026/8/22変更】期間重複がある間は、単価計算・予算集計・全体再構築は行わない。
      // ただし赤い塗りつぶしだけは反映し、重複箇所がガントチャート上で分かるようにする。
      showOverlapDialog(overlapSummary);
      try {
        updateOverlappingCellsOnly(ss);
      } catch (highlightError) {
        Logger.log('重複セル色付けエラー: ' + highlightError.message);
      }
      const nowMenuOverlap = new Date();
      const timeStrMenuOverlap = Utilities.formatDate(nowMenuOverlap, Session.getScriptTimeZone(), 'HH:mm:ss');
      ui.alert(
        '期間重複あり: 更新を中止しました（確認時刻: ' + timeStrMenuOverlap + '）',
        buildOverlapToastMessage_(overlapSummary) + '\n\n（重複箇所はガントチャート上で赤く表示されています）\n\n重複を直してから、もう一度実行してください。',
        ui.ButtonSet.OK
      );
      return;
    }
    SpreadsheetApp.getActiveSpreadsheet().toast('ガントチャートの更新を開始しました...', '処理状況', 3);
    updateAllGanttCore();
    try {
      updatePricesAndTotals();
      removeAdditionalEquipmentListSheet();
      updateBudgetSummary();
    } catch (priceError) {
      Logger.log('単価更新/追加機材一覧シート削除エラー: ' + priceError.message);
    }
    ui.alert('✅ ガントチャートの更新が完了しました。');
  } catch (e) {
    Logger.log('updateAllGanttエラー: ' + e.message);
    Logger.log('エラースタック: ' + e.stack);
    ui.alert('❌ エラーが発生しました:\n' + e.message);
  }
}


/**
 * 【新規追加・2026/8/21】指定した件数ぶん、色相を均等に分散させた
 * 見分けやすい色のリストを動的に生成する（内部用）。
 * 黄金角（約137.508度）ずつ色相をずらして並べることで、件数が何件でも
 * 隣り合う色同士が偏らずに分散し、かつ理論上まったく同じ色にはならない。
 * 固定リストの使い回しと違い、作品数が多くなっても色の重複が起きない。
 */
function generateDistinctColors_(count) {
  if (count <= 0) return [];
  const colors = [];
  const goldenAngle = 137.508;
  for (let i = 0; i < count; i++) {
    const hue = (i * goldenAngle) % 360;
    colors.push(hslToHex_(hue, 65, 60));
  }
  return colors;
}

/**
 * HSL色をHEXカラーコードに変換する（内部用）。
 * h: 色相(0-360), s: 彩度(0-100), l: 明度(0-100)
 */
function hslToHex_(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp >= 2 && hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp >= 3 && hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp >= 4 && hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const m = l - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  const toHex = v => ('0' + v.toString(16)).slice(-2);
  return '#' + toHex(r) + toHex(g) + toHex(b);
}


/**
 * ガントチャート更新の実際の処理
 * 【変更点】日付ヘッダーが読み取れない列を検知して警告するチェックを追加
 */
function updateAllGanttCore() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ganttSheet = ss.getSheetByName(GANTT_SHEET_NAME);
  const bookingSheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!ganttSheet) {
    throw new Error('ガントチャートシートが見つかりません');
  }
  if (!bookingSheet) {
    throw new Error('機材リストシートが見つかりません');
  }

  // 機材リストのデータを取得（ヘッダー行を除く）
  const bookingLastRow = bookingSheet.getLastRow();
  const bookings = bookingSheet.getRange(2, 1, bookingLastRow - 1, 6).getValues();
  Logger.log('機材リスト行数: ' + bookings.length);

  // 【2026/8/21修正】固定30色パレットを使い回す方式だと、作品数が30を
  // 超えると色が重複してしまっていた。作品数ぶんだけ動的に色相を均等に
  // 割り振ることで、作品数が何件でも色が絶対に重複しないようにする。
  const projectNamesInOrder = [];
  const seenProjectNames = new Set();
  bookings.forEach(booking => {
    const projectName = booking[0]; // A列: 作品名
    if (projectName && !seenProjectNames.has(projectName)) {
      seenProjectNames.add(projectName);
      projectNamesInOrder.push(projectName);
    }
  });
  const dynamicColorPalette = generateDistinctColors_(projectNamesInOrder.length);
  const projectColorMap = new Map();
  projectNamesInOrder.forEach((name, i) => projectColorMap.set(name, dynamicColorPalette[i]));

  // ガントチャートの範囲を取得
  const ganttLastCol = ganttSheet.getLastColumn();
  const ganttLastRow = ganttSheet.getLastRow();
  const ganttStartCol = ganttSheet.getRange(GANTT_START_COL_LETTER + "1").getColumn();
  const numRows = ganttLastRow - GANTT_START_ROW + 1;
  const numCols = ganttLastCol - ganttStartCol + 1;
  Logger.log('ガントチャート範囲: 行=' + numRows + ', 列=' + numCols);

  // 機材名のマッピング
  const equipmentMap = new Map();
  ganttSheet.getRange(GANTT_START_ROW, GANTT_EQUIPMENT_COL, numRows, 1).getValues().forEach((row, index) => {
    const equipmentName = normalizeString(row[0]);
    if (equipmentName) {
      equipmentMap.set(equipmentName, index);
    }
  });
  Logger.log('機材マップサイズ: ' + equipmentMap.size);

  // 日付行のデータを取得（タイムスタンプに変換）
  const ganttDates = ganttSheet.getRange(GANTT_DATE_ROW, ganttStartCol, 1, numCols).getValues()[0].map(date => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    } catch (e) {
      return null;
    }
  });

  // 【新規追加】日付ヘッダーが読み取れない列があれば警告
  // ※インデックス0（GANTT_START_COL_LETTER＝E列）は、実データが始まる前の
  // 空白の余白列であることが確認済みのため、警告の対象から除外する
  // （これを含めると、正常な状態でも毎回警告が出てしまっていた）。
  const missingHeaderCols = [];
  ganttDates.forEach((t, idx) => {
    if (idx === 0) return;
    if (t === null) missingHeaderCols.push(idx);
  });
  if (missingHeaderCols.length > 0) {
    const firstBadCol = ganttStartCol + missingHeaderCols[0];
    const colLetter = ganttSheet.getRange(1, firstBadCol).getA1Notation().replace(/[0-9]/g, '');
    Logger.log('警告: 日付ヘッダーが読み取れない列があります。列インデックス: ' + missingHeaderCols.join(','));
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `${colLetter}列付近など、${missingHeaderCols.length}箇所の日付ヘッダーが読み取れませんでした。` +
      'その列より右の予約が反映されない可能性があります。日付を確認してください。',
      '日付ヘッダー警告', 15
    );
  }

  // 出力用の配列を初期化
  const outputValues = Array(numRows).fill(0).map(() => Array(numCols).fill(""));
  const outputColors = Array(numRows).fill(0).map(() => Array(numCols).fill(null));

  // 重複している日付のみを取得
  const overlapDatesMap = getOverlappingDatesMap(bookingSheet);

  // 各予約を処理
  bookings.forEach((booking, bookingIndex) => {
    const projectName = booking[0]; // A列: 作品名
    if (!projectName) return;

    // 作品ごとの色（上で作品数ぶん動的に生成済み）
    const bookingColor = projectColorMap.get(projectName);

    const normalizedEquipmentName = normalizeString(booking[1]); // B列: 機材名
    const startTime = new Date(booking[3]).setHours(0, 0, 0, 0); // D列: 開始日
    const endTime = new Date(booking[4]).setHours(0, 0, 0, 0);   // E列: 終了日
    if (!normalizedEquipmentName || isNaN(startTime) || isNaN(endTime)) return;

    const rowIndex = equipmentMap.get(normalizedEquipmentName);
    if (rowIndex === undefined) return;

    // 予約期間内のセルを特定
    const bookingCells = [];
    ganttDates.forEach((ganttTime, colIndex) => {
      if (ganttTime && ganttTime >= startTime && ganttTime <= endTime) {
        bookingCells.push(colIndex);
      }
    });

    // 予約期間全体で作品名を均等に配置
    const totalCells = bookingCells.length;
    if (totalCells > 0) {
      const interval = Math.max(1, Math.floor(totalCells / Math.max(1, Math.ceil(totalCells / 20))));
      const actualRowNumber = bookingIndex + 2; // 実際の行番号
      const overlapKey = `${normalizedEquipmentName}|${actualRowNumber}`;
      const overlapDates = overlapDatesMap.get(overlapKey);

      bookingCells.forEach((colIndex, i) => {
        const cellDate = ganttDates[colIndex];
        const isOverlapDate = overlapDates && overlapDates.has(cellDate);

        outputColors[rowIndex][colIndex] = isOverlapDate ? '#FF0000' : bookingColor;

        if (i === 0 || i % interval === 0) {
          outputValues[rowIndex][colIndex] = isOverlapDate ? projectName + ' ⚠️' : projectName;
        }
      });
    }
  });

  Logger.log('作品数: ' + projectColorMap.size);

  // ガントチャートに一括書き込み
  const ganttDataRange = ganttSheet.getRange(GANTT_START_ROW, ganttStartCol, numRows, numCols);
  ganttDataRange.clearContent().setBackground(null);
  ganttDataRange.setValues(outputValues);
  ganttDataRange.setBackgrounds(outputColors);
  ganttDataRange.setHorizontalAlignment('left');
  Logger.log('ガントチャート更新完了');
}


/**
 * 重複しているセルのみを更新する関数
 * 【元のロジックのまま】
 */
function updateOverlappingCellsOnly(ss) {
  const ganttSheet = ss.getSheetByName(GANTT_SHEET_NAME);
  const bookingSheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!ganttSheet || !bookingSheet) {
    throw new Error('シートが見つかりません');
  }

  const bookingLastRow = bookingSheet.getLastRow();
  const bookings = bookingSheet.getRange(2, 1, bookingLastRow - 1, 6).getValues();

  const ganttLastCol = ganttSheet.getLastColumn();
  const ganttLastRow = ganttSheet.getLastRow();
  const ganttStartCol = ganttSheet.getRange(GANTT_START_COL_LETTER + "1").getColumn();
  const numRows = ganttLastRow - GANTT_START_ROW + 1;
  const numCols = ganttLastCol - ganttStartCol + 1;

  const equipmentMap = new Map();
  ganttSheet.getRange(GANTT_START_ROW, GANTT_EQUIPMENT_COL, numRows, 1).getValues().forEach((row, index) => {
    const equipmentName = normalizeString(row[0]);
    if (equipmentName) {
      equipmentMap.set(equipmentName, index);
    }
  });

  const ganttDates = ganttSheet.getRange(GANTT_DATE_ROW, ganttStartCol, 1, numCols).getValues()[0].map(date => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    } catch (e) {
      return null;
    }
  });

  const overlapDatesMap = getOverlappingDatesMap(bookingSheet);
  Logger.log('重複情報: ' + overlapDatesMap.size + '件');

  // 行（rowIndex）ごとに「更新したい列indexとラベル」を集約してからまとめて書き込む。
  // 以前はセル1つずつ setBackground/setValue を呼んでいたため、重複件数が多いと
  // API呼び出し回数が数百〜数千回に達し、Apps Scriptの実行時間制限（特にモバイルからの
  // 実行）に達して処理が完了しないことがあった。行単位でまとめて1回で反映する。
  const rowUpdates = new Map(); // rowIndex -> Map(colIndex -> label|null)

  bookings.forEach((booking, bookingIndex) => {
    const projectName = booking[0]; // A列: 作品名
    if (!projectName) return;
    const normalizedEquipmentName = normalizeString(booking[1]); // B列: 機材名
    const startTime = new Date(booking[3]).setHours(0, 0, 0, 0); // D列: 開始日
    const endTime = new Date(booking[4]).setHours(0, 0, 0, 0);   // E列: 終了日
    if (!normalizedEquipmentName || isNaN(startTime) || isNaN(endTime)) return;

    const actualRowNumber = bookingIndex + 2; // 実際の行番号
    const overlapKey = `${normalizedEquipmentName}|${actualRowNumber}`;
    const overlapDates = overlapDatesMap.get(overlapKey);
    if (!overlapDates) return;

    const rowIndex = equipmentMap.get(normalizedEquipmentName);
    if (rowIndex === undefined) return;

    const bookingCells = [];
    ganttDates.forEach((ganttTime, colIndex) => {
      if (ganttTime && ganttTime >= startTime && ganttTime <= endTime) {
        bookingCells.push(colIndex);
      }
    });

    const totalCells = bookingCells.length;
    if (totalCells === 0) return;
    const interval = Math.max(1, Math.floor(totalCells / Math.max(1, Math.ceil(totalCells / 20))));

    if (!rowUpdates.has(rowIndex)) rowUpdates.set(rowIndex, new Map());
    const colMap = rowUpdates.get(rowIndex);

    bookingCells.forEach((colIndex, i) => {
      const cellDate = ganttDates[colIndex];
      if (!overlapDates.has(cellDate)) return;
      // 【2026/8/22変更】メモ（ホバーしないと見えない）はやめて、見てすぐ分かるように
      // 重複しているセルには必ず「⚠️」を入れる。作品名までは間引いて一部のセルにだけ
      // 入れる（全セルに長い文字列を入れると読みにくくなるため）。
      // 一度「作品名 ⚠️」（フルラベル）が入ったセルは、後から単なる「⚠️」で
      // 上書きされないようにする。
      const isSampled = (i === 0 || i % interval === 0);
      const newLabel = isSampled ? (projectName + ' ⚠️') : '⚠️';
      const existing = colMap.get(colIndex);
      const existingIsFullLabel = existing && existing.label !== '⚠️';
      colMap.set(colIndex, { label: existingIsFullLabel ? existing.label : newLabel });
    });
  });

  Logger.log('重複セル更新対象: ' + rowUpdates.size + '行');

  rowUpdates.forEach((colMap, rowIndex) => {
    const colIndices = Array.from(colMap.keys());
    const minCol = Math.min.apply(null, colIndices);
    const maxCol = Math.max.apply(null, colIndices);
    const width = maxCol - minCol + 1;
    const ganttRowNumber = GANTT_START_ROW + rowIndex;
    const rangeStartCol = ganttStartCol + minCol;

    const targetRange = ganttSheet.getRange(ganttRowNumber, rangeStartCol, 1, width);
    const currentValues = targetRange.getValues();
    const currentBackgrounds = targetRange.getBackgrounds();

    colMap.forEach((info, colIndex) => {
      const localIndex = colIndex - minCol;
      currentBackgrounds[0][localIndex] = '#FF0000';
      currentValues[0][localIndex] = info.label;
    });

    targetRange.setValues(currentValues);
    targetRange.setBackgrounds(currentBackgrounds);
  });

  Logger.log('重複セル更新完了');
}


/**
 * 機材名の期間重複サマリーを取得する関数（更新ボタン用のダイアログに使用）
 * 【元のロジックのまま】
 * @return {string|null} 重複サマリーメッセージ、または重複がない場合はnull
 */
function getEquipmentOverlapSummary(ss) {
  const sourceSheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sourceSheet) return null;

  const sourceLastRow = sourceSheet.getLastRow();
  if (sourceLastRow < 2) return null;

  const sourceData = sourceSheet.getRange(2, 1, sourceLastRow - 1, 6).getValues();
  const equipmentMap = new Map();
  sourceData.forEach((row, index) => {
    const projectName = row[0];   // A列: 作品名
    const equipmentName = row[1]; // B列: 機材名
    const startDate = row[3];     // D列: 開始日
    const endDate = row[4];       // E列: 終了日
    const supplier = row[5];      // F列: 発注先
    const rowNumber = index + 2;

    if (supplier && supplier !== '') return;
    if (!equipmentName || equipmentName === '' || !startDate || !endDate) return;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (start > end) return;

    const normalizedName = normalizeString(equipmentName);
    if (!equipmentMap.has(normalizedName)) {
      equipmentMap.set(normalizedName, []);
    }
    equipmentMap.get(normalizedName).push({
      rowNumber: rowNumber,
      originalName: equipmentName,
      projectName: projectName || '（作品名未入力）',
      start: start,
      end: end
    });
  });

  const overlappingEquipments = [];
  for (const [normalizedName, periods] of equipmentMap.entries()) {
    if (periods.length < 2) continue;
    let hasOverlap = false;
    const overlappingPeriods = [];
    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const period1 = periods[i];
        const period2 = periods[j];
        if (period1.start <= period2.end && period2.start <= period1.end) {
          hasOverlap = true;
          overlappingPeriods.push({ period1: period1, period2: period2 });
        }
      }
    }
    if (hasOverlap) {
      overlappingEquipments.push({ name: periods[0].originalName, periods: overlappingPeriods });
    }
  }

  if (overlappingEquipments.length === 0) return null;

  let message = '以下の機材で期間が重複しています：\n\n';
  overlappingEquipments.forEach((equipment, index) => {
    message += `${index + 1}. 機材名「${equipment.name}」\n`;
    equipment.periods.forEach(overlap => {
      message += `   行${overlap.period1.rowNumber}（${overlap.period1.projectName}）: ${formatDate(overlap.period1.start)} 〜 ${formatDate(overlap.period1.end)}\n`;
      message += `   行${overlap.period2.rowNumber}（${overlap.period2.projectName}）: ${formatDate(overlap.period2.start)} 〜 ${formatDate(overlap.period2.end)}\n`;
    });
    message += '\n';
  });
  message += 'ガントチャートの重複期間は赤色で表示されます。\n\n';
  message += '※ F列（発注先）が記入されている機材は重複チェックの対象外です。';
  return message;
}


/**
 * 重複している日にちのみを計算する関数
 * 【元のロジックのまま】
 * @param {Object} sourceSheet - 機材リストシート
 * @return {Map} キー: "機材名|行番号"、値: 重複している日付のSet
 */
function getOverlappingDatesMap(sourceSheet) {
  const overlapDatesMap = new Map();
  if (!sourceSheet) return overlapDatesMap;

  const sourceLastRow = sourceSheet.getLastRow();
  if (sourceLastRow < 2) return overlapDatesMap;

  const sourceData = sourceSheet.getRange(2, 1, sourceLastRow - 1, 6).getValues();
  const equipmentMap = new Map();
  sourceData.forEach((row, index) => {
    const equipmentName = row[1];
    const startDate = row[3]; // D列: 開始日
    const endDate = row[4]; // E列: 終了日
    const supplier = row[5]; // F列: 発注先
    const rowNumber = index + 2;

    if (supplier && supplier !== '') return;
    if (!equipmentName || equipmentName === '' || !startDate || !endDate) return;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (start > end) return;

    const normalizedName = normalizeString(equipmentName);
    if (!equipmentMap.has(normalizedName)) {
      equipmentMap.set(normalizedName, []);
    }
    equipmentMap.get(normalizedName).push({
      rowNumber: rowNumber,
      originalName: equipmentName,
      start: start,
      end: end
    });
  });

  for (const [normalizedName, periods] of equipmentMap.entries()) {
    if (periods.length < 2) continue;
    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const period1 = periods[i];
        const period2 = periods[j];
        if (period1.start <= period2.end && period2.start <= period1.end) {
          const overlapStart = new Date(Math.max(period1.start.getTime(), period2.start.getTime()));
          const overlapEnd = new Date(Math.min(period1.end.getTime(), period2.end.getTime()));
          const key1 = `${normalizedName}|${period1.rowNumber}`;
          const key2 = `${normalizedName}|${period2.rowNumber}`;
          if (!overlapDatesMap.has(key1)) overlapDatesMap.set(key1, new Set());
          if (!overlapDatesMap.has(key2)) overlapDatesMap.set(key2, new Set());

          const currentDate = new Date(overlapStart);
          while (currentDate <= overlapEnd) {
            const dateKey = currentDate.getTime();
            overlapDatesMap.get(key1).add(dateKey);
            overlapDatesMap.get(key2).add(dateKey);
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
      }
    }
  }
  return overlapDatesMap;
}


/**
 * HTMLダイアログで重複警告を表示する関数（更新ボタン実行後のサマリー表示用）
 * 【元のロジックのまま】
 */
function showOverlapDialog(message) {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
          }
          h2 {
            color: #856404;
            margin-top: 0;
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            background-color: white;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #ffc107;
            max-height: 400px;
            overflow-y: auto;
          }
          button {
            background-color: #ffc107;
            color: #856404;
            border: none;
            padding: 10px 20px;
            font-size: 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 15px;
          }
          button:hover {
            background-color: #e0a800;
          }
        </style>
      </head>
      <body>
        <h2>⚠️ 期間重複の警告</h2>
        <pre>${message}</pre>
        <button onclick="google.script.host.close()">閉じる</button>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(450);
  SpreadsheetApp.getUi().showModelessDialog(html, '重複警告');
}


/**
 * 日付をフォーマットするヘルパー関数
 * 【元のロジックのまま】
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}


/**
 * 文字列の前後の空白のみを削除する関数
 * 【元のロジックのまま】
 */
function normalizeString(str) {
  if (typeof str !== 'string' || !str) return "";
  return str.trim();
}


// ==================== 作品ごとの合計金額集計（2026/8/22追加） ====================
const BUDGET_SHEET_NAME = "予算集計";

/**
 * 機材リストのI列（金額）を作品名（A列）ごとに合計し、「予算集計」シートに
 * 一覧として書き出す。金額の多い作品順に並べる。
 * I列には「12000」のような数値だけでなく「12000 ※推定」のような文字列
 * （あいまい一致で見つかった金額）も入っているため、どちらでも数値部分を
 * 取り出して集計する。あいまい一致を含む件数も別列に表示し、
 * 「この合計には推定価格が混ざっている」と一目で分かるようにしている。
 *
 * ガントチャート更新ボタンを押すたびに自動的に再集計される
 * （メニューの「作品ごとの合計金額を集計」から単独で実行することもできる）。
 */
function updateBudgetSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const data = sheet.getRange(2, 1, lastRow - 1, BOOKING_COL_PRICE).getValues();

  const totals = new Map(); // 作品名 -> { sum, estimatedCount }
  data.forEach(function (row) {
    const projectName = row[BOOKING_COL_PROJECT - 1];
    const priceRaw = row[BOOKING_COL_PRICE - 1];
    if (!projectName) return;
    if (priceRaw === '' || priceRaw === null || priceRaw === undefined) return;

    let amount = null;
    let isEstimated = false;
    if (typeof priceRaw === 'number') {
      amount = priceRaw;
    } else {
      const s = String(priceRaw);
      isEstimated = s.indexOf('※推定') !== -1;
      const numMatch = s.match(/-?[\d,]+/);
      if (numMatch) {
        amount = Number(numMatch[0].replace(/,/g, ''));
      }
    }
    if (amount === null || isNaN(amount)) return;

    if (!totals.has(projectName)) {
      totals.set(projectName, { sum: 0, estimatedCount: 0 });
    }
    const entry = totals.get(projectName);
    entry.sum += amount;
    if (isEstimated) entry.estimatedCount++;
  });

  const rows = Array.from(totals.entries()).map(function (entry) {
    const name = entry[0];
    const v = entry[1];
    return [name, v.sum, v.estimatedCount];
  });
  rows.sort(function (a, b) { return b[1] - a[1]; }); // 金額の多い順

  let budgetSheet = ss.getSheetByName(BUDGET_SHEET_NAME);
  if (!budgetSheet) {
    budgetSheet = ss.insertSheet(BUDGET_SHEET_NAME);
  } else {
    budgetSheet.clear();
  }

  budgetSheet.getRange(1, 1, 1, 3).setValues([['作品名', '合計金額', 'うち※推定を含む件数']]);
  budgetSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8eaed');
  budgetSheet.setFrozenRows(1);

  if (rows.length > 0) {
    budgetSheet.getRange(2, 1, rows.length, 3).setValues(rows);
    budgetSheet.getRange(2, 2, rows.length, 1).setNumberFormat('#,##0"円"');
  }
  budgetSheet.setColumnWidth(1, 260);
  budgetSheet.setColumnWidth(2, 150);
  budgetSheet.setColumnWidth(3, 220);
}


// ==================== 返却忘れリマインダー（2026/8/22追加） ====================
const OVERDUE_RETURNS_SHEET_NAME = "返却忘れ一覧";

/**
 * 機材リストのうち、終了日（E列）が今日より前なのに、返却チェック（H列）が
 * 「返却済み」になっていない行を探し、「返却忘れ一覧」シートに書き出す。
 * 発注先（F列）が空欄・入力済みのどちらの行も対象にする。
 *
 * 更新ボタンでは自動実行されない（過去の古い行が大量にヒットして
 * 毎回警告が出ると煩わしいため）。確認したいタイミングでメニューの
 * 「返却忘れをチェック」から実行する。
 */
function checkOverdueReturns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('機材リストシートが見つかりません');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getActiveSpreadsheet().toast('機材リストにデータがありません', '返却忘れチェック', 5);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const data = sheet.getRange(2, 1, lastRow - 1, BOOKING_COL_RETURN_CHECK).getValues();

  const overdue = [];
  data.forEach(function (row, i) {
    const projectName = row[BOOKING_COL_PROJECT - 1];
    const equipmentName = row[BOOKING_COL_EQUIPMENT - 1];
    const endDateRaw = row[BOOKING_COL_END - 1];
    const returnCheck = row[BOOKING_COL_RETURN_CHECK - 1];

    if (!equipmentName) return; // 空行はスキップ
    if (!(endDateRaw instanceof Date) || isNaN(endDateRaw.getTime())) return; // 終了日が日付として読めない行はスキップ

    const endDate = new Date(endDateRaw);
    endDate.setHours(0, 0, 0, 0);
    if (endDate >= today) return; // まだ終了日を過ぎていない

    const returnedText = normalizeString(String(returnCheck || ''));
    if (returnedText === RETURNED_MARKER) return; // すでに返却済み

    overdue.push([
      projectName || '',
      equipmentName,
      formatDate(endDate),
      i + 2 // 機材リストの実際の行番号
    ]);
  });

  let overdueSheet = ss.getSheetByName(OVERDUE_RETURNS_SHEET_NAME);
  if (!overdueSheet) {
    overdueSheet = ss.insertSheet(OVERDUE_RETURNS_SHEET_NAME);
  } else {
    overdueSheet.clear();
  }

  overdueSheet.getRange(1, 1, 1, 4).setValues([['作品名', '機材名', '終了日', '機材リストの行番号']]);
  overdueSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#fdecea');
  overdueSheet.setFrozenRows(1);

  if (overdue.length > 0) {
    // 終了日が古い順（返却が遅れている度合いが大きい順）に並べる
    overdue.sort(function (a, b) { return new Date(a[2]) - new Date(b[2]); });
    overdueSheet.getRange(2, 1, overdue.length, 4).setValues(overdue);
  }
  overdueSheet.setColumnWidth(1, 220);
  overdueSheet.setColumnWidth(2, 320);
  overdueSheet.setColumnWidth(3, 120);
  overdueSheet.setColumnWidth(4, 160);

  if (overdue.length > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `返却期限切れ・未チェックが ${overdue.length} 件見つかりました。「${OVERDUE_RETURNS_SHEET_NAME}」タブをご確認ください。`,
      '返却忘れチェック', 8
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('返却忘れは見つかりませんでした。', '返却忘れチェック', 5);
  }
}


// ==================== 機材使用率（2026/8/27追加） ====================
const EQUIPMENT_USAGE_SHEET_NAME = "機材使用率";

/**
 * 【新規追加・2026/8/27】各機材が「今年1年間（1/1〜12/31）」のうち
 * 何%の日数で予約されていたか（＝使用率）を集計し、「機材使用率」タブに
 * 一覧として書き出す。
 *
 * 使用率の定義: 今年に入っている予約日数（重複日はダブルカウントしない）
 *              ÷ 今年の日数（365日、うるう年は366日）× 100
 *
 * ・機材名はマスターガントチャート（機材名の一覧）を基準にするため、
 *   今年まだ一度も予約されていない機材も「0%」として一覧に出てくる。
 * ・同じ機材で予約期間が重なっている行が複数あっても、重なっている日を
 *   2回・3回と数えてしまうと100%を超えてしまうため、日付ごとにSetで
 *   重複を除いてから日数を数えている。
 * ・予約期間が今年より前や後にはみ出している場合は、今年の範囲
 *   （1/1〜12/31）だけを切り取って数える（前後の年にかかっている予約が
 *   今年の日数を実際より多く見せてしまわないようにするため）。
 *
 * ガントチャート更新ボタンでは自動実行されない（他の集計（予算集計・
 * 返却忘れチェック）と同様、見たいタイミングでメニューの
 * 「機材使用率を集計」から実行する方式にしている）。
 */
function updateEquipmentUsageRate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ganttSheet = ss.getSheetByName(GANTT_SHEET_NAME);
  const bookingSheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!bookingSheet) {
    SpreadsheetApp.getUi().alert('機材リストシートが見つかりません');
    return;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(currentYear, 11, 31);
  yearEnd.setHours(0, 0, 0, 0);
  const isLeap = (currentYear % 4 === 0 && currentYear % 100 !== 0) || (currentYear % 400 === 0);
  const daysInYear = isLeap ? 366 : 365;

  // マスターの機材名一覧（ガントチャートの機材名列）。ガントチャートが
  // 見つからない場合は、機材リスト側に出てきた機材名だけで集計する。
  const namesInOrder = [];
  const seenNames = new Set();
  if (ganttSheet) {
    const ganttLastRow = ganttSheet.getLastRow();
    const numRows = Math.max(0, ganttLastRow - GANTT_START_ROW + 1);
    if (numRows > 0) {
      ganttSheet.getRange(GANTT_START_ROW, GANTT_EQUIPMENT_COL, numRows, 1).getValues().forEach(row => {
        const name = normalizeString(row[0]);
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          namesInOrder.push(name);
        }
      });
    }
  }

  // 機材ごとに「今年使われた日」のSet（重複日を除くため）
  const usedDaysByEquipment = new Map();

  const bookingLastRow = bookingSheet.getLastRow();
  if (bookingLastRow >= 2) {
    const bookings = bookingSheet.getRange(2, 1, bookingLastRow - 1, 6).getValues();
    bookings.forEach(booking => {
      const equipmentName = normalizeString(booking[BOOKING_COL_EQUIPMENT - 1]);
      const startRaw = booking[BOOKING_COL_START - 1];
      const endRaw = booking[BOOKING_COL_END - 1];
      if (!equipmentName || !startRaw || !endRaw) return;

      const start = new Date(startRaw);
      const end = new Date(endRaw);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      if (start > end) return;

      // 今年の範囲（1/1〜12/31）だけに切り取る
      const clippedStart = start < yearStart ? yearStart : start;
      const clippedEnd = end > yearEnd ? yearEnd : end;
      if (clippedStart > clippedEnd) return; // 今年と重なっていない予約

      if (!seenNames.has(equipmentName)) {
        // マスター一覧（ガントチャート）になかった機材名（表記ゆれ等）も、
        // 集計漏れがないように一覧に追加しておく
        seenNames.add(equipmentName);
        namesInOrder.push(equipmentName);
      }

      if (!usedDaysByEquipment.has(equipmentName)) {
        usedDaysByEquipment.set(equipmentName, new Set());
      }
      const daySet = usedDaysByEquipment.get(equipmentName);
      const cursor = new Date(clippedStart);
      while (cursor <= clippedEnd) {
        daySet.add(cursor.getTime());
        cursor.setDate(cursor.getDate() + 1);
      }
    });
  }

  // 【2026/8/27修正】以前は使用率が高い順に並べ替えていたが、マスターガント
  // チャートと同じ並び順（namesInOrderの順番＝ガントチャートの機材名列の
  // 上から順）で見たいとのことだったので、並べ替えは行わない。
  // また「年間日数」列（365など、どの行も同じ値）は不要とのことなので削除し、
  // 機材名・予約日数・使用率(%)の3列だけにする（使用率の計算自体は
  // 引き続き年間日数で割って行っている）。
  const rows = namesInOrder.map(name => {
    const usedDays = usedDaysByEquipment.has(name) ? usedDaysByEquipment.get(name).size : 0;
    const rate = Math.round((usedDays / daysInYear) * 1000) / 10; // 小数点1桁まで
    return [name, usedDays, rate];
  });

  let usageSheet = ss.getSheetByName(EQUIPMENT_USAGE_SHEET_NAME);
  if (!usageSheet) {
    usageSheet = ss.insertSheet(EQUIPMENT_USAGE_SHEET_NAME);
  } else {
    usageSheet.clear();
  }

  usageSheet.getRange(1, 1, 1, 3).setValues([[
    '機材名', currentYear + '年の予約日数', '使用率(%)'
  ]]);
  usageSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8eaed');
  usageSheet.setFrozenRows(1);

  if (rows.length > 0) {
    usageSheet.getRange(2, 1, rows.length, 3).setValues(rows);
    usageSheet.getRange(2, 3, rows.length, 1).setNumberFormat('0.0"%"');
  }
  usageSheet.setColumnWidth(1, 260);
  usageSheet.setColumnWidth(2, 160);
  usageSheet.setColumnWidth(3, 120);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '機材使用率を集計しました（' + currentYear + '年・' + rows.length + '件）。「' + EQUIPMENT_USAGE_SHEET_NAME + '」タブをご確認ください。',
    '機材使用率', 6
  );
}
