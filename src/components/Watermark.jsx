import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';

const Watermark = () => {
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 10).toUpperCase());
  const [timestamp, setTimestamp] = useState(new Date().toLocaleTimeString());
  const username = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'AGENT';

  useEffect(() => {
    const timer = setInterval(() => {
      setTimestamp(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Generate a grid of watermarks
  const items = Array.from({ length: 24 });

  return (
    <div className="watermark-container">
      {items.map((_, i) => (
        <div key={i} className="watermark-item" style={{ 
          animationDelay: `${i * 0.15}s`,
          transform: `rotate(-25deg)` 
        }}>
          {username} • {sessionId} • {timestamp}
        </div>
      ))}
    </div>
  );
};

export default Watermark;
