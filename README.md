# Hızlı Oku (RSVP Hızlı Okuma Uygulaması)

Modern, minimalist ve dikkat dağıtıcı unsurlardan arındırılmış bir RSVP (*Rapid Serial Visual Presentation* - Hızlı Seri Görsel Sunum) hızlı okuma uygulaması.

Kelimelerin odak noktasını (*Optimal Recognition Point*) ekranda sabit tutarak göz seğirmelerini en aza indirir ve yüksek hızlarda akıcı okuma imkanı sunar.

---

## ⚡ Özellikler

- **RSVP Odak Hizalaması:** Her kelimenin pivot harfi otomatik hesaplanır ve merkeze hizalanır.
- **Akıllı Hız ve Ritim:** Cümle sonu noktalama işaretlerinde ve uzun kelimelerde anlama oranını korumak için akıllı duraklama.
- **Gelişmiş WPM Kontrolü:** 100 - 1000 WPM aralığında ayarlanabilir okuma temposu.
- **Bağlam Görünümü:** Okunan kelimenin öncesini ve sonrasını takip edebilme.
- **3 Arayüz Teması:**
  - 🍎 **Cam (iOS):** Modern Apple minimalizmi
  - ⚡ **Neon (Linear):** Koyu, fütüristik tema
  - 📖 **Kağıt (Kindle):** Göz yormayan e-kitap dokusu
- **Klavye Kısayolları:**
  - `Boşluk (Space)`: Oynat / Duraklat
  - `←` / `→`: Kelime kelime geri/ileri sarma (`Shift` ile 10 kelime)
  - `↑` / `↓`: Hızı artır / azalt
  - `Esc`: Okumayı durdur

---

## 🛠️ Kurulum & Yerel Geliştirme

Projeyi yerelde çalıştırmak için Node.js ve pnpm gereklidir:

```bash
# Bağımlılıkları yükleyin
pnpm install

# Geliştirme sunucusunu başlatın
pnpm dev
```

Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine gidin.

---

## 🚀 Dağıtım (Deployment)

Bu repo GitHub Actions ile doğrudan **GitHub Pages** ve **Vercel** üzerinde tek tıkla çalışacak şekilde yapılandırılmıştır.

- **GitHub Pages:** Reponuzun `Settings > Pages` bölümünde **Source** olarak `GitHub Actions` seçtiğinizde siteniz otomatik yayına girer.
- **Vercel:** GitHub reponuzu Vercel'e ekleyip doğrudan dağıtabilirsiniz.
