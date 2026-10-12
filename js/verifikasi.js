/* E-RENGIAT — verifikasi.js : halaman publik tujuan QR dokumen */
'use strict';
(function () {
  const GAS = String((window.APP_CONFIG || {}).GAS_URL || '').trim();
  const box = document.getElementById('v');
  const ic = (n, c) => `<svg class="ic ${c || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICONS || {})[n] || ''}</svg>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = n => 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const tgl = iso => iso ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jayapura', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) + ' WIT' : '-';
  const k = (new URLSearchParams(location.search).get('k') || '').trim();

  function formKode(pesan) {
    box.innerHTML = `<div class="verif-head"><div class="verif-badge wait">${ic('scan-search')}</div><h1 style="font-size:28px">Verifikasi Dokumen</h1>
      <p class="muted">${pesan || 'Pindai QR pada dokumen, atau ketik kode verifikasi 16 karakter yang tercetak di bawah QR.'}</p></div>
      <form class="code-in" style="margin-top:22px" id="f"><input class="input" name="k" placeholder="Contoh: 4F2A9C0B7D1E5A33" style="text-transform:uppercase" autofocus aria-label="Kode verifikasi"><button class="btn btn-pri">${ic('search')} Cek</button></form>`;
    document.getElementById('f').onsubmit = e => { e.preventDefault(); const v = e.target.k.value.trim(); if (v) location.search = '?k=' + encodeURIComponent(v); };
  }

  async function cek() {
    if (!GAS) return formKode('Halaman verifikasi belum terhubung ke server (GAS_URL kosong).');
    if (!k) return formKode();
    box.innerHTML = `<div class="verif-head"><div class="verif-badge wait">${ic('loader-circle', 'spin')}</div><h2>Memeriksa keaslian…</h2><p class="muted">Kode <span class="mono">${esc(k)}</span></p></div>`;
    let r;
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(GAS + '?action=verify&k=' + encodeURIComponent(k), { redirect: 'follow', cache: 'no-store', signal: ctrl.signal });
      clearTimeout(t); r = await res.json();
    } catch (e) { r = { success: false, message: 'Server tidak dapat dihubungi. Coba lagi beberapa saat lagi.', net: true }; }
    if (!r.success) {
      box.innerHTML = `<div class="verif-head"><div class="verif-badge bad">${ic('shield-x')}</div><h1 style="font-size:28px">${r.net ? 'Gagal memeriksa' : 'Tidak Terdaftar'}</h1>
        <p class="muted">${esc(r.message)}</p><p class="small muted">Kode: <span class="mono">${esc(k)}</span></p></div>
        <div class="callout err" style="margin-top:18px">${ic('triangle-alert')}<div class="small">${r.net ? 'Periksa koneksi internet Anda.' : 'Dokumen dengan kode ini tidak tercatat di sistem E-RENGIAT. Bila dokumen ini diterima sebagai dokumen resmi, laporkan kepada instansi penerbit.'}</div></div>
        <div style="text-align:center;margin-top:18px"><a class="link-btn" href="?">${ic('arrow-left', 'ic-sm')} Cek kode lain</a></div>`;
      return;
    }
    const d = r.data, sah = d.status === 'TERBIT';
    const ttd = d.slot ? (d.penandatangan || []).filter(p => p.slot === d.slot) : (d.penandatangan || []);
    box.innerHTML = `<div class="verif-head"><div class="verif-badge ${sah ? 'ok' : 'bad'}">${ic(sah ? 'shield-check' : 'shield-x')}</div>
      <span class="badge ${sah ? 's-TERBIT' : 's-DITARIK'}" style="height:28px;font-size:13px">${sah ? 'DOKUMEN SAH' : 'DOKUMEN DITARIK'}</span>
      <h1 style="font-size:24px;line-height:32px;margin-top:12px">${esc(d.judul)}</h1>
      <p class="muted" style="margin:6px 0 0">${esc(d.induk || '')}<br><b style="color:var(--ink)">${esc(d.instansi || '')}</b></p></div>
      ${!sah ? `<div class="callout err" style="margin-top:18px">${ic('circle-alert')}<div><b>Dokumen ini telah ditarik dan tidak berlaku.</b>${d.alasan ? '<br>Alasan: ' + esc(d.alasan) : ''}</div></div>` : ''}
      ${d.slot && ttd.length ? `<div class="callout ok" style="margin-top:18px">${ic('pen-tool')}<div>Tanda tangan elektronik <b>${esc(ttd[0].nama)}</b> (${esc(ttd[0].jabatan)}) pada dokumen ini <b>${sah ? 'tercatat sah' : 'tidak berlaku lagi'}</b>.</div></div>` : ''}
      <dl class="kv" style="margin-top:22px"><dt>Nomor dokumen</dt><dd class="mono">${esc(d.nomor)}</dd><dt>Jenis / periode</dt><dd>${esc(d.jenis || '-')} ${d.periode ? '• ' + esc(d.periode) : ''}</dd>
        <dt>Isi</dt><dd>${esc(d.jumlah)} kegiatan • total ${rp(d.total)}</dd><dt>Diterbitkan</dt><dd>${esc(tgl(d.terbit))}</dd>
        ${(d.penandatangan || []).map(p => `<dt>Penanda tangan ${p.slot}</dt><dd>${esc(p.nama)}<br><span class="muted small">${esc(p.jabatan)}</span></dd>`).join('')}</dl>
      ${d.hash ? `<div style="margin-top:22px"><div class="lbl" style="margin-bottom:8px">${ic('fingerprint', 'ic-sm')} Cek keutuhan berkas PDF</div>
        <label class="drop"><input type="file" accept="application/pdf,.pdf,.docx,.xlsx,.png,.pptx" hidden id="pdf"><span class="small">Pilih berkas yang Anda terima untuk memastikan isinya tidak diubah sejak diterbitkan.</span></label><div id="hres" style="margin-top:12px"></div></div>` : ''}
      <div style="text-align:center;margin-top:18px"><a class="link-btn" href="?">${ic('search', 'ic-sm')} Cek kode lain</a></div>`;
    const inp = document.getElementById('pdf');
    if (inp) inp.onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const out = document.getElementById('hres');
      if (!crypto.subtle) { out.innerHTML = `<div class="callout warn">${ic('triangle-alert')}<div class="small">Peramban ini tidak mendukung pemeriksaan (butuh HTTPS).</div></div>`; return; }
      const buf = await f.arrayBuffer(), h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
      out.innerHTML = h === d.hash ? `<div class="callout ok">${ic('circle-check')}<div><b>Berkas asli.</b> Sidik digital cocok dengan dokumen yang diterbitkan.</div></div>`
        : `<div class="callout err">${ic('circle-x')}<div><b>Berkas berbeda.</b> Isi berkas ini tidak sama dengan yang diterbitkan (mungkin sudah diedit, atau berkas lain).</div></div>`;
    };
  }
  document.addEventListener('DOMContentLoaded', cek);
})();
