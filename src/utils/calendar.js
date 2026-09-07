// Shared date + schedule-cell helpers for the two Schedule views: the company
// resource timeline (schedule.vue) and the platform cross-company board
// (platform-schedule.vue).
//
// Two kinds of helper live here:
//   • Pure calendar-string math on 'YYYY-MM-DD' (pad/toStr/addDaysStr/mondayOf) —
//     these move between calendar days and never touch a clock or a zone.
//   • Zone-aware helpers that turn a stored UTC instant into (or out of) a
//     company's wall-clock. Stored instants are always UTC; a company's IANA
//     time zone governs the wall-clock the UI shows, so a schedule reads the same
//     for everyone regardless of where the viewer happens to be. Luxon does the
//     zone/DST arithmetic that Date + Intl make error-prone.
import { DateTime } from 'luxon'

export function pad(n) {
  return String(n).padStart(2, '0')
}
export function toStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function addDaysStr(str, n) {
  const d = new Date(str + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toStr(d)
}
export function mondayOf(str) {
  const d = new Date(str + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toStr(d)
}

// zone falls back to UTC so a missing/empty company time zone never throws.
function zone(tz) {
  return tz || 'UTC'
}

// todayInZone is the current calendar day (YYYY-MM-DD) in the company's zone, so
// "today" highlights the right cell even when the viewer is in another zone.
export function todayInZone(tz) {
  return DateTime.now().setZone(zone(tz)).toISODate()
}

// dayInZone is the calendar day a stored UTC instant falls on, in the company's
// zone — the key a job is bucketed under in the day/week/month grids.
export function dayInZone(iso, tz) {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone(tz)).toISODate()
}

// formatTime renders a stored UTC instant as a short local clock time in the
// company's zone (e.g. "9:00 AM"), matching the viewer's locale for 12/24h.
export function formatTime(iso, tz) {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone(tz)).toLocaleString(DateTime.TIME_SIMPLE)
}

// toUTCISO turns a wall-clock the user typed (a 'YYYY-MM-DD' date + 'HH:mm' time,
// meant in the company's zone) into the UTC instant to send to the API.
export function toUTCISO(date, time, tz) {
  return DateTime.fromISO(`${date}T${time}`, { zone: zone(tz) }).toUTC().toISO()
}

// splitInZone is the inverse of toUTCISO: it breaks a stored UTC instant into the
// { date, time } wall-clock fields an edit form shows, in the company's zone.
export function splitInZone(iso, tz) {
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone(tz))
  return { date: dt.toFormat('yyyy-MM-dd'), time: dt.toFormat('HH:mm') }
}

// A friendly label for a zone, e.g. "America/Chicago" -> "Chicago" plus its
// current offset abbreviation, for the "times shown in …" hint.
export function zoneLabel(tz) {
  const z = zone(tz)
  const city = z.split('/').pop().replace(/_/g, ' ')
  const abbr = DateTime.now().setZone(z).toFormat('ZZZZ') // e.g. CDT, PST, UTC
  return abbr && abbr !== city ? `${city} (${abbr})` : city
}

// Status accent colour, matched to the job status chip palette.
export const statusColor = {
  scheduled: '#4f46e5',
  in_progress: '#d97706',
  completed: '#16a34a',
  cancelled: '#94a3b8',
}
export function resourceIcon(type) {
  return type === 'member' ? '$account' : '$teams'
}
