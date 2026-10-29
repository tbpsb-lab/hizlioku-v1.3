'use client'

import { AlertCircle, Link2, Loader2, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SAMPLE_TEXT, tokenize } from '@/lib/rsvp'
import { fetchArticleFromUrl } from '@/lib/article-parser'

type TextSheetProps = {
  open: boolean
  initialText: string
  onClose: () => void
  onApply: (text: string) => void
}

export function TextSheet({ open, initialText, onClose, onApply }: TextSheetProps) {
  if (!open) return null
  return <TextSheetBody initialText={initialText} onClose={onClose} onApply={onApply} />
}

function TextSheetBody({ initialText, onClose, onApply }: Omit<TextSheetProps, 'open'>) {
  const [draft, setDraft] = useState(initialText)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const count = tokenize(draft).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, loading])

  const handleFetchAndRead = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const cleanUrl = url.trim()
    if (!cleanUrl || loading) return

    setLoading(true)
    setErrorMessage('')
    setStatusMessage('Haber bağlantısı kuruluyor...')

    try {
      const article = await fetchArticleFromUrl(cleanUrl, (msg) => {
        setStatusMessage(msg)
      })

      setDraft(article.text)
      setStatusMessage('')
      // Çekilen metni otomatik olarak RSVP okuma motoruna besle ve modalı kapat
      onApply(article.text)
    } catch (err: any) {
      setErrorMessage(err.message || 'Haber metni çekilirken bir hata oluştu.')
      setStatusMessage('')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchOnly = async () => {
    const cleanUrl = url.trim()
    if (!cleanUrl || loading) return

    setLoading(true)
    setErrorMessage('')
    setStatusMessage('Haber bağlantısı kuruluyor...')

    try {
      const article = await fetchArticleFromUrl(cleanUrl, (msg) => {
        setStatusMessage(msg)
      })
      setDraft(article.text)
      setStatusMessage('')
    } catch (err: any) {
      setErrorMessage(err.message || 'Haber metni çekilirken bir hata oluştu.')
      setStatusMessage('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Kapat"
        onClick={loading ? undefined : onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-sheet-title"
        className="panel panel-solid relative flex max-h-[90dvh] w-full max-w-2xl flex-col gap-3.5 rounded-b-none p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-300 sm:rounded-b-(--panel-radius) sm:p-5"
      >
        {/* Başlık ve Kapatma Butonu */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="text-sheet-title" className="text-base font-semibold tracking-tight">
              Okunacak Metin veya Web Linki
            </h2>
            <p className="text-xs text-muted-foreground">
              Bir haber/makale linki girerek ana metni çekin ya da doğrudan metin yapıştırın.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="ctl size-9 disabled:opacity-40"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Web Linki Giriş Alanı */}
        <form onSubmit={handleFetchAndRead} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (errorMessage) setErrorMessage('')
                }}
                disabled={loading}
                placeholder="https://... (Örn: BBC, Milliyet, Medium makalesi)"
                className="h-10 w-full rounded-[calc(var(--control-radius)*1.1)] border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleFetchOnly}
                disabled={loading || !url.trim()}
                title="Metni düzenleyiciye çek"
                className="ctl h-10 px-3 text-xs font-medium border border-border/80 disabled:opacity-40"
              >
                Metni Çek
              </button>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="ctl ctl-primary h-10 px-3.5 text-xs sm:text-sm font-semibold gap-1.5 disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Çekiliyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    <span>Linki Çek ve Oku</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Durum Göstergesi */}
          {statusMessage && (
            <div className="flex items-center gap-1.5 text-xs text-primary font-medium animate-pulse px-1">
              <Loader2 className="size-3 animate-spin shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Hata Bildirimi */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-[var(--control-radius)] bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive animate-in fade-in">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}
        </form>

        {/* Ayraç */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border/70" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            veya metni buraya yapıştırın
          </span>
          <div className="h-px flex-1 bg-border/70" />
        </div>

        {/* Metin Düzenleme Alanı */}
        <label htmlFor="reader-text" className="sr-only">
          Metin
        </label>
        <textarea
          id="reader-text"
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
          rows={8}
          className="min-h-36 w-full flex-1 resize-none rounded-[calc(var(--panel-radius)*0.6)] border border-border bg-background p-3 font-reader text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          placeholder="Metninizi buraya yapıştırın…"
        />

        {/* Alt Çubuk */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {count} kelime
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => setDraft(SAMPLE_TEXT)}
              className="ctl h-10 px-3 text-sm disabled:opacity-40"
            >
              Örnek
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setDraft('')}
              className="ctl h-10 px-3 text-sm disabled:opacity-40"
            >
              Temizle
            </button>
            <button
              type="button"
              disabled={count === 0 || loading}
              onClick={() => onApply(draft)}
              className="ctl ctl-primary h-10 px-4 text-sm font-semibold disabled:opacity-40"
            >
              Uygula
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
