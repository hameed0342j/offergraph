// Web Mercator projection matching public/map/basemap.jpg (see scripts/build_map.py).
export const MAP = { lon0: 20, lat0: 55, lon1: 135, lat1: -25, width: 3680, height: 2943, pxPerDeg: 32 }

const RAD_PX = (MAP.pxPerDeg * 180) / Math.PI
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const Y0 = mercY(MAP.lat0)

/** lon/lat to basemap pixels */
export function toMap(lon: number, lat: number): [number, number] {
  return [(lon - MAP.lon0) * MAP.pxPerDeg, (Y0 - mercY(lat)) * RAD_PX]
}

export interface Camera {
  k: number // screen px per basemap px
  tx: number
  ty: number
  unit: number // 1 design px in screen px (rem / 10)
}

export function project(cam: Camera, lon: number, lat: number): [number, number] {
  const [x, y] = toMap(lon, lat)
  return [x * cam.k + cam.tx, y * cam.k + cam.ty]
}

/**
 * Desktop camera: the reference frame is 1277x667 design px; the hub sits at (547, 286)
 * of that frame and the map shows 13.03 px per degree. The frame is centered in the viewport,
 * so wider screens reveal more map without moving the composition.
 */
export function desktopCamera(w: number, h: number, unit: number, hub: { lon: number; lat: number }): Camera {
  const k = (13.03 * unit) / MAP.pxPerDeg
  const ax = w / 2 + (547 - 638.5) * unit
  const ay = h / 2 + (286 - 333.5) * unit
  const [hx, hy] = toMap(hub.lon, hub.lat)
  return { k, tx: ax - hx * k, ty: ay - hy * k, unit }
}

/** Mobile camera: the map is a block at the top; fit Dubai to Singapore across its width. */
export function mobileCamera(w: number, h: number, hub: { lon: number; lat: number }): Camera {
  const unit = w / 470
  const k = (13.03 * unit) / MAP.pxPerDeg
  const ax = w * 0.47
  const ay = h * 0.42
  const [hx, hy] = toMap(hub.lon, hub.lat)
  return { k, tx: ax - hx * k, ty: ay - hy * k, unit }
}
