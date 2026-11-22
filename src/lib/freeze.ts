import { params } from './viewport'

/**
 * ?t=<seconds> pauses every CSS animation on the page at that moment of the intro,
 * so stills are repeatable. ?t=99 shows the settled state. Sets window.__shotReady.
 */
export function applyFreeze() {
  const t = params.get('t')
  const w = window as unknown as { __shotReady?: boolean }
  if (t === null) {
    w.__shotReady = true
    return
  }
  const ms = Math.max(0, parseFloat(t) * 1000)
  const seek = () => {
    for (const a of document.getAnimations()) {
      a.pause()
      a.currentTime = ms
    }
  }
  // two frames so React has committed and styles are resolved
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      seek()
      document.fonts.ready.then(() => {
        seek()
        requestAnimationFrame(() => {
          seek()
          // a settled still behaves like the live page after its intro
          if (ms >= 6500) document.documentElement.classList.add('settled')
          w.__shotReady = true
        })
      })
    }),
  )
}
