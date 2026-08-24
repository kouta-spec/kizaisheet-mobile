// 機材シート2026 モバイル用のサービスワーカー
// アプリの外枠（HTML/CSS/JS/アイコン）だけをキャッシュしておき、
// 電波が弱い場所でも起動できるようにする。
// データそのもの（予約一覧など）は毎回ネットワークから取得する
// （キャッシュを見せてしまうと古いデータに気づけなくなるため）。

const CACHE_NAME = 'kizai-mobile-v2';
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
  if (event.request.mode === 'navigate' || url.indexOf('index.html') !== -1) {
    event.respondWith(
      fetch(event.request)
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
