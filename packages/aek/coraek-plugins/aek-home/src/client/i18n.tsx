/**
 * Zero-dependency i18n for the AEK console.
 *
 * Two flat dictionaries (zh-CN / en-US), a React context and a persisted
 * preference. Deliberately no i18n library: the frontend stack gate allows
 * only React + Vite + TS + lightningcss + CSS Modules. The pattern follows
 * the common lightweight approach (flat keys, localStorage persistence,
 * instant switch, fallback to the default locale).
 *
 * @module @cheezmil/aek-home/src/client/i18n
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { oneOf, PREF_KEYS, useStoredState } from './preferences.ts'

/** Supported display languages. */
export const LOCALES = ['zh-CN', 'en-US'] as const

/** One supported display language. */
export type Locale = typeof LOCALES[number]

/** Simplified Chinese copy. Also the fallback for missing keys. */
const ZH: Record<string, string> = {
  'nav.search': '搜索选项…',
  'nav.searchAria': '搜索侧边栏选项',
  'nav.clear': '清除搜索',
  'nav.noMatch': '没有匹配的选项',
  'brand.expand': '点击展开菜单栏',
  'brand.collapse': '点击收起菜单栏',
  'brand.pinOpen': '点击固定展开菜单栏',
  'footer.language': '显示语言',
  'footer.github': '打开 GitHub 仓库',
  'panel.overview': '概览',
  'panel.websearch': 'Web Search',
  'panel.plugins': '插件',
  'panel.settings': '设置',
  'panel.about': '关于',
  'page.eyebrow.overview': '工作台',
  'page.eyebrow.websearch': '工作台 / Web Search',
  'page.eyebrow.plugins': '管理 / 插件',
  'page.eyebrow.settings': '管理 / 设置',
  'page.eyebrow.about': '帮助 / 关于',
  'page.subtitle.overview': '本地实例的运行状态与快捷入口',
  'page.subtitle.websearch': '管理多提供商搜索与密钥池状态',
  'page.subtitle.plugins': 'AEK 插件包与版本',
  'page.subtitle.settings': '界面显示偏好',
  'page.subtitle.about': '插件版本与安装方式',
  'overview.heroTitle': 'Hello, AEK',
  'overview.heroText': 'Agent Enhance Kit 管理面板。这里集中展示本地实例的运行状态、搜索提供商与插件信息；所有数据都来自宿主 API，刷新后以配置文件为准。',
  'overview.openWebsearch': '打开 Web Search',
  'overview.viewPlugins': '查看插件',
  'overview.stats': '运行概况',
  'stat.providers': '搜索提供商',
  'stat.providersHint': '已启用 {n} 个',
  'stat.keys': '密钥池条目',
  'stat.keysHint': '来自加密 key pool',
  'stat.home': '配置目录',
  'stat.homeHint': '宿主实际读取的位置',
  'overview.quick': '快捷入口',
  'quick.websearch': '管理搜索提供商与密钥池',
  'quick.plugins': '查看 AEK 插件',
  'quick.settings': '界面显示偏好',
  'quick.about': '插件版本与安装方式',
  'overview.apiHint': '数据接口',
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
  'keys.title': '密钥管理',
  'keys.subtitle': '增删改查密钥；明文只在提交时离开输入框，页面永远只显示掩码。',
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
  'keys.note': '密钥保存在宿主的加密池中。列表只返回掩码标签与行 id，任何接口都不会把明文回传到浏览器。',
  'keys.error': '密钥操作失败：{message}',
  'plugins.title': 'AEK 插件',
  'plugins.subtitle': 'AEK 插件包与版本',
  'plugins.count': '{n} 个',
  'plugins.empty': '暂时没有读取到插件清单',
  'settings.title': '显示设置',
  'settings.subtitle': '偏好保存在本机浏览器中，刷新后依然生效',
  'settings.hover': '指针移动到侧边栏自动展开',
  'settings.hoverHint': '勾选后，侧边栏处于收起状态时，把指针移到上面会临时展开；移出后恢复。点击顶部 logo 可永久展开或收起。',
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
  'runtime.confirmTitle': '切换运行模式？',
  'runtime.confirmText': '该操作会停止当前正在使用的实例，其它已打开的窗口将断开连接。确定继续？',
  'runtime.confirmYes': '确定切换',
  'runtime.confirmNo': '取消',
  'runtime.loading': '读取运行模式…',
  'runtime.error': '操作失败：{message}',
}

