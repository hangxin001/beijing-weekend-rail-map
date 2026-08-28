export type TrainKind = 'G' | 'C' | 'D'

export interface DataSource {
  name: 'RailGo'
  url: string
  termsUrl: string
  mode: 'live'
}

export interface Station {
  code: string
  name: string
  cityId: string
  cityName: string
  province: string
}

export interface CityGroup {
  id: string
  name: string
  province: string
  stationCodes: string[]
}

export interface TrainSummary {
  id: string
  number: string
  numbers: string[]
  kind: TrainKind
}

export interface RailLeg {
  id: string
  trainId: string
  number: string
  kind: TrainKind
  fromStationCode: string
  toStationCode: string
  departureAt: string
  arrivalAt: string
  durationMinutes: number
}

export type DepartureWeekday = 'friday' | 'saturday'
export type ArrivalWeekday = 'sunday' | 'monday'

export interface WeekendOutboundIndex {
  friday: RailLeg[]
  saturday: RailLeg[]
}

export interface RailSnapshot {
  schemaVersion: 2
  generatedAt: string
  source: DataSource
  availableWeekends: string[]
  beijingStations: Station[]
  stations: Record<string, Station>
  cityGroups: Record<string, CityGroup>
  trains: Record<string, TrainSummary>
  outboundIndex: Record<string, WeekendOutboundIndex>
  returnIndex: Record<string, RailLeg[]>
  dataWarnings: string[]
}

export interface SearchInput {
  departureWeekday: DepartureWeekday
  departureTime: string
  latestBeijingArrivalWeekday: ArrivalWeekday
  latestBeijingArrivalTime: string
  beijingStationCodes?: string[]
  maxDurationMinutes?: number
}

export interface ReachabilityResult {
  destination: CityGroup
  outboundTrain: TrainSummary
  returnTrain: TrainSummary
  outboundLeg: RailLeg
  returnLeg: RailLeg
  outboundArrivalAt: string
  returnDepartureAt: string
  beijingArrivalAt: string
  stayMinutes: number
  alternatives: {
    outbound: RailLeg[]
    returns: RailLeg[]
  }
  dataGeneratedAt: string
  resolvedWeekendFriday: string
  timetableOnly: true
}

export interface ProvinceSummary {
  province: string
  destinationCount: number
  stationCount: number
  longestStayMinutes: number
}
