import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { addDays, chinaDateTime, datePart, minutesBetween } from '../src/lib/datetime'
import type {
  CityGroup,
  RailLeg,
  RailSnapshot,
  Station,
  TrainKind,
  TrainSummary,
  WeekendOutboundIndex,
} from '../src/types'
import { atomicWriteJson, railGoGet, readCache, writeCache } from './railgo-client'

interface BeijingStationConfig {
  code: string
  name: string
}

export interface RailGoStationMeta {
  telecode: string
  name: string
  city?: string
  province?: string
}

const STATION_LOCATION_OVERRIDES: Record<string, { city: string; province: string }> = {
  VET: { city: '朝阳', province: '辽宁' },
  JAD: { city: '朝阳', province: '辽宁' },
}

interface RailGoStationTrain {
  number: string
  numberKind?: string
  numberFull?: string[]
}

interface RailGoStationResponse {
  data: RailGoStationMeta
  trains: RailGoStationTrain[]
}

export interface RailGoStop {  station: string
  stationTelecode: string
  trainCode?: string
  arrive?: string
  depart?: string
  day: number
}

export interface RailGoTrainResponse {  number: string
  numberKind?: string
  numberFull?: string[]
  timetable: RailGoStop[]
  rundays: string[]
}

const ALLOWED_KINDS = new Set<TrainKind>(['G', 'C', 'D'])
const TRAIN_CACHE_MAX_AGE = 96 * 60 * 60 * 1000

function log(message: string): void {
  process.stdout.write(`[railgo] ${message}\n`)
}

function normalizeProvince(value: string | undefined): string {
  if (!value) return '其他'
  return value
    .replace(/壮族自治区$|回族自治区$|维吾尔自治区$|自治区$|特别行政区$|省$|市$/u, '')
    .replace('内蒙古自治区', '内蒙古')
}

function normalizeCity(value: string | undefined, stationName: string): string {
  if (value) return value.replace(/自治州$|地区$|盟$|市$/u, '')
  const municipality = ['北京', '上海', '天津', '重庆'].find((name) => stationName.startsWith(name))
  if (municipality) return municipality
  return stationName.replace(/(东|西|南|北|站)$/u, '')
}

export function toStation(meta: RailGoStationMeta): Station {
  const override = STATION_LOCATION_OVERRIDES[meta.telecode]
  const cityName = normalizeCity(override?.city ?? meta.city, meta.name)
  const province = normalizeProvince(override?.province ?? meta.province)
  return {
    code: meta.telecode,
    name: meta.name,
    cityId: `${province}:${cityName}`,
    cityName,
    province,
  }
}

function dateInChina(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function futureFridays(count = 6): string[] {
  const today = dateInChina()
  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const distance = (5 - day + 7) % 7
  const firstFriday = addDays(today, distance)
  return Array.from({ length: count }, (_, index) => addDays(firstFriday, index * 7))
}

function railDate(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`无法识别的 RailGo 运行日期：${value}`)
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function validTime(value: string | undefined): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
}

function atStop(runDate: string, stop: RailGoStop, value: string): string {
  return chinaDateTime(addDays(runDate, Number(stop.day ?? 0)), value)
}

function trainKind(value: RailGoTrainResponse | RailGoStationTrain): TrainKind | undefined {
  const kind = (value.numberKind || value.number.charAt(0)).toUpperCase() as TrainKind
  return ALLOWED_KINDS.has(kind) ? kind : undefined
}

function canonicalNumbers(value: RailGoStationTrain | RailGoTrainResponse): string[] {
  return [...new Set([...(value.numberFull ?? []), value.number])].sort()
}

function canonicalId(value: RailGoStationTrain | RailGoTrainResponse): string {
  return canonicalNumbers(value).join('_')
}

