# 📋 PANDUAN INSTALASI — E-RENGIAT v1.0

Aplikasi penyusun Rencana Kegiatan (Tahunan, Bulanan, Mingguan, Harian) dengan arsitektur:

```
GitHub Pages (index.html, css/, js/)  ──fetch JSON──▶  Google Apps Script (Kode.gs …)  ──▶  Google Sheets + Drive
```

Anda menerima dua kelompok berkas:

| Berkas | Untuk | Cara pakai |
|---|---|---|
| `Kode.gs`, `DocEngine.gs`, `Migrasi.gs`, `QrLib.gs`, `appsscript.json` | **Backend** (Apps Script) | Salin-tempel satu per satu ke editor Apps Script |
| `e-rengiat-frontend.zip` | **Frontend** (GitHub Pages) | Ekstrak, lalu folder hasil ekstrak itulah yang di-push ke GitHub |

> ⏱️ Total waktu pemasangan pertama: ±30–45 menit.

---

## BAGIAN A — Backend (Google Apps Script)

### A1. Buat proyek
1. Buka **https://script.google.com** → **Proyek baru**. Beri nama `E-RENGIAT Backend`.
2. Ganti isi `Code.gs` dengan seluruh isi **`Kode.gs`**, lalu ganti nama berkasnya menjadi `Kode`.
3. Tambah berkas: ikon **＋** → **Skrip** → beri nama `DocEngine` → tempel isi **`DocEngine.gs`**.
4. Ulangi untuk **`Migrasi.gs`** (nama `Migrasi`) dan **`QrLib.gs`** (nama `QrLib`).
5. Zona waktu & manifes: ⚙️ **Setelan proyek** → centang **Tampilkan berkas manifes "appsscript.json"** → buka `appsscript.json` di daftar berkas → ganti isinya dengan **`appsscript.json`** yang Anda terima (zona waktu sudah `Asia/Jayapura`).
6. Tekan **Ctrl+S**.

### A2. Jalankan setup (SEKALI saja)
1. Di bilah atas, pilih fungsi **`setupAppEnvironment`** → ▶ **Jalankan**.
2. Klik **Tinjau izin** → pilih akun Google Anda → **Lanjutan** → **Buka E-RENGIAT Backend (tidak aman)** → **Izinkan**.
   *(Peringatan "tidak aman" muncul karena skrip buatan sendiri belum diverifikasi Google — ini normal.)*
3. Buka **Log eksekusi**. Anda akan melihat:
   - link Spreadsheet database & folder Drive `📁 E-RENGIAT`
   - link **Template Rengiat Standar** (Google Docs A4 lanskap)
   - **🔑 email dan kata sandi admin pertama** → **CATAT SEKARANG**, hanya tampil sekali.
4. Cek Google Drive: folder `📁 E-RENGIAT` berisi `🗃️ Database`, `📂 Exports`, `📂 Templates`.

> ⚠️ Jangan jalankan `setupAppEnvironment` dua kali. Bila ada sheet/kolom yang terhapus, jalankan **`perbaikiSkema`**. Bila template standar terhapus, jalankan **`perbaikiTemplateStandar`**.
>
> 🔍 Uji cepat: jalankan **`ujiQr`** → buka link di log → harus tampil gambar QR. Jalankan **`cekKesehatan`** untuk melihat ringkasan konfigurasi.

### A3. Deploy sebagai Web App
1. **Terapkan (Deploy)** → **Deployment baru** → ikon ⚙️ → **Aplikasi web**.
2. Isi:
   - **Jalankan sebagai:** *Saya (email Anda)*
   - **Yang memiliki akses:** *Siapa saja (Anyone)*
3. **Terapkan** → salin **URL aplikasi web** (berakhiran `/exec`).

> Keamanan tetap terjaga walau aksesnya "Siapa saja": setiap aksi data diperiksa token login di server (`dispatch` → `verifyToken_` → pengguna aktif di sheet `Pengguna`). Tanpa login, server hanya melayani halaman masuk dan verifikasi dokumen publik.

### A4. Memperbarui kode backend nanti (URL tetap sama)
**Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru → Terapkan.**
❌ Jangan memilih "Deployment baru" — itu membuat URL `/exec` baru dan frontend akan terputus.

---

## BAGIAN B — Frontend (GitHub Pages)

### B1. Isi alamat backend
1. Ekstrak **`e-rengiat-frontend.zip`**. Hasilnya folder **`e-rengiat`** yang **langsung berisi** `index.html`, `verifikasi.html`, `css/`, `js/`.
2. Buka **`js/config.js`** dengan Notepad, isi:
   ```js
   GAS_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
3. Simpan.

### B2. Push ke GitHub (lewat terminal)
> 📁 **Folder kerja = folder `e-rengiat` hasil ekstrak (yang berisi `index.html`).** Semua perintah `git` dijalankan di sana — bukan di folder induknya. Bila salah satu level, GitHub Pages akan menampilkan 404 tanpa pesan error apa pun.

Bila belum pernah memakai Git: pasang dari https://git-scm.com/download/win (Windows) lalu sekali seumur komputer:
```bash
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

