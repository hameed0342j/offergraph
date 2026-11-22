import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, CalendarDays, Loader2, MapPin, Search, Sparkles, X } from 'lucide-react'
import type { FieldId, Question } from '../engine/travelIntent'
import { loadProfile, suggestedAnswers } from '../lib/profile'
import { useStore } from '../state/store'
import { d } from '../ui/kit'
import './search.css'

const EXAMPLES = ['Family day out in Goa with hotel pickup', 'Hotel in Singapore for a couple next weekend', 'Something fun to do']

export function SearchBar() {
  const { search, searching, query } = useStore()
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const open = () => ref.current?.focus()
    window.addEventListener('og:edit-request', open)
    return () => window.removeEventListener('og:edit-request', open)
  }, [])
  return (
    <form
      className="search a-blur"
      style={d(2300)}
      onSubmit={(e) => {
        e.preventDefault()
        search(text || query)
      }}
      role="search"
    >
      <Search className="search-icon" />
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Plan a trip, e.g. "${EXAMPLES[0]}"`}
        aria-label="Describe the trip in plain language"
      />
      <button type="submit" className="search-go" disabled={searching} aria-label="Find offers">
        {searching ? <Loader2 className="spin" /> : <ArrowRight />}
      </button>
    </form>
  )
}

const LABEL: Record<FieldId, string> = { destination: 'Destination', category: 'Looking for', party: 'Travellers', dates: 'Dates', budget: 'Budget', mustHaves: 'Must-haves' }

export function ClarifyDialog() {
  const { clarify, answerClarify, closeClarify } = useStore()
  const profile = useMemo(() => loadProfile(), [clarify])
  const [answers, setAnswers] = useState<Partial<Record<FieldId, string | string[]>>>({})
  const [other, setOther] = useState<Partial<Record<FieldId, string>>>({})

  useEffect(() => {
    if (!clarify) return
    // pre-select what the saved profile already knows, only for questions being asked
    const s = suggestedAnswers(profile)
    const asked = new Set(clarify.intent.questions.map((q) => q.id))
    setAnswers(Object.fromEntries(Object.entries(s).filter(([k]) => asked.has(k as FieldId))))
    setOther({})
  }, [clarify, profile])

  useEffect(() => {
    if (!clarify) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeClarify()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [clarify, closeClarify])

  if (!clarify) return null
  const t = clarify.intent
  const qs = t.questions
  const required = qs.filter((q) => !q.optional)
  const ready = required.every((q) => {
    const a = answers[q.id] ?? other[q.id]
    return Array.isArray(a) ? a.length > 0 : !!a
  })

  const pick = (q: Question, opt: string) =>
    setAnswers((a) => {
      if (!q.multi) return { ...a, [q.id]: a[q.id] === opt ? undefined : opt }
      const cur = (Array.isArray(a[q.id]) ? (a[q.id] as string[]) : []).slice()
      const i = cur.indexOf(opt)
      if (i >= 0) cur.splice(i, 1)
      else cur.push(opt)
      return { ...a, [q.id]: cur }
    })

  const submit = () => {
    const merged: Partial<Record<FieldId, string | string[]>> = { ...answers }
    for (const [k, v] of Object.entries(other)) if (v && v.trim()) merged[k as FieldId] = v.trim()
    answerClarify(merged)
  }

  const known = [
    t.destination && { icon: <MapPin />, text: t.destination },
    t.category && { icon: <Search />, text: t.category === 'hotel' ? 'Hotel' : t.category === 'both' ? 'Hotel and things to do' : 'Things to do' },
    t.party.adults !== null && { icon: null, text: `${t.party.adults} adult${t.party.adults > 1 ? 's' : ''}${t.party.children ? `, ${t.party.children} kid${t.party.children > 1 ? 's' : ''}` : ''}` },
    t.dates.label && { icon: <CalendarDays />, text: t.dates.label },
  ].filter(Boolean) as { icon: ReactNode; text: string }[]

  return (
    <div className="clarify-wrap" role="dialog" aria-modal="true" aria-labelledby="clarify-title" onMouseDown={(e) => e.target === e.currentTarget && closeClarify()}>
      <div className="clarify panel">
        <div className="clarify-head">
          <div>
            <div className="clarify-src">
              <Sparkles />
              {t.source === 'claude' ? 'Understood by Claude' : t.source === 'gemini' ? 'Understood by Gemini' : 'Understood by the rules engine'}
            </div>
            <h2 id="clarify-title">A few details to personalise this</h2>
            <q className="clarify-q">{t.text}</q>
          </div>
          <button className="icon-btn" onClick={closeClarify} aria-label="Close">
            <X />
          </button>
        </div>

        {known.length > 0 && (
          <div className="clarify-known">
            <span>Got it:</span>
            {known.map((k) => (
              <span key={k.text} className="chip">
                {k.icon}
                {k.text}
              </span>
            ))}
          </div>
        )}

        {(
          <>
            <div className="clarify-list">
              {qs.map((q, i) => (
                <div key={q.id} className="cq a-blur" style={d(i * 60, { ['--b' as string]: '0.4rem' })}>
                  <div className="cq-label">
                    {q.question}
                    {q.optional && <em>optional</em>}
                  </div>
                  <div className="cq-opts">
                    {q.options.map((o) => {
                      const a = answers[q.id]
                      const on = Array.isArray(a) ? a.includes(o) : a === o
                      return (
                        <button key={o} type="button" className={`opt ${on ? 'on' : ''}`} onClick={() => pick(q, o)} aria-pressed={on}>
                          {o}
                        </button>
                      )
                    })}
                    {q.id === 'dates' ? (
                      <input type="date" className="opt-input" aria-label="Pick a date" onChange={(e) => setAnswers((a) => ({ ...a, dates: e.target.value }))} />
                    ) : (
                      !q.multi && (
                        <input
                          className="opt-input"
                          placeholder="Other…"
                          aria-label={`${LABEL[q.id]}, other`}
                          value={other[q.id] ?? ''}
                          onChange={(e) => {
                            setOther((o) => ({ ...o, [q.id]: e.target.value }))
                            if (e.target.value) setAnswers((a) => ({ ...a, [q.id]: undefined }))
                          }}
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="clarify-foot">
              <span className="clarify-note">{profile.searches ? 'Pre-selected from your last searches in this browser.' : 'Your answers are remembered in this browser for next time.'}</span>
              <button className="req-go" disabled={!ready} onClick={submit}>
                Show my results
                <ArrowRight />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
