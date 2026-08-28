import { describe, expect, it } from 'vitest'
import type { Station } from '../src/types'
import {
  buildLegs,
  toStation,
  type RailGoStop,
  type RailGoTrainResponse,
} from './update-railgo'

const friday = '2026-09-04'

function stop(
  station: string,
  stationTelecode: string,
  values: Partial<Pick<RailGoStop, 'arrive' | 'depart' | 'day'>>,
): RailGoStop {
  return { station, stationTelecode, day: 0, ...values }
}

function station(code: string, name: string, cityName: string, province: string): Station {
  return {
    code,
    name,
    cityId: province + ':' + cityName,
    cityName,
    province,
  }
}

function train(
  number: string,
  rundays: string[],
  timetable: RailGoStop[],
): RailGoTrainResponse {
  return {
    number,
    numberKind: number.charAt(0),
    numberFull: [number],
    timetable,
    rundays,
  }
}

describe('buildLegs', () => {
  it('expands every stopping intermediate station for Friday, Saturday, and Sunday returns', () => {
    const outbound = train('G1', ['20260904', '20260905'], [
      stop('Beijing South', 'VNP', { depart: '18:00' }),
      stop('Jinan West', 'JGK', { arrive: '19:30', depart: '19:33' }),
      stop('Nanjing South', 'NKH', { arrive: '21:20', depart: '21:23' }),
      stop('Shanghai Hongqiao', 'AOH', { arrive: '22:40' }),
    ])
    const returning = train('G2', ['20260906'], [
      stop('Shanghai Hongqiao', 'AOH', { depart: '18:00' }),
      stop('Nanjing South', 'NKH', { arrive: '19:20', depart: '19:23' }),
      stop('Jinan West', 'JGK', { arrive: '21:10', depart: '21:13' }),
      stop('Beijing South', 'VNP', { arrive: '23:00' }),
    ])
    const stations = {
      VNP: station('VNP', 'Beijing South', '\u5317\u4eac', '\u5317\u4eac'),
      JGK: station('JGK', 'Jinan West', 'Jinan', 'Shandong'),
      NKH: station('NKH', 'Nanjing South', 'Nanjing', 'Jiangsu'),
      AOH: station('AOH', 'Shanghai Hongqiao', 'Shanghai', 'Shanghai'),
    }

    const result = buildLegs(
      [outbound, returning],
      stations,
      new Set(['VNP']),
      [friday],
    )

    expect(result.outboundIndex[friday].friday.map((item) => item.toStationCode)).toEqual([
      'JGK',
      'NKH',
      'AOH',
    ])
    expect(result.outboundIndex[friday].saturday.map((item) => item.toStationCode)).toEqual([
      'JGK',
      'NKH',
      'AOH',
    ])
    expect(result.returnIndex['2026-09-06'].map((item) => item.fromStationCode)).toEqual([
      'AOH',
      'NKH',
      'JGK',
    ])

    const allIds = [
      ...result.outboundIndex[friday].friday,
      ...result.outboundIndex[friday].saturday,
      ...result.returnIndex['2026-09-06'],
    ].map((item) => item.id)
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe('toStation', () => {
  it.each([
    ['VET', '辽宁朝阳'],
    ['JAD', '建平'],
  ])('assigns %s %s to Liaoning Chaoyang when RailGo omits its location', (telecode, name) => {
    expect(toStation({ telecode, name, city: undefined, province: undefined })).toEqual({
      code: telecode,
      name,
      cityId: '辽宁:朝阳',
      cityName: '朝阳',
      province: '辽宁',
    })
  })
})
