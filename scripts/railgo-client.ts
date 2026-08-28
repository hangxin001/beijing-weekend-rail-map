import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const API_BASE = 'https://data.railgo.zenglingkun.cn/api'
const CACHE_ROOT = path.resolve('.cache', 'railgo')
const MIN_INTERVAL_MS = Math.max(1000, Number(process.env.RAILGO_REQUEST_INTERVAL_MS ?? 1000))
const MAX_ATTEMPTS = 3

let lastRequestAt = 0

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function respectRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed)
}

export async function railGoGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/${endpoint}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await respectRateLimit()
    lastRequestAt = Date.now()

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'beijing-weekend-rail-map/1.0 (non-commercial static snapshot)',
        },
      })

      if (response.ok) return (await response.json()) as T
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) throw new Error(`RailGo ${endpoint} 返回 HTTP ${response.status}`)
      lastError = new Error(`RailGo ${endpoint} 返回 HTTP ${response.status}`)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    if (attempt < MAX_ATTEMPTS) await sleep(2 ** (attempt - 1) * 2000)
  }

  throw lastError ?? new Error(`RailGo ${endpoint} 请求失败`)
}

function cachePath(group: string, key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(CACHE_ROOT, group, `${safeKey}.json`)
}

interface CacheEnvelope<T> {
  cachedAt: string
  value: T
}

export async function readCache<T>(
  group: string,
  key: string,
  maxAgeMilliseconds = Number.POSITIVE_INFINITY,
): Promise<T | undefined> {
  try {
    const raw = await readFile(cachePath(group, key), 'utf8')
    const envelope = JSON.parse(raw) as CacheEnvelope<T>
    if (Date.now() - Date.parse(envelope.cachedAt) > maxAgeMilliseconds) return undefined
    return envelope.value
  } catch {
    return undefined
  }
}

export async function writeCache<T>(group: string, key: string, value: T): Promise<void> {
  const target = cachePath(group, key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify({ cachedAt: new Date().toISOString(), value }))
}

export async function atomicWriteJson(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(value))
  await rename(temporary, target)
}
