/* =====================================================================
 * E-RENGIAT — daftar.js
 * Halaman Daftar Rengiat (Ringkasan + 4 jenis), form tambah/ubah (optimistic),
 * konfirmasi hapus, dialog cetak (DocEngine), dan pratinjau lembar A4 lanskap.
 * Semua cari/filter/urut/halaman dikerjakan lokal → instan tanpa server.
 * ===================================================================== */
'use strict';

// ---------------------------------------------------------------------
// Logika tampilan
// ---------------------------------------------------------------------
function perOpsi(jenis) {
  const peta = {};
  AppState.rows.forEach(r => { if (r.jenis === jenis && r.pk) peta[r.pk] = peta[r.pk] || { label: r.periode, n: 0 }; if (r.jenis === jenis && r.pk) peta[r.pk].n++; });
  const kini = hitungPeriode(jenis, hariIni());
  if (!peta[kini.key]) peta[kini.key] = { label: kini.label, n: 0 };
  return Object.keys(peta).sort().reverse().map(k => ({ key: k, label: peta[k].label + (jenis === 'Mingguan' ? ' (' + rentangMinggu(k) + ')' : ''), n: peta[k].n, kini: k === kini.key }));
}
/** Periode aktif untuk jenis: pilihan pengguna → periode berjalan bila ada datanya → periode terbaru yang berisi. */
function perAktif(jenis) {
  const pilih = AppState.ui.per[jenis];
  if (pilih) return pilih;
  const kini = hitungPeriode(jenis, hariIni()).key;
  const ada = AppState.rows.some(r => r.jenis === jenis && r.pk === kini);
  if (ada) return kini;
  const semua = AppState.rows.filter(r => r.jenis === jenis).map(r => r.pk).sort();
  const depan = semua.filter(k => k >= kini);
  return depan[0] || semua[semua.length - 1] || kini;
}
function labelPer(jenis, key) {
  if (key === '*') return 'Semua periode';
  const r = AppState.rows.find(x => x.jenis === jenis && x.pk === key);
  if (r) return r.periode;
  if (jenis === 'Bulanan') { const [y, m] = key.split('-'); return BULAN[+m - 1] + ' ' + y; }
  if (jenis === 'Mingguan') return 'Minggu ke-' + Number(key.split('-W')[1]) + ' ' + key.slice(0, 4);
  if (jenis === 'Harian') return tglPendek(key);
  return key;
}
function teksCari(r) {
  let s = _cariCache.get(r);
  if (!s) { s = norm([r.kegiatan, r.lokasi, r.sasaran, r.personil, r.sarpras, r.ket, r.unit, r.status, r.id, tglRentang(r), r.periode].join(' ')); _cariCache.set(r, s); }
  return s;
}
const URUT = {
  waktu: (a, b) => (a.tgl + (a.jm || '')).localeCompare(b.tgl + (b.jm || '')),
  kegiatan: (a, b) => a.kegiatan.localeCompare(b.kegiatan, 'id'),
  anggaran: (a, b) => a.anggaran - b.anggaran,
  status: (a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status),
  diubah: (a, b) => String(a.diubah).localeCompare(String(b.diubah))
};
function saringRows(jenis, per, opt = {}) {
  const u = AppState.ui;
  let rows = AppState.rows.filter(r => r.jenis === jenis && (per === '*' || r.pk === per));
  if (opt.filter !== false) {
    if (u.status.length) rows = rows.filter(r => u.status.includes(r.status));
    if (u.unit) rows = rows.filter(r => r.unit === u.unit);
    const terms = norm(u.q).split(/\s+/).filter(Boolean);
    if (terms.length) rows = rows.filter(r => { const s = teksCari(r); return terms.every(t => s.includes(t)); });
  }
  const f = URUT[u.sort] || URUT.waktu;
  return rows.sort((a, b) => f(a, b) * (u.dir || 1) || URUT.waktu(a, b));
}
function jumlahFilter() { const u = AppState.ui; return u.status.length + (u.unit ? 1 : 0); }

// ---------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------
registerPage('ringkasan', {
  title: () => 'Daftar Rengiat',
  init: initDaftar,
  show() { renderDaftar(); syncRows(); }
});
registerPage('jenis', {
  page: 'ringkasan',
  title: p => (JENIS_META[p] || {}).nav || 'Daftar Rengiat',
  show(el, p) { if (JENIS.includes(p) && AppState.ui.jenis !== p) { AppState.ui.jenis = p; AppState.ui.page = 1; saveUi(); } renderDaftar(); syncRows(); }
});

function initDaftar(el) {
  el.innerHTML = `
  <div class="page-head">
    <div><h1>Daftar Rengiat</h1>
      <div class="sub"><span>Kelola agenda, sasaran, dan alokasi anggaran kegiatan instansi</span><i class="sep-dot"></i><b data-per-label></b></div></div>
    <div class="row head-side">
      <button class="sync-pill" data-sync title="Sinkronkan sekarang"><i class="d"></i><span>Google Sheets Terhubung</span>${ic('cloud', 'ic-sm')}</button>
      <div class="stat-box"><div class="ico">${ic('wallet')}</div><div><small data-pagu-lbl>Total Pagu</small><b class="num" data-pagu>Rp 0</b></div></div>
    </div>
  </div>
  <div class="jgrid" data-jgrid></div>
  <div class="card toolbar">
    <div class="tb-row">
      <label class="ig tb-search">${ic('search')}<input class="input" type="search" placeholder="Cari kegiatan, lokasi, sasaran, personil..." data-q aria-label="Cari rengiat" autocomplete="off"></label>
      <div class="tb-per">${ic('calendar')}<select class="select" data-per aria-label="Pilih periode"></select></div>
      <div class="pop-wrap"><button class="btn btn-sec tb-btn" data-filter>${ic('sliders-horizontal')} Filter <span class="count hide" data-fcount></span></button></div>
      <div class="pop-wrap"><button class="btn btn-sec tb-btn" data-sortbtn>${ic('arrow-up-down')} Urutkan</button></div>
      <span class="spacer"></span><i class="vdiv"></i>
      <button class="btn btn-sec tb-btn tb-print" data-print>${ic('printer')} Cetak PDF</button>
      <button class="btn btn-pri btn-lg tb-add" data-add>${ic('plus')} Tambah Rengiat</button>
    </div>
    <div class="tb-focus" data-focus></div>
  </div>
  <div class="card tcard"><div class="tscroll"><table class="tbl"><thead data-thead></thead><tbody data-tbody></tbody></table></div><div class="tfoot" data-tfoot></div></div>
  <div class="mlist" data-mlist></div>
  <button class="fab" data-add aria-label="Tambah rengiat">${ic('plus')}</button>
  <div class="mbar"><div><small>Total anggaran terplot</small><b class="num" data-mtotal>Rp 0</b></div><button class="btn btn-soft" data-print>${ic('file-text')} Cetak PDF</button></div>`;

  const q = $('[data-q]', el);
  q.addEventListener('input', debounce(() => { AppState.ui.q = q.value; AppState.ui.page = 1; renderDaftar(); }, 220));
  $('[data-per]', el).addEventListener('change', e => { AppState.ui.per[AppState.ui.jenis] = e.target.value; AppState.ui.page = 1; saveUi(); renderDaftar(); });
  $('[data-filter]', el).addEventListener('click', e => popFilter(e.currentTarget));
  $('[data-sortbtn]', el).addEventListener('click', e => popUrut(e.currentTarget));
  $('[data-sync]', el).addEventListener('click', async () => { const r = await syncRows(true); if (r && r.success) toast('success', 'Tersinkron', r.data.same ? 'Data sudah terbaru.' : 'Data terbaru dimuat dari Google Sheets.'); else if (r) toast('error', 'Gagal sinkron', r.message); });
  $$('[data-add]', el).forEach(b => b.addEventListener('click', () => openForm(null)));
  $$('[data-print]', el).forEach(b => b.addEventListener('click', () => openCetak({ dariFilter: true })));

  $('[data-jgrid]', el).addEventListener('click', e => {
    const b = e.target.closest('[data-j]'); if (!b) return;
    if (AppState.route && AppState.route.name === 'jenis') go('#/jenis/' + b.dataset.j);
    else { AppState.ui.jenis = b.dataset.j; AppState.ui.page = 1; saveUi(); renderDaftar(); }
  });
  const aksi = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('[data-id]').dataset.id, r = AppState.rows.find(x => x.id === id);
    if (!r) return;
    if (r._pending) return toast('info', 'Masih menyimpan', 'Tunggu sebentar hingga data selesai tersimpan.');
    if (b.dataset.act === 'edit') openForm(r);
    if (b.dataset.act === 'del') openHapus(r);
    if (b.dataset.act === 'print') openCetak({ ids: [r.id] });
  };
  $('[data-tbody]', el).addEventListener('click', aksi);
  $('[data-mlist]', el).addEventListener('click', aksi);
  $('[data-thead]', el).addEventListener('click', e => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    const k = th.dataset.sort, u = AppState.ui;
    if (u.sort === k) u.dir = -u.dir; else { u.sort = k; u.dir = k === 'anggaran' ? -1 : 1; }
    saveUi(); renderDaftar();
  });
  const pager = e => { const b = e.target.closest('[data-page]'); if (!b || b.disabled) return; AppState.ui.page = +b.dataset.page; renderDaftar(); (window.innerWidth < 900 ? $('[data-mlist]', el) : $('.tcard', el)).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  el.addEventListener('click', e => { if (e.target.closest('.pager')) pager(e); });
  el.addEventListener('change', e => { if (e.target.matches('[data-size]')) { AppState.ui.size = +e.target.value; AppState.ui.page = 1; saveUi(); renderDaftar(); } });
  $('[data-focus]', el).addEventListener('click', e => {
    const b = e.target.closest('[data-clear]'); if (!b) return;
    const k = b.dataset.clear, u = AppState.ui;
    if (k === 'q') { u.q = ''; q.value = ''; } else if (k === 'unit') u.unit = ''; else if (k === 'all') { u.q = ''; q.value = ''; u.unit = ''; u.status = []; } else u.status = u.status.filter(s => s !== k);
    u.page = 1; renderDaftar();
  });

  Bus.on('rows', () => { if (!el.hidden) renderDaftar(); });
  Bus.on('boot', () => { if (!el.hidden) renderDaftar(); });
  document.addEventListener('keydown', e => {
    if (el.hidden || document.querySelector('.modal-bg') || /input|textarea|select/i.test(document.activeElement.tagName)) return;
    if (e.key === '/') { e.preventDefault(); q.focus(); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openForm(null); }
  });
}

