// Live India flow in a real browser: open #/live, then search Goa with must-haves through the follow-up dialog.
// Run: node scripts/dev/live-flow.mjs [baseUrl] [outDir]
import puppeteer from 'puppeteer-core'
const base = process.argv[2] ?? 'https://offergraph-ecru.vercel.app'
const out = process.argv[3] ?? '.'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const errors = []
async function page(w, h, mobile = false) {
  const p = await browser.newPage()
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  p.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text()}`))
  return p
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const p = await page(1440, 810)
await p.goto(`${base}/#/live`, { waitUntil: 'networkidle2' })
await p.waitForSelector('.lcard:not(.skeleton)', { timeout: 30000 })
await wait(2500)
await p.screenshot({ path: `${out}/live-desktop.png` })
console.log('cards', await p.$$eval('.lcard:not(.skeleton)', (x) => x.length), '| title', await p.$eval('.live-title', (e) => e.textContent))

// search through the bar; the dialog asks for what's missing
await p.click('.search input')
await p.type('.search input', 'family day out in goa with hotel pickup and free cancellation, little walking')
await p.keyboard.press('Enter')
await p.waitForSelector('.clarify', { timeout: 20000 })
await wait(800)
console.log('dialog questions', await p.$$eval('.cq-label', (x) => x.map((e) => e.textContent).join(' | ')), '| source', await p.$eval('.clarify-src', (e) => e.textContent))
await p.screenshot({ path: `${out}/live-dialog.png` })
// answer every required question with its first option
for (const q of await p.$$('.cq')) {
  const optional = await q.$('em')
  const on = await q.$('.opt.on')
  if (!optional && !on) await (await q.$('.opt'))?.click()
}
await p.click('.clarify-foot .req-go')
await p.waitForFunction(() => location.hash.includes('live'), { timeout: 10000 })
await p.waitForSelector('.lcard:not(.skeleton)', { timeout: 30000 })
await wait(2500)
console.log('after search: hash', await p.evaluate(() => location.hash), '| chips', await p.$$eval('.live-chips .chip', (x) => x.map((e) => e.textContent).join(', ')))
console.log('first card', await p.$eval('.lcard h3', (e) => e.textContent), '| checks', await p.$eval('.lcard-checks', (e) => e.textContent))
await p.screenshot({ path: `${out}/live-personal.png` })

const m = await page(390, 844, true)
await m.goto(`${base}/#/live`, { waitUntil: 'networkidle2' })
await m.waitForSelector('.lcard:not(.skeleton)', { timeout: 30000 })
await wait(2500)
await m.screenshot({ path: `${out}/live-mobile.png` })
console.log('mobile overflow-x', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth))

console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
