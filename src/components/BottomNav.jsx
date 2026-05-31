import React from 'react';
import { MessageSquareCode, Terminal, Zap } from 'lucide-react';

const BottomNav = ({ currentPage, onNavigate }) => {
  return (
    <nav style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '64px',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      borderTop: '1px solid var(--border-glass)',
      zIndex: 50,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }} className="glass-panel text-secondary">
      <NavItem 
        icon={<MessageSquareCode size={24} />} 
        label="Intel" 
        active={currentPage === 'list' || currentPage === 'chat'} 
        onClick={() => onNavigate('list')} 
      />
      <button style={{
        marginTop: '-24px',
        width: '56px',
        height: '56px',
        borderRadius: '28px',
        background: 'var(--accent-gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 20px rgba(217, 70, 239, 0.4)',
        color: 'white',
      }}
      onClick={() => onNavigate('list')} 
      >
        <Zap size={28} fill="white" />
      </button>
      <NavItem 
        icon={<Terminal size={24} />} 
        label="Command" 
        active={currentPage === 'settings'} 
        onClick={() => onNavigate('settings')} 
      />
    </nav>
  );
};

const NavItem = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      color: active ? 'var(--accent-color)' : 'var(--text-secondary)',
      padding: '8px',
    }}
  >
    {icon}
    <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{label}</span>
  </button>
);

export default BottomNav;
