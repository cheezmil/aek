import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeFileSystem } from '../src/infra/fs-skill-home.js'
import { inspectSkillTree } from '../src/shared/skill-tree.js'

const fs = new NodeFileSystem()
const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aeksm-skill-tree-'))
  temps.push(dir)
  return dir
}

function writeSkill(dir: string, marker: string, withAssets = false): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), marker, 'utf8')
  if (withAssets) {
    mkdirSync(path.join(dir, 'references'), { recursive: true })
    writeFileSync(path.join(dir, 'references', 'notes.md'), 'notes', 'utf8')
  }
}

const NAME = 'aek-websearch'

describe('inspectSkillTree', () => {
  it('reports a clean single-level skill', () => {
    const skill = path.join(temp(), NAME)
    writeSkill(skill, 'outer', true)
    expect(inspectSkillTree(fs, skill, NAME)).toEqual({ kind: 'clean' })
  })

  it('detects the redundant inner copy left by a same-name copy', () => {
    const skill = path.join(temp(), NAME)
    writeSkill(skill, 'outer', true)
    writeSkill(path.join(skill, NAME), 'inner')
    expect(inspectSkillTree(fs, skill, NAME)).toEqual({ kind: 'duplicate', innerDir: path.join(skill, NAME) })
  })

  it('detects a real skill buried one level down', () => {
    const skill = path.join(temp(), NAME)
    mkdirSync(skill, { recursive: true })
    writeSkill(path.join(skill, NAME), 'inner')
    expect(inspectSkillTree(fs, skill, NAME)).toEqual({ kind: 'buried', innerDir: path.join(skill, NAME) })
  })
})

describe('copyDirectoryContents never produces a double-nested skill', () => {
  it('strips the redundant inner copy but keeps the outer skill assets', () => {
    const root = temp()
    const source = path.join(root, 'source')
    writeSkill(source, 'outer', true)
    writeSkill(path.join(source, NAME), 'inner')
    const dest = path.join(root, NAME)

    fs.copyDirectoryContents(source, dest)

    expect(readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toBe('outer')
    expect(existsSync(path.join(dest, NAME))).toBe(false)
    expect(readFileSync(path.join(dest, 'references', 'notes.md'), 'utf8')).toBe('notes')
  })

  it('lifts a buried skill up to the destination root', () => {
    const root = temp()
    const source = path.join(root, 'source')
    mkdirSync(source, { recursive: true })
    writeSkill(path.join(source, NAME), 'inner', true)
    const dest = path.join(root, NAME)

    fs.copyDirectoryContents(source, dest)

    expect(readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toBe('inner')
    expect(existsSync(path.join(dest, NAME))).toBe(false)
    expect(existsSync(path.join(dest, 'references', 'notes.md'))).toBe(true)
  })

  it('leaves a clean skill tree unchanged', () => {
    const root = temp()
    const source = path.join(root, 'source')
    writeSkill(source, 'clean', true)
    const dest = path.join(root, NAME)

    fs.copyDirectoryContents(source, dest)

    expect(readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toBe('clean')
    expect(existsSync(path.join(dest, 'references', 'notes.md'))).toBe(true)
    expect(inspectSkillTree(fs, dest, NAME)).toEqual({ kind: 'clean' })
  })

  it('is idempotent: copying an already-repaired skill stays single-level', () => {
    const root = temp()
    const source = path.join(root, 'source')
    writeSkill(source, 'outer')
    writeSkill(path.join(source, NAME), 'inner')
    const first = path.join(root, NAME)
    const second = path.join(root, 'second', NAME)

    fs.copyDirectoryContents(source, first)
    fs.copyDirectoryContents(first, second)

    expect(existsSync(path.join(second, NAME))).toBe(false)
    expect(inspectSkillTree(fs, second, NAME)).toEqual({ kind: 'clean' })
  })
})
