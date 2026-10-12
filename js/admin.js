/* =====================================================================
 * E-RENGIAT — admin.js
 * Halaman Matriks & Verifikasi, Template Dokumen (DocEngine), dan Sistem
 * (pengaturan instansi, pengguna, akun, migrasi data, log, performa).
 * ===================================================================== */
'use strict';

async function muatCache(kunci, action, fresh = 60000, force = false) {
  const c = Store.get(userKey('c:' + kunci), null);
  if (!force && c && Date.now() - c.t < fresh) return { success: true, data: c.data, cached: true };
  const res = await api(action);
  if (res.success) { const lama = JSON.stringify(AppState[kunci]); cacheSet(kunci, res.data); if (lama !== JSON.stringify(res.data)) Bus.emit(kunci); }
  return res;
}

// =====================================================================
// MATRIKS & VERIFIKASI
// =====================================================================
registerPage('matriks', {
  title: () => 'Matriks & Verifikasi',
  init(el) {
    el.innerHTML = `
      <div class="page-head"><div><span class="eyebrow">Pantau &amp; verifikasi</span><h1 style="margin-top:6px">Matriks &amp; Verifikasi</h1>
        <div class="sub">Sebaran rengiat per jenis dan status, antrean persetujuan, serta arsip dokumen terbit ber-QR.</div></div>
        <div class="row head-side"><button class="sync-pill" data-sync><i class="d"></i><span>Google Sheets Terhubung</span>${ic('cloud', 'ic-sm')}</button></div></div>
      <div class="kpi-grid" data-kpi></div>
      <div class="two-col">
        <div class="stack">
          <div class="card"><div class="card-head"><h3>${ic('grid-3x3')} Matriks Jenis × Status</h3><select class="select" data-th style="width:auto;height:36px" aria-label="Tahun"></select></div><div class="tscroll" data-mtx></div></div>
          <div class="card"><div class="card-head"><h3>${ic('list-checks')} Antrean Verifikasi</h3><div class="seg" data-qseg><button class="on" data-q="Review">Review</button><button data-q="Revisi">Revisi</button><button data-q="Draf">Draf</button></div></div>
            <div data-qbar></div><div data-queue></div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3>${ic('scan-search')} Cek Keaslian Dokumen</h3></div><div class="card-body">
            <form class="code-in" data-vform><input class="input" data-vk placeholder="Tempel kode atau tautan verifikasi" aria-label="Kode verifikasi"><button class="btn btn-pri">${ic('search')} Cek</button></form><div class="verif-res" data-vres></div></div></div>
          <div class="card"><div class="card-head"><h3>${ic('archive')} Arsip Dokumen Terbit</h3><button class="btn btn-ghost btn-sm" data-dref title="Muat ulang">${ic('refresh-cw', 'ic-sm')}</button></div>
            <div style="padding:12px 24px 0"><label class="ig">${ic('search')}<input class="input" data-dq placeholder="Cari nomor / judul…" aria-label="Cari dokumen"></label></div><div data-docs></div></div>
        </div>
      </div>`;
    const st = { q: 'Review', pilih: new Set(), th: hariIni().slice(0, 4), dq: '' };
    el._st = st;
    $('[data-sync]', el).onclick = () => syncRows(true);
    $('[data-qseg]', el).onclick = e => { const b = e.target.closest('[data-q]'); if (!b) return; st.q = b.dataset.q; st.pilih.clear(); $$('[data-q]', el).forEach(x => x.classList.toggle('on', x === b)); renderMatriks(el); };
    $('[data-th]', el).onchange = e => { st.th = e.target.value; renderMatriks(el); };
    $('[data-mtx]', el).onclick = e => {
      const c = e.target.closest('[data-cell]'); if (!c) return;
      const [j, s] = c.dataset.cell.split('|'), u = AppState.ui;
      u.jenis = j; u.per[j] = '*'; u.status = s ? [s] : []; u.unit = ''; u.q = ''; u.page = 1; saveUi();
      go('#/jenis/' + j);
    };
    $('[data-queue]', el).addEventListener('click', e => {
      const b = e.target.closest('[data-qa]'); const cb = e.target.closest('[data-cb]');
      if (cb) { cb.checked ? st.pilih.add(cb.dataset.cb) : st.pilih.delete(cb.dataset.cb); renderQueueBar(el); return; }
      if (!b) return;
      const id = b.closest('[data-id]').dataset.id;
      if (b.dataset.qa === 'edit') return openForm(AppState.rows.find(r => r.id === id));
      ubahStatus([id], b.dataset.qa);
    });
    $('[data-qbar]', el).addEventListener('click', e => {
      const b = e.target.closest('[data-bulk]'); const all = e.target.closest('[data-all]');
      if (all) { const ids = antrean(st).map(r => r.id); if (all.checked) ids.forEach(i => st.pilih.add(i)); else st.pilih.clear(); renderMatriks(el); return; }
      if (b && st.pilih.size) { ubahStatus([...st.pilih], b.dataset.bulk); st.pilih.clear(); }
    });
    $('[data-vform]', el).onsubmit = async e => {
      e.preventDefault();
      const raw = $('[data-vk]', el).value.trim(), k = (raw.match(/[?&]k=([A-Za-z0-9-]+)/) || [])[1] || raw;
      if (!k) return;
      const box = $('[data-vres]', el), btn = e.submitter;
      busyBtn(btn, true);
      const res = await api('verify', { k });
      busyBtn(btn, false);
      box.innerHTML = res.success ? hasilVerifHtml(res.data) : `<div class="callout err">${ic('circle-x')}<div><b>Tidak ditemukan.</b> ${esc(res.message)}</div></div>`;
    };
    $('[data-dref]', el).onclick = () => muatCache('dokumen', 'dokumenList', 0, true).then(() => renderDocs(el));
    $('[data-dq]', el).addEventListener('input', debounce(e => { st.dq = e.target.value; renderDocs(el); }, 200));
    $('[data-docs]', el).addEventListener('click', e => {
      const b = e.target.closest('[data-da]'); if (!b) return;
      const d = (AppState.dokumen || []).find(x => x.kode === b.dataset.kode);
      if (b.dataset.da === 'link') salin(urlVerifikasi() + '?k=' + d.kode);
      if (b.dataset.da === 'tarik') openTarik(d);
    });
    Bus.on('rows', () => { if (!el.hidden) renderMatriks(el); });
    Bus.on('dokumen', () => { if (!el.hidden) { muatCache('dokumen', 'dokumenList', 0, true); renderDocs(el); } });
  },
  show(el) { renderMatriks(el); renderDocs(el); syncRows(); muatCache('dokumen', 'dokumenList', 60000).then(() => renderDocs(el)); }
});

