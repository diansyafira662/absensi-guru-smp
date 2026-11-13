/* ============================================================
   ABSENSI GURU AN NAMIROH — app.js
   Multi-Device PWA: Camera (WebRTC), GPS (Geolocation API),
   Excel Export, Responsive, Offline-capable
   ============================================================ */

// Import CSS (Vite akan bundle ini ke output)
import './app.css';

'use strict';

// ============================================================
// 1. GLOBAL STATE & STORAGE
// ============================================================
const APP = {
  currentUser: null,
  currentRole: null, // 'guru' | 'admin'
  currentSection: null,
  gpsWatcher: null,
  cameraStream: null,
  capturedPhoto: null,
  lastLocation: null,
  absensiMode: null, // 'masuk' | 'pulang'
  deferredInstallPrompt: null,

  // Settings (can be overridden by admin localStorage settings)
  settings: {
    namaSekolah: 'SMP AN NAMIROH',
    lokasiLat: 0.5100, // Default — admin dapat mengubah
    lokasiLng: 101.4479,
    radiusMeters: 200,
    jamMasukMulai: '06:30',
    jamMasukSelesai: '08:00',
    toleransiMenitTerlambat: 15,
    jamPulang: '15:30',
    hariAktif: ['Senin','Selasa','Rabu','Kamis','Jumat'],
    wajibFoto: true,
    wajibGPS: true,
  },
};

// LocalStorage helpers
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  remove: (k) => localStorage.removeItem(k),
};

// ============================================================
// 2. SAMPLE DATA (Seed jika kosong)
// ============================================================
function seedData() {
  if (!store.get('guru_list')) {
    store.set('guru_list', [
      { id: 'G001', nama: 'Ahmad Fauzi, S.Pd', nip: '198501012010011001', mapel: 'Matematika', username: 'ahmad.fauzi', password: 'guru123' },
      { id: 'G002', nama: 'Siti Rahayu, S.Pd', nip: '198702152011012002', mapel: 'Bahasa Indonesia', username: 'siti.rahayu', password: 'guru123' },
      { id: 'G003', nama: 'Budi Santoso, M.Pd', nip: '198003202009011003', mapel: 'IPA', username: 'budi.santoso', password: 'guru123' },
      { id: 'G004', nama: 'Dewi Lestari, S.Pd', nip: '199001102015012004', mapel: 'Bahasa Inggris', username: 'dewi.lestari', password: 'guru123' },
      { id: 'G005', nama: 'Rudi Hermawan, S.Pd', nip: '198811302013011005', mapel: 'PKn', username: 'rudi.hermawan', password: 'guru123' },
    ]);
  }

  if (!store.get('admin_credentials')) {
    store.set('admin_credentials', { username: 'admin', password: 'admin123', nama: 'Administrator' });
  }

  if (!store.get('absensi_records')) {
    store.set('absensi_records', generateSampleAbsensi());
  }

  if (!store.get('izin_requests')) {
    store.set('izin_requests', []);
  }

  const saved = store.get('app_settings');
  if (saved) Object.assign(APP.settings, saved);
}

function generateSampleAbsensi() {
  const records = [];
  const guru = store.get('guru_list') || [];
  const today = new Date();
  for (let d = 29; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const dow = date.getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) continue;
    const dateStr = formatDate(date);
    guru.forEach(g => {
      const r = Math.random();
      let status = 'hadir';
      if (r < 0.05) status = 'alpha';
      else if (r < 0.12) status = 'izin';
      else if (r < 0.22) status = 'terlambat';
      records.push({
        id: `${g.id}_${dateStr}`,
        guruId: g.id,
        guruNama: g.nama,
        tanggal: dateStr,
        status,
        jamMasuk: status !== 'alpha' && status !== 'izin' ? (status === 'terlambat' ? '08:' + String(Math.floor(Math.random()*30)+5).padStart(2,'0') : '07:' + String(Math.floor(Math.random()*30)).padStart(2,'0')) : null,
        jamPulang: status === 'hadir' || status === 'terlambat' ? '15:' + String(Math.floor(Math.random()*30)+30).padStart(2,'0') : null,
        foto: null,
        koordinat: status !== 'alpha' && status !== 'izin' ? `${APP.settings.lokasiLat + (Math.random()-0.5)*0.001},${APP.settings.lokasiLng + (Math.random()-0.5)*0.001}` : null,
      });
    });
  }
  return records;
}

// ============================================================
// 3. UTILITY
// ============================================================
function formatDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDateIndo(str) {
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const d = new Date(str + 'T00:00:00');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getDayName(d = new Date()) {
  return ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), duration + 400);
}

