import type { Request, Response } from 'express';
import app from '../server/app.ts';

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
