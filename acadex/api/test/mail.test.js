import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SMTPServer } from 'smtp-server'
import { defaultMailer } from '../src/notify.js'
import { setup, classroom } from './helpers.js'

// A tiny SMTP server that records each message, so the real nodemailer path runs without any external service.
async function mailSink() {
  const messages = []
  const server = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'],
    onData(stream, session, cb) { let raw = ''; stream.on('data', (c) => { raw += c }); stream.on('end', () => { messages.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), raw }); cb() }) },
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { messages, url: `smtp://127.0.0.1:${server.server.address().port}`, close: () => new Promise((ok) => server.close(ok)) }
}

test('SMTP_URL turns on real email: a notification arrives as a message with the sender, recipient, subject and link', async () => {
  const sink = await mailSink()
  try {
    const mailer = defaultMailer({ smtpUrl: sink.url, mailFrom: 'Acadex <no-reply@college.edu>' })
    assert.ok(mailer)
    const ctx = await setup({ mailer }); const c = await classroom(ctx)
    const d = (await ctx.as('student').post('/doubts', { courseId: c.id, title: 'Why does gain ratio fix ID3 bias?' })).body
    await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'It normalises by split information.' })
    await ctx.app.notify.flush()
    const toStudent = sink.messages.find((m) => m.to.includes('student@t.edu'))
    assert.equal(toStudent.from, 'no-reply@college.edu')
    assert.match(toStudent.raw, /Subject: Your doubt was answered/)
    assert.match(toStudent.raw, /Open Acadex: http:\/\/localhost:3000\/student\/doubts/)
    assert.ok(sink.messages.some((m) => m.to.includes('teacher@t.edu'))) // and the teacher was told about the new doubt
  } finally { await sink.close() }
})

test('with no SMTP_URL there is no mailer, and an unreachable mail server does not break the request', async () => {
  assert.equal(defaultMailer({ smtpUrl: '' }), null)
  const mailer = defaultMailer({ smtpUrl: 'smtp://127.0.0.1:1', mailFrom: 'Acadex <no-reply@college.edu>' }) // nothing listens on port 1
  const ctx = await setup({ mailer }); const c = await classroom(ctx)
  const d = (await ctx.as('student').post('/doubts', { courseId: c.id, title: 'Why does gain ratio fix ID3 bias?' })).body
  assert.equal((await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'Answered.' })).status, 200)
  await ctx.app.notify.flush()
  assert.equal((await ctx.as('student').get('/notifications')).body.unread, 1)
})
