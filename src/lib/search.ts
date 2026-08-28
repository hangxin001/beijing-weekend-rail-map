import { addDays, chinaDateTime, datePart, minutesBetween, toTimestamp } from './datetime'
import type {
  ProvinceSummary,
  RailLeg,
  RailSnapshot,
  ReachabilityResult,
  SearchInput,
  TrainKind,
} from '../types'

const ALLOWED_KINDS = new Set<TrainKind>(['G', 'C', 'D'])
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function byArrival(a: RailLeg, b: RailLeg): number {
  return toTimestamp(a.arrivalAt) - toTimestamp(b.arrivalAt)
}

function byDepartureDesc(a: RailLeg, b: RailLeg): number {
  return toTimestamp(b.departureAt) - toTimestamp(a.departureAt)
}

function stationIsSelected(code: string, selected: Set<string> | undefined): boolean {
  return !selected || selected.has(code)
}

function minuteTimestamp(value: Date | string | number): number {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  return Math.floor(timestamp / 60_000) * 60_000
}

export function resolveWeekendFriday(
  snapshot: RailSnapshot,
  input: SearchInput,
  now: Date | string | number = new Date(),
): string | undefined {
  if (!TIME_PATTERN.test(input.departureTime) || !TIME_PATTERN.test(input.latestBeijingArrivalTime)) {
    return undefined
  }

  const departureOffset = input.departureWeekday === 'saturday' ? 1 : 0
  const currentMinute = minuteTimestamp(now)
  return [...snapshot.availableWeekends].sort().find((friday) => {
    const departureIndex = snapshot.outboundIndex[friday]?.[input.departureWeekday]
    if (!departureIndex?.length) return false
    const departureAt = chinaDateTime(addDays(friday, departureOffset), input.departureTime)
    return toTimestamp(departureAt) >= currentMinute
  })
}

export function searchReachableDestinations(
  snapshot: RailSnapshot,
  input: SearchInput,
  now: Date | string | number = new Date(),
): ReachabilityResult[] {
  const weekendFriday = resolveWeekendFriday(snapshot, input, now)
  if (!weekendFriday) return []

  const departureDate = addDays(weekendFriday, input.departureWeekday === 'saturday' ? 1 : 0)
  const sunday = addDays(weekendFriday, 2)
  const arrivalDate = addDays(
    weekendFriday,
    input.latestBeijingArrivalWeekday === 'monday' ? 3 : 2,
  )
  const earliestDeparture = chinaDateTime(departureDate, input.departureTime)
  const latestBeijingArrivalAt = chinaDateTime(arrivalDate, input.latestBeijingArrivalTime)
  const selectedStations = input.beijingStationCodes?.length
    ? new Set(input.beijingStationCodes)
    : undefined

  const outbound = (snapshot.outboundIndex[weekendFriday]?.[input.departureWeekday] ?? []).filter((leg) => {
    return (
      ALLOWED_KINDS.has(leg.kind) &&
      datePart(leg.departureAt) === departureDate &&
      toTimestamp(leg.departureAt) >= toTimestamp(earliestDeparture) &&
      stationIsSelected(leg.fromStationCode, selectedStations) &&
      (input.maxDurationMinutes === undefined || leg.durationMinutes <= input.maxDurationMinutes)
    )
  })

  const returns = (snapshot.returnIndex[sunday] ?? []).filter((leg) => {
    return (
      ALLOWED_KINDS.has(leg.kind) &&
      datePart(leg.departureAt) === sunday &&
      toTimestamp(leg.arrivalAt) <= toTimestamp(latestBeijingArrivalAt) &&
      stationIsSelected(leg.toStationCode, selectedStations) &&
      (input.maxDurationMinutes === undefined || leg.durationMinutes <= input.maxDurationMinutes)
    )
  })

  const outboundByCity = new Map<string, RailLeg[]>()
  const returnsByCity = new Map<string, RailLeg[]>()

  for (const leg of outbound) {
    const cityId = snapshot.stations[leg.toStationCode]?.cityId
    if (!cityId) continue
    const group = outboundByCity.get(cityId) ?? []
    group.push(leg)
    outboundByCity.set(cityId, group)
  }

  for (const leg of returns) {
    const cityId = snapshot.stations[leg.fromStationCode]?.cityId
    if (!cityId) continue
    const group = returnsByCity.get(cityId) ?? []
    group.push(leg)
    returnsByCity.set(cityId, group)
  }

  const results: ReachabilityResult[] = []
  for (const [cityId, outboundLegs] of outboundByCity) {
    const returnLegs = returnsByCity.get(cityId)
    const destination = snapshot.cityGroups[cityId]
    if (!returnLegs?.length || !destination) continue

    const validOutbound = outboundLegs.sort(byArrival)
    const validReturns = returnLegs.sort(byDepartureDesc)
    const pairs = validOutbound.flatMap((outboundLeg) =>
      validReturns
        .filter(
          (returnLeg) => toTimestamp(returnLeg.departureAt) > toTimestamp(outboundLeg.arrivalAt),
        )
        .map((returnLeg) => ({
          outboundLeg,
          returnLeg,
          stayMinutes: minutesBetween(outboundLeg.arrivalAt, returnLeg.departureAt),
        })),
    )

    pairs.sort((a, b) => b.stayMinutes - a.stayMinutes)
    const best = pairs[0]
    if (!best) continue

    const outboundTrain = snapshot.trains[best.outboundLeg.trainId]
    const returnTrain = snapshot.trains[best.returnLeg.trainId]
    if (!outboundTrain || !returnTrain) continue

    results.push({
      destination,
      outboundTrain,
      returnTrain,
      outboundLeg: best.outboundLeg,
      returnLeg: best.returnLeg,
      outboundArrivalAt: best.outboundLeg.arrivalAt,
      returnDepartureAt: best.returnLeg.departureAt,
      beijingArrivalAt: best.returnLeg.arrivalAt,
      stayMinutes: best.stayMinutes,
      alternatives: {
        outbound: validOutbound.slice(0, 3),
        returns: validReturns.slice(0, 3),
      },
      dataGeneratedAt: snapshot.generatedAt,
      resolvedWeekendFriday: weekendFriday,
      timetableOnly: true,
    })
  }

  return results.sort(
    (a, b) =>
      b.stayMinutes - a.stayMinutes ||
      toTimestamp(a.outboundArrivalAt) - toTimestamp(b.outboundArrivalAt),
  )
}

export function summarizeProvinces(
  snapshot: RailSnapshot,
  results: ReachabilityResult[],
): ProvinceSummary[] {
  const groups = new Map<string, ReachabilityResult[]>()
  for (const result of results) {
    const group = groups.get(result.destination.province) ?? []
    group.push(result)
    groups.set(result.destination.province, group)
  }

  return [...groups.entries()]
    .map(([province, provinceResults]) => ({
      province,
      destinationCount: provinceResults.length,
      stationCount: new Set(
        provinceResults.flatMap((result) =>
          result.destination.stationCodes.filter((code) => snapshot.stations[code]),
        ),
      ).size,
      longestStayMinutes: Math.max(...provinceResults.map((result) => result.stayMinutes)),
    }))
    .sort((a, b) => b.longestStayMinutes - a.longestStayMinutes)
}