let _htmlCache = {};
function setHtml(el, html) { const k = el.dataset.k || (el.dataset.k = Math.random().toString(36).slice(2)); if (_htmlCache[k] !== html) { el.innerHTML = html; _htmlCache[k] = html; } }

function renderDaftar() {
  const el = $('.page-ringkasan'); if (!el) return;
  const u = AppState.ui, jenis = u.jenis, per = perAktif(jenis);
  el.className = 'page page-ringkasan j-' + jenis;

  // Kartu jenis
  setHtml($('[data-jgrid]', el), JENIS.map(j => {
    const m = JENIS_META[j], n = AppState.rows.filter(r => r.jenis === j).length, on = j === jenis;
    return `<button class="jcard j-${j} ${on ? 'on' : ''}" data-j="${j}" aria-pressed="${on}">
      <div class="jtop"><span class="jico">${ic(m.icon)}</span><span class="pill jcnt">${on ? ic('circle-check', 'ic-sm') + '<span class="t-d">DIPILIH</span><span class="t-m">' + n + ' Giat</span>' : n + ' <span class="t-d">Kegiatan</span><span class="t-m">Giat</span>'}</span></div>
      <div class="row" style="justify-content:space-between"><h4>${j}</h4>${on ? `<span class="jcnt-big t-d">${n} Kegiatan</span>` : ''}</div>
      <div class="jdesc"><span class="t-d">${esc(m.desc)}</span><span class="t-m">${on ? 'Sedang Aktif' : esc(m.pendek)}</span></div>
      <div class="jfoot">${on ? `<span class="live">Sedang Ditampilkan</span><span class="per">${esc(perSingkat(j, per))}</span>` : `<span>Buka Jadwal</span>${ic('arrow-right', 'ic-sm')}`}</div>
    </button>`;
  }).join(''));

  // Periode
  const opsi = perOpsi(jenis);
  setHtml($('[data-per]', el), `<option value="*" ${per === '*' ? 'selected' : ''}>Semua periode</option>` + opsi.map(o => `<option value="${esc(o.key)}" ${o.key === per ? 'selected' : ''}>${esc(o.label)}${o.kini ? ' (Aktif)' : ''}${o.n ? ' • ' + o.n : ''}</option>`).join(''));
  $('[data-per]', el).value = per;
  $('[data-per-label]', el).textContent = 'Periode: ' + labelPer(jenis, per);
  const q = $('[data-q]', el); if (q.value !== u.q && document.activeElement !== q) q.value = u.q;

  // Pagu tahun berjalan
  const th = hariIni().slice(0, 4);
  $('[data-pagu-lbl]', el).textContent = 'Total Pagu ' + th;
  $('[data-pagu]', el).textContent = fmtRp(AppState.rows.filter(r => r.tgl.slice(0, 4) === th).reduce((a, r) => a + r.anggaran, 0));

  // Filter aktif
  const fc = jumlahFilter(), fcEl = $('[data-fcount]', el);
  fcEl.textContent = fc; fcEl.classList.toggle('hide', !fc);
  const semua = saringRows(jenis, per), total = semua.reduce((a, r) => a + r.anggaran, 0);
  const chips = [];
  if (u.q) chips.push(`<button class="chip-x" data-clear="q">“${esc(u.q)}” ${ic('x', 'ic-sm')}</button>`);
  u.status.forEach(s => chips.push(`<button class="chip-x" data-clear="${esc(s)}">${esc(s)} ${ic('x', 'ic-sm')}</button>`));
  if (u.unit) chips.push(`<button class="chip-x" data-clear="unit">${esc(u.unit)} ${ic('x', 'ic-sm')}</button>`);
  if (chips.length > 1) chips.push(`<button class="link-btn xs" data-clear="all">Hapus semua filter</button>`);
  setHtml($('[data-focus]', el), `<i class="d"></i> Fokus: <b>${esc(JENIS_META[jenis].nav)}</b> <span class="sep-dot"></span> ${semua.length} kegiatan ${chips.length ? '<span class="sep-dot"></span>' + chips.join('') : ''}`);

  // Halaman
  const size = u.size || 10, pages = Math.max(1, Math.ceil(semua.length / size));
  if (u.page > pages) u.page = pages;
  const awal = (u.page - 1) * size, rows = semua.slice(awal, awal + size);
  const terms = norm(u.q).split(/\s+/).filter(Boolean);

  const arah = k => u.sort === k ? ic(u.dir > 0 ? 'arrow-up' : 'arrow-down') : '';
  setHtml($('[data-thead]', el), `<tr><th>No</th><th class="sortable" data-sort="waktu">Waktu Kegiatan ${arah('waktu')}</th><th>Lokasi</th><th class="sortable" data-sort="kegiatan">Kegiatan ${arah('kegiatan')}</th><th>Sasaran</th><th>Personil</th><th>Sarpras</th><th class="sortable" data-sort="anggaran" style="text-align:right">Anggaran ${arah('anggaran')}</th><th>Keterangan</th><th style="text-align:right">Aksi</th></tr>`);

  const kosong = semua.length ? '' : kosongHtml(jenis, per);
  setHtml($('[data-tbody]', el), kosong ? `<tr><td colspan="10" style="box-shadow:none">${kosong}</td></tr>` : rows.map((r, i) => rowHtml(r, awal + i + 1, terms)).join(''));
  setHtml($('[data-mlist]', el), kosong ? `<div class="card">${kosong}</div>` : rows.map(r => mcardHtml(r, terms)).join('') + (pages > 1 ? `<div class="card" style="padding:12px;display:flex;justify-content:center">${pagerHtml(u.page, pages)}</div>` : ''));
  setHtml($('[data-tfoot]', el), semua.length ? `
    <div class="row small muted">Menampilkan <b style="color:var(--ink)">${awal + 1}–${awal + rows.length}</b> dari <b style="color:var(--ink)">${semua.length}</b> kegiatan
      <select class="select" data-size style="width:auto;height:34px;font-size:13px;margin-left:6px" aria-label="Baris per halaman">${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === size ? 'selected' : ''}>${n} / hal</option>`).join('')}</select></div>
    ${pagerHtml(u.page, pages)}
    <div class="total-pill">${ic('receipt-text')} Total Anggaran Periode Ini: <b class="num">${fmtRp(total)}</b></div>` : '');
  $('[data-mtotal]', el).textContent = fmtRp(total);
}

function pagerHtml(p, n) {
  if (n <= 1) return '<span></span>';
  const set = new Set([1, n, p - 1, p, p + 1].filter(x => x >= 1 && x <= n));
  const arr = [...set].sort((a, b) => a - b);
  let out = `<div class="pager"><button data-page="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Sebelumnya">${ic('chevron-left', 'ic-sm')} Prev</button>`;
  arr.forEach((x, i) => { if (i && x - arr[i - 1] > 1) out += '<button disabled>…</button>'; out += `<button data-page="${x}" class="${x === p ? 'on' : ''}">${x}</button>`; });
  return out + `<button data-page="${p + 1}" ${p >= n ? 'disabled' : ''} aria-label="Berikutnya">Next ${ic('chevron-right', 'ic-sm')}</button></div>`;
}

function kosongHtml(jenis, per) {
  const u = AppState.ui;
  if (!AppState.loaded && !AppState.rows.length) return `<div style="padding:16px">${'<div class="sk" style="height:56px;margin:10px 0"></div>'.repeat(4)}</div>`;
  if (u.q || jumlahFilter()) return `<div class="empty"><div class="eico">${ic('search-x')}</div><h3>Tidak ada hasil</h3><p>Tidak ada rengiat ${esc(jenis.toLowerCase())} yang cocok dengan pencarian/filter Anda.</p><button class="btn btn-sec" onclick="AppState.ui.q='';AppState.ui.status=[];AppState.ui.unit='';renderDaftar()">${ic('rotate-ccw')} Reset pencarian & filter</button></div>`;
  return `<div class="empty"><div class="eico">${ic(JENIS_META[jenis].icon)}</div><h3>Belum ada rengiat ${esc(jenis.toLowerCase())}</h3><p>Belum ada kegiatan untuk ${esc(labelPer(jenis, per))}. Tambahkan rencana kegiatan pertama untuk periode ini.</p><button class="btn btn-pri" onclick="openForm(null)">${ic('plus')} Tambah Rengiat</button></div>`;
}

function personilHtml(p) {
  if (!p) return '<span class="muted">—</span>';
  const m = String(p).match(/^([^(]+?)\s*\((.*)\)\s*$/);
  return m ? `<b>${esc(m[1])}</b><div class="t-sub">${esc(m[2])}</div>` : `<div class="clamp3">${esc(p)}</div>`;
}
function unitTag(unit) { if (!unit) return ''; const [b, c] = warnaUnit(unit); return `<span class="tag" style="--tg-b:${b};--tg-c:${c}"><span>${esc(unit)}</span></span>`; }

function rowHtml(r, no, terms) {
  return `<tr class="j-${r.jenis}${r._pending ? ' pending' : ''}${r._flash ? ' flash' : ''}" data-id="${esc(r.id)}">
    <td class="t-no num">${pad2(no)}</td>
    <td class="t-date"><b>${esc(tglRentang(r))}</b>${r.jm ? `<span class="t-time">${ic('clock')}${esc(jamLabel(r))}</span>` : ''}</td>
    <td><div class="t-loc">${ic('map-pin')}<span>${hl(r.lokasi, terms)}</span></div></td>
    <td class="t-keg"><b title="${esc(r.kegiatan)}">${hl(r.kegiatan, terms)}</b><div class="meta">${unitTag(r.unit)}<span class="badge s-${esc(r.status)}">${esc(r.status)}</span>${r._pending ? `<span class="pill pill-mute">${ic('loader-circle', 'spin ic-sm')} Menyimpan</span>` : ''}</div></td>
    <td><div class="clamp3">${hl(r.sasaran, terms)}</div></td>
    <td>${personilHtml(r.personil)}</td>
    <td class="t-sub"><div class="clamp3">${hl(r.sarpras, terms) || '—'}</div></td>
    <td class="t-amt num">${fmtRp(r.anggaran)}</td>
    <td>${r.ket ? `<span class="t-note"><span class="clamp3">${hl(r.ket, terms)}</span></span>` : '<span class="muted">—</span>'}</td>
    <td class="t-act"><button class="btn-icon i-pri" data-act="edit" title="Ubah" aria-label="Ubah">${ic('square-pen')}</button><button class="btn-icon" data-act="print" title="Cetak" aria-label="Cetak">${ic('printer')}</button><button class="btn-icon i-err" data-act="del" title="Hapus" aria-label="Hapus">${ic('trash-2')}</button></td>
  </tr>`;
}
function mcardHtml(r, terms) {
  return `<article class="mcard j-${r.jenis}${r._pending ? ' pending' : ''}" data-id="${esc(r.id)}">
    <div class="mtop"><h4>${hl(r.kegiatan, terms)}</h4><span class="badge s-${esc(r.status)}">${esc(r.status)}</span></div>
    <div class="mrow">${ic('clock')}<span>${esc(tglRentang(r))}${r.jm ? ' • ' + esc(jamLabel(r)) : ''}</span></div>
    <div class="mrow">${ic('map-pin', 'red')}<span>${hl(r.lokasi, terms)}</span></div>
    <div class="msas">${ic('target')}<span><b>Sasaran:</b> ${hl(r.sasaran, terms)}</span></div>
    <div class="mfoot"><div><small>Alokasi anggaran</small><b class="num">${fmtRp(r.anggaran)}</b>${r._pending ? `<div class="xs muted">${ic('loader-circle', 'spin ic-sm')} Menyimpan…</div>` : ''}</div>
      <div><button class="btn-icon" data-act="print" aria-label="Cetak">${ic('printer')}</button><button class="btn-icon i-pri" data-act="edit" aria-label="Ubah">${ic('square-pen')}</button><button class="btn-icon i-err" data-act="del" aria-label="Hapus">${ic('trash-2')}</button></div></div>
  </article>`;
}

// ---------------------------------------------------------------------
// Popover filter & urut
// ---------------------------------------------------------------------
function popover(anchor, html, onMount) {
  document.querySelectorAll('.popover').forEach(p => p.remove());
  const p = document.createElement('div');
  p.className = 'popover'; p.innerHTML = html;
  anchor.parentElement.appendChild(p);
  const r = anchor.getBoundingClientRect(), pr = anchor.parentElement.getBoundingClientRect();
  p.style.top = (r.bottom - pr.top + 8) + 'px';
  p.style.left = Math.min(0, window.innerWidth - pr.left - 336) + 'px';
  const tutup = e => { if (!p.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { p.remove(); document.removeEventListener('mousedown', tutup); } };
  setTimeout(() => document.addEventListener('mousedown', tutup), 0);
  onMount(p, () => { p.remove(); document.removeEventListener('mousedown', tutup); });
}
function popFilter(btn) {
  const u = AppState.ui;
  const units = [...new Set(AppState.rows.map(r => r.unit).filter(Boolean).concat(String(AppState.settings.UNIT_LIST || '').split(';').map(s => s.trim()).filter(Boolean)))].sort();
  popover(btn, `<div class="lbl" style="margin-bottom:8px">Status</div>
    <div class="chips" data-st>${STATUS.map(s => `<button class="chip ${u.status.includes(s) ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
    <div class="field" style="margin-top:16px"><label for="f-unit">Unit / Bidang</label><select class="select" id="f-unit"><option value="">Semua unit</option>${units.map(x => `<option ${x === u.unit ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:16px;justify-content:space-between"><button class="link-btn" data-reset>${ic('rotate-ccw', 'ic-sm')} Reset</button><button class="btn btn-pri btn-sm" data-ok>Terapkan</button></div>`,
  (p, tutup) => {
    $('[data-st]', p).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; b.classList.toggle('on'); };
    $('[data-reset]', p).onclick = () => { u.status = []; u.unit = ''; u.page = 1; renderDaftar(); tutup(); };
    $('[data-ok]', p).onclick = () => { u.status = $$('[data-s].on', p).map(b => b.dataset.s); u.unit = $('#f-unit', p).value; u.page = 1; renderDaftar(); tutup(); };
  });
}
function popUrut(btn) {
  const u = AppState.ui, opsi = [['waktu', 1, 'Waktu terdekat dulu'], ['waktu', -1, 'Waktu terjauh dulu'], ['anggaran', -1, 'Anggaran terbesar'], ['anggaran', 1, 'Anggaran terkecil'], ['kegiatan', 1, 'Nama kegiatan A–Z'], ['status', 1, 'Status'], ['diubah', -1, 'Terakhir diubah']];
  popover(btn, `<div class="lbl" style="margin-bottom:8px">Urutkan berdasarkan</div><div style="display:flex;flex-direction:column;gap:2px">${opsi.map((o, i) => `<button class="btn btn-ghost btn-sm" style="justify-content:flex-start;${u.sort === o[0] && u.dir === o[1] ? 'background:var(--pri-t);color:var(--pri-d)' : ''}" data-i="${i}">${u.sort === o[0] && u.dir === o[1] ? ic('check', 'ic-sm') : '<span style="width:15px"></span>'} ${o[2]}</button>`).join('')}</div>`,
  (p, tutup) => { p.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const o = opsi[+b.dataset.i]; u.sort = o[0]; u.dir = o[1]; saveUi(); renderDaftar(); tutup(); }; });
}

