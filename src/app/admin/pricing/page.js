'use client'

import { useState, useEffect, useCallback } from 'react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import EditRuleModal from './EditRuleModal'
import EditCityModal from './EditCityModal'
import { Plus, Trash2, Pencil, Search, Tag, MapPin, Route, Scale } from 'lucide-react'

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
  const [settings, setSettings] = useState({ maxWeightLbs: 20, overweightSurcharge: 0 })
  const [loading, setLoading] = useState(true)

  const [cityForm, setCityForm] = useState({ name: '', zone: 'satellite' })
  const [savingCity, setSavingCity] = useState(false)
  const [editingCity, setEditingCity] = useState(null)

  const [ruleForm, setRuleForm] = useState({ cityA: '', cityB: '', baseRate: '', additionalPackageRate: '' })
  const [savingRule, setSavingRule] = useState(false)
  const [editingRule, setEditingRule] = useState(null)

  const [savingSettings, setSavingSettings] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesRes, rulesRes, settingsRes] = await Promise.all([
        fetch('/api/pricing/cities'),
        fetch('/api/pricing/rules'),
        fetch('/api/pricing/settings'),
      ])
      if (citiesRes.ok) setCities(await citiesRes.json())
      if (rulesRes.ok) setRules(await rulesRes.json())
      if (settingsRes.ok) setSettings(await settingsRes.json())
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
    if (!confirm(`Delete "${name}"? Any pricing rules referencing it will no longer match new bookings.`)) return
    try {
      const res = await fetch('/api/pricing/cities', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || `Failed to delete "${name}".`); return }
      toast.success(`"${name}" deleted.`)
      await load()
    } catch {
      toast.error('Network error. Please try again.')
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
    if (!confirm(`Delete the rate for ${label}?`)) return
    try {
      const res = await fetch('/api/pricing/rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || `Failed to delete the rate for ${label}.`); return }
      toast.success(`Rate for ${label} deleted.`)
      await load()
    } catch {
      toast.error('Network error. Please try again.')
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await fetch('/api/pricing/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to save weight rules.'); return }
      toast.success('Weight rules saved.')
    } catch {
      toast.error('Network error. Please try again.')
    } finally { setSavingSettings(false) }
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
                      <button onClick={() => handleDeleteCity(c._id, c.name)}
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
          `Satellite-to-satellite routes (e.g. Airdrie → Okotoks) are priced automatically as a $5 hub fee ` +
          `plus the destination city's Calgary rate — you never need to add a rule for those directly.`
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
                      <button onClick={() => handleDeleteRule(r._id, `${r.cityADisplay} ↔ ${r.cityBDisplay}`)}
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
          `Applies globally, the same for every route. Each package in a booking is checked against ` +
          `the weight limit on its own — if a booking has 3 packages and only one is over the limit, ` +
          `only that one package is charged the surcharge (on top of whatever its base/additional rate ` +
          `already was).`
        }
      >
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Max Weight Per Package (lbs)" type="number" min="1" step="1" value={settings.maxWeightLbs}
              onChange={(e) => setSettings((s) => ({ ...s, maxWeightLbs: e.target.value }))} />
            <Input label="Overweight Surcharge (CAD, per package over limit)" type="number" min="0" step="0.01" value={settings.overweightSurcharge}
              onChange={(e) => setSettings((s) => ({ ...s, overweightSurcharge: e.target.value }))} />
          </div>
          <Button type="submit" loading={savingSettings} variant="primary">Save Weight Rules</Button>
        </form>
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
    </div>
  )
}
