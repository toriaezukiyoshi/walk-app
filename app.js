// ── 状態管理 ───────────────────────────────────────
let selectedStation = null;
let selectedKm = null;
let leafletMap = null;
let mapLayers = [];
let isSpinning = false;

const SLOT_ITEM_H = 64; // slot-item の height (px)

// スポットタイプの定義
const TYPE_CONFIG = {
  shrine:   { label: '神社・寺院', icon: '⛩️', color: '#ef4444', cls: 'type-shrine',   markerColor: '#ef4444' },
  park:     { label: '公園・庭園', icon: '🌳', color: '#10d97a', cls: 'type-park',    markerColor: '#10b981' },
  museum:   { label: '博物館・美術館', icon: '🏛️', color: '#3b82f6', cls: 'type-museum',  markerColor: '#3b82f6' },
  cafe:     { label: 'カフェ・飲食', icon: '☕', color: '#fbbf24', cls: 'type-cafe',   markerColor: '#f59e0b' },
  tourism:  { label: '観光・名所', icon: '🌆', color: '#ec4899', cls: 'type-tourism', markerColor: '#ec4899' },
  historic: { label: '史跡・文化財', icon: '🏯', color: '#f59e0b', cls: 'type-historic',markerColor: '#d97706' },
  other:    { label: 'その他',     icon: '📌', color: '#7c5cfc', cls: 'type-other',   markerColor: '#7c5cfc' },
};

// フォールバック付きOverpass APIエンドポイント
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// ── Overpass APIクエリ構築（シンプル化でタイムアウト回避）─
function buildOverpassQuery(lat, lng, radiusM) {
  return `[out:json][timeout:15];
(
  node["amenity"="place_of_worship"]["name"](around:${radiusM},${lat},${lng});
  node["leisure"="park"]["name"](around:${radiusM},${lat},${lng});
  node["leisure"="garden"]["name"](around:${radiusM},${lat},${lng});
  node["tourism"="museum"]["name"](around:${radiusM},${lat},${lng});
  node["tourism"="attraction"]["name"](around:${radiusM},${lat},${lng});
  node["historic"="monument"]["name"](around:${radiusM},${lat},${lng});
  node["historic"="castle"]["name"](around:${radiusM},${lat},${lng});
);
out 25;`;
}

// ── スポットタイプの判定 ──────────────────────────
function resolveType(tags) {
  if (tags.amenity === 'place_of_worship') return 'shrine';
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park';
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum';
  if (tags.tourism === 'attraction' || tags.tourism === 'viewpoint') return 'tourism';
  if (tags.historic) return 'historic';
  if (tags.amenity === 'cafe' || tags.amenity === 'restaurant') return 'cafe';
  return 'other';
}

// ── Haversine距離計算 ─────────────────────────────
function calcDist(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── ルーレット ────────────────────────────────────
function spinRoulette() {
  if (isSpinning) return;
  isSpinning = true;

  const btn = document.getElementById('rouletteBtn');
  btn.disabled = true;

  // 距離・地図セクションをリセット
  hideSection('distanceSection');
  hideSection('mapSection');
  hideSection('spotsSection');
  selectedKm = null;
  document.querySelectorAll('.dist-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('startBtn').classList.add('hidden');
  document.getElementById('stationInfo').classList.remove('visible');
  document.querySelector('.slot-highlight').classList.remove('active');

  // ターゲット駅をランダムに決定
  const targetIdx = Math.floor(Math.random() * STATIONS.length);
  const target = STATIONS[targetIdx];

  // スロットアイテムを生成（全80コマ、最後に目標駅）
  const TOTAL = 80;
  const track = document.getElementById('slotTrack');
  track.innerHTML = '';
  track.style.transform = 'translateY(0)';

  const names = Array.from({ length: TOTAL }, (_, i) =>
    i === TOTAL - 1 ? target.name : STATIONS[Math.floor(Math.random() * STATIONS.length)].name
  );
  names.forEach(n => {
    const div = document.createElement('div');
    div.className = 'slot-item';
    div.textContent = n;
    track.appendChild(div);
  });

  document.getElementById('rouletteLabel').textContent = '選択中...';

  const targetPx = (TOTAL - 1) * SLOT_ITEM_H;
  const duration = 2000;

  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  const startTime = performance.now();
  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    track.style.transform = `translateY(${-targetPx * easeOutQuart(t)}px)`;
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // 完了
      track.style.transform = `translateY(${-targetPx}px)`;
      onSelected(target);
      isSpinning = false;
      btn.disabled = false;
      btn.innerHTML = '🎲 もう一度まわす';
    }
  }
  requestAnimationFrame(frame);
}

function onSelected(station) {
  selectedStation = station;

  document.getElementById('rouletteLabel').textContent = '選ばれた駅 ✨';
  document.querySelector('.slot-highlight').classList.add('active');

  // 駅情報を表示
  document.getElementById('stationName').textContent = station.name + ' 駅';
  document.getElementById('stationLine').textContent = station.line;
  document.getElementById('stationDesc').textContent = station.description;

  const info = document.getElementById('stationInfo');
  info.classList.remove('visible');
  void info.offsetWidth; // reflow
  info.classList.add('visible');

  triggerConfetti();

  // 距離セクションを表示
  setTimeout(() => showSection('distanceSection'), 300);
}

