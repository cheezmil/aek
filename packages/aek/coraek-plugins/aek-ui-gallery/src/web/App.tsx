import { Component as ReactComponent, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Code, Component, Eye, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { components as sideItems } from './ported/config/registry/components/sidebar-data'
import { demosByCategory, type DemoEntry } from './ported/generated/demos'
import { ArtGalleryPanel } from './gallery/ArtGalleryPanel'
import { useI18n } from './i18n.tsx'
import { applyAekTheme, type AekThemeSpec } from './theme-bridge'

// Lazy demo module map — keys match DemoEntry.key ('./ported/components/...').
const demoModules = import.meta.glob('./ported/components/shadcn-space/**/*.tsx')
const demoSources = import.meta.glob('./ported/components/shadcn-space/**/*.tsx', {
  query: '?raw',
  import: 'default',
})

type SideItem = (typeof sideItems)[number]

/**
 * BQ4-4: per-card error boundary — one broken demo must never take down the
 * whole gallery. Records the offending demo key on window.__badCards so a
 * CDP probe can enumerate what failed and why.
 */
class CardBoundary extends ReactComponent<{ label: string; children: ReactNode }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    const w = window as { __badCards?: Record<string, string> }
    w.__badCards = w.__badCards ?? {}
    w.__badCards[this.props.label] = `${String((error as Error)?.message ?? error).slice(0, 200)}\n${(info.componentStack ?? '').slice(0, 500)}`
  }
  render() {
    if (this.state.failed) {
      return <div className="text-xs text-muted-foreground">该组件无法在独立画廊中渲染</div>
    }
    return this.props.children
  }
}

/** Top-level diagnostic boundary: records mount crashes on window.__appCrash. */
class AppBoundary extends ReactComponent<{ children: ReactNode }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    const w = window as { __appCrash?: string }
    w.__appCrash = `${String((error as Error)?.message ?? error)}\n${(info.componentStack ?? '').slice(0, 600)}`
  }
  render() {
    if (this.state.failed) {
      return <div className="p-10 text-sm text-destructive">画廊渲染失败，详见 window.__appCrash</div>
    }
    return this.props.children
  }
}