// ---------------------------------------------------------------------
// Form tambah / ubah (optimistic UI + draf otomatis)
// ---------------------------------------------------------------------
function tglBawaan(jenis) {
  const per = perAktif(jenis), kini = hariIni();
  if (per === '*' || hitungPeriode(jenis, kini).key === per) return kini;
  if (jenis === 'Bulanan') return per + '-01';
  if (jenis === 'Harian') return per;
  if (jenis === 'Tahunan') return per + (kini.slice(0, 4) === per ? kini.slice(4) : '-01-02');
  if (jenis === 'Mingguan') { const [y, w] = per.split('-W').map(Number), j4 = new Date(Date.UTC(y, 0, 4)), d = j4.getUTCDay() || 7; j4.setUTCDate(j4.getUTCDate() - d + 1 + (w - 1) * 7); return j4.toISOString().slice(0, 10); }
  return kini;
}
function validasiForm(d) {
  const e = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tgl || '')) e.tgl = 'Tanggal kegiatan wajib diisi.';
  if (d.tglS && d.tglS < d.tgl) e.tglS = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  if (d.jm && d.js && !d.tglS && d.js <= d.jm) e.js = 'Jam selesai harus setelah jam mulai.';
  if (!d.lokasi.trim()) e.lokasi = 'Lokasi kegiatan wajib diisi.';
  if (!d.kegiatan.trim()) e.kegiatan = 'Nama kegiatan wajib diisi.';
  if (!d.sasaran.trim()) e.sasaran = 'Sasaran kegiatan wajib diisi.';
  return Object.keys(e).length ? e : null;
}

