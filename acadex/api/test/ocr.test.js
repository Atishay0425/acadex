import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { imageKind, createOcr } from '../src/ocr.js'
import { setup } from './helpers.js'

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])
const fake = (result, calls = []) => ({ recognize: async (buf) => { calls.push(buf.length); if (result instanceof Error) throw result; return result } })

test('image type is decided from the file bytes, not the name', () => {
  assert.deepEqual([png, jpeg, Buffer.from('RIFF....WEBPVP8 ........'), Buffer.from('BM......'), Buffer.from('%PDF-1.7 not an image')].map(imageKind), ['png', 'jpeg', 'webp', 'bmp', null])
})

test('a student gets the text from a photo, tidied, with a confidence score', async () => {
  const calls = []
  const ctx = await setup({ ocr: fake({ text: 'Q3.   Why does information gain\n\n\n\nprefer multi-valued attributes?  \n', confidence: 91 }, calls) })
  const res = await ctx.as('student').raw('/doubts/ocr', png, 'image/png')
  assert.deepEqual(res.body, { text: 'Q3. Why does information gain\n\nprefer multi-valued attributes?', confidence: 91, lowConfidence: false })
  assert.equal(calls.length, 1)
  assert.equal((await ctx.as('student').raw('/doubts/ocr', jpeg, 'image/jpeg')).status, 200)
})

test('low confidence is flagged; empty results and engine failures give clear messages', async () => {
  let ctx = await setup({ ocr: fake({ text: 'smudged words', confidence: 40 }) })
  assert.equal((await ctx.as('student').raw('/doubts/ocr', png, 'image/png')).body.lowConfidence, true)
  ctx = await setup({ ocr: fake({ text: '  \n ', confidence: 10 }) })
  assert.deepEqual([(await ctx.as('student').raw('/doubts/ocr', png, 'image/png')).status], [422])
  ctx = await setup({ ocr: fake(new Error('worker crashed')) })
  const down = await ctx.as('student').raw('/doubts/ocr', png, 'image/png')
  assert.deepEqual([down.status, /Try again/.test(down.body.error)], [503, true])
  ctx = await setup() // no OCR engine configured
  assert.equal((await ctx.as('student').raw('/doubts/ocr', png, 'image/png')).status, 503)
})

test('only real images from students are accepted', async () => {
  const calls = []
  const ctx = await setup({ ocr: fake({ text: 'x', confidence: 99 }, calls) })
  assert.equal((await ctx.as('student').raw('/doubts/ocr', Buffer.from('%PDF-1.7 pretending to be a picture'), 'image/png')).status, 400)
  assert.equal((await ctx.as('student').raw('/doubts/ocr', png, 'application/pdf')).status, 400) // wrong content type: no body is read
  assert.equal((await ctx.as('student').raw('/doubts/ocr', Buffer.alloc(0), 'image/png')).status, 400)
  assert.equal((await ctx.as('student').raw('/doubts/ocr', Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), 'image/png')).status, 413)
  assert.equal((await ctx.as('teacher').raw('/doubts/ocr', png, 'image/png')).status, 403)
  assert.equal((await ctx.request('post', '/doubts/ocr')).status, 401)
  assert.equal(calls.length, 0) // nothing invalid reached the engine
})

// Real OCR needs the English language data (about 10 MB) downloaded the first time, so it only runs on request:
//   RUN_OCR_TEST=1 npm test
test('real tesseract reads a generated photo of a question', { skip: !process.env.RUN_OCR_TEST }, async () => {
  const ocr = createOcr({ cachePath: '.ocr-cache' })
  try {
    const out = await ocr.recognize(readFileSync(new URL('./fixtures/question.png', import.meta.url)))
    assert.match(out.text.toLowerCase(), /information gain/)
    assert.match(out.text, /ID3/)
    assert.ok(out.confidence > 70)
  } finally { await ocr.close() }
})
