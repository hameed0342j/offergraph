import { useEffect, useState } from 'react'

export interface Viewport {
  w: number
  h: number
  unit: number // 1 design px (rem / 10) in screen px
  mobile: boolean
}

function read(): Viewport {
  const w = window.innerWidth
  const h = window.innerHeight
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10
  return { w, h, unit: rem / 10, mobile: w < 900 }
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read)
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVp(read()))
    }
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', on)
    }
  }, [])
  return vp
}

export const params = new URLSearchParams(window.location.search)
