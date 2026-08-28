import { describe, expect, it } from 'vitest'
import type { RailLeg, RailSnapshot, SearchInput, TrainKind } from '../types'import { searchReachableDestinations } from './search'

const friday = '2026-09-04'
const sunday = '2026-09-06'

function leg(
  id: string,
  from: string,
  to: string,
  departureAt: string,
  arrivalAt: string,
  kind: TrainKind = 'G',
): RailLeg {
  return {
    id,
    trainId: id,
    number: id,
    kind,
    fromStationCode: from,
    toStationCode: to,
    departureAt,
    arrivalAt,
    durationMinutes: Math.round((Date.parse(arrivalAt) - Date.parse(departureAt)) / 60_000),
  }
}

function snapshot(outbound: RailLeg[], returns: RailLeg[]): RailSnapshot {
  const allLegs = [...outbound, ...returns]
  return {
    schemaVersion: 2,    generatedAt: '2026-09-01T00:00:00Z',
    source: {
      name: 'RailGo', url: 'https://railgo.dev', termsUrl: 'https://api.railgo.dev', mode: 'live',
    },
    availableWeekends: [friday],
    beijingStations: [
      { code: 'VNP', name: '北京南', cityId: '北京:北京', cityName: '北京', province: '北京' },
      { code: 'BJP', name: '北京', cityId: '北京:北京', cityName: '北京', province: '北京' },
    ],
    stations: {
      VNP: { code: 'VNP', name: '北京南', cityId: '北京:北京', cityName: '北京', province: '北京' },
      BJP: { code: 'BJP', name: '北京', cityId: '北京:北京', cityName: '北京', province: '北京' },
      AOH: { code: 'AOH', name: '上海虹桥', cityId: '上海:上海', cityName: '上海', province: '上海' },
      SHH: { code: 'SHH', name: '上海', cityId: '上海:上海', cityName: '上海', province: '上海' },
    },
    cityGroups: {
      '上海:上海': { id: '上海:上海', name: '上海', province: '上海', stationCodes: ['AOH', 'SHH'] },
    },
    trains: Object.fromEntries(
      allLegs.map((item) => [
        item.trainId,
        { id: item.trainId, number: item.number, numbers: [item.number], kind: item.kind },
      ]),
    ),
    outboundIndex: { [friday]: { friday: outbound, saturday: [] } },    returnIndex: { [sunday]: returns },
    dataWarnings: [],
  }
}

const normalReturn = leg(
  'G2', 'SHH', 'BJP', '2026-09-06T21:00:00+08:00', '2026-09-06T23:30:00+08:00',
)

function run(value: RailSnapshot, overrides: Partial<SearchInput> = {}) {
  return searchReachableDestinations(value, {
    departureWeekday: 'friday',
    departureTime: '18:00',
    latestBeijingArrivalWeekday: 'monday',
    latestBeijingArrivalTime: '08:30',
    ...overrides,
  }, '2026-09-01T00:00:00+08:00')
}

describe('searchReachableDestinations', () => {
  it('保留恰好在下班时刻发车的车次，排除早一分钟的车次', () => {
    const exact = leg(
      'G1', 'VNP', 'AOH', '2026-09-04T18:00:00+08:00', '2026-09-04T22:30:00+08:00',
    )
    const early = leg(
      'G3', 'VNP', 'AOH', '2026-09-04T17:59:00+08:00', '2026-09-04T22:20:00+08:00',
    )
    const results = run(snapshot([early, exact], [normalReturn]))
    expect(results).toHaveLength(1)
    expect(results[0].outboundTrain.number).toBe('G1')
    expect(results[0].alternatives.outbound.map((item) => item.number)).not.toContain('G3')
  })

  it('保留周五 23:59，排除周六 00:00 发车', () => {
    const lastMinute = leg(
      'D1', 'VNP', 'AOH', '2026-09-04T23:59:00+08:00', '2026-09-05T08:00:00+08:00', 'D',
    )
    const saturday = leg(
      'D3', 'VNP', 'AOH', '2026-09-05T00:00:00+08:00', '2026-09-05T08:01:00+08:00', 'D',
    )
    const results = run(snapshot([lastMinute, saturday], [normalReturn]), { departureTime: '23:00' })    expect(results).toHaveLength(1)
    expect(results[0].outboundTrain.number).toBe('D1')
  })

  it('允许周日 23:59 发车并在周一截止时刻抵京', () => {
    const outbound = leg(
      'G1', 'VNP', 'AOH', '2026-09-04T18:00:00+08:00', '2026-09-04T22:30:00+08:00',
    )
    const overnightReturn = leg(
      'D2', 'SHH', 'BJP', '2026-09-06T23:59:00+08:00', '2026-09-07T08:30:00+08:00', 'D',
    )
    expect(run(snapshot([outbound], [overnightReturn]))).toHaveLength(1)
  })

  it('排除晚于最晚抵京时刻一分钟的返程', () => {
    const outbound = leg(
      'G1', 'VNP', 'AOH', '2026-09-04T18:00:00+08:00', '2026-09-04T22:30:00+08:00',
    )
    const lateReturn = leg(
      'D2', 'SHH', 'BJP', '2026-09-06T23:00:00+08:00', '2026-09-07T08:31:00+08:00', 'D',
    )
    expect(run(snapshot([outbound], [lateReturn]))).toHaveLength(0)
  })

  it('按城市匹配去返程，允许同城不同车站', () => {
    const outbound = leg(
      'G1', 'VNP', 'AOH', '2026-09-04T18:00:00+08:00', '2026-09-04T22:30:00+08:00',
    )
    const results = run(snapshot([outbound], [normalReturn]))
    expect(results[0].outboundLeg.toStationCode).toBe('AOH')
    expect(results[0].returnLeg.fromStationCode).toBe('SHH')
  })

  it('应用北京车站和最长单程耗时筛选', () => {
    const outbound = leg(
      'G1', 'VNP', 'AOH', '2026-09-04T18:00:00+08:00', '2026-09-04T22:30:00+08:00',
    )
    const value = snapshot([outbound], [normalReturn])
    expect(run(value, { beijingStationCodes: ['BJP'] })).toHaveLength(0)
    expect(run(value, { maxDurationMinutes: 200 })).toHaveLength(0)
  })

  it('拒绝索引中日期不匹配和非 G/C/D 的记录', () => {
    const wrongDate = leg(
      'G1', 'VNP', 'AOH', '2026-09-03T18:00:00+08:00', '2026-09-03T22:30:00+08:00',
    )
    const conventional = leg(
      'K1', 'VNP', 'AOH', '2026-09-04T18:00:00+08:00', '2026-09-04T22:30:00+08:00',
      'K' as TrainKind,
    )
    expect(run(snapshot([wrongDate, conventional], [normalReturn]))).toHaveLength(0)
  })
})