function antrean(st) { return AppState.rows.filter(r => r.status === st.q && !r._pending).sort(URUT.waktu); }
function renderMatriks(el) {
  const st = el._st, rowsTh = AppState.rows.filter(r => r.tgl.slice(0, 4) === st.th);
  const tahun = [...new Set(AppState.rows.map(r => r.tgl.slice(0, 4)).concat([hariIni().slice(0, 4)]))].sort().reverse();
  $('[data-th]', el).innerHTML = tahun.map(t => `<option ${t === st.th ? 'selected' : ''}>${t}</option>`).join('');
  const menunggu = rowsTh.filter(r => ['Draf', 'Review', 'Revisi'].includes(r.status)).length;
  const terbit = (AppState.dokumen || []).filter(d => d.status === 'TERBIT').length;
  $('[data-kpi]', el).innerHTML = [
    ['calendar-check', 'Total kegiatan ' + st.th, rowsTh.length, ''],
    ['wallet', 'Total anggaran ' + st.th, fmtRpSingkat(rowsTh.reduce((a, r) => a + r.anggaran, 0)), ''],
    ['hourglass', 'Menunggu verifikasi', menunggu, 'background:var(--warn-t);color:var(--warn)'],
    ['badge-check', 'Dokumen terbit', AppState.dokumen ? terbit : '…', 'background:var(--ok-t);color:var(--ok)']
  ].map(k => `<div class="card kpi"><div class="k-ico" style="${k[3]}">${ic(k[0])}</div><small>${esc(k[1])}</small><b class="num">${esc(k[2])}</b></div>`).join('');

  const maks = Math.max(1, ...JENIS.flatMap(j => STATUS.map(s => rowsTh.filter(r => r.jenis === j && r.status === s).length)));
  $('[data-mtx]', el).innerHTML = `<table class="mtx"><thead><tr><th>Jenis</th>${STATUS.map(s => `<th>${s}</th>`).join('')}<th>Total</th><th style="text-align:right">Anggaran</th></tr></thead><tbody>
    ${JENIS.map(j => { const rj = rowsTh.filter(r => r.jenis === j); return `<tr class="j-${j}"><td><span class="pill pill-j">${j}</span></td>${STATUS.map(s => { const n = rj.filter(r => r.status === s).length; const a = n / maks; return `<td class="cell ${n ? '' : 'zero'}" data-cell="${j}|${s}" title="Buka ${j} berstatus ${s}"><span class="heat" style="background:rgba(79,70,229,${n ? 0.06 + a * 0.3 : 0})">${n}</span></td>`; }).join('')}<td class="cell" data-cell="${j}|"><b>${rj.length}</b></td><td class="num" style="text-align:right;font-weight:700">${fmtRpSingkat(rj.reduce((a, r) => a + r.anggaran, 0))}</td></tr>`; }).join('')}
    <tr><td><b>Total</b></td>${STATUS.map(s => `<td><b>${rowsTh.filter(r => r.status === s).length}</b></td>`).join('')}<td><b>${rowsTh.length}</b></td><td class="num" style="text-align:right;font-weight:800">${fmtRpSingkat(rowsTh.reduce((a, r) => a + r.anggaran, 0))}</td></tr></tbody></table>`;

  const q = antrean(st);
  [...st.pilih].forEach(id => { if (!q.some(r => r.id === id)) st.pilih.delete(id); });
  $('[data-queue]', el).innerHTML = q.length ? q.slice(0, 50).map(r => `<div class="qitem j-${r.jenis}" data-id="${esc(r.id)}">
      <input type="checkbox" class="check" style="width:18px;height:18px;margin-top:3px;accent-color:var(--pri)" data-cb="${esc(r.id)}" ${st.pilih.has(r.id) ? 'checked' : ''} aria-label="Pilih">
      <div class="q-main"><b>${esc(r.kegiatan)}</b><div class="row row-wrap small muted" style="gap:10px;margin-top:4px"><span class="pill pill-j">${r.jenis}</span><span>${esc(waktuLabel(r))}</span><span class="num">${fmtRp(r.anggaran)}</span></div></div>
      <div class="q-act"><button class="btn btn-sm btn-ok" data-qa="Disetujui" title="Setujui">${ic('check', 'ic-sm')}<span class="hide-xs">Setujui</span></button>${st.q !== 'Revisi' ? `<button class="btn btn-sm btn-sec" data-qa="Revisi" title="Minta revisi">${ic('rotate-ccw', 'ic-sm')}</button>` : `<button class="btn btn-sm btn-sec" data-qa="Review" title="Kirim ke review">${ic('send', 'ic-sm')}</button>`}<button class="btn-icon i-pri" data-qa="edit" title="Ubah">${ic('square-pen')}</button></div></div>`).join('') + (q.length > 50 ? `<div class="list-empty small">+${q.length - 50} lainnya — buka tabel untuk melihat semua.</div>` : '')
    : `<div class="list-empty">${ic('circle-check')} Tidak ada rengiat berstatus ${esc(st.q)}.</div>`;
  renderQueueBar(el);
}
function renderQueueBar(el) {
  const st = el._st, q = antrean(st);
  $('[data-qbar]', el).innerHTML = q.length ? `<div class="row" style="padding:12px 24px;border-bottom:1px solid var(--line);background:#FBFBFE">
    <label class="check small"><input type="checkbox" data-all ${st.pilih.size && st.pilih.size === Math.min(q.length, 50) ? 'checked' : ''}> Pilih semua (${q.length})</label><span class="spacer"></span>
    <button class="btn btn-sm btn-ok" data-bulk="Disetujui" ${st.pilih.size ? '' : 'disabled'}>${ic('check-check', 'ic-sm')} Setujui ${st.pilih.size || ''}</button>
    <button class="btn btn-sm btn-sec" data-bulk="Revisi" ${st.pilih.size ? '' : 'disabled'}>Minta revisi</button></div>` : '';
}

/** Optimistic: status langsung berubah di layar, dikembalikan bila server menolak. */
async function ubahStatus(ids, status) {
  const lama = {};
  AppState.rows = AppState.rows.map(r => { if (!ids.includes(r.id)) return r; lama[r.id] = r; return Object.assign({}, r, { status }); });
  persistRows(); Bus.emit('rows');
  const res = await withPending(api('rengiatStatus', { ids, status }));
  if (res.success) { AppState.lastSync = 0; toast('success', 'Status diperbarui', res.message); }
  else { AppState.rows = AppState.rows.map(r => lama[r.id] || r); persistRows(); Bus.emit('rows'); toast('error', 'Gagal mengubah status', res.message + ' Perubahan dibatalkan.'); }
}

function hasilVerifHtml(d) {
  const sah = d.status === 'TERBIT';
  return `<div class="callout ${sah ? 'ok' : 'err'}">${ic(sah ? 'shield-check' : 'shield-x')}<div><b>${sah ? 'Dokumen SAH' : 'Dokumen DITARIK'}</b> — ${esc(d.nomor)}<br>${esc(d.judul)}<br><span class="small">${esc(d.jumlah)} kegiatan • ${fmtRp(d.total)} • terbit ${esc(waktuRelatif(d.terbit))}</span>${d.alasan ? `<br><span class="small">Alasan: ${esc(d.alasan)}</span>` : ''}
    ${(d.penandatangan || []).map(p => `<br><span class="small">${ic('pen-tool', 'ic-sm')} ${esc(p.nama)} — ${esc(p.jabatan)}</span>`).join('')}</div></div>`;
}
function renderDocs(el) {
  const st = el._st, box = $('[data-docs]', el);
  if (!AppState.dokumen) { box.innerHTML = '<div style="padding:16px 24px">' + '<div class="sk" style="height:48px;margin:8px 0"></div>'.repeat(3) + '</div>'; return; }
  const t = norm(st.dq), list = AppState.dokumen.filter(d => !t || norm(d.nomor + ' ' + d.judul + ' ' + d.kode).includes(t)).slice(0, 30);
  box.innerHTML = list.length ? list.map(d => `<div class="qitem"><div class="q-main"><b>${esc(d.judul || d.templateNama)}</b>
      <div class="row row-wrap xs muted" style="gap:8px;margin-top:4px"><span class="mono">${esc(d.nomor)}</span><span class="badge s-${esc(d.status)}">${esc(d.status)}</span><span>${esc(waktuRelatif(d.dibuat))}</span><span>${esc(String(d.format || '').toUpperCase())}</span></div></div>
      <div class="q-act">${d.status === 'TERBIT' || d.status === 'DITARIK' ? `<button class="btn-icon" data-da="link" data-kode="${esc(d.kode)}" title="Salin tautan verifikasi">${ic('link')}</button>` : ''}${d.berkasUrl ? `<a class="btn-icon" href="${esc(d.berkasUrl)}" target="_blank" rel="noopener" title="Buka arsip di Drive">${ic('external-link')}</a>` : ''}${d.status === 'TERBIT' ? `<button class="btn-icon i-err" data-da="tarik" data-kode="${esc(d.kode)}" title="Tarik kembali">${ic('undo-2')}</button>` : ''}</div></div>`).join('')
    : `<div class="list-empty">${ic('inbox')} ${st.dq ? 'Tidak ada dokumen yang cocok.' : 'Belum ada dokumen terbit. Gunakan tombol Cetak PDF di Daftar Rengiat.'}</div>`;
  const k = $('[data-kpi] .kpi:last-child b', el); if (k) k.textContent = AppState.dokumen.filter(d => d.status === 'TERBIT').length;
}
function openTarik(d) {
  openModal({
    size: 'sm',
    html: `<div class="modal-body" style="padding-top:28px"><div class="modal-ico red">${ic('undo-2')}</div><h3>Tarik kembali dokumen?</h3>
      <p class="muted" style="margin:8px 0 16px">${esc(d.nomor)} akan berstatus <b>DITARIK</b>. Siapa pun yang memindai QR-nya akan melihat dokumen ini tidak lagi berlaku.</p>
      <div class="field"><label for="f-alasan">Alasan penarikan <span class="req">*</span></label><textarea class="textarea" id="f-alasan" style="min-height:80px" placeholder="Contoh: salah periode, diganti dokumen DOK-…" autofocus></textarea></div></div>
      <div class="modal-foot"><button class="btn btn-sec" data-close>Batal</button><button class="btn btn-danger" data-ok>Tarik Dokumen</button></div>`,
    onMount(m, close) {
      $('[data-ok]', m).onclick = async e => {
        const alasan = $('#f-alasan', m).value.trim();
        if (alasan.length < 5) return toast('warn', 'Alasan terlalu singkat', 'Tulis minimal 5 karakter.');
        busyBtn(e.currentTarget, true);
        const res = await withPending(api('dokumenTarik', { kode: d.kode, alasan }));
        busyBtn(e.currentTarget, false);
        if (res.success) { cacheSet('dokumen', res.data); Bus.emit('dokumen'); close(); toast('success', 'Dokumen ditarik', d.nomor); }
        else toast('error', 'Gagal', res.message);
      };
    }
  });
}

