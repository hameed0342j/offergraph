// Small text toolkit: normalisation, string similarity, geo distance and BM25.

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'w', 'by', 'from', 'incl', 'including', 'includes',
  'is', 'are', 'be', 'this', 'that', 'it', 'your', 'you', 'our', 'per', 'all', 'more', 'one', 'into', 'up', 'before', 'after',
])

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/s\.e\.a\./g, 'sea')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%+\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t) && t !== '+')
    .map(stem)
}

/** very light stemmer: enough to align "transfers"/"transfer", "rides"/"ride" */
export function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

export function jaccard<T>(a: Iterable<T>, b: Iterable<T>): number {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size && !B.size) return 0
  let i = 0
  for (const x of A) if (B.has(x)) i++
  return i / (A.size + B.size - i)
}

export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1
  const l1 = s1.length
  const l2 = s2.length
  if (!l1 || !l2) return 0
  const range = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1)
  const m1 = new Array<boolean>(l1).fill(false)
  const m2 = new Array<boolean>(l2).fill(false)
  let matches = 0
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - range)
    const hi = Math.min(i + range + 1, l2)
    for (let j = lo; j < hi; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue
      m1[i] = m2[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let t = 0
  let k = 0
  for (let i = 0; i < l1; i++) {
    if (!m1[i]) continue
    while (!m2[k]) k++
    if (s1[i] !== s2[k]) t++
    k++
  }
  const jaro = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3
  let p = 0
  while (p < 4 && p < l1 && p < l2 && s1[p] === s2[p]) p++
  return jaro + p * 0.1 * (1 - jaro)
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** BM25 over small document sets. */
export class BM25 {
  private docs: string[][]
  private df = new Map<string, number>()
  private avg: number
  private k1: number
  private b: number
  constructor(docs: string[][], k1 = 1.2, b = 0.75) {
    this.k1 = k1
    this.b = b
    this.docs = docs
    for (const d of docs) for (const t of new Set(d)) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    this.avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length)
  }
  score(q: string[], i: number): number {
    const d = this.docs[i]
    const N = this.docs.length
    let s = 0
    for (const t of new Set(q)) {
      const n = this.df.get(t)
      if (!n) continue
      let f = 0
      for (const x of d) if (x === t) f++
      if (!f) continue
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      s += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.length) / this.avg))
    }
    return s
  }
}
