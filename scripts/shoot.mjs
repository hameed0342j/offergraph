// Still renderer for the Cook loop: fixed viewports, intro frozen at a given time.
// usage: node scripts/shoot.mjs <outDir> [baseUrl]
// Shots are defined below; each loads /?t=<sec>&nolive#/<page> and waits for window.__shotReady.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'shots'
const base = process.argv[3] ?? 'http://localhost:5173'
const only = process.argv[4] ? process.argv[4].split(',') : null
mkdirSync(out, { recursive: true })

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const SHOTS = [
  { id: 'S01', w: 1277, h: 667, t: 99, page: '' },
  { id: 'S01-1440', w: 1440, h: 900, t: 99, page: '' },
  { id: 'S01-1920', w: 1920, h: 1080, t: 99, page: '' },
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6].map((t) => ({ id: `S01m-${String(t).replace('.', '_')}`, w: 1277, h: 667, t, page: '' })),
  { id: 'S01d', w: 1277, h: 667, t: 99, page: '', focus: true },
  { id: 'S02', w: 1440, h: 900, t: 99, page: 'compare' },
  { id: 'S03', w: 1440, h: 900, t: 99, page: 'hotels' },
  { id: 'S04', w: 1277, h: 667, t: 99, page: 'network' },
  { id: 'S05', w: 1440, h: 900, t: 99, page: 'benchmark' },
  { id: 'S06', w: 390, h: 844, t: 99, page: '', dpr: 2, full: true },
  { id: 'S06h', w: 390, h: 844, t: 99, page: 'hotels', dpr: 2, full: true },
  { id: 'S01c', w: 1277, h: 667, t: 99, page: '', event: true },
]

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-gpu-vsync'] })
try {
  for (const s of SHOTS) {
    if (only && !only.some((o) => s.id.startsWith(o))) continue
    const page = await browser.newPage()
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: s.dpr ?? 1 })
    const url = `${base}/?t=${s.t}&nolive${s.focus ? '&focus=1' : ''}#/${s.page}`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForFunction('window.__shotReady === true', { timeout: 30000 })
    if (s.focus) {
      await page.evaluate(() => document.querySelector('.p-ranked .tbl-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await new Promise((r) => setTimeout(r, 900))
      await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()))
    }
    if (s.event) {
      // a supplier change arrives: click "simulate a supplier change" and capture the map event
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish() } catch {} }))
      await page.evaluate(() => document.querySelector('[aria-label="Simulate a supplier change"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await new Promise((r) => setTimeout(r, 900))
      await page.screenshot({ path: join(out, `${s.id}.png`) })
      console.log('shot', join(out, `${s.id}.png`))
      await page.close()
      continue
    }
    if (s.t >= 99) {
      // settled shots: let late-mounting panels (benchmark, pages) finish their intro
      await new Promise((r) => setTimeout(r, 1200))
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish() } catch {} }))
    }
    await new Promise((r) => setTimeout(r, 250))
    const file = join(out, `${s.id}.png`)
    await page.screenshot({ path: file, fullPage: !!s.full })
    console.log('shot', file)
    await page.close()
  }
} finally {
  await browser.close()
}