function validateStationResponse(
  value: RailGoStationResponse,
  expected: BeijingStationConfig,
): void {
  if (!value?.data || value.data.telecode !== expected.code || !Array.isArray(value.trains)) {
    throw new Error(`RailGo 车站查询结构异常：${expected.name}（${expected.code}）`)
  }
}

function validateTrainResponse(value: RailGoTrainResponse, requestedNumber: string): void {
  if (
    !value?.number ||
    !Array.isArray(value.numberFull) ||
    !Array.isArray(value.timetable) ||
    !Array.isArray(value.rundays) ||
    value.timetable.some(
      (stop) => !stop.station || !stop.stationTelecode || !Number.isInteger(Number(stop.day)),
    )
  ) {
    throw new Error(`RailGo 车次详情结构异常：${requestedNumber}`)
  }
}

async function stationMetadata(stop: RailGoStop): Promise<RailGoStationMeta | undefined> {
  const cached = await readCache<RailGoStationMeta>('stations', stop.stationTelecode)
  if (cached) return cached

  try {
    const response = await railGoGet<RailGoStationMeta | RailGoStationMeta[]>('station/preselect', {
      keyword: stop.station,
    })
    const choices = Array.isArray(response) ? response : [response]
    const exact = choices.find(
      (choice) => choice.telecode === stop.stationTelecode || choice.name === stop.station,
    )
    if (!exact?.telecode || !exact.name) return undefined
    await writeCache('stations', stop.stationTelecode, exact)
    return exact
  } catch (error) {
    log(`车站地区信息缺失：${stop.station}（${stop.stationTelecode}）— ${String(error)}`)
    return undefined
  }
}

function fallbackStation(stop: RailGoStop): Station {
  const cityName = normalizeCity(undefined, stop.station)
  return {
    code: stop.stationTelecode,
    name: stop.station,
    cityId: `其他:${cityName}`,
    cityName,
    province: '其他',
  }
}

function addLeg(legs: RailLeg[], leg: RailLeg): void {
  if (!legs.some((candidate) => candidate.id === leg.id)) legs.push(leg)
}

function makeLeg(
  trainId: string,
  kind: TrainKind,
  from: RailGoStop,
  to: RailGoStop,
  departureAt: string,
  arrivalAt: string,
): RailLeg | undefined {
  const durationMinutes = minutesBetween(departureAt, arrivalAt)
  if (durationMinutes <= 0) return undefined
  const number = from.trainCode || to.trainCode || trainId.split('_')[0]
  return {
    id: `${trainId}:${from.stationTelecode}:${to.stationTelecode}:${departureAt}`,
    trainId,
    number,
    kind,
    fromStationCode: from.stationTelecode,
    toStationCode: to.stationTelecode,
    departureAt,
    arrivalAt,
    durationMinutes,
  }
}

