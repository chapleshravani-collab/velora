import React, { useState, useEffect, useRef } from 'react';
import { Shield, EyeOff, AlertCircle } from 'lucide-react';
import Watermark from './Watermark';

const PrivacyShield = ({ children }) => {
  const [isBlurred, setIsBlurred] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [securityAlert, setSecurityAlert] = useState(null);
  const devToolsCheckRef = useRef(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setShowOverlay(true);
      } else {
        // Keep it hidden for a split second to prevent flicker-reveal
        setTimeout(() => setShowOverlay(false), 300);
      }
    };

    const handleBlur = () => setIsBlurred(true);
    const handleFocus = () => setIsBlurred(false);

    const handleKeyDown = (e) => {
      // PrintScreen and Platform-specific Capture Shortcuts
      const isCapture = e.key === 'PrintScreen' || 
                        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) ||
                        (e.ctrlKey && e.key === 'p'); // Print block

      if (isCapture) {
        triggerAlert("UNAUTHORIZED CAPTURE ATTEMPT DETECTED");
      }
    };

    const triggerAlert = (msg) => {
      setSecurityAlert(msg);
      console.warn(`[SECURITY ALERT] ${msg} at ${new Date().toISOString()}`);
      
      // Log to local storage for "Mission Log" persistence if needed
      const logs = JSON.parse(localStorage.getItem('pulxo_security_logs') || '[]');
      logs.push({ event: msg, time: new Date().toISOString() });
      localStorage.setItem('pulxo_security_logs', JSON.stringify(logs.slice(-50)));
      
      if (window.navigator?.vibrate) window.navigator.vibrate([200, 100, 200]);
      setTimeout(() => setSecurityAlert(null), 3500);
    };

    // DevTools Detection Heuristic (Window size discrepancy)
    const checkDevTools = () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      
      if (widthDiff || heightDiff) {
        setIsBlurred(true);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleKeyDown);
    
    devToolsCheckRef.current = setInterval(checkDevTools, 1000);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(devToolsCheckRef.current);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Global Watermark Layer */}
      <Watermark />

      {/* Main Content */}
      <div style={{ 
        filter: isBlurred ? 'blur(20px) grayscale(1)' : 'none',
        transition: 'filter 0.3s ease',
        height: '100%',
        pointerEvents: (isBlurred || showOverlay) ? 'none' : 'auto'
      }}>
        {children}
      </div>

      {/* Privacy Overlay (Tab Switch / App Switch) */}
      {showOverlay && (
        <div className="privacy-overlay">
          <div className="glass-panel privacy-card animate-pop-in">
            <EyeOff size={64} className="privacy-icon" />
            <h2>MISSION BLOCKED</h2>
            <p>CONTENT HIDDEN FOR PRIVACY PROTECTION</p>
            <div className="security-scan-line"></div>
          </div>
        </div>
      )}

      {/* Security Alert Overlay */}
      {securityAlert && (
        <div className="security-alert-overlay">
           <AlertCircle size={80} className="alert-icon-pulse" />
           <div className="alert-text">
             <h1>SECURITY BREACH</h1>
             <p>{securityAlert}</p>
             <small>INCIDENT LOGGED TO MISSION FEED</small>
           </div>
        </div>
      )}
    </div>
  );
};

export default PrivacyShield;
