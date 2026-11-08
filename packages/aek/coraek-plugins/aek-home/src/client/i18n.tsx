/**
 * Zero-dependency i18n for the AEK console.
 *
 * Two flat dictionaries (zh-CN / en-US), a React context and a host-persisted
 * preference (C11: the locale itself is stored under `<AEK_HOME>/preferences/`,
 * never in localStorage). Deliberately no i18n library: the frontend stack
 * gate allows only React + Vite + TS + lightningcss + CSS Modules.
 *
 * @module @cheezmil/aek-home/src/client/i18n
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { oneOf, PREF_KEYS, usePref } from './preferences.tsx'

/** Supported display languages. */
export const LOCALES = ['zh-CN', 'en-US'] as const

/** One supported display language. */
export type Locale = typeof LOCALES[number]

/** Simplified Chinese copy. Also the fallback for missing keys. */
const ZH: Record<string, string> = {
  'nav.search': '搜索板块…',
  'nav.searchAria': '搜索侧边栏板块',
  'nav.clear': '清除搜索',
  'nav.noMatch': '没有匹配的板块',
  'brand.expand': '点击展开菜单栏',
  'brand.collapse': '点击收起菜单栏',
  'brand.pinOpen': '点击固定展开菜单栏',
  'footer.language': '显示语言',
  'footer.github': '打开 GitHub 仓库',
  'panel.runtime': '运行模式',
  'panel.websearch': 'Web Search',
  'panel.plugins': '插件',
  'panel.settings': '设置',
  'panel.about': '关于',
  'common.loading': '读取中…',
  'common.retry': '重试',
  'common.refresh': '刷新',
  'common.enabled': '已启用',
  'common.disabled': '已停用',
  'websearch.title': '搜索提供商',
  'websearch.subtitle': '启用开关直接写回宿主的 providers.yml；密钥数来自加密 key pool',
  'websearch.loading': '正在读取宿主配置…',
  'websearch.empty': '宿主没有报告任何提供商',
  'websearch.error': '操作失败：{message}',
  'websearch.col.enabled': '启用',
  'websearch.col.provider': '提供商',
  'websearch.col.keys': '密钥数',
  'websearch.col.status': '状态',
  'websearch.pool': '已配置密钥池',
  'websearch.noPool': '无密钥池文件',
  'websearch.config': '配置文件',
  'websearch.manageKeys': '管理密钥',
  'keys.title': '密钥管理',
  'keys.subtitle': '增删改查密钥；列表默认打码省略，只有点击某条的「显示」才会取回那一条的明文。',
  'keys.provider': '提供商',
  'keys.placeholder': '输入新的 API key',
  'keys.add': '添加',
  'keys.col.key': '密钥（掩码）',
  'keys.col.state': '状态',
  'keys.col.actions': '操作',
  'keys.edit': '修改',
  'keys.save': '保存',
  'keys.cancel': '取消',
  'keys.delete': '删除',
  'keys.enable': '启用',
  'keys.disable': '停用',
  'keys.editPlaceholder': '输入替换后的 API key',
  'keys.empty': '该提供商还没有密钥',
  'keys.deleteConfirm': '确认删除这条密钥？删除后无法恢复。',
  'keys.failures': '{n} 次失败',
  'keys.loading': '正在读取密钥池…',
  'keys.show': '显示明文',
  'keys.hide': '隐藏明文',
  'keys.note': '密钥保存在宿主的加密池中。列表只返回掩码标签与行 id；只有点击某一条密钥的「显示」后，宿主才会单独取回那一条的明文，用完即弃，任何列表接口都不会回传明文。',
  'keys.error': '密钥操作失败：{message}',
  'plugins.title': 'AEK 插件',
  'plugins.subtitle': 'AEK 插件包与版本',
  'plugins.count': '{n} 个',
  'plugins.empty': '暂时没有读取到插件清单',
  'settings.title': '显示设置',
  'settings.subtitle': '设置保存在本机 AEK 数据目录中，所有窗口共享，刷新后依然生效',
  'settings.hover': '指针移动到侧边栏自动展开',
  'settings.hoverHint': '勾选后，侧边栏处于收起状态时，把指针移到上面会临时展开；移出后恢复。',
  'settings.logoToggle': '点击 logo 展开或收起左侧侧栏',
  'settings.logoToggleHint': '勾选后，点击侧边栏顶部的 logo 会立即展开或收起侧栏；取消勾选后 logo 不再响应点击。默认开启。',
  'about.title': '版本信息',
  'about.install': '安装方式',
  'about.dev': 'dev 开发版',
  'about.npm': 'npm 安装版',
  'about.source': '判定依据',
  'about.group.plugin': 'AEK 插件',
  'about.group.base': 'base 环境',
  'about.col.package': '包名',
  'about.col.version': '版本号',
  'about.col.kind': '来源',
  'about.loading': '正在读取插件清单…',
  'about.error': '清单读取失败：{message}',
  'about.empty': '没有读取到包清单',
  'runtime.title': '运行模式',
  'runtime.subtitle': '在 AEK 与 AEK Next 之间切换实例：可只运行其中之一，也可同时运行两个。',
  'runtime.current': '当前实例',
  'runtime.aek': 'AEK',
  'runtime.next': 'AEK Next',
  'runtime.running': '运行中',
  'runtime.stopped': '未运行',
  'runtime.target': '目标模式',
  'runtime.onlyAek': '仅 AEK',
  'runtime.onlyNext': '仅 AEK Next',
  'runtime.both': '同时运行两个',
  'runtime.apply': '应用',
  'runtime.active': '当前',
  'runtime.web': '后端服务',
  'runtime.shell': '桌面窗口',
  'runtime.confirmTitle': '切换运行模式？',
  'runtime.confirmText': '该操作会停止当前正在使用的实例，其它已打开的窗口将断开连接。确定继续？',
  'runtime.confirmYes': '确定切换',
  'runtime.confirmNo': '取消',
  'runtime.loading': '读取运行模式…',
  'runtime.error': '操作失败：{message}',
}

