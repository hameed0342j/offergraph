import { useState } from 'react'
import { BedDouble, Building2, ChevronDown, CircleAlert, CircleCheck, ImageIcon, Layers, Rows3, ScanSearch, Table2, X } from 'lucide-react'
import { SUPPLIER_BY_ID, reliabilityScore } from '../data/suppliers'
import type { Property, PairDecision } from '../engine/hotels'
import type { HotelRecord } from '../data/sg/hotels'
import { useStore, fmtINR } from '../state/store'
import { d, Panel, PanelHead, PHOTOS, SupplierMark } from '../ui/kit'
import './hotels.css'

const img = (id: string, supplier: string) => (PHOTOS.has(id) ? `/photos/${id}-${supplier}.jpg` : null)

export function HotelsView() {
  const { data, hotel, setHotel, travel } = useStore()
  const hr = data.hotels
  const kids = (travel.party.children ?? 0) > 0
  // personalised order: with children, properties that sell family rooms come first
  const props = kids ? [...hr.properties].sort((a, b) => Number(b.rooms.some((r) => r.key.cls === 'Family')) - Number(a.rooms.some((r) => r.key.cls === 'Family'))) : hr.properties
  const [view, setView] = useState<'unified' | 'raw'>('unified')
  const [verdicts, setVerdicts] = useState<Record<string, 'same' | 'different'>>({})
  const p = hr.properties.find((x) => x.id === hotel) ?? hr.properties[0]
  const recById = new Map(hr.records.map((r) => [r.id, r]))
  // listings still waiting for a human decision (not pairs: one vague listing can face several candidates)
  const reviewIds = new Set(hr.review.flatMap((r) => [r.a, r.b]))
  const waiting = hr.properties.filter((x) => x.records.length === 1 && reviewIds.has(x.records[0].id)).length

  return (
    <div className="offers htl">
      <header className="hdr">
        <div className="hdr-top a-blur" style={d(180)}>
          <span className="chip-live">Hotels</span>
          <span className="hdr-status">
            <i className="dot lime-dot" />
            {hr.records.length} listings, {hr.properties.length} properties
          </span>
        </div>
        <h1 className="hdr-title a-blur" style={d(230, { ['--b' as string]: '0.8rem' })}>
          Hotel matching
        </h1>
        <div className="hdr-meta a-blur" style={d(330)}>
          <span>
            <BedDouble />
            {hr.rawRooms} room offers, {hr.eval.roomGroups} rooms
          </span>
        </div>
      </header>

      <aside className="col col-left">
        <Panel delay={500} className="p-props">
          <PanelHead delay={550} icon={<Building2 />} title="Properties" action={<span className="count-pill">{hr.properties.length}</span>} />
          <div className="ent-list scroll">
            {props.map((x) => (
              <button key={x.id} className={`ent-row ${x.id === p.id ? 'sel' : ''}`} onClick={() => setHotel(x.id)}>
                <span className="thumb" style={{ width: '2.6rem', height: '2.6rem' }}>
                  {PHOTOS.has(x.image.url) ? <img src={`/photos/${x.image.url}.jpg`} alt="" /> : <Building2 />}
                </span>
                <span className="ent-name">
                  {x.name}
                  <small>
                    {x.records.length} listing{x.records.length > 1 ? 's' : ''} merged, {x.stars}★
                  </small>
                </span>
                <span className="ent-score">{fmtINR(x.from)}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel delay={650} className="review">
          <PanelHead delay={700} icon={<ScanSearch />} title="Review queue" action={<span className="count-pill">{waiting}</span>} />
          {hr.review.slice(0, 1).map((pr) => (
            <ReviewItem key={pr.a + pr.b} pr={pr} a={recById.get(pr.a)!} b={recById.get(pr.b)!} verdict={verdicts[pr.a + pr.b]} onVerdict={(v) => setVerdicts((s) => ({ ...s, [pr.a + pr.b]: v }))} />
          ))}
          {!hr.review.length && <p className="sub">Nothing waiting: every look-alike was settled by evidence.</p>}
        </Panel>
      </aside>

      <aside className="col col-right">
        <Golden p={p} key={p.id + 'g'} />
        <Evidence p={p} pairs={hr.pairs} key={p.id + 'e'} />
      </aside>

      {view === 'unified' ? <Rooms p={p} kids={kids} key={p.id + 'r'} /> : <Raw p={p} key={p.id + 'w'} />}

      <div className="toolbar a-blur" style={d(900)}>
        <div className="pill-bar" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked={view === 'raw'} className={`pill-btn ${view === 'raw' ? 'on' : ''}`} onClick={() => setView('raw')}>
            <Rows3 />
            Raw listings
          </button>
          <button role="radio" aria-checked={view === 'unified'} className={`pill-btn ${view === 'unified' ? 'on' : ''}`} onClick={() => setView('unified')}>
            <Table2 />
            OfferGraph property
          </button>
        </div>
        <div className="pill-bar tb-legend" aria-label="Map legend">
          <span>
            <i className="dot" style={{ background: 'var(--lime)' }} />
            Selected
          </span>
          <span>
            <i className="dot" style={{ background: '#fff' }} />4 and 5 star
          </span>
          <span>
            <i className="dot" style={{ background: 'rgba(255,255,255,0.45)' }} />3 star
          </span>
        </div>
      </div>
    </div>
  )
}

function ReviewItem({ pr, a, b, verdict, onVerdict }: { pr: PairDecision; a: HotelRecord; b: HotelRecord; verdict?: 'same' | 'different'; onVerdict: (v: 'same' | 'different') => void }) {
  return (
    <div className="rv a-blur" style={d(760)}>
      <div className="rv-pair">
        <span>
          {a.name}
          <small>
            {SUPPLIER_BY_ID[a.supplier].name}, {a.address}
          </small>
        </span>
        <span>
          {b.name}
          <small>
            {SUPPLIER_BY_ID[b.supplier].name}, {b.address}
          </small>
        </span>
      </div>
      <div className="rv-why">
        Score {pr.score.toFixed(2)}. {pr.reason}.
      </div>
      {verdict ? (
        <div className={`rv-done ${verdict}`}>{verdict === 'same' ? 'Linked. The decision is logged as a training label.' : 'Kept apart. The decision is logged as a training label.'}</div>
      ) : (
        <div className="rv-actions">
          <button className="req-go" onClick={() => onVerdict('same')}>
            <CircleCheck />
            Same property
          </button>
          <button className="pill-btn" onClick={() => onVerdict('different')}>
            <X />
            Different
          </button>
        </div>
      )}
    </div>
  )
}

function Golden({ p }: { p: Property }) {
  const hero = img(p.image.url, p.image.supplier)
  return (
    <Panel delay={800} className="golden">
      <div className="golden-img a-blur" style={d(850)}>
        {hero ? <img src={hero} alt={p.name} /> : <ImageIcon />}
        <div className="golden-over">
          <div className="golden-name">{p.name}</div>
          <div className="golden-meta">
            <span className="stars">{'★'.repeat(Math.round(p.stars))}</span>
            {p.address}
          </div>
        </div>
      </div>
      <div className="golden-body">
        <div className="golden-tag a-blur" style={d(950)}>
          <ImageIcon />
          <span>
            Best of {p.images.length} images: {SUPPLIER_BY_ID[p.image.supplier].name}, {p.image.w}×{p.image.h}, no watermark
          </span>
        </div>
        <div className="tiles">
          <div className="tile a-blur" style={d(1000)}>
            <div className="tile-label">
              <Layers />
              <span>Listings merged</span>
            </div>
            <div className="tile-val">{p.records.length}</div>
          </div>
          <div className="tile a-blur" style={d(1050)}>
            <div className="tile-label">
              <BedDouble />
              <span>From, per night</span>
            </div>
            <div className="tile-val">{fmtINR(p.from)}</div>
          </div>
        </div>
        <div className="amen a-blur" style={d(1100)}>
          {p.amenities.slice(0, 6).map((a) => (
            <span key={a.name} className="chip" title={`Stated by ${a.sources} of ${p.records.length} suppliers`}>
              {a.name}
              <em>{a.sources}</em>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function Evidence({ p, pairs }: { p: Property; pairs: PairDecision[] }) {
  const ids = new Set(p.records.map((r) => r.id))
  const internal = pairs.filter((x) => ids.has(x.a) && ids.has(x.b))
  return (
    <Panel delay={900} className="evidence">
      <PanelHead delay={950} icon={<ScanSearch />} title="Why they are one property" action={<span className="count-pill">{internal.length}</span>} />
      <div className="names">
        {p.records.map((r, i) => {
          const s = SUPPLIER_BY_ID[r.supplier]
          return (
            <div key={r.id} className="name-row a-blur" style={d(1000 + i * 60)}>
              <SupplierMark kind={s.mark} tile={s.tile} ink={s.ink} size="2rem" />
              <span>
                {r.name}
                <small>
                  {r.postcode ? `S${r.postcode}` : 'no postcode'}, {r.phone ? 'phone' : 'no phone'}, {r.lat ? 'geocoded' : 'no coordinates'}
                </small>
              </span>
            </div>
          )
        })}
      </div>
      <div className="pairs">
        {internal.slice(0, 3).map((x) => (
          <div key={x.a + x.b} className="pair">
            <b>{x.score.toFixed(2)}</b>
            <span>
              {x.features.distanceM === null ? 'no distance' : `${Math.round(x.features.distanceM)} m`}
              {x.features.postcode === true ? ', postcode' : ''}
              {x.features.phone === true ? ', phone' : ''}
            </span>
            <em>{x.decision === 'auto' ? 'auto' : 'arbiter'}</em>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Rooms({ p, kids }: { p: Property; kids: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const rooms = kids ? [...p.rooms].sort((a, b) => Number(b.key.cls === 'Family') - Number(a.key.cls === 'Family')) : p.rooms
  return (
    <Panel delay={1000} className="rooms-float">
      <PanelHead
        delay={1050}
        icon={<BedDouble />}
        title={`Rooms at ${p.name}`}
        action={
          <span className="rm-head-right">
            {kids && <span className="chip lime-chip">Family rooms first</span>}
            <span className="count-pill">{p.rooms.length}</span>
          </span>
        }
      />
      <div className="rm-head">
        <span>Room</span>
        <span>Board</span>
        <span>Cancellation</span>
        <span>Availability</span>
        <span>Best supplier</span>
        <span>Per night</span>
      </div>
      <div className="rm-body scroll">
        {rooms.map((g, i) => {
          const s = SUPPLIER_BY_ID[g.best.supplier]
          const isOpen = open === i
          return (
            <div key={i} className={`rm ${isOpen ? 'open' : ''}`}>
              <button className="rm-row" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                <span className="rm-name">
                  <ChevronDown />
                  {g.label}
                </span>
                <span>{g.key.board === 'BB' ? 'Breakfast' : 'Room only'}</span>
                <span className={g.best.cancelDays === null ? 'muted' : ''}>{g.best.cancelDays === null ? 'Non-refundable' : `Free until ${g.best.cancelDays}d before`}</span>
                <span className={g.best.available ? '' : 'warn'}>{g.best.available ? `${g.best.available} left` : 'On request'}</span>
                <span className="rm-sup">
                  <SupplierMark kind={s.mark} tile={s.tile} ink={s.ink} size="1.8rem" />
                  {s.name}
                  {g.offers.length > 1 && <em>+{g.offers.length - 1}</em>}
                </span>
                <span className="rm-price">{fmtINR(g.best.priceINR)}</span>
              </button>
              {isOpen && (
                <div className="rm-detail">
                  <ul className="reasons">
                    {g.reasons.map((r, k) => (
                      <li key={k} className="fact">
                        <CircleCheck />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="alts">
                    {g.offers.map((o) => {
                      const so = SUPPLIER_BY_ID[o.supplier]
                      return (
                        <div key={o.rec.id} className={`alt ${o === g.best ? 'best' : ''}`}>
                          <span className="alt-raw">
                            "{o.rec.raw}"<small>{so.name}, reliability {reliabilityScore(so)}, {so.payment}</small>
                          </span>
                          <span>{o.available ? `${o.available} left` : 'On request'}</span>
                          <b>{fmtINR(o.priceINR)}</b>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Raw({ p }: { p: Property }) {
  return (
    <Panel delay={200} className="rooms-float">
      <PanelHead icon={<Rows3 />} title="The same hotel, as each supplier lists it" action={<span className="count-pill">{p.records.length}</span>} />
      <div className="raw-strip scroll">
        {p.records.map((r, i) => {
          const s = SUPPLIER_BY_ID[r.supplier]
          const im = r.images[0]
          const src = img(im.url, r.supplier)
          return (
            <div key={r.id} className="raw-card a-blur" style={d(240 + i * 60)}>
              <div className="raw-img">
                {src ? <img src={src} alt="" /> : <ImageIcon />}
                <span>
                  {im.w}×{im.h}
                  {im.watermark ? ', watermark' : ''}
                </span>
              </div>
              <div className="raw-top">
                <SupplierMark kind={s.mark} tile={s.tile} ink={s.ink} size="2rem" />
                <span className="raw-sup">
                  {r.name}
                  <small>
                    {s.name}, {r.stars}★, {r.address}
                  </small>
                </span>
              </div>
              <div className="raw-desc">
                {r.rooms.slice(0, 3).map((x) => (
                  <div key={x.id} className="raw-room">
                    <span>{x.raw}</span>
                    <b>{x.priceText}</b>
                  </div>
                ))}
                {r.rooms.length > 3 && <div className="raw-more">+{r.rooms.length - 3} more room offers</div>}
                {!r.lat && (
                  <div className="raw-more">
                    <CircleAlert style={{ width: '1rem', height: '1rem', verticalAlign: '-0.15rem' }} /> No coordinates in this feed
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
