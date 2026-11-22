import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const problems = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 200)}`) })
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()))
page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
await page.goto('https://offergraph-ecru.vercel.app/', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 7000))
// interactions: open detail, recheck, switch modes, edit request, visit pages
await page.evaluate(() => document.querySelector('.p-ranked .tbl-row')?.click())
await new Promise((r) => setTimeout(r, 500))
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Recheck'))?.click())
await new Promise((r) => setTimeout(r, 1500))
for (const m of ['Best value', 'Most flexible', 'Best match']) {
  await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent === t)?.click(), m)
  await new Promise((r) => setTimeout(r, 300))
}
await page.evaluate(() => window.dispatchEvent(new Event('og:edit-request')))
await new Promise((r) => setTimeout(r, 300))
for (const h of ['#/compare', '#/hotels', '#/network', '#/benchmark', '#/']) {
  await page.evaluate((x) => (window.location.hash = x), h)
  await new Promise((r) => setTimeout(r, 1800))
}
const rows = await page.evaluate(() => document.querySelectorAll('.p-ranked .tbl-row').length)
console.log('ranked rows after tour:', rows)
console.log(problems.length ? problems.join('\n') : 'no console errors, warnings or failed requests')
await browser.close()