function showAlert(id, msg, type = 'info') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span>${getAlertIcon(type)}</span><span>${msg}</span>`;
  el.style.display = 'flex';
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function getAlertIcon(type) {
  return { success:'✅', danger:'❌', warning:'⚠️', info:'ℹ️' }[type] || 'ℹ️';
}

function el(id) { return document.getElementById(id); }

function setLoading(btnId, loading) {
  const btn = el(btnId);
  if (!btn) return;
  if (loading) btn.classList.add('btn-loading');
  else btn.classList.remove('btn-loading');
  btn.disabled = loading;
}

function getCurrentAbsensiToday(guruId) {
  const records = store.get('absensi_records') || [];
  const today = formatDate();
  return records.find(r => r.guruId === guruId && r.tanggal === today) || null;
}

function upsertAbsensi(record) {
  const records = store.get('absensi_records') || [];
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  store.set('absensi_records', records);
}

// ============================================================
// 4. PAGE ROUTER
// ============================================================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const p = el(pageId);
  if (p) p.classList.add('active');
  window.scrollTo(0, 0);
}

// ============================================================
// 5. LOGIN
// ============================================================
function initLogin() {
  el('login-form').addEventListener('submit', handleLogin);
}

function handleLogin(e) {
  e.preventDefault();
  hideAlert('login-alert');
  const username = el('login-username').value.trim();
  const password = el('login-password').value;
  const role = el('login-role').value;

  if (!username || !password) {
    showAlert('login-alert', 'Harap isi username dan password.', 'warning');
    return;
  }

  setLoading('btn-login', true);

  setTimeout(() => {
    setLoading('btn-login', false);
    if (role === 'admin') {
      const admin = store.get('admin_credentials');
      if (admin && admin.username === username && admin.password === password) {
        APP.currentUser = { id: 'admin', nama: admin.nama, role: 'admin' };
        APP.currentRole = 'admin';
        store.set('session', APP.currentUser);
        initAdmin();
        showPage('page-admin');
      } else {
        showAlert('login-alert', 'Username atau password admin salah.', 'danger');
      }
    } else {
      const guruList = store.get('guru_list') || [];
      const guru = guruList.find(g => g.username === username && g.password === password);
      if (guru) {
        APP.currentUser = { ...guru, role: 'guru' };
        APP.currentRole = 'guru';
        store.set('session', APP.currentUser);
        initGuru();
        showPage('page-guru');
      } else {
        showAlert('login-alert', 'Username atau password tidak dikenali.', 'danger');
      }
    }
  }, 600);
}

function handleLogout() {
  stopCamera();
  if (APP.gpsWatcher) navigator.geolocation.clearWatch(APP.gpsWatcher);
  APP.currentUser = null;
  APP.currentRole = null;
  store.remove('session');
  showPage('page-login');
  showToast('Anda telah keluar.', 'info');
}

// ============================================================
// 6. GURU PAGES
// ============================================================
function initGuru() {
  renderGuruSidebar();
  renderGuruHeader();
  navigateGuru('dashboard-guru');
  updateClock();
  setInterval(updateClock, 1000);
}

function renderGuruHeader() {
  el('guru-mobile-title').textContent = APP.currentUser?.nama?.split(',')[0] || 'Guru';
}

function renderGuruSidebar() {
  el('guru-sidebar-name').textContent = APP.currentUser?.nama || '';
  el('guru-sidebar-role').textContent = `${APP.currentUser?.mapel || ''} · Guru`;
}

function updateClock() {
  const now = new Date();
  const timeEl = el('current-time');
  const dateEl = el('current-date');
  if (timeEl) timeEl.textContent = formatTime(now);
  if (dateEl) dateEl.textContent = `${getDayName(now)}, ${now.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][now.getMonth()]} ${now.getFullYear()}`;
}

function navigateGuru(section) {
  document.querySelectorAll('#page-guru .nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('#page-guru .bottom-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('#page-guru .section-view').forEach(s => s.classList.remove('active'));

  const sectionEl = el(section);
  if (sectionEl) sectionEl.classList.add('active');

  document.querySelectorAll(`[data-guru-nav="${section}"]`).forEach(n => n.classList.add('active'));

  closeSidebar('guru-sidebar');
  APP.currentSection = section;

  // Render section
  if (section === 'dashboard-guru') renderDashboardGuru();
  if (section === 'absensi-guru') renderAbsensiGuru();
  if (section === 'izin-guru') renderIzinGuru();
  if (section === 'riwayat-guru') renderRiwayatGuru();
  if (section === 'profil-guru') renderProfilGuru();
}

function renderDashboardGuru() {
  const records = store.get('absensi_records') || [];
  const guruId = APP.currentUser.id;
  const thisMonth = new Date();
  const monthStr = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth()+1).padStart(2,'0')}`;

  const myRecords = records.filter(r => r.guruId === guruId && r.tanggal.startsWith(monthStr));
  const hadir = myRecords.filter(r => r.status === 'hadir' || r.status === 'terlambat').length;
  const izin  = myRecords.filter(r => r.status === 'izin').length;
  const alpha = myRecords.filter(r => r.status === 'alpha').length;
  const terlambat = myRecords.filter(r => r.status === 'terlambat').length;

  el('guru-stat-hadir').textContent     = hadir;
  el('guru-stat-izin').textContent      = izin;
  el('guru-stat-alpha').textContent     = alpha;
  el('guru-stat-terlambat').textContent = terlambat;

  // Today
  const today = getCurrentAbsensiToday(guruId);
  const todayBox = el('guru-today-box');
  if (today) {
    todayBox.innerHTML = `
      <div class="alert alert-${today.status === 'hadir' || today.status === 'terlambat' ? 'success' : 'info'}">
        <span>${today.status === 'hadir' ? '✅' : today.status === 'terlambat' ? '⏰' : '📋'}</span>
        <span>
          <strong>Status Hari Ini: ${ucfirst(today.status)}</strong><br>
          Masuk: ${today.jamMasuk || '-'} &nbsp;|&nbsp; Pulang: ${today.jamPulang || 'Belum absen'}
        </span>
      </div>`;
  } else {
    todayBox.innerHTML = `<div class="alert alert-warning"><span>⏰</span><span><strong>Belum absen hari ini!</strong><br>Silakan lakukan absensi masuk.</span></div>`;
  }

  // Recent 5
  const recent = [...records].filter(r => r.guruId === guruId).sort((a,b) => b.tanggal.localeCompare(a.tanggal)).slice(0,5);
  const recentEl = el('guru-recent-list');
  recentEl.innerHTML = recent.map(r => `
    <div class="riwayat-card ${r.status}">
      <div class="riwayat-card-header">
        <span class="riwayat-date">${formatDateIndo(r.tanggal)}</span>
        <span class="badge badge-${statusBadge(r.status)}">${ucfirst(r.status)}</span>
      </div>
      <div class="riwayat-detail">Masuk: ${r.jamMasuk || '-'} &nbsp;·&nbsp; Pulang: ${r.jamPulang || '-'}</div>
    </div>`).join('') || '<p class="text-muted text-center p-2">Belum ada data absensi.</p>';
}

function ucfirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function statusBadge(s) {
  return { hadir:'success', izin:'warning', alpha:'danger', terlambat:'info' }[s] || 'secondary';
}

