/**
 * Web & Haber Linki Çekici ve Ana Metin Ayıklayıcı (Article Parser)
 *
 * Özellikler:
 * 1. Çok katmanlı CORS Proxy zinciri (AllOrigins Raw, AllOrigins JSON, CorsProxy)
 * 2. Dinamik/SPA siteler için Jina AI Reader yedek motoru
 * 3. JSON-LD (NewsArticle, Article, BlogPosting) yapısal veri analizi
 * 4. DOM Temizleyici: Menü, reklam, ilgili haberler, sosyal medya ve gürültü filtreleme
 * 5. İçerik ve Paragraf Puanlayıcı (Link yoğunluğu ve noktalama analizi)
 * 6. Haber içi yönlendirme/reklam ("Google News'te takip edin", "Haberi görüntüle" vb.) temizleme
 */

export type ExtractedArticle = {
  title: string
  text: string
  sourceUrl: string
  wordCount: number
}

// Reklam, yönlendirme, sosyal medya ve gürültü satırları
const JUNK_LINE_PATTERNS = [
  /^(haberi\s+görüntüle|haberin\s+devamı|devamı\s+için\s+tıkla|ilgili\s+haber|benzer\s+haberler)/i,
  /^(bizi\s+google\s+news|google\s+news['’]?te\s+takip|abone\s+ol|yorum\s+yaz|paylaş|etiketler\s*:)/i,
  /^(kaynak\s*:\s*(aa|iha|dha|reuters|afp)|fotoğraf\s*:|tüm\s+hakları\s+saklıdır|copyright\s*©)/i,
  /^(son\s+güncelleme\s*:|yayınlanma\s+tarihi\s*:|okuma\s+süresi\s*:|reklam|advertisement|sponsored)/i,
  /^(whatsapp\s+kanal|bültenimize\s+abone|çerez\s+politikası|aydınlatma\s+metni|tıklayınız)/i,
]

// DOM ağacından silinecek gürültü seçicileri
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
  '.author-bio',
  '.author-box',
  '.yazar-kutusu',
  '.read-more',
  '.devami',
]

function normalizeWhitespace(str: string): string {
  return (str || '').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  if (typeof document === 'undefined') return str
  const txt = document.createElement('textarea')
  const withBreaks = String(str)
    .replace(/<\s*(?:br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  txt.innerHTML = withBreaks
  return txt.value
}

function cleanArticleTitle(rawTitle: string): string {
  let t = normalizeWhitespace(rawTitle)
  if (!t) return ''
  // Sonda yer alan " - Site Adı" veya " | Site Adı" eklerini kaldır
  const parts = t.split(/\s+[\|\-\–\—]\s+/)
  if (parts.length > 1 && parts[0].split(/\s+/).length >= 3) {
    t = parts[0].trim()
  }
  return t
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

function filterBoilerplateLines(rawLines: string[], articleTitle = ''): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const titleLower = (articleTitle || '').toLowerCase().trim()

  for (const raw of rawLines) {
    const line = normalizeWhitespace(raw)
    if (!line) continue

    const isHeading = /^#{1,4}\s+/.test(line)
    const cleanContent = line.replace(/^#{1,4}\s+/, '').trim()
    const lower = cleanContent.toLowerCase()

    if (cleanContent.length < 3) continue
    if (titleLower && (lower === titleLower || lower.replace(/[^a-z0-9çğıöşü]/gi, '') === titleLower.replace(/[^a-z0-9çğıöşü]/gi, ''))) {
      continue
    }

    // Reklam veya yönlendirme kalıplarını filtrele
    if (JUNK_LINE_PATTERNS.some((rx) => rx.test(lower))) {
      continue
    }

    if (
      cleanContent.length < 160 &&
      /(haber[iı]?\s*g[oö]r[uü]nt[uü]le|haberin\s*devam[ıi]|ilgili\s*haber|google\s*news|whatsapp\s*kanal|b[uü]ltenimize\s*abone|[cç]erez\s*politikas[ıi]|ayd[ıi]nlatma\s*metni|t[ıi]klay[ıi]n[ıi]z)/i.test(
        lower,
      )
    ) {
      continue
    }

    // Kısa ve cümle olmayan kırıntıları atla
    if (!isHeading && cleanContent.split(/\s+/).length <= 3 && !/[.!?…]$/.test(cleanContent)) {
      continue
    }

    if (seen.has(lower)) continue
    seen.add(lower)

    out.push(isHeading ? `# ${cleanContent}` : cleanContent)
  }

  return out
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
        result.headline = decodeHtmlEntities(obj.headline)
      }
      if (!result.description && typeof obj.description === 'string') {
        result.description = decodeHtmlEntities(obj.description)
      }
      if (typeof obj.articleBody === 'string') {
        const decoded = decodeHtmlEntities(obj.articleBody)
        if (decoded.length > result.articleBody.length) {
          result.articleBody = decoded
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
    } catch {
      // Regex kurtarma
      const match = raw.match(/"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (match) {
        try {
          const unescaped = JSON.parse(`"${match[1]}"`)
          const decoded = decodeHtmlEntities(unescaped)
          if (decoded.length > result.articleBody.length) {
            result.articleBody = decoded
          }
        } catch {}
      }
    }
  })

  return result
}

/**
 * DOM ağacındaki gürültü ve reklam elementlerini ayıklar
 */
function stripNoiseFromDom(doc: Document) {
  try {
    doc.querySelectorAll(REMOVE_SELECTORS.join(',')).forEach((el) => el.remove())
  } catch {}

  const noiseRegex =
    /(^|[\-_\s])(nav|navbar|menu|sidebar|footer|breadcrumb|comment|yorum|share|paylas|social|related|ilgili|benzer|reklam|advert|sponsor|banner|popup|modal|cookie|consent|newsletter|abone|tags|etiket|widget|most-read|cok-okunan|recommended|outbrain|taboola|read-more|haberi-goruntule)($|[\-_\s])/i

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
 * DOM içinde en olası makale bloğunu puanlayarak seçer
 */
function extractLinesViaDomScorer(doc: Document): string[] {
  if (!doc || !doc.body) return []

  const semanticSelectors = [
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
      addScore(el, Math.max(25, 90 - idx * 5))
    })
  })

  const paragraphs = Array.from(doc.querySelectorAll('p, div.paragraph, .text-block'))
  for (const p of paragraphs) {
    const text = normalizeWhitespace(p.textContent || '')
    if (text.length < 35) continue

    const linkDensity = calculateLinkDensity(p)
    if (linkDensity > 0.45) continue

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
    if (!isSubheading && linkDensity > 0.5 && text.length < 180) {
      continue
    }
    if (isSubheading && (text.length < 3 || text.length > 140 || linkDensity > 0.4)) {
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
 * Verilen HTML metninden ana makale başlığını ve gövdesini ayıklar.
 */
export function extractArticleFromHtml(html: string, pageUrl = ''): { title: string; text: string } {
  if (typeof window === 'undefined' && typeof DOMParser === 'undefined') {
    return { title: '', text: html }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  if (pageUrl && doc.head && !doc.querySelector('base')) {
    try {
      const baseEl = doc.createElement('base')
      baseEl.setAttribute('href', pageUrl)
      doc.head.insertBefore(baseEl, doc.head.firstChild)
    } catch {}
  }

  // 1. JSON-LD Verisi
  const jsonLdData = extractJsonLdData(doc)

  // 2. Başlık ve Spot
  const metaTitle =
    jsonLdData.headline ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
    doc.querySelector('article h1, main h1, h1.title, h1.news-title, h1')?.textContent ||
    doc.title ||
    ''
  const cleanTitle = cleanArticleTitle(metaTitle)

  const metaDesc =
    jsonLdData.description ||
    doc.querySelector('[itemprop="description"], .article-lead, .news-spot, .haber-spot, .spot, .lead')?.textContent ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    ''
  const cleanLead = normalizeWhitespace(metaDesc)

  // 3. Gürültüyü Temizle
  stripNoiseFromDom(doc)

  // 4. İçerik Adayları (JSON-LD vs DOM Scorer)
  const jsonLdLines = jsonLdData.articleBody
    ? filterBoilerplateLines(
        jsonLdData.articleBody.split(/\r?\n+/).map(normalizeWhitespace).filter(Boolean),
        cleanTitle,
      )
    : []

  const domLines = filterBoilerplateLines(extractLinesViaDomScorer(doc), cleanTitle)

  const countWords = (arr: string[]) => arr.join(' ').split(/\s+/).filter(Boolean).length
  const wJson = countWords(jsonLdLines)
  const wDom = countWords(domLines)

  let chosenLines = wDom >= 45 && wDom >= wJson * 0.75 ? domLines : wJson >= 25 ? jsonLdLines : domLines

  // Spot/Özeti en başa yerleştir (eğer zaten ilk cümlede yoksa)
  if (cleanLead && cleanLead.split(/\s+/).length >= 5 && cleanLead.length <= 400 && chosenLines.length > 0) {
    const firstLower = chosenLines[0].toLowerCase()
    const leadLower = cleanLead.toLowerCase()
    if (!firstLower.includes(leadLower.slice(0, 30)) && !leadLower.includes(firstLower.slice(0, 30))) {
      chosenLines.unshift(cleanLead)
    }
  }

  // Başlığı ekle
  const finalOutput: string[] = []
  if (cleanTitle) {
    finalOutput.push(cleanTitle)
  }
  for (const line of chosenLines) {
    const lineClean = line.replace(/^#+\s*/, '')
    if (cleanTitle && lineClean.toLowerCase() === cleanTitle.toLowerCase()) {
      continue
    }
    finalOutput.push(lineClean)
  }

  return {
    title: cleanTitle,
    text: finalOutput.join('\n\n'),
  }
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
 * Jina AI Reader ile JavaScript/SPA sitelerinden ana metni çeker (Yedek Motor)
 */
async function fetchViaJinaReader(targetUrl: string): Promise<{ title: string; text: string } | null> {
  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/${targetUrl}`, 14000, {
      headers: { Accept: 'text/plain' },
    })
    if (!res.ok) return null
    const raw = await res.text()
    if (!raw || raw.length < 60) return null

    let title = ''
    const titleMatch = raw.match(/^Title:\s*(.+)$/m)
    if (titleMatch) {
      title = cleanArticleTitle(titleMatch[1].trim())
    }

    const bodyClean = raw
      .replace(/^Title:.*$/gm, '')
      .replace(/^URL Source:.*$/gm, '')
      .replace(/^Published Time:.*$/gm, '')
      .replace(/^Markdown Content:\s*/gm, '')
      .replace(/!\[[^\]]*\]\([^\)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')

    const rawLines = bodyClean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const cleanLines = filterBoilerplateLines(rawLines, title)
    if (!cleanLines.length) return null

    const finalLines = title ? [title, ...cleanLines.map((l) => l.replace(/^#+\s*/, ''))] : cleanLines.map((l) => l.replace(/^#+\s*/, ''))

    return {
      title,
      text: finalLines.join('\n\n'),
    }
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

  // URL format kontrolü
  let parsedUrl: URL
  try {
    parsedUrl = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`)
  } catch {
    throw new Error('Geçersiz URL formatı. Lütfen "https://" ile başlayan tam linki girin.')
  }

  const targetUrl = parsedUrl.toString()

  // 1. Doğrudan veya Proxy ile HTML çekme denemeleri
  const proxyAttempts: Array<{ name: string; run: () => Promise<string> }> = [
    {
      name: 'AllOrigins',
      run: async () => {
        onStatus?.('Haber sayfası çekiliyor (AllOrigins)...')
        const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
        const res = await fetchWithTimeout(apiUrl, 12000)
        if (!res.ok) throw new Error('AllOrigins status ' + res.status)
        const data = await res.json()
        if (data && typeof data.contents === 'string' && data.contents.length > 100) {
          return data.contents
        }
        throw new Error('AllOrigins boş yanıt döndü')
      },
    },
    {
      name: 'AllOrigins Raw',
      run: async () => {
        onStatus?.('Haber sayfası çekiliyor (AllOrigins Raw)...')
        const apiUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
        const res = await fetchWithTimeout(apiUrl, 12000)
        if (!res.ok) throw new Error('AllOrigins Raw status ' + res.status)
        return await res.text()
      },
    },
    {
      name: 'CorsProxy',
      run: async () => {
        onStatus?.('Haber sayfası çekiliyor (CorsProxy)...')
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
        const res = await fetchWithTimeout(proxyUrl, 12000)
        if (!res.ok) throw new Error('CorsProxy status ' + res.status)
        return await res.text()
      },
    },
  ]

  let htmlContent = ''
  for (const attempt of proxyAttempts) {
    try {
      const res = await attempt.run()
      if (res && res.length > 120) {
        htmlContent = res
        break
      }
    } catch {
      // Bir sonraki proxy'ye geç
    }
  }

  // HTML ayıklamayı dene
  let extracted: { title: string; text: string } | null = null
  if (htmlContent) {
    onStatus?.('Ana metin ayıklanıyor ve reklamlar temizleniyor...')
    extracted = extractArticleFromHtml(htmlContent, targetUrl)
  }

  const wordCount = extracted?.text ? extracted.text.split(/\s+/).filter(Boolean).length : 0

  // Eğer HTML içeriğinden yeterli metin çıkmadıysa (< 35 kelime), Jina AI Reader yedek motorunu dene
  if (wordCount < 35) {
    onStatus?.('Dinamik web sayfası ana metin motoruyla çözümleniyor...')
    const jinaResult = await fetchViaJinaReader(targetUrl)
    if (jinaResult && jinaResult.text.split(/\s+/).filter(Boolean).length > wordCount) {
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
