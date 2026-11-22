import { useEffect, useState } from 'react'

export type Page = 'offers' | 'live' | 'compare' | 'hotels' | 'network' | 'benchmark'
export const PAGES: { id: Page; label: string }[] = [
  { id: 'offers', label: 'Offers' },
  { id: 'live', label: 'Live India' },
  { id: 'compare', label: 'Compare' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'network', label: 'Network' },
  { id: 'benchmark', label: 'Benchmark' },
]

function read(): Page {
  const h = window.location.hash.replace(/^#\/?/, '')
  return (PAGES.find((p) => p.id === h)?.id ?? 'offers') as Page
}

export function go(p: Page) {
  window.location.hash = p === 'offers' ? '/' : `/${p}`
}

export function usePage(): Page {
  const [p, setP] = useState<Page>(read)
  useEffect(() => {
    const on = () => setP(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return p
}
