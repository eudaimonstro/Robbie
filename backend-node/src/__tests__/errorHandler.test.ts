import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

/** Run the error handler on an error and answer the status and body it sent */
function handle(err: Error): { status: number; body: unknown } {
  const sent = { status: 0, body: undefined as unknown };
  const res = {
    status: vi.fn((code: number) => {
      sent.status = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      sent.body = body;
      return res;
    }),
  };
  errorHandler(err, {} as Request, res as unknown as Response, () => {});
  return sent;
}

/** An error shaped like the http-errors that body-parser passes on */
function httpError(status: number, message: string, expose: boolean): Error {
  return Object.assign(new Error(message), { status, statusCode: status, expose });
}

describe('errorHandler', () => {
  it("answers a library's client error with its status and message", () => {
    expect(handle(httpError(400, 'Unexpected end of JSON input', true))).toEqual({
      status: 400,
      body: { error: { code: 'BAD_REQUEST', message: 'Unexpected end of JSON input' } },
    });
    expect(handle(httpError(413, 'request entity too large', true))).toEqual({
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' } },
    });
    expect(handle(httpError(429, 'Too many', true)).body).toEqual({
      error: { code: 'CLIENT_ERROR', message: 'Too many' },
    });
  });

  it('keeps an error it may not show, or a server error, a 500', () => {
    for (const err of [
      httpError(400, 'Secret detail', false),
      httpError(503, 'Unavailable', true),
      new Error('Boom'),
    ]) {
      expect(handle(err)).toEqual({
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      });
    }
  });
});
