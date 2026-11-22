import { useEffect } from 'react'
import { CityMap } from './map/CityMap'
import { HotelMap } from './map/HotelMap'
import { params, useViewport } from './lib/viewport'
import { usePage } from './shell/route'
import { TopNav, Toolbar } from './shell/Shell'
import { ClarifyDialog, SearchBar } from './shell/Search'
import { StoreProvider } from './state/store'
import { OffersView } from './views/Offers'
import { CompareView } from './views/Compare'
import { HotelsView } from './views/Hotels'
import { BenchmarkView } from './views/Benchmark'
import { NetworkView } from './views/Network'
import { LiveView } from './views/Live'
import { AGENT_MODE, ChatPanel } from './views/Chat'
import { Placeholder } from './views/Placeholder'

function Screens() {
  const vp = useViewport()
  const page = usePage()
  // intro animations play once per page visit, then switch off (see html.settled in motion.css)
  useEffect(() => {
    if (params.has('t')) return
    document.documentElement.classList.remove('settled')
    const t = setTimeout(() => document.documentElement.classList.add('settled'), page === 'offers' || page === 'network' ? 6500 : 2600)
    return () => clearTimeout(t)
  }, [page])
  return (
    <>
      {page === 'hotels' ? <HotelMap vp={vp} /> : page !== 'network' && page !== 'live' && <CityMap vp={vp} dim={page !== 'offers'} interactive={page === 'offers'} />}
      <TopNav page={page} />
      {(page === 'offers' || page === 'hotels' || page === 'live') && <SearchBar />}
      <ClarifyDialog />
      {(page === 'live' || AGENT_MODE) && <ChatPanel />}
      {page === 'live' ? (
        <LiveView />
      ) : page === 'offers' ? (
        <>
          <OffersView />
          <Toolbar />
        </>
      ) : page === 'compare' ? (
        <CompareView />
      ) : page === 'hotels' ? (
        <HotelsView />
      ) : page === 'benchmark' ? (
        <BenchmarkView />
      ) : page === 'network' ? (
        <NetworkView vp={vp} />
      ) : (
        <Placeholder page={page} key={page} />
      )}
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Screens />
    </StoreProvider>
  )
}
