import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15, // Max 15 auth attempts per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again after 60 seconds.',
  },
});
