/**
 * AEK framework layer identity.
 *
 * "cor" = Latin heart, "aek" = Agent Enhance Kit. Coraek is the heart of AEK.
 * Coraek is the heart of AEK — the runtime layer that gives agents life.
 */
export const CORAEK_VERSION = '1.0.0'
export const CORAEK_NAME  = 'coraek'

/** Print the framework identity line. */
export function announceCoraek(): void {
  console.log(`coraek ${CORAEK_VERSION}`)
}
