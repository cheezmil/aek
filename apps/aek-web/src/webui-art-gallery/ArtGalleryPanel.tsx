/**
 * The aek-webui-art-gallery panel — aek-web's own port of the style-gallery
 * reference frontend IA (P16: same layout/interaction/info density; aek's
 * own widgets + stage.css skin table, no reference source copied):
 *
 *   TopBar (3 tab pills + search + visible/total + immersive/reset)
 *   + Sidebar (fav chip + repo/kind chips + grouped rows with color bars)
 *   + CompareGrid (one-screen re-skinned mini cards) / Stage (header +
 *     spec strip + 4 live tabs) driven by the current item's spec.
 *
 * State machine mirrors the reference App: tab (skill/style/compare) +
 * src (which family compare shows) + repoFilter/kindFilter + search +
 * favOnly + curId + immersive; keyboard ←/→ step, "/" focus, c copy,
 * f favorite, Esc exit immersive. Favorites persist in localStorage as
 * named groups (BO round: groupable favorites, group CRUD).
 *
 * @module @cheezmil/aek-web/src/webui-art-gallery/ArtGalleryPanel
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import './stage.css'
import { useI18n } from '../i18n.tsx'
import { parseBoolean, usePref } from '../preferences.tsx'
import { copyToClipboard } from '../clipboard.ts'
import { REPO_FALLBACK } from './data/skill-styles.ts'
import {

  MODE_COUNT,
  readCurId,
  writeCurId,
  specStyle,
  favsOfGroups,
  readFavGroups,
  writeFavGroups,
  galleryItems,
  ALL_STYLE_KINDS,
  kindDisplayName,
  readToneOverrides,
  writeToneOverride,
  effectiveToneOf,
  type GalleryItem,
  type FavGroup,
  type Tone,
} from './spec.ts'
import { TopBar, type GalleryTab } from './TopBar.tsx'
import { GallerySidebar, type RepoGroup } from './GallerySidebar.tsx'
import { CompareGrid } from './CompareGrid.tsx'
import {
  globalThemeId,
  resetGlobalTheme,
  saveGlobalTheme,
  setSkinAnimEnabled,
} from './artGlobalTheme.ts'
import { GallerySwitcher } from './GallerySwitcher.tsx'
import { Stage, type StageCounts } from './Stage.tsx'

type Family = 'skill' | 'style'

/** The reference's "detail" stage id for skills when no favorite is set. */
const DEFAULT_SKILL = 'skill-impeccable::impeccable'

