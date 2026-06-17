import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { countUsers, listUsers } from '../services/usersService';
import { countArticles } from '../services/articlesService';
import { listAnnouncements } from '../services/announcementsService';

const router = Router();

// GET /api/dashboard — summary stats for the admin home page
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [users, articles, announcements, recentUsers] = await Promise.all([
      countUsers(),
      countArticles(),
      listAnnouncements(),
      listUsers(5, 0),
    ]);
    res.json({
      stats: {
        users,
        articles,
        announcements: announcements.length,
        announcementsSent: announcements.filter((a) => a.sent_at).length,
      },
      recentUsers,
      recentAnnouncements: announcements.slice(0, 5),
    });
  })
);

export default router;