Buat repository baru di github.com (tombol **＋ → New repository**), beri nama `e-rengiat`, pilih **Public**, **jangan** centang README. Lalu:

1. Buka folder `e-rengiat` di File Explorer → klik address bar → ketik `powershell` → Enter.
2. Pastikan foldernya benar:
   ```powershell
   dir
   ```
   Harus terlihat `index.html`, `verifikasi.html`, `css`, `js`. Kalau yang terlihat justru folder `e-rengiat`, jalankan `cd e-rengiat` dulu.
3. Jalankan satu per satu:
   ```bash
   git init
   git add .
   git commit -m "Upload pertama E-RENGIAT"
   git branch -M main
   git remote add origin https://github.com/USERNAME/e-rengiat.git
   git push -u origin main
   ```
   Saat diminta **Password**, tempel **Personal Access Token** (bukan sandi GitHub): https://github.com/settings/tokens → *Generate new token (classic)* → centang **repo**. Saat menempel, layar memang terlihat kosong — itu normal, tekan Enter.

### B3. Aktifkan GitHub Pages
Repository → **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main / (root)** → **Save** → centang **Enforce HTTPS**.
Tunggu 1–2 menit. Situs aktif di `https://USERNAME.github.io/e-rengiat/`.

### B4. Update frontend berikutnya
```bash
git add .
git commit -m "Ringkas perubahan"
git push
```
Bila tampilan masih versi lama: **Ctrl+Shift+R** atau buka di jendela Incognito.

---

## BAGIAN C — Mulai Memakai

1. Buka situs → masuk dengan email & **kata sandi sementara** dari Log (A2).
2. **Sistem → Akun Saya** → ganti kata sandi.
3. **Sistem → Instansi & Dokumen** → isi nama instansi, alamat, kop, penanda tangan, daftar unit → **Simpan**. Kop dokumen & header aplikasi langsung berubah.
4. **Sistem → Pengguna** → tambah admin lain bila perlu.
5. Hapus 6 rengiat contoh (berawalan `RGT-CONTOH-`) bila tidak diperlukan.

### C1. Login dengan Google (opsional)
1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorized JavaScript origins:** `https://USERNAME.github.io`
3. Salin **Client ID** → tempel di **Sistem → Instansi & Dokumen → Google OAuth Client ID** → Simpan.
4. Tombol **Masuk dengan Google** aktif. Akun Google yang tidak ada di sheet `Pengguna` melihat halaman **Akses Ditolak**.

---

## BAGIAN D — Dokumen & Cetak (Doc Engine)

- **Cetak PDF** di Daftar Rengiat → pilih jenis & periode → **Unduh Dokumen PDF**. Server membuat dokumen dari **Template Rengiat Standar**, memberi nomor `DOK-RGT-yyyyMMdd-NNN`, kode verifikasi 16 karakter, QR, dan sidik SHA-256, lalu berkas langsung terunduh (±3–8 detik).
- **Pratinjau** menampilkan lembar A4 lanskap seketika di peramban; tombol **Cetak Dokumen** memakai dialog cetak peramban (tanpa nomor resmi), **Unduh PDF** menerbitkan dokumen resmi.
- **Mengubah tampilan kop/tabel:** menu **Template Dokumen** → kartu *Rengiat Standar* → ikon ↗ → ubah langsung di Google Docs (huruf, ukuran, logo, lebar kolom). Gaya penanda ikut terbawa ke hasil.
- **Template sendiri** (nota dinas, undangan rapat, sertifikat, rekap Excel): buat di Google Docs/Sheets/Slides dengan penanda `{{…}}` → **Template Dokumen → Daftarkan Template** → tempel URL → sistem membuat form isian otomatis. Daftar penanda lengkap ada di halaman tersebut (klik untuk menyalin).
- **Pejabat penanda tangan** tambahan diatur di halaman Template Dokumen; dipilih per slot `{{NAMA_PEJABAT_1}}`, `{{NAMA_PEJABAT_2}}`, dst.
- **Verifikasi:** QR mengarah ke `verifikasi.html?k=KODE` di situs Anda. Siapa pun bisa memeriksa status SAH/DITARIK dan mencocokkan berkas PDF (hash). Dokumen yang salah bisa **ditarik** di **Matriks & Verifikasi → Arsip Dokumen Terbit**.

> ⚖️ Catatan hukum: QR + login dalam aplikasi ini termasuk *tanda tangan elektronik tidak tersertifikasi* (PP 71/2019) — memadai untuk dokumen internal yang keasliannya perlu bisa dicek. Untuk kekuatan hukum penuh diperlukan integrasi PSrE berinduk Komdigi (tahap lanjutan). Ini bukan nasihat hukum.

---

## BAGIAN E — Migrasi Data Lama

