import { describe, expect, it } from 'vitest'
import type { RailLeg, RailSnapshot, SearchInput } from '../types'
import { resolveWeekendFriday, searchReachableDestinations } from './search'

const firstFriday = '2026-09-04'
const secondFriday = '2026-09-11'

function railLeg(
  id: string,
  fromStationCode: string,
  toStationCode: string,
  departureAt: string,
  arrivalAt: string,
): RailLeg {
  return {
    id,
    trainId: id,
    number: id,
    kind: 'G',
    fromStationCode,
    toStationCode,
    departureAt,
    arrivalAt,
    durationMinutes: Math.round((Date.parse(arrivalAt) - Date.parse(departureAt)) / 60_000),
  }
}

const firstFridayLeg = railLeg(
  'G1',
  'VNP',
  'AOH',
  '2026-09-04T18:00:00+08:00',
  '2026-09-04T22:00:00+08:00',
)
const firstSaturdayLeg = railLeg(
  'G3',
  'VNP',
  'AOH',
  '2026-09-05T18:00:00+08:00',
  '2026-09-05T22:00:00+08:00',
)
const secondFridayLeg = railLeg(
  'G5',
  'VNP',
  'AOH',
  '2026-09-11T18:00:00+08:00',
  '2026-09-11T22:00:00+08:00',
)
const secondSaturdayLeg = railLeg(
  'G7',
  'VNP',
  'AOH',
  '2026-09-12T18:00:00+08:00',
  '2026-09-12T22:00:00+08:00',
)
const sundayReturn = railLeg(
  'G2',
  'AOH',
  'VNP',
  '2026-09-06T21:00:00+08:00',
  '2026-09-06T23:30:00+08:00',
)

function snapshot(): RailSnapshot {
  const legs = [
    firstFridayLeg,
    firstSaturdayLeg,
    secondFridayLeg,
    secondSaturdayLeg,
    sundayReturn,
  ]
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-01T00:00:00Z',
    source: {
      name: 'RailGo',
      url: 'https://railgo.dev',
      termsUrl: 'https://api.railgo.dev',
      mode: 'live',
    },
    availableWeekends: [firstFriday, secondFriday],
    beijingStations: [
      { code: 'VNP', name: 'Beijing South', cityId: 'Beijing', cityName: '\u5317\u4eac', province: '\u5317\u4eac' },
    ],
    stations: {
      VNP: { code: 'VNP', name: 'Beijing South', cityId: 'Beijing', cityName: '\u5317\u4eac', province: '\u5317\u4eac' },
      AOH: { code: 'AOH', name: 'Shanghai Hongqiao', cityId: 'Shanghai', cityName: 'Shanghai', province: 'Shanghai' },
    },
    cityGroups: {
      Shanghai: { id: 'Shanghai', name: 'Shanghai', province: 'Shanghai', stationCodes: ['AOH'] },
    },
    trains: Object.fromEntries(
      legs.map((leg) => [
        leg.trainId,
        { id: leg.trainId, number: leg.number, numbers: [leg.number], kind: leg.kind },
      ]),
    ),
    outboundIndex: {
      [firstFriday]: { friday: [firstFridayLeg], saturday: [firstSaturdayLeg] },
      [secondFriday]: { friday: [secondFridayLeg], saturday: [secondSaturdayLeg] },
    },
    returnIndex: {
      '2026-09-06': [sundayReturn],
      '2026-09-13': [],
    },
    dataWarnings: [],
  }
}

const input: SearchInput = {
  departureWeekday: 'friday',
  departureTime: '18:00',
  latestBeijingArrivalWeekday: 'monday',
  latestBeijingArrivalTime: '08:30',
}

describe('resolveWeekendFriday', () => {
  it('keeps the current minute and rolls to the next snapshot weekend after it passes', () => {
    expect(resolveWeekendFriday(snapshot(), input, '2026-09-04T18:00:59+08:00')).toBe(firstFriday)
    expect(resolveWeekendFriday(snapshot(), input, '2026-09-04T18:01:00+08:00')).toBe(secondFriday)
  })

  it('resolves Saturday independently from Friday', () => {
    expect(
      resolveWeekendFriday(
        snapshot(),
        { ...input, departureWeekday: 'saturday', departureTime: '00:00' },
        '2026-09-04T23:59:00+08:00',
      ),
    ).toBe(firstFriday)
  })

  it('returns no weekend when every indexed departure is in the past', () => {
    expect(resolveWeekendFriday(snapshot(), input, '2026-09-20T00:00:00+08:00')).toBeUndefined()
  })

  it('searches the Saturday index and keeps the resolved weekend on results', () => {
    const results = searchReachableDestinations(
      snapshot(),
      { ...input, departureWeekday: 'saturday' },
      '2026-09-04T00:00:00+08:00',
    )
    expect(results).toHaveLength(1)
    expect(results[0].outboundLeg.id).toBe('G3')
    expect(results[0].resolvedWeekendFriday).toBe(firstFriday)
  })
})
