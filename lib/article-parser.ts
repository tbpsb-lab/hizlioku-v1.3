/**
 * Web & Haber Linki Çekici ve Akıllı Ana Metin Ayıklayıcı (Smart Article Distiller)
 *
 * Chrome Okuma Modu (DOM Distiller) ve Mozilla Readability prensipleriyle çalışır:
 * 1. Sayfa başındaki döviz/piyasa bantlarını, paylaşım butonlarını ve tanıtım sloganlarını eler.
 * 2. Yazı sonundaki yazar imzasını ("Tüm yazıları için tıklayın"), sponsorlu reklamları
 *    (Taboola, Outbrain, RejuvaCare vb.), ilgili haber listelerini ve site alt bilgilerini (footer)
 *    kesin sınırla (cutoff) kesip atar.
 * 3. Ara başlıkları ("Bir 'Tek Adam' daha sandığa gömüldü!" vb.) otomatik tanır ve vurgular.
 * 4. Yapışık markdown hatalarını ("**Yarın**Cumhuriyet" -> "Yarın Cumhuriyet") ve tipografiyi onarır.
 * 5. Çok katmanlı CORS proxy ve dinamik SPA siteleri için Jina Reader desteği sunar.
 */

export type ExtractedArticle = {
  title: string
  text: string
  sourceUrl: string
  wordCount: number
}

// 1. Sayfa başındaki döviz, borsa, sosyal paylaşım ve tanıtım kalıpları
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
]