export function buildLegs(  trains: RailGoTrainResponse[],
  stationLookup: Record<string, Station>,
  beijingCodes: Set<string>,
  weekends: string[],
): {
  trains: Record<string, TrainSummary>
  outboundIndex: Record<string, WeekendOutboundIndex>  returnIndex: Record<string, RailLeg[]>
} {
  const outboundDates = new Map<string, { weekendFriday: string; weekday: keyof WeekendOutboundIndex }>()
  for (const friday of weekends) {
    outboundDates.set(friday, { weekendFriday: friday, weekday: 'friday' })
    outboundDates.set(addDays(friday, 1), { weekendFriday: friday, weekday: 'saturday' })
  }  const sundaySet = new Set(weekends.map((friday) => addDays(friday, 2)))
  const trainSummaries: Record<string, TrainSummary> = {}
  const outboundIndex: Record<string, WeekendOutboundIndex> = Object.fromEntries(
    weekends.map((friday) => [friday, { friday: [] as RailLeg[], saturday: [] as RailLeg[] }]),
  )  const returnIndex = Object.fromEntries(
    weekends.map((friday) => [addDays(friday, 2), [] as RailLeg[]]),
  )

  for (const train of trains) {
    const kind = trainKind(train)
    if (!kind) continue
    const trainId = canonicalId(train)
    let used = false

    for (const rawRunDate of train.rundays) {
      const runDate = railDate(rawRunDate)

      for (let beijingIndex = 0; beijingIndex < train.timetable.length; beijingIndex += 1) {
        const beijingStop = train.timetable[beijingIndex]
        if (!beijingCodes.has(beijingStop.stationTelecode)) continue

        if (validTime(beijingStop.depart)) {
          const departureAt = atStop(runDate, beijingStop, beijingStop.depart)
          const outboundDay = outboundDates.get(datePart(departureAt))
          if (outboundDay) {            for (let index = beijingIndex + 1; index < train.timetable.length; index += 1) {
              const destinationStop = train.timetable[index]
              const destination = stationLookup[destinationStop.stationTelecode]
              if (!destination || destination.cityName === '北京') continue
              const arrivalTime = validTime(destinationStop.arrive)
                ? destinationStop.arrive
                : destinationStop.depart
              if (!validTime(arrivalTime)) continue
              const arrivalAt = atStop(runDate, destinationStop, arrivalTime)
              const leg = makeLeg(trainId, kind, beijingStop, destinationStop, departureAt, arrivalAt)
              if (!leg) continue
              addLeg(outboundIndex[outboundDay.weekendFriday][outboundDay.weekday], leg)              used = true
            }
          }
        }

        const beijingArrivalTime = validTime(beijingStop.arrive)
          ? beijingStop.arrive
          : beijingStop.depart
        if (!validTime(beijingArrivalTime)) continue
        const beijingArrivalAt = atStop(runDate, beijingStop, beijingArrivalTime)

        for (let index = 0; index < beijingIndex; index += 1) {
          const originStop = train.timetable[index]
          const origin = stationLookup[originStop.stationTelecode]
          if (!origin || origin.cityName === '北京' || !validTime(originStop.depart)) continue
          const departureAt = atStop(runDate, originStop, originStop.depart)
          if (!sundaySet.has(datePart(departureAt))) continue
          const leg = makeLeg(
            trainId,
            kind,
            originStop,
            beijingStop,
            departureAt,
            beijingArrivalAt,
          )
          if (!leg) continue
          addLeg(returnIndex[datePart(departureAt)], leg)          used = true
        }
      }
    }

    if (used) {
      trainSummaries[trainId] = {
        id: trainId,
        number: train.number,
        numbers: canonicalNumbers(train),
        kind,
      }
    }
  }

  return { trains: trainSummaries, outboundIndex, returnIndex }
}

