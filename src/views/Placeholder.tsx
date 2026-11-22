import type { Page } from '../shell/route'
import { Panel } from '../ui/kit'

const COPY: Record<Page, string> = {
  offers: '',
  live: 'Live supplier inventory for Indian destinations.',
  compare: 'Variant and inclusion matrix for each attraction.',
  hotels: 'Property and room equivalence with merged content.',
  network: 'Regional supply map across Indian outbound markets.',
  benchmark: 'Measured matching and ranking quality against two baselines.',
}

export function Placeholder({ page }: { page: Page }) {
  return (
    <div className="page">
      <div className="page-inner">
        <Panel>
          <div className="ph-title" style={{ fontSize: '1.6rem' }}>
            {page[0].toUpperCase() + page.slice(1)}
          </div>
          <p className="sub">{COPY[page]}</p>
        </Panel>
      </div>
    </div>
  )
}
