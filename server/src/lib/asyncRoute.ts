import type { NextFunction, Request, Response } from 'express';

/**
 * Express 4 drops async rejections on the floor; this forwards them to
 * the central error handler. Wrap every async route.
 */
export function wrap(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}