async function main(): Promise<void> {
  const configPath = path.resolve('config', 'beijing-stations.json')
  const config = JSON.parse(await readFile(configPath, 'utf8')) as BeijingStationConfig[]
  if (config.length !== 7 || new Set(config.map((station) => station.code)).size !== config.length) {
    throw new Error('beijing-stations.json 必须包含七个不重复车站')
  }

  const stationResponses: RailGoStationResponse[] = []
  for (const station of config) {
    log(`读取 ${station.name}（${station.code}）途经车次`)
    const response = await railGoGet<RailGoStationResponse>('station/query', {
      telecode: station.code,
    })
    validateStationResponse(response, station)
    stationResponses.push(response)
  }

  const representatives = new Map<string, RailGoStationTrain>()
  for (const response of stationResponses) {
    for (const reference of response.trains) {
      if (!trainKind(reference)) continue
      const id = canonicalId(reference)
      if (!representatives.has(id)) representatives.set(id, reference)
    }
  }
  if (representatives.size < 20) throw new Error('北京站 G/C/D 车次数量异常，拒绝覆盖上次快照')
  log(`七站合并后共 ${representatives.size} 组 G/C/D 车次`)

  const trains: RailGoTrainResponse[] = []
  let completed = 0
  for (const [id, reference] of representatives) {
    let train = await readCache<RailGoTrainResponse>('trains', id, TRAIN_CACHE_MAX_AGE)
    if (!train) {
      train = await railGoGet<RailGoTrainResponse>('train/query', { train: reference.number })
      validateTrainResponse(train, reference.number)
      await writeCache('trains', id, train)
    } else {
      validateTrainResponse(train, reference.number)
    }
    trains.push(train)
    completed += 1
    if (completed % 25 === 0 || completed === representatives.size) {
      log(`车次详情 ${completed}/${representatives.size}`)
    }
  }

  const stationLookup: Record<string, Station> = {}
  for (const response of stationResponses) stationLookup[response.data.telecode] = toStation(response.data)

  const uniqueStops = new Map<string, RailGoStop>()
  trains.flatMap((train) => train.timetable).forEach((stop) => uniqueStops.set(stop.stationTelecode, stop))
  let unknownStationCount = 0
  let stationIndex = 0
  for (const [code, stop] of uniqueStops) {
    if (stationLookup[code]) continue
    const meta = await stationMetadata(stop)
    stationLookup[code] = meta ? toStation(meta) : fallbackStation(stop)
    if (!meta) unknownStationCount += 1
    stationIndex += 1
    if (stationIndex % 50 === 0) log(`车站地区信息 ${stationIndex}/${uniqueStops.size}`)
  }

  const weekends = futureFridays(6)
  const beijingCodes = new Set(config.map((station) => station.code))
  const built = buildLegs(trains, stationLookup, beijingCodes, weekends)
  for (const friday of weekends) {
    const sunday = addDays(friday, 2)
    const outbound = built.outboundIndex[friday]
    if (!outbound?.friday.length || !outbound.saturday.length || !built.returnIndex[sunday]?.length) {      throw new Error(`${friday} 周末的去程或返程索引为空，拒绝覆盖上次快照`)
    }
  }

  const usedCodes = new Set<string>()
  Object.values(built.outboundIndex).flatMap((index) => [...index.friday, ...index.saturday]).forEach((leg) => {    usedCodes.add(leg.fromStationCode)
    usedCodes.add(leg.toStationCode)
  })
  Object.values(built.returnIndex).flat().forEach((leg) => {
    usedCodes.add(leg.fromStationCode)
    usedCodes.add(leg.toStationCode)
  })
  const stations: Record<string, Station> = Object.fromEntries(
    [...usedCodes].flatMap((code) => {
      const station = stationLookup[code]
      return station ? ([[code, station]] as const) : []
    }),
  )
  const cityGroups: Record<string, CityGroup> = {}
  for (const station of Object.values(stations)) {
    if (station.cityName === '北京') continue
    const group = cityGroups[station.cityId] ?? {
      id: station.cityId,
      name: station.cityName,
      province: station.province,
      stationCodes: [],
    }
    if (!group.stationCodes.includes(station.code)) group.stationCodes.push(station.code)
    cityGroups[station.cityId] = group
  }

  const warnings: string[] = []
  if (unknownStationCount) warnings.push(`${unknownStationCount} 个车站缺少省市元数据，暂归入“其他”`)
  const snapshot: RailSnapshot = {
    schemaVersion: 2,    generatedAt: new Date().toISOString(),
    source: {
      name: 'RailGo',
      url: 'https://railgo.dev',
      termsUrl: 'https://api.railgo.dev/',
      mode: 'live',
    },
    availableWeekends: weekends,
    beijingStations: config.map((station) => stationLookup[station.code]),
    stations,
    cityGroups,
    trains: built.trains,
    outboundIndex: built.outboundIndex,
    returnIndex: built.returnIndex,
    dataWarnings: warnings,
  }

  const target = path.resolve('public', 'data', 'rail-snapshot.json')
  await atomicWriteJson(target, snapshot)
  log(`快照已写入 ${target}，${Object.keys(cityGroups).length} 个城市，未来六个周末`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}