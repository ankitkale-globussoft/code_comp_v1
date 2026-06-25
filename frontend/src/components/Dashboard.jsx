import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard({ user, onCreateRoom, onJoinRoom }) {
  const [roomId, setRoomId] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [topics, setTopics] = useState(['Arrays']);
  const [timeLimit, setTimeLimit] = useState('15');
  const navigate = useNavigate();

  const handleCreate = (e) => {
    e.preventDefault();
    if (topics.length === 0) return alert('Please select at least one topic.');
    onCreateRoom({
      difficulty,
      topics,
      timeLimit: parseInt(timeLimit)
    });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!roomId.trim()) return alert('Please enter a room code.');
    onJoinRoom({
      roomId: roomId.trim().toUpperCase()
    });
  };

  const toggleTopic = (t) => {
    setTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const availableTopics = [
    'Arrays', 'Strings', 'Recursion', 'Linked Lists', 
    'Sorting & Searching', 'Trees & Graphs', 'Dynamic Programming', 'Math'
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', width: '100%' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem', position: 'relative' }}>
        {user?.role === 'ADMIN' && (
          <button 
            onClick={() => navigate('/admin')}
            className="btn btn-secondary" 
            style={{ position: 'absolute', top: 0, right: 0 }}
          >
            ⚙️ Admin Panel
          </button>
        )}
        <h1 className="logo-title" style={{ justifyContent: 'center', fontSize: '3.5rem', marginBottom: '0.5rem' }}>
          Code<span style={{ color: 'var(--indigo)' }}>Arena</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Welcome, <strong style={{ color: '#fff' }}>{user?.username}</strong>! Challenge your friends to real-time coding duels.
        </p>
      </div>

      {/* Forms Grid */}
      <div className="dashboard-grid">
        {/* Create Room Panel */}
        <form className="glass-panel" onSubmit={handleCreate} style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--indigo)' }}>✦</span> Initiate Challenge
          </h2>
          
          <div className="input-group">
            <label className="input-label">DSA Topics (Select multiple)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {availableTopics.map(t => (
                <div 
                  key={t}
                  onClick={() => toggleTopic(t)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: topics.includes(t) ? 'var(--indigo)' : 'rgba(255,255,255,0.05)',
                    color: topics.includes(t) ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${topics.includes(t) ? 'var(--indigo-glow)' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'all 0.2s'
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="difficulty-select">Difficulty</label>
            <select 
              id="difficulty-select"
              className="select-input" 
              value={difficulty} 
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="Easy">🟢 Easy</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Hard">🔴 Hard</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="time-limit-select">Time Limit</label>
            <select 
              id="time-limit-select"
              className="select-input" 
              value={timeLimit} 
              onChange={(e) => setTimeLimit(e.target.value)}
            >
              <option value="5">5 Minutes</option>
              <option value="10">10 Minutes</option>
              <option value="15">15 Minutes</option>
              <option value="30">30 Minutes</option>
              <option value="45">45 Minutes</option>
            </select>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ marginTop: 'auto', padding: '0.9rem' }}
          >
            Generate Lobby Code
          </button>
        </form>

        {/* Join Room Panel */}
        <form className="glass-panel" onSubmit={handleJoin} style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--cyan)' }}>✦</span> Join Duel
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Enter your friend's unique 4-character lobby code to step into the same coding arena.
          </p>

          <div className="input-group">
            <label className="input-label" htmlFor="room-code-input">Lobby Code</label>
            <input
              id="room-code-input"
              type="text"
              className="text-input"
              placeholder="e.g. ABCD"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              maxLength={4}
              style={{ 
                fontSize: '2rem', 
                textAlign: 'center', 
                fontFamily: 'var(--font-mono)', 
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                padding: '0.5rem'
              }}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-emerald" 
            disabled={roomId.length !== 4}
            style={{ marginTop: 'auto', padding: '0.9rem' }}
          >
            Enter Arena
          </button>
        </form>
      </div>

      <div style={{ marginTop: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Powered by Groq Llama 3.3 and PostgreSQL. Sandboxed local execution.
      </div>
    </div>
  );
}
