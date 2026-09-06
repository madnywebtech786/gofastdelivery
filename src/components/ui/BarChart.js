'use client'

const BRAND = '#1bb908'

/**
 * Generic value-per-bucket bar chart. Shared by the admin driver-detail page
 * (deliveries chart, km-driven chart) and the driver-facing km-driven view —
 * same visual, different metric via the `getValue`/`tooltip` props.
 */
export default function BarChart({ data, height = 120, color = BRAND, getValue = (d) => d.count, tooltip = (v) => String(v) }) {
  const maxVal = Math.max(...data.map(getValue), 1)
  // Bar area gets a fixed pixel height of its own (separate from the label
  // row below) so each bar's `height: ${pct}%` resolves against a real,
  // definite box — a flex child with no explicit height (the old layout)
  // lets percentage heights collapse to whatever the content needs, which is
  // why differently-sized bars all rendered at roughly the same height.
  const barAreaHeight = height - 16 // reserve ~16px for the day-label row below
  return (
    <div className="flex items-end gap-0.5">
      {data.map((d, i) => {
        const val = getValue(d)
        const pct = val > 0 ? Math.max((val / maxVal) * 100, 6) : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
            <div className="w-full flex flex-col justify-end" style={{ height: barAreaHeight }}>
              {val > 0 && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none
                  opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-xl text-center"
                    style={{ background: 'var(--fg)', color: 'white' }}>
                    {tooltip(val)}
                  </div>
                </div>
              )}
              <div className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height: `${pct}%`,
                  minHeight: val > 0 ? '4px' : '0',
                  background: val > 0
                    ? `linear-gradient(to top, ${color}, ${color}cc)`
                    : 'var(--border)',
                  opacity: val > 0 ? 1 : 0.3,
                }} />
            </div>
            <span className="text-[9px] font-semibold truncate w-full text-center"
              style={{ color: 'var(--fg-3)' }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
