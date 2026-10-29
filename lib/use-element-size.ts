'use client'

import { useCallback, useRef, useState } from 'react'

export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const observerRef = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

    const rect = node.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width =
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.target.getBoundingClientRect().width
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height
      setSize({ width, height })
    })

    observer.observe(node)
    observerRef.current = observer
  }, [])

  return [ref, size] as const
}