// ============================================================
// 7. ABSENSI GURU (Kamera + GPS)
// ============================================================
function renderAbsensiGuru() {
  const today = getCurrentAbsensiToday(APP.currentUser.id);
  const now = new Date();
  const timeStr = formatTime(now);

  // Tombol masuk
  const btnMasuk  = el('btn-absensi-masuk');
  const btnPulang = el('btn-absensi-pulang');

  btnMasuk.classList.remove('done','disabled');
  btnPulang.classList.remove('done','disabled');

  if (today) {
    if (today.jamMasuk) {
      btnMasuk.classList.add('done');
      el('absensi-masuk-status').textContent = `✅ ${today.jamMasuk}`;
    }
    if (today.jamPulang) {
      btnPulang.classList.add('done');
      el('absensi-pulang-status').textContent = `✅ ${today.jamPulang}`;
    }
    if (!today.jamMasuk) {
      btnPulang.classList.add('disabled');
    }
  } else {
    btnPulang.classList.add('disabled');
    el('absensi-masuk-status').textContent = 'Belum absen';
    el('absensi-pulang-status').textContent = 'Belum absen';
  }

  // Jadwal info
  el('info-jam-masuk').textContent = `${APP.settings.jamMasukMulai} – ${APP.settings.jamMasukSelesai}`;
  el('info-jam-pulang').textContent = APP.settings.jamPulang;
  el('info-radius').textContent = `${APP.settings.radiusMeters} meter`;
}

function openAbsensiModal(mode) {
  APP.absensiMode = mode;
  APP.capturedPhoto = null;
  APP.lastLocation = null;

  el('modal-absensi-title').textContent = mode === 'masuk' ? '📥 Absensi Masuk' : '📤 Absensi Pulang';
  el('btn-submit-absensi').textContent = mode === 'masuk' ? 'Absen Masuk' : 'Absen Pulang';

  // Reset states
  el('camera-preview').style.display = 'none';
  el('camera-video').style.display = 'block';
  el('camera-overlay').classList.remove('hidden');
  el('camera-overlay').innerHTML = '<div class="spinner" style="border-top-color:#fff;width:28px;height:28px;"></div><p>Memulai kamera...</p>';
  resetGPSStatus();
  hideAlert('absensi-modal-alert');
  el('btn-capture').style.display = 'none';
  el('btn-retake').style.display = 'none';

  el('modal-absensi').classList.add('show');
  startCamera();
  startGPS();
}

function closeAbsensiModal() {
  stopCamera();
  if (APP.gpsWatcher) {
    navigator.geolocation.clearWatch(APP.gpsWatcher);
    APP.gpsWatcher = null;
  }
  el('modal-absensi').classList.remove('show');
}

