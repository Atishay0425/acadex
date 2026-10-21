export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}
export const notFound = (what = 'Not found') => new HttpError(404, what)
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg)
