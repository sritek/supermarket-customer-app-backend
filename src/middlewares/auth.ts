import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

interface JwtPayload {
  userId: string;
}

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as JwtPayload;
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    req.user = {
      _id: user._id.toString(),
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    next();
  };
};

