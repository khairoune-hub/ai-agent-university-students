import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth';
import articleRoutes from './articles';
import announcementRoutes from './announcements';
import settingsRoutes from './settings';
import userRoutes from './users';
import dashboardRoutes from './dashboard';

const api = Router();

// Public
api.use('/auth', authRoutes);

// Everything below requires a valid admin token
api.use('/dashboard', requireAuth, dashboardRoutes);
api.use('/articles', requireAuth, articleRoutes);
api.use('/announcements', requireAuth, announcementRoutes);
api.use('/ai-settings', requireAuth, settingsRoutes);
api.use('/users', requireAuth, userRoutes);

export default api;
