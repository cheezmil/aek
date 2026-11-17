/**
 * The icon manager panel — the 图标大全 (V6 round).
 *
 * Two data faces, one single source of truth per face:
 *   - the AEK framework registry (`Icons.tsx`, the 24×24 Lucide-stroke
 *     glyphs the console itself renders), and
 *   - the curated open-source sets vendored by `scripts/aek/gen-icon-sets.mjs`
 *     (GitHub tarballs via the `gh` CLI) into the aek-icon-manager plugin's
 *     data directory. The catalogs are shipped WITH the console dist (one
 *     lazy chunk per set, loaded on first expand) so the panel has zero
 *     runtime dependency on the host — fully offline. The host routes
 *     `GET /api/aek/icons/sets` / `GET /api/aek/icons/set/<set>` stay as the
 *     agent/CLI face over the same vendored files.
 *
 * Interaction (user rule, V6): single click = toggle selection, double
 * click = copy that icon's usage line. The batch toolbar (select all / clear /
 * copy selected) spans both faces. Large sets paginate (a visible slice per
 * section) so a 5.5k-icon catalog never renders 5.5k DOM tiles at once.
 * V6.1: icons vertically centered in their tiles; set catalogs ship as
 * local lazy chunks (zero host dependency).
 *
 * @module @cheezmil/aek-web/src/IconManagerPanel
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon, ICON_NAMES, type IconName } from './Icons.tsx'
import { PanelCard } from './ui-kit.tsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useI18n } from './i18n.tsx'
import { copyToClipboard } from './clipboard.ts'

/** One unified outer-card body (32px, IV-round scale). */
const BODY = 'p-8'
/** The section-title style shared by every panel (accent bar, mt-8 mb-4 pl-3). */
const TITLE = 'relative mb-4 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[""] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary'
/** How many tiles one open-source section renders per pagination step. */
const PAGE_SIZE = 120

/** A set's metadata row, as the host manifest returns it. */
interface SetMeta {
  prefix: string
  name: string
  repo: string
  branch: string
  license: string
  npm: string
  usage: string
  note: string
  iconCount: number
  file: string
}

/** A fetched set catalog (one vendored per-set JSON, loaded as a lazy chunk). */
interface SetData {
  prefix: string
  icons: Record<string, string>
  usage: string
  npm: string
  name: string
  license: string
}

/** One chunk of the glob result: the default export is the raw JSON shape. */
interface SetCatalogChunk {
  default: unknown
}

/**
 * The vendored catalogs, shipped as lazy chunks: one chunk per set JSON,
 * downloaded (from the local dist) only when its section first expands.
 * The manifest is the same family of files — loaded lazily too, so the
 * panel still renders the framework face on a tree where the generator
 * never ran (the glob simply matches nothing there).
 */
const iconSetModules = import.meta.glob(
  '../../../packages/aek/coraek-plugins/aek-icon-manager/data/icon-sets/*.json',
) as Record<string, () => Promise<SetCatalogChunk>>

/** @param modules - the glob result. @returns prefix → lazy loader. */
function prefixLoaders(modules: Record<string, () => Promise<SetCatalogChunk>>): Record<string, () => Promise<SetData | undefined>> {
  const loaders: Record<string, () => Promise<SetData | undefined>> = {}
  for (const [path, load] of Object.entries(modules)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base === 'manifest.json') continue
    const prefix = base.slice(0, base.lastIndexOf('.json'))
    loaders[prefix] = async () => {
      const chunk = await load()
      const data = chunk.default as Partial<SetData> | undefined
      // A partial or corrupt catalog must not crash the panel render:
      // the Object.keys() over its icons map would throw on undefined.
      if (data === undefined || data.icons === undefined) return undefined
      return data
    }
  }
  return loaders
}

const SET_LOADERS = prefixLoaders(iconSetModules)

/** @returns the vendored manifest (set names, counts, licenses, usage templates). */
function loadManifest(): Promise<ReadonlyArray<SetMeta>> {
  const key = Object.keys(iconSetModules).find(path => path.endsWith('/manifest.json'))
  if (key === undefined) return Promise.resolve([])
  return iconSetModules[key]()
    .then(chunk => ((chunk.default as { sets?: SetMeta[] } | undefined)?.sets ?? []))
    .catch(() => [] /* the generator never ran: the panel shows the framework face only */)
}

