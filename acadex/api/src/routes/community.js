import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { withTx } from '../db/pool.js'
import { authorOf, isModerator, limiter, parsePage, placeholders, slugify, voteTotals } from '../community/lib.js'
import { blockedRoomIds } from '../community/rooms.js'

const id = z.coerce.number().int().positive()
const KINDS = ['question', 'notes', 'resource', 'event']
const REASONS = ['spam', 'abuse', 'offtopic', 'other']
const tagList = z.array(z.string().trim().min(1).max(100)).max(8)
const postBody = z.object({
  room: z.string().max(120).nullable().optional(),
  kind: z.enum(KINDS).default('question'),
  title: z.string().trim().min(3).max(300),
  content: z.string().trim().max(10000).default(''),
  isAnonymous: z.boolean().default(false),
  tags: tagList.default([]),
})
const patchBody = postBody.omit({ room: true, isAnonymous: true }).partial()
const voteBody = z.object({ type: z.enum(['up', 'down']) })
const flagBody = z.object({ reason: z.enum(REASONS), note: z.string().trim().max(300).default('') })
const answerBody = z.object({ content: z.string().trim().min(1).max(10000) })
const commentBody = z.object({ content: z.string().trim().min(1).max(2000), parentId: z.number().int().positive().nullable().optional() })
const roomBody = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(['branch', 'general']).default('general'), description: z.string().trim().max(500).default('') })