// --- CAMERA ---
async function startCamera() {
  stopCamera();
  const overlay = el('camera-overlay');
  const video = el('camera-video');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    overlay.innerHTML = '<span style="font-size:2rem">📷</span><p>Kamera tidak didukung browser ini.<br>Gunakan Chrome atau Safari terbaru.</p>';
    return;
  }

  // Constraints: prefer front camera
  const constraints = {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    APP.cameraStream = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', ''); // iOS Safari
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    await video.play();
    overlay.classList.add('hidden');
    el('btn-capture').style.display = 'flex';
    updateCameraStatus('ok', '✅ Kamera aktif — posisikan wajah di dalam lingkaran');
  } catch (err) {
    let msg = 'Gagal mengakses kamera.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = 'Izin kamera ditolak. Buka Pengaturan Browser → izinkan akses kamera untuk situs ini.';
    } else if (err.name === 'NotFoundError') {
      msg = 'Tidak ada kamera yang ditemukan pada perangkat ini.';
    } else if (err.name === 'NotReadableError') {
      msg = 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain dan coba lagi.';
    } else if (err.name === 'OverconstrainedError') {
      // Retry without facingMode constraint
      retryCamera();
      return;
    }
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<span style="font-size:2rem">📷</span><p style="color:#ff6b6b">${msg}</p>`;
    updateCameraStatus('err', '❌ ' + msg);
  }
}

async function retryCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    APP.cameraStream = stream;
    const video = el('camera-video');
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    await video.play();
    el('camera-overlay').classList.add('hidden');
    el('btn-capture').style.display = 'flex';
    updateCameraStatus('ok', '✅ Kamera aktif');
  } catch (err) {
    el('camera-overlay').innerHTML = '<span style="font-size:2rem">📷</span><p style="color:#ff6b6b">Kamera tidak dapat diakses.</p>';
  }
}

function stopCamera() {
  if (APP.cameraStream) {
    APP.cameraStream.getTracks().forEach(t => t.stop());
    APP.cameraStream = null;
  }
  const video = el('camera-video');
  if (video) video.srcObject = null;
}

function updateCameraStatus(type, msg) {
  const s = el('camera-status-text');
  if (s) {
    s.className = `camera-status ${type}`;
    s.textContent = msg;
  }
}

function capturePhoto() {
  const video = el('camera-video');
  const canvas = el('camera-canvas');
  const preview = el('camera-preview');
  if (!video || !canvas) return;

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // Mirror
  ctx.drawImage(video, 0, 0);

  APP.capturedPhoto = canvas.toDataURL('image/jpeg', 0.7);
  preview.src = APP.capturedPhoto;
  preview.style.display = 'block';
  video.style.display = 'none';
  el('camera-overlay').classList.add('hidden');
  stopCamera();

  el('btn-capture').style.display = 'none';
  el('btn-retake').style.display = 'flex';
  updateCameraStatus('ok', '✅ Foto berhasil diambil');
}

function retakePhoto() {
  APP.capturedPhoto = null;
  const preview = el('camera-preview');
  const video = el('camera-video');
  preview.style.display = 'none';
  video.style.display = 'block';
  el('camera-overlay').classList.remove('hidden');
  el('camera-overlay').innerHTML = '<div class="spinner" style="border-top-color:#fff;width:28px;height:28px;"></div><p>Memulai kamera...</p>';
  el('btn-capture').style.display = 'none';
  el('btn-retake').style.display = 'none';
  startCamera();
}

// --- GPS ---
function resetGPSStatus() {
  const box = el('gps-status-box');
  if (box) {
    box.className = 'gps-status-box loading';
    box.innerHTML = `<span class="gps-icon">📡</span>
      <div><div class="gps-label">Mendapatkan lokasi...</div>
      <div class="gps-detail">Pastikan GPS aktif di perangkat Anda.</div></div>`;
  }
  const bar = el('distance-fill');
  if (bar) { bar.style.width = '0%'; bar.style.background = '#ccc'; }
}

function startGPS() {
  if (!navigator.geolocation) {
    updateGPSStatus('error', 'GPS tidak didukung browser ini.', null);
    return;
  }

  APP.gpsWatcher = navigator.geolocation.watchPosition(
    (pos) => {
      APP.lastLocation = pos;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const dist = haversineDistance(lat, lng, APP.settings.lokasiLat, APP.settings.lokasiLng);
      const inRadius = dist <= APP.settings.radiusMeters;
      const pct = Math.min(100, (dist / APP.settings.radiusMeters) * 100);

      const bar = el('distance-fill');
      if (bar) {
        bar.style.width = `${pct}%`;
        bar.style.background = inRadius ? '#27ae60' : dist < APP.settings.radiusMeters * 1.5 ? '#f39c12' : '#e74c3c';
      }

      if (inRadius) {
        updateGPSStatus('ok',
          `✅ Dalam radius sekolah (${Math.round(dist)} m)`,
          `Akurasi: ±${Math.round(acc)} m · Koordinat: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
        );
      } else {
        updateGPSStatus('error',
          `❌ Di luar radius (${Math.round(dist)} m dari sekolah)`,
          `Radius yang diizinkan: ${APP.settings.radiusMeters} m · Akurasi: ±${Math.round(acc)} m`
        );
      }
    },
    (err) => {
      let msg = 'Gagal mendapatkan lokasi.';
      if (err.code === 1) msg = 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.';
      else if (err.code === 2) msg = 'GPS tidak tersedia. Pastikan lokasi perangkat diaktifkan.';
      else if (err.code === 3) msg = 'Waktu mendapatkan lokasi habis. Coba lagi.';
      updateGPSStatus('error', '❌ ' + msg, null);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

function updateGPSStatus(type, label, detail) {
  const box = el('gps-status-box');
  if (!box) return;
  box.className = `gps-status-box ${type}`;
  const icon = type === 'ok' ? '📍' : type === 'error' ? '🚫' : '📡';
  box.innerHTML = `<span class="gps-icon">${icon}</span>
    <div>
      <div class="gps-label">${label}</div>
      ${detail ? `<div class="gps-detail">${detail}</div>` : ''}
    </div>`;
}

// --- SUBMIT ABSENSI ---
function submitAbsensi() {
  hideAlert('absensi-modal-alert');

  // Validasi foto
  if (APP.settings.wajibFoto && !APP.capturedPhoto) {
    showAlert('absensi-modal-alert', 'Foto wajah wajib diambil terlebih dahulu.', 'danger');
    return;
  }

  // Validasi GPS
  if (APP.settings.wajibGPS) {
    if (!APP.lastLocation) {
      showAlert('absensi-modal-alert', 'Lokasi GPS belum diperoleh. Tunggu sebentar atau aktifkan GPS.', 'warning');
      return;
    }
    const lat = APP.lastLocation.coords.latitude;
    const lng = APP.lastLocation.coords.longitude;
    const dist = haversineDistance(lat, lng, APP.settings.lokasiLat, APP.settings.lokasiLng);
    if (dist > APP.settings.radiusMeters) {
      showAlert('absensi-modal-alert', `Anda berada ${Math.round(dist)} m dari sekolah. Radius yang diizinkan: ${APP.settings.radiusMeters} m.`, 'danger');
      return;
    }
  }

  setLoading('btn-submit-absensi', true);

  setTimeout(() => {
    const now = new Date();
    const guruId = APP.currentUser.id;
    const today = formatDate();
    let record = getCurrentAbsensiToday(guruId);

    if (!record) {
      record = {
        id: `${guruId}_${today}`,
        guruId,
        guruNama: APP.currentUser.nama,
        tanggal: today,
        status: 'hadir',
        jamMasuk: null,
        jamPulang: null,
        foto: null,
        koordinat: null,
      };
    }

    if (APP.absensiMode === 'masuk') {
      const jamMasuk = formatTime(now);
      record.jamMasuk = jamMasuk;
      record.foto = APP.capturedPhoto;
      if (APP.lastLocation) {
        record.koordinat = `${APP.lastLocation.coords.latitude.toFixed(6)},${APP.lastLocation.coords.longitude.toFixed(6)}`;
      }
      // Cek terlambat
      const [bh, bm] = APP.settings.jamMasukSelesai.split(':').map(Number);
      const batasMasuk = new Date(); batasMasuk.setHours(bh, bm, 0, 0);
      if (now > batasMasuk) record.status = 'terlambat';
      else record.status = 'hadir';
    } else {
      record.jamPulang = formatTime(now);
    }

    upsertAbsensi(record);
    setLoading('btn-submit-absensi', false);
    closeAbsensiModal();
    renderAbsensiGuru();
    showToast(
      APP.absensiMode === 'masuk' ? `✅ Absen masuk berhasil: ${record.jamMasuk}` : `✅ Absen pulang berhasil: ${record.jamPulang}`,
      'success', 4000
    );
  }, 800);
}

// ============================================================
// 8. IZIN GURU
// ============================================================
function renderIzinGuru() {
  const izinList = (store.get('izin_requests') || []).filter(r => r.guruId === APP.currentUser.id).sort((a,b) => b.tanggal.localeCompare(a.tanggal));
  const listEl = el('izin-riwayat-list');
  listEl.innerHTML = izinList.slice(0,10).map(r => `
    <div class="riwayat-card ${r.status === 'disetujui' ? 'hadir' : r.status === 'ditolak' ? 'alpha' : 'izin'}">
      <div class="riwayat-card-header">
        <span class="riwayat-date">${formatDateIndo(r.tanggal)} · ${r.jenis}</span>
        <span class="badge badge-${r.status === 'disetujui' ? 'success' : r.status === 'ditolak' ? 'danger' : 'warning'}">${ucfirst(r.status)}</span>
      </div>
      <div class="riwayat-detail">${r.keterangan}</div>
    </div>`).join('') || '<p class="text-muted text-center p-2">Belum ada pengajuan izin.</p>';
}

function selectIzinType(type) {
  document.querySelectorAll('.izin-type-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll(`[data-izin-type="${type}"]`).forEach(b => b.classList.add('selected'));
  el('input-izin-type').value = type;
}

function submitIzin() {
  hideAlert('izin-alert');
  const jenis = el('input-izin-type').value;
  const tanggal = el('input-izin-tanggal').value;
  const keterangan = el('input-izin-keterangan').value.trim();

  if (!jenis) { showAlert('izin-alert', 'Pilih jenis izin.', 'warning'); return; }
  if (!tanggal) { showAlert('izin-alert', 'Pilih tanggal izin.', 'warning'); return; }
  if (!keterangan) { showAlert('izin-alert', 'Isi keterangan izin.', 'warning'); return; }

  const req = {
    id: Date.now().toString(),
    guruId: APP.currentUser.id,
    guruNama: APP.currentUser.nama,
    jenis, tanggal, keterangan,
    status: 'menunggu',
    createdAt: new Date().toISOString(),
  };

  const list = store.get('izin_requests') || [];
  list.push(req);
  store.set('izin_requests', list);

  el('input-izin-type').value = '';
  el('input-izin-tanggal').value = '';
  el('input-izin-keterangan').value = '';
  document.querySelectorAll('.izin-type-btn').forEach(b => b.classList.remove('selected'));

  showAlert('izin-alert', 'Pengajuan izin berhasil dikirim. Menunggu persetujuan admin.', 'success');
  renderIzinGuru();
  showToast('Pengajuan izin terkirim.', 'success');
}

// ============================================================
// 9. RIWAYAT GURU
// ============================================================
function renderRiwayatGuru() {
  const records = store.get('absensi_records') || [];
  const guruId = APP.currentUser.id;
  const filterBulan = el('filter-riwayat-bulan')?.value || '';

  const my = records
    .filter(r => r.guruId === guruId && (!filterBulan || r.tanggal.startsWith(filterBulan)))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const listEl = el('riwayat-guru-list');
  listEl.innerHTML = my.map(r => `
    <div class="riwayat-card ${r.status}">
      <div class="riwayat-card-header">
        <span class="riwayat-date">${formatDateIndo(r.tanggal)}</span>
        <span class="badge badge-${statusBadge(r.status)}">${ucfirst(r.status)}</span>
      </div>
      <div class="riwayat-detail">
        Masuk: <strong>${r.jamMasuk || '-'}</strong> &nbsp;·&nbsp; Pulang: <strong>${r.jamPulang || '-'}</strong>
        ${r.koordinat ? `<br>📍 ${r.koordinat}` : ''}
      </div>
    </div>`).join('') || '<p class="text-muted text-center p-2">Tidak ada data.</p>';
}

// ============================================================
// 10. PROFIL GURU
// ============================================================
function renderProfilGuru() {
  const u = APP.currentUser;
  el('profil-nama').textContent   = u.nama    || '-';
  el('profil-nip').textContent    = u.nip     || '-';
  el('profil-mapel').textContent  = u.mapel   || '-';
  el('profil-username').textContent = u.username || '-';
}

function changePasswordGuru() {
  hideAlert('profil-alert');
  const lama = el('input-pw-lama').value;
  const baru = el('input-pw-baru').value;
  const konfirmasi = el('input-pw-konfirmasi').value;

  const guruList = store.get('guru_list') || [];
  const idx = guruList.findIndex(g => g.id === APP.currentUser.id);
  if (idx < 0 || guruList[idx].password !== lama) {
    showAlert('profil-alert', 'Password lama salah.', 'danger');
    return;
  }
  if (baru.length < 6) {
    showAlert('profil-alert', 'Password baru minimal 6 karakter.', 'warning');
    return;
  }
  if (baru !== konfirmasi) {
    showAlert('profil-alert', 'Konfirmasi password tidak cocok.', 'danger');
    return;
  }
  guruList[idx].password = baru;
  store.set('guru_list', guruList);
  showAlert('profil-alert', 'Password berhasil diubah.', 'success');
  el('input-pw-lama').value = '';
  el('input-pw-baru').value = '';
  el('input-pw-konfirmasi').value = '';
}

// ============================================================
// 11. ADMIN PAGES
// ============================================================
function initAdmin() {
  el('admin-sidebar-name').textContent = APP.currentUser?.nama || 'Administrator';
  navigateAdmin('dashboard-admin');
}

function navigateAdmin(section) {
  document.querySelectorAll('#page-admin .nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('#page-admin .section-view').forEach(s => s.classList.remove('active'));

  const sectionEl = el(section);
  if (sectionEl) sectionEl.classList.add('active');
  document.querySelectorAll(`[data-admin-nav="${section}"]`).forEach(n => n.classList.add('active'));

  closeSidebar('admin-sidebar');
  el('admin-mobile-title').textContent = sectionLabels[section] || 'Admin';

  if (section === 'dashboard-admin') renderDashboardAdmin();
  if (section === 'admin-guru')      renderAdminGuru();
  if (section === 'admin-absensi')   renderAdminAbsensi();
  if (section === 'admin-izin')      renderAdminIzin();
  if (section === 'admin-laporan')   renderAdminLaporan();
  if (section === 'admin-pengaturan') renderAdminPengaturan();
}

const sectionLabels = {
  'dashboard-admin':   'Dashboard',
  'admin-guru':        'Daftar Guru',
  'admin-absensi':     'Rekap Absensi',
  'admin-izin':        'Pengajuan Izin',
  'admin-laporan':     'Laporan & Ekspor',
  'admin-pengaturan':  'Pengaturan',
};

function renderDashboardAdmin() {
  const records = store.get('absensi_records') || [];
  const guru = store.get('guru_list') || [];
  const today = formatDate();
  const todayRecs = records.filter(r => r.tanggal === today);

  el('admin-stat-guru').textContent = guru.length;
  el('admin-stat-hadir-today').textContent = todayRecs.filter(r => r.status === 'hadir' || r.status === 'terlambat').length;
  el('admin-stat-izin-today').textContent  = todayRecs.filter(r => r.status === 'izin').length;
  el('admin-stat-alpha-today').textContent = guru.length - todayRecs.length + todayRecs.filter(r => r.status === 'alpha').length;

  // Render chart
  renderBarChart();

  // Render today table
  renderAdminTodayTable(todayRecs, guru);
}

function renderBarChart() {
  const records = store.get('absensi_records') || [];
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][d.getMonth()],
      key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
    });
  }

  const maxCount = Math.max(...months.map(m => records.filter(r => r.tanggal.startsWith(m.key) && (r.status === 'hadir' || r.status === 'terlambat')).length), 1);

  const chartEl = el('admin-bar-chart');
  if (!chartEl) return;
  chartEl.innerHTML = months.map(m => {
    const count = records.filter(r => r.tanggal.startsWith(m.key) && (r.status === 'hadir' || r.status === 'terlambat')).length;
    const pct = Math.round((count / maxCount) * 100);
    return `<div class="bar-item">
      <div class="bar-value">${count}</div>
      <div class="bar-fill" style="height:${pct}%;background:var(--primary-light);"></div>
      <div class="bar-label">${m.label}</div>
    </div>`;
  }).join('');
}

