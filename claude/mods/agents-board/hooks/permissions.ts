import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, Task } from '../types'

import {
  EXECUTION_AGENT,
  HOME_PATH,
  PATTERN_PROGRAMS,
  READ_ONLY_AGENTS,
  READ_ONLY_OPTIONS,
  SAFE_COMMAND,
  SCOPED_WRITERS,
  WRITE_WAIT_MS,
} from './constants'
import { allowedCommands, writers } from './state'
import { isActive, isSolo, pendingDenial } from './tasks'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)

function normalize(path: string): string {
  const parts: string[] = []

  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue
    }

    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }

  return `/${parts.join('/')}`
}

async function placed($: EngineInterface, path: string): Promise<string | null> {
  const stat = await $.fs.stat(path || '/', { resolve: true }).catch((error: Error) => (/ failed: ENOENT$/.test(error.message) ? undefined : null))

  if (stat !== undefined) {
    return stat?.realPath ?? null
  }

  const cut = path.lastIndexOf('/')
  const parent = await placed($, path.slice(0, cut))

  return parent === null ? null : normalize(`${parent}${path.slice(cut)}`)
}

async function realOf($: EngineInterface, cwd: string, path: string): Promise<string | null> {
  const target = path.startsWith('/') ? path : `${cwd}/${path}`
  const [physical, lexical] = await Promise.all([placed($, target), placed($, normalize(target))])

  return physical === lexical ? physical : null
}

function isInside(root: string | null, target: string | null): boolean {
  return root !== null && target !== null && root !== '/' && (target === root || target.startsWith(`${root}/`))
}

async function isListed($: EngineInterface, cwd: string, files: string[], target: string): Promise<boolean> {
  for (const file of files) {
    if ((await realOf($, cwd, file)) === target) {
      return true
    }
  }

  return false
}

function isSameFiles(left: string[], right: string[]): boolean {
  const set = new Set(left)

  return set.size === new Set(right).size && right.every(file => set.has(file))
}

function operandsOf(words: string[]): string[] | null {
  const key = words[0] === 'git' ? `git ${words[1]}` : words[0]
  const options = READ_ONLY_OPTIONS.get(key)

  if (options === undefined) {
    return null
  }

  const operands: string[] = []
  let isPatternDue = PATTERN_PROGRAMS.has(key)
  let isValueDue = false
  let isEnded = false

  for (const word of words.slice(key.split(' ').length)) {
    if (isValueDue) {
      isValueDue = false
    } else if (isEnded || !word.startsWith('-')) {
      if (isPatternDue) {
        isPatternDue = false
      } else {
        operands.push(word)
      }
    } else if (word === '--') {
      isEnded = true
    } else if (options.valued.includes(word)) {
      isValueDue = true
    } else if (!options.flags.includes(word) && !(word.startsWith('--') && options.valued.includes(word.split('=')[0]))) {
      return null
    }
  }

  return operands
}

async function areInside($: EngineInterface, paths: string[]): Promise<boolean> {
  const cwd = await $.session.cwd()
  const root = await realOf($, cwd, cwd)

  for (const path of paths) {
    if (!isInside(root, await realOf($, cwd, path))) {
      return false
    }
  }

  return true
}

async function isReadOnlyCommand($: EngineInterface, command: string): Promise<boolean> {
  const operands = SAFE_COMMAND.test(command) ? operandsOf(command.trim().split(/ +/)) : null

  return operands !== null && (await areInside($, operands))
}

export async function bashDenial($: EngineInterface, type: string | undefined, agentId: string, command: string): Promise<string | null> {
  if (type === undefined) {
    return 'agent inconnu : Bash refusé'
  }

  if (READ_ONLY_AGENTS.has(type)) {
    return (await isReadOnlyCommand($, command))
      ? null
      : `${type} : Bash limité à la lecture : programme et options exactes d'une liste blanche (git diff, status, log, show, ls-files, grep, blame ; grep, rg, ls, find, cat, head, tail, wc, file, stat), options séparées, chemins dans le projet, caractères A-Z a-z 0-9 _ . / = : @ % + , - et espace uniquement`
  }

  if (type === EXECUTION_AGENT) {
    const allowed = allowedCommands.get(agentId) ?? []

    return allowed.includes(command.trim())
      ? null
      : `${type} : seules passent, à l'identique, les commandes du bloc « ## Commandes autorisées » en tête du prompt de lancement (lanceurs de test sans argument) : ${allowed.join(' ; ') || 'aucune'}`
  }

  return `${type} : Bash refusé`
}

async function linkDenial($: EngineInterface, path: string): Promise<string | null> {
  const cwd = await $.session.cwd()
  const stat = await $.fs.stat(path.startsWith('/') ? path : `${cwd}/${path}`, { resolve: true }).catch(() => undefined)

  if (stat?.kind !== 'file') {
    return null
  }

  if (stat.realPath === undefined) {
    return `fichier non résoluble : écriture refusée sur ${path}`
  }

  const { exitCode, stdout } = await $.process.run(['stat', '-c', '%h', '--', stat.realPath])

  return exitCode === 0 && stdout.trim() === '1' ? null : `fichier à plusieurs liens physiques : écriture refusée sur ${path}`
}

