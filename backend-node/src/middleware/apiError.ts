/**
 * An error a route answers with: thrown from a handler or a middleware (Express 5 passes a
 * rejected one on), the error handler sends `{ error: message }` with its status, and its code
 * when it has one: the shape route handlers answer with.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, code?: string) {
    return new ApiError(400, message, code);
  }

  static forbidden(message: string, code?: string) {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message: string, code?: string) {
    return new ApiError(409, message, code);
  }

  static tooManyRequests(message: string) {
    return new ApiError(429, message);
  }
}
