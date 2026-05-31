import React, { useState, useEffect } from 'react';
import { ShieldAlert, Unlock, Lock, Loader2, Delete, X } from 'lucide-react';

const PasscodeLock = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const correctPin = '9412';

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(false);
      
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const verifyPin = (submittedPin) => {
    setLoading(true);
    setTimeout(() => {
      if (submittedPin === correctPin) {
        onUnlock();
      } else {
        setError(true);
        setPin('');
        setLoading(false);
        // Haptic feedback if available
        if (window.navigator?.vibrate) window.navigator.vibrate([100, 50, 100]);
      }
    }, 600);
  };

  const removeDigit = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      background: 'var(--bg-primary)', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Ambience */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        background: 'radial-gradient(circle at center, rgba(217, 70, 239, 0.05) 0%, transparent 70%)',
        zIndex: 0
      }} />

      <div style={{ zIndex: 1, textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '24px', 
          background: 'var(--accent-gradient)', 
          margin: '0 auto 32px',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          boxShadow: '0 0 30px rgba(217, 70, 239, 0.4)',
          animation: error ? 'shake 0.4s ease-in-out' : 'none'
        }}>
          {error ? <ShieldAlert size={40} color="white" /> : <Lock size={40} color="white" />}
        </div>

        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '0.1em', marginBottom: '8px', color: 'white' }}>
          MISSION ACCESS
        </h1>
        <p style={{ color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '48px' }}>
          AUTHENTICATION REQUIRED
        </p>

        {/* PIN Dots */}
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '60px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ 
              width: '16px', 
              height: '16px', 
              borderRadius: '50%', 
              background: pin.length > i ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
              border: '2px solid',
              borderColor: pin.length > i ? 'var(--accent-color)' : 'var(--border-glass)',
              boxShadow: pin.length > i ? '0 0 15px var(--accent-color)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              transform: pin.length > i ? 'scale(1.2)' : 'scale(1)'
            }} />
          ))}
        </div>

        {/* Numpad */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '16px',
          maxWidth: '300px',
          margin: '0 auto'
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button 
              key={num} 
              onClick={() => handleDigit(num.toString())}
              disabled={loading}
              style={{ 
                height: '70px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-glass)',
                color: 'white',
                fontSize: '1.5rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              className="keypad-btn"
            >
              {num}
            </button>
          ))}
          <div /> {/* Empty space */}
          <button 
            onClick={() => handleDigit('0')}
            disabled={loading}
            style={{ 
              height: '70px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-glass)',
              color: 'white',
              fontSize: '1.5rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="keypad-btn"
          >
            0
          </button>
          <button 
            onClick={removeDigit}
            disabled={loading || pin.length === 0}
            style={{ 
              height: '70px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="keypad-btn"
          >
            <Delete size={24} />
          </button>
        </div>

        {loading && (
          <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--accent-color)' }}>
            <Loader2 className="animate-spin" size={20} />
            <span style={{ fontSize: '0.8rem', fontWeight: 900, letterSpacing: '0.1em' }}>DECRYPTING ACCESS...</span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: '32px', color: '#f87171', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.05em' }}>
            INVALID PASSCODE. ACCESS DENIED.
          </div>
        )}
      </div>

      <style>{`
        .keypad-btn:active {
          background: var(--accent-gradient) !important;
          transform: scale(0.9) !important;
          border-color: transparent !important;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
      `}</style>
    </div>
  );
};

export default PasscodeLock;
