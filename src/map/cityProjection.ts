import meta from './city-meta.json'

// Web Mercator, zoom-13 tile mosaic of Singapore (public/map/city-sg.jpg).
const WORLD = 256 * 2 ** meta.zoom
const PX_PER_DEG = WORLD / 360

export const CITY = { width: meta.width, height: meta.height }

export function cityPx(lon: number, lat: number): [number, number] {
  const x = ((lon + 180) / 360) * WORLD - meta.tileX0 * 256
  const s = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const y = ((1 - s / Math.PI) / 2) * WORLD - meta.tileY0 * 256
  return [x, y]
}

export interface CityCam {
  k: number
  tx: number
  ty: number
  unit: number
}

export const camPoint = (c: CityCam, lon: number, lat: number): [number, number] => {
  const [x, y] = cityPx(lon, lat)
  return [x * c.k + c.tx, y * c.k + c.ty]
}

/** Reference frame 1277x667 design px: the attraction field is centered at (637.5, 322), 2000 design px per degree. */
export function cityCamera(w: number, h: number, unit: number, mobile: boolean): CityCam {
  const ppd = mobile ? (w * 0.94) / 0.31 : 2000 * unit
  const k = ppd / PX_PER_DEG
  const ax = mobile ? w / 2 : w / 2 + (637.5 - 638.5) * unit
  const ay = mobile ? h * 0.47 : h / 2 + (322 - 333.5) * unit
  const [cx, cy] = cityPx(103.855, 1.3265)
  return { k, tx: ax - cx * k, ty: ay - cy * k, unit: mobile ? w / 470 : unit }
}