export async function changeDenial(
  $: EngineInterface,
  next: Task[],
  current: Task[],
  bound: Record<string, string>,
  cwd: string,
  held: Set<string>,
): Promise<string | null> {
  const removed = [...held].find(id => current.some(task => task.id === id) && !next.some(task => task.id === id))

  if (removed !== undefined) {
    return `tâche ${removed} en cours : elle ne peut pas être retirée`
  }

  for (const task of next) {
    for (const file of task.files) {
      if (HOME_PATH.test(file)) {
        return `chemin relatif au dossier personnel pour la tâche ${task.id} : ${file}. Donne un chemin absolu`
      }
    }
  }

  const root = await realOf($, cwd, cwd)

  for (const task of next) {
    for (const file of task.files) {
      if (!isInside(root, await realOf($, cwd, file))) {
        return `chemin hors du projet pour la tâche ${task.id} : ${file}`
      }
    }
  }

  for (const id of new Set(Object.values(bound))) {
    const before = current.find(task => task.id === id)
    const after = next.find(task => task.id === id)

    if (before !== undefined && !before.isDone && after !== undefined && !isSameFiles(before.files, after.files)) {
      return `tâche ${id} en cours : ses fichiers sont figés`
    }
  }

  return null
}

export function startDenial(
  task: Task,
  agentId: string,
  graph: Task[],
  bound: Record<string, string>,
  known: Agent[],
  hasWritten: boolean,
): string | null {
  if (task.isDone) {
    return `tâche ${task.id} déjà faite`
  }

  const pending = pendingDenial(task, graph)

  if (pending !== null) {
    return pending
  }

  const current = bound[agentId]

  if (hasWritten && current !== undefined && current !== task.id && graph.some(item => item.id === current && !item.isDone)) {
    return `déjà rattaché à la tâche ${current}`
  }

  const isTaken = Object.entries(bound).some(
    ([other, id]) => id === task.id && other !== agentId && isActive(other, id, known, graph),
  )

  return isTaken ? `tâche ${task.id} déjà prise par un autre agent` : null
}

export async function typeOf($: EngineInterface, agentId: string): Promise<string | undefined> {
  const known = (await read($, agents)).find(agent => agent.id === agentId)

  if (known !== undefined) {
    return known.type
  }

  return (await $.agent.list()).find(agent => agent.id === agentId)?.type
}

async function writeDenial($: EngineInterface, agentId: string, filePath: string): Promise<string | null> {
  const [type, graph, bound, cwd] = await Promise.all([
    typeOf($, agentId),
    read($, tasks),
    read($, bindings),
    $.session.cwd(),
  ])

  if (type === undefined) {
    return `agent inconnu : écriture refusée sur ${filePath}`
  }

  const task = graph.find(item => item.id === bound[agentId] && !isSolo(item.id))
  const target = await realOf($, cwd, filePath)

  if (task === undefined) {
    if (SCOPED_WRITERS.has(type) || graph.some(item => !item.isDone && !isSolo(item.id))) {
      return `${type} : appelle pipeline_start avec l'identifiant de ta tâche avant d'écrire`
    }

    return isInside(await realOf($, cwd, cwd), target) ? null : `chemin hors du projet : ${filePath}`
  }

  if (target !== null && (await isListed($, cwd, task.files, target))) {
    return null
  }

  return `hors périmètre : ${filePath}. Fichiers de la tâche ${task.id} : ${task.files.join(', ') || 'aucun'}`
}

async function holderOf($: EngineInterface, agentId: string, target: string): Promise<string | null> {
  const [graph, bound, known, cwd] = await Promise.all([
    read($, tasks),
    read($, bindings),
    read($, agents),
    $.session.cwd(),
  ])
  const path = await realOf($, cwd, target)
  const own = graph.findIndex(task => task.id === bound[agentId])

  for (const task of graph.slice(0, own === -1 ? graph.length : own)) {
    const isHeld = Object.entries(bound).some(
      ([other, id]) => other !== agentId && id === task.id && isActive(other, id, known, graph),
    )

    if (isHeld && path !== null && (await isListed($, cwd, task.files, path))) {
      return task.id
    }
  }

  return null
}

export async function guarded($: EngineInterface, agentId: string, path: string, signal: AbortSignal): Promise<string | null> {
  if (HOME_PATH.test(path)) {
    return `chemin relatif au dossier personnel refusé : ${path}. Donne un chemin absolu`
  }

  const denial = await writeDenial($, agentId, path)

  if (denial !== null) {
    return denial
  }

  const linked = await linkDenial($, path)

  if (linked !== null) {
    return linked
  }

  const deadline = (await $.clock.now()) + WRITE_WAIT_MS

  for (let holder = await holderOf($, agentId, path); holder !== null; holder = await holderOf($, agentId, path)) {
    if (signal.aborted || (await $.clock.now()) >= deadline) {
      return `fichier ${path} tenu par la tâche ${holder}`
    }

    await $.process.run(['sleep', '2'])
  }

  writers.add(agentId)

  return null
}