// 2. Makale bitişini (Cutoff) belirleyen kalıplar (Görüldüğü an makale sona erer!)
const POST_ARTICLE_CUTOFF_PATTERNS = [
  // Yazar imzası / arşiv linki
  /tüm\s+yazıları\s+için\s+tıklayın/i,
  /yazarın\s+(diğer|tüm)\s+yazıları/i,
  /yazar\s+hakkında/i,
  /diğer\s+yazıları\s+için/i,
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

// 3. Paragraf aralarına sıkışmış reklam veya yönlendirmeler
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
  s = s.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
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
 * Örn: "Bir 'Tek Adam' daha sandığa gömüldü!" veya "Tutuklandılar." (kısa ve tekil vurgu)
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
 * Ham Markdown veya metin çıktısını analiz eder:
 * - Başlığı izole eder
 * - Başlangıçtaki döviz, paylaşım, bülten gürültüsünü atar
 * - Makale bitişini (cutoff) tam zamanında yakalayıp sonrasındaki reklam/linkleri keser
 * - Ara başlıkları ve paragrafları düzenler
 */
export function cleanArticleMarkdown(rawMarkdown: string, pageUrl = ''): { title: string; text: string } {
  if (!rawMarkdown) return { title: '', text: '' }

  const sanitized = sanitizeTypographyAndMarkdown(rawMarkdown)
  const lines = sanitized
    .split(/\r?\n+/)
    .map((l) => normalizeWhitespace(l))
    .filter((l) => l.length > 0)

  if (lines.length === 0) return { title: '', text: '' }

  // 1. Başlık Tespiti
  let title = ''
  let startIndex = 0

  // İlk satır kısa ve temiz bir başlık niteliğinde mi?
  const firstLine = lines[0]
  const isFirstLineNoise = PRE_ARTICLE_NOISE_PATTERNS.some((rx) => rx.test(firstLine))
  if (!isFirstLineNoise && firstLine.length <= 90 && firstLine.split(/\s+/).length <= 12) {
    title = cleanArticleTitle(firstLine.replace(/^#+\s*/, ''))
    startIndex = 1
  }

  // 2. Makale Başlangıç Sınırını Bul (Döviz, Sosyal Medya vb. atla)
  let bodyStartIndex = -1
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]

    // Gürültü kalıbıysa atla
    if (PRE_ARTICLE_NOISE_PATTERNS.some((rx) => rx.test(line))) {
      continue
    }

    // Kısa ve anlamsız navigasyon kırıntılarını atla
    if (line.length < 15 && !/[.!?…]$/.test(line)) {
      continue
    }

    // Gerçek bir cümle veya anlatı paragrafı bulundu!
    bodyStartIndex = i
    break
  }

  if (bodyStartIndex === -1) {
    bodyStartIndex = startIndex
  }

  // 3. Makale Gövdesini Topla ve Bitiş Sınırında (Cutoff) Dur
  const bodyParagraphs: string[] = []
  const titleLower = title.toLowerCase()

  for (let i = bodyStartIndex; i < lines.length; i++) {
    const line = lines[i]
    const lineLower = line.toLowerCase()

    // Bitiş (Cutoff) tetiklendi mi? (Yazar sonu, sponsorlu içerik, outbrain, footer)
    if (POST_ARTICLE_CUTOFF_PATTERNS.some((rx) => rx.test(lineLower))) {
      break
    }

    // Paragraf arası reklam/yönlendirme satırıysa atla
    if (INLINE_JUNK_PATTERNS.some((rx) => rx.test(lineLower))) {
      continue
    }

    // Başlığın aynısı tekrar ediyorsa atla
    if (titleLower && (lineLower === titleLower || lineLower.replace(/[^a-z0-9çğıöşü]/gi, '') === titleLower.replace(/[^a-z0-9çğıöşü]/gi, ''))) {
      continue
    }

    // Çok kısa ve tek başına linkten ibaret satırları atla
    if (line.length < 25 && /(tıkla|buradan|devamı|resmi|abone|fotoğraf)/i.test(lineLower)) {
      continue
    }

    // Ara Başlık Kontrolü (RSVP okuyucusunda gereksiz '#' sembolü parlamaması için düz ve temiz metin olarak ekle)
    const cleanLine = line.replace(/^#+\s*/, '')
    const prev = bodyParagraphs[bodyParagraphs.length - 1] || ''
    const next = lines[i + 1] || ''
    if (isSubheadingCandidate(cleanLine, prev, next)) {
      // Eğer ara başlığın sonunda noktalama yoksa duraklama ritmi için sonuna nokta ekle
      const withPunctuation = /[.!?…:;]["”’»)]*$/.test(cleanLine) ? cleanLine : `${cleanLine}.`
      bodyParagraphs.push(withPunctuation)
    } else {
      bodyParagraphs.push(cleanLine)
    }
  }

  // 4. Nihai Metni Oluştur (Başlık ve paragraflar)
  const resultLines: string[] = []
  if (title) {
    const cleanTitleText = title.replace(/^#+\s*/, '')
    const titleWithPunctuation = /[.!?…:;]["”’»)]*$/.test(cleanTitleText)
      ? cleanTitleText
      : `${cleanTitleText}.`
    resultLines.push(titleWithPunctuation)
  }
  resultLines.push(...bodyParagraphs)

  return {
    title,
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

    if (isSubheading) {
      lines.push(`# ${text.replace(/^#+\s*/, '')}`)
    } else {
      lines.push(text)
    }
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
  const combinedWithTitle = cleanTitle ? `${cleanTitle}\n\n${rawContent}` : rawContent
  return cleanArticleMarkdown(combinedWithTitle, pageUrl)
}

async function fetchWithTimeout(url: string, timeoutMs = 12000, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Jina AI Reader ile JavaScript/SPA ve korumalı sitelerden ana metni çeker (Yedek Motor)
 */
async function fetchViaJinaReader(targetUrl: string): Promise<{ title: string; text: string } | null> {
  try {
    // Jina'ya reklam ve navigasyon elementlerini sunucu tarafında kaldırmasını söyle
    const headers: Record<string, string> = {
      Accept: 'text/plain',
      'X-Remove-Selector': 'header, footer, nav, aside, .doviz, .finance, .share, .social, .related, .author-footer, .outbrain, .taboola, .reklam',
    }

    const res = await fetchWithTimeout(`https://r.jina.ai/${targetUrl}`, 14000, { headers })
    if (!res.ok) return null
    const raw = await res.text()
    if (!raw || raw.length < 80) return null

    // Jina'nın döndürdüğü metni akıllı süzgeç ve cutoff motorundan geçir
    const cleaned = cleanArticleMarkdown(raw, targetUrl)
    return cleaned
  } catch {
    return null
  }
}

/**
 * Kullanıcıdan gelen linki CORS proxy zincirini sırayla deneyerek indirir ve ana metnini çıkarır.
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

  // 1. Çok katmanlı proxy denemeleri
  const proxyAttempts: Array<{ name: string; run: () => Promise<string> }> = [
    {
      name: 'AllOrigins',
      run: async () => {
        onStatus?.('Haber sayfası çekiliyor (AllOrigins)...')
        const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
        const res = await fetchWithTimeout(apiUrl, 10000)
        if (!res.ok) throw new Error('Status ' + res.status)
        const data = await res.json()
        if (data && typeof data.contents === 'string' && data.contents.length > 100) {
          return data.contents
        }
        throw new Error('Boş içerik')
      },
    },
    {
      name: 'AllOrigins Raw',
      run: async () => {
        onStatus?.('Haber sayfası çekiliyor (AllOrigins Raw)...')
        const apiUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
        const res = await fetchWithTimeout(apiUrl, 10000)
        if (!res.ok) throw new Error('Status ' + res.status)
        return await res.text()
      },
    },
    {
      name: 'CorsProxy',
      run: async () => {
        onStatus?.('Haber sayfası çekiliyor (CorsProxy)...')
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
        const res = await fetchWithTimeout(proxyUrl, 10000)
        if (!res.ok) throw new Error('Status ' + res.status)
        return await res.text()
      },
    },
  ]

  let extracted: { title: string; text: string } | null = null

  // Önce doğrudan HTML proxy'lerini dene
  for (const attempt of proxyAttempts) {
    try {
      const html = await attempt.run()
      if (html && html.length > 200) {
        onStatus?.('Sayfa analiz ediliyor ve ana metin ayıklanıyor...')
        const res = extractArticleFromHtml(html, targetUrl)
        const wCount = res.text.split(/\s+/).filter(Boolean).length
        if (wCount >= 45) {
          extracted = res
          break
        }
      }
    } catch {
      // Bir sonraki proxy'ye geç
    }
  }

  // Eğer HTML proxy'leri engellendiyse veya yeterli metin çıkmadıysa (< 45 kelime), Jina Reader motoruna geç
  const currentCount = extracted?.text ? extracted.text.split(/\s+/).filter(Boolean).length : 0
  if (currentCount < 45) {
    onStatus?.('Okuma motoru devrede (Gereksiz detaylar ve reklamlar eleniyor)...')
    const jinaResult = await fetchViaJinaReader(targetUrl)
    if (jinaResult && jinaResult.text.split(/\s+/).filter(Boolean).length > currentCount) {
      extracted = jinaResult
    }
  }

  if (!extracted || !extracted.text || extracted.text.trim().length < 25) {
    throw new Error(
      'Bu linkten okunabilir bir makale veya haber metni çekilemedi. Site erişim engeli koymuş olabilir veya sayfa metin içermiyor olabilir.',
    )
  }

  const finalWordCount = extracted.text.split(/\s+/).filter(Boolean).length

  return {
    title: extracted.title,
    text: extracted.text,
    sourceUrl: targetUrl,
    wordCount: finalWordCount,
  }
}
