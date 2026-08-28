const CHINA_OFFSET = '+08:00'

export function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + amount))
  return value.toISOString().slice(0, 10)
}

export function datePart(dateTime: string): string {
  return dateTime.slice(0, 10)
}

export function timePart(dateTime: string): string {
  return dateTime.slice(11, 16)
}

export function chinaDateTime(date: string, time: string): string {
  return `${date}T${time}:00${CHINA_OFFSET}`
}

export function chinaDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}

export function toTimestamp(value: string): number {
  return Date.parse(value)
}

export function minutesBetween(start: string, end: string): number {
  return Math.round((toTimestamp(end) - toTimestamp(start)) / 60_000)
}

export function formatWeekendLabel(friday: string): string {
  const sunday = addDays(friday, 2)
  return `${friday.slice(5).replace('-', '.')}—${sunday.slice(5).replace('-', '.')}`
}

export function formatDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Shanghai',
  }).formatToParts(new Date(value))
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.month}月${lookup.day}日 ${lookup.weekday} ${lookup.hour}:${lookup.minute}`
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}分钟`
  if (rest === 0) return `${hours}小时`
  return `${hours}小时${rest}分`
}
