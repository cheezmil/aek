/**
 * Locale bundles for the skill-hub card (the plugin's own dictionary
 * namespace, registered with the client locale service).
 *
 * @module aek-skill-manager/client/locales
 */

/** Locale keys this card renders. */
export type AeksmLocaleKey =
  | 'description'
  | 'home' | 'homeHint' | 'homeDefault'
  | 'statusTitle'
  | 'bootstrapped' | 'notBootstrapped'
  | 'skillCount' | 'managedEntries'
  | 'cliNote'
  | 'statusUnavailable'
  | 'overridden' | 'reset' | 'invalidText'
  | 'readOnly' | 'saveFailed'
  | 'discard' | 'save' | 'saving'

/** This plugin's dictionary namespace, merged into the locale key map. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'aek-skill-manager': AeksmLocaleKey
  }
}

/** English copy. */
export const en: Record<AeksmLocaleKey, string> = {
  description: 'Local-first agent-skill hub. The aeksm CLI is the primary interface — every operation is a command; this card stages the hub root and shows read-only hub health.',
  home: 'Skill hub root',
  homeHint: 'Absolute path to the skill hub. Leave empty for the default ~/.aek/skill-manager (or the AEK_SKILL_MANAGER_HOME override).',
  homeDefault: 'Empty = default hub.',
  statusTitle: 'Hub health',
  bootstrapped: 'Bootstrapped',
  notBootstrapped: 'Not bootstrapped — run `aeksm bootstrap` first.',
  skillCount: 'skills in hub',
  managedEntries: 'managed runtime entries',
  cliNote: 'Distribute, audit, and sync run through the aeksm CLI (primary). This card is the auxiliary face; it stages config only.',
  statusUnavailable: 'Live hub status is served by the host skillsManager service; run `aeksm doctor` for the full report.',
  overridden: 'overridden',
  reset: 'Reset',
  invalidText: 'Not a valid path.',
  readOnly: 'Read-only',
  saveFailed: 'Saving failed; the edits are kept.',
  discard: 'Discard',
  save: 'Save',
  saving: 'Saving…',
}

/** 中文文案。 */
export const zh: Record<AeksmLocaleKey, string> = {
  description: '本地优先的 Agent 技能仓库。aeksm CLI 是主界面——每个操作都是命令；此卡片只暂存 hub 根目录并展示只读的 hub 健康度。',
  home: '技能仓库根目录',
  homeHint: '技能仓库的绝对路径。留空使用默认 ~/.aek/skill-manager（或 AEK_SKILL_MANAGER_HOME 覆盖）。',
  homeDefault: '留空 = 默认 hub。',
  statusTitle: '仓库健康度',
  bootstrapped: '已初始化',
  notBootstrapped: '未初始化——先运行 `aeksm bootstrap`。',
  skillCount: '仓库内技能数',
  managedEntries: '受管运行时条目',
  cliNote: '分发、审计、同步均走 aeksm CLI（主界面）。此卡片是辅助面，只暂存配置。',
  statusUnavailable: '实时 hub 状态由宿主 skillsManager 服务提供；完整报告请运行 `aeksm doctor`。',
  overridden: '已覆盖',
  reset: '重置',
  invalidText: '不是有效路径。',
  readOnly: '只读',
  saveFailed: '保存失败，编辑内容已保留。',
  discard: '放弃',
  save: '保存',
  saving: '保存中…',
}
