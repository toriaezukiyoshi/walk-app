// ── 状態管理 ───────────────────────────────────────
let selectedStation = null;
let selectedKm = null;
let leafletMap = null;
let mapLayers = [];
let isSpinning = false;
let filterUnvisited = false;

// ── 訪問済み駅（LocalStorage） ────────────────────
const STORAGE_KEY = 'walk-app-visited';
let visitedStations = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

function saveVisited() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visitedStations]));
  updateVisitedCount();
}

function toggleVisited() {
  if (!selectedStation) return;
  const name = selectedStation.name;
  if (visitedStations.has(name)) {
    visitedStations.delete(name);
  } else {
    visitedStations.add(name);
  }
  saveVisited();
  updateVisitedBtn();
}

function toggleFilter() {
  filterUnvisited = document.getElementById('filterVisited').checked;
}

function updateVisitedBtn() {
  if (!selectedStation) return;
  const btn = document.getElementById('visitedBtn');
  const visited = visitedStations.has(selectedStation.name);
  btn.textContent = visited ? '✅ 訪問済み（取り消す）' : '📍 訪問済みにする';
  btn.classList.toggle('visited', visited);
}

function updateVisitedCount() {
  const el = document.getElementById('visitedCount');
  if (!el) return;
  const count = visitedStations.size;
  el.textContent = count > 0 ? `${count} / ${STATIONS.length}駅 訪問済み` : '';
}

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

// ── スポットタイプをWikipediaタイトルから推定 ────────
function resolveTypeFromName(name) {
  if (/神社|寺|寺院|大社|八幡|稲荷|権現|観音|不動|山王/.test(name)) return 'shrine';
  if (/公園|庭園|緑地|広場|植物園/.test(name)) return 'park';
  if (/博物館|美術館|記念館|資料館|ギャラリー/.test(name)) return 'museum';
  if (/城|史跡|旧跡|遺跡|古墳|御所|陵/.test(name)) return 'historic';
  return 'tourism';
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

  // ターゲット駅をランダムに決定（フィルター考慮）
  const pool = filterUnvisited
    ? STATIONS.filter(s => !visitedStations.has(s.name))
    : STATIONS;

  if (pool.length === 0) {
    alert('全ての駅を訪問済みです！おめでとうございます🎉\nフィルターをオフにしてもう一度試してください。');
    isSpinning = false;
    btn.disabled = false;
    return;
  }

  const target = pool[Math.floor(Math.random() * pool.length)];

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

  updateVisitedBtn();

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

// ── Wikipedia 地理検索APIでスポット取得 ──────────
async function fetchSpots(lat, lng, radiusM) {
  const radius = Math.min(Math.round(radiusM), 10000);
  const url = `https://ja.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}|${lng}&gsradius=${radius}&gslimit=30&format=json&origin=*`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
    const data = await res.json();
    return parseWikiSpots(data.query.geosearch, lat, lng);
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('接続がタイムアウトしました。再試行してください。');
    throw new Error('スポット情報の取得に失敗しました。再試行してください。');
  }
}

// ── Wikipediaスポットデータを整形 ────────────────
function parseWikiSpots(items, stLat, stLng) {
  return items
    .filter(item => item.title && item.lat && item.lon)
    .map(item => ({
      name: item.title,
      lat: item.lat,
      lng: item.lon,
      distM: item.dist,
      type: resolveTypeFromName(item.title),
      wikiUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
    }))
    .sort((a, b) => a.distM - b.distM)
    .slice(0, 25);
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
      ${spot.wikiUrl ? `<br><a href="${spot.wikiUrl}" target="_blank" rel="noopener" style="font-size:0.75rem;color:var(--accent)">📖 Wikipediaで見る</a>` : ''}
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
          <div class="spot-meta">
            <span>📍 駅から約${distStr}</span>
            <span>🚶 約${walkMin}分</span>
          </div>
          <div class="spot-links" onclick="event.stopPropagation()">
            <a class="spot-maps-link" href="https://www.google.com/maps/search/?q=${spot.lat},${spot.lng}" target="_blank" rel="noopener">🗺️ Googleマップ</a>
            ${spot.wikiUrl ? `<a class="spot-maps-link spot-wiki-link" href="${spot.wikiUrl}" target="_blank" rel="noopener">📖 Wikipedia</a>` : ''}
          </div>
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
  updateVisitedCount();
})();
