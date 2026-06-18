import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  ingestPdf,
  listDocuments,
  deleteDocument,
} from '../services/documentsService';

const router = Router();

// Keep the uploaded file in memory (we parse it immediately, never store on disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('يُقبل فقط ملف PDF.'));
    }
  },
});

// GET /api/documents
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listDocuments());
  })
);

// Run multer but translate its errors (wrong type, too large) into clean 400s.
const uploadSingle = (req: any, res: any, next: any) =>
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      const msg =
        err?.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف كبير جدًا (الحد 15 ميغابايت).' : err?.message;
      res.status(400).json({ error: msg || 'فشل رفع الملف.' });
      return;
    }
    next();
  });

// POST /api/documents  (multipart/form-data: file=<pdf>, title=<optional>)
router.post(
  '/',
  uploadSingle,
  asyncHandler(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'لم يتم إرفاق ملف.' });
      return;
    }
    const title =
      (typeof req.body?.title === 'string' && req.body.title.trim()) ||
      file.originalname.replace(/\.pdf$/i, '');

    const result = await ingestPdf(file.buffer, title, file.originalname);
    res.status(201).json(result);
  })
);

// DELETE /api/documents/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await deleteDocument(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
