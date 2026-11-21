import type { Status, Task, TaskPatch } from '../types/tasks'

export type BoardStateV1 = {
  version: 1
  tasksById: Record<string, Task>
  columnOrder: Record<Status, string[]>
}

const STORAGE_KEY = 'kanbanTasksV1'
const STATUSES: Status[] = ['todo', 'inProgress', 'done']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function defaultBoardState(): BoardStateV1 {
  return {
    version: 1,
    tasksById: {},
    columnOrder: {
      todo: [],
      inProgress: [],
      done: [],
    },
  }
}

export function normalizeBoardState(state: Partial<BoardStateV1> | unknown): BoardStateV1 {
  const fallback = defaultBoardState()
  if (!isObject(state)) return fallback

  const tasksById = isObject(state.tasksById) ? (state.tasksById as Record<string, Task>) : {}
  const rawColumnOrder = isObject(state.columnOrder) ? (state.columnOrder as Partial<Record<Status, string[]>>) : {}

  const columnOrder = { ...fallback.columnOrder } as Record<Status, string[]>
  for (const status of STATUSES) {
    const values = rawColumnOrder[status]
    columnOrder[status] = Array.isArray(values)
      ? values.filter((id): id is string => typeof id === 'string')
      : []
  }

  const seenIds = new Set<string>()
  for (const status of STATUSES) {
    columnOrder[status] = columnOrder[status].filter((id) => {
      if (!tasksById[id] || seenIds.has(id)) return false
      seenIds.add(id)
      return true
    })
  }

  for (const [id, task] of Object.entries(tasksById)) {
    if (!task || !isObject(task)) continue

    const taskStatus = task.status
    const safeStatus: Status = STATUSES.includes(taskStatus as Status) ? (taskStatus as Status) : 'todo'

    if (!seenIds.has(id)) {
      columnOrder[safeStatus].push(id)
      seenIds.add(id)
    }
  }

  return {
    version: 1,
    tasksById,
    columnOrder,
  }
}

export function loadBoardState(): BoardStateV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultBoardState()

    const parsed = JSON.parse(raw) as unknown
    if (!isObject(parsed)) return defaultBoardState()
    if (parsed.version !== 1) return defaultBoardState()

    return normalizeBoardState(parsed as Partial<BoardStateV1>)
  } catch {
    return defaultBoardState()
  }
}

export function saveBoardState(state: BoardStateV1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function normalizeTags(tags: string[]): string[] {
  const deduped = new Set(
    tags
      .map((t) => t.trim())
      .filter(Boolean)
  )
  return Array.from(deduped)
}

export function applyPatch(task: Task, patch: TaskPatch): Task {
  return {
    ...task,
    ...patch,
    tags: patch.tags ? normalizeTags(patch.tags) : task.tags,
    updatedAt: patch.updatedAt ?? Date.now(),
  }
}

