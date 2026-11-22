import puppeteer from 'puppeteer-core'
import { pathToFileURL } from 'node:url'
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const p = await b.newPage()
await p.goto(pathToFileURL('docs/nexconn-writeup.html').href, { waitUntil: 'load' })
await p.pdf({ path: 'docs/OfferGraph_Nexconn_Writeup.pdf', format: 'A4', printBackground: true })
await b.close()
console.log('ok')

