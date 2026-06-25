import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_codecomp_jwt_key_9912';

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Apply to all routes in this router
router.use(verifyAdmin);

// ── Settings (GET / POST) ──
router.get('/settings', async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = s.value);
    res.json(settingsMap);
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'Key and value required' });

    const updated = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });

    res.json({ message: 'Setting updated successfully', setting: updated });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Users List ──
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Reset Password ──
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'User ID and new password required' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