function openForm(row, opt = {}) {
  const baru = !row, draftKey = userKey('draft:new');
  let d = Object.assign({ jenis: AppState.ui.jenis, tgl: '', tglS: '', jm: '', js: '', lokasi: '', kegiatan: '', sasaran: '', personil: '', sarpras: '', anggaran: 0, ket: '', unit: '', status: 'Draf' }, row || {}, opt.preset || {});
  if (!d.tgl) d.tgl = tglBawaan(d.jenis);
  let dariDraf = false;
  if (baru && !opt.preset) { const dr = Store.get(draftKey, null); if (dr && (dr.kegiatan || dr.lokasi || dr.sasaran)) { d = Object.assign(d, dr); dariDraf = true; } }
  const units = [...new Set(String(AppState.settings.UNIT_LIST || '').split(';').map(s => s.trim()).filter(Boolean).concat(AppState.rows.map(r => r.unit).filter(Boolean)))].sort();

  openModal({
    size: 'lg',
    html: `<form novalidate data-form>
      <div class="modal-head"><div style="min-width:0"><h2>${baru ? 'Tambah Rengiat Baru' : 'Ubah Rengiat'}
          <span class="jenis-pick j-${d.jenis}" data-jp><select name="jenis" aria-label="Jenis rengiat">${JENIS.map(j => `<option ${j === d.jenis ? 'selected' : ''}>${j}</option>`).join('')}</select></span></h2>
          <div class="sub">${baru ? 'Lengkapi detail rencana kegiatan untuk sinkronisasi otomatis ke Google Sheets.' : `ID <span class="mono">${esc(row.id)}</span> • diubah ${esc(waktuRelatif(row.diubah))}`}</div></div>
        <button type="button" class="btn-icon" data-close aria-label="Tutup">${ic('x', 'ic-lg')}</button></div>
      <div class="modal-body"><div class="form-stack">
        ${dariDraf ? `<div class="draft-note">${ic('history')} Draf terakhir dipulihkan. <button type="button" class="link-btn" data-buang style="margin-left:auto">Buang draf</button></div>` : ''}
        ${opt.pesan ? `<div class="callout err">${ic('circle-alert')}<div>${esc(opt.pesan)}</div></div>` : ''}
        <div class="field"><span class="lbl">Waktu Pelaksanaan <span class="req">*</span></span>
          <div class="waktu-grid">
            <label class="ig w-date" title="Tanggal mulai">${ic('calendar')}<input class="input" type="date" name="tgl" value="${esc(d.tgl)}" required aria-label="Tanggal"></label>
            <label class="ig" title="Jam mulai">${ic('clock')}<input class="input" type="time" name="jm" value="${esc(d.jm)}" aria-label="Jam mulai"></label>
            <label class="ig" title="Jam selesai">${ic('clock-4')}<input class="input" type="time" name="js" value="${esc(d.js)}" aria-label="Jam selesai"></label>
            <div class="per-box" data-perbox>${ic('calendar-clock')}<span></span></div>
          </div>
          <div class="row row-wrap" style="gap:10px;margin-top:2px">
            <button type="button" class="link-btn xs" data-multi>${ic(d.tglS ? 'minus' : 'plus', 'ic-sm')} ${d.tglS ? 'Satu hari saja' : 'Kegiatan lebih dari satu hari'}</button>
            <label class="ig ${d.tglS ? '' : 'hide'}" data-tgls style="width:220px">${ic('calendar-range')}<input class="input" type="date" name="tglS" value="${esc(d.tglS)}" aria-label="Tanggal selesai"></label>
            <span class="hint">Jam boleh dikosongkan untuk kegiatan sepanjang hari.</span>
          </div>
          <div data-err="tgl"></div><div data-err="tglS"></div><div data-err="js"></div>
        </div>
        <div class="field"><label for="f-lokasi">Lokasi Kegiatan <span class="req">*</span></label>
          <div class="ig">${ic('map-pin')}<input class="input" id="f-lokasi" name="lokasi" maxlength="300" placeholder="Contoh: Ruang Rapat Utama Bappeda Gd. A Lt. 2, Jayapura" value="${esc(d.lokasi)}"></div><div data-err="lokasi"></div></div>
        <div class="field"><label for="f-keg">Nama / Deskripsi Rencana Kegiatan <span class="req">*</span></label>
          <input class="input" id="f-keg" name="kegiatan" maxlength="500" style="font-weight:600;height:50px;font-size:16px" placeholder="Contoh: Rapat Koordinasi Penyelarasan Renstra" value="${esc(d.kegiatan)}" autofocus><div data-err="kegiatan"></div></div>
        <div class="grid-2">
          <div class="field"><label for="f-sas">Sasaran Kegiatan <span class="req">*</span></label><input class="input" id="f-sas" name="sasaran" maxlength="500" placeholder="Siapa/apa yang dituju" value="${esc(d.sasaran)}"><div data-err="sasaran"></div></div>
          <div class="field"><label for="f-ang">Pagu Anggaran (Rp)</label><div class="ig"><span class="ig-pre">Rp</span><input class="input num" id="f-ang" name="anggaran" inputmode="numeric" autocomplete="off" placeholder="0" value="${d.anggaran ? fmtRb(d.anggaran) : ''}"></div><div class="hint" data-terbilang></div></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="f-per">Personil / Pelaksana Terlibat</label><textarea class="textarea" id="f-per" name="personil" maxlength="1000" placeholder="12 Orang (Koordinator: …, Notulensi: …)">${esc(d.personil)}</textarea></div>
          <div class="field"><label for="f-sar">Sarana &amp; Prasarana (Sarpras)</label><textarea class="textarea" id="f-sar" name="sarpras" maxlength="1000" placeholder="Proyektor, Laptop, Sound System…">${esc(d.sarpras)}</textarea></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="f-unit2">Unit / Bidang Penanggung Jawab</label><input class="input" id="f-unit2" name="unit" list="dl-unit" maxlength="150" placeholder="Pilih atau ketik" value="${esc(d.unit)}"><datalist id="dl-unit">${units.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
          <div class="field"><label for="f-st">Status</label><select class="select" id="f-st" name="status">${STATUS.map(s => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="f-ket">Keterangan Tambahan</label><textarea class="textarea" id="f-ket" name="ket" maxlength="2000" placeholder="Catatan (opsional)">${esc(d.ket)}</textarea></div>
      </div></div>
      <div class="modal-foot"><span class="hint" style="margin-right:auto">${matchMedia('(pointer: fine)').matches ? 'Ctrl + Enter untuk menyimpan' : ''}</span>
        <button type="button" class="btn btn-sec" data-close>Batal</button>
        <button type="submit" class="btn btn-pri">${ic('save')} ${baru ? 'Simpan Rengiat' : 'Simpan Perubahan'}</button></div>
    </form>`,
    onMount(m, close) {
      const f = $('[data-form]', m);
      const ambil = () => ({ jenis: f.jenis.value, tgl: f.tgl.value, tglS: $('[data-tgls]', m).classList.contains('hide') ? '' : f.tglS.value, jm: f.jm.value, js: f.js.value,
        lokasi: f.lokasi.value.trim(), kegiatan: f.kegiatan.value.trim(), sasaran: f.sasaran.value.trim(), personil: f.personil.value.trim(), sarpras: f.sarpras.value.trim(),
        anggaran: angkaDari(f.anggaran.value), ket: f.ket.value.trim(), unit: f.unit.value.trim(), status: f.status.value });
      const tampilPer = () => {
        const j = f.jenis.value, t = f.tgl.value, p = hitungPeriode(j, t);
        $('[data-jp]', m).className = 'jenis-pick j-' + j;
        const w = t ? isoWeek(...t.split('-').map(Number)) : null;
        $('[data-perbox] span', m).innerHTML = t ? `<b>Periode:</b> ${esc(namaHari(t))}, ${esc(tglPendek(t))} • ${j === 'Mingguan' || j === 'Harian' ? 'Mg-' + w.w : esc(p.label)}` : 'Pilih tanggal';
      };
      const tampilErr = errs => {
        $$('[data-err]', m).forEach(x => { x.innerHTML = ''; });
        $$('.bad', m).forEach(x => x.classList.remove('bad'));
        Object.keys(errs || {}).forEach(k => {
          const box = $(`[data-err="${k}"]`, m); if (box) box.innerHTML = `<div class="err-msg">${ic('circle-alert', 'ic-sm')} ${esc(errs[k])}</div>`;
          const inp = f[k]; if (inp) (inp.closest('.ig') || inp).classList.add('bad');
        });
        const first = Object.keys(errs || {})[0]; if (first && f[first]) f[first].focus();
      };
      const simpanDraf = debounce(() => { if (baru) Store.set(draftKey, ambil()); }, 400);
      const terbilang = () => { const n = angkaDari(f.anggaran.value); $('[data-terbilang]', m).textContent = n ? terbilangId(n) + ' rupiah' : 'Hanya angka. Kosongkan bila tanpa anggaran.'; };
      tampilPer(); terbilang();
      if (opt.err) tampilErr({ [opt.err]: opt.pesan || 'Periksa isian ini.' });

      f.addEventListener('input', e => {
        if (e.target.name === 'anggaran') { const n = angkaDari(e.target.value); e.target.value = n ? fmtRb(n) : ''; terbilang(); }
        if (['jenis', 'tgl'].includes(e.target.name)) tampilPer();
        const box = $(`[data-err="${e.target.name}"]`, m); if (box && box.innerHTML) { box.innerHTML = ''; (e.target.closest('.ig') || e.target).classList.remove('bad'); }
        simpanDraf();
      });
      f.jenis.addEventListener('change', tampilPer);
      $('[data-multi]', m).onclick = () => {
        const box = $('[data-tgls]', m), on = box.classList.toggle('hide');
        $('[data-multi]', m).innerHTML = ic(on ? 'plus' : 'minus', 'ic-sm') + (on ? ' Kegiatan lebih dari satu hari' : ' Satu hari saja');
        if (!on && !f.tglS.value) f.tglS.value = f.tgl.value;
      };
      const buang = $('[data-buang]', m);
      if (buang) buang.onclick = () => { Store.del(draftKey); close(); openForm(null); };
      f.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); } });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const data = ambil(), errs = validasiForm(data);
        if (errs) return tampilErr(errs);
        close();
        simpanRengiat(row, data);
      });
    }
  });
}

