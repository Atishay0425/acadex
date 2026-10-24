import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFile, cleanName, purgeOrphans, createMemoryStore } from '../src/files.js'
import { setup, classroom } from './helpers.js'

const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF')
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)])
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)])

test('file type comes from the bytes: allowed types pass, scripts, html, svg and fakes do not', () => {
  assert.equal(detectFile(pdf, 'a.pdf').mime, 'application/pdf')
  assert.equal(detectFile(pdf, 'renamed.txt').mime, 'application/pdf') // bytes win over the name
  assert.equal(detectFile(png, 'x.png').mime, 'image/png')
  assert.match(detectFile(docx, 'essay.docx').mime, /wordprocessingml/)
  assert.equal(detectFile(docx, 'essay.zip'), null) // a zip is not an office file by name
  assert.match(detectFile(Buffer.from('notes in plain text'), 'n.txt').mime, /^text\/plain/)
  for (const [buf, name] of [[Buffer.from('<html><script>alert(1)</script>'), 'page.html'], [Buffer.from('<svg onload=alert(1)>'), 'a.svg'], [Buffer.from('MZ\u0090\u0000'), 'run.exe'], [Buffer.from('#!/bin/sh\nrm -rf /'), 'x.sh'], [Buffer.from([0, 1, 2, 3]), 'bin.txt']]) assert.equal(detectFile(buf, name), null, name)
})

test('names are reduced to a safe base name', () => {
  assert.equal(cleanName('../../etc/passwd'), 'passwd')
  assert.equal(cleanName('C:\\Users\\me\\My <Report>.pdf'), 'My Report.pdf')
  assert.equal(cleanName(''), 'file')
  assert.ok(cleanName('x'.repeat(500) + '.pdf').length <= 120)
})

test('upload: stores the file under a random key and returns its details; bad files are refused', async () => {
  const store = createMemoryStore(); const ctx = await setup({ files: store })
  const ok = await ctx.as('student').upload('Lab report.pdf', pdf)
  assert.deepEqual([ok.status, ok.body.name, ok.body.mime, ok.body.size], [201, 'Lab report.pdf', 'application/pdf', pdf.length])
  assert.equal(store.m.size, 1)
  const [key] = [...store.m.keys()]
  assert.ok(/^[0-9a-f]{48}$/.test(key) && !key.includes('Lab'))
  assert.equal((await ctx.as('student').upload('evil.html', Buffer.from('<script>alert(1)</script>'))).status, 400)
  assert.equal((await ctx.as('student').upload('empty.pdf', Buffer.alloc(0))).status, 400)
  assert.equal((await ctx.as('student').upload('big.pdf', Buffer.concat([pdf, Buffer.alloc(11 * 1024 * 1024)]))).status, 413)
  assert.equal((await ctx.request('post', '/files', pdf)).status, 401)
  assert.equal(store.m.size, 1) // nothing refused was written
})

test('assignment files: the student attaches, the teacher downloads, outsiders cannot', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = (await ctx.as('teacher').post(`/courses/${c.id}/assignments`, { title: 'Lab 1', dueAt: new Date(Date.now() + 86400000).toISOString(), maxMarks: 10 })).body
  const f = (await ctx.as('student').upload('lab1.pdf', pdf)).body
  assert.equal((await ctx.as('student').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: '', fileIds: [f.id] })).status, 201) // a file alone is enough
  const mine = (await ctx.as('student').get(`/courses/${c.id}/assignments/mine`)).body[0].submission
  assert.deepEqual(mine.files.map((x) => [x.name, x.size]), [['lab1.pdf', pdf.length]])
  const seen = (await ctx.as('teacher').get(`/courses/${c.id}/assignments/${a.id}/submissions`)).body.students.find((s) => s.studentId === ctx.ids.student)
  assert.equal(seen.submission.files[0].id, f.id)
  const dl = await ctx.as('teacher').download(f.id)
  assert.equal(dl.status, 200)
  assert.deepEqual([dl.headers['content-type'], dl.headers['x-content-type-options'], /attachment; filename="lab1.pdf"/.test(dl.headers['content-disposition'])], ['application/pdf', 'nosniff', true])
  assert.deepEqual(dl.body, pdf)
  assert.equal((await ctx.as('student').download(f.id)).status, 200)
  for (const key of ['student2', 'teacher2']) assert.equal((await ctx.as(key).download(f.id)).status, 404)
  assert.equal((await ctx.as('admin').download(f.id)).status, 200)
})

