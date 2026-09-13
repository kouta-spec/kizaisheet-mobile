// 機材シート2026 モバイル用のサービスワーカー
// アプリの外枠（HTML/CSS/JS/アイコン）だけをキャッシュしておき、
// 電波が弱い場所でも起動できるようにする。
// データそのもの（予約一覧など）は毎回ネットワークから取得する
// （キャッシュを見せてしまうと古いデータに気づけなくなるため）。

// 【2026/8/29修正】アイコン画像（icon-192.png/icon-512.png）を透明背景から白背景に
// 差し替えた（iOSのホーム画面アイコンは透明部分を黒く塗りつぶして表示してしまうため、
// 「渡したアイコンと違って見える」原因になっていた）。古いキャッシュに透明版の
// アイコンが残っている端末でも、確実に新しい画像を取りに行けるようキャッシュ名を
// 更新した。
// 【2026/9/3追加】ホーム画面に追加したスマホ（特にiPhone）で、機材のカテゴリー分け
// 機能を追加したあとも古い画面のまま変わらないという報告があった。index.html自体は
// 毎回ネットワークから取りに行く設計（下のfetchハンドラ参照）なので通常は問題ない
// はずだが、機種によってはservice worker（このファイル自体）の更新チェックが
// すぐには走らず、古いservice workerが動き続けてしまうことがある。合言葉の
// 再ログインではこの層のキャッシュは消えない（ログイン情報とservice workerの
// キャッシュは別物のため）。キャッシュ名を上げておくことで、次に新しい
// service workerへの切り替えが行われたタイミングで、確実に前のキャッシュ
// （kizai-mobile-v7以前）が破棄されるようにした。
// 【2026/9/12追加】アプリ内「ガントチャート」タブを追加（index.html更新）。
// 念のため、こちらもキャッシュ名を上げておく。
// 【2026/9/13追加】ガントチャートタブが表示されない不具合の調査・修正のため
// index.htmlを更新。あわせてキャッシュ名も上げる。
// 【2026/9/13追加 その2】ガントチャートの見た目を修正（機材名の欄を左右スクロール
// 対応にし、上部の凡例を機材カテゴリーのショートカットボタンに差し替え）。
// index.htmlを更新したため、あわせてキャッシュ名も上げる。
const CACHE_NAME = 'kizai-mobile-v11';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Apps ScriptのWeb App（データの取得・保存）は常にネットワークを優先する
  if (url.indexOf('script.google.com') !== -1 || url.indexOf('script.googleusercontent.com') !== -1) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ ok: false, error: 'オフラインのため通信できません' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // ページ本体（index.html）は「まずネットワークから最新版を取りに行き、取れなければキャッシュ」にする
  // （こうしないと、コード更新後も古い画面がキャッシュから表示され続けてしまうため）
  // 【2026/8/28修正】fetch()に何も指定しないと、ブラウザ自身が持っているHTTPキャッシュ
  // （Service WorkerのCache APIとは別物）がまだ「新しい」と判断されている間は、
  // ネットワークに問い合わせすら行かずそのキャッシュがそのまま返ってきてしまう
  // ことが分かった。GitHub Pagesは配信するファイルに数分程度のキャッシュ有効期限を
  // 付けているため、更新後しばらくは（ブラウザを開き直しても）以前の内容が
  // 表示され続けてしまっていた。{cache: 'no-store'}を指定し、常にネットワークへ
  // 直接問い合わせて本当に最新の内容を取りに行くようにした。
  if (event.request.mode === 'navigate' || url.indexOf('index.html') !== -1) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // アイコンやmanifestなど、めったに変わらないファイルは「キャッシュがあればまずそれを返しつつ、裏で最新版に更新」する
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