// =====================================================================
// TEMPLATE DOKUMEN (DocEngine)
// =====================================================================
const ENG = { docs: ['file-text', 'Google Docs'], sheets: ['sheet', 'Google Sheets'], slides: ['presentation', 'Google Slides'] };
const PLACEHOLDER = [
  ['{{#RENGIAT}}', 'Tandai 1 baris tabel → diulang per kegiatan'], ['{{RENGIAT.WAKTU}}', 'Tanggal + jam'], ['{{RENGIAT.KEGIATAN}}', 'Nama kegiatan'],
  ['{{RENGIAT.LOKASI}}', 'Lokasi'], ['{{RENGIAT.SASARAN}}', 'Sasaran'], ['{{RENGIAT.PERSONIL}}', 'Personil'], ['{{RENGIAT.SARPRAS}}', 'Sarpras'],
  ['{{RENGIAT.ANGGARAN|ribuan}}', '4.250.000'], ['{{RENGIAT.KETERANGAN}}', 'Keterangan'], ['{{NO}}', 'Nomor urut baris'],
  ['{{TOTAL_ANGGARAN|rupiah}}', 'Rp10.800.000'], ['{{TOTAL_ANGGARAN|terbilang:rupiah}}', 'Sepuluh juta … rupiah'], ['{{JUMLAH_KEGIATAN}}', 'Banyak kegiatan'],
  ['{{JENIS|kapital}}', 'BULANAN'], ['{{PERIODE}}', 'Oktober 2026'], ['{{PERIODE_LABEL}}', 'Bulan: … • Tahun Anggaran …'], ['{{NOMOR}}', 'DOK-RGT-…'],
  ['{{TANGGAL}}', '12 Oktober 2026'], ['{{TANGGAL_CETAK}}', 'Tanggal + jam cetak'], ['{{KOTA}}', 'Kota TTD'], ['{{INSTITUSI_NAMA|kapital}}', 'Nama instansi'],
  ['{{NAMA_PEJABAT_1}}', 'Nama penanda tangan 1'], ['{{JABATAN_1}}', 'Jabatan'], ['{{NIP_1}}', 'NIP'], ['{{TTD_1}}', 'QR eTTD / ruang kosong'],
  ['{{QR}}', 'QR verifikasi dokumen'], ['{{KODE_VERIFIKASI}}', 'Kode 16 karakter'], ['{{PERIHAL}}', 'Kolom bebas → otomatis jadi isian form'],
  ['{{TGL_RAPAT}}', 'Awalan TGL_ → pemilih tanggal'], ['{{?TEMBUSAN}}…{{/TEMBUSAN}}', 'Dihapus bila kosong']
];
registerPage('dokumen', {
  title: () => 'Template Dokumen',
  init(el) {
    el.innerHTML = `
      <div class="page-head"><div><span class="eyebrow">Doc Engine</span><h1 style="margin-top:6px">Template Dokumen</h1>
        <div class="sub">Rancang dokumen sendiri di Google Docs, Sheets, atau Slides memakai penanda <span class="mono">{{…}}</span>. Sistem memindai penanda, membuat formulir isian, lalu menerbitkan dokumen bernomor dengan QR verifikasi.</div></div>
        <button class="btn btn-pri" data-add>${ic('file-plus')} Daftarkan Template</button></div>
      <div class="tpl-grid" data-tpl></div>
      <div class="two-col" style="margin-top:22px">
        <div class="card"><div class="card-head"><h3>${ic('stamp')} Pejabat Penanda Tangan</h3><button class="btn btn-soft btn-sm" data-pj-add>${ic('user-plus', 'ic-sm')} Tambah</button></div><div class="tscroll" data-pj></div></div>
        <div class="card"><div class="card-head"><h3>${ic('braces')} Daftar Penanda</h3><span class="hint">Klik untuk menyalin</span></div><div class="card-body"><div class="ph-list">${PLACEHOLDER.map(p => `<div class="ph" data-copy="${esc(p[0])}"><code>${esc(p[0])}</code><span>${esc(p[1])}</span></div>`).join('')}</div>
          <p class="hint" style="margin-top:14px">Pengubah: <span class="mono">|kapital |judul |kecil |rupiah |ribuan |terbilang |tanggal |bawaan:teks</span>. Teks pengganti mewarisi huruf, ukuran, dan tebal dari penandanya di template.</p></div></div>
      </div>`;
    $('[data-add]', el).onclick = () => openDaftarTemplate();
    $('[data-pj-add]', el).onclick = () => openPejabat(null);
    $('.ph-list', el).onclick = e => { const p = e.target.closest('[data-copy]'); if (p) salin(p.dataset.copy); };
    $('[data-tpl]', el).addEventListener('click', async e => {
      if (e.target.closest('[data-add-card]')) return openDaftarTemplate();
      const b = e.target.closest('[data-ta]'); if (!b) return;
      const t = AppState.templates.find(x => x.id === b.closest('[data-tid]').dataset.tid);
      const a = b.dataset.ta;
      if (a === 'buat') openCetak({ templateId: t.id });
      if (a === 'atur') openAturTemplate(t);
      if (a === 'pindai') { busyBtn(b, true); const r = await withPending(api('deScan', { id: t.id })); busyBtn(b, false); if (r.success) { setTemplate(r.data.template); toast('success', 'Template dipindai ulang', r.message + (r.data.hilang.length ? ' Kolom hilang: ' + r.data.hilang.join(', ') : '')); } else toast('error', 'Gagal memindai', r.message); }
      if (a === 'aktif') { const r = await withPending(api('deSave', { id: t.id, aktif: !t.aktif })); if (r.success) { applyBoot({ templates: r.data }); renderTpl(el); } else toast('error', 'Gagal', r.message); }
      if (a === 'hapus' && await konfirmasi({ judul: 'Hapus template?', pesan: `“${esc(t.nama)}” dihapus dari daftar. Berkas di Google Drive tetap ada.`, tombol: 'Hapus', bahaya: true, icon: 'trash-2' })) {
        const r = await withPending(api('deDelete', { id: t.id })); if (r.success) { applyBoot({ templates: r.data }); renderTpl(el); toast('success', 'Template dihapus'); } else toast('error', 'Gagal', r.message);
      }
    });
    $('[data-pj]', el).addEventListener('click', async e => {
      const b = e.target.closest('[data-pa]'); if (!b) return;
      const p = AppState.pejabat.find(x => x.id === b.closest('[data-pid]').dataset.pid);
      if (b.dataset.pa === 'edit') openPejabat(p);
      if (b.dataset.pa === 'del' && await konfirmasi({ judul: 'Hapus pejabat?', pesan: esc(p.nama) + ' tidak bisa dipilih lagi sebagai penanda tangan.', tombol: 'Hapus', bahaya: true, icon: 'user-x' })) {
        const r = await withPending(api('pejabatDelete', { id: p.id })); if (r.success) { applyBoot({ pejabat: r.data }); renderTpl(el); } else toast('error', 'Gagal', r.message);
      }
    });
    Bus.on('boot', () => { if (!el.hidden) renderTpl(el); });
  },
  show(el) { renderTpl(el); syncBoot(); }
});
function setTemplate(t) { const arr = AppState.templates.filter(x => x.id !== t.id); arr.push(t); arr.sort((a, b) => (a.id === 'DEFAULT' ? -1 : b.id === 'DEFAULT' ? 1 : a.nama.localeCompare(b.nama))); applyBoot({ templates: arr }); }
function renderTpl(el) {
  $('[data-tpl]', el).innerHTML = AppState.templates.map(t => {
    const e = ENG[t.engine] || ENG.docs, form = (t.bidang || []).filter(b => !b.sumber);
    return `<div class="card tpl" data-tid="${esc(t.id)}" style="${t.aktif ? '' : 'opacity:.6'}">
      <div class="row" style="align-items:flex-start"><span class="t-ico eng-${esc(t.engine)}">${ic(e[0])}</span><div style="flex:1;min-width:0"><h4>${esc(t.nama)}</h4><div class="xs muted">${esc(e[1])} • kode ${esc(t.kode)} • versi ${t.versi}</div></div>
        <label class="switch" title="${t.aktif ? 'Aktif' : 'Nonaktif'}"><input type="checkbox" data-ta="aktif" ${t.aktif ? 'checked' : ''} aria-label="Aktifkan template"><span></span></label></div>
      <div class="t-meta">${t.adaRengiat ? '<span class="pill pill-pri">Tabel rengiat</span>' : ''}<span class="pill pill-mute">${form.length} isian</span><span class="pill pill-mute">${(t.slot || []).length} penanda tangan</span><span class="pill pill-mute">${(t.keluaran || []).map(x => x.toUpperCase()).join(' / ')}</span><span class="pill pill-mute">${t.tandaTangan === 'kosong' ? 'TTD basah' : 'QR eTTD'}</span></div>
      <div class="t-act"><button class="btn btn-pri btn-sm" data-ta="buat" ${t.aktif ? '' : 'disabled'}>${ic('file-output', 'ic-sm')} Buat Dokumen</button><button class="btn btn-sec btn-sm" data-ta="atur">${ic('settings-2', 'ic-sm')} Atur</button>
        <button class="btn-icon" data-ta="pindai" title="Pindai ulang placeholder">${ic('refresh-cw')}</button>${t.url ? `<a class="btn-icon" href="${esc(t.url)}" target="_blank" rel="noopener" title="Buka & edit di Google">${ic('external-link')}</a>` : ''}${t.id !== 'DEFAULT' ? `<button class="btn-icon i-err" data-ta="hapus" title="Hapus dari daftar">${ic('trash-2')}</button>` : ''}</div></div>`;
  }).join('') + `<button class="card tpl add-card" data-add-card><span class="t-ico" style="background:#fff;color:var(--pri)">${ic('plus')}</span><b>Daftarkan template baru</b><span class="small muted">Tempel URL Google Docs, Sheets, atau Slides berisi penanda {{…}}</span></button>`;
  $('[data-pj]', el).innerHTML = `<table class="simple"><thead><tr><th>Nama</th><th>Jabatan</th><th>NIP</th><th></th></tr></thead><tbody>
    <tr><td><b>${esc(AppState.settings.PENANDATANGAN_NAMA || '-')}</b><div class="xs muted">Bawaan dari Pengaturan</div></td><td>${esc(AppState.settings.PENANDATANGAN_JABATAN || '')}</td><td class="mono">${esc(AppState.settings.PENANDATANGAN_NIP || '')}</td><td style="text-align:right"><a class="btn-icon" href="#/sistem/instansi" title="Ubah di Pengaturan">${ic('square-pen')}</a></td></tr>
    ${AppState.pejabat.map(p => `<tr data-pid="${esc(p.id)}" style="${p.aktif ? '' : 'opacity:.55'}"><td><b>${esc([p.nama, p.gelar].filter(Boolean).join(', '))}</b>${p.aktif ? '' : '<div class="xs muted">Nonaktif</div>'}</td><td>${esc(p.jabatan)}</td><td class="mono">${esc(p.nip)}</td><td style="text-align:right;white-space:nowrap"><button class="btn-icon i-pri" data-pa="edit" title="Ubah">${ic('square-pen')}</button><button class="btn-icon i-err" data-pa="del" title="Hapus">${ic('trash-2')}</button></td></tr>`).join('')}</tbody></table>`;
}
function openDaftarTemplate() {
  openModal({
    size: 'lg',
    html: `${modalHead('Daftarkan Template', 'Template dibaca langsung dari Google Drive akun pemilik aplikasi. Master template tidak pernah diubah — setiap dokumen dibuat dari salinannya.', `<div class="modal-ico pri">${ic('file-plus')}</div>`)}
      <div class="modal-body"><div class="form-stack">
        <div class="callout">${ic('lightbulb')}<div><b>Cara cepat:</b> buka template standar (tombol ${ic('external-link', 'ic-sm')} pada kartu “Rengiat Standar”), <i>File → Buat salinan</i>, ubah tata letaknya, lalu tempel URL salinan itu di sini. Kolom bebas seperti <span class="mono">{{PERIHAL}}</span> otomatis menjadi isian form.</div></div>
        <div class="field"><label for="t-url">URL Google Docs / Sheets / Slides <span class="req">*</span></label><div class="ig">${ic('link')}<input class="input" id="t-url" placeholder="https://docs.google.com/document/d/…/edit" autofocus></div></div>
        <div class="grid-2"><div class="field"><label for="t-nama">Nama template</label><input class="input" id="t-nama" placeholder="Contoh: Nota Dinas Rapat"></div>
          <div class="field"><label for="t-kode">Kode singkat</label><input class="input" id="t-kode" placeholder="ND-RAPAT" maxlength="30"></div></div>
        <div data-res></div></div></div>
      <div class="modal-foot"><button class="btn btn-sec" data-close>Batal</button><button class="btn btn-pri" data-ok>${ic('scan-search')} Pindai Template</button></div>`,
    onMount(m, close) {
      $('[data-ok]', m).onclick = async e => {
        const url = $('#t-url', m).value.trim();
        if (!/[-\w]{25,}/.test(url)) return ($('[data-res]', m).innerHTML = `<div class="callout err">${ic('circle-alert')}<div>Tempel URL berkas Google yang valid.</div></div>`);
        busyBtn(e.currentTarget, true, 'Memindai…');
        const r = await withPending(api('deScan', { url, nama: $('#t-nama', m).value.trim(), kode: $('#t-kode', m).value.trim() }));
        busyBtn(e.currentTarget, false);
        if (!r.success) return ($('[data-res]', m).innerHTML = `<div class="callout err">${ic('circle-alert')}<div>${esc(r.message)}</div></div>`);
        setTemplate(r.data.template);
        close();
        toast('success', 'Template terdaftar', r.message);
        openAturTemplate(r.data.template);
      };
    }
  });
}
function openAturTemplate(t) {
  const bidang = JSON.parse(JSON.stringify(t.bidang || [])), slot = JSON.parse(JSON.stringify(t.slot || []));
  const keluar = { docs: ['pdf', 'docx'], sheets: ['pdf', 'xlsx'], slides: ['pdf', 'png', 'pptx'] }[t.engine] || ['pdf'];
  const TIPE = [['teks', 'Teks singkat'], ['area', 'Teks panjang'], ['naskah', 'Naskah (format)'], ['tanggal', 'Tanggal'], ['angka', 'Angka'], ['pilihan', 'Pilihan']];
  openModal({
    size: 'xl',
    html: `${modalHead('Atur Template', esc(t.nama) + ' • ' + esc((ENG[t.engine] || ENG.docs)[1]))}
      <div class="modal-body"><div class="form-stack">
        <div class="grid-2"><div class="field"><label for="a-nama">Nama</label><input class="input" id="a-nama" value="${esc(t.nama)}"></div><div class="field"><label for="a-kode">Kode</label><input class="input" id="a-kode" value="${esc(t.kode)}"></div></div>
        <div><div class="lbl" style="margin-bottom:8px">Kolom isian form</div>
          ${bidang.filter(b => !b.sumber).length ? `<div class="card" style="box-shadow:none;overflow:auto"><table class="simple" data-bid><thead><tr><th>Penanda</th><th>Label di form</th><th>Tipe</th><th>Wajib</th><th>Opsi / bantuan</th><th></th></tr></thead><tbody>
          ${bidang.map((b, i) => b.sumber ? '' : b.tipe === 'daftar' ? `<tr data-i="${i}"><td class="mono">{{#${esc(b.kunci)}}}</td><td><input class="input" style="height:38px" data-f="label" value="${esc(b.label)}"></td><td colspan="2"><span class="pill pill-mute">Tabel: ${esc((b.kolom || []).map(k => k.kunci).join(', '))}</span></td><td></td><td></td></tr>`
            : `<tr data-i="${i}"><td class="mono">{{${esc(b.kunci)}}}</td><td><input class="input" style="height:38px;min-width:160px" data-f="label" value="${esc(b.label)}"></td>
              <td><select class="select" style="height:38px;min-width:150px" data-f="tipe">${TIPE.map(x => `<option value="${x[0]}" ${x[0] === b.tipe ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></td>
              <td style="text-align:center"><input type="checkbox" data-f="wajib" ${b.wajib ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--pri)"></td>
              <td><input class="input" style="height:38px;min-width:180px" data-f="${b.tipe === 'pilihan' ? 'opsi' : 'bantu'}" placeholder="${b.tipe === 'pilihan' ? 'Opsi dipisah koma' : 'Teks bantuan (opsional)'}" value="${esc(b.tipe === 'pilihan' ? (b.opsi || []).join(', ') : b.bantu || '')}"></td>
              <td style="white-space:nowrap"><button class="btn-icon" data-mv="-1" title="Naik">${ic('arrow-up')}</button><button class="btn-icon" data-mv="1" title="Turun">${ic('arrow-down')}</button></td></tr>`).join('')}</tbody></table></div>`
          : `<div class="callout">${ic('info')}<div>Template ini tidak punya kolom isian bebas — semua penanda diisi otomatis dari data rengiat, pengaturan, dan penanda tangan.</div></div>`}</div>
        ${slot.length ? `<div><div class="lbl" style="margin-bottom:8px">Penanda tangan</div><div class="grid-2">${slot.map((s, i) => `<div class="card" style="padding:14px;box-shadow:none" data-s="${i}"><div class="xs muted" style="margin-bottom:8px">Slot ${s.slot} • ${esc(s.penanda.join(', '))}</div>
            <div class="field"><input class="input" data-sf="label" value="${esc(s.label)}" aria-label="Label slot"><select class="select" data-sf="pejabatId"><option value="">Bawaan dari Pengaturan</option>${AppState.pejabat.map(p => `<option value="${esc(p.id)}" ${p.id === s.pejabatId ? 'selected' : ''}>${esc(p.nama)} — ${esc(p.jabatan)}</option>`).join('')}</select></div></div>`).join('')}</div></div>` : ''}
        <div class="grid-2">
          <div class="field"><span class="lbl">Isi {{TTD_n}}</span><div class="seg" data-ttd><button type="button" class="${t.tandaTangan !== 'kosong' ? 'on' : ''}" data-v="qr">${ic('qr-code', 'ic-sm')} QR tanda tangan elektronik</button><button type="button" class="${t.tandaTangan === 'kosong' ? 'on' : ''}" data-v="kosong">${ic('pen-line', 'ic-sm')} Ruang TTD basah</button></div></div>
          <div class="field"><span class="lbl">Format keluaran</span><div class="row row-wrap">${keluar.map(f => `<label class="check"><input type="checkbox" data-out="${f}" ${(t.keluaran || []).includes(f) ? 'checked' : ''}> ${f.toUpperCase()}</label>`).join('')}</div></div>
        </div>
        <div class="callout">${ic('info')}<div class="small">Mengubah tata letak dokumen dilakukan langsung di Google ${esc((ENG[t.engine] || ENG.docs)[1].split(' ')[1])}. Setelah menambah/menghapus penanda, tekan <b>Pindai ulang</b> — setelan di halaman ini tetap dipertahankan.</div></div>
      </div></div>
      <div class="modal-foot">${t.url ? `<a class="btn btn-ghost" style="margin-right:auto" href="${esc(t.url)}" target="_blank" rel="noopener">${ic('external-link')} Buka template</a>` : ''}<button class="btn btn-sec" data-close>Batal</button><button class="btn btn-pri" data-ok>${ic('save')} Simpan Setelan</button></div>`,
    onMount(m, close) {
      let ttd = t.tandaTangan || 'qr';
      const tb = $('[data-bid] tbody', m);
      if (tb) tb.addEventListener('click', e => {
        const b = e.target.closest('[data-mv]'); if (!b) return;
        const tr = b.closest('tr'), sib = b.dataset.mv === '-1' ? tr.previousElementSibling : tr.nextElementSibling;
        if (sib) b.dataset.mv === '-1' ? tb.insertBefore(tr, sib) : tb.insertBefore(sib, tr);
      });
      if (tb) tb.addEventListener('change', e => { if (e.target.dataset.f === 'tipe') { const inp = $('[data-f="opsi"],[data-f="bantu"]', e.target.closest('tr')); inp.dataset.f = e.target.value === 'pilihan' ? 'opsi' : 'bantu'; inp.placeholder = e.target.value === 'pilihan' ? 'Opsi dipisah koma' : 'Teks bantuan (opsional)'; } });
      $('[data-ttd]', m).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; ttd = b.dataset.v; $$('[data-v]', m).forEach(x => x.classList.toggle('on', x === b)); };
      $('[data-ok]', m).onclick = async e => {
        const urutan = tb ? $$('tr', tb).map(tr => +tr.dataset.i) : [];
        const baru = urutan.map(i => {
          const b = Object.assign({}, bidang[i]), tr = $(`tr[data-i="${i}"]`, tb);
          const v = f => { const x = $(`[data-f="${f}"]`, tr); return x ? (x.type === 'checkbox' ? x.checked : x.value) : undefined; };
          if (v('label') !== undefined) b.label = v('label');
          if (b.tipe !== 'daftar') { b.tipe = v('tipe'); b.wajib = v('wajib'); if (b.tipe === 'pilihan') b.opsi = String(v('opsi') || '').split(',').map(s => s.trim()).filter(Boolean); else b.bantu = v('bantu') || ''; }
          return b;
        }).concat(bidang.filter(b => b.sumber));
        const sl = slot.map((s, i) => Object.assign({}, s, { label: $(`[data-s="${i}"] [data-sf="label"]`, m).value, pejabatId: $(`[data-s="${i}"] [data-sf="pejabatId"]`, m).value }));
        const out = $$('[data-out]:checked', m).map(x => x.dataset.out);
        if (!out.length) return toast('warn', 'Pilih format', 'Minimal satu format keluaran.');
        busyBtn(e.currentTarget, true, 'Menyimpan…');
        const r = await withPending(api('deSave', { id: t.id, nama: $('#a-nama', m).value.trim(), kode: $('#a-kode', m).value.trim(), bidang: baru, slot: sl, tandaTangan: ttd, keluaran: out }));
        busyBtn(e.currentTarget, false);
        if (r.success) { applyBoot({ templates: r.data }); close(); toast('success', 'Setelan template tersimpan'); }
        else toast('error', 'Gagal menyimpan', r.message);
      };
    }
  });
}
function openPejabat(p) {
  const d = p || { nama: '', gelar: '', nip: '', jabatan: '', aktif: true };
  openModal({
    html: `${modalHead(p ? 'Ubah Pejabat' : 'Tambah Pejabat', 'Pejabat dapat dipilih sebagai penanda tangan saat mencetak dokumen.')}
      <form class="modal-body form-stack" data-f novalidate>
        <div class="field"><label for="p-nama">Nama lengkap <span class="req">*</span></label><input class="input" id="p-nama" name="nama" value="${esc(d.nama)}" autofocus></div>
        <div class="grid-2"><div class="field"><label for="p-gelar">Gelar belakang</label><input class="input" id="p-gelar" name="gelar" value="${esc(d.gelar)}" placeholder="S.Sos., M.Si"></div>
          <div class="field"><label for="p-nip">NIP</label><input class="input" id="p-nip" name="nip" inputmode="numeric" value="${esc(d.nip)}"></div></div>
        <div class="field"><label for="p-jab">Jabatan <span class="req">*</span></label><input class="input" id="p-jab" name="jabatan" value="${esc(d.jabatan)}" placeholder="Kepala Dinas"></div>
        <label class="check"><input type="checkbox" name="aktif" ${d.aktif ? 'checked' : ''}> Aktif (dapat dipilih)</label></form>
      <div class="modal-foot"><button class="btn btn-sec" data-close>Batal</button><button class="btn btn-pri" data-ok>${ic('save')} Simpan</button></div>`,
    onMount(m, close) {
      $('[data-ok]', m).onclick = async e => {
        const f = $('[data-f]', m), data = { id: p ? p.id : '', nama: f.nama.value.trim(), gelar: f.gelar.value.trim(), nip: f.nip.value.trim(), jabatan: f.jabatan.value.trim(), aktif: f.aktif.checked };
        if (!data.nama || !data.jabatan) return toast('warn', 'Lengkapi data', 'Nama dan jabatan wajib diisi.');
        busyBtn(e.currentTarget, true);
        const r = await withPending(api('pejabatSave', data));
        busyBtn(e.currentTarget, false);
        if (r.success) { applyBoot({ pejabat: r.data }); close(); toast('success', 'Pejabat tersimpan'); } else toast('error', 'Gagal', r.message);
      };
    }
  });
}

// =====================================================================
// SISTEM
// =====================================================================
const TABS = [['instansi', 'building-2', 'Instansi & Dokumen'], ['pengguna', 'users', 'Pengguna'], ['akun', 'key-round', 'Akun Saya'], ['migrasi', 'database-zap', 'Migrasi Data'], ['log', 'scroll-text', 'Log Aktivitas'], ['performa', 'gauge', 'Performa']];
registerPage('sistem', {
  title: p => 'Sistem' + (p ? ' — ' + ((TABS.find(t => t[0] === p) || [])[2] || '') : ''),
  init(el) {
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Administrasi</span><h1 style="margin-top:6px">Sistem</h1><div class="sub">Pengaturan instansi, akun, migrasi data lama, dan pemantauan.</div></div></div>
      <div class="tabs" role="tablist">${TABS.map(t => `<button role="tab" data-tab="${t[0]}">${ic(t[1], 'ic-sm')} ${t[2]}</button>`).join('')}</div><div data-panel></div>`;
    $('.tabs', el).onclick = e => { const b = e.target.closest('[data-tab]'); if (b) go('#/sistem/' + b.dataset.tab); };
    el._panels = {};
  },
  show(el, p) {
    const tab = TABS.some(t => t[0] === p) ? p : 'instansi';
    $$('[data-tab]', el).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const host = $('[data-panel]', el);
    Object.values(el._panels).forEach(x => { x.hidden = true; });
    if (!el._panels[tab]) { const d = document.createElement('div'); host.appendChild(d); el._panels[tab] = d; PANEL[tab].init(d); }
    el._panels[tab].hidden = false;
    PANEL[tab].show && PANEL[tab].show(el._panels[tab]);
  }
});

const PANEL = {};
PANEL.instansi = {
  init(d) {
    const G = [
      ['Identitas instansi', 'building-2', [['INSTITUSI_INDUK', 'Instansi induk (baris 1 kop)'], ['INSTITUSI_NAMA', 'Nama instansi'], ['INSTITUSI_ALAMAT', 'Alamat'], ['INSTITUSI_KONTAK', 'Telepon / laman'], ['KOTA', 'Kota tanda tangan']]],
      ['Dokumen & penanda tangan', 'file-text', [['JUDUL_DOKUMEN', 'Judul dokumen'], ['PENANDATANGAN_JABATAN', 'Jabatan penanda tangan bawaan'], ['PENANDATANGAN_NAMA', 'Nama penanda tangan bawaan'], ['PENANDATANGAN_NIP', 'NIP'], ['TANDA_TANGAN', 'Isi {{TTD}} pada template standar', [['qr', 'QR tanda tangan elektronik'], ['kosong', 'Ruang kosong untuk TTD basah']]], ['SIMPAN_ARSIP', 'Simpan salinan dokumen terbit di Drive', [['Ya', 'Ya — folder Exports'], ['Tidak', 'Tidak']]], ['URL_VERIFIKASI', 'URL halaman verifikasi (untuk QR)']]],
      ['Data & login', 'key-round', [['UNIT_LIST', 'Daftar unit / bidang (satu per baris)', 'area'], ['GOOGLE_CLIENT_ID', 'Google OAuth Client ID (tombol Masuk dengan Google)']]]
    ];
    d.innerHTML = `<form data-f novalidate><div class="stack">${G.map(g => `<div class="card"><div class="card-head"><h3>${ic(g[1])} ${g[0]}</h3></div><div class="card-body"><div class="grid-2">${g[2].map(f => `<div class="field" ${f[2] === 'area' || f[0] === 'URL_VERIFIKASI' || f[0] === 'GOOGLE_CLIENT_ID' || f[0] === 'INSTITUSI_KONTAK' ? 'style="grid-column:1/-1"' : ''}><label for="s-${f[0]}">${esc(f[1])}</label>
        ${Array.isArray(f[2]) ? `<select class="select" id="s-${f[0]}" name="${f[0]}">${f[2].map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select>` : f[2] === 'area' ? `<textarea class="textarea" id="s-${f[0]}" name="${f[0]}" rows="5"></textarea>` : `<input class="input" id="s-${f[0]}" name="${f[0]}">`}
        ${f[0] === 'URL_VERIFIKASI' ? `<div class="row row-wrap"><span class="hint">Kosongkan agar otomatis memakai alamat aplikasi ini: <span class="mono">${esc(urlVerifikasi())}</span></span><button type="button" class="link-btn xs" data-auto>Isi otomatis</button></div>` : ''}
        ${f[0] === 'GOOGLE_CLIENT_ID' ? `<div class="hint">Buat di Google Cloud Console → APIs &amp; Services → Credentials → OAuth client ID (Web). Tambahkan <span class="mono">${esc(location.origin)}</span> sebagai Authorized JavaScript origin. Kosongkan untuk menyembunyikan tombol Google.</div>` : ''}</div>`).join('')}</div></div></div>`).join('')}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-pri btn-lg" data-ok>${ic('save')} Simpan Pengaturan</button></div></div></form>`;
    $('[data-auto]', d).onclick = () => { $('[name="URL_VERIFIKASI"]', d).value = urlVerifikasi(); };
    $('[data-f]', d).onsubmit = async e => {
      e.preventDefault();
      const s = {}; $$('[name]', d).forEach(x => { s[x.name] = x.name === 'UNIT_LIST' ? x.value.split('\n').map(v => v.trim()).filter(Boolean).join(';') : x.value.trim(); });
      const btn = $('[data-ok]', d); busyBtn(btn, true, 'Menyimpan…');
      const r = await withPending(api('settingsSave', { settings: s }));
      busyBtn(btn, false);
      if (r.success) { applyBoot({ settings: r.data.settings }); renderShell(); toast('success', 'Pengaturan tersimpan', 'Kop dan header aplikasi sudah diperbarui.'); }
      else toast('error', 'Gagal menyimpan', r.message);
    };
  },
  show(d) { const S = AppState.settings; $$('[name]', d).forEach(x => { x.value = x.name === 'UNIT_LIST' ? String(S.UNIT_LIST || '').split(';').join('\n') : (S[x.name] || (x.tagName === 'SELECT' ? x.options[0].value : '')); }); }
};

PANEL.pengguna = {
  init(d) {
    d.innerHTML = `<div class="card"><div class="card-head"><h3>${ic('users')} Administrator</h3><button class="btn btn-pri btn-sm" data-add>${ic('user-plus', 'ic-sm')} Tambah Pengguna</button></div><div class="tscroll" data-list></div>
      <div class="card-body" style="border-top:1px solid var(--line)"><p class="hint" style="margin:0">Semua pengguna berperan <b>Admin</b> (PRD v1.0). Akun tanpa kata sandi hanya dapat masuk lewat Google. Menonaktifkan akun atau mengganti sandinya langsung mengakhiri sesi di semua perangkat.</p></div></div>`;
    $('[data-add]', d).onclick = () => openPengguna(null, d);
    $('[data-list]', d).addEventListener('click', async e => {
      const b = e.target.closest('[data-ua]'); if (!b) return;
      const u = (AppState.users || []).find(x => x.email === b.closest('[data-email]').dataset.email);
      if (b.dataset.ua === 'edit') openPengguna(u, d);
      if (b.dataset.ua === 'del' && await konfirmasi({ judul: 'Hapus pengguna?', pesan: esc(u.email) + ' tidak bisa masuk lagi.', tombol: 'Hapus', bahaya: true, icon: 'user-x' })) {
        const r = await withPending(api('userDelete', { email: u.email })); if (r.success) { cacheSet('users', r.data); PANEL.pengguna.show(d); toast('success', 'Pengguna dihapus'); } else toast('error', 'Gagal', r.message);
      }
    });
  },
  show(d) {
    const render = () => {
      const L = AppState.users;
      $('[data-list]', d).innerHTML = !L ? '<div style="padding:16px 24px">' + '<div class="sk" style="height:44px;margin:8px 0"></div>'.repeat(3) + '</div>' : `<table class="simple"><thead><tr><th>Pengguna</th><th>Status</th><th>Metode masuk</th><th>Terakhir masuk</th><th></th></tr></thead><tbody>
        ${L.map(u => `<tr data-email="${esc(u.email)}"><td><div class="row"><span class="avatar" style="width:34px;height:34px;font-size:12px">${esc(inisial(u.nama))}</span><div><b>${esc(u.nama)}</b>${u.email === AppState.user.email ? ' <span class="pill pill-pri">Anda</span>' : ''}<div class="xs muted">${esc(u.email)}</div></div></div></td>
          <td><span class="badge ${u.aktif ? 's-Disetujui' : 's-Dibatalkan'}">${u.aktif ? 'Aktif' : 'Nonaktif'}</span></td><td class="small">${u.punyaSandi ? 'Kata sandi + Google' : 'Google saja'}</td><td class="small muted">${esc(waktuRelatif(u.last))}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn-icon i-pri" data-ua="edit" title="Ubah">${ic('square-pen')}</button>${u.email !== AppState.user.email ? `<button class="btn-icon i-err" data-ua="del" title="Hapus">${ic('trash-2')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
    };
    render();
    muatCache('users', 'users', 30000).then(render);
  }
};
function openPengguna(u, panel) {
  openModal({
    html: `${modalHead(u ? 'Ubah Pengguna' : 'Tambah Pengguna', u ? esc(u.email) : 'Pengguna baru dapat langsung masuk dengan email & kata sandi ini, atau dengan akun Google yang sama.')}
      <form class="modal-body form-stack" data-f novalidate>
        <div class="field"><label for="u-email">Email <span class="req">*</span></label><input class="input" id="u-email" name="email" type="email" value="${esc(u ? u.email : '')}" ${u ? 'readonly' : 'autofocus'}></div>
        <div class="field"><label for="u-nama">Nama</label><input class="input" id="u-nama" name="nama" value="${esc(u ? u.nama : '')}"></div>
        <div class="field"><label for="u-pass">${u ? 'Kata sandi baru (kosongkan bila tidak diganti)' : 'Kata sandi (min. 8 karakter, kosongkan untuk login Google saja)'}</label><div class="ig">${ic('lock')}<input class="input" id="u-pass" name="password" type="password" autocomplete="new-password"><button type="button" class="btn-icon" data-eye aria-label="Tampilkan sandi">${ic('eye')}</button></div></div>
        ${u && u.email === AppState.user.email ? '' : `<label class="check"><input type="checkbox" name="aktif" ${!u || u.aktif ? 'checked' : ''}> Akun aktif</label>`}</form>
      <div class="modal-foot"><button class="btn btn-sec" data-close>Batal</button><button class="btn btn-pri" data-ok>${ic('save')} Simpan</button></div>`,
    onMount(m, close) {
      const f = $('[data-f]', m);
      $('[data-eye]', m).onclick = () => { f.password.type = f.password.type === 'password' ? 'text' : 'password'; };
      $('[data-ok]', m).onclick = async e => {
        const data = { email: f.email.value.trim(), nama: f.nama.value.trim(), password: f.password.value, aktif: f.aktif ? f.aktif.checked : true };
        if (data.password && data.password.length < 8) return toast('warn', 'Kata sandi terlalu pendek', 'Minimal 8 karakter.');
        busyBtn(e.currentTarget, true);
        const r = await withPending(api('userSave', data));
        busyBtn(e.currentTarget, false);
        if (r.success) { cacheSet('users', r.data); close(); PANEL.pengguna.show(panel); toast('success', 'Pengguna tersimpan', data.email); } else toast('error', 'Gagal', r.message);
      };
    }
  });
}

PANEL.akun = {
  init(d) {
    d.innerHTML = `<div class="two-col"><div class="card"><div class="card-head"><h3>${ic('key-round')} Ganti Kata Sandi</h3></div>
      <form class="card-body form-stack" data-f novalidate>
        <div class="field"><label for="k-lama">Kata sandi saat ini</label><input class="input" id="k-lama" name="lama" type="password" autocomplete="current-password"><span class="hint">Kosongkan bila akun Anda belum punya kata sandi (masuk lewat Google).</span></div>
        <div class="field"><label for="k-baru">Kata sandi baru</label><input class="input" id="k-baru" name="baru" type="password" autocomplete="new-password" minlength="8"></div>
        <div class="field"><label for="k-ulang">Ulangi kata sandi baru</label><input class="input" id="k-ulang" name="ulang" type="password" autocomplete="new-password"></div>
        <div><button class="btn btn-pri">${ic('save')} Simpan Kata Sandi</button></div></form></div>
      <div class="stack"><div class="card card-pad"><h3>${ic('user')} Profil</h3><dl class="kv" style="margin-top:14px" data-prof></dl></div>
        <div class="card card-pad"><h3>${ic('monitor-smartphone')} Sesi</h3><p class="muted small">Sesi berlaku ${7} hari per perangkat. Keluar dari semua perangkat bila ponsel/laptop hilang atau dipakai bersama.</p><button class="btn btn-sec" data-all>${ic('log-out')} Keluar dari semua perangkat</button></div></div></div>`;
    $('[data-f]', d).onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      if (f.baru.value.length < 8) return toast('warn', 'Kata sandi terlalu pendek', 'Minimal 8 karakter.');
      if (f.baru.value !== f.ulang.value) return toast('warn', 'Tidak sama', 'Ulangi kata sandi baru dengan benar.');
      const btn = $('button', f); busyBtn(btn, true);
      const r = await withPending(api('changePassword', { lama: f.lama.value, baru: f.baru.value }));
      busyBtn(btn, false);
      if (r.success) { AppState.token = r.data.token; Store.set('token', r.data.token); f.reset(); toast('success', 'Kata sandi diganti', r.message); }
      else toast('error', 'Gagal', r.message);
    };
    $('[data-all]', d).onclick = async () => {
      if (!await konfirmasi({ judul: 'Keluar dari semua perangkat?', pesan: 'Termasuk perangkat ini. Anda perlu masuk kembali.', tombol: 'Keluar semua', bahaya: true, icon: 'log-out' })) return;
      const r = await api('logoutAll'); if (r.success) keluar(true); else toast('error', 'Gagal', r.message);
    };
  },
  show(d) { const u = AppState.user || {}; $('[data-prof]', d).innerHTML = `<dt>Nama</dt><dd>${esc(u.nama)}</dd><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Peran</dt><dd>${esc(u.peran || 'Admin')}</dd><dt>Instansi</dt><dd>${esc(AppState.settings.INSTITUSI_NAMA || '')}</dd>`; }
};

PANEL.migrasi = {
  init(d) {
    const st = { scan: null, hasil: null };
    d.innerHTML = `<div class="stack">
      <div class="callout">${ic('info')}<div><b>Migrasi aman diulang.</b> Spreadsheet lama hanya <b>dibaca</b>. Kolom dikenali dari <b>nama header</b> (Tanggal/Waktu Kegiatan, Lokasi/Tempat, Kegiatan/Uraian, Anggaran/Biaya, dst.). Baris tanpa ID diberi ID tetap sehingga import ulang tidak menggandakan data. Jalankan <b>Pindai</b> dulu, lalu <b>Jalankan Import</b>; ulangi tepat sebelum pindah aplikasi untuk menangkap data terbaru (delta).</div></div>
      <div class="card"><div class="card-head"><h3>${ic('database')} 1. Spreadsheet lama</h3></div><div class="card-body">
        <form class="code-in" data-src><div class="ig" style="flex:1">${ic('link')}<input class="input" name="src" placeholder="URL atau ID Google Sheets lama (milik akun yang sama dengan aplikasi)"></div><button class="btn btn-pri">${ic('scan-search')} Baca</button></form><div data-scan style="margin-top:16px"></div></div></div>
      <div class="card hide" data-opt><div class="card-head"><h3>${ic('sliders-horizontal')} 2. Pilihan import</h3></div><div class="card-body form-stack" data-optbody></div></div>
      <div class="card hide" data-hasil><div class="card-head"><h3>${ic('clipboard-list')} 3. Hasil</h3><span data-mode></span></div><div class="card-body" data-hasilbody></div></div>
      <div class="card"><div class="card-head"><h3>${ic('file-spreadsheet')} Import dari CSV / Excel</h3><button class="btn btn-soft btn-sm" data-tplcsv>${ic('download', 'ic-sm')} Template CSV</button></div><div class="card-body form-stack">
        <p class="muted small" style="margin:0">Dari Excel: <i>File → Save As → CSV</i>. Pemisah koma atau titik koma dikenali otomatis. Maksimal 5.000 baris per unggah.</p>
        <div class="grid-2"><div class="field"><label for="csv-f">Berkas CSV</label><input class="input" style="padding-top:9px" type="file" id="csv-f" accept=".csv,text/csv"></div>
          <div class="field"><label for="csv-j">Jenis bawaan (bila kolom Jenis kosong)</label><select class="select" id="csv-j"><option value="">— wajib ada kolom Jenis —</option>${JENIS.map(j => `<option>${j}</option>`).join('')}</select></div></div>
        <label class="check small"><input type="checkbox" id="csv-ow"> Timpa rengiat yang ID-nya sama</label>
        <div data-csvinfo></div>
        <div class="row"><button class="btn btn-sec" data-csv="1" disabled>${ic('scan-search')} Pindai CSV</button><button class="btn btn-pri" data-csv="0" disabled>${ic('upload')} Import CSV</button></div></div></div>
      <div class="card card-pad"><h3>${ic('list-checks')} Checklist pindah (cutover)</h3><ol class="small" style="margin:12px 0 0;padding-left:20px;line-height:1.9">
        <li>Pasang aplikasi baru → masuk sebagai admin → <b>Baca</b> spreadsheet lama → <b>Pindai</b> → <b>Jalankan Import</b>.</li>
        <li>Periksa Daftar Rengiat, Pengaturan (kop), dan Pengguna. Coba cetak satu dokumen.</li>
        <li>Tepat sebelum pindah: <b>Jalankan Import sekali lagi</b> (delta) — hanya data baru yang masuk.</li>
        <li>Umumkan alamat baru. Arsipkan spreadsheet lama (jangan dihapus).</li>
        <li>Catatan: sesi login lama tidak ikut pindah; akun lama tanpa kata sandi masuk lewat Google atau diberi sandi di tab Pengguna.</li></ol></div></div>`;

    $('[data-src]', d).onsubmit = async e => {
      e.preventDefault();
      const src = e.target.src.value.trim(); if (!src) return;
      const btn = $('button', e.target); busyBtn(btn, true, 'Membaca…');
      const r = await api('migrasiScan', { source: src }, { timeout: 60000 });
      busyBtn(btn, false);
      if (!r.success) { $('[data-scan]', d).innerHTML = `<div class="callout err">${ic('circle-alert')}<div>${esc(r.message)}</div></div>`; $('[data-opt]', d).classList.add('hide'); return; }
      st.scan = r.data; st.src = src;
      $('[data-scan]', d).innerHTML = `<div class="callout ok">${ic('circle-check')}<div><b>${esc(r.data.nama)}</b> — ${r.data.sheets.length} sheet terbaca.</div></div>
        <div class="card" style="box-shadow:none;margin-top:12px;overflow:auto"><table class="simple"><thead><tr><th>Sheet</th><th>Baris</th><th>Kolom rengiat dikenali</th></tr></thead><tbody>${r.data.sheets.map(s => `<tr><td><b>${esc(s.nama)}</b></td><td class="num">${s.baris}</td><td class="small">${Object.keys(s.peta).length ? Object.keys(s.peta).map(k => `<span class="pill pill-mute" title="dari kolom “${esc(s.peta[k])}”">${esc(k)}</span>`).join(' ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
      const sar = r.data.saran;
      $('[data-optbody]', d).innerHTML = `<div class="grid-2"><div class="field"><label for="m-sh">Sheet berisi rengiat</label><select class="select" id="m-sh">${r.data.sheets.map(s => `<option ${s.nama === sar.rengiat ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}</select></div>
        <div class="field"><label for="m-j">Jenis bawaan (bila kolom Jenis kosong / tidak ada)</label><select class="select" id="m-j"><option value="">— gunakan kolom Jenis —</option>${JENIS.map(j => `<option>${j}</option>`).join('')}</select></div></div>
        <div class="row row-wrap" style="gap:18px"><label class="check"><input type="checkbox" data-sh="rengiat" checked> Rengiat</label><label class="check"><input type="checkbox" data-sh="pengguna" ${sar.pengguna ? 'checked' : 'disabled'}> Pengguna</label><label class="check"><input type="checkbox" data-sh="pengaturan" ${sar.pengaturan ? 'checked' : 'disabled'}> Pengaturan</label><label class="check"><input type="checkbox" data-sh="pejabat" ${sar.pejabat ? 'checked' : 'disabled'}> Pejabat</label></div>
        <label class="row" style="gap:12px;cursor:pointer"><span class="switch"><input type="checkbox" id="m-ow"><span></span></span><span><b>Timpa data yang sudah ada</b><br><span class="hint">Untuk delta sync. Status yang sudah diproses di aplikasi baru (selain Draf) tetap dipertahankan.</span></span></label>
        <div class="row"><button class="btn btn-sec" data-run="1">${ic('scan-search')} Pindai (Dry-run)</button><button class="btn btn-pri" data-run="0">${ic('database-zap')} Jalankan Import</button></div>`;
      $('[data-opt]', d).classList.remove('hide');
    };
    const opsi = () => ({ source: st.src, rengiatSheet: $('#m-sh', d).value, jenisDefault: $('#m-j', d).value, overwrite: $('#m-ow', d).checked, sheets: Object.fromEntries($$('[data-sh]', d).map(x => [x.dataset.sh, x.checked])) });
    $('[data-optbody]', d).addEventListener('click', async e => {
      const b = e.target.closest('[data-run]'); if (!b) return;
      const dry = b.dataset.run === '1';
      if (!dry && !await konfirmasi({ judul: 'Jalankan import?', pesan: 'Data dari spreadsheet lama akan ditulis ke database aplikasi. Aman diulang — tidak ada data ganda.', tombol: 'Jalankan Import', icon: 'database-zap' })) return;
      busyBtn(b, true, dry ? 'Memindai…' : 'Mengimpor…');
      const r = await withPending(api(dry ? 'migrasiPreview' : 'migrasiRun', opsi(), { timeout: 330000, tries: 1 }));
      busyBtn(b, false);
      tampilHasil(d, r, dry);
      if (r.success && !dry) { await syncBoot(true); toast('success', 'Import selesai', 'Data terbaru sudah dimuat.'); }
    });

    let csv = null;
    $('#csv-f', d).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      csv = parseCsv(await f.text());
      $('[data-csvinfo]', d).innerHTML = csv.rows.length ? `<div class="info-line">${ic('file-check')} <b>${csv.rows.length} baris</b> • kolom: ${esc(csv.header.join(', ').slice(0, 200))}</div>` : `<div class="callout err">${ic('circle-alert')}<div>CSV kosong atau tidak terbaca.</div></div>`;
      $$('[data-csv]', d).forEach(b => { b.disabled = !csv.rows.length; });
    };
    $$('[data-csv]', d).forEach(b => b.onclick = async () => {
      if (!csv) return;
      const dry = b.dataset.csv === '1';
      if (csv.rows.length > 5000) return toast('warn', 'Terlalu banyak baris', 'Pecah CSV menjadi maksimal 5.000 baris.');
      busyBtn(b, true, dry ? 'Memindai…' : 'Mengimpor…');
      const r = await withPending(api('importCsv', { header: csv.header, rows: csv.rows, jenisDefault: $('#csv-j', d).value, overwrite: $('#csv-ow', d).checked, dryRun: dry }, { timeout: 330000, reqId: dry ? undefined : 'csv-' + hashStr(JSON.stringify(csv.rows)) + '-' + Date.now() }));
      busyBtn(b, false);
      tampilHasil(d, r, dry);
      if (r.success && !dry) { await syncRows(true); toast('success', 'Import CSV selesai'); }
    });
    $('[data-tplcsv]', d).onclick = () => unduhTeks('﻿Jenis;Tanggal;Jam Mulai;Jam Selesai;Lokasi;Kegiatan;Sasaran;Personil;Sarpras;Anggaran;Keterangan;Unit;Status\nBulanan;12/10/2026;08:00;10:00;Aula Cenderawasih;Rapat Koordinasi Evaluasi Anggaran;Kasubbag & Staf;12 Orang;Proyektor;4250000;Konsumsi disediakan;Subbag Perencanaan & Keuangan;Draf\nHarian;13/10/2026;07:30;08:30;Halaman Kantor;Apel Pagi;Seluruh ASN;45 Orang;Sound Portable;0;;Subbag Umum & Kepegawaian;Draf\n', 'template-import-rengiat.csv', 'text/csv');
  }
};
function tampilHasil(d, r, dry) {
  const box = $('[data-hasil]', d); box.classList.remove('hide');
  $('[data-mode]', d).innerHTML = r.success ? `<span class="pill ${dry ? 'pill-mute' : 'pill-pri'}">${dry ? 'DRY-RUN — belum ditulis' : 'SUDAH DITULIS'}</span>` : '';
  if (!r.success) { $('[data-hasilbody]', d).innerHTML = `<div class="callout err">${ic('circle-alert')}<div>${esc(r.message)}</div></div>`; return; }
  const rep = r.data.report;
  $('[data-hasilbody]', d).innerHTML = `<div style="overflow:auto"><table class="simple"><thead><tr><th>Data</th><th>Di sumber</th><th>Ditambah</th><th>Diperbarui</th><th>Dilewati</th><th>Tidak valid</th></tr></thead><tbody>
    ${Object.keys(rep).map(k => `<tr><td><b>${esc(k)}</b></td><td class="num">${rep[k].source}</td><td class="num" style="color:var(--ok);font-weight:700">+${rep[k].inserted}</td><td class="num" style="color:var(--info);font-weight:700">${rep[k].updated}</td><td class="num">${rep[k].skipped}</td><td class="num" style="color:${rep[k].invalid ? 'var(--err)' : 'inherit'}">${rep[k].invalid || 0}</td></tr>`).join('')}</tbody></table></div>
    ${r.data.warnings.length ? `<details style="margin-top:14px" ${r.data.warnings.length < 8 ? 'open' : ''}><summary class="lbl" style="cursor:pointer">${ic('triangle-alert', 'ic-sm')} ${r.data.totalWarnings} peringatan</summary><ul class="small" style="margin:8px 0 0;padding-left:20px;line-height:1.8">${r.data.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : `<p class="small muted" style="margin:12px 0 0">${ic('circle-check', 'ic-sm')} Tidak ada peringatan.</p>`}`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

PANEL.log = {
  init(d) {
    d.innerHTML = `<div class="card"><div class="card-head"><h3>${ic('scroll-text')} Log Aktivitas</h3><div class="row"><label class="ig" style="width:240px">${ic('search')}<input class="input" style="height:38px" data-q placeholder="Cari aksi / email…"></label><button class="btn btn-ghost btn-sm" data-ref title="Muat ulang">${ic('refresh-cw', 'ic-sm')}</button></div></div><div class="tscroll" data-list></div></div>`;
    $('[data-q]', d).addEventListener('input', debounce(() => PANEL.log.render(d), 200));
    $('[data-ref]', d).onclick = () => muatCache('logs', 'logs', 0, true).then(() => PANEL.log.render(d));
  },
  render(d) {
    const L = AppState.logs, q = norm($('[data-q]', d).value);
    $('[data-list]', d).innerHTML = !L ? '<div style="padding:16px 24px">' + '<div class="sk" style="height:40px;margin:8px 0"></div>'.repeat(5) + '</div>' : `<table class="simple"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>
      ${L.filter(l => !q || norm(l.aksi + ' ' + l.email + ' ' + l.detail + ' ' + l.target).includes(q)).slice(0, 200).map(l => `<tr><td class="small muted" style="white-space:nowrap">${esc(waktuRelatif(l.waktu))}</td><td class="small">${esc(l.email)}</td><td><span class="pill ${/HAPUS|DITOLAK|TARIK|SLOW/.test(l.aksi) ? 'pill-mute' : 'pill-pri'}">${esc(l.aksi)}</span></td><td class="small">${esc(l.detail)} <span class="mono muted">${esc(l.target)}</span></td></tr>`).join('') || '<tr><td colspan="4" class="list-empty">Belum ada log.</td></tr>'}</tbody></table>`;
  },
  show(d) { PANEL.log.render(d); muatCache('logs', 'logs', 20000).then(() => PANEL.log.render(d)); }
};

PANEL.performa = {
  init(d) {
    d.innerHTML = `<div class="two-col"><div class="card"><div class="card-head"><h3>${ic('gauge')} 30 panggilan API terakhir</h3><button class="btn btn-sec btn-sm" data-ping>${ic('activity', 'ic-sm')} Uji koneksi</button></div><div class="tscroll" data-perf></div>
        <div class="card-body" style="border-top:1px solid var(--line)"><p class="hint" style="margin:0"><b>Server</b> = waktu kerja Apps Script. <b>Jaringan</b> = selisih total − server (cold start, redirect Google, sinyal). Target: baca &lt; 300 ms dari cache, tulis &lt; 2 dtk.</p></div></div>
      <div class="stack"><div class="card card-pad"><h3>${ic('hard-drive')} Data di perangkat ini</h3><dl class="kv" style="margin-top:14px" data-info></dl></div>
        <div class="card card-pad"><h3>${ic('wrench')} Perawatan</h3><div class="row row-wrap" style="margin-top:12px"><button class="btn btn-sec" data-reload>${ic('refresh-cw')} Muat ulang dari server</button><button class="btn btn-sec" data-clear>${ic('eraser')} Bersihkan cache perangkat</button></div></div></div></div>`;
    $('[data-ping]', d).onclick = async e => {
      busyBtn(e.currentTarget, true, 'Menguji…');
      const t = [];
      for (let i = 0; i < 3; i++) { const t0 = performance.now(); await api('ping', {}, { tries: 1 }); t.push(Math.round(performance.now() - t0)); }
      busyBtn(e.currentTarget, false);
      toast('info', 'Hasil uji koneksi', t.map(x => x + ' ms').join(' • ') + ' (rata-rata ' + Math.round(t.reduce((a, b) => a + b) / 3) + ' ms)');
      PANEL.performa.show(d);
    };
    $('[data-reload]', d).onclick = async e => { busyBtn(e.currentTarget, true); const r = await syncBoot(true); busyBtn(e.currentTarget, false); toast(r && r.success ? 'success' : 'error', r && r.success ? 'Data dimuat ulang' : 'Gagal', r && r.message); PANEL.performa.show(d); };
    $('[data-clear]', d).onclick = async () => { if (await konfirmasi({ judul: 'Bersihkan cache?', pesan: 'Data lokal di perangkat ini dihapus lalu dimuat ulang dari server. Anda tetap masuk.', tombol: 'Bersihkan', icon: 'eraser' })) { Store.clearUser(); location.reload(); } };
  },
  show(d) {
    const R = Perf.rows.slice(-30).reverse();
    $('[data-perf]', d).innerHTML = R.length ? `<table class="simple"><thead><tr><th>Aksi</th><th style="text-align:right">Total</th><th style="text-align:right">Server</th><th style="text-align:right">Jaringan</th><th>Kapan</th></tr></thead><tbody>${R.map(r => `<tr><td class="mono">${esc(r.action)}</td><td class="num" style="text-align:right;font-weight:700;color:${r.total > 3000 ? 'var(--err)' : r.total > 1500 ? 'var(--warn)' : 'inherit'}">${r.total} ms</td><td class="num" style="text-align:right">${r.server == null ? '—' : r.server + ' ms'}</td><td class="num" style="text-align:right">${r.net == null ? '—' : r.net + ' ms'}</td><td class="small muted">${esc(waktuRelatif(new Date(r.at).toISOString()))}</td></tr>`).join('')}</tbody></table>` : '<div class="list-empty">Belum ada panggilan API pada sesi ini.</div>';
    let bytes = 0; try { Object.keys(localStorage).filter(k => k.indexOf(LS_PREFIX) === 0).forEach(k => { bytes += (localStorage.getItem(k) || '').length * 2; }); } catch (e) {}
    $('[data-info]', d).innerHTML = `<dt>Rengiat lokal</dt><dd>${AppState.rows.length} baris</dd><dt>Versi data</dt><dd class="mono">${esc(AppState.ver || '-')}</dd><dt>Sinkron terakhir</dt><dd>${AppState.lastSync ? esc(waktuRelatif(new Date(AppState.lastSync).toISOString())) : '-'}</dd><dt>Ukuran cache</dt><dd>${(bytes / 1024).toFixed(0)} KB</dd><dt>Versi aplikasi</dt><dd>${APP_VERSI}</dd><dt>Server API</dt><dd class="mono" style="font-size:11px">${esc(GAS_URL.replace(/^(https:\/\/[^/]+\/macros\/s\/.{8}).*(.{6})$/, '$1…$2'))}</dd>`;
  }
};