function DemoCard({ d }: { d: DemoEntry }) {
  const [Comp, setComp] = useState<React.ComponentType | null>(null)
  const [failed, setFailed] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [src, setSrc] = useState('')

  useEffect(() => {
    let live = true
    const load = demoModules[d.key]
    if (!load) {
      setFailed(true)
      return
    }
    load()
      .then((m) => {
        const mod = m as Record<string, unknown>
        // BQ4-4 fix: memo()/forwardRef() components export an OBJECT
        // ({$$typeof: Symbol(react.memo|react.forward_ref), type: fn}), not a
        // function — accepting them is what stops React #130 "Element type
        // is invalid". Plain objects or JSX-element defaults stay rejected.
        const isComp = (v: unknown): boolean => {
          if (typeof v === 'function') return true
          if (v && typeof v === 'object' && '$$typeof' in v) {
            const t = (v as { $$typeof: unknown; type?: unknown }).$$typeof
            if (
              (t === Symbol.for('react.memo') || t === Symbol.for('react.forward_ref')) &&
              typeof (v as { type?: unknown }).type === 'function'
            ) {
              return true
            }
          }
          return false
        }
        const C = (mod.default ?? Object.values(mod).find(v => isComp(v))) as
          | React.ComponentType
          | undefined
        // NOTE: the component is a FUNCTION, so a plain setComp(C) would be
        // treated by React as a state UPDATER (C(null) runs the component
        // outside render -> "Do not call Hooks" + the JSX tree becomes the
        // state -> React #130 "got <div />"). The functional form pins it.
        if (live) setComp(() => (C && isComp(C)) ? (C as React.ComponentType) : null)
        if (!C || !isComp(C)) setFailed(true)
      })
      .catch(() => live && setFailed(true))
    demoSources[d.key]?.().then(s => live && setSrc(String(s ?? ''))).catch(() => {})
    return () => {
      live = false
    }
  }, [d.key])

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-none items-start justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{d.name}</div>
          {d.description ? (
            <div className="line-clamp-1 text-xs text-muted-foreground">{d.description}</div>
          ) : null}
        </div>
        <button
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          title={showCode ? '查看组件' : '查看源码'}
          onClick={() => setShowCode(v => !v)}
        >
          {showCode ? <Eye size={14} /> : <Code size={14} />}
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden p-5">
        {showCode ? (
          <pre className="max-h-96 w-full overflow-auto rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
            {src || '…'}
          </pre>
        ) : failed ? (
          <div className="text-xs text-muted-foreground">该组件无法在独立画廊中渲染</div>
        ) : Comp ? (
          <Comp />
        ) : (
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  )
}

/** BQ4-4: the ported shadcnspace demo grid (530 components, 64 categories). */
function ShadcnGrid() {
  const [active, setActive] = useState<string>(sideItems[0]?.blockName ?? '')
  const [query, setQuery] = useState('')
  const side: SideItem[] = sideItems
  const q = query.trim().toLowerCase()

  // 59 categories carry ported demos; the blocks-only categories stay listed but disabled.
  const withDemos = side.filter(s => (demosByCategory[s.blockName ?? ''] ?? []).length > 0)
  const demoTotal = Object.values(demosByCategory).reduce((n, arr) => n + arr.length, 0)

  const results = useMemo(() => {
    if (!q) return demosByCategory[active] ?? []
    const out: DemoEntry[] = []
    for (const cat of Object.keys(demosByCategory)) {
      for (const d of demosByCategory[cat]) {
        if (
          d.name.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        ) {
          out.push(d)
        }
      }
    }
    return out
  }, [q, active])

  const activeItem = side.find(s => s.blockName === active)
  const cols = q ? 2 : (activeItem?.columns ?? 2)

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-60 flex-none flex-col border-r">
        <div className="flex flex-none items-center gap-2 px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Component size={15} />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">shadcn/ui 组件画廊</div>
            <div className="text-[11px] text-muted-foreground">
              shadcnspace · {withDemos.length} 类 / {demoTotal} 组件
            </div>
          </div>
        </div>
        <div className="flex-none px-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索 530 个组件…"
              className="w-full rounded-lg border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {side.map((s) => {
            const count = (demosByCategory[s.blockName ?? ''] ?? []).length
            const enabled = count > 0
            const Icon = s.icon ?? Component
            return (
              <button
                key={s.blockName}
                disabled={!enabled}
                onClick={() => {
                  setActive(s.blockName ?? '')
                  setQuery('')
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                  active === s.blockName && !q ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground/80 hover:bg-muted',
                  !enabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <Icon size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{enabled ? count : '—'}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/90 px-5 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">
              {q ? `搜索 “${query.trim()}” — ${results.length} 个结果` : activeItem?.title ?? active}
            </h1>
            {!q && activeItem?.description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{activeItem.description}</p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 p-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {results.map(d => (
            <CardBoundary key={d.key} label={d.key}>
              <DemoCard d={d} />
            </CardBoundary>
          ))}
          {results.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-muted-foreground">没有匹配的组件</div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

/**
 * BQ10: the SPA top-level shell — 「UI 风格设置」(the moved art-gallery panel)
 * and 「shadcn/ui 组件」(the ported demo grid) as sibling tabs. The panel
 * reports its selected spec up via `onSpecChange`; the shell applies it to the
 * document root so the demo grid re-skins live, same document (no iframe, no
 * postMessage between the tabs). The host console receives the same spec via
 * global-client.ts postMessage and repaints itself (art-global-theme.ts).
 */
export default function App() {
  const { t } = useI18n()
  const [topTab, setTopTab] = useState<'style' | 'shadcn'>('style')
  const [spec, setSpec] = useState<AekThemeSpec | null>(null)

  // Re-skin the whole SPA (including the demo grid) on every style selection.
  useEffect(() => {
    if (spec) applyAekTheme(spec)
  }, [spec])

  const tabPill = (on: boolean): string =>
    cn(
      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
      on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
    )

  return (
    <AppBoundary>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex flex-none items-center gap-2 border-b bg-card px-4 py-2">
          <button type="button" className={tabPill(topTab === 'style')} onClick={() => { setTopTab('style') }}>
            {t('art.tab.style')}
          </button>
          <button type="button" className={tabPill(topTab === 'shadcn')} onClick={() => { setTopTab('shadcn') }}>
            {t('art.tab.shadcn')}
          </button>
          <div className="min-w-0 flex-1" />
        </div>
        <div className="min-h-0 flex-1">
          {topTab === 'style' ? (
            <ArtGalleryPanel
              active
              onShowShadcn={() => { setTopTab('shadcn') }}
              onSpecChange={(s) => { setSpec(s) }}
            />
          ) : (
            <ShadcnGrid />
          )}
        </div>
      </div>
    </AppBoundary>
  )
}