// ── 距離選択 ──────────────────────────────────────
function selectDistance(btn) {
  document.querySelectorAll('.dist-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedKm = parseFloat(btn.dataset.km);
  document.getElementById('startBtn').classList.remove('hidden');
}

// ── スポット検索開始 ──────────────────────────────
function startSearch() {
  if (!selectedStation || !selectedKm) return;

  // 地図・スポットセクションを表示してローディング状態へ
  showSection('mapSection');
  document.getElementById('mapLoading').classList.remove('hidden');
  document.getElementById('map').style.display = 'none';
  document.getElementById('routeStats').innerHTML = '';
  document.getElementById('errorBox').classList.add('hidden');
  hideSection('spotsSection');

  setTimeout(() => {
    document.getElementById('mapSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  fetchSpots(selectedStation.lat, selectedStation.lng, selectedKm * 1000)
    .then(spots => {
      document.getElementById('mapLoading').classList.add('hidden');
      document.getElementById('map').style.display = '';
      renderMap(selectedStation, spots, selectedKm);
      renderStats(spots, selectedKm);
      renderSpots(spots, selectedStation);
      showSection('spotsSection');
    })
    .catch(err => {
      document.getElementById('mapLoading').classList.add('hidden');
      showError(err.message || 'スポットの取得に失敗しました。');
    });
}

// ── Overpass APIフェッチ（フォールバック＋タイムアウト付き）─
async function fetchSpots(lat, lng, radiusM) {
  const query = buildOverpassQuery(lat, lng, radiusM);
  let lastError = null;

  for (const url of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: query,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = new Error(`APIエラー: ${res.status}（${url}）`);
        continue; // 次のエンドポイントを試す
      }

      const data = await res.json();
      return parseSpots(data.elements, lat, lng, radiusM);

    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        lastError = new Error(`タイムアウト（${url}）`);
      } else {
        lastError = new Error(`接続エラー（${url}）`);
      }
      // 次のエンドポイントへ
    }
  }

  throw new Error('全てのサーバーへの接続に失敗しました。しばらく待ってから再試行してください。');
}

// ── スポットデータを整形 ──────────────────────────
function parseSpots(elements, stLat, stLng, radiusM) {
  const seen = new Set();
  const spots = [];

  for (const el of elements) {
    const name = el.tags?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // way要素はcenterを使う
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;

    const distM = calcDist(stLat, stLng, lat, lng);
    if (distM > radiusM * 1.1) continue; // 少し余裕を持たせる

    const type = resolveType(el.tags);
    const nameJa = el.tags['name:ja'] || name;

    spots.push({ name: nameJa, lat, lng, distM, type, tags: el.tags });
  }

  // 距離順でソートして最大30件
  spots.sort((a, b) => a.distM - b.distM);
  return spots.slice(0, 30);
}

// ── 地図描画 ──────────────────────────────────────
function renderMap(station, spots, km) {
  // 既存レイヤーを削除
  mapLayers.forEach(l => { try { leafletMap.removeLayer(l); } catch(_){} });
  mapLayers = [];

  if (!leafletMap) {
    leafletMap = L.map('map', { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(leafletMap);
  }

  // 駅マーカー
  const stIcon = createDivIcon('#7c5cfc', '🚉', 40);
  const stMarker = L.marker([station.lat, station.lng], { icon: stIcon, zIndexOffset: 1000 }).addTo(leafletMap);
  stMarker.bindPopup(`<b>${station.name}駅</b><br><span style="color:#a0a0c0;font-size:0.8rem">${station.line}</span>`);
  mapLayers.push(stMarker);

  // 範囲円
  const circle = L.circle([station.lat, station.lng], {
    radius: km * 1000,
    color: '#7c5cfc',
    weight: 1.5,
    opacity: 0.4,
    fillOpacity: 0.05,
    dashArray: '6 4',
  }).addTo(leafletMap);
  mapLayers.push(circle);

  // スポットマーカー
  spots.forEach((spot, i) => {
    const cfg = TYPE_CONFIG[spot.type] || TYPE_CONFIG.other;
    const icon = createDivIcon(cfg.markerColor, cfg.icon, 34);
    const marker = L.marker([spot.lat, spot.lng], { icon }).addTo(leafletMap);

    const distStr = spot.distM >= 1000
      ? (spot.distM / 1000).toFixed(1) + 'km'
      : Math.round(spot.distM) + 'm';

    marker.bindPopup(`
      <b>${spot.name}</b>
      <br><span class="popup-type ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
      <br><span class="popup-dist">📍 駅から約${distStr}</span>
      ${spot.tags.opening_hours ? `<br><span class="popup-dist">🕐 ${spot.tags.opening_hours}</span>` : ''}
    `);
    mapLayers.push(marker);
  });

  // ビュー調整
  const bounds = L.latLngBounds([[station.lat, station.lng], ...spots.map(s => [s.lat, s.lng])]);
  if (spots.length > 0) {
    leafletMap.fitBounds(bounds, { padding: [48, 48] });
  } else {
    leafletMap.setView([station.lat, station.lng], 15);
  }

  // バッジ更新
  document.getElementById('mapBadge').textContent = `${km}km圏内 · ${spots.length}件`;
}

// ── カスタムマーカーアイコン ──────────────────────
function createDivIcon(color, emoji, size) {
  const s = size || 36;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${s}px;height:${s}px;border-radius:50%;
      background:${color};
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 3px 12px rgba(0,0,0,0.45);
      display:flex;align-items:center;justify-content:center;
      font-size:${Math.round(s * 0.42)}px;
      line-height:1;
    ">${emoji}</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -(s / 2 + 4)],
  });
}

// ── 統計表示 ──────────────────────────────────────
function renderStats(spots, km) {
  const count = spots.length;
  const walkMin = Math.round(km / 4 * 60);
  const steps = Math.round(km * 1400);
  const h = Math.floor(walkMin / 60);
  const m = walkMin % 60;
  const timeStr = h > 0 ? `${h}時間${m > 0 ? m + '分' : ''}` : `${m}分`;

  document.getElementById('routeStats').innerHTML = `
    <div class="stat">
      <span class="stat__value">${km}km</span>
      <span class="stat__label">散歩距離</span>
    </div>
    <div class="stat">
      <span class="stat__value">${timeStr}</span>
      <span class="stat__label">所要時間(目安)</span>
    </div>
    <div class="stat">
      <span class="stat__value">${count}件</span>
      <span class="stat__label">スポット数</span>
    </div>
  `;
}

// ── スポット一覧描画 ──────────────────────────────
function renderSpots(spots, station) {
  const list = document.getElementById('spotsList');

  if (spots.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px 0">この範囲内にスポットが見つかりませんでした。距離を広げて試してみてください。</p>';
    showSection('spotsSection');
    return;
  }

  list.innerHTML = spots.map((spot, i) => {
    const cfg = TYPE_CONFIG[spot.type] || TYPE_CONFIG.other;
    const distStr = spot.distM >= 1000
      ? (spot.distM / 1000).toFixed(1) + 'km'
      : Math.round(spot.distM) + 'm';
    const walkMin = Math.round(spot.distM / 80); // 徒歩速度 約80m/分

    return `
      <div class="spot-card" onclick="flyToSpot(${spot.lat}, ${spot.lng})">
        <div class="spot-num" style="background:${cfg.markerColor}">${i + 1}</div>
        <div class="spot-body">
          <div class="spot-header">
            <span class="spot-name">${spot.name}</span>
            <span class="spot-type ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
          </div>
          ${spot.tags['description'] || spot.tags['note'] ? `<p class="spot-desc">${spot.tags['description'] || spot.tags['note']}</p>` : ''}
          <div class="spot-meta">
            <span>📍 駅から約${distStr}</span>
            <span>🚶 約${walkMin}分</span>
            ${spot.tags.opening_hours ? `<span>🕐 ${spot.tags.opening_hours}</span>` : ''}
          </div>
          <a class="spot-maps-link" href="https://www.google.com/maps/search/?q=${spot.lat},${spot.lng}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
            🗺️ Googleマップで開く
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// ── 地図を指定スポットにフライ ────────────────────
function flyToSpot(lat, lng) {
  if (!leafletMap) return;
  leafletMap.flyTo([lat, lng], 17, { duration: 0.8 });
  document.getElementById('mapSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 再試行 ────────────────────────────────────────
function retrySearch() {
  startSearch();
}

// ── エラー表示 ────────────────────────────────────
function showError(msg) {
  const box = document.getElementById('errorBox');
  document.getElementById('errorMsg').textContent = '⚠️ ' + msg;
  box.classList.remove('hidden');
  document.getElementById('map').style.display = 'none';
}

// ── セクション表示/非表示 ─────────────────────────
function showSection(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.classList.add('fade-in');
}
function hideSection(id) {
  document.getElementById(id).classList.add('hidden');
}

// ── 紙吹雪 ────────────────────────────────────────
function triggerConfetti() {
  const container = document.getElementById('confetti');
  const colors = ['#7c5cfc', '#e040fb', '#ec4899', '#fbbf24', '#10d97a', '#38bdf8'];

  for (let i = 0; i < 70; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const size = 6 + Math.random() * 9;
    const isCircle = Math.random() > 0.5;
    el.style.cssText = `
      left: ${Math.random() * 100}vw;
      width: ${size}px;
      height: ${size}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${isCircle ? '50%' : '3px'};
      animation: fall ${1.4 + Math.random() * 2.2}s ${Math.random() * 0.5}s linear forwards;
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

// ── 初期化：スロットトラックのデフォルト表示 ──────
(function init() {
  const track = document.getElementById('slotTrack');
  const item = document.createElement('div');
  item.className = 'slot-item';
  item.style.color = 'var(--text-muted)';
  item.textContent = '？ ？ ？';
  track.appendChild(item);
})();
