/** Type surface for the dependency-free `@cheezmil/coraek/home` subpath. */

export declare const AEK_HOME_ENV: 'AEK_HOME'
export declare const AEK_ROOT_ENV: 'AEK_ROOT'
export declare const DSH_HOME_ENV: 'DSH_HOME'
export declare const AEK_HOME_DIRNAME: '.aek'
export declare const AEK_DEFAULT_SLOT_DIRNAME: 'current'

/** The container that holds every slot's data root (`~/.aek`). */
export declare function resolveAekRoot(
  env?: Record<string, string | undefined>,
): string

export declare function resolveAekHome(
  env?: Record<string, string | undefined>,
): string

export declare function aekHomePath(...segments: string[]): string

export declare function applyAekHomeEnvironment(
  env?: Record<string, string | undefined>,
): string
