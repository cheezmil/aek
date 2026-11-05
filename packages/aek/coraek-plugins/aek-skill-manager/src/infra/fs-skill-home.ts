import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync, appendFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import path from 'node:path'
import { createDirLink } from './link-policy.js'
import type { DirectoryEntry, FileKind, FileSystemPort } from '../core/ports/filesystem.js'
import { inspectSkillTree } from '../shared/skill-tree.js'

export class NodeFileSystem implements FileSystemPort {
  exists(filePath: string): boolean {
    return existsSync(filePath)
  }

  readText(filePath: string): string {
    return readFileSync(filePath, 'utf8')
  }

  readBytes(filePath: string): Buffer {
    return readFileSync(filePath)
  }

  size(filePath: string): number {
    return statSync(filePath).size
  }

  writeText(filePath: string, contents: string): void {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, contents)
  }

  writeBytes(filePath: string, contents: Buffer): void {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, contents)
  }

  appendText(filePath: string, contents: string): void {
    mkdirSync(path.dirname(filePath), { recursive: true })
    appendFileSync(filePath, contents)
  }

  readDirectory(dirPath: string): DirectoryEntry[] {
    return readdirSync(dirPath, { withFileTypes: true }).map(entry => ({ name: entry.name, kind: this.direntKind(entry) }))
  }

  kind(filePath: string): FileKind {
    try {
      const st = lstatSync(filePath)
      if (st.isSymbolicLink()) return 'symlink'
      if (st.isDirectory()) return 'directory'
      if (st.isFile()) return 'file'
      return 'other'
    } catch {
      return 'missing'
    }
  }

  targetKind(filePath: string): FileKind {
    try {
      const st = statSync(filePath)
      if (st.isDirectory()) return 'directory'
      if (st.isFile()) return 'file'
      return 'other'
    } catch {
      return 'missing'
    }
  }

  makeDirectory(dirPath: string): void {
    mkdirSync(dirPath, { recursive: true })
  }

  removeFileOrSymlink(filePath: string): void {
    rmSync(filePath, { force: true })
  }

  removeTree(filePath: string): void {
    rmSync(filePath, { recursive: true, force: true })
  }

  copyDirectoryContents(sourceDir: string, destinationDir: string): void {
    mkdirSync(destinationDir, { recursive: true })
    rmSync(destinationDir, { recursive: true, force: true })
    mkdirSync(destinationDir, { recursive: true })
    // Never propagate a double-nested skill. `duplicate` means the outer
    // SKILL.md is authoritative and the same-named inner directory is a pure
    // copy (leave it behind); `buried` means only the inner directory is a real
    // skill (copy its contents up to the destination root). All install/seed/
    // distribute/pool-reconcile callers go through this one primitive, so the
    // hub can never grow `<skill>/<skill>/SKILL.md` again.
    const layout = inspectSkillTree(this, sourceDir, path.basename(destinationDir))
    const effectiveSource = layout.kind === 'buried' ? layout.innerDir : sourceDir
    const skip = layout.kind === 'duplicate' ? layout.innerDir : null
    cpSync(effectiveSource, destinationDir, {
      recursive: true,
      dereference: false,
      force: true,
      verbatimSymlinks: true,
      ...(skip ? { filter: (src: string) => src !== skip && !src.startsWith(skip + path.sep) } : {}),
    })
  }

  move(source: string, destination: string): void {
    mkdirSync(path.dirname(destination), { recursive: true })
    renameSync(source, destination)
  }

  symlink(target: string, filePath: string): void {
    // Directory targets become platform-appropriate dir links: junctions on
    // Windows (no elevation / developer mode required) and relative symlinks
    // on POSIX so the link survives the hub tree moving. Non-directory or
    // not-yet-present targets fall back to a plain symlink (see link-policy).
    const resolvedTarget = isAbsolute(target) ? target : path.resolve(path.dirname(filePath), target)
    if (this.exists(resolvedTarget) && this.targetKind(resolvedTarget) === 'directory') {
      createDirLink(target, filePath)
      return
    }
    symlinkSync(target, filePath)
  }

  readlink(filePath: string): string {
    return readlinkSync(filePath)
  }

  modifiedAt(filePath: string): number {
    try {
      return statSync(filePath).mtimeMs
    } catch {
      return 0
    }
  }

  private direntKind(entry: import('node:fs').Dirent): Exclude<FileKind, 'missing'> {
    if (entry.isSymbolicLink()) return 'symlink'
    if (entry.isDirectory()) return 'directory'
    if (entry.isFile()) return 'file'
    return 'other'
  }
}

export function createNodeFileSystem() {
  return new NodeFileSystem()
}
