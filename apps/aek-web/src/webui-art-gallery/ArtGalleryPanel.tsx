/**
 * The aek-webui-art-gallery panel — aek-web's own port of the style-gallery
 * reference frontend IA (P16: same layout/interaction/info density; aek's
 * own widgets + stage.css skin table, no reference source copied):
 *   TopBar (style/compare pills + search + visible/total)
 *   + Sidebar (4 chip pools 收藏/浅色/深色/程序无法分类 + grouped rows)
 *   + Sidebar (fav chip + repo/kind chips + grouped rows with color bars)
 *   + CompareGrid (one-screen re-skinned mini cards) / Stage (header +
 *     spec strip + 4 live tabs) driven by the current item's spec.
 *
 * BQ4 round: state = tab (style/compare) + viewSel (the 4-way chip pool
 * fav/light/dark/unclass, cross-family) + search + curId + immersive;
 * left/right step within the active chip pool, "/" focus, c copy,
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
  isUnmarked,
  type GalleryItem,
  type FavGroup,
  type Tone,
  type ViewSel,
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
  // BQ4 round: the repo filter chips are retired — only kind groups remain,
  // feeding the sidebar row group-header colors.
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
  // BQ4 round (m00001): the chip-row 4-way pool selector replaces the retired
  // src-family / repoFilter / kindFilter / favOnly / tone states. Default is
  // 浅色; 程序无法分类 is where the user confirms auto-guessed tones.
  const [viewSel, setViewSel] = useState<ViewSel>('light')
  const [search, setSearch] = useState('')
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
  // BR round (m11298 ①): gallery opens immersive by default (full-bleed stage; the
  // floating switcher bottom-right or Esc exits back to TopBar + Sidebar chrome).
  const [immersive, setImmersive] = useState(true)
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null)
  const [globalId, setGlobalId] = useState<string | null>(() => globalThemeId())
  const pendingId = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number>(0)

  // BQ4 round (m00001): the gallery is now cross-family — every pool (收藏 /
  // 浅色 / 深色 / 程序无法分类) spans BOTH the style and the skill families,
  // since the 按-Skill top pill is banned. `allItems` is the shared universe.
  const allItems = useMemo<GalleryItem[]>(() => [...styles, ...skills], [styles, skills])
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

  /** BQ4 round (m00001): filter one chip pool (cross-family) by its rule + the
      search words. fav = favorites; light/dark = the effective tone; unclass
      = no user tone mark yet (still riding the automatic guess). */
  const filterPool = (view: ViewSel, ovr: Record<string, Tone>): GalleryItem[] => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return allItems.filter((i) => {
      if (view === 'fav' && !favs.has(i.id)) return false
      if (view === 'light' && effectiveToneOf(i, ovr) !== 'light') return false
      if (view === 'dark' && effectiveToneOf(i, ovr) !== 'dark') return false
      if (view === 'unclass' && !isUnmarked(i.id, ovr)) return false
      if (!words.length) return true
      const hay = [i.spec.name, i.desc, i.repoName ?? '', i.spec.mode, i.kindName ?? '', i.src ?? '']
        .join(' ')
        .toLowerCase()
      return words.every(w => hay.includes(w))
    })
  }

  /** BQ4 round: the active chip pool = the sidebar list AND the keyboard/switcher
      pool; left/right step ONLY inside it (the user's tab-driven stepping). */
  const pool = useMemo(() => filterPool(viewSel, toneOverrides), [viewSel, toneOverrides, search, allItems, favs])

  /** Per-chip pool counts (search-insensitive) shown on the sidebar chips. */
  const chipCounts = useMemo(() => {
    let light = 0
    let dark = 0
    let unclass = 0
    for (const i of allItems) {
      const tn = effectiveToneOf(i, toneOverrides)
      if (tn === 'light') light += 1
      else dark += 1
      if (isUnmarked(i.id, toneOverrides)) unclass += 1
    }
    return { fav: favs.size, light, dark, unclass }
  }, [allItems, favs, toneOverrides])

  const defaultItem = (): GalleryItem =>
    styles.find(i => i.id === DEFAULT_SKILL) ?? styles[0]


  /** BQ4 round: the top tab is chrome only (stage vs the compare grid) — the
  /** pool selector moved to the sidebar chips, so no family reset happens.
  /** A pending compare pick (pickFromCompare) lands on that item's stage.
  /** BQ4-4: the shadcn tab embeds the plugin-served SPA — exit immersive so
  /** the TopBar chrome stays visible (the iframe needs the pill row).
  */
  const switchTab = (next: GalleryTab): void => {
    setTab(next)
    if (next === 'shadcn') setImmersive(false)
    if (next === 'style') {
      const pending = pendingId.current
      if (pending) {
        pendingId.current = null
        setCurId(pending)
      }
    }
  }


  /** BQ4 round: picking a compare card leaves the grid for that item's stage. */
  const pickFromCompare = (id: string): void => {
    pendingId.current = id
    switchTab('style')
  }


  /** BQ4 round: left/right step within the active chip pool (the user's tab-driven stepping). */
  const stepCur = (delta: number): void => {
    if (!pool.length) return
    const idx = pool.findIndex(i => i.id === curId)
    // A first press after the current item fell out of the pool jumps to its head.
    const next = idx === -1 ? pool[0] : pool[(idx + delta + pool.length) % pool.length]
    setCurId(next.id)
  }

  /** BQ4 round: switch the active chip pool; keep the stage inside it. */
  const selectViewSel = (next: ViewSel): void => {
    if (next === viewSel) return
    setViewSel(next)
    const p = filterPool(next, toneOverrides)
    if (p.length && !p.some(i => i.id === curId)) setCurId(p[0].id)
  }

  /** BQ4 round: the user's 浅/深色 mark on an auto-guessed item — set an
  /** explicit tone (persisted via writeToneOverride, the user's 记忆要求).
  /** In the 程序无法分类 view the item leaves the pool, so step on to the
  /** next unmarked one; in a tone view it simply moves to its new pool. */
  const markTone = (id: string, next: Tone): void => {
    const nextOverrides = { ...toneOverrides, [id]: next }
    setToneOverrides(nextOverrides)
    writeToneOverride(id, next)
    if (viewSel === 'unclass') {
      const rest = filterPool('unclass', nextOverrides)
      if (rest.length) setCurId(rest[0].id)
    }
  }

  /** BP round ⑦: the list-row click-mark — flip this item's tone, persisted. */
  const toggleToneMark = (id: string): void => {
    const item = allItems.find(i => i.id === id)
    if (!item) return
    markTone(id, effectiveToneOf(item, toneOverrides) === 'light' ? 'dark' : 'light')
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

  // BQ4 round: pools are cross-family, so the current item resolves across
  // the whole universe (a remembered / global-skin id may be a skill).
  const curItem = allItems.find(i => i.id === curId) ?? null

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
    const item = allItems.find(i => i.id === id)
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
      // BQ4-4: the shadcn tab embeds the plugin SPA (iframe) — the style-pool
      // keyboard shortcuts do not apply there.
      if (tab === 'shadcn') return
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

  /** BQ4 round: reset clears the search and lands on 浅色 + the default item. */
  const reset = (): void => {
    setSearch('')
    setViewSel('light')
    setCurId(defaultItem().id)
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
          search={search}
          onSearch={setSearch}
          searchRef={searchRef}
          stat={`${pool.length} / ${allItems.length}`}
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        {!immersive && tab !== 'compare' && tab !== 'shadcn' ? (
          <GallerySidebar
            viewSel={viewSel}
            onViewSel={selectViewSel}
            counts={chipCounts}
            kindGroups={kindGroups}
            favs={favs}
            visible={pool}
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
        {tab === 'shadcn' ? (
          /* BQ4-4: the shadcn/ui component gallery — the plugin-served SPA
             (aek-ui-gallery host face, prefix route /ui/ui-gallery), embedded
             full-bleed; the heavy component tree stays in the coraek plugin. */
          <iframe
            className="h-full w-full border-0 bg-background"
            src="/ui/ui-gallery/"
            title={t('art.tab.shadcn')}
          />
        ) : (
          <main className="min-w-0 flex-1 overflow-auto">
            {tab === 'compare' ? (
              <div className="pb-24">
                <CompareGrid
                  visible={pool}
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
        )}
      </div>

      {tab !== 'shadcn' ? (
        <GallerySwitcher
          items={pool}
          allItems={allItems}
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
          viewSel={viewSel}
          onSelectView={selectViewSel}
          toneOf={(id) => {
            const it = allItems.find(i => i.id === id)
            return it ? effectiveToneOf(it, toneOverrides) : 'light'
          }}
          onMarkTone={markTone}
          onToggleToneMark={toggleToneMark}
          groups={favGroups}
          onAddGroup={addGroup}
          onRenameGroup={renameGroup}
          onRemoveGroup={removeGroup}
          onAssignGroup={assignGroup}
          onUnassignGroup={unassignGroup}
        />
      ) : null}
    </div>
  )
}
