import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqId = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}