test('submission file rules: only your own unattached uploads, at most three, replaced on resubmit', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = (await ctx.as('teacher').post(`/courses/${c.id}/assignments`, { title: 'Lab 1', dueAt: new Date(Date.now() + 86400000).toISOString(), maxMarks: 10 })).body
  const put = (key, body) => ctx.as(key).put(`/courses/${c.id}/assignments/${a.id}/submission`, body)
  const ids = []; for (let i = 0; i < 4; i++) ids.push((await ctx.as('student').upload(`f${i}.pdf`, pdf)).body.id)
  const theirs = (await ctx.as('student2').upload('theirs.pdf', pdf)).body.id
  assert.equal((await put('student', { fileIds: [theirs] })).status, 400) // someone else's upload
  assert.equal((await put('student', { fileIds: ids })).status, 400) // four is too many
  assert.equal((await put('student', { fileIds: [99999] })).status, 400)
  assert.equal((await put('student', { fileIds: [ids[0], ids[1]] })).status, 201)
  assert.equal((await put('student2', { fileIds: [ids[0]] })).status, 400) // already attached
  await put('student', { fileIds: [ids[2]] })
  assert.deepEqual((await ctx.as('student').get(`/courses/${c.id}/assignments/mine`)).body[0].submission.files.map((x) => x.id), [ids[2]])
  assert.equal((await ctx.as('student').del(`/files/${ids[2]}`)).status, 409) // attached
  assert.equal((await ctx.as('student').del(`/files/${ids[0]}`)).status, 204) // dropped on resubmit, so free to delete
  assert.equal((await ctx.as('student').download(ids[0])).status, 404)
})

test('class files: a teacher shares a file, enrolled students download it, others cannot', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const f = (await ctx.as('teacher').upload('slides.pptx', docx)).body
  const share = await ctx.as('teacher').post(`/courses/${c.id}/resources`, { kind: 'file', title: 'Unit 1 slides', fileId: f.id })
  assert.deepEqual([share.status, share.body.kind, share.body.file.name], [201, 'file', 'slides.pptx'])
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/resources`, { kind: 'file', title: 'Again', fileId: f.id })).status, 400) // already attached
  const stolen = (await ctx.as('student').upload('mine.pdf', pdf)).body.id
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/resources`, { kind: 'file', title: 'Not yours', fileId: stolen })).status, 400)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/resources`)).body[0].file.id, f.id)
  assert.equal((await ctx.as('student').download(f.id)).status, 200)
  assert.equal((await ctx.as('student').post(`/courses/${c.id}/resources/${share.body.id}/import`)).status, 400) // not a note
  await ctx.as('student2').del(`/courses/${c.id}/enroll`)
  assert.equal((await ctx.as('student2').download(f.id)).status, 404)
  assert.equal((await ctx.as('teacher2').download(f.id)).status, 404)
  const outsider = (await ctx.as('student2').get(`/courses/${c.id}/resources`)).status
  assert.equal(outsider, 403)
})

test('unused uploads are cleaned up after a day; attached ones are kept', async () => {
  const store = createMemoryStore(); const ctx = await setup({ files: store }); const c = await classroom(ctx)
  const kept = (await ctx.as('teacher').upload('keep.pdf', pdf)).body
  await ctx.as('teacher').post(`/courses/${c.id}/resources`, { kind: 'file', title: 'Kept', fileId: kept.id })
  await ctx.as('student').upload('orphan.pdf', pdf)
  const fresh = (await ctx.as('student').upload('fresh.pdf', pdf)).body
  await ctx.pool.query("UPDATE files SET created_at = now() - interval '30 hours' WHERE id <> $1", [fresh.id])
  assert.equal(await purgeOrphans(ctx.pool, store, 24), 1)
  assert.equal(store.m.size, 2)
  assert.equal((await ctx.as('student').download(fresh.id)).status, 200)
  assert.equal((await ctx.as('student').get('/notifications')).status, 200)
})
