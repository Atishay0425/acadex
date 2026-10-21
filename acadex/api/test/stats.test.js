import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attendanceStats, marksStats, classesNeeded, isWeak } from '../src/stats.js'

test('attendance counts present and late, ignores excused, null when nothing countable', () => {
  assert.deepEqual(attendanceStats(['present', 'late', 'absent', 'excused']), { attended: 2, total: 3, pct: 66.7 })
  assert.equal(attendanceStats([]).pct, null)
  assert.equal(attendanceStats(['excused']).pct, null)
})

test('marks percentage is total score over total max of graded work', () => {
  assert.equal(marksStats([{ score: 8, max: 10 }, { score: 30, max: 50 }]).pct, 63.3)
  assert.equal(marksStats([]).pct, null)
})

test('classesNeeded finds the run of classes that reaches 75%', () => {
  assert.equal(classesNeeded({ attended: 3, total: 4 }), 0)
  assert.equal(classesNeeded({ attended: 1, total: 4 }), 8) // 9/12 = 75%
  assert.equal(classesNeeded({ attended: 2, total: 4 }), 4) // 6/8 = 75%
  assert.equal(classesNeeded({ attended: 0, total: 0 }), 0)
})

test('weak means attendance under 75 or marks under 60; unknown values do not flag', () => {
  assert.equal(isWeak(74.9, 90), true)
  assert.equal(isWeak(90, 59), true)
  assert.equal(isWeak(75, 60), false)
  assert.equal(isWeak(null, null), false)
})
