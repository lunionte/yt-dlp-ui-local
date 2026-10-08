import type { RequestHandler, ErrorRequestHandler } from 'express';
import { classifyFailure, OperationError } from '../services/error.service.js';
export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const bodyFailure = error as { type?: string };
  const failure = ['entity.parse.failed', 'entity.too.large'].includes(bodyFailure?.type || '')
    ? new OperationError('VALIDATION_ERROR', 'system', 'Corpo HTTP inválido ou maior que 64 KB', bodyFailure.type === 'entity.too.large' ? 413 : 400)
    : classifyFailure(error, 'system');
  res.status(failure.status).json({ error: failure.message, details: failure.details });
};
