/**
 * Shared wire types cut from shenysun skills-manager `dashboard-web/src/api/client.ts`
 * (MIT; provenance in packages/aek/coraek-plugins/aek-skill-manager/NOTICE).
 * Only the three types the domain tier consumes are mirrored here so the domain
 * stays framework-free; the fetch layer (`api()`) is intentionally not ported -
 * our webui talks to the aek-skill-manager host service, not a fastify endpoint.
 */
export type UrlPayloadFormat = 'md' | 'zip' | 'tar'

export type DiscoveredSkill = { name: string; title: string; description: string; subpath: string; plugin?: string }

export type MarketplacePlugin = {
  name: string
  skills: Array<{ name: string; subpath: string }>
  unsupported?: 'git-subdir' | 'url' | 'external-source'
}