/** Optimistic: baris langsung tampil (tanda "Menyimpan"), server dikonfirmasi di belakang, rollback bila gagal. */
async function simpanRengiat(row, data) {
  const baru = !row, tmpId = baru ? 'tmp-' + uuid() : row.id;
  const per = hitungPeriode(data.jenis, data.tgl);
  const sementara = Object.assign({}, row || {}, data, { id: tmpId, periode: per.label, pk: per.key, _pending: true, diubah: new Date().toISOString() });
  upsertLocal(sementara, baru ? null : row.id);
  if (baru) Store.del(userKey('draft:new'));
  const u = AppState.ui;
  if (u.jenis !== data.jenis || (perAktif(data.jenis) !== '*' && perAktif(data.jenis) !== per.key)) {
    u.jenis = data.jenis; u.per[data.jenis] = per.key; u.page = 1; saveUi();
    if (AppState.route && AppState.route.name === 'jenis') history.replaceState(null, '', '#/jenis/' + data.jenis);
    markNav(AppState.route.name, data.jenis); renderDaftar();
  }
  const res = await withPending(api('rengiatSave', Object.assign({}, data, { id: baru ? '' : row.id })));
  if (res.success) {
    const r = Object.assign(res.data.row, { _flash: true });
    upsertLocal(r, tmpId);
    AppState.lastSync = 0;                           // segarkan penuh pada sinkron berikutnya
    setTimeout(() => { delete r._flash; }, 1500);
    toast('success', baru ? 'Rengiat berhasil disimpan' : 'Perubahan tersimpan', baru ? 'ke Google Sheets • ' + r.id : r.kegiatan);
  } else {
    if (baru) removeLocal(tmpId); else upsertLocal(row, row.id);
    const field = res.data && res.data.field;
    toast('error', 'Gagal menyimpan', res.message, { action: { label: 'Buka formulir lagi', fn: () => openForm(baru ? null : row, { preset: data, err: field, pesan: res.message }) } });
    if (field) openForm(baru ? null : row, { preset: data, err: field, pesan: res.message });
  }
}

// ---------------------------------------------------------------------
// Hapus (ketik HAPUS)
// ---------------------------------------------------------------------
function openHapus(r) {
  openModal({
    html: `<div class="modal-head" style="padding-bottom:0"><div class="modal-ico red">${ic('trash-2')}</div><button class="btn-icon" data-close aria-label="Tutup">${ic('x', 'ic-lg')}</button></div>
    <div class="modal-body">
      <h2 style="font-size:24px">Hapus Rencana Kegiatan Ini?</h2>
      <p class="muted" style="margin:8px 0 20px">Tindakan ini permanen. Baris data pada Google Spreadsheet induk akan dihapus dan total anggaran dihitung ulang otomatis.</p>
      <div class="summary-box j-${r.jenis}"><div class="row row-wrap" style="gap:8px"><span class="pill pill-j">${esc(r.jenis.toUpperCase())}</span><b class="small">Pagu: ${fmtRp(r.anggaran)}</b></div>
        <h4>${esc(r.kegiatan)}</h4>
        <div class="row row-wrap small muted" style="gap:14px"><span class="row" style="gap:6px">${ic('clock', 'ic-sm')} ${esc(waktuLabel(r))}</span><span class="row" style="gap:6px">${ic('map-pin', 'ic-sm')} ${esc(r.lokasi)}</span></div></div>
      <div class="field" style="margin-top:20px"><label for="f-hapus">Ketik kata <b style="color:var(--err)">HAPUS</b> di bawah ini untuk konfirmasi:</label>
        <input class="input" id="f-hapus" autocomplete="off" placeholder="KETIK HAPUS..." style="text-transform:uppercase;background:var(--bg)" autofocus></div>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Batal</button><button class="btn btn-danger" data-ok disabled>${ic('trash-2')} Hapus Permanen</button></div>`,
    onMount(m, close) {
      const inp = $('#f-hapus', m), ok = $('[data-ok]', m);
      inp.addEventListener('input', () => { ok.disabled = inp.value.trim().toUpperCase() !== 'HAPUS'; });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !ok.disabled) ok.click(); });
      ok.onclick = async () => {
        close();
        removeLocal(r.id);                                    // optimistic
        const res = await withPending(api('rengiatDelete', { id: r.id }));
        if (res.success) { AppState.lastSync = 0; toast('success', 'Pemberitahuan Sistem', 'Rengiat berhasil dihapus dari Spreadsheet induk.'); }
        else { upsertLocal(r); toast('error', 'Gagal menghapus', res.message + ' Data dikembalikan.'); }
      };
    }
  });
}