export function ArtGalleryPanel({ active }: { active?: boolean }): JSX.Element {
  const { t } = useI18n()
  // BT round (m12567 ①): the skin-switch glide (BS-4) is OFF by default —
  // the user felt it janky. The persisted `aek-home.skinAnim` setting gates
  // the one-shot `.aek-skin-anim` class; sync it into the artGlobalTheme
  // module flag so every palette write (auto-apply on spec change, manual
  // global toggle, reset) honors it.
  const [skinAnim] = usePref('aek-home.skinAnim', false, parseBoolean)
  useEffect(() => { setSkinAnimEnabled(skinAnim) }, [skinAnim])
  const { styles, skills } = useMemo(() => galleryItems(), [])
  const repos = useMemo<RepoGroup[]>(() => {
    const groups = new Map<string, RepoGroup>()
    for (const s of skills) {
      const id = s.repoId ?? ''
      const cur = groups.get(id) ?? { id, name: s.repoName ?? id, color: s.repoColor ?? '#6366F1', count: 0 }
      cur.count += 1
      groups.set(id, cur)
    }
    return [...groups.values()]
  }, [skills])
  const kindGroups = useMemo<RepoGroup[]>(
    () => ALL_STYLE_KINDS.map(k => ({
      id: k.id,
      // BP round ⑨: display-layer rename map (raw generated name stays in
      // the data; the chip shows the mapped label).
      name: kindDisplayName(k.name) ?? k.name,
      color: k.color,
      count: k.count,
    })),
    [],
  )

  const [tab, setTab] = useState<GalleryTab>('style')
  const [src, setSrc] = useState<Family>('style')
  const [repoFilter, setRepoFilter] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  // BO round (m00001 ⑪): favorites are groupable. The single shared
  // `favs` set is now derived (union of every group), so all existing
  // consumers (sidebar stars, compare grid, fav chip, favOnly filter) keep
  // working unchanged. The group CRUD below is the new surface.
  const [favGroups, setFavGroups] = useState<FavGroup[]>(() => readFavGroups())
  const favs = useMemo(() => favsOfGroups(favGroups), [favGroups])
  // BP round (m02138 ⑦): the user's click-marks — an item the automatic
  // luminance classification got wrong; persisted next to the fav groups.
  const [toneOverrides, setToneOverrides] = useState<Record<string, Tone>>(() => readToneOverrides())

  /** Persist a new group list (mutates only via the CRUD helpers below). */
  const applyGroups = (next: FavGroup[]): void => {
    setFavGroups(next)
    writeFavGroups(next)
  }

  /** ⑪ create: a new named group. */
  const addGroup = (name: string): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    applyGroups([...favGroups, { id: `g${Date.now().toString(36)}`, name: trimmed, items: [] }])
    notify(t('art.favGroupAdded'))
  }

  /** ⑪ update: rename a group (the default group, id '', keeps its name). */
  const renameGroup = (id: string, name: string): void => {
    applyGroups(favGroups.map(g => (g.id === id ? { ...g, name: name.trim() || g.name } : g)))
  }

  /** ⑪ delete: drop the group; its items stay faved if they live in others. */
  const removeGroup = (id: string): void => {
    applyGroups(favGroups.filter(g => g.id !== id))
    notify(t('art.favGroupRemoved'))
  }

  /** ⑪: assign the current item to a specific group. */
  const assignGroup = (groupId: string, itemId: string): void => {
    applyGroups(
      favGroups.map(g =>
        g.id === groupId ? { ...g, items: g.items.includes(itemId) ? g.items : [...g.items, itemId] } : g,
      ),
    )
  }

  /** ⑪: un-assign an item from one group only. */
  const unassignGroup = (groupId: string, itemId: string): void => {
    applyGroups(
      favGroups.map(g => (g.id === groupId ? { ...g, items: g.items.filter(x => x !== itemId) } : g)),
    )
  }
  // BS round (m11967 ③④): open on the persisted whole-webui skin, not the
  // hard default — otherwise the stage preview shows a different (light) spec
  // than the chrome's dark skin on load, reading as "some elements not
  // themed". Falls back to DEFAULT_SKILL when nothing valid is persisted.
  // BL round (m05632 任务 C): first remember the gallery's own last-selected
  // item (aek-art-cur), so a restart lands exactly where the user left off;
  // the global-skin key stays the secondary fallback.
  const [curId, setCurId] = useState<string>(() => {
    const { styles, skills } = galleryItems()
    const valid = (id: string | null): boolean =>
      !!id && (styles.some(i => i.id === id) || skills.some(i => i.id === id))
    const remembered = readCurId()
    // BP round (BP-13): narrow through the null check itself — `valid` is a
    // plain boolean, so returning `remembered` un-narrowed made the initializer
    // `string | null` and broke `useState<string>`.
    if (remembered !== null && valid(remembered)) return remembered
    const themed = globalThemeId()
    if (themed !== null && valid(themed)) return themed
    // BN round (m06297 ①): the gallery now defaults to the style family, so a
    // fresh install (no remembered / no global skin) lands on the first style,
    // not a skill id that the style family cannot resolve.
    return styles[0]?.id ?? DEFAULT_SKILL
  })
  // BL round: persist the selected item on every change so it survives restarts.
  useEffect(() => { writeCurId(curId) }, [curId])
  // BP round (m02138 ⑦): the pill's active pool starts on the current item's
  // own (effective) tone — the user then switches pools with the 浅色/深色
  // buttons; prev/next and the list stay inside the active pool.
  const [tone, setTone] = useState<Tone>(() => {
    const { styles, skills } = galleryItems()
    const cur = styles.find(i => i.id === curId) ?? skills.find(i => i.id === curId)
    return cur ? effectiveToneOf(cur, toneOverrides) : 'light'
  })
  // BR round (m11298 ①): gallery opens immersive by default (full-bleed stage; the
  // floating switcher bottom-right or Esc exits back to TopBar + Sidebar chrome).
  const [immersive, setImmersive] = useState(true)
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null)
  const [globalId, setGlobalId] = useState<string | null>(() => globalThemeId())
  const pendingId = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number>(0)

  const items: GalleryItem[] = src === 'skill' ? skills : styles
  // BP-16 (m03167②): the fav chip counts ALL favorites, both families. The
  // BL round scoped it to the current family — that is exactly why the user's
  // skill-family favorite "disappeared" (the chip read 0 on the style tab and
  // no list could reach the other family). Total wins.
  const favCount = favs.size
  const counts: StageCounts = {
    styles: styles.length,
    skills: skills.length,
    repos: Object.keys(REPO_FALLBACK).length,
    kinds: ALL_STYLE_KINDS.length,
    modes: MODE_COUNT,
  }

  const notify = (msg: string): void => {
    setToast({ msg, key: Date.now() })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => { setToast(null) }, 1900)
  }

  /** Reference App.filter: favOnly + repo/kind filter + all-space search words.
   *  BP-16 (m03167②): favOnly is CROSS-family — the star list reaches favorites
   *  in BOTH families (the user's skill-family favorite had no way to be seen
   *  on the style tab otherwise). The per-family repo/kind chips only apply to
   *  the unfiltered list. */
  const visible = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const base = favOnly ? [...styles, ...skills] : items
    return base.filter((i) => {
      if (favOnly && !favs.has(i.id)) return false
      if (!favOnly) {
        if (src === 'skill' && repoFilter && i.repoId !== repoFilter) return false
        if (src === 'style' && kindFilter && i.kindId !== kindFilter) return false
      }
      if (!words.length) return true
      const hay = [i.spec.name, i.desc, i.repoName ?? '', i.spec.mode, i.kindName ?? '', i.src ?? '']
        .join(' ')
        .toLowerCase()
      return words.every(w => hay.includes(w))
    })
  }, [items, favOnly, favs, src, repoFilter, kindFilter, search, styles, skills])

  const defaultOf = (family: Family): string =>
    family === 'skill'
      ? (skills.some(s => s.id === DEFAULT_SKILL) ? DEFAULT_SKILL : (skills[0]?.id ?? ''))
      : (styles[0]?.id ?? '')

  /** Reference switchTab: reset the family filters, honor a pending compare pick. */
  const switchTab = (next: GalleryTab): void => {
    const family: Family = next === 'compare' ? src : next
    setTab(next)
    if (next !== 'compare') setSrc(next)
    setRepoFilter(null)
    setKindFilter(null)
    const pending = pendingId.current
    pendingId.current = null
    const target: Family = pending ? (skills.some(s => s.id === pending) ? 'skill' : 'style') : family
    setSrc(target)
    setCurId(pending ?? defaultOf(target))
  }

  const allItems = (): GalleryItem[] => [...styles, ...skills]

  /** Reference App: picking a compare card leaves the grid for that family's stage. */
  const pickFromCompare = (id: string): void => {
    pendingId.current = id
    switchTab(src)
  }

  /** BP round ⑦: the visible family items of the active tone = the pool prev/next/list move in. */
  const pool = useMemo(
    () => visible.filter(i => effectiveToneOf(i, toneOverrides) === tone),
    [visible, tone, toneOverrides],
  )

  /** Reference App keyboard step — now bounded to the tone pool (BP round ⑦). */
  const stepCur = (delta: number): void => {
    if (!pool.length) return
    const idx = pool.findIndex(i => i.id === curId)
    // A first press after the current item fell out of the pool jumps to its head.
    const next = idx === -1 ? pool[0] : pool[(idx + delta + pool.length) % pool.length]
    setCurId(next.id)
  }

  /** BP round ⑦: switch the active pool; keep the stage inside it. */
  const selectTone = (next: Tone): void => {
    if (next === tone) return
    setTone(next)
    const p = visible.filter(i => effectiveToneOf(i, toneOverrides) === next)
    if (p.length && !p.some(i => i.id === curId)) setCurId(p[0].id)
  }

  /** BP round ⑦: the user's click-mark — flip this item's tone, persisted. */
  const toggleToneMark = (id: string): void => {
    const all = allItems()
    const item = all.find(i => i.id === id)
    if (!item) return
    const next: Tone = effectiveToneOf(item, toneOverrides) === 'light' ? 'dark' : 'light'
    const nextOverrides = { ...toneOverrides, [id]: next }
    setToneOverrides(nextOverrides)
    writeToneOverride(id, next)
  }

  /** BP round: apply this spec to the whole webui, or reset when active. */
  const onGlobal = (): void => {
    if (!curItem) return
    if (globalId === curItem.id) {
      resetGlobalTheme()
      setGlobalId(null)
      notify(t('art.globalReset'))
    } else {
      saveGlobalTheme(curItem.spec)
      setGlobalId(curItem.id)
      notify(t('art.globalApplied'))
    }
  }

  // BN round (m06297 ①⑤): the list follows the selected family, but the
  // remembered / global current item may belong to the OTHER family (a skill
  // skin persisted while the gallery now defaults to styles). Resolve it
  // across both so the stage still previews the current skin with its
  // provenance card instead of dropping to the empty state.
  const curItem =
    items.find(i => i.id === curId) ??
    skills.find(i => i.id === curId) ??
    styles.find(i => i.id === curId) ??
    null

  /**
   * BQ round (m10857 item 3): switching to any style applies it to the
   * WHOLE webui by default — the stage is just a preview. Runs on every
   * spec change after mount; the mount itself is skipped so a deliberate
   * reset (localStorage cleared) is not immediately re-applied.
   */
  const mountRef = useRef(true)
  useEffect(() => {
    if (mountRef.current) { mountRef.current = false; return }
    if (!curItem) return
    saveGlobalTheme(curItem.spec)
    setGlobalId(curItem.id)
  }, [curItem])

  const toggleFav = (id: string): void => {
    const has = favs.has(id)
    // Star = membership in the default group (id ''); un-star removes the
    // item from EVERY group. A missing default group is re-created on demand.
    applyGroups(
      has
        ? favGroups.map(g => ({ ...g, items: g.items.filter(x => x !== id) }))
        : favGroups.some(g => g.id === '')
          ? favGroups.map(g => (g.id === '' ? { ...g, items: [...g.items, id] } : g))
          : [...favGroups, { id: '', name: '', items: [id] }],
    )
    const item = allItems().find(i => i.id === id)
    notify(`${item ? `${item.spec.name} — ` : ''}${has ? t('art.favRemove') : t('art.favAdd')}`)
  }

  useEffect(() => {
    // BT round (m12567 ②): the panel is keep-alive mounted (Home renders every
    // visited panel, the inactive ones with display:none but their effects
    // STILL run). The window-level keyboard handler below must only be bound
    // while THIS panel is the visible one — otherwise ←/→ (and /, c, f) step
    // the gallery skin from every other page, which is the leak the user
    // reported. `active` is the keep-alive visibility flag from Home. The
    // effect still re-runs every render (no dep array), so the inner
    // closures (stepCur/toggleFav/…) stay fresh; the guard just skips the
    // bind when this panel is hidden.
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      const inField = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      if (inField) {
        if (e.key === 'Escape') (el as HTMLInputElement).blur()
        return
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault()
          stepCur(e.key === 'ArrowLeft' ? -1 : 1)
          break
        }
        case '/':
          e.preventDefault()
          searchRef.current?.focus()
          break
        case 'c':
          // BP round ① (m02138): c copies the spec NAME only — same as the
          // header copy button; the full usage doc is not copied anywhere.
          if (curItem) void copyToClipboard(curItem.spec.name).then((ok) => { notify(ok ? t('art.copied') : 'copy failed') })
          break
        case 'f':
          if (curItem) toggleFav(curItem.id)
          break
        case 'Escape':
          setImmersive(false)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  })

  const reset = (): void => {
    setSearch('')
    setFavOnly(false)
    setRepoFilter(null)
    setKindFilter(null)
    const target = defaultOf(src)
    setCurId(target)
    // BP round ⑦: reset also lands the pool on the default item's own tone.
    const def = allItems().find(i => i.id === target)
    if (def) setTone(effectiveToneOf(def, toneOverrides))
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {toast ? (
        <div
          key={toast.key}
          className="border-border bg-background text-foreground absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium shadow-lg animate-tier-in"
        >
          {toast.msg}
        </div>
      ) : null}

      {!immersive ? (
        <TopBar
          tab={tab}
          onTab={switchTab}
          styleCount={styles.length}
          skillCount={skills.length}
          search={search}
          onSearch={setSearch}
          searchRef={searchRef}
          stat={favOnly
            ? `${visible.length} / ${styles.length + skills.length}`
            : `${visible.length} / ${items.length}`}
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        {!immersive && tab !== 'compare' ? (
          <GallerySidebar
            tab={src}
            repos={repos}
            repoFilter={repoFilter}
            onRepoFilter={setRepoFilter}
            kindFilter={kindFilter}
            onKindFilter={setKindFilter}
            kindGroups={kindGroups}
            favOnly={favOnly}
            favCount={favCount}
            onFavOnly={setFavOnly}
            favs={favs}
            visible={visible}
            curId={curId}
            onSelect={setCurId}
          />
        ) : null}

        {/* BO round (m00001 ⑩): the floating switcher pill sits bottom-right
            over this scroll container — the extra bottom padding lets the
            content scroll PAST the pill so it never hides the last row.
            BG-fix (BQ round ①): that padding now lives on each CHILD, not on
            `main` itself. With it on `main`, `.aek-stage`'s `min-h-full`
            (=100% of main's content box, which excludes the 96px padding)
            stopped 96px short of the bottom and the cyber grid texture —
            painted on `.aek-stage::before` inset:0 — never covered that
            strip, so it showed `main`'s white background (the "网格下面留白"
            bug). Moving pb-24 into the children puts the scroll-past-pill
            space INSIDE the textured `.aek-stage`, so the grid now fills the
            whole viewport. The empty/compare views keep an equivalent
            pb-24 wrapper so the pill still never hides their last row. */}
        <main className="min-w-0 flex-1 overflow-auto">
          {tab === 'compare' ? (
            <div className="pb-24">
              <CompareGrid
                visible={visible}
                curId={curId}
                counts={{ styles: styles.length, skills: skills.length, modes: MODE_COUNT }}
                favs={favs}
                onPick={pickFromCompare}
                onToggleFav={toggleFav}
              />
            </div>
          ) : curItem ? (
            <div
              className="aek-stage min-h-full pb-24"
              style={specStyle(curItem.spec)}
              data-mode={curItem.spec.mode}
              data-font={curItem.spec.font}
            >
              {/* BP round (BP-13): Stage no longer owns the global apply/reset
                  button — it moved into the floating pill (BO round ⑦), so the
                  panel passes no global props to Stage. */}
              <Stage
                item={curItem}
                counts={counts}
                faved={favs.has(curItem.id)}
                onToggleFav={() => { toggleFav(curItem.id) }}
                onNotify={notify}
              />
            </div>
          ) : (
            <div className="pb-24">
              <div className="text-muted-foreground p-10 text-center text-xs">{t('art.empty')}</div>
            </div>
          )}
        </main>
      </div>

      <GallerySwitcher
        items={pool}
        allItems={allItems()}
        curId={curId}
        curIdx={pool.findIndex(i => i.id === curId)}
        immersive={immersive}
        onPrev={() => { stepCur(-1) }}
        onNext={() => { stepCur(1) }}
        onSelect={(id) => { if (tab === 'compare') { pickFromCompare(id) } else { setCurId(id) } }}
        onExitImmersive={() => { setImmersive(false) }}
        onToggleImmersive={() => { setImmersive(v => !v) }}
        onReset={reset}
        onGlobal={onGlobal}
        globalActive={globalId === curId}
        tone={tone}
        onSelectTone={selectTone}
        toneOf={(id) => {
          const it = allItems().find(i => i.id === id)
          return it ? effectiveToneOf(it, toneOverrides) : 'light'
        }}
        onToggleToneMark={toggleToneMark}
        groups={favGroups}
        onAddGroup={addGroup}
        onRenameGroup={renameGroup}
        onRemoveGroup={removeGroup}
        onAssignGroup={assignGroup}
        onUnassignGroup={unassignGroup}
      />
    </div>
  )
}
