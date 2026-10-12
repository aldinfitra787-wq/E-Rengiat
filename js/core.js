/* =====================================================================
 * E-RENGIAT — core.js
 * Fondasi: konfigurasi, penyimpanan lokal per pengguna, api() tahan jaringan HP
 * (timeout, retry baca, reqId untuk tulis), pengukur performa, router SPA hash,
 * toast, modal, dan utilitas format Indonesia.
 * ===================================================================== */
'use strict';

const CFG = window.APP_CONFIG || {};
const GAS_URL = String(CFG.GAS_URL || '').trim();
const APP_VERSI = '1.0.0';
const LS_PREFIX = 'erengiat:v1:';

const JENIS = ['Tahunan', 'Bulanan', 'Mingguan', 'Harian'];
const JENIS_META = {
  Tahunan:  { icon: 'landmark',       desc: 'Perencanaan Makro & Renstra',       pendek: 'Renstra & RKA',    nav: 'Rencana Tahunan' },
  Bulanan:  { icon: 'calendar-days',  desc: 'Target Operasional 30 Hari',         pendek: 'Operasional Bulan', nav: 'Rencana Bulanan' },
  Mingguan: { icon: 'columns-3',      desc: 'Jadwal Unit & Subbagian',            pendek: 'Operasional Unit', nav: 'Rencana Mingguan' },
  Harian:   { icon: 'clock',          desc: 'Logistik, Personil & Agenda Harian', pendek: 'Agenda Taktis',    nav: 'Agenda Harian' }
};
const STATUS = ['Draf', 'Review', 'Revisi', 'Disetujui', 'Selesai', 'Dibatalkan'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ---------------------------------------------------------------------
// Penyimpanan lokal (namespace per pengguna + versi skema)
// ---------------------------------------------------------------------
const Store = {
  get(k, d) { try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem(LS_PREFIX + k, s); }
    catch (e) {
      try { Object.keys(localStorage).filter(x => x.indexOf(LS_PREFIX + 'u:') === 0 && x.indexOf(userKey('')) < 0).forEach(x => localStorage.removeItem(x)); localStorage.setItem(LS_PREFIX + k, s); } catch (e2) { /* tetap jalan tanpa cache */ }
    }
  },
  del(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) {} },
  clearUser() { try { Object.keys(localStorage).filter(x => x.indexOf(LS_PREFIX + userKey('')) === 0).forEach(x => localStorage.removeItem(x)); } catch (e) {} }
};
function userKey(k) { return 'u:' + ((AppState.user && AppState.user.email) || 'anon') + ':' + k; }

const AppState = {
  token: Store.get('token', ''),
  user: Store.get('user', null),
  settings: {}, rows: [], ver: '', pejabat: [], templates: [],
  dokumen: null, users: null, logs: null,
  ui: Object.assign({ jenis: 'Bulanan', per: {}, q: '', status: [], unit: '', sort: 'waktu', dir: 1, page: 1, size: 10 }, Store.get('ui', {})),
  lastSync: 0, lastBoot: 0, pending: 0, online: navigator.onLine !== false
};
AppState.ui.q = ''; AppState.ui.page = 1;
function saveUi() { const u = AppState.ui; Store.set('ui', { jenis: u.jenis, per: u.per, sort: u.sort, dir: u.dir, size: u.size }); }

// ---------------------------------------------------------------------
// Bus peristiwa kecil (halaman berlangganan perubahan data)
// ---------------------------------------------------------------------
let _cariCache = new WeakMap();   // teks pencarian per baris (dibangun malas)

const Bus = {
  m: {},
  on(ev, fn) { (this.m[ev] = this.m[ev] || []).push(fn); },
  emit(ev, d) { (this.m[ev] || []).forEach(fn => { try { fn(d); } catch (e) { console.error(e); } }); }
};

// ---------------------------------------------------------------------
// Pengukur performa (Prinsip 0) — panggil Perf.table() di console
// ---------------------------------------------------------------------
const Perf = {
  rows: [],
  add(action, total, server) { this.rows.push({ action, total, server: server == null ? null : server, net: server != null ? total - server : null, at: Date.now() }); if (this.rows.length > 200) this.rows.shift(); },
  table() { console.table(this.rows.slice(-30)); }
};
window.Perf = Perf;

