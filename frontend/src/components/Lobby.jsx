import React from 'react';

export default function Lobby({ room, socketId, onToggleReady, onStartChallenge }) {
  const me = room.players.find(p => p.id === socketId);
  const isHost = me?.isHost;
  
  // Count how many players are ready
  const readyCount = room.players.filter(p => p.isReady).length;
  const totalPlayers = room.players.length;
  const canStart = room.players.every(p => p.isReady);

  const getDifficultyBadge = (diff) => {
    switch (diff) {
      case 'Easy': return <span className="badge badge-easy">🟢 Easy</span>;
      case 'Hard': return <span className="badge badge-hard">🔴 Hard</span>;
      default: return <span className="badge badge-medium">🟡 Medium</span>;
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '2rem auto', width: '100%' }}>
      {/* Lobby header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="logo-title" style={{ justifyContent: 'center', fontSize: '2.5rem', marginBottom: '0.2rem' }}>
          Room Lobby
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Share the code below to invite your competitor!
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Room Code Display */}
        <div style={{
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px dashed var(--border-active)',
          borderRadius: '12px',
          padding: '1.5rem 1rem'
        }} className="pulse-glow">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '0.5rem' }}>
            LOBBY INVITATION CODE
          </div>
          <div style={{ 
            fontSize: '3rem', 
            fontFamily: 'var(--font-mono)', 
            fontWeight: 800, 
            letterSpacing: '0.2em', 
            color: '#fff',
            textShadow: '0 0 15px var(--indigo-glow)'
          }}>
            {room.id}
          </div>
        </div>

        {/* Challenge Settings */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '1rem',
          background: 'var(--bg-input)',
          padding: '1rem',
          borderRadius: '10px',
          border: '1px solid var(--border-primary)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Topic</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{room.topic}</div>
          </div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-primary)', borderRight: '1px solid var(--border-primary)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Difficulty</div>
            <div style={{ marginTop: '0.25rem' }}>{getDifficultyBadge(room.difficulty)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Duration</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{room.timeLimit} mins</div>
          </div>
        </div>

        {/* Players List */}
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>⚔️ Combatants</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{readyCount}/{totalPlayers} Ready</span>
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {room.players.map((player) => {
              const isMe = player.id === socketId;
              return (
                <div 
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: isMe ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid',
                    borderColor: isMe ? 'var(--border-active)' : 'var(--border-primary)',
                    borderRadius: '10px',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: player.isReady ? 'var(--emerald)' : 'var(--amber)',
                      boxShadow: player.isReady ? '0 0 8px var(--emerald)' : '0 0 8px var(--amber)'
                    }} />
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '1.05rem' }}>
                      {player.username} {isMe && <span style={{ color: 'var(--indigo)', fontSize: '0.85rem' }}>(You)</span>}
                    </span>
                    {player.isHost && (
                      <span style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--indigo)',
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        Host
                      </span>
                    )}
                  </div>

                  <div>
                    {player.isHost ? (
                      <span style={{ color: 'var(--emerald)', fontSize: '0.85rem', fontWeight: 600 }}>🛡️ Host Ready</span>
                    ) : (
                      <span style={{
                        color: player.isReady ? 'var(--emerald)' : 'var(--text-muted)',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}>
                        {player.isReady ? '✓ Ready' : '⏳ Preparing...'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isHost ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button 
                onClick={onStartChallenge}
                className="btn btn-primary"
                disabled={!canStart}
                style={{ padding: '1rem', fontSize: '1.1rem' }}
              >
                🚀 Initiate Coding Duel
              </button>
              {!canStart && (
                <div style={{ color: 'var(--amber)', textAlign: 'center', fontSize: '0.85rem', fontWeight: 500 }}>
                  Waiting for all players to click "Ready" before starting...
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={onToggleReady}
              className={`btn ${me?.isReady ? 'btn-secondary' : 'btn-emerald'}`}
              style={{ padding: '1rem', fontSize: '1.1rem' }}
            >
              {me?.isReady ? '↩ Cancel Ready' : '💪 I am Ready!'}
            </button>
          )}
          
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
            Note: Once the game starts, the AI will build a custom DSA question. This might take 5-10 seconds.
          </div>
        </div>
      </div>
    </div>
  );
}
