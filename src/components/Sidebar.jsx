import React from 'react';
import { MessageSquareCode, Terminal, LogOut, Zap, Shield } from 'lucide-react';

const Sidebar = ({ currentPage, onNavigate }) => {
  return (
    <aside style={{
      width: '280px',
      height: '100%',
      borderRight: '1px solid var(--border-glass)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      background: 'var(--bg-secondary)',
    }} className="glass-panel">
      <div style={{ padding: '0 12px 32px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ 
          width: '40px', height: '40px', borderRadius: '12px', 
          background: 'var(--accent-gradient)', display: 'flex', 
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(217, 70, 239, 0.4)'
        }}>
          <Zap size={24} color="white" fill="white" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 className="text-gradient" style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.15em' }}>VELORA</h2>
          <div style={{ width: '6px', height: '6px', background: 'var(--accent-color)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent-color)', animation: 'blink 2s infinite' }} title="System Active" />
        </div>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <NavItem 
          icon={<MessageSquareCode size={20} />} 
          label="Intelligence" 
          active={currentPage === 'list' || currentPage === 'chat'} 
          onClick={() => onNavigate('list')} 
        />
        <NavItem 
          icon={<Terminal size={20} />} 
          label="Command" 
          active={currentPage === 'settings'} 
          onClick={() => onNavigate('settings')} 
        />
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <NavItem 
          icon={<LogOut size={20} />} 
          label="Log Out" 
          onClick={() => onNavigate('login')} 
        />
      </div>
    </aside>
  );
};

const NavItem = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      borderRadius: '12px',
      background: active ? 'var(--bg-glass-hover)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      width: '100%',
      textAlign: 'left',
    }}
    onMouseEnter={(e) => {
      if (!active) e.currentTarget.style.color = 'var(--text-primary)';
    }}
    onMouseLeave={(e) => {
      if (!active) e.currentTarget.style.color = 'var(--text-secondary)';
    }}
  >
    {icon}
    <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{label}</span>
  </button>
);

export default Sidebar;
