# NPD Business Management System — versi statis (tanpa server)

*Network. Play. Discover. — Datang sendiri, pulang bawa circle.*

Aplikasi ini **hanya HTML + JavaScript**. Tidak ada Python, tidak ada server berbayar.

- **Aplikasi (kode)** → repo GitHub **publik** (isi folder ini), tampil lewat GitHub Pages. Tidak ada data di sini.
- **Data** → satu file `npd-data.json` di repo GitHub **privat** (terpisah).
- Setiap HP/laptop menyimpan salinan data sendiri → **tetap bisa dipakai offline**, lalu disinkronkan otomatis.
- Token GitHub **hanya tersimpan di perangkat masing-masing**, tidak pernah masuk kode atau repo.

## Setup (sekali saja, ±15 menit, di laptop)

### 1. Repo aplikasi (publik)
1. github.com → **New repository** → nama `npd-app` → **Public** → Create.
2. **Add file → Upload files** → seret *isi* folder ini (index.html, sw.js, manifest.webmanifest, folder css, js, icons, img) → Commit.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
4. Tunggu 1–2 menit. Alamat aplikasi: `https://USERNAME.github.io/npd-app/`

### 2. Repo data (privat)
1. **New repository** → nama `npd-data` → **Private** (wajib!) → centang *Add a README* → Create.

### 3. Token (kunci akses)
1. GitHub → foto profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Repository access* → **Only select repositories** → pilih **npd-data saja**.
3. *Permissions → Repository permissions → Contents: Read and write*.
4. Expiration: pilih (mis. 1 tahun). Generate, **salin token** (`github_pat_…`) — hanya muncul sekali.

### 4. Hubungkan di setiap perangkat
1. Buka alamat aplikasi → pilih nama → **Masuk**.
2. **Settings → GitHub Sync** → isi pemilik (username), `npd-data`, file `npd-data.json`, branch `main`, tempel token → **Hubungkan**.
3. Perangkat pertama mengirim data awal; perangkat lain otomatis mengambil data yang sama.

**iPhone:** buka di Safari → Share → *Add to Home Screen*, lalu **selalu buka lewat ikon itu**. Hubungkan token di ikon tersebut (penyimpanan Safari dan ikon Home Screen terpisah).

## Cara kerja sinkronisasi
- Perubahan dikirim ±1,5 detik setelah disimpan; data diambil saat aplikasi dibuka, saat kembali ke aplikasi, tiap 90 detik, dan saat online lagi.
- Digabung per data: yang **terbaru** menang. Penghapusan ikut tersinkron.
- Lencana di layar: *Tersinkron* · *N menunggu dikirim* · *Offline* · *Gagal sinkron*.
- Sinkronisasi **menolak jalan** bila repo data ternyata publik.

## Hal yang perlu diketahui (jujur)
- **Peran (admin/staff/viewer) hanya mengatur menu**, bukan keamanan. Siapa pun yang memegang token bisa membaca semua data keuangan. Beri token hanya ke Sabit & Julio. Septian tidak perlu token jika tidak perlu melihat data.
- **Struk**: foto tidak disimpan. Simpan di Google Drive/Photos, tempel link di kolom *Receipt link*.
- **Import anggota**: hanya `.csv` (di Excel: Save As → CSV). Export laporan: Excel (.xlsx), CSV, dan PDF (lewat dialog cetak → *Save as PDF*).
- Kode urut (EXP-000001 dst.) dibuat per perangkat; jika dua perangkat offline membuat data pada saat bersamaan, nomor bisa kembar (ID internal tetap unik).
- Dua orang mengedit **data yang sama** saat offline: yang disimpan terakhir menang.
- Backup: Settings → Data & Backup → *Unduh backup* (JSON). Riwayat versi juga tersimpan di commit repo data.
- Token kedaluwarsa → pill “Gagal sinkron”; buat token baru dan simpan ulang di Settings → GitHub Sync.
- Logo resmi: taruh sebagai `img/brand/logo.svg` (atau `.png`). Sementara tampil teks “NPD”.

## Tes
`node tests/finance.test.js` · `node tests/sync.test.js` (2 perangkat + GitHub palsu) · `python3 tests/ui_smoke.py <url>` (Playwright).
