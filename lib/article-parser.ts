/**
 * Web & Haber Linki Çekici ve Akıllı Ana Metin Ayıklayıcı (Smart Article Distiller)
 *
 * Chrome Okuma Modu (DOM Distiller) ve Mozilla Readability mimarisi:
 * 1. Sayfa başındaki tüm borsa, menü, sosyal medya ve yazar galerilerini doğrudan eler.
 * 2. Makalenin ana H1 başlığını bularak öncesindeki tüm HTML/Markdown navigasyonunu keser.
 * 3. Yazar adını (byline) tespit eder.
 * 4. Yazı bittiği anda (yazar imzası "Tüm yazıları için tıklayın", sponsorlu reklamlar,
 *    Outbrain, Taboola, alt bilgi / footer) derhal okumayı sonlandırır (cutoff).
 * 5. Ara başlıkları ("Bir 'Tek Adam' daha sandığa gömüldü!" vb.) otomatik tanır ve vurgular.
 * 6. Yapışık markdown hatalarını ("**Yarın**Cumhuriyet" -> "Yarın Cumhuriyet") ve tipografiyi onarır.
 */

export type ExtractedArticle = {
  title: string
  text: string
  sourceUrl: string
  wordCount: number
}

// Sayfa başındaki döviz, borsa, sosyal paylaşım, navigasyon ve menü kalıpları
const PRE_ARTICLE_NOISE_PATTERNS = [
  // Döviz, Altın, Kripto, Borsa, Faiz bantları
  /(dolar|euro|sterlin|bitcoin|altın|faiz|bist|borsa|parite|gümüş|kripto)\s*[:\s]?\s*\d+[,.]\d+/i,
  /(dolar|euro|sterlin|bitcoin|altın|faiz).*(%[-+]?\d+)/i,
  /%\s*[-+]?\d+[,.]\d+/,
  /\b\d{1,3}(\.\d{3})*,\d{2}\s*(tl|usd|eur|dolar|euro)?\s*\([-%+]/i,

  // Sosyal medya ve paylaşım düğmeleri
  /(facebook|twitter|x['’]?te|whatsapp|messenger|telegram|e-posta|linkedin|threads|instagram)\s+(ile\s+)?(paylaş|gönder|takip|paylaşın)/i,
  /^(paylaş|tweet|gönder|kaydet|yazdır|bağlantıyı\s+kopyala|paylaşın)$/i,
  /^\*\s*(facebook|messenger|e-posta|whatsapp|twitter|x)\s+/i,

  // Yayın tarihi ve meta bilgileri
  /^(yayınlanma|güncellenme|yayın\s*tarihi|son\s*güncelleme|haber\s*giriş|tarih|saat|okuma\s*süresi)\s*:/i,
  /^\d{1,2}\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+\d{4}(\s+\d{1,2}:\d{2})?$/i,

  // Tanıtım, algoritma, uygulama yönlendirme
  /(google\s*algoritma|google\s*news|haberimizden\s*anında|bildirimleri\s*aç|tıkla\s*ve\s*ekle|okuyacağınız\s*haberi|daha\s*fazla\s*bilgi\s*al)/i,
  /^(daha\s+fazla\s+bilgi\s+al|tıkla\s+öğren|abone\s+ol|tıklayın|uygulamayı\s+indir|son\s+dakika)$/i,

  // Site navigasyon menüleri ve butonları
  /^(son\s+dakika\.?|yazarlar\.?|gündem\.?|ekonomi\.?|dünya\.?|günlük\.?|günün\s+içinden\.?|spor\.?|hayat\.?|magazin\.?|finans\.?|teknoloji\.?|eğitim\.?|otomotiv\.?|e-gazete\.?|resmi\s+ilanlar\.?|sözcü\s+tv|giriş\s+yap|abone\s+ol)$/i,
  /^(yazıları\s+büyüt|yazıları\s+küçült|standart\s+boyut)$/i,
]

// Makale bitişini (Cutoff) belirleyen kalıplar (Görüldüğü an makale sona erer!)
const POST_ARTICLE_CUTOFF_PATTERNS = [
  // Yazar imzası / arşiv linki (Karakter kodlama bozukluklarına karşı esnek)
  /t[üu]?m\s*yaz[ıi]lar[ıi]?/i,
  /yazar[ıi]n\s+(di[ğg]?er|t[üu]?m)\s+yaz[ıi]lar[ıi]/i,
  /yazar\s+hakk[ıi]nda/i,
  /di[ğg]?er\s+yaz[ıi]lar[ıi]?\s*i[çc]in/i,
  /yaz.*t[ıi]?kla/i,
  /yazara\s+e-posta/i,

  // Sponsorlu reklam ağları (Outbrain, Taboola, RejuvaCare, Otto vb.)
  /\[?\s*sponsorlu(\s*içerik)?\s*\]?/i,
  /sponsorlusponsorlu/i,
  /ad\.rejuvacare/i,
  /ottoinsurance/i,
  /outbrain/i,
  /taboola/i,
  /advertorial/i,
  /tanıtım\s+yazısı/i,
  /ilginizi\s+çekebilir/i,
  /tavsiye\s+edilen\s+(haberler|içerikler)/i,
  /önerilen\s+içerik/i,

  // İlgili haberler listesi
  /benzer\s+haberler/i,
  /ilgili\s+haberler/i,
  /günün\s+manşetleri/i,
  /en\s+çok\s+okunanlar/i,
  /günün\s+içinden\s+haberler/i,
  /sıradaki\s+haber/i,

  // Footer, künye, hukuki metinler
  /yerel\s+seçim\s+sonuçları/i,
  /seçim\s+sonuçları/i,
  /sözcü\s+web\s+tv/i,
  /kişisel\s+verileri\s+koruma/i,
  /kvkk/i,
  /gizlilik\s+politikası/i,
  /çerez\s+politikası/i,
  /telif\s+hakkı.*aittir/i,
  /iktibas\s+edilemez/i,
  /tüm\s+hakları\s+saklıdır/i,
  /all\s+rights\s+reserved/i,
]

// Paragraf aralarına sıkışmış reklam veya yönlendirmeler
const INLINE_JUNK_PATTERNS = [
  /^(haberi\s+görüntüle|haberin\s+devamı|devamı\s+için\s+tıkla|ilgili\s+haber)/i,
  /^(bizi\s+google\s+news|google\s+news['’]?te\s+takip|abone\s+ol|yorum\s+yaz)/i,
  /^(reklam|advertisement|sponsored|fotoğraf\s*:|kaynak\s*:)/i,
  /^(whatsapp\s+kanal|bültenimize\s+abone|tıklayınız)/i,
]

// DOM ağacından peşinen silinecek elementler
const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'form',
  'nav',
  'footer',
  'aside',
  'button',
  'input',
  'select',
  'textarea',
  'dialog',
  'menu',
  'figcaption',
  'header:not(article header)',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
  '.ad',
  '.ads',
  '.advert',
  '.advertisement',
  '.reklam',
  '.sponsor',
  '.sponsored',
  '.related',
  '.related-news',
  '.related-posts',
  '.related-articles',
  '.ilgili-haber',
  '.ilgili-haberler',
  '.benzer-haberler',
  '.cok-okunanlar',
  '.populer-haberler',
  '.recommended',
  '.more-stories',
  '.comments',
  '.comment-section',
  '.yorumlar',
  '#comments',
  '#disqus_thread',
  '.share',
  '.social',
  '.social-share',
  '.paylas',
  '.etiketler',
  '.tags',
  '.tag-list',
  '.breadcrumb',
  '.breadcrumbs',
  '.pagination',
  '.newsletter',
  '.abone',
  '.cookie',
  '.consent',
  '.popup',
  '.modal',
  '.sidebar',
  '.widget',
  '.doviz',
  '.piyasa',
  '.finance',
  '.ticker',
  '.market-data',
  '.author-bio',
  '.author-box',
  '.yazar-kutusu',
  '.yazar-footer',
  '.yazar-diger',
  '.read-more',
  '.devami',
  '.outbrain',
  '.taboola',
  '.criteo',
]

function normalizeWhitespace(str: string): string {
  return (str || '').replace(/\s+/g, ' ').trim()
}

/**
 * Yapışık markdown, tırnak, parantez ve link artıklarını RSVP motorunun
 * rahat okuyacağı akıcı metne dönüştürür.
 */
export function sanitizeTypographyAndMarkdown(raw: string): string {
  let s = raw

  // 1. Yapışık markdown kalınlaştırmalarını çöz: "**Yarın**Cumhuriyet" -> "Yarın Cumhuriyet"
  s = s.replace(/\*\*([^*]+)\*\*([a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g, '$1 $2')
  s = s.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ0-9])\*\*([^*]+)\*\*/g, '$1 $2')
  s = s.replace(/;[*_]{2,6}/g, '; ')

  // 2. Tırnak ve parantez yapışıklıklarını çöz: '“Tek Adam”daha' -> '“Tek Adam” daha'
  s = s.replace(/([”"»)])([a-zA-ZçğıöşüÇĞİÖŞÜ])/g, '$1 $2')
  s = s.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ])([“"«(])/g, '$1 $2')

  // 3. Boş ve gömülü markdown linklerini temizle
  s = s.replace(/\[\s*\]\([^\)]*\)/g, '')
  s = s.replace(/!\[[^\]]*\]\([^\)]*\)/g, '')

  // 4. Kalan markdown yıldız/altçizgi işaretlerini temizle
  s = s.replace(/(^|[^\*])\*{1,3}([^\*]+)\*{1,3}([^\*]|$)/g, '$1$2$3')
  s = s.replace(/(^|[^_])_{1,3}([^_]+)_{1,3}([^_]|$)/g, '$1$2$3')

  // 5. Liste madde işaretlerini kaldır
  s = s.replace(/^[\*\-\•]\s+/gm, '')

  return s
}

/**
 * Bir satırın ara başlık (subheading) olup olmadığını tespit eder.
 * Örn: "Bir 'Tek Adam' daha sandığa gömüldü!"
 */
function isSubheadingCandidate(line: string, prevLine = '', nextLine = ''): boolean {
  const clean = normalizeWhitespace(line.replace(/^#+\s*/, ''))
  if (clean.length < 5 || clean.length > 85) return false

  const words = clean.split(/\s+/)
  if (words.length > 12) return false

  // Eğer zaten belirgin bir anlatı paragrafının parçasıysa başlık sayma
  if (clean.length > 50 && /[.]$/.test(clean) && !/[!?:]$/.test(clean) && !/["”’]/.test(clean)) {
    return false
  }

  // Güçlü ara başlık sinyalleri:
  // 1. Tırnak içeren ve ünlemle biten satırlar ("Bir 'Tek Adam' daha sandığa gömüldü!")
  // 2. Ünlem veya soru işaretiyle biten kısa cümleler
  // 3. İki nokta üst üste ile biten satırlar
  // 4. Başlık formatında (Title Case veya ALL CAPS)
  if (/[!?:]$/.test(clean) && words.length <= 10) return true
  if (/^["“«]/.test(clean) && /["”»][!?]?$/.test(clean)) return true
  if (clean === clean.toUpperCase() && words.length <= 8 && words.length >= 2) return true

  return false
}

function cleanArticleTitle(rawTitle: string): string {
  let t = normalizeWhitespace(rawTitle)
  if (!t) return ''
  // Sonda yer alan " - Sözcü Gazetesi", " | Milliyet" gibi site eklerini kaldır
  const parts = t.split(/\s+[\|\-\–\—]\s+/)
  if (parts.length > 1 && parts[0].split(/\s+/).length >= 2) {
    t = parts[0].trim()
  }
  return t
}

/**
 * Chrome Okuma Modu (DOM Distiller / Readability) mimarisiyle metni damıtır:
 * 1. Sayfa başındaki tüm borsa bantları, menüler, sosyal medya ve yazar galerilerini eler.
 * 2. Makalenin asıl H1 başlığını tespit eder.
 * 3. Asıl anlatı başlangıcını (Story Start Anchor) tespit ederek öncesindeki tüm kırıntıları keser.
 * 4. Yazar adını (byline) tekil olarak doğrular, yazar galerilerini (Emin Çölaşan, Rahmi Turan...) eler.
 * 5. Yazı bittiği ilk anda (yazar imzası, sponsorlu reklamlar, outbrain vb.) okumayı sonlandırır (cutoff).
 * 6. Boş ve kırık markdown linklerini bütünüyle yok eder.
 */
export function cleanArticleMarkdown(rawMarkdown: string, pageUrl = ''): { title: string; text: string } {
  if (!rawMarkdown) return { title: '', text: '' }

  // 1. Jina AI başlık ve meta satırlarını yakala
  let metaTitle = ''
  const mTitle = rawMarkdown.match(/^Title:\s*(.+)$/m)
  if (mTitle) {
    metaTitle = cleanArticleTitle(mTitle[1].trim())
  }

  let workingText = rawMarkdown

  // Jina'nın 'Markdown Content:' başlığından öncesini (URL Source, Published Time vb.) at
  const mdIdx = workingText.indexOf('Markdown Content:')
  if (mdIdx >= 0) {
    workingText = workingText.substring(mdIdx + 17)
  }

  // 2. Makalenin Asıl H1 Başlığını Tespit Et ve Öncesini Kes
  let detectedTitle = metaTitle
  const h1Match = workingText.match(/(?:^|\n)#\s+([^\n]+)/)
  if (h1Match && h1Match[1] && h1Match.index !== undefined) {
    const candidate = cleanArticleTitle(h1Match[1].trim())
    // Eğer başlık jenerik bir site adı ("Sözcü", "Haberler", "Son Dakika") değilse asıl makale başlığıdır
    if (candidate.length > 3 && !/^(sözcü|haberler|anasayfa|son\s+dakika)$/i.test(candidate)) {
      detectedTitle = candidate
      workingText = workingText.substring(h1Match.index + h1Match[0].length)
    }
  }

  // 3. Tipografiyi, yapışık markdown öğelerini ve gereksiz linkleri temizle
  let s = workingText
  // Boş ve buton/takip linklerini tamamen yok et
  s = s.replace(/\[\s*\]\([^\)]*\)/g, '')
  s = s.replace(/!\[[^\]]*\]\([^\)]*\)/g, '')
  s = s.replace(/\[[^\]]*\]\((?:https?:\/\/(?:bit\.ly|apps\.apple\.com|play\.google\.com|appgallery\.huawei\.com)[^\)]*)\)/gi, '')
  // Normal linkleri düz metne çevir: [Necati Doğru](https://...) -> Necati Doğru
  s = s.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')

  // Tipografi ve yapışıklık düzeltmeleri
  s = s.replace(/\*\*([^*]+)\*\*([a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g, '$1 $2')
  s = s.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ0-9])\*\*([^*]+)\*\*/g, '$1 $2')
  s = s.replace(/;[*_]{2,6}/g, '; ')
  s = s.replace(/([”"»)])([a-zA-ZçğıöşüÇĞİÖŞÜ])/g, '$1 $2')
  s = s.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ])([“"«(])/g, '$1 $2')
  s = s.replace(/(^|[^\*])\*{1,3}([^\*]+)\*{1,3}([^\*]|$)/g, '$1$2$3')
  s = s.replace(/(^|[^_])_{1,3}([^_]+)_{1,3}([^_]|$)/g, '$1$2$3')
  s = s.replace(/^[\*\-\•]\s+/gm, '')

  const rawLines = s
    .split(/\r?\n+/)
    .map((l) => normalizeWhitespace(l))
    .filter((l) => l.length > 0)

  if (rawLines.length === 0) {
    return { title: detectedTitle, text: detectedTitle }
  }

  // Eğer H1 bulunamadıysa ilk anlamlı satırı başlık olarak al
  if (!detectedTitle && rawLines.length > 0) {
    detectedTitle = cleanArticleTitle(rawLines[0].replace(/^#+\s*/, ''))
  }

  const noiseRegex =
    /(mailto:|whatsapp|facebook|messenger|twitter|x['’]?te|yazıları\s+büyüt|yazıları\s+küçült|standart\s+boyut|google\s+algoritmasına|tıkla\s+ve\s+ekle|haberimizden\s+anında|bildirimleri\s+aç|son\s+dakika|yazarlar|gündem|ekonomi|dünya|spor|hayat|magazin|finans|eğitim|resmi\s+ilan|sözcü\s+tv|giriş\s+yap|abone\s+ol|daha\s+fazla\s+bilgi\s+al)/i

  const isNoiseLine = (line: string): boolean => {
    const lower = line.toLowerCase()
    if (noiseRegex.test(line)) return true
    if (PRE_ARTICLE_NOISE_PATTERNS.some((rx) => rx.test(lower))) return true
    if (/^\[\s*\]/.test(line)) return true
    // "SON DAKİKA.", "GÜNÜN İÇİNDEN." gibi nokta ile bitse bile menü olan büyük harfli kısa kelimeler
    const words = line.split(/\s+/).filter(Boolean)
    if (words.length <= 3 && /^[A-ZÇĞİÖŞÜ\s\.\,\-]+$/.test(line) && !line.includes('CHP') && !line.includes('AKP') && !line.includes('TBMM')) {
      return true
    }
    return false
  }

  // 4. Hikaye / Makale Başlangıç Çapasını (Story Start Anchor) Kesin Olarak Bul
  // Chrome Okuma Modu kuralı:
  // Bir makale başlangıcı menü, borsa, yazar galerisi veya sosyal buton olamaz!
  // En az 25 karakter, en az 5 kelime ve anlatı formatında nokta/ünlem/soru/tırnak içeren İLK satırdır.
  let storyStartIdx = -1
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i]
    if (isNoiseLine(l)) continue
    if (detectedTitle && l.toLowerCase() === detectedTitle.toLowerCase()) continue

    const words = l.split(/\s+/).filter(Boolean)
    // 3 veya daha az kelimeden oluşan tekil isim veya buton satırlarını atla
    if (words.length <= 3 && !/[.!?…:;]["”’»)]*$/.test(l)) continue

    // Gerçek bir anlatı paragrafı şartı
    if (l.length >= 25 && words.length >= 5 && /[.!?…]["”’»)]*$/.test(l)) {
      storyStartIdx = i
      break
    }
  }

  if (storyStartIdx === -1) {
    storyStartIdx = 0
  }

  // 5. Yazar Adını (Byline) Bul
  // Başlığın hemen ardından veya hikaye başlangıcından önceki satırlarda tekil bir kişi ismi ara.
  // Eğer ardışık birden fazla isim varsa o bir 'Yazar Galerisi'dir (Emin Çölaşan, Rahmi Turan vb.) ve elenir!
  let authorByline = ''
  for (let k = 0; k < Math.min(storyStartIdx, 5); k++) {
    const cand = rawLines[k]
    if (isNoiseLine(cand)) continue
    if (detectedTitle && cand.toLowerCase() === detectedTitle.toLowerCase()) continue

    const words = cand.split(/\s+/).filter(Boolean)
    if (words.length >= 2 && words.length <= 3 && cand.length >= 4 && cand.length <= 35 && !/[.!?…:;]$/.test(cand)) {
      // Bir sonraki satır da isimse bu bir yazar galerisidir (carousel), tekil yazar değildir!
      const nextIsName =
        k + 1 < rawLines.length &&
        rawLines[k + 1].split(/\s+/).filter(Boolean).length <= 3 &&
        !/[.!?…:;]$/.test(rawLines[k + 1])
      if (!nextIsName) {
        authorByline = cand
        break
      }
    }
  }

  // 6. Gövde Paragraflarını Topla (Bitiş Sınırında - Cutoff - Dur)
  const bodyParagraphs: string[] = []
  const titleLower = detectedTitle.toLowerCase()

  for (let i = storyStartIdx; i < rawLines.length; i++) {
    const line = rawLines[i]
    const lower = line.toLowerCase()

    // Bitiş (Cutoff) tetiklendi mi?
    // 1. Yazar adı ve yazı kelimesi geçiyorsa (Örn: "Necati Doğru Tüm yazıları için tıklayın")
    if (authorByline && lower.includes(authorByline.toLowerCase()) && lower.includes('yaz')) {
      break
    }
    // 2. Sponsorlu içerik, outbrain, taboola, telif hakkı veya footer kalıpları
    if (POST_ARTICLE_CUTOFF_PATTERNS.some((rx) => rx.test(lower))) {
      break
    }

    // Paragraf içi reklam/gürültü/yönlendirme satırıysa atla
    if (isNoiseLine(line) || INLINE_JUNK_PATTERNS.some((rx) => rx.test(lower))) {
      continue
    }

    // Başlığın veya yazarın aynısı tekrar ediyorsa atla
    if (titleLower && (lower === titleLower || lower.replace(/[^a-z0-9çğıöşü]/gi, '') === titleLower.replace(/[^a-z0-9çğıöşü]/gi, ''))) {
      continue
    }
    if (authorByline && lower === authorByline.toLowerCase()) {
      continue
    }

    // Ara Başlık Kontrolü (RSVP okuyucusunda gereksiz '#' sembolü parlamaması için düz ve temiz metin olarak ekle)
    const cleanLine = line.replace(/^#+\s*/, '')
    const prev = bodyParagraphs[bodyParagraphs.length - 1] || ''
    const next = rawLines[i + 1] || ''

    if (isSubheadingCandidate(cleanLine, prev, next)) {
      const withPunctuation = /[.!?…:;]["”’»)]*$/.test(cleanLine) ? cleanLine : `${cleanLine}.`
      bodyParagraphs.push(withPunctuation)
    } else {
      bodyParagraphs.push(cleanLine)
    }
  }

  // 7. Nihai Çıktıyı Birleştir
  const resultLines: string[] = []
  if (detectedTitle) {
    resultLines.push(detectedTitle)
  }
  if (authorByline) {
    resultLines.push(authorByline)
  }
  resultLines.push(...bodyParagraphs)

  return {
    title: detectedTitle,
    text: resultLines.join('\n\n'),
  }
}

function calculateLinkDensity(el: Element): number {
  const totalLen = (el.textContent || '').replace(/\s+/g, '').length
  if (totalLen === 0) return 0
  let linkLen = 0
  el.querySelectorAll('a').forEach((a) => {
    linkLen += (a.textContent || '').replace(/\s+/g, '').length
  })
  return linkLen / totalLen
}

/**
 * DOM ağacındaki gürültü ve reklam elementlerini ayıklar
 */
function stripNoiseFromDom(doc: Document) {
  try {
    doc.querySelectorAll(REMOVE_SELECTORS.join(',')).forEach((el) => el.remove())
  } catch {}

  const noiseRegex =
    /(^|[\-_\s])(nav|navbar|menu|sidebar|footer|breadcrumb|comment|yorum|share|paylas|social|related|ilgili|benzer|reklam|advert|sponsor|banner|popup|modal|cookie|consent|newsletter|abone|tags|etiket|widget|doviz|piyasa|finance|ticker|outbrain|taboola|most-read|cok-okunan|read-more|haberi-goruntule)($|[\-_\s])/i

  const containers = Array.from(doc.querySelectorAll('div, section, ul, ol, aside'))
  for (const el of containers) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'body' || tag === 'main' || tag === 'article') continue
    if (el.querySelector('article, [itemprop="articleBody"]')) continue

    const attrStr = `${el.className || ''} ${el.id || ''}`
    if (noiseRegex.test(attrStr)) {
      el.remove()
    }
  }
}

/**
 * DOM içinde Chrome Okuma Modu mantığıyla ana içerik konteynerini bulur
 */
function extractLinesViaDomScorer(doc: Document): string[] {
  if (!doc || !doc.body) return []

  const semanticSelectors = [
    '.author-content',
    '.yazar-detay',
    '.content-text',
    '[itemprop="articleBody"]',
    'article .article-body',
    'article .news-body',
    'article .haber-metni',
    'article .detay-metin',
    '.article-body',
    '.article-content',
    '.news-content',
    '.news-body',
    '.haber-detay',
    '.haber-metni',
    '.detay-icerik',
    '.post-content',
    '.entry-content',
    '.story-body',
    'article',
    'main',
  ]

  const candidates = new Map<Element, number>()
  const addScore = (node: Element | null, pts: number) => {
    if (!node || node.nodeType !== 1) return
    candidates.set(node, (candidates.get(node) || 0) + pts)
  }

  semanticSelectors.forEach((sel, idx) => {
    doc.querySelectorAll(sel).forEach((el) => {
      addScore(el, Math.max(30, 100 - idx * 5))
    })
  })

  const paragraphs = Array.from(doc.querySelectorAll('p, div.paragraph, .text-block'))
  for (const p of paragraphs) {
    const text = normalizeWhitespace(p.textContent || '')
    if (text.length < 35) continue

    const linkDensity = calculateLinkDensity(p)
    if (linkDensity > 0.4) continue

    const commaCount = (text.match(/[,;:]/g) || []).length
    const wordCount = text.split(/\s+/).length
    const score = 10 + Math.min(35, Math.floor(wordCount / 4)) + commaCount * 3

    const parent = p.parentElement
    const grandParent = parent ? parent.parentElement : null
    if (parent) addScore(parent, score)
    if (grandParent) addScore(grandParent, Math.floor(score * 0.55))
  }

  let bestContainer: Element = doc.querySelector('article, [itemprop="articleBody"], main') || doc.body
  let bestScore = -1

  for (const [container, rawScore] of candidates.entries()) {
    const linkDensity = calculateLinkDensity(container)
    const finalScore = rawScore * (1 - Math.min(0.85, linkDensity))
    if (finalScore > bestScore) {
      bestScore = finalScore
      bestContainer = container
    }
  }

  const lines: string[] = []
  const seen = new Set<string>()
  const blocks = Array.from(bestContainer.querySelectorAll('h2, h3, h4, p, blockquote, li'))

  if (blocks.length === 0) {
    return (bestContainer.textContent || '')
      .split(/\r?\n+/)
      .map(normalizeWhitespace)
      .filter((l) => l.length > 0)
  }

  for (const block of blocks) {
    if (block.tagName !== 'LI' && block.querySelector('p, h2, h3')) continue

    const linkDensity = calculateLinkDensity(block)
    const text = normalizeWhitespace(block.textContent || '')
    if (!text) continue

    const tag = block.tagName.toLowerCase()
    const isSubheading = tag === 'h2' || tag === 'h3' || tag === 'h4'

    if (tag === 'li' && (text.length < 35 || linkDensity > 0.35 || !/[.!?…]$/.test(text))) {
      continue
    }
    if (!isSubheading && linkDensity > 0.45 && text.length < 180) {
      continue
    }
    if (isSubheading && (text.length < 3 || text.length > 140 || linkDensity > 0.35)) {
      continue
    }

    const normKey = text.toLowerCase()
    if (seen.has(normKey)) continue
    seen.add(normKey)

    lines.push(text)
  }

  return lines
}

/**
 * Sayfadaki <script type="application/ld+json"> etiketlerinden NewsArticle verilerini toplar
 */
function extractJsonLdData(doc: Document): { headline: string; description: string; articleBody: string } {
  const result = { headline: '', description: '', articleBody: '' }
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')

  const inspectObject = (obj: any) => {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      obj.forEach(inspectObject)
      return
    }
    if (obj['@graph'] && Array.isArray(obj['@graph'])) {
      obj['@graph'].forEach(inspectObject)
    }

    const typeVal = Array.isArray(obj['@type'])
      ? obj['@type'].join(' ')
      : String(obj['@type'] || '')
    const isArticle =
      /Article|NewsArticle|BlogPosting|Reportage|Analysis|Opinion|WebPage/i.test(typeVal) ||
      Boolean(obj.articleBody)

    if (isArticle) {
      if (!result.headline && typeof obj.headline === 'string') {
        result.headline = obj.headline
      }
      if (!result.description && typeof obj.description === 'string') {
        result.description = obj.description
      }
      if (typeof obj.articleBody === 'string') {
        if (obj.articleBody.length > result.articleBody.length) {
          result.articleBody = obj.articleBody
        }
      }
    }
  }

  scripts.forEach((scr) => {
    const raw = (scr.textContent || '').trim()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      inspectObject(parsed)
    } catch {}
  })

  return result
}

/**
 * Ham HTML metninden ana makaleyi arındırarak ayıklar
 */
export function extractArticleFromHtml(html: string, pageUrl = ''): { title: string; text: string } {
  if (typeof window === 'undefined' && typeof DOMParser === 'undefined') {
    return cleanArticleMarkdown(html, pageUrl)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 1. JSON-LD Kontrolü
  const jsonLdData = extractJsonLdData(doc)

  // 2. Başlık ve Spot
  const metaTitle =
    jsonLdData.headline ||
    doc.querySelector('article h1, main h1, h1.title, h1.news-title, h1.author-title, h1')?.textContent ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
    doc.title ||
    ''
  const cleanTitle = cleanArticleTitle(metaTitle)

  // 3. Gürültüyü Temizle
  stripNoiseFromDom(doc)

  // 4. İçerik Adayları (DOM Scorer vs JSON-LD)
  let rawContent = ''
  if (jsonLdData.articleBody && jsonLdData.articleBody.split(/\s+/).length > 60) {
    rawContent = jsonLdData.articleBody
  } else {
    const domLines = extractLinesViaDomScorer(doc)
    rawContent = domLines.join('\n\n')
  }

  // 5. İçeriği Semantik Temizleyici (Cutoff & Süzgeç) Motorundan Geçir
  const combinedWithTitle = cleanTitle ? `# ${cleanTitle}\n\n${rawContent}` : rawContent
  return cleanArticleMarkdown(combinedWithTitle, pageUrl)
}

async function fetchWithTimeout(url: string, timeoutMs = 8000, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Çok katmanlı paralel yarıştırma motoru (Fast-Race Engine).
 * Tüm proxy'leri (Jina, CodeTabs, CorsProxy, AllOrigins ve Direct) aynı milisaniyede paralel çalıştırır.
 * En hızlı ve geçerli ana metin üreten ilk sonuç (genellikle 1 sn içinde) anında kazanır;
 * yavaş kalan diğer bağlantılar otomatik iptal edilir.
 */
export async function fetchArticleFromUrl(
  urlInput: string,
  onStatus?: (status: string) => void,
): Promise<ExtractedArticle> {
  const cleanUrl = urlInput.trim()
  if (!cleanUrl) {
    throw new Error('Lütfen geçerli bir web sitesi veya haber linki girin.')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`)
  } catch {
    throw new Error('Geçersiz URL formatı. Lütfen "https://" ile başlayan tam linki girin.')
  }

  const targetUrl = parsedUrl.toString()
  onStatus?.('En hızlı sunucu taranıyor ve metin çekiliyor...')

  const globalAbort = new AbortController()
  const encoded = encodeURIComponent(targetUrl)

  // Yarışmacılar: Her biri geçerli bir ExtractedArticle döndürmek zorundadır (en az 40 kelime).
  // Yetersiz metin veya hata durumunda Promise reject olur, böylece Promise.any kazananı seçebilir.
  const racers: Array<{ name: string; run: () => Promise<{ title: string; text: string }> }> = [
    // 1. Jina AI Reader (Haber sitelerinde 1 sn içinde headless render ile en temiz ve hızlı sonuç)
    {
      name: 'Jina Reader',
      run: async () => {
        const res = await fetchWithTimeout(`https://r.jina.ai/${targetUrl}`, 6500, {
          headers: {
            Accept: 'text/plain',
            'X-Remove-Selector':
              'header, footer, nav, aside, .doviz, .finance, .share, .social, .related, .author-footer, .outbrain, .taboola, .reklam',
          },
          signal: globalAbort.signal,
        })
        if (!res.ok) throw new Error('Jina HTTP ' + res.status)
        const raw = await res.text()
        if (!raw || raw.length < 80) throw new Error('Jina boş içerik')
        const cleaned = cleanArticleMarkdown(raw, targetUrl)
        const wCount = cleaned.text.split(/\s+/).filter(Boolean).length
        if (wCount < 40) throw new Error('Jina yetersiz metin')
        return cleaned
      },
    },
    // 2. CodeTabs CORS Proxy (HTML Doğrudan Ayrıştırma)
    {
      name: 'CodeTabs',
      run: async () => {
        const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encoded}`, 5500, {
          signal: globalAbort.signal,
        })
        if (!res.ok) throw new Error('CodeTabs HTTP ' + res.status)
        const html = await res.text()
        if (!html || html.length < 200) throw new Error('CodeTabs boş içerik')
        const cleaned = extractArticleFromHtml(html, targetUrl)
        const wCount = cleaned.text.split(/\s+/).filter(Boolean).length
        if (wCount < 40) throw new Error('CodeTabs yetersiz metin')
        return cleaned
      },
    },
    // 3. CorsProxy.io (HTML Doğrudan Ayrıştırma)
    {
      name: 'CorsProxy',
      run: async () => {
        const res = await fetchWithTimeout(`https://corsproxy.io/?url=${encoded}`, 5500, {
          signal: globalAbort.signal,
        })
        if (!res.ok) throw new Error('CorsProxy HTTP ' + res.status)
        const html = await res.text()
        if (!html || html.length < 200) throw new Error('CorsProxy boş içerik')
        const cleaned = extractArticleFromHtml(html, targetUrl)
        const wCount = cleaned.text.split(/\s+/).filter(Boolean).length
        if (wCount < 40) throw new Error('CorsProxy yetersiz metin')
        return cleaned
      },
    },
    // 4. AllOrigins Raw (HTML Doğrudan Ayrıştırma)
    {
      name: 'AllOrigins',
      run: async () => {
        const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encoded}`, 6000, {
          signal: globalAbort.signal,
        })
        if (!res.ok) throw new Error('AllOrigins HTTP ' + res.status)
        const html = await res.text()
        if (!html || html.length < 200) throw new Error('AllOrigins boş içerik')
        const cleaned = extractArticleFromHtml(html, targetUrl)
        const wCount = cleaned.text.split(/\s+/).filter(Boolean).length
        if (wCount < 40) throw new Error('AllOrigins yetersiz metin')
        return cleaned
      },
    },
    // 5. Doğrudan Tarayıcı İsteği (Direct Fetch - CORS kısıtlaması olmayan sitelerde 200ms)
    {
      name: 'Direct',
      run: async () => {
        const res = await fetchWithTimeout(targetUrl, 2500, {
          signal: globalAbort.signal,
        })
        if (!res.ok) throw new Error('Direct HTTP ' + res.status)
        const html = await res.text()
        if (!html || html.length < 200) throw new Error('Direct boş içerik')
        const cleaned = extractArticleFromHtml(html, targetUrl)
        const wCount = cleaned.text.split(/\s+/).filter(Boolean).length
        if (wCount < 40) throw new Error('Direct yetersiz metin')
        return cleaned
      },
    },
  ]

  try {
    // Promise.any: Yarışmacılardan en hızlı ve geçerli metin çıkaran ilk yanıt anında döner!
    const winner = await Promise.any(
      racers.map(async (racer) => {
        try {
          const res = await racer.run()
          return { ...res, source: racer.name }
        } catch (err) {
          throw err
        }
      }),
    )

    // Kazanan belirlendi; arka planda çalışan diğer yavaş proxy isteklerini derhal iptal et
    try {
      globalAbort.abort()
    } catch {}

    const finalWordCount = winner.text.split(/\s+/).filter(Boolean).length

    return {
      title: winner.title,
      text: winner.text,
      sourceUrl: targetUrl,
      wordCount: finalWordCount,
    }
  } catch (allErrors: any) {
    throw new Error(
      'Bu linkten okunabilir bir makale veya haber metni çekilemedi. Site erişim engeli koymuş olabilir veya sayfa metin içermiyor olabilir.',
    )
  }
}
