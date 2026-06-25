import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminPanel({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'users'
  const [apiKey, setApiKey] = useState('');
  const [dbUrl, setDbUrl] = useState(''); // Just visual representation or instruction
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') {
      navigate('/');
    } else {
      fetchSettings();
      fetchUsers();
    }
  }, [user, navigate]);

  const token = localStorage.getItem('code_comp_token');

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) {
        setApiKey(data.GROQ_API_KEY || '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ key: 'GROQ_API_KEY', value: apiKey })
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (userId, username) => {
    const newPassword = prompt(`Enter new password for ${username}:`);
    if (!newPassword) return;

    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, newPassword })
      });
      if (!res.ok) throw new Error('Failed to reset password');
      alert(`Password for ${username} reset successfully!`);
    } catch (err) {
      alert(err.message);
    }
  };

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', width: '100%', padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="logo-title" style={{ fontSize: '2rem' }}>
          Admin<span style={{ color: 'var(--indigo)' }}>Panel</span>
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ padding: '0.4rem 1rem' }}>Back to Arena</button>
          <button onClick={onLogout} className="btn" style={{ padding: '0.4rem 1rem', background: 'var(--crimson)', color: '#fff', border: 'none' }}>Logout</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('settings')}
          style={{ background: 'none', border: 'none', color: activeTab === 'settings' ? 'var(--indigo)' : 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer' }}
        >
          Environment Settings
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{ background: 'none', border: 'none', color: activeTab === 'users' ? 'var(--indigo)' : 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer' }}
        >
          User Management
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        {activeTab === 'settings' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', color: '#fff' }}>Environment Variables</h2>
            
            {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
            {success && <div style={{ color: 'var(--emerald)', marginBottom: '1rem' }}>{success}</div>}
            
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="input-group">
                <label className="input-label">Groq API Key (Stored in DB)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="text-input"
                  placeholder="gsk_..."
                />
              </div>

              <div className="input-group">
                <label className="input-label">PostgreSQL Database URL (Requires server restart)</label>
                <div style={{ 
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', 
                  padding: '1rem', borderRadius: '8px', color: 'var(--amber)', fontSize: '0.9rem', lineHeight: 1.5 
                }}>
                  ⚠ <strong>Note:</strong> To change the Database URL, you must edit the <code>backend/.env</code> file directly on the server and restart the Node.js process. Changing the database connection while connected is not supported through this panel.
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.6rem 2rem' }}>
                Save API Key
              </button>
            </form>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', color: '#fff' }}>Registered Users</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Username</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Joined</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#fff', fontWeight: 600 }}>{u.username}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ 
                          background: u.role === 'ADMIN' ? 'rgba(99,102,241,0.2)' : u.role === 'GUEST' ? 'rgba(107,114,128,0.2)' : 'rgba(16,185,129,0.2)',
                          color: u.role === 'ADMIN' ? 'var(--indigo)' : u.role === 'GUEST' ? 'var(--text-secondary)' : 'var(--emerald)',
                          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800
                        }}>{u.role}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {u.role !== 'GUEST' && (
                          <button 
                            onClick={() => handleResetPassword(u.id, u.username)}
                            className="btn" 
                            style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                          >
                            Reset Password
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