// ---------------------------------------------------------------------
// Cetak dokumen (DocEngine) — dialog + pratinjau A4
// ---------------------------------------------------------------------
function barisCetak(s) {
  if (s.ids) return AppState.rows.filter(r => s.ids.includes(r.id) && !r._pending).sort(URUT.waktu);
  const rows = s.pakaiFilter ? saringRows(s.jenis, s.per) : saringRows(s.jenis, s.per, { filter: false });
  return rows.filter(r => !r._pending).sort(URUT.waktu);
}
function tplAktif() { return AppState.templates.filter(t => t.aktif); }

function openCetak(opt = {}) {
  const u = AppState.ui;
  const s = { ids: opt.ids || null, jenis: opt.jenis || u.jenis, per: opt.per || perAktif(opt.jenis || u.jenis), pakaiFilter: !!opt.dariFilter && (!!u.q || jumlahFilter() > 0),
              tplId: opt.templateId || 'DEFAULT', format: 'pdf', pejabat: {}, isian: {} };
  if (!AppState.templates.length) return toast('error', 'Template belum tersedia', 'Jalankan setupAppEnvironment() atau perbaikiTemplateStandar() di Apps Script.');
  if (!AppState.templates.some(t => t.id === s.tplId)) s.tplId = AppState.templates[0].id;

  openModal({
    size: 'lg',
    html: `${modalHead('Cetak Dokumen Rengiat', 'Buat dan unduh dokumen rekapitulasi resmi rencana kegiatan — bernomor, ber-QR, dan bisa diverifikasi.', `<div class="modal-ico pri">${ic('printer')}</div>`)}
      <div class="modal-body"><div class="form-stack" data-isi></div></div>
      <div class="modal-foot" style="flex-direction:column;align-items:stretch">
        <div class="row" style="justify-content:flex-end;gap:12px;flex-wrap:wrap"><button class="btn btn-ghost" data-prev>${ic('eye')} Pratinjau</button><span class="spacer"></span><button class="btn btn-sec" data-close>Batal</button><button class="btn btn-pri btn-lg" data-go>${ic('download')} <span data-golbl>Unduh Dokumen PDF</span></button></div>
        <div class="progress-note hide" data-prog>${ic('loader-circle', 'spin ic-sm')} <span>Membuat dokumen via Google Apps Script…</span></div>
      </div>`,
    onMount(m, close) {
      const isi = $('[data-isi]', m);
      const render = () => {
        const tpl = AppState.templates.find(t => t.id === s.tplId) || AppState.templates[0];
        const rows = tpl.adaRengiat ? barisCetak(s) : [], total = rows.reduce((a, r) => a + r.anggaran, 0);
        const ekst = (tpl.keluaran || ['pdf']).filter(f => ['pdf', 'docx', 'xlsx', 'pptx', 'png'].includes(f));
        if (!ekst.includes(s.format)) s.format = ekst[0] || 'pdf';
        const opsiPer = perOpsi(s.jenis);
        const form = (tpl.bidang || []).filter(b => !b.sumber);
        isi.innerHTML = `
          ${AppState.templates.length > 1 ? `<div class="field"><label for="c-tpl">Template Dokumen</label><select class="select" id="c-tpl">${tplAktif().map(t => `<option value="${esc(t.id)}" ${t.id === tpl.id ? 'selected' : ''}>${esc(t.nama)} • ${esc(t.engine)}</option>`).join('')}</select></div>` : ''}
          ${tpl.adaRengiat ? (s.ids ? `<div class="info-line">${ic('list-checks')} <span><b>${rows.length} kegiatan dipilih:</b> ${esc(rows.map(r => r.kegiatan).join('; ').slice(0, 140))}</span></div>` : `
          <div class="grid-2">
            <div class="field"><label for="c-jenis">Jenis Rencana</label><select class="select" id="c-jenis">${JENIS.map(j => `<option ${j === s.jenis ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
            <div class="field"><label for="c-per">Periode Pelaksanaan</label><select class="select" id="c-per"><option value="*">Semua periode</option>${opsiPer.map(o => `<option value="${esc(o.key)}" ${o.key === s.per ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
          </div>
          ${(u.q || jumlahFilter()) ? `<label class="check small"><input type="checkbox" id="c-filter" ${s.pakaiFilter ? 'checked' : ''}> Terapkan pencarian &amp; filter aktif di tabel</label>` : ''}`) +
          `<div class="grid-2"><div class="mini-stat"><div class="ico">${ic('chart-column')}</div><div><b>${rows.length} Kegiatan</b><small>Terdaftar</small></div></div>
            <div class="mini-stat"><div class="ico ok">${ic('banknote')}</div><div><b class="num">${fmtRp(total)}</b><small>Total Anggaran</small></div></div></div>` : ''}
          ${(tpl.slot || []).map(sl => `<div class="field"><label for="c-pj${sl.slot}">${esc(sl.label || 'Penanda Tangan ' + sl.slot)}</label><select class="select" id="c-pj${sl.slot}" data-slot="${sl.slot}">
              <option value="PENGATURAN">${esc(AppState.settings.PENANDATANGAN_NAMA || 'Penanda tangan bawaan')} — ${esc(AppState.settings.PENANDATANGAN_JABATAN || '')} (bawaan)</option>
              ${AppState.pejabat.filter(p => p.aktif).map(p => `<option value="${esc(p.id)}" ${(s.pejabat[sl.slot] || sl.pejabatId) === p.id ? 'selected' : ''}>${esc([p.nama, p.gelar].filter(Boolean).join(', '))} — ${esc(p.jabatan)}</option>`).join('')}</select></div>`).join('')}
          ${form.length ? `<div class="divider"></div><div class="lbl">Isian dokumen</div>${deFormHtml(form, s.isian)}` : ''}
          ${ekst.length > 1 ? `<div class="field"><span class="lbl">Format keluaran</span><div class="seg" data-fmt>${ekst.map(f => `<button type="button" class="${f === s.format ? 'on' : ''}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div></div>` : ''}
          <div class="info-line">${ic('file-text')} <b>Format Dokumen:</b> ${tpl.id === 'DEFAULT' ? 'A4 Lanskap (Kop Otomatis)' : esc(tpl.nama)} <span class="pill">${tpl.tandaTangan === 'kosong' ? 'TTD basah' : 'QR eTTD'}</span></div>
          <div data-cerr></div>`;
        $('[data-golbl]', m).textContent = 'Unduh Dokumen ' + s.format.toUpperCase();
        $('[data-go]', m).disabled = tpl.adaRengiat && !rows.length;
        $('[data-prev]', m).classList.toggle('hide', tpl.id !== 'DEFAULT');
        const on = (sel, ev, fn) => { const x = $(sel, isi); if (x) x.addEventListener(ev, fn); };
        on('#c-tpl', 'change', e => { simpanIsian(); s.tplId = e.target.value; s.isian = {}; render(); });
        on('#c-jenis', 'change', e => { s.jenis = e.target.value; s.per = perAktif(s.jenis); render(); });
        on('#c-per', 'change', e => { s.per = e.target.value; render(); });
        on('#c-filter', 'change', e => { s.pakaiFilter = e.target.checked; render(); });
        on('[data-fmt]', 'click', e => { const b = e.target.closest('[data-f]'); if (b) { simpanIsian(); s.format = b.dataset.f; render(); } });
        $$('[data-slot]', isi).forEach(x => x.addEventListener('change', () => { s.pejabat[x.dataset.slot] = x.value; }));
        deFormPasang(isi);
        s._tpl = tpl; s._rows = rows; s._form = form;
      };
      const simpanIsian = () => { if (s._form && s._form.length) Object.assign(s.isian, deKumpulkan(s._form, isi)); $$('[data-slot]', isi).forEach(x => { s.pejabat[x.dataset.slot] = x.value; }); };
      render();

      $('[data-prev]', m).onclick = () => { simpanIsian(); AppState.cetakSel = { ids: s._rows.map(r => r.id), jenis: s.ids ? (s._rows[0] || {}).jenis : s.jenis, per: s.ids ? '' : s.per, pejabat: s.pejabat }; close(); go('#/cetak'); };
      $('[data-go]', m).onclick = async () => {
        simpanIsian();
        const wajib = (s._form || []).find(b => b.wajib && b.tipe !== 'daftar' && !String(s.isian[b.kunci] == null ? '' : s.isian[b.kunci]).replace(/<[^>]*>/g, '').trim());
        if (wajib) { $('[data-cerr]', m).innerHTML = `<div class="callout err">${ic('circle-alert')}<div>${esc(wajib.label)} wajib diisi.</div></div>`; return; }
        const btn = $('[data-go]', m), prog = $('[data-prog]', m);
        $('[data-cerr]', m).innerHTML = '';
        busyBtn(btn, true, 'Membuat dokumen…'); prog.classList.remove('hide');
        const t0 = Date.now(), iv = setInterval(() => { $('span', prog).textContent = 'Membuat ' + s.format.toUpperCase() + ' via Google Apps Script… ' + Math.round((Date.now() - t0) / 1000) + ' dtk'; }, 500);
        const res = await terbitkan({ templateId: s._tpl.id, ids: s._rows.map(r => r.id), jenis: s.ids ? (s._rows[0] || {}).jenis : s.jenis, periode: s.ids ? '' : (s.per === '*' ? '' : labelPer(s.jenis, s.per)), isian: s.isian, pejabat: s.pejabat, format: s.format });
        clearInterval(iv); busyBtn(btn, false); prog.classList.add('hide');
        if (res.success) close();
        else $('[data-cerr]', m).innerHTML = `<div class="callout err">${ic('circle-alert')}<div><b>Gagal membuat dokumen.</b> ${esc(res.message)}</div></div>`;
      };
    }
  });
}

/** Panggil server untuk menerbitkan dokumen, lalu unduh berkasnya. */
async function terbitkan(payload) {
  payload.baseUrl = urlVerifikasi();
  const res = await withPending(api('cetak', payload, { timeout: 150000 }));
  if (res.success) {
    const d = res.data;
    unduhBase64(d.base64, d.nama, d.mime);
    toast('success', 'Dokumen ' + d.nomor + ' terbit', 'Berkas terunduh. Kode verifikasi: ' + d.kode, d.url ? { action: { label: 'Salin tautan verifikasi', fn: () => salin(d.url) } } : {});
    AppState.dokumen = null; Store.del(userKey('c:dokumen'));
    Bus.emit('dokumen');
  }
  return res;
}

// ---------------------------------------------------------------------
// Form dinamis dari skema template (gas-doc-engine)
// ---------------------------------------------------------------------
function deFormHtml(bidang, nilai) {
  nilai = nilai || {};
  return bidang.map(b => {
    const id = 'de_' + b.kunci, v = nilai[b.kunci] == null ? '' : nilai[b.kunci];
    const label = `<label for="${id}">${esc(b.label)}${b.wajib ? ' <span class="req">*</span>' : ''}</label>`;
    const bantu = b.bantu ? `<div class="hint">${esc(b.bantu)}</div>` : '';
    let input;
    if (b.tipe === 'area') input = `<textarea class="textarea" id="${id}" rows="3">${esc(v)}</textarea>`;
    else if (b.tipe === 'naskah') input = `<div class="editor-isi" id="${id}" contenteditable="true" data-naskah>${v || ''}</div><div class="hint">Tebal (Ctrl+B), miring (Ctrl+I), daftar dapat ditempel dari Google Docs.</div>`;
    else if (b.tipe === 'pilihan') input = `<select class="select" id="${id}">${(b.opsi || []).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (b.tipe === 'daftar') input = deTabelDaftarHtml(b, Array.isArray(v) ? v : []);
    else input = `<input class="input" id="${id}" type="${{ tanggal: 'date', angka: 'number' }[b.tipe] || 'text'}" value="${esc(v)}">`;
    return `<div class="field" data-kunci="${esc(b.kunci)}">${label}${input}${bantu}</div>`;
  }).join('');
}
function deTabelDaftarHtml(b, rows) {
  const kol = b.kolom || [];
  const baris = (r, i) => `<tr>${kol.map(k => `<td style="padding:4px"><input class="input" style="height:38px;font-size:14px" data-k="${esc(k.kunci)}" value="${esc(r[k.kunci] || r[k.kunci.toLowerCase()] || '')}" aria-label="${esc(k.label)} ${i + 1}"></td>`).join('')}<td style="padding:4px;width:40px"><button type="button" class="btn-icon i-err" data-delrow aria-label="Hapus baris">${ic('x')}</button></td></tr>`;
  return `<div class="card" style="overflow:auto;box-shadow:none"><table class="simple" data-daftar="${esc(b.kunci)}"><thead><tr>${kol.map(k => `<th>${esc(k.label)}</th>`).join('')}<th></th></tr></thead><tbody>${(rows.length ? rows : [{}]).map(baris).join('')}</tbody></table>
    <div style="padding:8px"><button type="button" class="btn btn-soft btn-sm" data-addrow>${ic('plus', 'ic-sm')} Tambah baris</button></div></div><template data-rowtpl>${baris({}, 0)}</template>`;
}
function deFormPasang(root) {
  root.addEventListener('click', e => {
    const add = e.target.closest('[data-addrow]'), del = e.target.closest('[data-delrow]');
    if (add) { const wrap = add.closest('.field'), tb = $('tbody', wrap); tb.insertAdjacentHTML('beforeend', $('[data-rowtpl]', wrap).innerHTML); }
    if (del) { const tb = del.closest('tbody'); if (tb.children.length > 1) del.closest('tr').remove(); else $$('input', del.closest('tr')).forEach(i => { i.value = ''; }); }
  });
  $$('[data-naskah]', root).forEach(ed => ed.addEventListener('paste', e => {
    const html = e.clipboardData && e.clipboardData.getData('text/html');
    if (!html) return;
    e.preventDefault();
    const bersih = html.replace(/<(\/?)(span|font|meta|style|o:p)[^>]*>/gi, '').replace(/\s(style|class|id|dir)="[^"]*"/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
    document.execCommand('insertHTML', false, bersih);
  }));
}
function deKumpulkan(bidang, root) {
  const o = {};
  bidang.forEach(b => {
    const el = $('#de_' + b.kunci, root);
    if (b.tipe === 'daftar') { const t = $(`[data-daftar="${b.kunci}"]`, root); if (t) o[b.kunci] = $$('tbody tr', t).map(tr => { const r = {}; $$('[data-k]', tr).forEach(i => { r[i.dataset.k] = i.value.trim(); }); return r; }).filter(r => Object.values(r).some(Boolean)); return; }
    if (!el) return;
    if (b.tipe === 'naskah') o[b.kunci] = el.innerHTML;
    else if (b.tipe === 'angka') o[b.kunci] = el.value === '' ? '' : Number(el.value);
    else o[b.kunci] = el.value.trim();
  });
  return o;
}

// ---------------------------------------------------------------------
// Pratinjau lembar cetak A4 lanskap (dirender lokal → instan)
// ---------------------------------------------------------------------
registerPage('cetak', {
  title: () => 'Pratinjau Cetak',
  init(el) {
    el.innerHTML = `<div class="card prev-bar">
        <button class="btn btn-ghost btn-sm" data-back>${ic('arrow-left', 'ic-sm')} Kembali</button><i class="vdiv"></i>
        <h3>${ic('file-text')} Pratinjau Lembar Cetak A4 Lanskap <span class="pill pill-pri">SK-PDF v1</span></h3><span class="spacer"></span>
        <button class="btn btn-sec btn-sm" data-print>${ic('printer', 'ic-sm')} Cetak Dokumen</button>
        <button class="btn btn-pri btn-sm" data-dl>${ic('download', 'ic-sm')} Unduh PDF</button></div>
      <div class="sheet-wrap" data-wrap><div class="sheet" data-sheet></div></div>`;
    $('[data-back]', el).onclick = () => (history.length > 1 ? history.back() : go('#/ringkasan'));
    $('[data-print]', el).onclick = () => window.print();
    $('[data-dl]', el).onclick = async e => {
      const s = AppState.cetakSel, btn = e.currentTarget;
      busyBtn(btn, true, 'Membuat PDF…');
      const res = await terbitkan({ templateId: 'DEFAULT', ids: s.ids, jenis: s.jenis, periode: s.per && s.per !== '*' ? labelPer(s.jenis, s.per) : '', pejabat: s.pejabat || {}, format: 'pdf' });
      busyBtn(btn, false);
      if (res.success) { s.terbit = res.data; renderSheet(el); }
      else toast('error', 'Gagal membuat PDF', res.message);
    };
    window.addEventListener('resize', debounce(() => { if (!el.hidden) skalakan(el); }, 120));
  },
  show(el) {
    if (!AppState.cetakSel) { const j = AppState.ui.jenis, p = perAktif(j); AppState.cetakSel = { ids: saringRows(j, p).map(r => r.id), jenis: j, per: p, pejabat: {} }; }
    renderSheet(el);
  }
});

function renderSheet(el) {
  const s = AppState.cetakSel, S = AppState.settings;
  const rows = AppState.rows.filter(r => s.ids.includes(r.id)).sort(URUT.waktu);
  const total = rows.reduce((a, r) => a + r.anggaran, 0), jenis = s.jenis || (rows[0] || {}).jenis || '';
  const perLbl = s.per && s.per !== '*' ? labelPer(jenis, s.per) : '';
  const th = rows.length ? rows[0].tgl.slice(0, 4) : hariIni().slice(0, 4);
  const sub = !perLbl ? 'Seluruh periode • ' + rows.length + ' kegiatan' : jenis === 'Tahunan' ? 'Tahun Anggaran ' + perLbl : jenis === 'Bulanan' ? 'Bulan: ' + perLbl + ' • Tahun Anggaran ' + th : jenis === 'Mingguan' ? 'Periode: ' + perLbl + ' • Tahun Anggaran ' + th : 'Tanggal: ' + perLbl;
  const pjId = (s.pejabat || {})[1], pj = AppState.pejabat.find(p => p.id === pjId);
  const ttd = pj ? { nama: [pj.nama, pj.gelar].filter(Boolean).join(', '), jabatan: pj.jabatan, nip: pj.nip } : { nama: S.PENANDATANGAN_NAMA, jabatan: S.PENANDATANGAN_JABATAN, nip: S.PENANDATANGAN_NIP };
  const t = s.terbit, qr = t && t.url && window.QRLIB ? qrDataUrl(t.url) : '', qrTtd = t && t.url && window.QRLIB && S.TANDA_TANGAN !== 'kosong' ? qrDataUrl(t.url + '-1') : '';
  const kini = hariIni();
  $('[data-sheet]', el).innerHTML = `
    <div class="kop"><div class="logo">${ic('calendar-check')}</div><div class="kop-t"><div class="a">${esc((S.INSTITUSI_INDUK || '').toUpperCase())}</div><div class="b">${esc((S.INSTITUSI_NAMA || '').toUpperCase())}</div><div class="c">${esc(S.INSTITUSI_ALAMAT || '')} • ${esc(S.INSTITUSI_KONTAK || '')}</div></div><div></div></div>
    <div class="doc-title"><h2>${esc(S.JUDUL_DOKUMEN || 'RENCANA KEGIATAN (RENGIAT)')} ${esc(jenis.toUpperCase())}</h2><p>${esc(sub)}</p></div>
    <table class="doc-tbl"><thead><tr><th class="c">No</th><th>Waktu Kegiatan</th><th>Lokasi</th><th>Kegiatan</th><th>Sasaran</th><th class="c">Personil</th><th>Sarpras</th><th class="r">Anggaran (Rp)</th><th>Keterangan</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td><b>${esc(tglRentang(r))}</b><div style="color:#64748B">${esc(jamLabel(r))}</div></td><td>${esc(r.lokasi)}</td><td><b>${esc(r.kegiatan)}</b></td><td>${esc(r.sasaran)}</td><td class="c">${esc(r.personil)}</td><td>${esc(r.sarpras)}</td><td class="r num">${fmtRb(r.anggaran)}</td><td>${esc(r.ket)}</td></tr>`).join('') || '<tr><td colspan="9" class="c" style="padding:30px;color:#64748B">Tidak ada kegiatan pada pilihan ini.</td></tr>'}
      <tr class="tot"><td></td><td colspan="6" class="r">TOTAL ANGGARAN ${esc((perLbl || 'SELURUH PERIODE').toUpperCase())} • ${rows.length} KEGIATAN</td><td class="r num">${fmtRb(total)}</td><td></td></tr></tbody></table>
    <p class="small" style="margin:10px 0 0;color:#334155;font-style:italic">Terbilang: ${esc(terbilangId(total).replace(/^./, c => c.toUpperCase()))} rupiah</p>
    <div class="doc-foot">
      <div class="ver"><div class="row" style="gap:8px;color:var(--pri-d);font-weight:700">${ic('badge-check')} Dokumen Resmi Sistem Informasi Manajemen Kegiatan</div>
        <small>Dicetak secara otomatis melalui aplikasi E-RENGIAT</small>
        <small>Tanggal Cetak: ${esc(tglPanjang(kini))}, ${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jayapura', hour: '2-digit', minute: '2-digit' }).format(new Date())} WIT</small>
        <small>ID Dokumen: <b>${t ? esc(t.nomor) : 'diterbitkan saat Unduh PDF'}</b></small>
        <div class="qr-box">${qr ? `<img src="${qr}" alt="QR verifikasi">` : `<div class="qr-ph">${ic('qr-code', 'ic-lg')}</div>`}<div><b class="xs" style="letter-spacing:.08em">KEASLIAN DOKUMEN</b><div class="xs muted">${t ? 'Kode: ' + esc(t.kode) : 'QR & kode verifikasi terbit saat dokumen diunduh'}</div></div></div></div>
      <div class="ttd"><div>${esc(S.KOTA || 'Jayapura')}, ${esc(tglPanjang(kini))}</div><div style="font-weight:700;margin-top:4px">${esc(ttd.jabatan || '')}</div>
        <div class="ttd-mid">${qrTtd ? `<img src="${qrTtd}" alt="QR tanda tangan elektronik">` : `<div class="stamp">${S.TANDA_TANGAN === 'kosong' ? 'TANDA TANGAN<br>&amp; STEMPEL' : 'QR eTTD<br>SAAT TERBIT'}</div>`}</div>
        <div class="nm">${esc(ttd.nama || '')}</div><div>NIP. ${esc(ttd.nip || '')}</div></div>
    </div>
    <div class="page-no">— HALAMAN 1 DARI 1 —</div>`;
  skalakan(el);
}
function skalakan(el) {
  const wrap = $('[data-wrap]', el), sh = $('[data-sheet]', el);
  const sc = Math.min(1, wrap.clientWidth / 1123);
  sh.style.transform = sc < 1 ? `scale(${sc})` : '';
  sh.style.marginLeft = sc < 1 ? '0' : 'auto';
  wrap.style.height = sc < 1 ? (sh.offsetHeight * sc + 8) + 'px' : '';
}
function qrDataUrl(teks) { const b = window.QRLIB.pngBytes(teks, 6, 2); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return 'data:image/png;base64,' + btoa(s); }

function terbilangId(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const t = x => x < 12 ? s[x] : x < 20 ? t(x - 10) + ' belas' : x < 100 ? t(Math.floor(x / 10)) + ' puluh ' + t(x % 10) : x < 200 ? 'seratus ' + t(x - 100) : x < 1000 ? t(Math.floor(x / 100)) + ' ratus ' + t(x % 100) : x < 2000 ? 'seribu ' + t(x - 1000) : x < 1e6 ? t(Math.floor(x / 1000)) + ' ribu ' + t(x % 1000) : x < 1e9 ? t(Math.floor(x / 1e6)) + ' juta ' + t(x % 1e6) : x < 1e12 ? t(Math.floor(x / 1e9)) + ' miliar ' + t(x % 1e9) : t(Math.floor(x / 1e12)) + ' triliun ' + t(x % 1e12);
  return n === 0 ? 'nol' : t(n).replace(/\s+/g, ' ').trim();
}