/** English copy. */
const EN: Record<string, string> = {
  'nav.search': 'Search sections…',
  'nav.searchAria': 'Search sidebar sections',
  'nav.clear': 'Clear search',
  'nav.noMatch': 'No matching sections',
  'brand.expand': 'Click to expand the sidebar',
  'brand.collapse': 'Click to collapse the sidebar',
  'brand.pinOpen': 'Click to keep the sidebar open',
  'footer.language': 'Display language',
  'footer.github': 'Open GitHub repository',
  'panel.runtime': 'Runtime mode',
  'panel.websearch': 'Web Search',
  'panel.plugins': 'Plugins',
  'panel.settings': 'Settings',
  'panel.about': 'About',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.refresh': 'Refresh',
  'common.enabled': 'Enabled',
  'common.disabled': 'Disabled',
  'websearch.title': 'Search providers',
  'websearch.subtitle': 'The toggle writes straight back to the host providers.yml; key counts come from the encrypted pool',
  'websearch.loading': 'Reading host configuration…',
  'websearch.empty': 'The host reported no providers',
  'websearch.error': 'Operation failed: {message}',
  'websearch.col.enabled': 'On',
  'websearch.col.provider': 'Provider',
  'websearch.col.keys': 'Keys',
  'websearch.col.status': 'Status',
  'websearch.pool': 'Key pool configured',
  'websearch.noPool': 'No key pool file',
  'websearch.config': 'Config file',
  'websearch.manageKeys': 'Manage keys',
  'keys.title': 'API keys',
  'keys.subtitle': 'Create, read, update and delete keys. Rows stay masked by default; only clicking "show" on one row fetches that single literal.',
  'keys.provider': 'Provider',
  'keys.placeholder': 'New API key',
  'keys.add': 'Add',
  'keys.col.key': 'Key (masked)',
  'keys.col.state': 'Status',
  'keys.col.actions': 'Actions',
  'keys.edit': 'Edit',
  'keys.save': 'Save',
  'keys.cancel': 'Cancel',
  'keys.delete': 'Delete',
  'keys.enable': 'Enable',
  'keys.disable': 'Disable',
  'keys.editPlaceholder': 'Replacement API key',
  'keys.empty': 'No keys for this provider yet',
  'keys.deleteConfirm': 'Delete this key? This cannot be undone.',
  'keys.failures': '{n} failures',
  'keys.loading': 'Reading key pool…',
  'keys.show': 'Show key',
  'keys.hide': 'Hide key',
  'keys.note': 'Keys live in the host encrypted pool. Listing returns masked tags and row ids only; a plaintext literal is fetched single-row, single-purpose — only when you click "show" on that exact row, and nothing ever re-echoes it into a list.',
  'keys.error': 'Key operation failed: {message}',
  'plugins.title': 'AEK plugins',
  'plugins.subtitle': 'AEK packages and versions',
  'plugins.count': '{n} total',
  'plugins.empty': 'No plugin inventory available yet',
  'settings.title': 'Display settings',
  'settings.subtitle': 'Settings are stored in the AEK data directory on this machine, shared by every window, and survive a refresh',
  'settings.hover': 'Auto-expand sidebar on pointer hover',
  'settings.hoverHint': 'When the sidebar is collapsed, moving the pointer over it expands it temporarily and moving away collapses it again.',
  'settings.logoToggle': 'Click the logo to expand or collapse the sidebar',
  'settings.logoToggleHint': 'When on, clicking the top logo expands or collapses the sidebar; when off the logo is inert. On by default.',
  'about.title': 'Version information',
  'about.install': 'Installation',
  'about.dev': 'dev (workspace checkout)',
  'about.npm': 'npm install',
  'about.source': 'Detection',
  'about.group.plugin': 'AEK plugins',
  'about.group.base': 'Base environment',
  'about.col.package': 'Package',
  'about.col.version': 'Version',
  'about.col.kind': 'Source',
  'about.loading': 'Reading plugin inventory…',
  'about.error': 'Inventory failed: {message}',
  'about.empty': 'No package inventory available',
  'runtime.title': 'Runtime mode',
  'runtime.subtitle': 'Switch instances between AEK and AEK Next: run one of them, or run both together.',
  'runtime.current': 'Current instance',
  'runtime.aek': 'AEK',
  'runtime.next': 'AEK Next',
  'runtime.running': 'Running',
  'runtime.stopped': 'Stopped',
  'runtime.target': 'Target mode',
  'runtime.onlyAek': 'AEK only',
  'runtime.onlyNext': 'AEK Next only',
  'runtime.both': 'Run both',
  'runtime.apply': 'Apply',
  'runtime.active': 'Active',
  'runtime.web': 'Backend',
  'runtime.shell': 'Window',
  'runtime.confirmTitle': 'Switch runtime mode?',
  'runtime.confirmText': 'This stops the instance you are using now; other open windows will disconnect. Continue?',
  'runtime.confirmYes': 'Switch',
  'runtime.confirmNo': 'Cancel',
  'runtime.loading': 'Reading runtime mode…',
  'runtime.error': 'Operation failed: {message}',
}