1. Pastikan spreadsheet lama berada di **akun Google yang sama** dengan pemilik Apps Script (atau dibagikan ke akun itu). Data rengiat dari Excel: unggah ke Drive lalu *Buka dengan Google Spreadsheet*.
2. **Sistem → Migrasi Data** → tempel URL → **Baca**. Sistem menampilkan sheet dan kolom yang dikenali dari **nama header** (Tanggal/Waktu Kegiatan, Lokasi/Tempat, Kegiatan/Uraian, Sasaran/Target, Anggaran/Biaya/Pagu, Jenis, Status, dsb.).
3. Pilih sheet rengiat & **jenis bawaan** (bila tidak ada kolom Jenis) → **Pindai (Dry-run)** → periksa angka *Ditambah / Dilewati / Tidak valid* dan peringatan.
4. **Jalankan Import**. Aman diulang — tidak ada data ganda.
5. **Cutover:** tepat sebelum beralih penuh, jalankan import sekali lagi (delta). Aktifkan *Timpa data yang sudah ada* bila ingin perubahan di data lama ikut terbawa (status yang sudah diproses di aplikasi baru tetap dipertahankan).
6. Alternatif: **Import CSV** (unduh *Template CSV* untuk format kolomnya).

Batasan jujur: sesi login lama tidak ikut pindah; akun lama tanpa kata sandi masuk lewat Google atau diberi sandi di tab Pengguna; satu kali import dibatasi waktu eksekusi Apps Script ±6 menit (aman untuk puluhan ribu baris per sheet).

---

## BAGIAN F — Uji Penerimaan (UAT sesuai PRD)

| Skenario | Cara uji | Hasil yang diharapkan |
|---|---|---|
| Akun tidak terdaftar | Masuk dengan Google memakai akun lain | Halaman **Akses Ditolak** |
| Akun Admin | Masuk dengan email/sandi | Daftar Rengiat tampil |
| Field wajib kosong | Tambah Rengiat → kosongkan Lokasi → Simpan | Pesan validasi, data tidak tersimpan |
| Tambah tiap jenis | Simpan 1 rengiat untuk Tahunan/Bulanan/Mingguan/Harian | Sheet `Rengiat` berisi Jenis & Periode benar |
| Cari | Ketik kata di kolom cari | Hanya baris cocok, instan, kata disorot |
| Filter | Ganti kartu jenis & periode; Filter status/unit | Tabel sesuai pilihan |
| Ubah & hapus | ✏️ ubah → simpan; 🗑️ → ketik HAPUS | Baris sheet ikut berubah/terhapus |
| Cetak PDF | Cetak PDF per jenis & periode | PDF A4 lanskap, 8 kolom data, total & terbilang benar, QR terbaca |
| HP | Buka di ponsel | Tampilan kartu, tombol ＋, bilah total di bawah |

---

## BAGIAN G — Kecepatan (gas-instant-ux-pro)

- **Login = 1 panggilan** yang langsung membawa seluruh data layar pertama.
- Data disimpan di perangkat per pengguna; membuka aplikasi lagi tampil **seketika dari cache**, lalu disegarkan di latar. Server hanya mengirim ulang data bila versinya berubah.
- **Cari, filter, urut, halaman, pindah jenis** dikerjakan di peramban (tanpa server).
- **Simpan/hapus/ubah status bersifat optimistic**: tampil langsung, dikonfirmasi server di belakang, dibatalkan otomatis bila gagal. Setiap aksi tulis membawa `reqId` sehingga aman diulang saat sinyal putus (tanpa data ganda).
- Server: cache berlapis berversi, sheet dibaca sekali per panggilan, tulis di dalam `LockService` singkat, log diantrekan dan ditulis tiap 5 menit, token login HMAC tanpa menyimpan sesi.
- Pantau di **Sistem → Performa** (waktu server vs jaringan per panggilan) atau ketik `Perf.table()` di Console peramban.

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Halaman "Satu langkah lagi" | `GAS_URL` kosong | Isi `js/config.js`, push ulang |
| "Server membalas HTTP … (bukan JSON)" | URL salah / akses bukan *Anyone* / belum di-deploy ulang | Cek A3; gunakan URL `/exec` (bukan `/dev`) |
| "Aplikasi belum di-setup" | `setupAppEnvironment` belum dijalankan | Jalankan A2 |
| Situs GitHub 404 | `git init` di folder induk | Push dari folder yang berisi `index.html` (lihat B2) |
| Tampilan polos tanpa warna | Folder `css/` `js/` tidak ikut | Jangan unggah lewat web GitHub; gunakan terminal |
| Lupa kata sandi | — | Admin lain reset di Sistem → Pengguna, atau pemilik menjalankan `resetSandiPemilik` di editor |
| Cetak gagal "Ekspor … gagal" | Izin Drive belum lengkap | Jalankan `ujiQr` sekali dari editor untuk memicu izin, deploy versi baru |
| QR mengarah ke alamat lama | Ganti domain | Isi URL baru di Sistem → Instansi & Dokumen → URL halaman verifikasi |
| Perubahan backend tidak berlaku | Belum deploy versi baru | Lihat A4 |

Fungsi editor yang tersedia: `setupAppEnvironment`, `perbaikiSkema`, `perbaikiTemplateStandar`, `resetSandiPemilik`, `cekKesehatan`, `ujiQr`, `flushLogs`.
