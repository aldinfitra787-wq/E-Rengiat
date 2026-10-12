/* =====================================================================
 * E-RENGIAT — app.js
 * Kerangka (header, navigasi, drawer HP), halaman Masuk / Akses Ditolak /
 * Setup, dan inisialisasi: tampil seketika dari cache perangkat, lalu
 * segarkan di latar (stale-while-revalidate), warm-up server, prefetch saat idle.
 * ===================================================================== */
'use strict';

const NAV = [
  ['ringkasan', '#/ringkasan', 'Ringkasan', 'layout-dashboard'],
  ['jenis:Tahunan', '#/jenis/Tahunan', 'Rencana Tahunan', null, 'Tahunan'],
  ['jenis:Bulanan', '#/jenis/Bulanan', 'Rencana Bulanan', null, 'Bulanan'],
  ['jenis:Mingguan', '#/jenis/Mingguan', 'Rencana Mingguan', null, 'Mingguan'],
  ['jenis:Harian', '#/jenis/Harian', 'Agenda Harian', null, 'Harian'],
  ['matriks', '#/matriks', 'Matriks & Verifikasi', 'shield-check']
];
const NAV2 = [['dokumen', '#/dokumen', 'Template Dokumen', 'file-text'], ['sistem', '#/sistem', 'Sistem', 'settings']];

function renderShell() {
  const S = AppState.settings, u = AppState.user || {}, nama = u.nama || (u.email || '').split('@')[0] || 'Admin';
  $('#top').innerHTML = `
    <header class="topbar"><div class="topbar-in">
      <button class="btn-icon menu-btn" data-menu aria-label="Buka menu">${ic('menu', 'ic-lg')}</button>
      <a class="brand" href="#/ringkasan"><span class="logo">${ic('calendar-check')}</span><span class="brand-t"><b>E-RENGIAT <span class="pill pill-pri">INSTANSI</span></b><small>${esc(S.INSTITUSI_NAMA || 'Nama Instansi')}</small></span></a>
      <nav class="nav" aria-label="Menu utama">${NAV.map(n => `<a href="${n[1]}" data-nav="${n[0]}" ${n[4] ? `class="j-${n[4]}"` : ''}>${n[2]}</a>`).join('')}</nav>
      <div class="row" style="gap:2px">${NAV2.map(n => `<a class="btn-icon nav-ic" href="${n[1]}" data-nav="${n[0]}" title="${n[2]}" aria-label="${n[2]}">${ic(n[3])}</a>`).join('')}</div>
      <div class="user-chip"><span class="avatar online" title="${esc(u.email || '')}">${esc(inisial(nama))}</span><span class="user-t"><b>${esc(nama)}</b><small>${esc(u.email || '')}</small></span></div>
      <button class="btn btn-ghost btn-sm hide-sm" data-logout title="Keluar">${ic('log-out', 'ic-sm')}<span class="lbl-out"> Keluar</span></button>
    </div></header>
    <div class="drawer-bg" data-close-drawer></div>
    <aside class="drawer" aria-label="Menu">
      <div class="drawer-head"><div class="row"><span class="avatar online">${esc(inisial(nama))}</span><div class="user-t" style="display:flex"><b>${esc(nama)}</b><small>${esc(u.email || '')}</small></div></div></div>
      <nav>${NAV.concat(NAV2).map(n => `<a href="${n[1]}" data-nav="${n[0]}" ${n[4] ? `class="j-${n[4]}"` : ''}>${n[3] ? ic(n[3]) : '<i class="dot"></i>'} ${n[2]}</a>`).join('')}</nav>
      <div class="drawer-foot"><button class="btn btn-sec btn-block" data-logout>${ic('log-out')} Keluar</button></div>
    </aside>`;
  $('[data-menu]').onclick = () => document.body.classList.add('drawer-open');
  $('[data-close-drawer]').onclick = closeDrawer;
  $$('[data-logout]').forEach(b => b.onclick = () => keluar());
  if (AppState.route) markNav(AppState.route.name, AppState.route.param);
}

function keluar(paksa) {
  const go2 = () => {
    Store.clearUser();                                     // perangkat bersama: data tidak tertinggal
    AppState.token = ''; Store.del('token'); Store.del('user');
    AppState.rows = []; AppState.ver = ''; AppState.dokumen = AppState.users = AppState.logs = null; AppState.loaded = false;
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
    $$('#view .page').forEach(p => p.remove());
    go('#/masuk');
  };
  if (paksa) return go2();
  if (AppState.pending > 0) { konfirmasi({ judul: 'Masih menyimpan data', pesan: 'Ada perubahan yang belum selesai tersimpan. Tetap keluar?', tombol: 'Keluar', bahaya: true, icon: 'log-out' }).then(ok => ok && go2()); return; }
  go2();
}