/** Dictionaries keyed by locale. */
const DICTS: Record<Locale, Record<string, string>> = { 'zh-CN': ZH, 'en-US': EN }

/** Values available through {@link useI18n}. */
export interface I18nValue {
  /** Active locale. */
  locale: Locale
  /** Switch the display language. */
  setLocale: (locale: Locale) => void
  /** Translate one key. */
  t: (key: string) => string
  /** Translate one key, interpolating `{name}` placeholders. */
  tf: (key: string, values: Readonly<Record<string, string | number>>) => string
}

const I18nContext = createContext<I18nValue | undefined>(undefined)

/**
 * Provide the active locale and translators to the whole console.
 * @param props - child tree.
 * @returns the provider.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setStored] = usePref<Locale>(PREF_KEYS.locale, 'zh-CN', oneOf(LOCALES))
  const t = (key: string): string => DICTS[locale][key] ?? ZH[key] ?? key
  const tf = (key: string, values: Readonly<Record<string, string | number>>): string => t(key)
    .replace(/\{(\w+)\}/gu, (match, name: string) => values[name] === undefined ? match : String(values[name]))
  return (
    <I18nContext.Provider value={{ locale, setLocale: setStored, t, tf }}>
      {children}
    </I18nContext.Provider>
  )
}

/**
 * Read the active locale and translators.
 * @returns the i18n value.
 * @throws when used outside {@link I18nProvider}.
 */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (value === undefined) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