function renderAdminTodayTable(todayRecs, guru) {
  const tbody = el('today-absensi-tbody');
  const cardList = el('today-absensi-cards');
  if (!tbody && !cardList) return;

  const rows = guru.map(g => {
    const rec = todayRecs.find(r => r.guruId === g.id);
    const status = rec ? rec.status : 'alpha';
    const masuk  = rec?.jamMasuk  || '-';
    const pulang = rec?.jamPulang || '-';
    return { g, status, masuk, pulang };
  });

  if (tbody) {
    tbody.innerHTML = rows.map(({ g, status, masuk, pulang }) => `
      <tr>
        <td><strong>${g.nama}</strong><br><small class="text-muted">${g.mapel}</small></td>
        <td>${masuk}</td>
        <td>${pulang}</td>
        <td><span class="badge badge-${statusBadge(status)}">${ucfirst(status)}</span></td>
      </tr>`).join('');
  }

  if (cardList) {
    cardList.innerHTML = rows.map(({ g, status, masuk, pulang }) => `
      <div class="guru-card">
        <div class="guru-avatar">${g.nama[0]}</div>
        <div class="guru-info">
          <div class="guru-name">${g.nama}</div>
          <div class="guru-nip">${g.mapel} · Masuk: ${masuk} · Pulang: ${pulang}</div>
        </div>
        <span class="badge badge-${statusBadge(status)}">${ucfirst(status)}</span>
      </div>`).join('');
  }
}