/** @param name - an icon file name. @returns the guidance PascalCase name. */
function pascalOf(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(part => part.length > 0)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Fill the set's usage template for one icon (the copied line). */
function setUsageLine(set: { usage: string; name: string }, iconName: string): string {
  return set.usage
    .replace(/\{pascal\}/gu, pascalOf(iconName))
    .replace(/\{name\}/gu, iconName)
}

/** The context header + one usage line that a double-click copies. */
function setCopyText(meta: SetMeta, iconName: string): string {
  return `// ${meta.name} (${meta.npm}, ${meta.repo}, ${meta.license})\n${setUsageLine(meta, iconName)}`
}

/** The selection key shared by framework and set icons. */
type IconKey = string
// Framework keys are `fw:<name>`; set keys are `<prefix>:<name>`.

export function IconManagerPanel(): ReactNode {
  const { t, tf } = useI18n()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<IconKey>>(new Set())
  /** The key whose copy just happened (the transient "copied" mark). */
  const [copied, setCopied] = useState<IconKey | undefined>(undefined)
  const [bulkCopied, setBulkCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)

  const [manifest, setManifest] = useState<ReadonlyArray<SetMeta>>([])
  /** prefix → loaded catalog (absent = not loaded yet). */
  const [setCache, setSetCache] = useState<Record<string, SetData | undefined>>({})
  /** Load-once guard kept out of the state updater (updaters must be pure). */
  const loadedRef = useRef(new Set<string>())

  /** @param prefix - one set's prefix. Loads its vendored catalog once. */
  const ensureSet = useCallback((prefix: string): void => {
    if (loadedRef.current.has(prefix)) return
    if (!Object.prototype.hasOwnProperty.call(SET_LOADERS, prefix)) return
    const loader = SET_LOADERS[prefix]
    loadedRef.current.add(prefix)
    void loader()
      .then((data) => {
        if (data === undefined) return
        setSetCache(cached => ({ ...cached, [prefix]: data }))
      })
      .catch(() => { /* the chunk failed to load: keep the section collapsed */ })
  }, [])

  /** prefixes whose section is expanded (its data fetched). */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** prefix → how many of that set's icons the grid shows. */
  const [visible, setVisible] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    void loadManifest().then((setMeta) => { if (!cancelled) setManifest(setMeta) })
    return () => { cancelled = true }
  }, [])

  const needle = query.trim().toLowerCase()
  const fwNames = useMemo(
    () => ICON_NAMES.filter(name => needle.length === 0 || name.toLowerCase().includes(needle)),
    [needle])
  /** Every set the search has to span is fetched while a query is live. */
  useEffect(() => {
    if (needle.length === 0) return
    for (const meta of manifest) ensureSet(meta.prefix)
  }, [needle, manifest, ensureSet])

  /** @param meta - a set. @returns the icons of that set passing the query, capped to its page. */
  const setSlice = (meta: SetMeta): string[] => {
    const data = setCache[meta.prefix]
    if (data === undefined) return []
    const all = Object.keys(data.icons)
    const matches = needle.length === 0
      ? all
      : all.filter(name => name.toLowerCase().includes(needle))
    const cap = visible[meta.prefix] ?? PAGE_SIZE
    return matches.slice(0, cap)
  }

  const setMatchesCount = (meta: SetMeta): number => {
    const data = setCache[meta.prefix]
    if (data === undefined) return 0
    const all = Object.keys(data.icons)
    return needle.length === 0 ? all.length : all.filter(name => name.toLowerCase().includes(needle)).length
  }

  /** Every key visible right now (framework face + every expanded set page). */
  const visibleKeys = useMemo((): IconKey[] => {
    const keys: IconKey[] = fwNames.map(name => `fw:${name}`)
    for (const meta of manifest) {
      if (!expanded.has(meta.prefix) && needle.length === 0) continue
      for (const iconName of setSlice(meta)) keys.push(`${meta.prefix}:${iconName}`)
    }
    return keys
  }, [fwNames, manifest, expanded, needle, setCache, visible])

  /** One line of the bulk block: framework vs set icon. */
  const usageFor = (key: IconKey): string => {
    const colon = key.indexOf(':')
    const scope = key.slice(0, colon)
    const iconName = key.slice(colon + 1)
    if (scope === 'fw') return tf('icons.usageLine', { name: iconName })
    const meta = manifest.find(item => item.prefix === scope)
    return meta === undefined ? key : setUsageLine(meta, iconName)
  }

  /** @param key - the clicked tile. Toggles its selection (V6: single click). */
  const toggle = (key: IconKey): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** @param key - the double-clicked tile. Copies its usage line. */
  const copyOne = async (key: IconKey): Promise<void> => {
    const colon = key.indexOf(':')
    const scope = key.slice(0, colon)
    const iconName = key.slice(colon + 1)
    const meta = scope === 'fw' ? undefined : manifest.find(item => item.prefix === scope)
    const text = meta === undefined
      ? `${tf('icons.usageHeader')}\n${tf('icons.usageLine', { name: iconName })}`
      : setCopyText(meta, iconName)
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(key)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(undefined) }, 1200)
    }
  }

  /** Copies the whole bulk block for every selected icon. */
  const copySelected = async (): Promise<void> => {
    const chosen = Array.from(selected)
    if (chosen.length === 0) return
    const header = tf('icons.usageHeader')
    const lines = chosen.map((key) => {
      const colon = key.indexOf(':')
      const scope = key.slice(0, colon)
      if (scope === 'fw') return usageFor(key)
      const meta = manifest.find(item => item.prefix === scope)
      if (meta === undefined) return key
      return setCopyText(meta, key.slice(colon + 1)).split('\n').slice(1).join('\n')
    })
    const ok = await copyToClipboard([header, ...lines].join('\n'))
    if (ok) {
      setBulkCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setBulkCopied(false) }, 1200)
    }
  }

  /** One tile from any face. V6.2: the glyph owns a flex-1 zone so it sits in
   *  the vertical center of the card; the name row is pinned to the bottom
   *  (fixed height, "已复制" swaps in place — no layout shift, no spacer row). */
  const tile = (key: IconKey, scope: string, name: string, svgText: string | undefined): ReactNode => {
    const ticked = selected.has(key)
    const justCopied = copied === key
    return (
      <div
        key={key}
        role="button"
        tabIndex={0}
        aria-label={`${scope}:${name}`}
        onClick={() => { toggle(key) }}
        onDoubleClick={() => { void copyOne(key) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void copyOne(key) }
        }}
        className={[
          'group relative flex h-24 cursor-pointer flex-col rounded-sm border bg-surface-subtle p-3 transition duration-120 ease-aek',
          ticked || justCopied ? 'border-primary bg-accent-soft' : 'border-border hover:border-input',
        ].join(' ')}
      >
        <input
          type="checkbox"
          aria-label={`${name} (select)`}
          checked={ticked}
          onChange={() => { toggle(key) }}
          onClick={(event) => { event.stopPropagation() }}
          className="absolute right-1.5 top-1.5 size-3.5 accent-primary"
        />
        <div className="flex flex-1 items-center justify-center">
          {svgText === undefined
            ? <Icon name={name as IconName} size={22} />
            : (
              <span
                className="flex size-5.5 items-center justify-center [&>svg]:h-full [&>svg]:w-full"
                // The set SVGs are the upstream files verbatim (license header stripped
                // at generation); they are static vendored data, not user input.
                dangerouslySetInnerHTML={{ __html: svgText }}
              />
            )}
        </div>
        <div className="mt-1.5 h-4 truncate text-center font-mono text-xs">
          {justCopied
            ? <span className="font-semibold text-primary">{t('icons.copied')}</span>
            : <span className="text-text-secondary">{name}</span>}
        </div>
      </div>
    )
  }

  return (
    <PanelCard>
      <div className={BODY}>
        <h2 className={TITLE}>{t('panel.icons')}</h2>

        <section>
          <h3 className="relative mb-3 pl-3 text-sm font-semibold tracking-normal text-text-secondary before:absolute before:content-[''] before:left-0 before:top-0.5 before:h-3 before:w-0.5 before:rounded-3xs before:bg-text-muted/50">
            {t('icons.catalog')}
          </h3>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
              placeholder={t('icons.search')}
              className="h-8 flex-1 min-w-40 max-w-80 text-xs"
            />
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set(visibleKeys)) }}>{t('icons.selectAll')}</Button>
              <Button size="sm" disabled={selected.size === 0} onClick={() => { void copySelected() }}>
                {bulkCopied ? t('icons.copied') : `${t('icons.copySelected')}${selected.size > 0 ? ` (${String(selected.size)})` : ''}`}
              </Button>
            </div>
          </div>

          {fwNames.length === 0 && manifest.length === 0 && needle.length === 0
            ? <p className="p-4 text-xs-plus text-text-muted">{t('icons.empty')}</p>
            : (
              <div className="space-y-4">
                {fwNames.length > 0
                  ? (
                    <div>
                      <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted/80">{t('icons.framework')} ({String(fwNames.length)})</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-9 gap-2">
                        {fwNames.map(name => tile(`fw:${name}`, 'fw', name, undefined))}
                      </div>
                    </div>
                  )
                  : null}
                {manifest.length === 0
                  ? <p className="text-xs text-text-muted/70">{t('icons.noSets')}</p>
                  : manifest.map((meta) => {
                    const data = setCache[meta.prefix]
                    const open = expanded.has(meta.prefix) || needle.length > 0
                    const slice = open ? setSlice(meta) : []
                    const total = needle.length > 0 ? setMatchesCount(meta) : meta.iconCount
                    const cap = visible[meta.prefix] ?? PAGE_SIZE
                    return (
                      <div key={meta.prefix} className="rounded-sm border border-border bg-surface-subtle/50 p-3">
                        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setExpanded((current) => {
                                const next = new Set(current)
                                if (next.has(meta.prefix)) next.delete(meta.prefix)
                                else next.add(meta.prefix)
                                return next
                              })
                              ensureSet(meta.prefix)
                            }}
                            className="font-mono font-semibold text-primary"
                          >
                            {meta.prefix}
                          </button>
                          <span className="text-text-secondary">{meta.name} · npm {meta.npm} · {String(total)} {t('icons.iconsUnit')}</span>
                          <span className="text-text-muted/70">{meta.license} · {meta.repo}</span>
                          <span className="ml-auto font-mono text-2xs text-text-muted/60">{meta.usage}</span>
                        </div>
                        {meta.note !== '' && <p className="mb-2 text-2xs text-text-muted/60">{meta.note}</p>}
                        {data === undefined && open
                          ? (
                            <div className="py-3">
                              <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                                <div className="h-full w-1/3 animate-icon-load rounded-full bg-primary" />
                              </div>
                              <p className="mt-1.5 text-2xs text-text-muted/60">{t('icons.loading')}</p>
                            </div>
                          )
                          : open
                            ? (
                              <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-9 gap-2">
                                  {slice.map(iconName => tile(`${meta.prefix}:${iconName}`, meta.prefix, iconName, data.icons[iconName]))}
                                </div>
                                {slice.length === 0 && <p className="py-2 text-2xs text-text-muted/60">{t('icons.empty')}</p>}
                                {needle.length === 0 && total > cap
                                  ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="mt-2 text-2xs"
                                      onClick={() => {
                                        setVisible((current) => {
                                          const cap = current[meta.prefix] ?? PAGE_SIZE
                                          return { ...current, [meta.prefix]: cap + PAGE_SIZE }
                                        })
                                      }}
                                    >
                                      {t('icons.showMore')} (+{String(PAGE_SIZE)})
                                    </Button>
                                  )
                                  : null}
                              </>
                            )
                            : null}
                      </div>
                    )
                  })}
              </div>
            )}
        </section>
      </div>
    </PanelCard>
  )
}
