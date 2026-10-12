# E-RENGIAT — Frontend

Aplikasi penyusun Rencana Kegiatan (Tahunan, Bulanan, Mingguan, Harian) untuk instansi.
Frontend statis (HTML/CSS/JS murni) untuk GitHub Pages; backend Google Apps Script sebagai REST API.

```
index.html          Aplikasi (SPA)
verifikasi.html     Halaman publik tujuan QR dokumen
css/style.css       Tampilan (token DESIGN.md)
js/config.js        ← isi GAS_URL di sini
js/core.js          api(), cache perangkat, router, toast, modal
js/daftar.js        Daftar rengiat, form, hapus, cetak, pratinjau A4
js/admin.js         Matriks & Verifikasi, Template Dokumen, Sistem, Migrasi
js/app.js           Kerangka, login, akses ditolak, inisialisasi
js/icons.js         Subset ikon Lucide (ISC)
js/qr.js            Pembuat QR (Kazuhiko Arase, MIT)
```

Langkah pemasangan lengkap: **PANDUAN-INSTALASI.md**.
