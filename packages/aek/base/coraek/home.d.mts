/** Type surface for the dependency-free `@cheezmil/coraek/home` subpath. */

export declare const AEK_HOME_ENV: 'AEK_HOME'
export declare const DSH_HOME_ENV: 'DSH_HOME'
export declare const AEK_HOME_DIRNAME: '.aek'

export declare function resolveAekHome(
  env?: Record<string, string | undefined>,
): string

export declare function aekHomePath(...segments: string[]): string

export declare function applyAekHomeEnvironment(
  env?: Record<string, string | undefined>,
): string
