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
 * f favorite, Esc exit immersive. Favorites persist in localStorage.
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
  cssSnippet,
  MODE_COUNT,
  readFavorites,
  specStyle,
  writeFavorites,
  galleryItems,
  ALL_STYLE_KINDS,
  type GalleryItem,
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
    () => ALL_STYLE_KINDS.map(k => ({ id: k.id, name: k.name, color: k.color, count: k.count })),
    [],
  )

  const [tab, setTab] = useState<GalleryTab>('skill')
  const [src, setSrc] = useState<Family>('skill')
  const [repoFilter, setRepoFilter] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [favs, setFavs] = useState<ReadonlySet<string>>(() => readFavorites())
  // BS round (m11967 ③④): open on the persisted whole-webui skin, not the
  // hard default — otherwise the stage preview shows a different (light) spec
  // than the chrome's dark skin on load, reading as "some elements not
  // themed". Falls back to DEFAULT_SKILL when nothing valid is persisted.
  const [curId, setCurId] = useState<string>(() => {
    const persisted = globalThemeId()
    if (persisted) {
      const { styles, skills } = galleryItems()
      if (styles.some(i => i.id === persisted) || skills.some(i => i.id === persisted)) return persisted
    }
    return DEFAULT_SKILL
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

  /** Reference App.filter: favOnly + repo/kind filter + all-space search words. */
  const visible = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return items.filter((i) => {
      if (favOnly && !favs.has(i.id)) return false
      if (src === 'skill' && repoFilter && i.repoId !== repoFilter) return false
      if (src === 'style' && kindFilter && i.kindId !== kindFilter) return false
      if (!words.length) return true
      const hay = [i.spec.name, i.desc, i.repoName ?? '', i.spec.mode, i.kindName ?? '', i.src ?? '']
        .join(' ')
        .toLowerCase()
      return words.every(w => hay.includes(w))
    })
  }, [items, favOnly, favs, src, repoFilter, kindFilter, search])

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

  /** Reference App keyboard step — shared by the ←/→ handler and the corner switcher. */
  const stepCur = (delta: number): void => {
    const idx = items.findIndex(i => i.id === curId)
    const next = items.length ? items[(idx + delta + items.length) % items.length] : items[0]
    setCurId(next.id)
  }

  /** Reference Switcher's 随机 button. */
  const pickRandom = (): void => {
    if (!items.length) return
    setCurId(items[Math.floor(Math.random() * items.length)].id)
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

  const curItem = items.find(i => i.id === curId) ?? null

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
    setFavs((cur) => {
      const next = new Set(cur)
      if (has) next.delete(id)
      else next.add(id)
      writeFavorites(next)
      return next
    })
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
          if (curItem) void copyToClipboard(cssSnippet(curItem.spec)).then((ok) => { notify(ok ? t('art.copied') : 'copy failed') })
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
    setCurId(defaultOf(src))
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
          skillCount={skills.length}
          styleCount={styles.length}
          search={search}
          onSearch={setSearch}
          searchRef={searchRef}
          stat={`${visible.length} / ${items.length}`}
          immersive={immersive}
          onToggleImmersive={() => { setImmersive(v => !v) }}
          onReset={reset}
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
            favCount={favs.size}
            onFavOnly={setFavOnly}
            favs={favs}
            visible={visible}
            curId={curId}
            onSelect={setCurId}
          />
        ) : null}

        <main className="min-w-0 flex-1 overflow-auto">
          {tab === 'compare' ? (
            <CompareGrid
              visible={visible}
              curId={curId}
              counts={{ styles: styles.length, skills: skills.length, modes: MODE_COUNT }}
              favs={favs}
              onPick={pickFromCompare}
              onToggleFav={toggleFav}
            />
          ) : curItem ? (
            <div
              className="aek-stage min-h-full"
              style={specStyle(curItem.spec)}
              data-mode={curItem.spec.mode}
              data-font={curItem.spec.font}
            >
              <Stage
                item={curItem}
                counts={counts}
                faved={favs.has(curItem.id)}
                onToggleFav={() => { toggleFav(curItem.id) }}
                onNotify={notify}
                globalActive={globalId === curItem.id}
                onGlobal={onGlobal}
              />
            </div>
          ) : (
            <div className="text-muted-foreground p-10 text-center text-xs">{t('art.empty')}</div>
          )}
        </main>
      </div>

      <GallerySwitcher
        items={items}
        curId={curId}
        curIdx={items.findIndex(i => i.id === curId)}
        immersive={immersive}
        onPrev={() => { stepCur(-1) }}
        onNext={() => { stepCur(1) }}
        onRandom={pickRandom}
        onSelect={(id) => { if (tab === 'compare') { pickFromCompare(id) } else { setCurId(id) } }}
        onExitImmersive={() => { setImmersive(false) }}
      />
    </div>
  )
}