/** English copy. */
const EN: Record<string, string> = {
  'nav.search': 'Search menu…',
  'nav.searchAria': 'Search sidebar items',
  'nav.clear': 'Clear search',
  'nav.noMatch': 'No matching items',
  'brand.expand': 'Click to expand the sidebar',
  'brand.collapse': 'Click to collapse the sidebar',
  'brand.pinOpen': 'Click to keep the sidebar open',
  'footer.language': 'Display language',
  'footer.github': 'Open GitHub repository',
  'panel.overview': 'Overview',
  'panel.websearch': 'Web Search',
  'panel.plugins': 'Plugins',
  'panel.settings': 'Settings',
  'panel.about': 'About',
  'page.eyebrow.overview': 'Workspace',
  'page.eyebrow.websearch': 'Workspace / Web Search',
  'page.eyebrow.plugins': 'Manage / Plugins',
  'page.eyebrow.settings': 'Manage / Settings',
  'page.eyebrow.about': 'Help / About',
  'page.subtitle.overview': 'Local instance status and shortcuts',
  'page.subtitle.websearch': 'Manage search providers and key pools',
  'page.subtitle.plugins': 'AEK packages and versions',
  'page.subtitle.settings': 'Interface display preferences',
  'page.subtitle.about': 'Plugin versions and installation kind',
  'overview.heroTitle': 'Hello, AEK',
  'overview.heroText': 'The Agent Enhance Kit console. It shows local instance status, search providers and plugin facts; all data comes from host APIs and the config file stays authoritative after a refresh.',
  'overview.openWebsearch': 'Open Web Search',
  'overview.viewPlugins': 'View plugins',
  'overview.stats': 'At a glance',
  'stat.providers': 'Search providers',
  'stat.providersHint': '{n} enabled',
  'stat.keys': 'Key pool entries',
  'stat.keysHint': 'From the encrypted key pool',
  'stat.home': 'Config directory',
  'stat.homeHint': 'Where the host actually reads',
  'overview.quick': 'Shortcuts',
  'quick.websearch': 'Manage providers and API keys',
  'quick.plugins': 'View AEK plugins',
  'quick.settings': 'Display preferences',
  'quick.about': 'Versions and installation',
  'overview.apiHint': 'Data API',
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
  'keys.title': 'API keys',
  'keys.subtitle': 'Create, read, update and delete keys. Plaintext leaves the input only on submit; the page always shows masked tags.',
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
  'keys.note': 'Keys are stored in the host encrypted pool. The list returns masked tags and row ids only; no endpoint sends plaintext back to the browser.',
  'keys.error': 'Key operation failed: {message}',
  'plugins.title': 'AEK plugins',
  'plugins.subtitle': 'AEK packages and versions',
  'plugins.count': '{n} total',
  'plugins.empty': 'No plugin inventory available yet',
  'settings.title': 'Display settings',
  'settings.subtitle': 'Preferences are stored in this browser and survive a refresh',
  'settings.hover': 'Auto-expand sidebar on pointer hover',
  'settings.hoverHint': 'When the sidebar is collapsed, moving the pointer over it expands it temporarily and moving away collapses it again. Click the top logo to lock it open or closed.',
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
  const [locale, setStored] = useStoredState<Locale>(PREF_KEYS.locale, 'zh-CN', oneOf(LOCALES))
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
