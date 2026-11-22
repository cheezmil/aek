/** The web-storage directory + file name (relative to the AEK data root). */
export declare const WEB_STORAGE_DIR: string
export declare const WEB_STORAGE_FILENAME: string
/** The web-storage file's path for the current data root. */
export declare function webStorageFile(): string
/** Read every stored entry (missing/malformed file reads as `{}`). */
export declare function readWebStorageEntries(): Record<string, string>
/** Render the YAML-subset document for a set of entries. */
export declare function dumpWebStorageYaml(entries: Record<string, unknown>): string
/** Replace the whole entry map (atomic tmp+rename write). */
export declare function writeWebStorageEntries(entries: Record<string, string>): string