export function communityRouter({ pool, config }) {
  const r = Router()
  const post = limiter(config, 'post'), vote = limiter(config, 'vote'), flag = limiter(config, 'flag')

  // ------------------------------------------------------------------ helpers
  const POST_SELECT = `SELECT p.*, u.name AS author_name, u.role AS author_role, rm.slug AS room_slug, rm.name AS room_name
    FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN rooms rm ON rm.id = p.room_id`

  // Loads a post the viewer is allowed to see, or throws 404 (hidden and members-only posts look like they don't exist).
  async function visiblePost(user, postId) {
    const p = (await pool.query(`${POST_SELECT} WHERE p.id = $1`, [postId])).rows[0]
    if (!p) throw notFound('Post not found')
    if (p.is_hidden && p.author_id !== user.id && !isModerator(user)) throw notFound('Post not found')
    if (p.room_id && (await blockedRoomIds(pool, user)).includes(p.room_id)) throw notFound('Post not found')
    return p
  }

  async function tagsFor(postIds) {
    const map = new Map(postIds.map((i) => [i, []]))
    if (!postIds.length) return map
    const rows = (await pool.query(`SELECT pt.post_id, t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id IN (${placeholders(postIds)}) ORDER BY t.name`, postIds)).rows
    for (const x of rows) map.get(x.post_id).push(x.name)
    return map
  }

  async function answerCounts(postIds) {
    const map = new Map(postIds.map((i) => [i, 0]))
    if (!postIds.length) return map
    const rows = (await pool.query(`SELECT post_id, COUNT(*) AS n FROM answers WHERE is_hidden = FALSE AND post_id IN (${placeholders(postIds)}) GROUP BY post_id`, postIds)).rows
    for (const x of rows) map.set(x.post_id, Number(x.n))
    return map
  }

  // Shapes a page of post rows using a constant number of queries (votes 2, tags 1, answer counts 1).
  async function shapePosts(user, rows) {
    const ids = rows.map((p) => p.id)
    const [votes, tags, counts] = await Promise.all([voteTotals(pool, 'post_votes', 'post_id', ids, user.id), tagsFor(ids), answerCounts(ids)])
    return rows.map((p) => {
      const v = votes.get(p.id)
      return {
        id: p.id, room: p.room_slug ? { slug: p.room_slug, name: p.room_name } : null, kind: p.kind, title: p.title, content: p.content,
        author: authorOf(p, user, p.is_anonymous), isAnonymous: p.is_anonymous, tags: tags.get(p.id), viewCount: p.view_count,
        answerCount: counts.get(p.id), isSolved: p.accepted_answer_id != null, acceptedAnswerId: p.accepted_answer_id,
        isPinned: p.is_pinned, isHidden: p.is_hidden, upvotes: v.upvotes, downvotes: v.downvotes, score: v.upvotes - v.downvotes, myVote: v.myVote,
        createdAt: p.created_at, updatedAt: p.updated_at,
      }
    })
  }

  async function setTags(client, postId, names) {
    const wanted = new Map()
    for (const n of names) { const slug = slugify(n) || n.toLowerCase(); if (!wanted.has(slug)) wanted.set(slug, n) }
    const before = (await client.query('SELECT pt.tag_id, t.slug FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = $1', [postId])).rows
    for (const b of before) {
      if (wanted.has(b.slug)) { wanted.delete(b.slug); continue }
      await client.query('DELETE FROM post_tags WHERE post_id = $1 AND tag_id = $2', [postId, b.tag_id])
      await client.query('UPDATE tags SET usage_count = usage_count - 1 WHERE id = $1 AND usage_count > 0', [b.tag_id])
    }
    for (const [slug, name] of wanted) {
      let tag = (await client.query('SELECT id FROM tags WHERE slug = $1', [slug])).rows[0]
      if (!tag) tag = (await client.query('INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id', [name, slug])).rows[0]
      await client.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)', [postId, tag.id])
      await client.query('UPDATE tags SET usage_count = usage_count + 1 WHERE id = $1', [tag.id])
    }
  }

  // ------------------------------------------------------------------ rooms
  r.get('/rooms', wrap(async (req, res) => {
    const kind = z.enum(['course', 'branch', 'general']).optional().parse(req.query.kind)
    const blocked = new Set(await blockedRoomIds(pool, req.user))
    const rooms = (await pool.query(`SELECT * FROM rooms ${kind ? 'WHERE kind = $1' : ''} ORDER BY kind, name`, kind ? [kind] : [])).rows.filter((x) => !blocked.has(x.id))
    const counts = new Map((await pool.query('SELECT room_id, COUNT(*) AS n FROM room_members GROUP BY room_id')).rows.map((x) => [x.room_id, Number(x.n)]))
    const mine = new Set((await pool.query('SELECT room_id FROM room_members WHERE user_id = $1', [req.user.id])).rows.map((x) => x.room_id))
    res.json(rooms.map((x) => ({ id: x.id, name: x.name, slug: x.slug, kind: x.kind, description: x.description, courseId: x.course_id, memberCount: counts.get(x.id) ?? 0, isMember: mine.has(x.id) })))
  }))

  // Course rooms come from courses; moderators can add branch and general rooms.
  r.post('/rooms', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const b = roomBody.parse(req.body)
    const { rows } = await pool.query('INSERT INTO rooms (name, slug, kind, description) VALUES ($1, $2, $3, $4) RETURNING *', [b.name, slugify(b.name) || `room-${Date.now()}`, b.kind, b.description])
    res.status(201).json({ id: rows[0].id, name: rows[0].name, slug: rows[0].slug, kind: rows[0].kind })
  }))

  async function openRoom(slug) {
    const room = (await pool.query('SELECT * FROM rooms WHERE slug = $1', [slug])).rows[0]
    if (!room) throw notFound('Room not found')
    if (room.kind === 'course') throw forbidden('Course rooms follow course enrolment')
    return room
  }
  r.post('/rooms/:slug/join', wrap(async (req, res) => {
    const room = await openRoom(req.params.slug)
    const has = await pool.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, req.user.id])
    if (!has.rows.length) await pool.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [room.id, req.user.id])
    res.json({ status: 'joined' })
  }))
  r.post('/rooms/:slug/leave', wrap(async (req, res) => {
    const room = await openRoom(req.params.slug)
    await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, req.user.id])
    res.json({ status: 'left' })
  }))

  // ------------------------------------------------------------------ tags
  r.get('/tags', wrap(async (req, res) => {
    const q = z.string().max(100).optional().parse(req.query.search)
    const rows = (await pool.query(`SELECT id, name, slug, usage_count FROM tags ${q ? 'WHERE lower(name) LIKE $1' : ''} ORDER BY usage_count DESC, name LIMIT 50`, q ? [`%${q.toLowerCase()}%`] : [])).rows
    res.json(rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug, usageCount: t.usage_count })))
  }))

  // ------------------------------------------------------------------ posts
  r.get('/posts', wrap(async (req, res) => {
    const f = z.object({
      room: z.string().max(120).optional(), kind: z.enum(KINDS).optional(), tag: z.string().max(100).optional(),
      author: z.coerce.number().int().positive().optional(), solved: z.enum(['true', 'false']).optional(), mine: z.enum(['true', 'false']).optional(),
      search: z.string().max(100).optional(), sort: z.enum(['new', 'score', 'answers']).default('new'),
    }).parse(req.query)
    const { page, pageSize } = parsePage(req.query)
    const user = req.user
    const where = []
    const params = []
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)) }
    if (!isModerator(user)) add('(p.is_hidden = FALSE OR p.author_id = ?)', user.id)
    const blocked = await blockedRoomIds(pool, user)
    if (blocked.length) { params.push(...blocked); where.push(`(p.room_id IS NULL OR p.room_id NOT IN (${placeholders(blocked, params.length - blocked.length + 1)}))`) }
    if (f.room) add('p.room_id IN (SELECT id FROM rooms WHERE slug = ?)', f.room)
    if (f.kind) add('p.kind = ?', f.kind)
    if (f.tag) add('p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.slug = ?)', f.tag)
    if (f.author) add('(p.author_id = ? AND p.is_anonymous = FALSE)', f.author)
    if (f.solved) where.push(f.solved === 'true' ? 'p.accepted_answer_id IS NOT NULL' : 'p.accepted_answer_id IS NULL')
    if (f.mine === 'true') add('p.author_id = ?', user.id)
    if (f.search) {
      params.push(`%${f.search.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`)
      const n = `$${params.length}`
      where.push(`(lower(p.title) LIKE ${n} OR lower(p.content) LIKE ${n} OR p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE lower(t.name) LIKE ${n}))`)
    }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number((await pool.query(`SELECT COUNT(*) AS n FROM posts p ${W}`, params)).rows[0].n)
    let rows
    if (f.sort === 'new') {
      rows = (await pool.query(`${POST_SELECT} ${W} ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params)).rows
    } else {
      // Score and answer-count need aggregates, so rank the matching posts first, then load only the page.
      const all = (await pool.query(`SELECT p.id, p.is_pinned, p.created_at FROM posts p ${W}`, params)).rows
      const ids = all.map((x) => x.id)
      const key = new Map()
      if (f.sort === 'score') for (const [pid, v] of await voteTotals(pool, 'post_votes', 'post_id', ids, user.id)) key.set(pid, v.upvotes - v.downvotes)
      else for (const [pid, n] of await answerCounts(ids)) key.set(pid, n)
      const ranked = all.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || key.get(b.id) - key.get(a.id) || new Date(b.created_at) - new Date(a.created_at) || b.id - a.id)
      const pageIds = ranked.slice((page - 1) * pageSize, page * pageSize).map((x) => x.id)
      const loaded = pageIds.length ? (await pool.query(`${POST_SELECT} WHERE p.id IN (${placeholders(pageIds)})`, pageIds)).rows : []
      rows = pageIds.map((pid) => loaded.find((x) => x.id === pid))
    }
    res.json({ results: await shapePosts(user, rows), count: total, page, pageSize })
  }))

  r.post('/posts', post, wrap(async (req, res) => {
    const b = postBody.parse(req.body)
    let roomId = null
    if (b.room) {
      const room = (await pool.query('SELECT id FROM rooms WHERE slug = $1', [b.room])).rows[0]
      if (!room) throw new HttpError(400, 'Unknown room')
      if ((await blockedRoomIds(pool, req.user)).includes(room.id)) throw forbidden('You are not a member of this course room')
      roomId = room.id
    }
    const postId = await withTx(pool, async (client) => {
      const p = (await client.query('INSERT INTO posts (room_id, kind, title, content, author_id, is_anonymous) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [roomId, b.kind, b.title, b.content, req.user.id, b.isAnonymous])).rows[0]
      await setTags(client, p.id, b.tags)
      return p.id
    })
    const row = await visiblePost(req.user, postId)
    res.status(201).json((await shapePosts(req.user, [row]))[0])
  }))

  r.get('/posts/:postId', wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    const [shaped] = await shapePosts(req.user, [p])
    const answers = (await pool.query(
      `SELECT a.*, u.name AS author_name, u.role AS author_role FROM answers a JOIN users u ON u.id = a.author_id
       WHERE a.post_id = $1 ${isModerator(req.user) ? '' : 'AND a.is_hidden = FALSE'} ORDER BY a.is_faculty_verified DESC, a.created_at DESC, a.id DESC`, [p.id])).rows
    const aids = answers.map((a) => a.id)
    const votes = await voteTotals(pool, 'answer_votes', 'answer_id', aids, req.user.id)
    const comments = aids.length ? (await pool.query(
      `SELECT c.*, u.name AS author_name, u.role AS author_role FROM comments c JOIN users u ON u.id = c.author_id WHERE c.answer_id IN (${placeholders(aids)}) ORDER BY c.created_at, c.id`, aids)).rows : []
    res.json({
      ...shaped,
      answers: answers.map((a) => {
        const v = votes.get(a.id)
        return {
          id: a.id, content: a.content, author: authorOf(a, req.user), isAccepted: p.accepted_answer_id === a.id, isFacultyVerified: a.is_faculty_verified, isHidden: a.is_hidden,
          upvotes: v.upvotes, downvotes: v.downvotes, score: v.upvotes - v.downvotes, myVote: v.myVote, createdAt: a.created_at,
          comments: comments.filter((c) => c.answer_id === a.id).map((c) => ({ id: c.id, content: c.content, author: authorOf(c, req.user), parentId: c.parent_id, createdAt: c.created_at })),
        }
      }),
    })
  }))

  // Only the author edits; moderators may delete but not rewrite.
  r.patch('/posts/:postId', wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    if (p.author_id !== req.user.id) throw forbidden()
    const b = patchBody.parse(req.body)
    await withTx(pool, async (client) => {
      const sets = ['title', 'content', 'kind'].filter((k) => k in b)
      if (sets.length) await client.query(`UPDATE posts SET ${sets.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [p.id, ...sets.map((k) => b[k])])
      if (b.tags) await setTags(client, p.id, b.tags)
    })
    res.json((await shapePosts(req.user, [await visiblePost(req.user, p.id)]))[0])
  }))

  r.delete('/posts/:postId', wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    if (p.author_id !== req.user.id && !isModerator(req.user)) throw forbidden()
    await withTx(pool, async (client) => {
      await client.query('UPDATE tags SET usage_count = usage_count - 1 WHERE usage_count > 0 AND id IN (SELECT tag_id FROM post_tags WHERE post_id = $1)', [p.id])
      await client.query('DELETE FROM posts WHERE id = $1', [p.id])
    })
    res.status(204).end()
  }))

  async function castVote(user, table, fk, targetId, authorId, value) {
    if (authorId === user.id) throw new HttpError(400, 'You cannot vote on your own content.')
    await withTx(pool, async (client) => {
      const cur = (await client.query(`SELECT value FROM ${table} WHERE ${fk} = $1 AND voter_id = $2`, [targetId, user.id])).rows[0]
      if (cur?.value === value) await client.query(`DELETE FROM ${table} WHERE ${fk} = $1 AND voter_id = $2`, [targetId, user.id])
      else if (cur) await client.query(`UPDATE ${table} SET value = $3 WHERE ${fk} = $1 AND voter_id = $2`, [targetId, user.id, value])
      else await client.query(`INSERT INTO ${table} (${fk}, voter_id, value) VALUES ($1, $2, $3)`, [targetId, user.id, value])
    })
    const v = (await voteTotals(pool, table, fk, [targetId], user.id)).get(targetId)
    return { upvotes: v.upvotes, downvotes: v.downvotes, score: v.upvotes - v.downvotes, myVote: v.myVote }
  }

  r.post('/posts/:postId/vote', vote, wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    const { type } = voteBody.parse(req.body)
    res.json(await castVote(req.user, 'post_votes', 'post_id', p.id, p.author_id, type === 'up' ? 1 : -1))
  }))

  // One view per viewer per hour (Postgres for now; Redis takes over when it is added).
  r.post('/posts/:postId/view', wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    const seen = (await pool.query('SELECT viewed_at FROM post_views WHERE post_id = $1 AND viewer_id = $2', [p.id, req.user.id])).rows[0]
    let count = p.view_count
    if (!seen || Date.now() - new Date(seen.viewed_at).getTime() > 3600 * 1000) {
      await withTx(pool, async (client) => {
        await client.query('DELETE FROM post_views WHERE post_id = $1 AND viewer_id = $2', [p.id, req.user.id])
        await client.query('INSERT INTO post_views (post_id, viewer_id) VALUES ($1, $2)', [p.id, req.user.id])
        count = (await client.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count', [p.id])).rows[0].view_count
      })
    }
    res.json({ viewCount: count })
  }))

  r.post('/posts/:postId/pin', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    const { rows } = await pool.query('UPDATE posts SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING is_pinned', [p.id])
    res.json({ isPinned: rows[0].is_pinned })
  }))

  // Reports hide the target once enough are open; teachers and admins review them.
  async function fileFlag(req, res, table, fk, target) {
    const b = flagBody.parse(req.body)
    if (target.author_id === req.user.id) throw new HttpError(400, 'You cannot flag your own content.')
    const dup = await pool.query(`SELECT 1 FROM ${table} WHERE ${fk} = $1 AND reporter_id = $2`, [target.id, req.user.id])
    if (dup.rows.length) throw new HttpError(409, 'You already flagged this.')
    await pool.query(`INSERT INTO ${table} (${fk}, reporter_id, reason, note) VALUES ($1, $2, $3, $4)`, [target.id, req.user.id, b.reason, b.note])
    const open = Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${fk} = $1 AND status = 'open'`, [target.id])).rows[0].n)
    const hide = open >= config.flagHideThreshold && !target.is_hidden
    if (hide) await pool.query(`UPDATE ${fk === 'post_id' ? 'posts' : 'answers'} SET is_hidden = TRUE WHERE id = $1`, [target.id])
    res.status(201).json({ status: 'flagged', openFlags: open, autoHidden: hide })
  }
  r.post('/posts/:postId/flag', flag, wrap(async (req, res) => fileFlag(req, res, 'post_flags', 'post_id', await visiblePost(req.user, id.parse(req.params.postId)))))

  // ------------------------------------------------------------------ answers
  async function loadAnswer(user, answerId) {
    const a = (await pool.query('SELECT * FROM answers WHERE id = $1', [answerId])).rows[0]
    if (!a || (a.is_hidden && !isModerator(user))) throw notFound('Answer not found')
    const p = await visiblePost(user, a.post_id)
    return { a, p }
  }

  r.post('/posts/:postId/answers', post, wrap(async (req, res) => {
    const p = await visiblePost(req.user, id.parse(req.params.postId))
    if (p.is_hidden) throw new HttpError(400, 'This post is not accepting answers.')
    const b = answerBody.parse(req.body)
    const a = (await pool.query('INSERT INTO answers (post_id, author_id, content) VALUES ($1, $2, $3) RETURNING id', [p.id, req.user.id, b.content])).rows[0]
    res.status(201).json({ id: a.id })
  }))

  r.patch('/answers/:answerId', wrap(async (req, res) => {
    const { a } = await loadAnswer(req.user, id.parse(req.params.answerId))
    if (a.author_id !== req.user.id) throw forbidden()
    const b = answerBody.parse(req.body)
    await pool.query('UPDATE answers SET content = $2, updated_at = now() WHERE id = $1', [a.id, b.content])
    res.json({ id: a.id })
  }))

  r.delete('/answers/:answerId', wrap(async (req, res) => {
    const { a } = await loadAnswer(req.user, id.parse(req.params.answerId))
    if (a.author_id !== req.user.id && !isModerator(req.user)) throw forbidden()
    await pool.query('DELETE FROM answers WHERE id = $1', [a.id])
    res.status(204).end()
  }))

  r.post('/answers/:answerId/vote', vote, wrap(async (req, res) => {
    const { a } = await loadAnswer(req.user, id.parse(req.params.answerId))
    const { type } = voteBody.parse(req.body)
    res.json(await castVote(req.user, 'answer_votes', 'answer_id', a.id, a.author_id, type === 'up' ? 1 : -1))
  }))

  r.post('/answers/:answerId/flag', flag, wrap(async (req, res) => fileFlag(req, res, 'answer_flags', 'answer_id', (await loadAnswer(req.user, id.parse(req.params.answerId))).a)))

  // The question's author or a teacher accepts an answer; accepting the same one again un-accepts it.
  r.post('/answers/:answerId/accept', wrap(async (req, res) => {
    const { a, p } = await loadAnswer(req.user, id.parse(req.params.answerId))
    if (p.author_id !== req.user.id && !isModerator(req.user)) throw forbidden('Only the question author or a teacher can accept an answer.')
    const next = p.accepted_answer_id === a.id ? null : a.id
    await pool.query('UPDATE posts SET accepted_answer_id = $2 WHERE id = $1', [p.id, next])
    res.json({ isAccepted: next === a.id })
  }))

  r.post('/answers/:answerId/verify', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const { a } = await loadAnswer(req.user, id.parse(req.params.answerId))
    const { rows } = await pool.query('UPDATE answers SET is_faculty_verified = NOT is_faculty_verified WHERE id = $1 RETURNING is_faculty_verified', [a.id])
    res.json({ isFacultyVerified: rows[0].is_faculty_verified })
  }))

  // ------------------------------------------------------------------ comments (one reply level)
  r.post('/answers/:answerId/comments', post, wrap(async (req, res) => {
    const { a } = await loadAnswer(req.user, id.parse(req.params.answerId))
    const b = commentBody.parse(req.body)
    if (b.parentId) {
      const parent = (await pool.query('SELECT answer_id, parent_id FROM comments WHERE id = $1', [b.parentId])).rows[0]
      if (!parent || parent.answer_id !== a.id) throw new HttpError(400, 'Parent comment belongs to a different answer.')
      if (parent.parent_id) throw new HttpError(400, 'Replies can only be one level deep.')
    }
    const c = (await pool.query('INSERT INTO comments (answer_id, author_id, parent_id, content) VALUES ($1, $2, $3, $4) RETURNING id', [a.id, req.user.id, b.parentId ?? null, b.content])).rows[0]
    res.status(201).json({ id: c.id })
  }))

  async function ownComment(user, commentId) {
    const c = (await pool.query('SELECT * FROM comments WHERE id = $1', [commentId])).rows[0]
    if (!c) throw notFound('Comment not found')
    await loadAnswer(user, c.answer_id)
    return c
  }
  r.patch('/comments/:commentId', wrap(async (req, res) => {
    const c = await ownComment(req.user, id.parse(req.params.commentId))
    if (c.author_id !== req.user.id) throw forbidden()
    const b = z.object({ content: commentBody.shape.content }).parse(req.body)
    await pool.query('UPDATE comments SET content = $2, updated_at = now() WHERE id = $1', [c.id, b.content])
    res.json({ id: c.id })
  }))
  r.delete('/comments/:commentId', wrap(async (req, res) => {
    const c = await ownComment(req.user, id.parse(req.params.commentId))
    if (c.author_id !== req.user.id && !isModerator(req.user)) throw forbidden()
    await pool.query('DELETE FROM comments WHERE id = $1', [c.id])
    res.status(204).end()
  }))

  // ------------------------------------------------------------------ moderation
  const mod = requireRole('teacher', 'admin')
  const FLAG_TABLES = { post: { table: 'post_flags', fk: 'post_id', target: 'posts' }, answer: { table: 'answer_flags', fk: 'answer_id', target: 'answers' } }

  r.get('/flags', mod, wrap(async (req, res) => {
    const status = z.enum(['open', 'dismissed', 'removed']).optional().parse(req.query.status)
    const W = status ? 'WHERE f.status = $1' : ''
    const p = status ? [status] : []
    const posts = (await pool.query(`SELECT f.*, u.name AS reporter_name, t.title AS text, t.id AS target_id FROM post_flags f JOIN users u ON u.id = f.reporter_id JOIN posts t ON t.id = f.post_id ${W}`, p)).rows
    const answers = (await pool.query(`SELECT f.*, u.name AS reporter_name, t.content AS text, t.id AS target_id, t.post_id FROM answer_flags f JOIN users u ON u.id = f.reporter_id JOIN answers t ON t.id = f.answer_id ${W}`, p)).rows
    const shape = (type) => (f) => ({
      id: f.id, type, reporter: { id: f.reporter_id, name: f.reporter_name }, reason: f.reason, note: f.note, status: f.status, createdAt: f.created_at,
      target: { type, id: f.target_id, text: type === 'post' ? f.text : f.text.slice(0, 140), postId: type === 'post' ? f.target_id : f.post_id },
    })
    res.json([...posts.map(shape('post')), ...answers.map(shape('answer'))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
  }))

  r.post('/flags/:type/:flagId/resolve', mod, wrap(async (req, res) => {
    const cfg = FLAG_TABLES[req.params.type]
    if (!cfg) throw notFound('Unknown flag type')
    const { decision } = z.object({ decision: z.enum(['dismiss', 'remove']) }).parse(req.body)
    const flagRow = (await pool.query(`SELECT * FROM ${cfg.table} WHERE id = $1`, [id.parse(req.params.flagId)])).rows[0]
    if (!flagRow) throw notFound('Flag not found')
    const targetId = flagRow[cfg.fk]
    await withTx(pool, async (client) => {
      if (decision === 'remove') {
        await client.query(`UPDATE ${cfg.target} SET is_hidden = TRUE WHERE id = $1`, [targetId])
        await client.query(`UPDATE ${cfg.table} SET status = 'removed', reviewed_by = $2 WHERE ${cfg.fk} = $1 AND status = 'open'`, [targetId, req.user.id])
      } else {
        await client.query(`UPDATE ${cfg.table} SET status = 'dismissed', reviewed_by = $2 WHERE id = $1`, [flagRow.id, req.user.id])
        // Restore a post or answer that was only auto-hidden, once no open reports remain.
        const open = Number((await client.query(`SELECT COUNT(*) AS n FROM ${cfg.table} WHERE ${cfg.fk} = $1 AND status = 'open'`, [targetId])).rows[0].n)
        const removed = Number((await client.query(`SELECT COUNT(*) AS n FROM ${cfg.table} WHERE ${cfg.fk} = $1 AND status = 'removed'`, [targetId])).rows[0].n)
        if (!open && !removed) await client.query(`UPDATE ${cfg.target} SET is_hidden = FALSE WHERE id = $1`, [targetId])
      }
    })
    res.json({ status: 'resolved', decision })
  }))

  r.get('/stats', mod, wrap(async (_req, res) => {
    const posts = (await pool.query('SELECT id, kind, room_id, accepted_answer_id, created_at FROM posts WHERE is_hidden = FALSE')).rows
    const weekAgo = Date.now() - 7 * 86400000
    const recent = posts.filter((p) => new Date(p.created_at).getTime() >= weekAgo)
    const answered = new Set((await pool.query('SELECT DISTINCT post_id FROM answers')).rows.map((x) => x.post_id))
    const openFlags = Number((await pool.query("SELECT COUNT(*) AS n FROM post_flags WHERE status = 'open'")).rows[0].n) + Number((await pool.query("SELECT COUNT(*) AS n FROM answer_flags WHERE status = 'open'")).rows[0].n)
    const rooms = (await pool.query('SELECT id, slug, name FROM rooms ORDER BY name')).rows
    const perDay = new Map()
    for (const p of recent) { const d = new Date(p.created_at).toISOString().slice(0, 10); perDay.set(d, (perDay.get(d) ?? 0) + 1) }
    res.json({
      postsTotal: posts.length, postsLast7Days: recent.length,
      unanswered: posts.filter((p) => p.kind === 'question' && !answered.has(p.id)).length,
      solved: posts.filter((p) => p.accepted_answer_id != null).length, openFlags,
      byRoom: rooms.map((x) => ({ slug: x.slug, name: x.name, posts: posts.filter((p) => p.room_id === x.id).length })),
      postsPerDay: [...perDay].sort().map(([day, n]) => ({ day, posts: n })),
    })
  }))

  return r
}
