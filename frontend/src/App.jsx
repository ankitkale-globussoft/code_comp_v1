import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import socket from './socket';
import Dashboard from './components/Dashboard';
import Lobby from './components/Lobby';
import Arena from './components/Arena';
import Results from './components/Results';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';

function MainApp({ user, onLogout }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [socketId, setSocketId] = useState('');
  const [opponentProgress, setOpponentProgress] = useState({});

  useEffect(() => {
    // Connect to socket with JWT auth token
    const token = localStorage.getItem('code_comp_token');
    socket.auth = { token };
    socket.connect();

    if (socket.connected) {
      setSocketId(socket.id);
    }

    const onConnect = () => {
      setSocketId(socket.id);
      setError('');
    };

    const onRoomUpdate = (updatedRoom) => {
      setRoom(updatedRoom);
    };

    const onOpponentTyping = ({ playerId, charCount }) => {
      setOpponentProgress(prev => ({ ...prev, [playerId]: { charCount } }));
    };

    const onErrorMessage = ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 5000);
    };

    socket.on('connect', onConnect);
    socket.on('room-update', onRoomUpdate);
    socket.on('opponent-typing', onOpponentTyping);
    socket.on('error-message', onErrorMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('room-update', onRoomUpdate);
      socket.off('opponent-typing', onOpponentTyping);
      socket.off('error-message', onErrorMessage);
    };
  }, []);

  const handleCreateRoom = (settings) => { setError(''); socket.emit('create-room', settings); };
  const handleJoinRoom = (details) => { setError(''); socket.emit('join-room', details); };
  const handleToggleReady = () => { if (room) socket.emit('toggle-ready', { roomId: room.id }); };
  const handleStartChallenge = () => { if (room) { setError(''); socket.emit('start-challenge', { roomId: room.id }); } };
  const handleRunCode = (code, language) => { if (room) socket.emit('run-code', { roomId: room.id, code, language }); };
  const handleSubmitCode = (code, language) => { if (room) socket.emit('submit-code', { roomId: room.id, code, language }); };
  const handleRestart = () => { setRoom(null); setOpponentProgress({}); setError(''); };

  const isArena = room?.status === 'PLAYING';

  return (
    <div className={isArena ? '' : 'app-container'} style={isArena ? { width:'100%', height:'100vh', overflow:'hidden' } : {}}>
      {/* Header bar when logged in and not in arena */}
      {!isArena && (
        <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Logged in as <strong style={{color: '#fff'}}>{user.username}</strong></span>
          <button onClick={onLogout} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>Logout</button>
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--crimson)', borderRadius: '10px',
          padding: '1rem', color: '#fca5a5', marginBottom: '2rem', textAlign: 'center', fontWeight: 500, width: '100%'
        }}>
          ⚠️ {error}
        </div>
      )}

      {!room ? (
        <Dashboard user={user} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
      ) : room.status === 'LOBBY' ? (
        <Lobby room={room} socketId={socketId} onToggleReady={handleToggleReady} onStartChallenge={handleStartChallenge} />
      ) : room.status === 'GENERATING' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', gap: '1.5rem', maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid var(--border-primary)', borderTopColor: 'var(--indigo)', animation: 'spin 1s linear infinite' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>🤖 AI is Crafting Your Duel...</h2>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : room.status === 'PLAYING' ? (
        <Arena room={room} socketId={socketId} onRunCode={handleRunCode} onSubmitCode={handleSubmitCode} opponentProgress={opponentProgress} socket={socket} />
      ) : room.status === 'OVER' ? (
        <Results room={room} socketId={socketId} onRestart={handleRestart} />
      ) : null}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('code_comp_token');
      if (token) {
        try {
          const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          if (res.ok) setUser(data.user);
        } catch (err) {
          console.error(err);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('code_comp_token');
    setUser(null);
    socket.disconnect();
  };

  if (loading) return null;

  return (
    <Router>
      <Routes>
        <Route path="/auth" element={!user ? <Auth onLogin={setUser} /> : <Navigate to="/" />} />
        <Route path="/admin" element={<AdminPanel user={user} onLogout={handleLogout} />} />
        <Route path="/" element={user ? <MainApp user={user} onLogout={handleLogout} /> : <Navigate to="/auth" />} />
      </Routes>
    </Router>
  );
}
