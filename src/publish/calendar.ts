function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date)
  function value(type: string) {
    return parts.find(function (part) { return part.type === type })!.value
  }
  return { day: value('year') + '-' + value('month') + '-' + value('day'), minutes: Number(value('hour')) * 60 + Number(value('minute')) }
}

export function dateKey(date: Date, timezone: string) {
  return localParts(date, timezone).day
}

export function publicationDay(date: Date, timezone: string, time: string) {
  const local = localParts(date, timezone)
  const [hour, minute] = time.split(':').map(Number)
  if (local.minutes >= hour * 60 + minute) {
    return local.day
  }
  const previous = new Date(local.day + 'T00:00:00Z')
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}

export function weekKey(timestamp: string, timezone: string) {
  const day = new Date(dateKey(new Date(timestamp), timezone) + 'T00:00:00Z')
  let weekday = day.getUTCDay()
  if (weekday === 0) {
    weekday = 7
  }
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const year = day.getUTCFullYear()
  const yearStart = Date.UTC(year, 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / 86400000 + 1) / 7)
  return year + '-W' + String(week).padStart(2, '0')
}

export function completedMonths(firstMonth: string, currentMonth: string) {
  const months: string[] = []
  let cursor = firstMonth
  while (cursor < currentMonth) {
    months.push(cursor)
    const date = new Date(cursor + '-01T00:00:00Z')
    date.setUTCMonth(date.getUTCMonth() + 1)
    cursor = date.toISOString().slice(0, 7)
  }
  return months
}
