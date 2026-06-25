import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_codecomp_jwt_key_9912';

// ── Registration ──
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) return res.status(400).json({ error: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: 'USER'
      }
    });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Login ──
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.password) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Guest Login ──
router.post('/guest', async (req, res) => {
  try {
    let { username } = req.body;
    if (!username) username = `Guest_${Math.floor(Math.random() * 10000)}`;

    // Ensure unique guest username
    let uniqueUsername = username;
    let isUnique = false;
    let suffix = 1;
    while (!isUnique) {
      const existing = await prisma.user.findUnique({ where: { username: uniqueUsername } });
      if (existing) {
        uniqueUsername = `${username}_${suffix++}`;
      } else {
        isUnique = true;
      }
    }

    const guestUser = await prisma.user.create({
      data: {
        username: uniqueUsername,
        password: null, // Guests don't have passwords
        role: 'GUEST'
      }
    });

    const token = jwt.sign({ id: guestUser.id, username: guestUser.username, role: guestUser.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: guestUser.id, username: guestUser.username, role: guestUser.role } });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Verify Token ──
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
