'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { splitAtPivot } from '@/lib/rsvp'

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
  const [before, pivot, after] = splitAtPivot(word)

  const wordStyle = {
    fontSize: `calc(var(--word-base) * ${fontScale})`,
    ...(fontFamily ? { '--reader-font': fontFamily } : {}),
  } as CSSProperties

  return (
    <section aria-label="Okuma penceresi" className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Duraklat' : 'Okumaya başla'}
        className="panel group relative block w-full overflow-hidden px-4 py-12 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-16 [@media(max-height:640px)]:py-9 landscape-short:py-7"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-4 h-4 w-px -translate-x-1/2 bg-(--guide) sm:top-6 [@media(max-height:640px)]:top-2.5 [@media(max-height:640px)]:h-3 landscape-short:top-2"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-4 left-1/2 h-4 w-px -translate-x-1/2 bg-(--guide) sm:bottom-6 [@media(max-height:640px)]:bottom-2.5 [@media(max-height:640px)]:h-3 landscape-short:bottom-2"
        />

        <span className="@container block">
          <span
            aria-live="off"
            style={wordStyle}
            className="reader-word relative grid grid-cols-[1fr_auto_1fr] items-baseline whitespace-pre py-[0.08em] leading-[1.35] [--word-base:clamp(2.25rem,13cqi,4.75rem)] landscape-short:[--word-base:clamp(1.75rem,11vh,3rem)]"
          >
            <span className="min-w-0 text-right">{before}</span>
            <span className="text-pivot pivot-glow">{pivot || '\u00A0'}</span>
            <span className="min-w-0 text-left">{after}</span>
          </span>
        </span>

        <span
          className={cn(
            'absolute right-4 top-3 font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity duration-500 sm:right-5 sm:top-4 [@media(max-height:640px)]:top-2',
            playing ? 'opacity-0' : 'opacity-100',
          )}
        >
          {wpm} k/dk
        </span>
      </button>
    </section>
  )
}