// ---------------------------------------------------------------------
// API — fetch POST text/plain (tanpa preflight CORS), timeout, retry, reqId
// ---------------------------------------------------------------------
const READ_ACTIONS = /^(ping|publicInfo|login|loginGoogle|bootstrap|rengiatList|batch|users|logs|deTemplates|dokumenList|migrasiScan|migrasiPreview|verify)$/;

async function apiOnce(action, data, timeout, reqId) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: AppState.token || '', reqId, data: data || {} })
    });
    const text = await res.text();
    try { const j = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), j.ms); return j; }
    catch (e) { return { success: false, network: true, retryable: res.status >= 500 || res.status === 429 || res.status === 200, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Periksa URL GAS dan akses deployment "Anyone".' }; }
  } catch (err) {
    return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus. Periksa internet Anda.' };
  } finally { clearTimeout(timer); }
}

async function api(action, data, opt = {}) {
  if (!GAS_URL) return { success: false, message: 'GAS_URL belum diisi di js/config.js.' };
  const isRead = READ_ACTIONS.test(action);
  const reqId = isRead ? '' : (opt.reqId || uuid());
  const tries = opt.tries || (isRead ? 3 : 2);              // tulis aman diulang karena reqId sama
  let res;
  for (let i = 0; i < tries; i++) {
    if (i) { await sleep(1200 * i); if (navigator.onLine === false) await waitOnline(15000); }
    res = await apiOnce(action, data, opt.timeout || (isRead ? (i ? 40000 : 25000) : 90000), reqId);
    if (res.success || !res.retryable) break;
    if (/^(login|loginGoogle)$/.test(action)) break;
  }
  if (res.network) setSync('off'); else if (AppState.pending <= 0) setSync('ok');
  if (!res.success && res.data && res.data.code === 'AUTH' && action !== 'login') onSessionExpired();
  return res;
}
function waitOnline(ms) { return new Promise(r => { if (navigator.onLine !== false) return r(); const t = setTimeout(done, ms); function done() { clearTimeout(t); removeEventListener('online', done); r(); } addEventListener('online', done); }); }
function warmUpServer() { if (GAS_URL) fetch(GAS_URL + '?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); }
function onSessionExpired() {
  if (!AppState.token) return;
  AppState.token = ''; Store.del('token');
  toast('warn', 'Sesi berakhir', 'Silakan masuk kembali untuk melanjutkan.');
  go('#/masuk');
}

// Status sinkronisasi di header ("Google Sheets Terhubung")
function setSync(state) {
  const label = { ok: 'Google Sheets Terhubung', busy: 'Menyinkronkan…', off: 'Offline — data tersimpan lokal' }[state];
  document.querySelectorAll('.sync-pill').forEach(el => {
    el.classList.toggle('busy', state === 'busy'); el.classList.toggle('off', state === 'off');
    const s = el.querySelector('span'); if (s) s.textContent = label;
  });
}
async function withPending(p) { AppState.pending++; setSync('busy'); try { return await p; } finally { AppState.pending--; if (AppState.pending <= 0) setSync(navigator.onLine === false ? 'off' : 'ok'); } }

// ---------------------------------------------------------------------
// Data rengiat lokal
// ---------------------------------------------------------------------
function setRows(payload) {
  AppState.ver = payload.ver || AppState.ver;
  AppState.rows = payload.rows || [];
  _cariCache = new WeakMap();
  Store.set(userKey('rows'), { t: Date.now(), ver: AppState.ver, rows: AppState.rows });
  Bus.emit('rows');
}
function persistRows() { Store.set(userKey('rows'), { t: Date.now(), ver: AppState.ver, rows: AppState.rows.filter(r => !r._pending) }); }
function upsertLocal(row, oldId) {
  const i = AppState.rows.findIndex(r => r.id === (oldId || row.id));
  if (i >= 0) AppState.rows[i] = row; else AppState.rows.push(row);
  persistRows(); Bus.emit('rows');
}
function removeLocal(id) { AppState.rows = AppState.rows.filter(r => r.id !== id); persistRows(); Bus.emit('rows'); }
function applyBoot(b) {
  if (!b) return;
  if (b.user) AppState.user = b.user;
  if (b.settings) AppState.settings = b.settings;
  if (b.pejabat) AppState.pejabat = b.pejabat;
  if (b.templates) AppState.templates = b.templates;
  Store.set('user', AppState.user);
  Store.set(userKey('boot'), { t: Date.now(), settings: AppState.settings, pejabat: AppState.pejabat, templates: AppState.templates });
  AppState.lastBoot = Date.now();
  if (b.rengiat) { setRows(b.rengiat); AppState.lastSync = Date.now(); }
  Bus.emit('boot');
}
function loadCache() {
  const b = Store.get(userKey('boot'), null), r = Store.get(userKey('rows'), null);
  if (b) { AppState.settings = b.settings || {}; AppState.pejabat = b.pejabat || []; AppState.templates = b.templates || []; AppState.lastBoot = b.t || 0; }
  if (r) { AppState.ver = r.ver; AppState.rows = r.rows || []; AppState.lastSync = r.t || 0; }
  ['dokumen', 'users', 'logs'].forEach(k => { const c = Store.get(userKey('c:' + k), null); if (c) AppState[k] = c.data; });
  return !!(b && r);
}
function cacheSet(k, data) { AppState[k] = data; Store.set(userKey('c:' + k), { t: Date.now(), data }); }

/** Segarkan data rengiat bila sudah > 30 dtk (atau dipaksa). Server hanya mengirim data bila versinya berubah. */
async function syncRows(force) {
  if (!AppState.token) return;
  if (!force && Date.now() - AppState.lastSync < 30000) return;
  AppState.lastSync = Date.now();
  setSync('busy');
  const res = await api('rengiatList', { ver: AppState.ver });
  if (res.success) { if (!res.data.same) setRows(res.data); setSync('ok'); }
  return res;
}
async function syncBoot(force) {
  if (!AppState.token) return;
  if (!force && Date.now() - AppState.lastBoot < 300000) return syncRows();
  AppState.lastBoot = Date.now();
  setSync('busy');
  const res = await api('bootstrap');
  if (res.success) { const known = AppState.ver; const b = res.data; if (b.rengiat && b.rengiat.ver === known) delete b.rengiat; applyBoot(b); AppState.lastSync = Date.now(); setSync('ok'); }
  return res;
}

// ---------------------------------------------------------------------
// Router SPA (hash). Halaman dibuat sekali lalu disembunyikan/ditampilkan.
// ---------------------------------------------------------------------
const Pages = {};
function registerPage(name, def) { Pages[name] = def; }
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let name = parts[0] || '', param = parts[1] ? decodeURIComponent(parts[1]) : '';
  if (!GAS_URL) name = 'setup';
  else if (!AppState.token) { if (name !== 'masuk' && name !== 'ditolak') name = 'masuk'; }
  else if (!name || name === 'masuk' || name === 'ditolak' || name === 'setup') name = 'ringkasan';
  if (!Pages[name]) name = 'ringkasan';
  const def = Pages[name], key = def.page || name;
  const bare = !!Pages[key].bare;
  document.body.classList.toggle('bg-soft', bare);
  document.getElementById('shell').hidden = bare;
  const host = document.getElementById(bare ? 'bare' : 'view');
  document.getElementById('bare').hidden = !bare;
  let el = host.querySelector('.page[data-page="' + key + '"]');
  const baru = !el;
  if (baru) { el = document.createElement('section'); el.className = 'page page-' + key; el.dataset.page = key; host.appendChild(el); Pages[key].init && Pages[key].init(el); }
  document.querySelectorAll('.page').forEach(p => { p.hidden = p !== el; });
  const prev = AppState.route;
  AppState.route = { name, param, key };
  if (!bare) markNav(name, param);
  (def.show || Pages[key].show || (() => {}))(el, param, name);
  if (!prev || prev.key !== key) window.scrollTo(0, 0);
  document.title = (def.title ? def.title(param) + ' — ' : '') + 'E-RENGIAT';
  closeDrawer();
}
function markNav(name, param) {
  document.querySelectorAll('[data-nav]').forEach(a => {
    const n = a.dataset.nav;
    a.classList.toggle('on', n === name + (param && name === 'jenis' ? ':' + param : '') || (n === name && name !== 'jenis'));
  });
}
function closeDrawer() { document.body.classList.remove('drawer-open'); }

// ---------------------------------------------------------------------
// Toast & modal
// ---------------------------------------------------------------------
function toast(type, title, msg, opt = {}) {
  const host = document.getElementById('toasts');
  const icon = { success: 'circle-check', error: 'circle-alert', info: 'info', warn: 'triangle-alert' }[type] || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<div class="tico">${ic(icon)}</div><div class="tbody"><b>${esc(title)}</b>${msg ? `<p>${esc(msg)}</p>` : ''}${opt.action ? `<div class="tact"><button class="btn btn-soft btn-sm">${esc(opt.action.label)}</button></div>` : ''}</div><button class="btn-icon" aria-label="Tutup">${ic('x')}</button>`;
  const hapus = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('.btn-icon').onclick = hapus;
  if (opt.action) el.querySelector('.tact button').onclick = () => { hapus(); opt.action.fn(); };
  host.prepend(el);
  while (host.children.length > 4) host.lastChild.remove();
  setTimeout(hapus, opt.timeout || (type === 'error' ? 7000 : opt.action ? 8000 : 4000));
  return hapus;
}

function openModal({ html, size = '', onMount, onClose, dismiss = true }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
  const m = bg.firstElementChild, prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape' && dismiss && bg === [...document.querySelectorAll('.modal-bg')].pop()) close(); };
  function close() {
    if (!bg.isConnected) return;
    bg.remove(); document.removeEventListener('keydown', onKey);
    if (!document.querySelector('.modal-bg')) document.body.style.overflow = '';
    if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) {}
    if (onClose) onClose();
  }
  bg.addEventListener('mousedown', e => { if (e.target === bg && dismiss) close(); });
  m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  if (onMount) onMount(m, close);
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => { const f = m.querySelector('[autofocus]'); if (f) f.focus({ preventScroll: true }); }, 40);
  return close;
}
function modalHead(title, sub, extra = '') {
  return `<div class="modal-head"><div style="min-width:0">${extra}<h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="btn-icon" data-close aria-label="Tutup">${ic('x', 'ic-lg')}</button></div>`;
}
function konfirmasi({ judul, pesan, tombol = 'Ya, lanjutkan', bahaya = false, icon = 'circle-help' }) {
  return new Promise(res => {
    let hasil = false;
    openModal({
      size: 'sm',
      html: `<div class="modal-body" style="padding-top:28px"><div class="modal-ico ${bahaya ? 'red' : 'pri'}">${ic(icon)}</div><h3>${esc(judul)}</h3><p class="muted" style="margin:8px 0 0">${pesan}</p></div>
             <div class="modal-foot"><button class="btn btn-sec" data-close>Batal</button><button class="btn ${bahaya ? 'btn-danger' : 'btn-pri'}" data-ok>${esc(tombol)}</button></div>`,
      onMount(m, c) { m.querySelector('[data-ok]').onclick = () => { hasil = true; c(); }; },
      onClose() { res(hasil); }
    });
  });
}

/** Tombol dalam keadaan memuat. */
function busyBtn(btn, on, teks) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = ic('loader-circle', 'spin') + (teks ? ' ' + esc(teks) : ''); }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

// ---------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------
function ic(name, cls) {
  const b = (window.ICONS || {})[name];
  if (!b && window.console) console.warn('Ikon hilang:', name);
  return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b || ''}</svg>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
function debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }
function fmtRb(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function fmtRp(n) { return 'Rp ' + fmtRb(n); }
function fmtRpSingkat(n) {
  n = Number(n) || 0;
  if (n >= 1e12) return 'Rp ' + (n / 1e12).toFixed(1).replace('.', ',').replace(',0', '') + ' T';
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.', ',').replace(',0', '') + ' M';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' jt';
  return fmtRp(n);
}
function angkaDari(s) { return Number(String(s == null ? '' : s).replace(/[^\d]/g, '')) || 0; }
function pad2(n) { return ('0' + n).slice(-2); }
function hariIni() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jayapura', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function tglObj(s) { const p = String(s).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
function tglPendek(s) { if (!s) return ''; const t = tglObj(s); return t.d + ' ' + BLN3[t.m - 1] + ' ' + t.y; }
function tglPanjang(s) { if (!s) return ''; const t = tglObj(s); return t.d + ' ' + BULAN[t.m - 1] + ' ' + t.y; }
function namaHari(s) { const t = tglObj(s); return HARI[new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay()]; }
function jamLabel(r) { if (!r.jm) return ''; return r.jm.replace(':', '.') + (r.js ? '–' + r.js.replace(':', '.') : '') + ' WIT'; }
function tglRentang(r) { return r.tglS && r.tglS !== r.tgl ? tglPendek(r.tgl) + ' – ' + tglPendek(r.tglS) : tglPendek(r.tgl); }
function waktuLabel(r) { const j = jamLabel(r); return tglRentang(r) + (j ? ', ' + j : ''); }
function waktuRelatif(iso) {
  if (!iso) return '-';
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jayapura' }).format(d);
  return tglPendek(t) + ', ' + new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jayapura', hour: '2-digit', minute: '2-digit' }).format(d);
}
function isoWeek(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d)), day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { y: dt.getUTCFullYear(), w: Math.ceil(((dt - y0) / 864e5 + 1) / 7) };
}
/** Sama persis dengan hitungPeriode_ di server. */
function hitungPeriode(jenis, tgl) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl || '')) return { label: '', key: '' };
  const { y, m, d } = tglObj(tgl);
  if (jenis === 'Tahunan') return { label: String(y), key: String(y) };
  if (jenis === 'Bulanan') return { label: BULAN[m - 1] + ' ' + y, key: y + '-' + pad2(m) };
  if (jenis === 'Mingguan') { const w = isoWeek(y, m, d); return { label: 'Minggu ke-' + w.w + ' ' + w.y, key: w.y + '-W' + pad2(w.w) }; }
  return { label: d + ' ' + BLN3[m - 1] + ' ' + y, key: tgl };
}
function perSingkat(jenis, key) {
  if (!key || key === '*') return 'Semua';
  if (jenis === 'Tahunan') return key;
  if (jenis === 'Bulanan') { const [y, m] = key.split('-'); return BLN3[+m - 1] + ' ' + y; }
  if (jenis === 'Mingguan') return 'Mg-' + Number(key.split('-W')[1]) + ' ' + key.slice(0, 4);
  return tglPendek(key);
}
/** Rentang tanggal sebuah minggu ISO (untuk label filter). */
function rentangMinggu(key) {
  const [y, w] = key.split('-W').map(Number), jan4 = new Date(Date.UTC(y, 0, 4)), d = jan4.getUTCDay() || 7;
  const senin = new Date(jan4); senin.setUTCDate(jan4.getUTCDate() - d + 1 + (w - 1) * 7);
  const minggu = new Date(senin); minggu.setUTCDate(senin.getUTCDate() + 6);
  const f = x => x.getUTCDate() + ' ' + BLN3[x.getUTCMonth()];
  return f(senin) + ' – ' + f(minggu);
}
function inisial(nama) { return String(nama || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
/** Escape lalu tandai kata kunci pencarian dengan <mark>. */
function hl(teks, terms) {
  let out = esc(teks);
  if (!terms || !terms.length) return out;
  terms.forEach(t => { if (t.length < 2) return; const re = new RegExp('(' + esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'); out = out.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(re, '<mark>$1</mark>')); });
  return out;
}
/** Warna tag unit yang konsisten dari nama. */
function warnaUnit(nama) {
  const pal = [['#EEF2FF', '#4338CA'], ['#F3E8FF', '#7E22CE'], ['#DCFCE7', '#15803D'], ['#E0F2FE', '#0369A1'], ['#FFEDD5', '#C2410C'], ['#FCE7F3', '#BE185D'], ['#FEF9C3', '#A16207']];
  let h = 0; for (const c of String(nama)) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}
function unduhBase64(b64, nama, mime) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u8], { type: mime || 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function unduhTeks(teks, nama, mime) { unduhBase64(btoa(unescape(encodeURIComponent(teks))), nama, mime || 'text/plain'); }
async function salin(teks) {
  try { await navigator.clipboard.writeText(teks); toast('success', 'Disalin', teks.length > 80 ? teks.slice(0, 80) + '…' : teks); }
  catch (e) { prompt('Salin teks berikut:', teks); }
}
/** URL halaman verifikasi.html di samping index.html (untuk QR). */
function urlVerifikasi() { return location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '') + 'verifikasi.html'; }
/** Pengurai CSV sederhana (koma atau titik koma, tanda kutip ganda). */
function parseCsv(teks) {
  teks = String(teks).replace(/^﻿/, '');
  const baris1 = teks.split(/\r?\n/)[0] || '', delim = (baris1.match(/;/g) || []).length > (baris1.match(/,/g) || []).length ? ';' : ',';
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (q) { if (c === '"') { if (teks[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && teks[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  const rows = out.filter(r => r.some(x => String(x).trim() !== ''));
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map(h => h.trim());
  return { header, rows: rows.slice(1).map(r => { const o = {}; header.forEach((h, i) => { if (h) o[h] = (r[i] || '').trim(); }); return o; }) };
}
