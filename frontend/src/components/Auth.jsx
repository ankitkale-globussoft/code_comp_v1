import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem('code_comp_token', data.token);
      onLogin(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuest = async () => {
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Guest login failed');

      localStorage.setItem('code_comp_token', data.token);
      onLogin(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        <h1 className="logo-title" style={{ fontSize: '2.5rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
          Code<span style={{ color: 'var(--indigo)' }}>Arena</span>
        </h1>

        {error && <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.9rem' }}>{error}</div>}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group" style={{ margin: 0 }}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="text-input"
              required
              disabled={isLoading}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="text-input"
              required
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', height: '45px' }} disabled={isLoading}>
            {isLoading ? '...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-primary)' }}></div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-primary)' }}></div>
        </div>

        <button onClick={handleGuest} className="btn btn-secondary" style={{ width: '100%' }} disabled={isLoading}>
          Play as Guest
        </button>

        <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