function renderAdminGuru() {
  const guru = store.get('guru_list') || [];
  const tbody  = el('guru-list-tbody');
  const cardList = el('guru-list-cards');

  if (tbody) {
    tbody.innerHTML = guru.map(g => `
      <tr>
        <td><strong>${g.nama}</strong></td>
        <td>${g.nip}</td>
        <td>${g.mapel}</td>
        <td>${g.username}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editGuruModal('${g.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteGuru('${g.id}')">🗑️</button>
        </td>
      </tr>`).join('');
  }

  if (cardList) {
    cardList.innerHTML = guru.map(g => `
      <div class="guru-card">
        <div class="guru-avatar">${g.nama[0]}</div>
        <div class="guru-info">
          <div class="guru-name">${g.nama}</div>
          <div class="guru-nip">NIP: ${g.nip} · ${g.mapel}</div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-shrink:0;">
          <button class="btn btn-sm btn-outline" onclick="editGuruModal('${g.id}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteGuru('${g.id}')">🗑️</button>
        </div>
      </div>`).join('');
  }
}

function deleteGuru(id) {
  if (!confirm('Hapus data guru ini?')) return;
  let guru = store.get('guru_list') || [];
  guru = guru.filter(g => g.id !== id);
  store.set('guru_list', guru);
  renderAdminGuru();
  showToast('Data guru dihapus.', 'info');
}

function editGuruModal(id) {
  const guru = store.get('guru_list') || [];
  const g = guru.find(x => x.id === id);
  if (!g) return;
  el('edit-guru-id').value = g.id;
  el('edit-guru-nama').value = g.nama;
  el('edit-guru-nip').value = g.nip;
  el('edit-guru-mapel').value = g.mapel;
  el('edit-guru-username').value = g.username;
  el('edit-guru-password').value = '';
  el('modal-edit-guru').classList.add('show');
}

function saveEditGuru() {
  const id = el('edit-guru-id').value;
  const guru = store.get('guru_list') || [];
  const idx = guru.findIndex(g => g.id === id);
  if (idx < 0) return;
  guru[idx].nama = el('edit-guru-nama').value.trim();
  guru[idx].nip = el('edit-guru-nip').value.trim();
  guru[idx].mapel = el('edit-guru-mapel').value.trim();
  guru[idx].username = el('edit-guru-username').value.trim();
  if (el('edit-guru-password').value) guru[idx].password = el('edit-guru-password').value;
  store.set('guru_list', guru);
  el('modal-edit-guru').classList.remove('show');
  renderAdminGuru();
  showToast('Data guru diperbarui.', 'success');
}

function addGuruNew() {
  el('edit-guru-id').value = '';
  el('edit-guru-nama').value = '';
  el('edit-guru-nip').value = '';
  el('edit-guru-mapel').value = '';
  el('edit-guru-username').value = '';
  el('edit-guru-password').value = '';
  el('modal-edit-guru').classList.add('show');
}

function saveGuruForm() {
  const id = el('edit-guru-id').value;
  if (id) { saveEditGuru(); return; }
  // Add new
  const guru = store.get('guru_list') || [];
  const newG = {
    id: 'G' + String(Date.now()).slice(-4),
    nama: el('edit-guru-nama').value.trim(),
    nip: el('edit-guru-nip').value.trim(),
    mapel: el('edit-guru-mapel').value.trim(),
    username: el('edit-guru-username').value.trim(),
    password: el('edit-guru-password').value || 'guru123',
  };
  if (!newG.nama || !newG.username) { showToast('Nama dan username wajib diisi.', 'error'); return; }
  guru.push(newG);
  store.set('guru_list', guru);
  el('modal-edit-guru').classList.remove('show');
  renderAdminGuru();
  showToast('Guru baru ditambahkan.', 'success');
}

