import { createWorker } from 'tesseract.js'

// OCR for photos of questions. One English worker is created on first use and kept for a few minutes, because
// starting it is the slow part. Recognition runs one image at a time. The English language data is downloaded
// once (about 10 MB) and cached in api/.ocr-cache.
export function createOcr({ cachePath = '.ocr-cache', idleMs = 5 * 60 * 1000 } = {}) {
  let worker = null, starting = null, timer = null
  let chain = Promise.resolve()

  async function get() {
    if (worker) return worker
    starting ??= createWorker('eng', 1, { cachePath }).then((w) => { worker = w; starting = null; return w }).catch((e) => { starting = null; throw e })
    return starting
  }
  const arm = () => { clearTimeout(timer); timer = setTimeout(async () => { const w = worker; worker = null; await w?.terminate() }, idleMs); timer.unref?.() }

  return {
    recognize(buffer) {
      const job = chain.then(async () => { const { data } = await (await get()).recognize(buffer); arm(); return { text: data.text, confidence: Math.round(data.confidence) } })
      chain = job.catch(() => {})
      return job
    },
    async close() { clearTimeout(timer); const w = worker; worker = null; await w?.terminate() },
  }
}

// Checks the first bytes, so a file named .png that is not an image is refused.
export function imageKind(b) {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (b.length > 2 && b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
  return null
}
