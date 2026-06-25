import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateQuestion, evaluateSubmission, simulateExecution } from './groqService.js';
import { runJavaScript } from './codeRunner.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_codecomp_jwt_key_9912';

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Seed Admin User
async function seedAdmin() {
  const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        role: 'ADMIN'
      }
    });
    console.log('Seeded default admin user (admin / admin123)');
  }
}
seedAdmin();

const httpServer = createServer(app);

// Enable CORS for all origins in development
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Socket.io Auth Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    // For now, allow guests to connect without a token to prevent breaking existing UI,
    // but ideally we should reject.
    socket.user = { username: 'Anonymous_Guest', role: 'GUEST' };
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// In-memory room storage
const rooms = new Map();

/**
 * Helper to generate a 4-letter room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Filter the question object to hide secret test cases
 */
function getPublicQuestion(question) {
  if (!question) return null;
  return {
    title: question.title,
    difficulty: question.difficulty,
    topics: question.topics || [],
    description: question.description,
    constraints: question.constraints,
    inputFormat: question.inputFormat,
    outputFormat: question.outputFormat,
    functionName: question.functionName,
    starterCode: question.starterCode,
    sampleTestCase: question.sampleTestCase,
    // only send test cases that are not secret
    testCases: (question.testCases || []).map((t, idx) => ({
      testCaseIndex: idx,
      input: t.isSecret ? "[HIDDEN]" : t.input,
      output: t.isSecret ? "[HIDDEN]" : t.output,
      isSecret: t.isSecret
    }))
  };
}

/**
 * Get room state for serialization
 */
function getRoomData(room) {
  return {
    id: room.id,
    difficulty: room.difficulty,
    topics: room.topics || [],
    timeLimit: room.timeLimit,
    status: room.status,
    startedAt: room.startedAt,
    question: getPublicQuestion(room.question),
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      isHost: p.isHost,
      isReady: p.isReady,
      charCount: p.charCount,
      status: p.status,
      language: p.language || 'javascript',
      runCount: p.runCount || 0,
      warningCount: p.warningCount || 0,
      cheatReasons: p.cheatReasons || [],
      disqualified: p.disqualified || false,
      runResults: p.runResults ? p.runResults.map(r => ({
        testCaseIndex: r.testCaseIndex,
        isSecret: r.isSecret,
        passed: r.passed,
        // hide detail outputs of secret runs
        input: r.isSecret ? "[HIDDEN]" : r.input,
        expected: r.isSecret ? "[HIDDEN]" : r.expected,
        actual: r.isSecret ? "[HIDDEN]" : r.actual,
        error: r.isSecret ? (r.error ? "Error occurred in secret test" : null) : r.error,
        timeTakenMs: r.timeTakenMs
      })) : null,
      aiEvaluation: p.aiEvaluation,
      score: p.score
    }))
  };
}