function renderAdminAbsensi() {
  const records = store.get('absensi_records') || [];
  const filterTgl = el('filter-absensi-tgl')?.value;
  const filterStatus = el('filter-absensi-status')?.value || '';

  const filtered = records
    .filter(r => (!filterTgl || r.tanggal === filterTgl) && (!filterStatus || r.status === filterStatus))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    .slice(0, 100);

  const tbody = el('admin-absensi-tbody');
  const cardList = el('admin-absensi-cards');

  if (tbody) {
    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${formatDateIndo(r.tanggal)}</td>
        <td><strong>${r.guruNama}</strong></td>
        <td>${r.jamMasuk || '-'}</td>
        <td>${r.jamPulang || '-'}</td>
        <td><span class="badge badge-${statusBadge(r.status)}">${ucfirst(r.status)}</span></td>
        <td>${r.koordinat ? `<a href="https://maps.google.com/?q=${r.koordinat}" target="_blank" rel="noopener">📍 Lihat</a>` : '-'}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted" style="padding:1.5rem">Tidak ada data.</td></tr>';
  }

  if (cardList) {
    cardList.innerHTML = filtered.map(r => `
      <div class="riwayat-card ${r.status}">
        <div class="riwayat-card-header">
          <span class="riwayat-date">${r.guruNama}</span>
          <span class="badge badge-${statusBadge(r.status)}">${ucfirst(r.status)}</span>
        </div>
        <div class="riwayat-detail">${formatDateIndo(r.tanggal)} · Masuk: ${r.jamMasuk||'-'} · Pulang: ${r.jamPulang||'-'}</div>
      </div>`).join('') || '<p class="text-muted text-center p-2">Tidak ada data.</p>';
  }
}

function renderAdminIzin() {
  const list = store.get('izin_requests') || [];
  const tbody = el('admin-izin-tbody');
  const cardList = el('admin-izin-cards');

  const rows = [...list].sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  if (tbody) {
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${r.guruNama}</strong></td>
        <td>${formatDateIndo(r.tanggal)}</td>
        <td>${r.jenis}</td>
        <td>${r.keterangan}</td>
        <td><span class="badge badge-${r.status==='disetujui'?'success':r.status==='ditolak'?'danger':'warning'}">${ucfirst(r.status)}</span></td>
        <td>
          ${r.status === 'menunggu' ? `
            <button class="btn btn-sm btn-success" onclick="approveIzin('${r.id}',true)">✅</button>
            <button class="btn btn-sm btn-danger" onclick="approveIzin('${r.id}',false)">❌</button>
          ` : '-'}
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted" style="padding:1.5rem">Tidak ada pengajuan.</td></tr>';
  }

  if (cardList) {
    cardList.innerHTML = rows.map(r => `
      <div class="riwayat-card ${r.status==='disetujui'?'hadir':r.status==='ditolak'?'alpha':'izin'}">
        <div class="riwayat-card-header">
          <span class="riwayat-date">${r.guruNama} · ${r.jenis}</span>
          <span class="badge badge-${r.status==='disetujui'?'success':r.status==='ditolak'?'danger':'warning'}">${ucfirst(r.status)}</span>
        </div>
        <div class="riwayat-detail">${formatDateIndo(r.tanggal)} · ${r.keterangan}</div>
        ${r.status === 'menunggu' ? `
          <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
            <button class="btn btn-sm btn-success" onclick="approveIzin('${r.id}',true)">✅ Setujui</button>
            <button class="btn btn-sm btn-danger" onclick="approveIzin('${r.id}',false)">❌ Tolak</button>
          </div>` : ''}
      </div>`).join('') || '<p class="text-muted text-center p-2">Tidak ada pengajuan.</p>';
  }
}

function approveIzin(id, approved) {
  const list = store.get('izin_requests') || [];
  const idx = list.findIndex(r => r.id === id);
  if (idx < 0) return;
  list[idx].status = approved ? 'disetujui' : 'ditolak';
  store.set('izin_requests', list);

  // Jika disetujui, update absensi record
  if (approved) {
    const r = list[idx];
    const existing = (store.get('absensi_records') || []).find(x => x.guruId === r.guruId && x.tanggal === r.tanggal);
    if (!existing) {
      upsertAbsensi({
        id: `${r.guruId}_${r.tanggal}`,
        guruId: r.guruId,
        guruNama: r.guruNama,
        tanggal: r.tanggal,
        status: 'izin',
        jamMasuk: null,
        jamPulang: null,
        foto: null,
        koordinat: null,
      });
    }
  }

  renderAdminIzin();
  showToast(approved ? 'Izin disetujui.' : 'Izin ditolak.', approved ? 'success' : 'info');
}

function renderAdminLaporan() {
  // Summary stats
  const records = store.get('absensi_records') || [];
  const guru = store.get('guru_list') || [];
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const thisMonth = records.filter(r => r.tanggal.startsWith(monthStr));

  el('laporan-total-hadir').textContent = thisMonth.filter(r => r.status==='hadir'||r.status==='terlambat').length;
  el('laporan-total-izin').textContent  = thisMonth.filter(r => r.status==='izin').length;
  el('laporan-total-alpha').textContent = thisMonth.filter(r => r.status==='alpha').length;
  el('laporan-total-terlambat').textContent = thisMonth.filter(r => r.status==='terlambat').length;
}

