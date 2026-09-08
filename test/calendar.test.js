import { describe, it, expect } from 'vitest'
import {
  pad,
  addDaysStr,
  mondayOf,
  toUTCISO,
  splitInZone,
  dayInZone,
  zoneLabel,
  statusColor,
  resourceIcon,
} from '@utils/calendar'

describe('calendar-string math', () => {
  it('pads to two digits', () => {
    expect(pad(0)).toBe('00')
    expect(pad(3)).toBe('03')
    expect(pad(12)).toBe('12')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDaysStr('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('finds the Monday of a week (Mon..Sun anchored)', () => {
    // 2026-09-07 is a Monday, 09-09 a Wednesday, 09-13 the following Sunday.
    expect(mondayOf('2026-09-07')).toBe('2026-09-07')
    expect(mondayOf('2026-09-09')).toBe('2026-09-07')
    expect(mondayOf('2026-09-13')).toBe('2026-09-07')
  })
})

describe('timezone-aware helpers', () => {
  it('round-trips a wall-clock through UTC and back in the same zone', () => {
    const utc = toUTCISO('2026-07-01', '09:00', 'America/Chicago')
    expect(splitInZone(utc, 'America/Chicago')).toEqual({ date: '2026-07-01', time: '09:00' })
  })

  it('applies DST: the same 9am maps to a different UTC hour in winter vs summer', () => {
    // Chicago is CST (UTC-6) in January and CDT (UTC-5) in July.
    expect(toUTCISO('2026-01-15', '09:00', 'America/Chicago')).toContain('T15:00')
    expect(toUTCISO('2026-07-15', '09:00', 'America/Chicago')).toContain('T14:00')
  })

  it('buckets a late-night UTC instant onto the right local calendar day', () => {
    // 02:00Z on Jul 2 is still 21:00 on Jul 1 in Chicago (CDT, -5).
    expect(dayInZone('2026-07-02T02:00:00Z', 'America/Chicago')).toBe('2026-07-01')
  })

  it('falls back to UTC when the zone is missing, without throwing', () => {
    expect(splitInZone('2026-07-01T09:00:00Z', '')).toEqual({ date: '2026-07-01', time: '09:00' })
  })

  it('labels a zone by city', () => {
    expect(zoneLabel('America/Chicago')).toMatch(/^Chicago/)
  })
})

describe('presentation maps', () => {
  it('has a colour for every job status', () => {
    expect(Object.keys(statusColor).sort()).toEqual(
      ['cancelled', 'completed', 'in_progress', 'scheduled'].sort(),
    )
  })

  it('picks the resource icon by type', () => {
    expect(resourceIcon('member')).toBe('$account')
    expect(resourceIcon('team')).toBe('$teams')
    expect(resourceIcon(undefined)).toBe('$teams')
  })
})
