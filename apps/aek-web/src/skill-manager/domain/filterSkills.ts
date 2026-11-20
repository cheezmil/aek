/**
 * Library search filter (the BH round: the reference's multi-word AND search,
 * widened to the whole skill record): whitespace-separated terms, each
 * matching (case-insensitively) somewhere in name, title, category,
 * description, tags, or the source url/type.
 */
export interface SkillSearchShape {
  name: string
  category: string
  description: string
  title?: string
  tags?: readonly string[]
  source?: { type?: string; url?: string | null } | null
}

export function filterSkills<T extends SkillSearchShape>(
  skills: readonly T[],
  query: string,
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...skills]
  return skills.filter((skill) => {
    const haystack = [
      skill.name,
      skill.title,
      skill.category,
      skill.description,
      skill.tags?.join(' '),
      skill.source?.type,
      skill.source?.url,
    ]
      .filter((part): part is string => part !== undefined && part !== '')
      .join('\n')
      .toLowerCase()
    return terms.every(term => haystack.includes(term))
  })
}
