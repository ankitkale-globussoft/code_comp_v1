import React, { useState } from 'react';

export default function Results({ room, socketId, onRestart }) {
  const [activeTab, setActiveTab] = useState('reviews'); // 'reviews' | 'comparison' | 'solution'
  const [selectedPlayerReview, setSelectedPlayerReview] = useState(room.players[0]?.id || '');

  // Calculate winner
  // Winner is the player with the highest score. If scores are equal, it's a tie!
  let winnerText = "It's a Tie!";
  let winnerId = null;
  let maxScore = -1;
  let isTie = true;

  // Disqualified players can't win
  const activePlayers = room.players.filter(p => !p.disqualified);

  activePlayers.forEach(p => {
    if (p.score > maxScore) {
      maxScore = p.score;
      winnerId = p.id;
      isTie = false;
    } else if (p.score === maxScore) {
      isTie = true;
    }
  });

  if (!isTie && winnerId) {
    const winner = room.players.find(p => p.id === winnerId);
    winnerText = `🏆 ${winner?.username} Wins!`;
  } else if (isTie) {
    winnerText = "🤝 It's a Dead Heat Tie!";
  }

  const selectedReviewPlayer = room.players.find(p => p.id === selectedPlayerReview) || room.players[0];

  // Helper to render Markdown inside reviews
  const renderMarkdownText = (text) => {
    if (!text) return '';
    // A simple parser for AI reviews
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>')
      .split('\n')
      .map(line => {
        if (line.startsWith('###')) return `<h3>${line.replace('###', '')}</h3>`;
        if (line.startsWith('##')) return `<h2>${line.replace('##', '')}</h2>`;
        if (line.startsWith('#')) return `<h1>${line.replace('#', '')}</h1>`;
        if (line.startsWith('<ul>') || line.startsWith('<li>') || line.startsWith('</ul>')) return line;
        return line ? `<p>${line}</p>` : '';
      })
      .join('');
    return { __html: html };
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '2rem auto', width: '100%', paddingBottom: '4rem' }}>
      {/* Title & Verdict */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="logo-title" style={{ justifyContent: 'center', fontSize: '3rem', marginBottom: '0.5rem' }}>
          Battle Summary
        </h1>
        <div style={{
          display: 'inline-block',
          fontSize: '2rem',
          fontWeight: 800,
          background: 'linear-gradient(135deg, var(--indigo), var(--cyan))',
          color: '#fff',
          padding: '0.5rem 2rem',
          borderRadius: '16px',
          boxShadow: '0 0 30px var(--indigo-glow)',
          border: '1px solid var(--border-active)',
          marginTop: '1rem'
        }} className="pulse-glow">
          {winnerText}
        </div>
      </div>

      {/* Leaderboard Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: room.players.length === 2 ? '1fr 1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
        marginBottom: '3rem'
      }}>
        {room.players.map((player) => {
          const isWinner = !isTie && player.id === winnerId;
          const isDQ = player.disqualified || player.status === 'DISQUALIFIED';
          const passedCases = player.runResults ? player.runResults.filter(r => r.passed).length : 0;
          const totalCases = player.runResults ? player.runResults.length : 0;
          const qualityScore = player.aiEvaluation?.codeQualityScore;

          return (
            <div
              key={player.id}
              className="glass-panel"
              style={{
                padding: '1.5rem',
                border: isDQ ? '2px solid var(--crimson)' : isWinner ? '2px solid var(--emerald)' : '1px solid var(--border-primary)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: isDQ ? 'rgba(239,68,68,0.04)' : isWinner ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-card)',
                opacity: isDQ ? 0.75 : 1
              }}
            >
              {isWinner && !isDQ && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '15px',
                  background: 'var(--emerald)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '10px',
                  textTransform: 'uppercase'
                }}>
                  Winner
                </div>
              )}

              {isDQ && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '15px',
                  background: 'var(--crimson)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '10px',
                  textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: '0.25rem'
                }}>
                  🚫 Disqualified
                </div>
              )}

              {/* Player Header */}
              <div>
                <h3 style={{ fontSize: '1.25rem', color: isDQ ? '#fca5a5' : '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {player.username}
                  {isDQ && <span style={{ fontSize: '0.75rem', color: 'var(--crimson)' }}>🚫</span>}
                </h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span>{player.isHost ? 'Host' : 'Challenger'}</span>
                  <span>•</span>
                  <span style={{ color: 'var(--cyan)', textTransform: 'capitalize', fontWeight: 600 }}>{player.language || 'JavaScript'}</span>
                </span>
              </div>

              {/* Big Score */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{
                  fontSize: '3.5rem',
                  fontWeight: 800,
                  color: isDQ ? 'var(--crimson)' : isWinner ? 'var(--emerald)' : 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                  lineHeight: 1
                }}>
                  {player.score}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 600 }}>pts</span>
              </div>

              {/* Score breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border-primary)', paddingTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🧪 Test Cases:</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{passedCases}/{totalCases} passed</span>
                </div>

                {/* Code Quality Score */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>✨ Code Quality:</span>
                  <span style={{
                    fontWeight: 600, fontFamily: 'var(--font-mono)',
                    color: isDQ ? 'var(--crimson)' : qualityScore >= 70 ? 'var(--emerald)' : qualityScore >= 40 ? 'var(--amber)' : 'var(--crimson)'
                  }}>
                    {isDQ ? 'N/A' : qualityScore != null ? `${qualityScore}/100` : 'N/A'}
                  </span>
                </div>

                {/* Run Count */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🔁 Run Attempts:</span>
                  <span style={{ fontWeight: 600, color: 'var(--indigo)', fontFamily: 'var(--font-mono)' }}>
                    {player.runCount || 0}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>⏱ Complexity:</span>
                  <span style={{ fontWeight: 600, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    {player.aiEvaluation?.timeComplexity || 'N/A'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>💾 Auxiliary Space:</span>
                  <span style={{ fontWeight: 600, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    {player.aiEvaluation?.spaceComplexity || 'N/A'}
                  </span>
                </div>

                {/* Cheat Warnings */}
                {(player.warningCount > 0 || isDQ) && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '0.35rem 0.5rem', borderRadius: '6px', marginTop: '0.25rem',
                    background: isDQ ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${isDQ ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.2)'}`
                  }}>
                    <span style={{ color: isDQ ? '#fca5a5' : 'var(--amber)' }}>
                      {isDQ ? '🚫 Status:' : '⚠ Warnings:'}
                    </span>
                    <span style={{
                      fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: isDQ ? '#ef4444' : 'var(--amber)'
                    }}>
                      {isDQ ? 'DISQUALIFIED' : `${player.warningCount}/3`}
                    </span>
                  </div>
                )}
              </div>

              {/* Quality feedback snippet */}
              {player.aiEvaluation?.qualityFeedback && !isDQ && (
                <div style={{
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.15)',
                  borderRadius: '8px', padding: '0.6rem 0.75rem',
                  fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                  fontStyle: 'italic'
                }}>
                  <span style={{ color: 'var(--indigo)', fontWeight: 700, fontStyle: 'normal' }}>AI Quality Note: </span>
                  {player.aiEvaluation.qualityFeedback}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs Selector */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-primary)',
        marginBottom: '1.5rem',
        gap: '1.5rem'
      }}>
        <button
          onClick={() => setActiveTab('reviews')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'reviews' ? 'var(--indigo)' : 'var(--text-secondary)',
            fontSize: '1.1rem',
            fontWeight: 600,
            cursor: 'pointer',
            paddingBottom: '0.75rem',
            borderBottom: activeTab === 'reviews' ? '2px solid var(--indigo)' : 'none'
          }}
        >
          🔍 Detailed AI Reviews
        </button>
        <button
          onClick={() => setActiveTab('comparison')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'comparison' ? 'var(--indigo)' : 'var(--text-secondary)',
            fontSize: '1.1rem',
            fontWeight: 600,
            cursor: 'pointer',
            paddingBottom: '0.75rem',
            borderBottom: activeTab === 'comparison' ? '2px solid var(--indigo)' : 'none'
          }}
        >
          ⚔️ Code Comparison
        </button>
        <button
          onClick={() => setActiveTab('solution')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'solution' ? 'var(--indigo)' : 'var(--text-secondary)',
            fontSize: '1.1rem',
            fontWeight: 600,
            cursor: 'pointer',
            paddingBottom: '0.75rem',
            borderBottom: activeTab === 'solution' ? '2px solid var(--indigo)' : 'none'
          }}
        >
          💡 Optimal Model Solution
        </button>
      </div>

      {/* Tab Content */}
      <div className="glass-panel" style={{ padding: '2rem', minHeight: '300px' }}>
        
        {/* TAB 1: AI REVIEWS */}
        {activeTab === 'reviews' && (
          <div>
            {/* Player Selector for Review */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {room.players.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayerReview(p.id)}
                  className={`btn ${selectedPlayerReview === p.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {p.username}'s Review
                  {(p.disqualified || p.status === 'DISQUALIFIED') && <span style={{ color: '#ef4444' }}>🚫</span>}
                </button>
              ))}
            </div>

            {selectedReviewPlayer?.aiEvaluation ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Meta details */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  gap: '1rem',
                  background: 'var(--bg-input)',
                  padding: '1rem',
                  borderRadius: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>AI Score</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--emerald)' }}>
                      {selectedReviewPlayer.aiEvaluation.score}/100
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Code Quality</div>
                    <div style={{
                      fontSize: '1.25rem', fontWeight: 700,
                      color: selectedReviewPlayer.aiEvaluation.codeQualityScore >= 70 ? 'var(--emerald)' :
                             selectedReviewPlayer.aiEvaluation.codeQualityScore >= 40 ? 'var(--amber)' : 'var(--crimson)'
                    }}>
                      {selectedReviewPlayer.aiEvaluation.codeQualityScore != null
                        ? `${selectedReviewPlayer.aiEvaluation.codeQualityScore}/100`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verdict</div>
                    <div style={{
                      fontSize: '1.25rem', fontWeight: 700,
                      color: (selectedReviewPlayer.disqualified) ? 'var(--crimson)' :
                             selectedReviewPlayer.aiEvaluation.isCorrect ? 'var(--emerald)' : 'var(--crimson)'
                    }}>
                      {selectedReviewPlayer.disqualified ? '🚫 DQ' :
                       selectedReviewPlayer.aiEvaluation.isCorrect ? '✓ Correct' : '❌ Has Bugs'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Complexity</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                      T: {selectedReviewPlayer.aiEvaluation.timeComplexity} | S: {selectedReviewPlayer.aiEvaluation.spaceComplexity}
                    </div>
                  </div>
                </div>

                {/* Quality Feedback Banner */}
                {selectedReviewPlayer.aiEvaluation.qualityFeedback && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(6,182,212,0.06))',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '10px', padding: '1rem 1.25rem',
                    display: 'flex', gap: '0.75rem', alignItems: 'flex-start'
                  }}>
                    <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>✨</span>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--indigo)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                        Code Quality Assessment
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
                        {selectedReviewPlayer.aiEvaluation.qualityFeedback}
                      </p>
                    </div>
                  </div>
                )}

                {/* Run count info */}
                <div style={{
                  display: 'flex', gap: '1rem', padding: '0.75rem 1rem',
                  background: 'var(--bg-input)', borderRadius: '8px', fontSize: '0.85rem'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>🔁 Total Runs: <strong style={{ color: 'var(--indigo)' }}>{selectedReviewPlayer.runCount || 0}</strong></span>
                  {selectedReviewPlayer.warningCount > 0 && (
                    <span style={{ color: 'var(--amber)' }}>⚠ Warnings: <strong>{selectedReviewPlayer.warningCount}/3</strong></span>
                  )}
                </div>

                {/* Review Body */}
                <div 
                  className="markdown-content" 
                  style={{ lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={renderMarkdownText(selectedReviewPlayer.aiEvaluation.review)} 
                />
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                AI evaluation is loading or failed for this player.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CODE COMPARISON */}
        {activeTab === 'comparison' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              Written Source Code
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: room.players.length === 2 ? '1fr 1fr' : '1fr',
              gap: '1.5rem'
            }}>
              {room.players.map(p => {
                const pDQ = p.disqualified || p.status === 'DISQUALIFIED';
                return (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 600, color: pDQ ? '#fca5a5' : 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {p.username}'s Implementation
                        {pDQ && <span style={{ fontSize: '0.7rem', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>DQ</span>}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--indigo)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>🔁 {p.runCount || 0} runs</span>
                        <span style={{ color: 'var(--cyan)', textTransform: 'capitalize', fontSize: '0.8rem', fontWeight: 600 }}>{p.language || 'JavaScript'}</span>
                      </div>
                    </div>
                    <pre style={{
                      background: 'var(--bg-input)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: `1px solid ${pDQ ? 'rgba(239,68,68,0.2)' : 'var(--border-primary)'}`,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                      overflowX: 'auto',
                      maxHeight: '400px',
                      color: '#e5e7eb'
                    }}>
                      <code>{p.code || '// No code submitted.'}</code>
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: MODEL SOLUTION */}
        {activeTab === 'solution' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: '1.2rem', marginBottom: '1rem' }}>
              Optimal Reference Implementation
            </h3>
            {room.players[0]?.aiEvaluation?.modelSolution ? (
              <pre style={{
                background: 'var(--bg-input)',
                padding: '1.5rem',
                borderRadius: '8px',
                border: '1px solid var(--border-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                overflowX: 'auto',
                color: '#34d399' // Highlight solution in soft emerald code
              }}>
                <code>{room.players[0].aiEvaluation.modelSolution}</code>
              </pre>
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                AI Model solution was not generated.
              </div>
            )}
          </div>
        )}

      </div>

      {/* Bottom Buttons */}
      <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onRestart}
          className="btn btn-primary"
          style={{ padding: '0.9rem 2.5rem', fontSize: '1.1rem' }}
        >
          ⚔️ Play Another Round
        </button>
      </div>
    </div>
  );
}
