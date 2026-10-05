import { Request, Response, NextFunction } from 'express';
import { Role } from '../types/domain';

const roleHierarchy: Record<Role, number> = {
  admin: 3,
  mod: 2,
  member: 1,
};

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User authentication required' });
    }

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[minRole];

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: `Forbidden: Requires minimum ${minRole} role`,
      });
    }

    next();
  };
}