// ============================================================
// 12. EXCEL EXPORT
// ============================================================
function exportExcel(type = 'all') {
  const records = store.get('absensi_records') || [];
  const guru = store.get('guru_list') || [];
  const now = new Date();

  let data = records;
  if (type === 'today') {
    data = records.filter(r => r.tanggal === formatDate());
  } else if (type === 'month') {
    const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    data = records.filter(r => r.tanggal.startsWith(ms));
  }

  data = [...data].sort((a,b) => b.tanggal.localeCompare(a.tanggal));

  // Build CSV
  const header = ['Tanggal','Nama Guru','NIP','Mata Pelajaran','Jam Masuk','Jam Pulang','Status','Koordinat'];
  const rows = data.map(r => {
    const g = guru.find(x => x.id === r.guruId);
    return [
      r.tanggal,
      `"${r.guruNama}"`,
      g?.nip || '',
      `"${g?.mapel || ''}"`,
      r.jamMasuk || '',
      r.jamPulang || '',
      r.status,
      r.koordinat || '',
    ].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Absensi_AnNamiroh_${formatDate()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('File Excel (CSV) berhasil diunduh.', 'success');
}

function exportPDF() {
  window.print();
}

// ============================================================
// 13. ADMIN PENGATURAN
// ============================================================
function renderAdminPengaturan() {
  const s = APP.settings;
  el('set-nama-sekolah').value = s.namaSekolah;
  el('set-lat').value = s.lokasiLat;
  el('set-lng').value = s.lokasiLng;
  el('set-radius').value = s.radiusMeters;
  el('set-jam-masuk-mulai').value = s.jamMasukMulai;
  el('set-jam-masuk-selesai').value = s.jamMasukSelesai;
  el('set-toleransi').value = s.toleransiMenitTerlambat;
  el('set-jam-pulang').value = s.jamPulang;
  el('set-wajib-foto').checked = s.wajibFoto;
  el('set-wajib-gps').checked = s.wajibGPS;
}

function saveAdminSettings() {
  APP.settings.namaSekolah = el('set-nama-sekolah').value.trim();
  APP.settings.lokasiLat = parseFloat(el('set-lat').value) || 0;
  APP.settings.lokasiLng = parseFloat(el('set-lng').value) || 0;
  APP.settings.radiusMeters = parseInt(el('set-radius').value) || 200;
  APP.settings.jamMasukMulai = el('set-jam-masuk-mulai').value;
  APP.settings.jamMasukSelesai = el('set-jam-masuk-selesai').value;
  APP.settings.toleransiMenitTerlambat = parseInt(el('set-toleransi').value) || 15;
  APP.settings.jamPulang = el('set-jam-pulang').value;
  APP.settings.wajibFoto = el('set-wajib-foto').checked;
  APP.settings.wajibGPS = el('set-wajib-gps').checked;
  store.set('app_settings', APP.settings);
  showToast('Pengaturan tersimpan.', 'success');
}

function getLocationForAdmin() {
  if (!navigator.geolocation) { showToast('GPS tidak didukung.', 'error'); return; }
  showToast('Mendapatkan lokasi...', 'info');
  navigator.geolocation.getCurrentPosition(
    pos => {
      el('set-lat').value = pos.coords.latitude.toFixed(6);
      el('set-lng').value = pos.coords.longitude.toFixed(6);
      showToast(`Lokasi didapat: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`, 'success');
    },
    () => showToast('Gagal mendapatkan lokasi.', 'error'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ============================================================
// 14. SIDEBAR HELPERS
// ============================================================
function openSidebar(id) {
  el(id).classList.add('open');
  el(id + '-overlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeSidebar(id) {
  el(id)?.classList.remove('open');
  el(id + '-overlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

// ============================================================
// 15. PWA INSTALL
// ============================================================
function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    APP.deferredInstallPrompt = e;
    el('install-banner')?.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    el('install-banner')?.classList.add('hidden');
    showToast('Aplikasi berhasil dipasang!', 'success');
  });
}

function installApp() {
  if (APP.deferredInstallPrompt) {
    APP.deferredInstallPrompt.prompt();
    APP.deferredInstallPrompt.userChoice.then(choice => {
      if (choice.outcome === 'accepted') showToast('Memasang aplikasi...', 'success');
      APP.deferredInstallPrompt = null;
      el('install-banner')?.classList.add('hidden');
    });
  }
}

// ============================================================
// 16. SERVICE WORKER REGISTRATION
// ============================================================
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[SW] Registered'))
      .catch(err => console.warn('[SW] Registration failed:', err));
  }
}

// ============================================================
// 17. SET MONTH FILTER DEFAULT
// ============================================================
function initFilters() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const filterBulan = el('filter-riwayat-bulan');
  if (filterBulan) filterBulan.value = monthStr;
  const filterTgl = el('filter-absensi-tgl');
  if (filterTgl) filterTgl.value = formatDate();
}

// ============================================================
// 18. INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  seedData();
  initFilters();
  initLogin();
  initPWA();
  registerSW();

  // Auto-login from session
  const session = store.get('session');
  if (session) {
    if (session.role === 'admin') {
      APP.currentUser = session;
      APP.currentRole = 'admin';
      initAdmin();
      showPage('page-admin');
    } else {
      APP.currentUser = session;
      APP.currentRole = 'guru';
      initGuru();
      showPage('page-guru');
    }
  } else {
    showPage('page-login');
  }

  // Set min date for izin
  const tglInput = el('input-izin-tanggal');
  if (tglInput) tglInput.min = formatDate();
});

// ============================================================
// 19. GLOBAL EXPORTS (Diperlukan karena Vite ES Module)
//     Semua fungsi yang dipanggil via onclick="..." di HTML
//     harus diekspose ke window secara eksplisit.
// ============================================================
Object.assign(window, {
  // Auth
  handleLogout,
  // Guru navigation
  navigateGuru,
  // Absensi
  openAbsensiModal,
  closeAbsensiModal,
  capturePhoto,
  retakePhoto,
  submitAbsensi,
  // Izin
  selectIzinType,
  submitIzin,
  // Riwayat
  renderRiwayatGuru,
  // Profil
  changePasswordGuru,
  // Admin navigation
  navigateAdmin,
  // Admin Guru
  addGuruNew,
  editGuruModal,
  deleteGuru,
  saveGuruForm,
  // Admin Absensi
  renderAdminAbsensi,
  // Admin Izin
  approveIzin,
  renderAdminIzin,
  // Admin Laporan
  exportExcel,
  exportPDF,
  // Admin Pengaturan
  saveAdminSettings,
  getLocationForAdmin,
  // Sidebar
  openSidebar,
  closeSidebar,
  // PWA
  installApp,
  // Utility
  el,
});
