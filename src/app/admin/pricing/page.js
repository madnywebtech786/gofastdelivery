'use client'

import { useState, useEffect, useCallback } from 'react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import EditRuleModal from './EditRuleModal'
import EditCityModal from './EditCityModal'
import EditWeightBandModal from './EditWeightBandModal'
import { Plus, Trash2, Pencil, Search, Tag, MapPin, Route, Scale, X } from 'lucide-react'

const ZONES = [
  { value: 'calgary', label: 'Calgary (hub)' },
  { value: 'satellite', label: 'Satellite (Airdrie, Okotoks, Chestermere, Cochrane, etc.)' },
  { value: 'regional', label: 'Regional (Strathmore, High River, etc.)' },
]

function SectionCard({ step, icon, title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
        <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
          style={{ background: 'var(--accent)', color: 'white' }}>
          {step}
        </div>
        <div>
          <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--fg)' }}>
            {icon}{title}
          </h2>
          {subtitle && <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--fg-3)' }}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function PricingPage() {
  const toast = useToast()
  const [cities, setCities] = useState([])
  const [rules, setRules]   = useState([])
  const [weightBands, setWeightBands] = useState([])
  const [loading, setLoading] = useState(true)

  const [cityForm, setCityForm] = useState({ name: '', zone: 'satellite' })
  const [savingCity, setSavingCity] = useState(false)
  const [editingCity, setEditingCity] = useState(null)

  const [ruleForm, setRuleForm] = useState({ cityA: '', cityB: '', baseRate: '', additionalPackageRate: '' })
  const [savingRule, setSavingRule] = useState(false)
  const [editingRule, setEditingRule] = useState(null)

  const [bandForm, setBandForm] = useState({ minLbs: '', maxLbs: '', rate: '' })
  const [savingBand, setSavingBand] = useState(false)
  const [editingBand, setEditingBand] = useState(null)

  const [filter, setFilter] = useState('')

  // One shared confirm-delete modal for all three delete actions on this page
  // (city / route rate / weight range) instead of the browser's native
  // confirm() — matches the in-app modal style used everywhere else deletion
  // needs a confirmation (e.g. invoice delete, booking-history delete).
  // { kind: 'city'|'rule'|'band', id, label, warning? } | null
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesRes, rulesRes, bandsRes] = await Promise.all([
        fetch('/api/pricing/cities'),
        fetch('/api/pricing/rules'),
        fetch('/api/pricing/weight-bands'),
      ])
      if (citiesRes.ok) setCities(await citiesRes.json())
      if (rulesRes.ok) setRules(await rulesRes.json())
      if (bandsRes.ok) setWeightBands(await bandsRes.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAddCity(e) {
    e.preventDefault()
    if (!cityForm.name.trim()) { toast.error('City name is required.'); return }
    setSavingCity(true)
    try {
      const res = await fetch('/api/pricing/cities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cityForm),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to save city.'); return }
      toast.success(`"${cityForm.name}" saved.`)
      setCityForm({ name: '', zone: 'satellite' })
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    } finally { setSavingCity(false) }
  }

  async function handleDeleteCity(id, name) {
    setDeleting(true)
    try {
      const res = await fetch('/api/pricing/cities', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || `Failed to delete "${name}".`); return }
      toast.success(`"${name}" deleted.`)
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddRule(e) {
    e.preventDefault()
    if (!ruleForm.cityA || !ruleForm.cityB || !ruleForm.baseRate || !ruleForm.additionalPackageRate) {
      toast.error('Both cities, base rate, and additional-package rate are required.'); return
    }
    setSavingRule(true)
    try {
      const res = await fetch('/api/pricing/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityA: ruleForm.cityA, cityB: ruleForm.cityB,
          baseRate: Number(ruleForm.baseRate), additionalPackageRate: Number(ruleForm.additionalPackageRate),
        }),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to save rate.'); return }
      toast.success(`Rate saved for ${ruleForm.cityA} ↔ ${ruleForm.cityB}`, 'Applies in both directions automatically.')
      setRuleForm({ cityA: '', cityB: '', baseRate: '', additionalPackageRate: '' })
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    } finally { setSavingRule(false) }
  }

  async function handleDeleteRule(id, label) {
    setDeleting(true)
    try {
      const res = await fetch('/api/pricing/rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || `Failed to delete the rate for ${label}.`); return }
      toast.success(`Rate for ${label} deleted.`)
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddBand(e) {
    e.preventDefault()
    if (bandForm.minLbs === '' || bandForm.maxLbs === '' || bandForm.rate === '') {
      toast.error('Min weight, max weight, and rate are all required.'); return
    }
    setSavingBand(true)
    try {
      const res = await fetch('/api/pricing/weight-bands', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minLbs: Number(bandForm.minLbs), maxLbs: Number(bandForm.maxLbs), rate: Number(bandForm.rate),
        }),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to save weight range.'); return }
      toast.success(`Weight range ${bandForm.minLbs}–${bandForm.maxLbs} lb saved.`)
      setBandForm({ minLbs: '', maxLbs: '', rate: '' })
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    } finally { setSavingBand(false) }
  }

  async function handleDeleteBand(id, label) {
    setDeleting(true)
    try {
      const res = await fetch('/api/pricing/weight-bands', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || `Failed to delete the ${label} lb range.`); return }
      toast.success(`Weight range ${label} lb deleted.`)
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'city') return handleDeleteCity(deleteTarget.id, deleteTarget.label)
    if (deleteTarget.kind === 'rule') return handleDeleteRule(deleteTarget.id, deleteTarget.label)
    if (deleteTarget.kind === 'band') return handleDeleteBand(deleteTarget.id, deleteTarget.label)
  }

  const cityOptions = cities.map((c) => ({ value: c.name, label: `${c.name} (${c.zone})` }))

  const filtered = filter.trim()
    ? rules.filter((r) => r.cityADisplay?.toLowerCase().includes(filter.toLowerCase()) || r.cityBDisplay?.toLowerCase().includes(filter.toLowerCase()))
    : rules

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Pricing Manager</h1>
        <p className="text-sm mt-1 max-w-2xl leading-relaxed" style={{ color: 'var(--fg-3)' }}>
          Delivery prices are calculated automatically from three things: which cities a booking
          moves between (step 1–2), how many packages it has, and how much each package weighs
          (step 3). There's nothing else to configure — every new booking prices itself from
          what's set up here.
        </p>
      </div>

      <SectionCard
        step={1}
        icon={<MapPin size={14} />}
        title="Cities you deliver to/from"
        subtitle={
          `Add every city here first — Route Rates (step 2) can only be set up between cities that ` +
          `already exist in this list. Each city has a zone, which decides how it's priced: "Calgary" ` +
          `is the hub (there should only be one), "Satellite" cities (Airdrie, Okotoks, etc.) get a ` +
          `direct Calgary rate, and "Regional" cities (Strathmore, High River) use the long-distance rates.`
        }
      >
        <form onSubmit={handleAddCity} className="space-y-4 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <Input label="City Name" type="text" value={cityForm.name}
              onChange={(e) => setCityForm((f) => ({ ...f, name: e.target.value }))} placeholder="Airdrie" />
            <Select label="Zone" value={cityForm.zone}
              onChange={(v) => setCityForm((f) => ({ ...f, zone: v }))} options={ZONES} />
          </div>
          <Button type="submit" loading={savingCity} variant="primary" icon={<Plus size={14} />}>Add City</Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-6"><Spinner size="lg" style={{ color: 'var(--fg-3)' }} /></div>
        ) : cities.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--fg-3)' }}>No cities yet — add the ones you deliver to/from above.</p>
        ) : (
          <div className="rounded-xl overflow-hidden border border-border">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Zone</th><th /></tr></thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c._id}>
                    <td className="font-semibold" style={{ color: 'var(--fg)' }}>{c.name}</td>
                    <td className="text-xs capitalize">{c.zone}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => setEditingCity(c)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--fg-3)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)';  e.currentTarget.style.background = 'transparent' }}
                        title="Edit zone">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget({
                          kind: 'city', id: c._id, label: c.name,
                          warning: 'Any pricing rules referencing it will no longer match new bookings.',
                        })}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--fg-3)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)';  e.currentTarget.style.background = 'transparent' }}
                        title="Delete city">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        step={2}
        icon={<Route size={14} />}
        title="Route rates"
        subtitle={
          `One rate per pair of cities, covering the FIRST package on that route. It automatically ` +
          `applies in both directions — set Calgary ↔ Airdrie once, and it prices Calgary→Airdrie and ` +
          `Airdrie→Calgary bookings identically. "Additional Package Rate" is added once per EXTRA ` +
          `package in the same booking (a booking with 3 packages pays: base rate + 2 × additional rate). ` +
          `Satellite-to-satellite routes (e.g. Airdrie → Okotoks) are priced automatically at the ` +
          `destination city's Calgary rate (shown to the customer as routed via the Calgary hub) — ` +
          `you never need to add a rule for those directly. No extra hub fee is charged.`
        }
      >
        <form onSubmit={handleAddRule} className="space-y-4 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <Select label="City A" placeholder="Select city…" value={ruleForm.cityA}
              onChange={(v) => setRuleForm((f) => ({ ...f, cityA: v }))} options={cityOptions} />
            <Select label="City B" placeholder="Select city…" value={ruleForm.cityB}
              onChange={(v) => setRuleForm((f) => ({ ...f, cityB: v }))} options={cityOptions} />
            <Input label="Base Rate (CAD)" type="number" min="0" step="0.01" value={ruleForm.baseRate}
              onChange={(e) => setRuleForm((f) => ({ ...f, baseRate: e.target.value }))} placeholder="15.00" />
            <Input label="Additional Package Rate (CAD)" type="number" min="0" step="0.01" value={ruleForm.additionalPackageRate}
              onChange={(e) => setRuleForm((f) => ({ ...f, additionalPackageRate: e.target.value }))} placeholder="5.00" />
          </div>
          <Button type="submit" loading={savingRule} variant="primary" icon={<Plus size={14} />}>Add Rate</Button>
        </form>

        {/*
          TODO(pricing-v2): Strathmore/High River's spec says "$10 per stop
          within [city]" as a distinct line item from the base rate. This is
          currently priced using the same "Additional Package Rate" field as
          every other route (i.e. the $10 just goes in the field above) — the
          interim approach agreed with the client this session. The wording
          may actually mean something structurally different (multiple
          drop-off addresses in one trip), which the booking model doesn't
          support today. Revisit once the client clarifies; do not assume the
          current mapping is final.
        */}

        <div className="mb-4">
          <Input
            icon={<Search size={14} />}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by city…"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" style={{ color: 'var(--fg-3)' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Tag size={28} className="mx-auto mb-2 opacity-20" style={{ color: 'var(--fg-3)' }} />
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>No pricing rules yet.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-border overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>City A</th><th>City B</th><th className="text-right">Base Rate</th><th className="text-right">Additional Package</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r._id}>
                    <td className="font-semibold" style={{ color: 'var(--fg)' }}>{r.cityADisplay}</td>
                    <td>{r.cityBDisplay}</td>
                    <td className="text-right mono font-bold" style={{ color: 'var(--accent)' }}>{Number(r.baseRate).toFixed(2)}</td>
                    <td className="text-right mono">{Number(r.additionalPackageRate).toFixed(2)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => setEditingRule(r)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--fg-3)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)';  e.currentTarget.style.background = 'transparent' }}
                        title="Edit rate">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget({
                          kind: 'rule', id: r._id, label: `${r.cityADisplay} ↔ ${r.cityBDisplay}`,
                        })}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--fg-3)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)';  e.currentTarget.style.background = 'transparent' }}
                        title="Delete rate">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        step={3}
        icon={<Scale size={14} />}
        title="Weight rules"
        subtitle={
          `Applies globally, the same for every route. Each package in a booking is priced by its own ` +
          `weight against these ranges — a booking with 3 packages at different weights can land in 3 ` +
          `different ranges, each charged independently and added on top of the route's base/additional rate.`
        }
      >
        <form onSubmit={handleAddBand} className="space-y-4 mb-5">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Min Weight (lbs)" type="number" min="0" step="0.1" value={bandForm.minLbs}
              onChange={(e) => setBandForm((f) => ({ ...f, minLbs: e.target.value }))} placeholder="0" />
            <Input label="Max Weight (lbs)" type="number" min="0" step="0.1" value={bandForm.maxLbs}
              onChange={(e) => setBandForm((f) => ({ ...f, maxLbs: e.target.value }))} placeholder="10" />
            <Input label="Rate (CAD)" type="number" min="0" step="0.01" value={bandForm.rate}
              onChange={(e) => setBandForm((f) => ({ ...f, rate: e.target.value }))} placeholder="5.00" />
          </div>
          <Button type="submit" loading={savingBand} variant="primary" icon={<Plus size={14} />}>Add Weight Range</Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" style={{ color: 'var(--fg-3)' }} /></div>
        ) : weightBands.length === 0 ? (
          <div className="py-12 text-center">
            <Scale size={28} className="mx-auto mb-2 opacity-20" style={{ color: 'var(--fg-3)' }} />
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>No weight ranges yet — every package is priced at $0 extra until at least one range is added.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-border overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Weight Range (lbs)</th><th className="text-right">Rate</th><th /></tr>
              </thead>
              <tbody>
                {weightBands.map((b) => (
                  <tr key={b._id}>
                    <td className="font-semibold" style={{ color: 'var(--fg)' }}>{b.minLbs}–{b.maxLbs} lb</td>
                    <td className="text-right mono font-bold" style={{ color: 'var(--accent)' }}>{Number(b.rate).toFixed(2)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => setEditingBand(b)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--fg-3)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)';  e.currentTarget.style.background = 'transparent' }}
                        title="Edit range">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget({
                          kind: 'band', id: b._id, label: `${b.minLbs}–${b.maxLbs}`,
                        })}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--fg-3)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)';  e.currentTarget.style.background = 'transparent' }}
                        title="Delete range">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {editingRule && (
        <EditRuleModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            setEditingRule(null)
            toast.success(`Rate updated for ${editingRule.cityADisplay} ↔ ${editingRule.cityBDisplay}.`)
            load()
          }}
        />
      )}

      {editingCity && (
        <EditCityModal
          city={editingCity}
          onClose={() => setEditingCity(null)}
          onSaved={() => {
            setEditingCity(null)
            toast.success(`"${editingCity.name}" updated.`)
            load()
          }}
        />
      )}

      {editingBand && (
        <EditWeightBandModal
          band={editingBand}
          onClose={() => setEditingBand(null)}
          onSaved={() => {
            setEditingBand(null)
            toast.success(`Weight range ${editingBand.minLbs}–${editingBand.maxLbs} lb updated.`)
            load()
          }}
        />
      )}

      {/* ── Shared delete-confirm modal (city / rate / weight range) ──────── */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
          onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>
                {deleteTarget.kind === 'city' ? 'Delete City?' : deleteTarget.kind === 'rule' ? 'Delete Rate?' : 'Delete Weight Range?'}
              </h2>
              <button onClick={() => !deleting && setDeleteTarget(null)} className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--fg-3)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm mb-2" style={{ color: 'var(--fg-2)' }}>
                {deleteTarget.kind === 'band'
                  ? <>This will permanently delete the <strong style={{ color: 'var(--fg)' }}>{deleteTarget.label} lb</strong> weight range.</>
                  : <>This will permanently delete <strong style={{ color: 'var(--fg)' }}>{deleteTarget.label}</strong>.</>}
              </p>
              {deleteTarget.warning && (
                <p className="text-sm mb-4" style={{ color: 'var(--fg-3)' }}>{deleteTarget.warning}</p>
              )}
              <p className="text-sm mb-6" style={{ color: 'var(--fg-3)' }}>This action cannot be undone.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-border disabled:opacity-50"
                  style={{ color: 'var(--fg-2)' }}>
                  Cancel
                </button>
                <button onClick={confirmDelete} disabled={deleting}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: 'var(--danger)' }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