// Basic health check
app.get('/health', (req, res) => {
  res.send({ status: 'ok', roomsCount: rooms.size });
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create Room
  socket.on('create-room', ({ difficulty, topics, timeLimit }) => {
    let roomId = generateRoomCode();
    while (rooms.has(roomId)) {
      roomId = generateRoomCode();
    }

    const username = socket.user?.username || 'Host';

    const newRoom = {
      id: roomId,
      difficulty: difficulty || 'Medium',
      topics: topics || ['Arrays'],
      timeLimit: parseInt(timeLimit) || 15,
      status: 'LOBBY', // LOBBY, GENERATING, PLAYING, OVER
      question: null,
      players: [
        {
          id: socket.id,
          username: username || 'Host',
          isHost: true,
          isReady: true, // Host is always ready
          code: '',
          charCount: 0,
          status: 'IDLE', // IDLE, CODING, SUBMITTED, DISQUALIFIED
          runResults: null,
          aiEvaluation: null,
          score: 0,
          runCount: 0,
          warningCount: 0,
          cheatReasons: [],
          disqualified: false
        }
      ],
      startedAt: null
    };

    rooms.set(roomId, newRoom);
    socket.join(roomId);
    
    console.log(`Room created: ${roomId} by ${username}`);
    socket.emit('room-created', { roomId });
    io.to(roomId).emit('room-update', getRoomData(newRoom));
  });

  // Join Room
  socket.on('join-room', ({ roomId }) => {
    const code = roomId.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error-message', { message: 'Room not found.' });
      return;
    }

    if (room.status !== 'LOBBY') {
      socket.emit('error-message', { message: 'Challenge has already started.' });
      return;
    }

    if (room.players.length >= 4) { // Let's limit to 4 players for screen space
      socket.emit('error-message', { message: 'Room is full.' });
      return;
    }

    const username = socket.user?.username || `Player ${room.players.length + 1}`;

    const newPlayer = {
      id: socket.id,
      username: username,
      isHost: false,
      isReady: false,
      code: '',
      charCount: 0,
      status: 'IDLE',
      runResults: null,
      aiEvaluation: null,
      score: 0,
      runCount: 0,
      warningCount: 0,
      cheatReasons: [],
      disqualified: false
    };

    room.players.push(newPlayer);
    socket.join(code);
    
    console.log(`${username} joined Room: ${code}`);
    io.to(code).emit('room-update', getRoomData(room));
  });

  // Toggle Ready State
  socket.on('toggle-ready', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      io.to(roomId).emit('room-update', getRoomData(room));
    }
  });

  // Start Challenge (Host only)
  socket.on('start-challenge', async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const host = room.players.find(p => p.id === socket.id && p.isHost);
    if (!host) {
      socket.emit('error-message', { message: 'Only the host can start the challenge.' });
      return;
    }

    // Verify everyone is ready
    const allReady = room.players.every(p => p.isReady);
    if (!allReady) {
      socket.emit('error-message', { message: 'All players must be ready to start.' });
      return;
    }

    room.status = 'GENERATING';
    io.to(roomId).emit('room-update', getRoomData(room));
    console.log(`Generating DSA question for room ${roomId}...`);

    try {
      let question = null;

      // Check DB Cache for existing question
      // Using Prisma to find a question that matches difficulty and has the exact same topics
      const cachedQuestions = await prisma.question.findMany({
        where: { difficulty: room.difficulty }
      });
      
      const exactMatch = cachedQuestions.find(q => 
        q.topics.length === room.topics.length && 
        q.topics.every(t => room.topics.includes(t))
      );

      if (exactMatch) {
        console.log(`Using cached question from DB for room ${roomId}`);
        question = exactMatch;
      } else {
        console.log(`Generating new DSA question for room ${roomId}...`);
        question = await generateQuestion(room.difficulty, room.topics);
        
        // Save to DB
        question = await prisma.question.create({
          data: {
            title: question.title,
            difficulty: question.difficulty,
            topics: question.topics || room.topics,
            description: question.description,
            constraints: question.constraints || [],
            inputFormat: question.inputFormat || '',
            outputFormat: question.outputFormat || '',
            functionName: question.functionName,
            starterCode: question.starterCode || {},
            sampleTestCase: question.sampleTestCase || {},
            testCases: question.testCases || [],
            solution: question.solution || ''
          }
        });
      }
      
      room.question = question;
      room.status = 'PLAYING';
      room.startedAt = Date.now();

      // Setup initial player states
      room.players.forEach(p => {
        p.code = question.starterCode?.javascript || '';
        p.language = 'javascript';
        p.status = 'CODING';
        p.runResults = null;
        p.aiEvaluation = null;
        p.score = 0;
      });

      console.log(`Challenge started in room ${roomId}: ${question.title}`);
      io.to(roomId).emit('room-update', getRoomData(room));

      // Schedule auto-termination when timer expires
      const timeLimitMs = room.timeLimit * 60 * 1000;
      setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (currentRoom && currentRoom.status === 'PLAYING') {
          handleGameEnd(roomId, "Timer expired!");
        }
      }, timeLimitMs + 5000); // add a small grace buffer

    } catch (err) {
      console.error(`Failed to start challenge for room ${roomId}:`, err);
      room.status = 'LOBBY';
      io.to(roomId).emit('error-message', { message: 'AI Question Generation failed. Please try again.' });
      io.to(roomId).emit('room-update', getRoomData(room));
    }
  });

  // Sync code and character count
  socket.on('code-sync', ({ roomId, code, charCount, language }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && player.status === 'CODING') {
      player.code = code;
      player.charCount = charCount;
      if (language) player.language = language;
      // Broadcast to others in room (excluding sender to save bandwidth)
      socket.to(roomId).emit('opponent-typing', {
        playerId: socket.id,
        charCount
      });
    }
  });

  // Anti-cheat warning handler
  socket.on('cheat-warning', ({ roomId, reason }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.disqualified || player.status === 'SUBMITTED') return;

    player.warningCount = (player.warningCount || 0) + 1;
    player.cheatReasons = player.cheatReasons || [];
    player.cheatReasons.push({ reason, timestamp: Date.now() });

    console.log(`⚠ CHEAT WARNING for ${player.username} in room ${roomId}: ${reason} (${player.warningCount}/3)`);

    // Broadcast cheat event to ALL players in the room
    io.to(roomId).emit('cheat-event', {
      playerId: socket.id,
      username: player.username,
      reason,
      warningCount: player.warningCount
    });

    // After 3 warnings, disqualify the player
    if (player.warningCount >= 3) {
      player.disqualified = true;
      player.status = 'DISQUALIFIED';
      console.log(`🚫 DISQUALIFIED: ${player.username} in room ${roomId} (3 cheat warnings)`);

      io.to(roomId).emit('player-disqualified', {
        playerId: socket.id,
        username: player.username,
        warningCount: player.warningCount,
        reasons: player.cheatReasons
      });

      // Force submit their code with a heavy penalty
      player.score = 0;
      player.aiEvaluation = {
        isCorrect: false,
        score: 0,
        timeComplexity: 'N/A',
        spaceComplexity: 'N/A',
        codeQualityScore: 0,
        qualityFeedback: 'Player was disqualified for cheating.',
        review: '🚫 **Disqualified** — This player was removed from the competition due to repeated cheating violations.',
        modelSolution: ''
      };

      io.to(roomId).emit('room-update', getRoomData(room));

      // Check if all remaining non-disqualified players have submitted
      const activePlayers = room.players.filter(p => !p.disqualified);
      const allSubmitted = activePlayers.every(p => p.status === 'SUBMITTED');
      if (allSubmitted && activePlayers.length > 0) {
        handleGameEnd(roomId, 'All active players submitted.');
      }
    } else {
      io.to(roomId).emit('room-update', getRoomData(room));
    }
  });

  // Run code against public test cases
  socket.on('run-code', async ({ roomId, code, language }) => {
    const room = rooms.get(roomId);
    if (!room || !room.question) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.disqualified) return;

    // Increment run count
    player.runCount = (player.runCount || 0) + 1;

    console.log(`Running code for player ${player.username} in room ${roomId} in ${language} (run #${player.runCount})...`);
    
    let results;
    if (language === 'javascript') {
      results = runJavaScript(code, room.question.functionName, room.question.testCases);
    } else {
      try {
        results = await simulateExecution(room.question, code, language);
      } catch (err) {
        console.error(`AI simulation failed for ${player.username}:`, err);
        results = room.question.testCases.map((tc, idx) => ({
          testCaseIndex: idx,
          isSecret: tc.isSecret,
          passed: false,
          input: tc.isSecret ? "[HIDDEN]" : tc.input,
          expected: tc.isSecret ? "[HIDDEN]" : tc.output,
          actual: null,
          error: "Code execution simulator is temporarily unavailable. Please try again.",
          logs: [],
          timeTakenMs: 0
        }));
      }
    }
    player.runResults = results;
    player.code = code;
    player.language = language;

    // Send results back to the runner
    socket.emit('run-code-result', results);

    // Broadcast progress update to room (e.g. how many test cases passed)
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    io.to(roomId).emit('opponent-run-update', {
      playerId: socket.id,
      passedCount,
      totalCount
    });
  });

  // Submit code for final AI review and scoring
  socket.on('submit-code', async ({ roomId, code, language }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.status === 'SUBMITTED' || player.disqualified) return;

    player.code = code;
    player.language = language;
    player.status = 'SUBMITTED';
    
    console.log(`Player ${player.username} submitted code in room ${roomId} in ${language}. Running final evaluation...`);

    // Run test cases locally or via AI first
    let runResults;
    if (language === 'javascript') {
      runResults = runJavaScript(code, room.question.functionName, room.question.testCases);
    } else {
      try {
        runResults = await simulateExecution(room.question, code, language);
      } catch (err) {
        console.error(`AI simulation failed on submission for ${player.username}:`, err);
        runResults = room.question.testCases.map((tc, idx) => ({
          testCaseIndex: idx,
          isSecret: tc.isSecret,
          passed: false,
          error: "Simulator failed during submission."
        }));
      }
    }
    player.runResults = runResults;

    const totalCases = runResults.length;
    const passedCases = runResults.filter(r => r.passed).length;
    const testScore = Math.round((passedCases / totalCases) * 100);

    // Broadcast to room that player submitted
    io.to(roomId).emit('room-update', getRoomData(room));

    try {
      // Call Groq AI for detailed evaluation
      const aiEvaluation = await evaluateSubmission(room.question, code, language, runResults);
      
      player.aiEvaluation = aiEvaluation;
      
      // Calculate final combined score: 60% test case correctness, 40% AI evaluation score
      player.score = Math.round((testScore * 0.6) + (aiEvaluation.score * 0.4));
      
      console.log(`AI evaluation finished for ${player.username}. Score: ${player.score}`);

    } catch (err) {
      console.error(`AI evaluation failed for ${player.username}:`, err);
      // Fallback evaluation if AI fails
      player.aiEvaluation = {
        isCorrect: passedCases === totalCases,
        score: testScore,
        timeComplexity: "Unknown (AI failed)",
        spaceComplexity: "Unknown (AI failed)",
        review: "AI code review is currently unavailable, but your code was executed against test cases.\n\n*Error details:* Could not connect to AI evaluator.",
        modelSolution: "// AI solution unavailable. Refer to your own solution."
      };
      player.score = testScore;
    }

    // Check if everyone has submitted
    const activePlayers = room.players.filter(p => !p.disqualified);
    const allSubmitted = activePlayers.every(p => p.status === 'SUBMITTED');
    if (allSubmitted) {
      handleGameEnd(roomId, "All players submitted!");
    } else {
      io.to(roomId).emit('room-update', getRoomData(room));
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Find room the player was in
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        console.log(`${player.username} left room ${roomId} due to disconnect`);
        
        // Remove player
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          // Delete room if empty
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted because it is empty.`);
        } else {
          // Re-assign host if host left
          if (player.isHost) {
            room.players[0].isHost = true;
            room.players[0].isReady = true; // hosts are always ready
          }

          // If playing and now only 1 player remains, or everyone left has submitted, we might end the game
          if (room.status === 'PLAYING') {
            const allRemainingSubmitted = room.players.every(p => p.status === 'SUBMITTED');
            if (allRemainingSubmitted) {
              handleGameEnd(roomId, "Opponent disconnected, game ending.");
            }
          }

          io.to(roomId).emit('room-update', getRoomData(room));
        }
        break;
      }
    }
  });
});

/**
 * Handle ending the game, evaluating winner and broadcasting results
 */
function handleGameEnd(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room || room.status === 'OVER') return;

  console.log(`Ending game in room ${roomId}. Reason: ${reason}`);
  room.status = 'OVER';

  // If players haven't submitted, force submit their current code
  const submitPromises = room.players.map(async (player) => {
    if (player.status !== 'SUBMITTED' && !player.disqualified) {
      player.status = 'SUBMITTED';
      const lang = player.language || 'javascript';
      
      let runResults;
      if (lang === 'javascript') {
        runResults = runJavaScript(player.code || '', room.question.functionName, room.question.testCases);
      } else {
        try {
          runResults = await simulateExecution(room.question, player.code || '', lang);
        } catch (err) {
          runResults = room.question.testCases.map((tc, idx) => ({
            testCaseIndex: idx,
            isSecret: tc.isSecret,
            passed: false,
            error: "Forced submit simulator error."
          }));
        }
      }
      player.runResults = runResults;

      const totalCases = runResults.length;
      const passedCases = runResults.filter(r => r.passed).length;
      const testScore = Math.round((passedCases / totalCases) * 100);

      try {
        const aiEvaluation = await evaluateSubmission(room.question, player.code || '', lang, runResults);
        player.aiEvaluation = aiEvaluation;
        player.score = Math.round((testScore * 0.6) + (aiEvaluation.score * 0.4));
      } catch (err) {
        player.aiEvaluation = {
          isCorrect: passedCases === totalCases,
          score: testScore,
          timeComplexity: "Unknown (Timeout/Error)",
          spaceComplexity: "Unknown (Timeout/Error)",
          review: "Code was automatically evaluated on timer expiration.",
          modelSolution: ""
        };
        player.score = testScore;
      }
    }
  });

  // Wait for all evaluations to complete, then broadcast final state
  Promise.all(submitPromises).then(() => {
    io.to(roomId).emit('room-update', getRoomData(room));
    io.to(roomId).emit('game-over', { reason });
  });
}

// Start Server
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
