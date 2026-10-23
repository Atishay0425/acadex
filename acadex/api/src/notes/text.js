// Smart Notes text engine. Plain JavaScript, no model and no network: extractive summary, practice
// questions, fill-in-the-blank MCQs and passage search. Everything is deterministic for the same text.

const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours may might shall must one two use used using like many much within without often usually typically thus therefore however uses handles builds removes happens extends fixes stops gives shows makes takes called known based allows helps becomes requires provides contains includes`.split(/\s+/))

export const sentencesOf = (text) =>
  text.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^[\s\-*•\d.)]+/, '').trim()).filter((s) => s.split(/\s+/).length >= 5 && s.length <= 500)

// Light stemming so "trees" matches "tree" and "pruning" matches "prune"-ish forms.
export const stem = (w) => (w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('ed') ? w.slice(0, -2) : w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
export const tokens = (text) => (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w)).map(stem)

function termFrequencies(text) {
  const tf = new Map()
  for (const t of tokens(text)) tf.set(t, (tf.get(t) || 0) + 1)
  return tf
}

export function summarize(text, count = 5) {
  const sents = sentencesOf(text)
  if (sents.length <= count) return sents.join(' ')
  const tf = termFrequencies(text)
  const scored = sents.map((s, i) => {
    const toks = tokens(s)
    const uniq = new Set(toks)
    const score = [...uniq].reduce((a, t) => a + tf.get(t), 0) / Math.sqrt(toks.length || 1) + (i === 0 ? 2 : 0)
    return { s, i, score }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.i - b.i).map((x) => x.s).join(' ')
}

// The most repeated meaningful words, shown as they appear in the notes.
export function keyTerms(text, count = 10) {
  const tf = new Map(); const shown = new Map()
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []) {
    if (STOP.has(w)) continue
    const k = stem(w)
    tf.set(k, (tf.get(k) || 0) + 1)
    if (!shown.has(k) || w.length < shown.get(k).length) shown.set(k, w)
  }
  return [...tf].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, count).map(([k]) => shown.get(k))
}

const SUBJECT_STOP = /^(it|this|that|these|those|they|there|which|he|she|we|you|what|who|here|one|each)$/i
export function importantQuestions(text, max = 6) {
  const out = []
  const seen = new Set()
  const add = (q) => { const k = q.toLowerCase(); if (!seen.has(k) && out.length < max) { seen.add(k); out.push(q) } }
  const sents = sentencesOf(text)
  let flip = 0
  for (const s of sents) {
    const m = s.match(/^([A-Za-z][A-Za-z0-9\- ]{2,40}?) (?:is|are|means|refers to|is defined as) /)
    if (m && m[1].split(' ').length <= 5 && !SUBJECT_STOP.test(m[1].split(' ')[0])) add(flip++ % 2 ? `What is ${m[1]}?` : `Define ${m[1]}.`)
  }
  for (const s of sents) {
    if (/\b(differs?|unlike|whereas|compared (?:to|with)|versus|vs\.?)\b/i.test(s)) add(`Explain how this differs: "${s.length > 110 ? `${s.slice(0, 107)}...` : s}"`)
  }
  for (const t of keyTerms(text, 8)) add(`Explain ${t} with an example.`)
  return out
}

function rngFrom(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => { h |= 0; h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// Fill-in-the-blank questions: blank one key term in a sentence, offer it with three other key terms.
export function mcqs(text, count = 5) {
  const terms = keyTerms(text, 12)
  if (terms.length < 4) return []
  const rand = rngFrom(text)
  const out = []; const used = new Set()
  for (const s of sentencesOf(text)) {
    if (out.length >= count) break
    if (s.length < 40 || s.length > 260) continue
    const term = terms.find((t) => !used.has(t) && new RegExp(`\\b${t}\\b`, 'i').test(s) && (s.match(new RegExp(`\\b${t}\\b`, 'gi')) || []).length === 1)
    if (!term) continue
    used.add(term)
    const distractors = terms.filter((t) => t !== term).sort(() => rand() - 0.5).slice(0, 3)
    const options = [term, ...distractors].sort(() => rand() - 0.5)
    out.push({ q: s.replace(new RegExp(`\\b${term}\\b`, 'i'), '_____'), options, answer: options.indexOf(term) })
  }
  return out
}

export function analyse(text) {
  return { summary: summarize(text), keyTerms: keyTerms(text), questions: importantQuestions(text), mcqs: mcqs(text) }
}

// Passage search over several notes: two-sentence windows ranked by term frequency weighted by rarity.
export function search(question, notes, top = 3) {
  const q = [...new Set(tokens(question))]
  if (!q.length) return []
  const passages = []
  for (const n of notes) {
    const sents = sentencesOf(n.content)
    for (let i = 0; i < sents.length; i++) passages.push({ noteId: n.id, title: n.title, passage: sents.slice(i, i + 2).join(' '), toks: tokens(sents.slice(i, i + 2).join(' ')) })
  }
  const df = new Map(q.map((t) => [t, passages.filter((p) => p.toks.includes(t)).length]))
  const ranked = passages.map((p) => ({ noteId: p.noteId, title: p.title, passage: p.passage, score: q.reduce((a, t) => {
    const tf = p.toks.filter((x) => x === t).length
    return a + (tf ? (1 + Math.log(tf)) * Math.log(1 + passages.length / df.get(t)) : 0)
  }, 0) })).filter((p) => p.score > 0).sort((a, b) => b.score - a.score)
  const picked = []
  for (const p of ranked) { if (picked.length >= top) break; if (!picked.some((x) => x.noteId === p.noteId && (x.passage.includes(p.passage) || p.passage.includes(x.passage)))) picked.push({ ...p, score: Math.round(p.score * 100) / 100 }) }
  return picked
}
