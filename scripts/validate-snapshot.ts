import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { RailSnapshot } from '../src/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const target = path.resolve('public', 'data', 'rail-snapshot.json')
  const snapshot = JSON.parse(await readFile(target, 'utf8')) as RailSnapshot

  assert(snapshot.schemaVersion === 2, '快照 schemaVersion 必须为 2')
  assert(snapshot.source?.name === 'RailGo', '快照来源必须为 RailGo')
  assert(snapshot.source.mode === 'live', '拒绝发布非 RailGo 实际构建的快照')
  assert(snapshot.availableWeekends.length > 0, '快照不包含可用周末')
  assert(Object.keys(snapshot.cityGroups).length > 0, '快照不包含目的地城市')

  for (const friday of snapshot.availableWeekends) {
    const sunday = addDays(friday, 2)
    const outbound = snapshot.outboundIndex[friday]
    assert(outbound?.friday.length, `${friday} 缺少周五去程数据`)
    assert(outbound.saturday.length, `${friday} 缺少周六去程数据`)
    assert(snapshot.returnIndex[sunday]?.length, `${sunday} 缺少周日返程数据`)
  }

  process.stdout.write(
    `Validated live RailGo snapshot: ${snapshot.availableWeekends.length} weekends, `
      + `${Object.keys(snapshot.cityGroups).length} cities, ${Object.keys(snapshot.trains).length} trains\n`,
  )
}

await main()
