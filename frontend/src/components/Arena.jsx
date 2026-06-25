import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';

const LANG_MAP = {
  javascript: 'javascript',
  python: 'python',
  java: 'java',
  cpp: 'cpp'
};

const LANG_LABELS = {
  javascript: { label: 'JavaScript', color: '#f7df1e', icon: 'JS' },
  python:     { label: 'Python',     color: '#3572a5', icon: 'PY' },
  java:       { label: 'Java',       color: '#b07219', icon: 'JV' },
  cpp:        { label: 'C++',        color: '#f34b7d', icon: 'C+' }
};

const CHEAT_REASONS = {
  'tab-switch': '🔄 Switched away from tab',
  'copy': '📋 Copied content',
  'paste': '📌 Pasted content',
  'window-blur': '🪟 Left the browser window'
};

/** Tiny Markdown renderer */
function renderMarkdown(text) {
  if (!text) return { __html: '' };
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```javascript([\s\S]*?)```/g, '<pre><code class="lang-js">$1</code></pre>')
    .replace(/```python([\s\S]*?)```/g,    '<pre><code class="lang-py">$1</code></pre>')
    .replace(/```([\s\S]*?)```/g,          '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g,                 '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,           '<strong>$1</strong>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim,  '<h2>$1</h2>')
    .replace(/^# (.*$)/gim,   '<h1>$1</h1>')
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>')
    .split(/\n{2,}/).map(p => {
      if (/^<(h[1-3]|pre|ul)/.test(p)) return p;
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    }).join('');
  return { __html: html };
}

export default function Arena({ room, socketId, onRunCode, onSubmitCode, opponentProgress, socket }) {
  const me        = room.players.find(p => p.id === socketId);
  const opponents = room.players.filter(p => p.id !== socketId);
  const question  = room.question;

  /* ── Language + per-language code buffers ── */
  const [selectedLang, setSelectedLang] = useState(me?.language || 'javascript');
  const [codes, setCodes] = useState({
    javascript: question?.starterCode?.javascript || '',
    python:     question?.starterCode?.python     || '',
    java:       question?.starterCode?.java       || '',
    cpp:        question?.starterCode?.cpp        || '',
  });

  /* ── UI state ── */
  const [panelOpen,   setPanelOpen]   = useState(true);   // problem panel
  const [consoleOpen, setConsoleOpen] = useState(true);   // bottom console
  const [consoleTab,  setConsoleTab]  = useState('output');
  const [isRunning,   setIsRunning]   = useState(false);
  const [isSubmitting,setIsSubmitting]= useState(false);
  const [runResults,  setRunResults]  = useState(null);
  const [termLogs,    setTermLogs]    = useState([]);
  const [timeLeft,    setTimeLeft]    = useState(0);
  const timerRef = useRef(null);

  /* ── Anti-Cheat State ── */
  const [runCount, setRunCount]               = useState(0);
  const [warningCount, setWarningCount]       = useState(me?.warningCount || 0);
  const [showWarning, setShowWarning]         = useState(false);
  const [warningReason, setWarningReason]     = useState('');
  const [isDisqualified, setIsDisqualified]   = useState(me?.disqualified || false);
  const [opponentCheatInfo, setOpponentCheatInfo] = useState({}); // playerId -> { warningCount, lastReason }
  const warningTimeoutRef = useRef(null);

  /* ── Timer ── */
  useEffect(() => {
    if (!room.startedAt || !room.timeLimit) return;
    const calc = () => {
      const ms = room.timeLimit * 60_000 - (Date.now() - room.startedAt);
      return Math.max(0, Math.floor(ms / 1000));
    };
    setTimeLeft(calc());
    timerRef.current = setInterval(() => {
      const r = calc();
      setTimeLeft(r);
      if (r <= 0) { clearInterval(timerRef.current); if (me?.status !== 'SUBMITTED' && !isSubmitting) handleAutoSubmit(); }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [room.startedAt, room.timeLimit]);

  /* ── Editor sync ── */
  const syncCode = (lang, val) => {
    socket.emit('code-sync', { roomId: room.id, code: val, charCount: val.length, language: lang });
  };
  const handleEditorChange = (val = '') => {
    setCodes(p => ({ ...p, [selectedLang]: val }));
    syncCode(selectedLang, val);
  };
  const handleLangChange = (lang) => {
    setSelectedLang(lang);
    syncCode(lang, codes[lang]);
  };

  /* ══════════════════════════════════════════
     ANTI-CHEAT SYSTEM
     ══════════════════════════════════════════ */

  const triggerCheatWarning = useCallback((reason) => {
    if (isDisqualified || me?.status === 'SUBMITTED' || me?.status === 'DISQUALIFIED') return;

    // Emit to server
    socket.emit('cheat-warning', { roomId: room.id, reason });

    // Show local warning overlay
    setWarningReason(reason);
    setShowWarning(true);

    // Auto-hide warning after 4 seconds
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => setShowWarning(false), 4000);
  }, [isDisqualified, me?.status, socket, room.id]);

  // Tab visibility change detection
  useEffect(() => {
    if (me?.status === 'SUBMITTED' || isDisqualified) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheatWarning('tab-switch');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [triggerCheatWarning, me?.status, isDisqualified]);

  // Prevent page unload
  useEffect(() => {
    if (me?.status === 'SUBMITTED' || isDisqualified) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'You are in a coding competition! Leaving will count as cheating.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [me?.status, isDisqualified]);

  // Copy/Paste detection (on document level)
  useEffect(() => {
    if (me?.status === 'SUBMITTED' || isDisqualified) return;

    const handleCopy = (e) => {
      triggerCheatWarning('copy');
      e.preventDefault();
    };

    const handlePaste = (e) => {
      triggerCheatWarning('paste');
      e.preventDefault();
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [triggerCheatWarning, me?.status, isDisqualified]);

  // Window blur detection (switching to another window)
  useEffect(() => {
    if (me?.status === 'SUBMITTED' || isDisqualified) return;

    const handleBlur = () => {
      // Only trigger if the document isn't hidden (that's handled by visibilitychange)
      if (!document.hidden) {
        triggerCheatWarning('window-blur');
      }
    };

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [triggerCheatWarning, me?.status, isDisqualified]);

  // Listen for cheat-event and player-disqualified from server
  useEffect(() => {
    if (!socket) return;

    const handleCheatEvent = ({ playerId, username, reason, warningCount: wc }) => {
      if (playerId === socketId) {
        // It's about us
        setWarningCount(wc);
      } else {
        // It's about an opponent
        setOpponentCheatInfo(prev => ({
          ...prev,
          [playerId]: { warningCount: wc, lastReason: reason, username }
        }));
      }
    };

    const handleDisqualified = ({ playerId, username }) => {
      if (playerId === socketId) {
        setIsDisqualified(true);
        setShowWarning(false);
      }
    };

    socket.on('cheat-event', handleCheatEvent);
    socket.on('player-disqualified', handleDisqualified);
    return () => {
      socket.off('cheat-event', handleCheatEvent);
      socket.off('player-disqualified', handleDisqualified);
    };
  }, [socket, socketId]);

  // Cleanup warning timeout
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, []);

  /* ── Run / Submit ── */
  const handleRun = () => {
    if (isRunning || isDisqualified) return;
    setIsRunning(true);
    setRunCount(prev => prev + 1);
    setConsoleTab('output');
    setConsoleOpen(true);
    setTermLogs(p => [...p, `[${ts()}] ▶ Running in ${LANG_LABELS[selectedLang].label}… (Run #${runCount + 1})`]);
    onRunCode(codes[selectedLang], selectedLang);
  };
  const handleSubmit = () => {
    if (isSubmitting || me?.status === 'SUBMITTED' || isDisqualified) return;
    if (window.confirm('Submit your current code? The editor will be locked while AI reviews your solution.')) {
      setIsSubmitting(true);
      onSubmitCode(codes[selectedLang], selectedLang);
    }
  };
  const handleAutoSubmit = () => {
    setIsSubmitting(true);
    setTermLogs(p => [...p, `[SYSTEM] ⏰ Time expired! Auto-submitting…`]);
    onSubmitCode(codes[selectedLang], selectedLang);
  };

  /* ── Run results listener ── */
  useEffect(() => {
    if (!socket) return;
    const handler = (results) => {
      setRunResults(results);
      setIsRunning(false);
      const pass = results.filter(r => r.passed).length;
      setTermLogs(p => [...p, `[${ts()}] ✅ Done — ${pass}/${results.length} test cases passed.`]);
    };
    socket.on('run-code-result', handler);
    return () => socket.off('run-code-result', handler);
  }, [socket]);

  const ts = () => new Date().toLocaleTimeString();
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const lowTime = timeLeft < 120;
  const currentLangMeta = LANG_LABELS[selectedLang];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', width:'100%', background:'var(--bg-main)' }}>

      {/* ══════ CHEAT WARNING OVERLAY ══════ */}
      {showWarning && !isDisqualified && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          animation:'fadeIn 0.2s ease'
        }}>
          <div style={{
            background:'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.1))',
            border:'2px solid rgba(239,68,68,0.5)',
            borderRadius:'20px', padding:'2.5rem 3rem',
            textAlign:'center', maxWidth:'460px',
            boxShadow:'0 0 60px rgba(239,68,68,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
            animation:'scaleIn 0.3s ease'
          }}>
            <div style={{ fontSize:'4rem', marginBottom:'0.75rem' }}>⚠️</div>
            <h2 style={{
              fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800,
              color:'#fca5a5', marginBottom:'0.5rem'
            }}>
              Cheating Detected!
            </h2>
            <p style={{ color:'var(--text-secondary)', fontSize:'1rem', marginBottom:'1rem', lineHeight:1.5 }}>
              {CHEAT_REASONS[warningReason] || warningReason}
            </p>
            <div style={{
              display:'flex', justifyContent:'center', gap:'0.5rem',
              marginBottom:'1rem'
            }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  width:'40px', height:'40px', borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'1.2rem', fontWeight:800,
                  background: i <= warningCount
                    ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)',
                  border: i <= warningCount
                    ? '2px solid var(--crimson)' : '2px solid rgba(255,255,255,0.1)',
                  color: i <= warningCount ? '#fca5a5' : 'var(--text-muted)',
                  transition:'all 0.3s'
                }}>
                  {i <= warningCount ? '✕' : i}
                </div>
              ))}
            </div>
            <p style={{
              color: warningCount >= 2 ? '#fca5a5' : 'var(--text-muted)',
              fontSize:'0.85rem', fontWeight:600, marginBottom: '1.5rem'
            }}>
              Warning {warningCount}/3 — {warningCount >= 2 ? 'NEXT VIOLATION = DISQUALIFICATION!' : 'Further violations will result in disqualification.'}
            </p>
            <button 
              onClick={() => setShowWarning(false)}
              className="btn btn-primary"
              style={{ padding: '0.6rem 2rem', fontSize: '1rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245,158,11,0.5)', color: '#fff' }}
            >
              OK, I Understand
            </button>
          </div>
        </div>
      )}

      {/* ══════ DISQUALIFIED OVERLAY ══════ */}
      {isDisqualified && (
        <div style={{
          position:'fixed', inset:0, zIndex:10000,
          background:'rgba(10,10,15,0.95)', backdropFilter:'blur(12px)',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}>
          <div style={{
            background:'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(0,0,0,0.3))',
            border:'2px solid rgba(239,68,68,0.4)',
            borderRadius:'24px', padding:'3rem 4rem',
            textAlign:'center', maxWidth:'520px',
            boxShadow:'0 0 80px rgba(239,68,68,0.2)'
          }}>
            <div style={{ fontSize:'5rem', marginBottom:'1rem' }}>🚫</div>
            <h1 style={{
              fontFamily:'var(--font-display)', fontSize:'2.2rem', fontWeight:900,
              color:'#ef4444', marginBottom:'0.75rem',
              textShadow:'0 0 30px rgba(239,68,68,0.5)'
            }}>
              DISQUALIFIED
            </h1>
            <p style={{ color:'var(--text-secondary)', fontSize:'1.1rem', lineHeight:1.6, marginBottom:'1.5rem' }}>
              You have been removed from this competition due to <strong style={{ color:'#fca5a5' }}>3 cheating violations</strong>. 
              Your score has been set to <strong style={{ color:'#ef4444' }}>0</strong>.
            </p>
            <div style={{
              background:'rgba(239,68,68,0.08)', borderRadius:'12px',
              padding:'1rem', border:'1px solid rgba(239,68,68,0.2)',
              fontSize:'0.85rem', color:'var(--text-muted)', lineHeight:1.6
            }}>
              The competition will continue for other players. Your results will show your disqualification status.
            </div>
          </div>
        </div>
      )}

      {/* ══════ TOP HEADER BAR ══════ */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 1.25rem', height:'48px', flexShrink:0,
        background:'rgba(17,19,25,0.98)',
        borderBottom:'1px solid var(--border-primary)',
        backdropFilter:'blur(12px)',
        zIndex:100
      }}>
        {/* Left: Room + Title */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', minWidth:0 }}>
          <span style={{
            background:'linear-gradient(135deg,var(--indigo),var(--cyan))',
            color:'#fff', fontSize:'0.65rem', fontWeight:800,
            padding:'0.15rem 0.5rem', borderRadius:'4px', letterSpacing:'0.08em', flexShrink:0
          }}>
            {room.id}
          </span>
          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {question?.title}
          </span>
          {question?.difficulty && (
            <span className={`badge badge-${question.difficulty.toLowerCase()}`} style={{ flexShrink:0, fontSize:'0.65rem' }}>
              {question.difficulty}
            </span>
          )}
        </div>

        {/* Centre: Language Picker */}
        <div style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--bg-input)', borderRadius:'8px', padding:'3px', border:'1px solid var(--border-primary)' }}>
          {Object.entries(LANG_LABELS).map(([lang, meta]) => (
            <button key={lang} onClick={() => handleLangChange(lang)}
              disabled={me?.status==='SUBMITTED' || isSubmitting || isDisqualified}
              style={{
                padding:'0.2rem 0.6rem', borderRadius:'5px', border:'none', cursor:'pointer',
                fontFamily:'var(--font-mono)', fontSize:'0.72rem', fontWeight:700,
                background: selectedLang===lang ? meta.color+'22' : 'transparent',
                color: selectedLang===lang ? meta.color : 'var(--text-muted)',
                borderBottom: selectedLang===lang ? `2px solid ${meta.color}` : '2px solid transparent',
                transition:'all 0.15s'
              }}
            >
              {meta.label}
            </button>
          ))}
        </div>

        {/* Right: Timer + Run Counter + Warning Badge + Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexShrink:0 }}>
          {/* Run counter badge */}
          <div style={{
            background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.25)',
            color:'var(--indigo)', padding:'0.2rem 0.55rem', borderRadius:'6px',
            fontSize:'0.72rem', fontWeight:700, fontFamily:'var(--font-mono)',
            display:'flex', alignItems:'center', gap:'0.3rem'
          }}>
            🔁 <span>{runCount}</span>
          </div>

          {/* Warning badge */}
          {warningCount > 0 && (
            <div style={{
              background: warningCount >= 2 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${warningCount >= 2 ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.3)'}`,
              color: warningCount >= 2 ? '#fca5a5' : 'var(--amber)',
              padding:'0.2rem 0.55rem', borderRadius:'6px',
              fontSize:'0.72rem', fontWeight:700, fontFamily:'var(--font-mono)',
              display:'flex', alignItems:'center', gap:'0.25rem',
              animation: warningCount >= 2 ? 'pulse-glow-anim 1s infinite alternate' : 'none'
            }}>
              ⚠ {warningCount}/3
            </div>
          )}

          {me?.status === 'SUBMITTED' || isDisqualified ? (
            <div style={{
              background: isDisqualified ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
              border: `1px solid ${isDisqualified ? 'var(--crimson)' : 'var(--emerald)'}`,
              color: isDisqualified ? '#fca5a5' : 'var(--emerald)',
              padding:'0.3rem 0.75rem', borderRadius:'6px', fontSize:'0.8rem', fontWeight:700
            }}>
              {isDisqualified ? '🚫 DQ' : '✓ Submitted'}
            </div>
          ) : (
            <div className={`timer-container ${lowTime ? 'timer-warning' : ''}`} style={{ fontSize:'0.9rem', padding:'0.3rem 0.6rem' }}>
              ⏱ {fmt(timeLeft)}
            </div>
          )}

          <button onClick={() => setPanelOpen(p => !p)} title="Toggle Problem Panel"
            style={{ background:'var(--bg-input)', border:'1px solid var(--border-primary)', color:'var(--text-secondary)', borderRadius:'6px', padding:'0.3rem 0.5rem', cursor:'pointer', fontSize:'0.85rem' }}>
            {panelOpen ? '◀' : '▶'}
          </button>

          <button onClick={handleRun}
            disabled={isRunning || isSubmitting || me?.status==='SUBMITTED' || isDisqualified}
            className="btn btn-secondary"
            style={{ padding:'0.35rem 0.9rem', fontSize:'0.8rem', borderRadius:'6px', gap:'0.3rem' }}>
            {isRunning ? <><span className="typing-dots"><span/><span/><span/></span> Running</> : '▶ Run'}
          </button>

          <button onClick={handleSubmit}
            disabled={isSubmitting || me?.status==='SUBMITTED' || isDisqualified}
            className="btn btn-emerald"
            style={{ padding:'0.35rem 0.9rem', fontSize:'0.8rem', borderRadius:'6px' }}>
            {isSubmitting ? 'Evaluating…' : '🚀 Submit'}
          </button>
        </div>
      </header>

      {/* ══════ MAIN AREA ══════ */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

        {/* ── LEFT: Problem Panel (collapsible) ── */}
        {panelOpen && (
          <div style={{
            width:'340px', flexShrink:0, borderRight:'1px solid var(--border-primary)',
            overflowY:'auto', background:'var(--bg-main)', display:'flex', flexDirection:'column'
          }}>
            {/* Problem header */}
            <div style={{ padding:'1rem 1.25rem 0.75rem', borderBottom:'1px solid var(--border-primary)', background:'var(--bg-surface)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
                <span className={`badge badge-${question?.difficulty?.toLowerCase()}`}>{question?.difficulty}</span>
                <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{question?.topic}</span>
              </div>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.1rem', fontWeight:800, color:'#fff', lineHeight:1.3 }}>{question?.title}</h2>
            </div>

            {/* Description */}
            <div style={{ padding:'1.25rem', overflowY:'auto', flex:1 }}>
              <div className="markdown-content" dangerouslySetInnerHTML={renderMarkdown(question?.description)} />

              {/* Constraints */}
              {question?.constraints?.length > 0 && (
                <div style={{ marginTop:'1.25rem' }}>
                  <h4 style={{ fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, marginBottom:'0.5rem' }}>Constraints</h4>
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem' }}>
                    {question.constraints.map((c, i) => (
                      <div key={i} style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--text-secondary)', background:'var(--bg-input)', padding:'0.3rem 0.6rem', borderRadius:'5px', border:'1px solid var(--border-primary)' }}>
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Case */}
              {question?.sampleTestCase && (
                <div style={{ marginTop:'1.25rem', background:'var(--bg-input)', borderRadius:'8px', border:'1px solid var(--border-primary)', overflow:'hidden' }}>
                  <div style={{ padding:'0.5rem 0.75rem', background:'rgba(99,102,241,0.08)', borderBottom:'1px solid var(--border-primary)', fontSize:'0.72rem', color:'var(--indigo)', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    Example
                  </div>
                  <div style={{ padding:'0.75rem', display:'flex', flexDirection:'column', gap:'0.5rem', fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}>
                    <div>
                      <span style={{ color:'var(--text-muted)', display:'block', marginBottom:'0.2rem', fontSize:'0.7rem', textTransform:'uppercase' }}>Input</span>
                      <pre style={{ background:'rgba(0,0,0,0.2)', padding:'0.4rem 0.6rem', borderRadius:'4px', color:'#e2e8f0', margin:0, overflowX:'auto', fontSize:'0.8rem' }}>{question.sampleTestCase.input}</pre>
                    </div>
                    <div>
                      <span style={{ color:'var(--text-muted)', display:'block', marginBottom:'0.2rem', fontSize:'0.7rem', textTransform:'uppercase' }}>Output</span>
                      <pre style={{ background:'rgba(16,185,129,0.06)', padding:'0.4rem 0.6rem', borderRadius:'4px', color:'var(--emerald)', margin:0, overflowX:'auto', fontSize:'0.8rem' }}>{question.sampleTestCase.output}</pre>
                    </div>
                    {question.sampleTestCase.explanation && (
                      <p style={{ color:'var(--text-secondary)', fontSize:'0.8rem', margin:0, lineHeight:1.5 }}>
                        <strong style={{ color:'var(--text-primary)' }}>Explanation: </strong>{question.sampleTestCase.explanation}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CENTRE: Editor + Console ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {/* Editor area */}
          <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
            {/* Submitted overlay */}
            {(me?.status === 'SUBMITTED' && !isDisqualified) && (
              <div style={{
                position:'absolute', inset:0, background:'rgba(10,11,14,0.82)', backdropFilter:'blur(6px)',
                zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.75rem'
              }}>
                <div style={{ fontSize:'3rem' }}>🔒</div>
                <h3 style={{ fontFamily:'var(--font-display)', color:'#fff', fontSize:'1.3rem', margin:0 }}>Code Locked</h3>
                <p style={{ color:'var(--text-secondary)', maxWidth:'320px', textAlign:'center', fontSize:'0.9rem', margin:0 }}>
                  Waiting for your opponent and AI evaluation to complete…
                </p>
                <div style={{ display:'flex', gap:'0.4rem', marginTop:'0.5rem' }}>
                  <span className="typing-dots"><span/><span/><span/></span>
                </div>
              </div>
            )}

            <Editor
              height="100%"
              language={LANG_MAP[selectedLang]}
              theme="vs-dark"
              value={codes[selectedLang]}
              onChange={handleEditorChange}
              options={{
                minimap:           { enabled: false },
                fontSize:          15,
                lineHeight:        22,
                automaticLayout:   true,
                fontFamily:        "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures:     true,
                lineNumbers:       'on',
                glyphMargin:       false,
                folding:           true,
                scrollBeyondLastLine: false,
                cursorBlinking:    'smooth',
                cursorSmoothCaretAnimation: true,
                smoothScrolling:   true,
                tabSize:           2,
                wordWrap:          'off',
                renderLineHighlight: 'line',
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                overviewRulerBorder: false,
                renderWhitespace: 'none',
                padding: { top: 12, bottom: 12 },
                readOnly: isDisqualified || me?.status === 'SUBMITTED'
              }}
            />
          </div>

          {/* ── Console / Terminal ── */}
          <div style={{
            height: consoleOpen ? '220px' : '32px',
            flexShrink:0, borderTop:'1px solid var(--border-primary)',
            background:'#0b0d11', display:'flex', flexDirection:'column',
            transition:'height 0.2s ease', overflow:'hidden'
          }}>
            {/* Console tab bar */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              height:'32px', flexShrink:0, padding:'0 0.75rem',
              background:'#0f1117', borderBottom: consoleOpen ? '1px solid var(--border-primary)' : 'none'
            }}>
              <div style={{ display:'flex', height:'100%', gap:'0.25rem', alignItems:'center' }}>
                {['output','console'].map(tab => (
                  <button key={tab} onClick={() => { setConsoleTab(tab); setConsoleOpen(true); }}
                    style={{
                      background:'none', border:'none', cursor:'pointer',
                      color: consoleTab===tab && consoleOpen ? 'var(--indigo)' : 'var(--text-muted)',
                      fontWeight:600, fontSize:'0.72rem', padding:'0 0.5rem', height:'100%',
                      borderBottom: consoleTab===tab && consoleOpen ? '2px solid var(--indigo)' : '2px solid transparent',
                      textTransform:'uppercase', letterSpacing:'0.06em', transition:'all 0.15s'
                    }}>
                    {tab === 'output' ? '🧪 Test Results' : '📋 Logs'}
                  </button>
                ))}
                {runResults && (
                  <span style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginLeft:'0.5rem', fontFamily:'var(--font-mono)' }}>
                    {runResults.filter(r=>r.passed).length}/{runResults.length} passed
                  </span>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                  {currentLangMeta.icon}@sandbox
                </span>
                <button onClick={() => setConsoleOpen(p => !p)}
                  style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.75rem', padding:'0 0.25rem' }}>
                  {consoleOpen ? '▼' : '▲'}
                </button>
              </div>
            </div>

            {/* Console body */}
            {consoleOpen && (
              <div style={{ flex:1, overflowY:'auto', padding:'0.75rem 1rem', fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'#a8b2c4' }}>
                {consoleTab === 'output' ? (
                  !runResults ? (
                    <div style={{ color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0' }}>
                      <span>💡</span> Press <kbd style={{ background:'var(--bg-input)', padding:'0.1rem 0.35rem', borderRadius:'3px', fontSize:'0.75rem', border:'1px solid var(--border-primary)' }}>Run</kbd> to execute against test cases.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                      {runResults.map((res, i) => (
                        <div key={i} style={{
                          display:'flex', flexDirection:'column', gap:'0.25rem',
                          padding:'0.5rem 0.75rem', borderRadius:'6px',
                          background: res.passed ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                          border:`1px solid ${res.passed ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                        }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ fontWeight:700, color:'#fff', fontSize:'0.78rem' }}>
                              Case #{i+1} {res.isSecret && <span style={{ color:'var(--cyan)', fontSize:'0.68rem' }}>[hidden]</span>}
                            </span>
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                              {res.timeTakenMs != null && <span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>{res.timeTakenMs}ms</span>}
                              <span style={{ fontWeight:800, fontSize:'0.75rem', color: res.passed ? 'var(--emerald)' : 'var(--crimson)' }}>
                                {res.passed ? '● PASS' : '● FAIL'}
                              </span>
                            </div>
                          </div>
                          {res.error ? (
                            <div style={{ color:'#fca5a5', fontSize:'0.75rem', whiteSpace:'pre-wrap' }}>⚠ {res.error}</div>
                          ) : !res.isSecret ? (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.4rem', fontSize:'0.72rem' }}>
                              <div><span style={{ color:'var(--text-muted)' }}>Input</span><br/><span style={{ color:'#e2e8f0' }}>{res.input}</span></div>
                              <div><span style={{ color:'var(--text-muted)' }}>Expected</span><br/><span style={{ color:'#e2e8f0' }}>{res.expected}</span></div>
                              <div><span style={{ color:'var(--text-muted)' }}>Got</span><br/><span style={{ color: res.passed ? 'var(--emerald)' : 'var(--amber)' }}>{res.actual}</span></div>
                            </div>
                          ) : (
                            <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>[Input/output hidden for secret test]</span>
                          )}
                          {res.logs?.length > 0 && (
                            <div style={{ marginTop:'0.2rem', background:'rgba(0,0,0,0.25)', padding:'0.3rem 0.5rem', borderRadius:'4px', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                              <span style={{ color:'var(--text-muted)' }}>stdout: </span>{res.logs.join(' | ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
                    {termLogs.length === 0 ? (
                      <span style={{ color:'var(--text-muted)' }}>$ terminal ready</span>
                    ) : termLogs.map((log, i) => (
                      <div key={i} style={{
                        color: log.includes('FAIL') || log.includes('error') ? 'var(--crimson)' :
                               log.includes('PASS') || log.includes('Done') ? 'var(--emerald)' :
                               log.startsWith('[SYSTEM]') ? 'var(--amber)' : '#a8b2c4'
                      }}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Opponent HUD ── */}
        <div style={{
          width:'200px', flexShrink:0, borderLeft:'1px solid var(--border-primary)',
          background:'var(--bg-surface)', display:'flex', flexDirection:'column', overflow:'hidden'
        }}>
          {/* HUD Header */}
          <div style={{ padding:'0.6rem 0.75rem', borderBottom:'1px solid var(--border-primary)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <span style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', fontWeight:800, letterSpacing:'0.1em' }}>⚔ Rival Panel</span>
          </div>

          {/* My stats */}
          <div style={{ padding:'0.75rem', borderBottom:'1px solid var(--border-primary)' }}>
            <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', textTransform:'uppercase', fontWeight:700, marginBottom:'0.4rem' }}>You</div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.3rem' }}>
              <div style={{ width:'7px', height:'7px', borderRadius:'50%', background: isDisqualified ? 'var(--crimson)' : me?.status==='SUBMITTED' ? 'var(--emerald)' : 'var(--indigo)', boxShadow:`0 0 6px ${isDisqualified ? 'var(--crimson)' : me?.status==='SUBMITTED' ? 'var(--emerald)' : 'var(--indigo)'}` }} />
              <span style={{ fontSize:'0.8rem', fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{me?.username}</span>
            </div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginBottom:'0.25rem' }}>
              📝 {codes[selectedLang]?.length ?? 0} chars
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.25rem' }}>
              <span style={{ fontSize:'0.68rem', color: currentLangMeta.color, fontWeight:600 }}>
                {currentLangMeta.label}
              </span>
              <span style={{ fontSize:'0.65rem', color:'var(--indigo)', fontFamily:'var(--font-mono)', fontWeight:600 }}>
                🔁 {runCount} runs
              </span>
            </div>
            {warningCount > 0 && (
              <div style={{
                display:'flex', alignItems:'center', gap:'0.3rem',
                padding:'0.2rem 0.4rem', borderRadius:'4px',
                background: warningCount >= 2 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${warningCount >= 2 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.2)'}`,
                fontSize:'0.65rem', fontWeight:700,
                color: warningCount >= 2 ? '#fca5a5' : 'var(--amber)',
                marginTop:'0.2rem'
              }}>
                ⚠ {warningCount}/3 warnings
              </div>
            )}
          </div>

          {/* Opponent cards */}
          <div style={{ flex:1, overflowY:'auto', padding:'0.75rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {opponents.length === 0 ? (
              <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', textAlign:'center', paddingTop:'1rem' }}>
                Waiting for rivals…
              </div>
            ) : opponents.map(opp => {
              const progress = opponentProgress[opp.id] || { charCount: opp.charCount || 0 };
              const runInfo  = room.players.find(p => p.id === opp.id);
              const passed   = runInfo?.runResults?.filter(r => r.passed).length ?? null;
              const total    = runInfo?.runResults?.length ?? null;
              const langMeta = LANG_LABELS[opp.language] || LANG_LABELS.javascript;
              const oppCheat = opponentCheatInfo[opp.id] || { warningCount: opp.warningCount || 0 };
              const oppDQ    = opp.disqualified || opp.status === 'DISQUALIFIED';

              return (
                <div key={opp.id} style={{
                  display:'flex', flexDirection:'column', gap:'0.5rem', padding:'0.75rem',
                  background: oppDQ ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                  borderRadius:'8px',
                  border: oppDQ ? '1px solid rgba(239,68,68,0.25)' : '1px solid var(--border-primary)'
                }}>
                  {/* Name + status dot */}
                  <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <div style={{
                      width:'7px', height:'7px', borderRadius:'50%',
                      background: oppDQ ? 'var(--crimson)' : opp.status==='SUBMITTED' ? 'var(--emerald)' : 'var(--amber)',
                      boxShadow: `0 0 6px ${oppDQ ? 'var(--crimson)' : opp.status==='SUBMITTED' ? 'var(--emerald)' : 'var(--amber)'}`,
                      flexShrink:0
                    }} />
                    <span style={{ fontSize:'0.82rem', fontWeight:700, color: oppDQ ? '#fca5a5' : '#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opp.username}</span>
                    {oppDQ && (
                      <span style={{
                        fontSize:'0.58rem', fontWeight:800, color:'#ef4444',
                        background:'rgba(239,68,68,0.15)', padding:'0.1rem 0.3rem',
                        borderRadius:'3px', letterSpacing:'0.05em'
                      }}>DQ</span>
                    )}
                  </div>

                  {/* Language badge + run count */}
                  <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'0.65rem', fontWeight:700, color: langMeta.color, background:`${langMeta.color}18`, padding:'0.1rem 0.35rem', borderRadius:'3px', fontFamily:'var(--font-mono)' }}>
                      {langMeta.label}
                    </span>
                    <span style={{ fontSize:'0.62rem', color:'var(--indigo)', fontFamily:'var(--font-mono)', fontWeight:600 }}>
                      🔁 {opp.runCount || 0}
                    </span>
                    {opp.status === 'SUBMITTED' && !oppDQ && (
                      <span style={{ fontSize:'0.62rem', color:'var(--emerald)', fontWeight:700 }}>✓ Done</span>
                    )}
                    {opp.status === 'CODING' && (
                      <span className="typing-dots" style={{ marginLeft:'2px' }}><span/><span/><span/></span>
                    )}
                  </div>

                  {/* Cheat warning badge for opponent */}
                  {(oppCheat.warningCount > 0 || opp.warningCount > 0) && (
                    <div style={{
                      display:'flex', alignItems:'center', gap:'0.3rem',
                      padding:'0.2rem 0.4rem', borderRadius:'4px',
                      background: oppDQ ? 'rgba(239,68,68,0.12)' : (oppCheat.warningCount || opp.warningCount) >= 2 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
                      border: `1px solid ${oppDQ ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.2)'}`,
                      fontSize:'0.62rem', fontWeight:700,
                      color: oppDQ ? '#ef4444' : (oppCheat.warningCount || opp.warningCount) >= 2 ? '#fca5a5' : 'var(--amber)',
                    }}>
                      {oppDQ ? '🚫 Disqualified for cheating' : `⚠ ${oppCheat.warningCount || opp.warningCount}/3 warnings`}
                    </div>
                  )}

                  {/* Char count progress bar */}
                  {!oppDQ && (
                    <div>
                      <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginBottom:'0.2rem', display:'flex', justifyContent:'space-between' }}>
                        <span>Typed</span><span style={{ fontFamily:'var(--font-mono)' }}>{progress.charCount}</span>
                      </div>
                      <div style={{ height:'3px', background:'var(--bg-input)', borderRadius:'2px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(100, (progress.charCount / 300) * 100)}%`, background:'var(--indigo)', borderRadius:'2px', transition:'width 0.5s' }} />
                      </div>
                    </div>
                  )}

                  {/* Test results */}
                  {passed !== null && !oppDQ ? (
                    <div style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'0.25rem 0.4rem', borderRadius:'4px', fontSize:'0.72rem',
                      background: passed===total ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                      border:`1px solid ${passed===total ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`
                    }}>
                      <span style={{ color:'var(--text-muted)' }}>🧪 Tests</span>
                      <span style={{ fontWeight:700, color: passed===total ? 'var(--emerald)' : 'var(--amber)', fontFamily:'var(--font-mono)' }}>{passed}/{total}</span>
                    </div>
                  ) : !oppDQ ? (
                    <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>No runs yet</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

      </div>{/* end main area */}

      {/* ── Inline keyframe animations ── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