/** Setelah login berhasil (email/sandi atau Google). */
function setelahMasuk(d) {
  AppState.token = d.token; Store.set('token', d.token);
  AppState.user = d.user; Store.set('user', d.user);
  applyBoot(Object.assign({ user: d.user }, d.boot));
  AppState.loaded = true;
  renderShell();
  go('#/ringkasan');
  toast('success', 'Berhasil masuk', 'Selamat datang, ' + (d.user.nama || d.user.email) + '.');
  prefetchIdle();
}

// ---------------------------------------------------------------------
// Masuk
// ---------------------------------------------------------------------
registerPage('masuk', {
  bare: true,
  title: () => 'Masuk',
  init(el) {
    const pub = Store.get('pub', {});
    el.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="logo">${ic('calendar-check')}</div>
      <div class="auth-title"><h1>E-RENGIAT <span class="pill pill-pri" style="height:28px;font-size:13px">Khusus Admin</span></h1><p>Sistem Penyusun Rencana Kegiatan &amp; Anggaran Institusi</p></div>
      <div class="auth-sec"><h3>Masuk ke Sistem</h3><p>Silakan masukkan akun administrator Anda untuk mengelola agenda.</p>
        <form class="form-stack" data-f novalidate style="gap:16px">
          <div class="field"><label for="l-email">Email Administrator</label><div class="ig">${ic('mail')}<input class="input" id="l-email" name="email" type="email" autocomplete="username" placeholder="admin@instansi.go.id" required></div></div>
          <div class="field"><div class="row" style="justify-content:space-between"><label for="l-pass" class="lbl">Kata Sandi</label><button type="button" class="link-btn small" data-lupa>Lupa kata sandi?</button></div>
            <div class="ig">${ic('lock')}<input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required><button type="button" class="btn-icon" data-eye aria-label="Tampilkan kata sandi">${ic('eye')}</button></div></div>
          <div data-err></div>
          <button class="btn btn-pri btn-lg btn-block" data-submit>Masuk ke Dashboard ${ic('arrow-right')}</button>
        </form>
        <div class="or">atau lanjutkan dengan</div>
        <div data-google></div>
        <div class="callout" style="margin-top:20px">${ic('shield-check')}<div class="small">Akses terbatas hanya untuk email Administrator yang terdaftar pada sistem institusi.</div></div>
      </div></div>
      <div class="auth-foot">© ${hariIni().slice(0, 4)} E-RENGIAT • <span data-inst>${esc(pub.instansi || 'NAMA INSTANSI')}</span> • Zona Waktu WIT (UTC+09:00)</div></div>`;
    const f = $('[data-f]', el);
    const last = Store.get('lastEmail', ''); if (last) f.email.value = last;
    $('[data-eye]', el).onclick = () => { const p = f.password; p.type = p.type === 'password' ? 'text' : 'password'; $('[data-eye]', el).innerHTML = ic(p.type === 'password' ? 'eye' : 'eye-off'); };
    $('[data-lupa]', el).onclick = () => openModal({ size: 'sm', html: `${modalHead('Lupa kata sandi?', '')}<div class="modal-body"><p style="margin-top:0">Demi keamanan, kata sandi tidak dikirim lewat email (PRD v1.0). Pilih salah satu:</p><ol class="small" style="line-height:1.9;padding-left:20px"><li>Minta administrator lain mengatur ulang sandi Anda di <b>Sistem → Pengguna</b>.</li><li>Pemilik aplikasi: buka editor Apps Script, jalankan fungsi <span class="mono">resetSandiPemilik</span>, lalu lihat sandi baru di <i>Execution log</i>.</li><li>Bila akun Anda akun Google yang terdaftar, gunakan tombol <b>Masuk dengan Google</b>.</li></ol></div><div class="modal-foot"><button class="btn btn-pri" data-close>Mengerti</button></div>` });
    f.onsubmit = async e => {
      e.preventDefault();
      const email = f.email.value.trim(), password = f.password.value, err = $('[data-err]', el);
      err.innerHTML = '';
      if (!email || !password) { err.innerHTML = `<div class="err-msg">${ic('circle-alert', 'ic-sm')} Email dan kata sandi wajib diisi.</div>`; return; }
      const btn = $('[data-submit]', el); busyBtn(btn, true, 'Memeriksa akun…');
      const r = await api('login', { email, password });
      busyBtn(btn, false);
      if (r.success) { Store.set('lastEmail', email); f.password.value = ''; setelahMasuk(r.data); }
      else { err.innerHTML = `<div class="callout err">${ic('circle-alert')}<div>${esc(r.message)}</div></div>`; f.password.select(); }
    };
    // Info publik (nama instansi, Client ID Google) — disimpan agar halaman berikutnya instan
    api('publicInfo', {}, { tries: 2 }).then(r => {
      if (!r.success) return;
      Store.set('pub', r.data);
      $('[data-inst]', el).textContent = r.data.instansi;
      pasangGoogle(el, r.data.googleClientId);
    });
    pasangGoogle(el, pub.googleClientId);
  },
  show(el) { setTimeout(() => { const f = $('[data-f]', el); if (matchMedia('(pointer: fine)').matches) (f.email.value ? f.password : f.email).focus(); }, 50); }
});

function pasangGoogle(el, cidServer) {
  const cid = CFG.GOOGLE_CLIENT_ID || cidServer, host = $('[data-google]', el);
  if (host.dataset.cid === String(cid || '')) return;
  host.dataset.cid = cid || '';
  if (!cid) {
    host.innerHTML = `<button type="button" class="gbtn">${GOOGLE_G} Masuk dengan Google Workspace</button>`;
    $('.gbtn', host).onclick = () => toast('info', 'Login Google belum aktif', 'Admin dapat mengisi GOOGLE_CLIENT_ID di Sistem → Pengaturan. Sementara ini gunakan email & kata sandi.');
    return;
  }
  host.innerHTML = `<div class="gsi-host" data-gsi><button type="button" class="gbtn" disabled>${ic('loader-circle', 'spin')} Memuat Google…</button></div>`;
  const mulai = () => {
    google.accounts.id.initialize({ client_id: cid, callback: onGoogle, auto_select: false, cancel_on_tap_outside: true, ux_mode: 'popup' });
    const gsi = $('[data-gsi]', host); gsi.innerHTML = '';
    google.accounts.id.renderButton(gsi, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', logo_alignment: 'center', width: Math.min(400, host.clientWidth || 360) });
  };
  if (window.google && google.accounts && google.accounts.id) return mulai();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = mulai;
  s.onerror = () => { host.innerHTML = `<div class="callout warn">${ic('triangle-alert')}<div class="small">Layanan Google tidak dapat dimuat. Periksa koneksi, atau gunakan email &amp; kata sandi.</div></div>`; };
  document.head.appendChild(s);
}
async function onGoogle(resp) {
  const t = toast('info', 'Memeriksa akun Google…', '', { timeout: 20000 });
  const r = await api('loginGoogle', { credential: resp.credential });
  t();
  if (r.success) return setelahMasuk(r.data);
  if (r.data && r.data.code === 'NOT_REGISTERED') { AppState.ditolak = { email: r.data.email }; go('#/ditolak'); return; }
  toast('error', 'Gagal masuk dengan Google', r.message);
}
const GOOGLE_G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

// ---------------------------------------------------------------------
// Akses Ditolak
// ---------------------------------------------------------------------
registerPage('ditolak', {
  bare: true,
  title: () => 'Akses Ditolak',
  init(el) {
    el.innerHTML = `<div class="auth-wrap"><div class="auth-card" style="max-width:560px;text-align:center">
      <div class="denied-ico">${ic('shield-x')}</div>
      <h1 style="margin-top:34px;font-size:32px">Akses Ditolak</h1>
      <p class="muted" style="font-size:16px;margin:10px auto 0;max-width:420px">Akun Google Anda tidak terdaftar sebagai Administrator pada database <b style="color:var(--ink)">E-RENGIAT</b>.</p>
      <div class="email-chip"><span class="avatar">${ic('user', 'ic-sm')}</span><span data-email></span><span class="pill">BELUM TEROTORISASI</span></div>
      <div class="callout" style="text-align:left;margin-top:24px">${ic('info')}<div>Hanya email staf berwenang yang tercatat di sheet <b><u>Pengguna</u></b> yang dapat mengakses aplikasi. Silakan hubungi <b>Administrator Utama</b> atau Pengelola Kepegawaian jika Anda memerlukan hak akses.</div></div>
      <div class="form-stack" style="margin-top:24px;gap:12px">
        <button class="btn btn-pri btn-lg btn-block" data-ganti>${ic('repeat')} Ganti Akun Google</button>
        <button class="btn btn-sec btn-lg btn-block" data-ulang>${ic('refresh-cw')} Coba Lagi (Muat Ulang)</button>
        <a class="link-btn" href="#/masuk" style="justify-content:center;margin-top:6px">${ic('arrow-left', 'ic-sm')} Kembali ke Halaman Masuk</a></div>
    </div><div class="auth-foot">E-RENGIAT v${APP_VERSI} • Sistem Keamanan Google Apps Script</div></div>`;
    $('[data-ganti]', el).onclick = () => { try { google.accounts.id.disableAutoSelect(); } catch (e) {} go('#/masuk'); setTimeout(() => { try { google.accounts.id.prompt(); } catch (e) {} }, 400); };
    $('[data-ulang]', el).onclick = () => { go('#/masuk'); setTimeout(() => { try { google.accounts.id.prompt(); } catch (e) { toast('info', 'Silakan masuk kembali'); } }, 400); };
  },
  show(el) { $('[data-email]', el).textContent = (AppState.ditolak && AppState.ditolak.email) || 'akun Google Anda'; }
});

// ---------------------------------------------------------------------
// Setup (GAS_URL belum diisi)
// ---------------------------------------------------------------------
registerPage('setup', {
  bare: true,
  title: () => 'Konfigurasi',
  init(el) {
    el.innerHTML = `<div class="auth-wrap"><div class="auth-card" style="max-width:620px">
      <div class="logo">${ic('settings-2')}</div>
      <div class="auth-title"><h1>Satu langkah lagi</h1><p>Frontend sudah online, tetapi belum terhubung ke backend Google Apps Script.</p></div>
      <ol style="line-height:1.9;margin:26px 0 0;padding-left:20px">
        <li>Di editor Apps Script: <b>Deploy → New deployment → Web app</b> (Execute as: <i>Me</i>, Who has access: <i>Anyone</i>).</li>
        <li>Salin URL yang berakhiran <span class="mono">/exec</span>.</li>
        <li>Buka berkas <span class="mono">js/config.js</span>, isi <span class="mono">GAS_URL: '…/exec'</span>, lalu simpan.</li>
        <li>Push ulang ke GitHub: <span class="mono">git add . &amp;&amp; git commit -m "isi GAS_URL" &amp;&amp; git push</span></li>
        <li>Tunggu 1–2 menit, lalu muat ulang halaman ini (Ctrl+Shift+R).</li></ol>
      <div class="callout warn" style="margin-top:20px">${ic('triangle-alert')}<div class="small">Panduan lengkap ada di berkas <b>PANDUAN-INSTALASI.md</b>.</div></div>
    </div></div>`;
  }
});

// ---------------------------------------------------------------------
// Inisialisasi
// ---------------------------------------------------------------------
function prefetchIdle() {
  const run = () => {
    if (!AppState.token) return;
    api('batch', { calls: [{ action: 'dokumenList' }, { action: 'users' }, { action: 'logs' }] }).then(res => {
      if (!res.success) return;
      [['dokumenList', 'dokumen'], ['users', 'users'], ['logs', 'logs']].forEach(([a, k]) => { const r = res.data[a]; if (r && r.success) cacheSet(k, r.data); });
    });
  };
  setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(run, { timeout: 4000 }) : run()), 2500);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (AppState.token && AppState.user) AppState.loaded = loadCache();
  if (AppState.token) renderShell();
  window.addEventListener('hashchange', route);
  route();
  const boot = $('#boot'); if (boot) boot.remove();
  warmUpServer();

  if (AppState.token) {
    if (!AppState.loaded) {
      const r = await syncBoot(true);
      AppState.loaded = true;
      if (r && r.success) { renderShell(); Bus.emit('rows'); }
      else if (r && !(r.data && r.data.code === 'AUTH')) toast('error', 'Gagal memuat data', r.message, { action: { label: 'Coba lagi', fn: () => location.reload() } });
    } else { syncBoot(); }
    prefetchIdle();
  }

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (!AppState.token) return;
    if (Date.now() - hiddenAt > 120000) warmUpServer();
    syncRows();
  });
  addEventListener('online', () => { setSync('ok'); if (AppState.token) syncRows(true); });
  addEventListener('offline', () => setSync('off'));
  addEventListener('beforeunload', e => { if (AppState.pending > 0) { e.preventDefault(); e.returnValue = ''; } });
});
