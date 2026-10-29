'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { splitAtPivot } from '@/lib/rsvp'
import { useElementSize } from '@/lib/use-element-size'

type RsvpDisplayProps = {
  word: string
  playing: boolean
  wpm: number
  fontFamily?: string
  fontScale: number
  maxSide: number
  onToggle: () => void
}

export function RsvpDisplay({
  word,
  playing,
  wpm,
  fontFamily,
  fontScale,
  maxSide,
  onToggle,
}: RsvpDisplayProps) {
  const [containerRef, containerSize] = useElementSize<HTMLButtonElement>()
  const [before, pivot, after] = splitAtPivot(word)

  // En uzun kanadı hesapla (before ya da after)
  const maxSideChars = Math.max(before.length, after.length, 1)

  // Yatay taşmayı %100 önleyen dinamik Fit-to-Width (Fit-to-Page) oranı
  let autoFitScale = 1
  const containerWidth = containerSize.width || 0

  if (containerWidth > 0) {
    // Merkezdeki pivot harfinden sağ/sol kenara olan kullanılabilir yarım genişlik
    const padding = containerWidth < 540 ? 20 : 36
    const availableHalfWidth = Math.max(80, containerWidth / 2 - padding)

    // Taban font boyutu tahmini (küçültülmüş taban ~40px - 54px arası)
    const estimatedBasePx = Math.min(56, Math.max(26, containerWidth * 0.052))
    const currentPx = estimatedBasePx * fontScale

    // Karakterlerin tahmini yayılım genişliği (ortalama karakter genişliği ~0.58em)
    const requiredHalfWidth = maxSideChars * currentPx * 0.58

    // Eğer kelime mevcut ekrana/karta sığmıyorsa, tam sığacak oranda dinamik küçült
    // Eğer ekranda yeterli yer varsa autoFitScale 1.0 kalır ve font asla gereksiz küçülmez
    if (requiredHalfWidth > availableHalfWidth) {
      autoFitScale = Math.min(1, Math.max(0.38, availableHalfWidth / requiredHalfWidth))
    }
  }

  const finalScale = fontScale * autoFitScale

  const wordStyle = {
    fontSize: `calc(var(--word-base) * ${finalScale})`,
    ...(fontFamily ? { '--reader-font': fontFamily } : {}),
  } as CSSProperties

  return (
    <section aria-label="Okuma penceresi" className="relative w-full">
      <button
        ref={containerRef}
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Duraklat' : 'Okumaya başla'}
        className="panel group relative block w-full overflow-hidden px-4 py-11 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-8 sm:py-15 [@media(max-height:640px)]:py-8 landscape-short:py-6"
      >
        {/* Üst ve Alt Odak Çentikleri (Merkez Kılavuz Çizgileri) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-3 h-3.5 w-px -translate-x-1/2 bg-(--guide) sm:top-5 sm:h-4 [@media(max-height:640px)]:top-2 [@media(max-height:640px)]:h-3 landscape-short:top-2"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 h-3.5 w-px -translate-x-1/2 bg-(--guide) sm:bottom-5 sm:h-4 [@media(max-height:640px)]:bottom-2 [@media(max-height:640px)]:h-3 landscape-short:bottom-2"
        />

        {/* RSVP Kelime Göstergesi */}
        <span className="@container block w-full">
          <span
            aria-live="off"
            style={wordStyle}
            className="reader-word relative grid grid-cols-[1fr_auto_1fr] items-baseline whitespace-pre py-[0.08em] leading-[1.3] transition-[font-size] duration-100 ease-out [--word-base:clamp(1.75rem,5.2cqi,3.5rem)] landscape-short:[--word-base:clamp(1.4rem,8vh,2.5rem)]"
          >
            <span className="min-w-0 text-right">{before}</span>
            <span className="text-pivot pivot-glow shrink-0 px-[0.02em]">{pivot || '\u00A0'}</span>
            <span className="min-w-0 text-left">{after}</span>
          </span>
        </span>

        {/* Hız Göstergesi */}
        <span
          className={cn(
            'absolute right-4 top-3 font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity duration-500 sm:right-6 sm:top-4 [@media(max-height:640px)]:top-2',
            playing ? 'opacity-0' : 'opacity-100',
          )}
        >
          {wpm} k/dk
        </span>
      </button>
    </section>
  )
}
