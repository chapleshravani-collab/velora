import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, update, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { auth, db } from './firebase';
import Login from './pages/Login';
import ChatList from './pages/ChatList';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { Loader2, LogOut } from 'lucide-react';
import { generateAndStoreKeyPair } from './cryptoUtils';
import ErrorBoundary from './components/ErrorBoundary';
import PasscodeLock from './components/PasscodeLock';
import PrivacyShield from './components/PrivacyShield';
import CallManager from './components/CallManager';
import './App.css';

function App() {
  // Strict Domain Restriction Check
  const allowedHost = 'pulxo-chat-topaz.vercel.app';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isAllowedDomain = window.location.hostname === allowedHost;

  if (!isAllowedDomain && !isLocal) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090a0f',
        color: '#ff4b4b',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          border: '1px solid #ff4b4b',
          borderRadius: '12px',
          padding: '40px',
          background: 'rgba(255, 75, 75, 0.05)',
          maxWidth: '500px',
          boxShadow: '0 0 30px rgba(255, 75, 75, 0.15)'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '16px', letterSpacing: '2px', fontWeight: 'bold' }}>ACCESS SUSPENDED</h1>
          <p style={{ color: '#a0a5b5', fontSize: '1rem', lineHeight: '1.6', marginBottom: '24px' }}>
            This application is running on an unauthorized host. Direct access is strictly prohibited.
          </p>
          <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '500', marginBottom: '32px' }}>
            Please access the system via the official link below:
          </p>
          <a href={`https://${allowedHost}`} style={{
            display: 'inline-block',
            padding: '12px 28px',
            background: '#ff4b4b',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            letterSpacing: '1px',
            transition: 'background 0.2s',
            boxShadow: '0 4px 15px rgba(255, 75, 75, 0.4)'
          }}>
            GO TO OFFICIAL SITE
          </a>
        </div>
      </div>
    );
  }

  const [currentPage, setCurrentPage] = useState('login'); // 'login', 'list', 'chat', 'settings'
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [user, setUser] = useState(auth.currentUser);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(sessionStorage.getItem('pulxo_unlocked') === 'true');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    // Load and apply saved theme on mount
    const savedTheme = localStorage.getItem('velora_theme') || 'fuchsia';
    document.documentElement.className = savedTheme === 'fuchsia' ? '' : `theme-${savedTheme}`;
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setLoadingAuth(false);
      
      if (currentUser) {
        setUser(currentUser);
        setCurrentPage('list'); // Default landing for authenticated users

        // Synchronize user profile and E2EE Public Key
        const userRef = ref(db, `users/${currentUser.uid}`);
        get(userRef).then(async (snapshot) => {
          try {
            const publicJwk = await generateAndStoreKeyPair(currentUser.uid);
            
            if (!snapshot.exists()) {
              await set(userRef, {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Agent'),
                photoURL: currentUser.photoURL || '',
                publicKey: publicJwk,
                lastActive: Date.now()
              });
            } else {
              // Update activity and ensure public key is present
              await update(userRef, { 
                lastActive: Date.now(),
                publicKey: publicJwk
              });
            }
          } catch (err) {
            console.error("E2EE or profile sync write error:", err);
          }
        }).catch(err => {
          console.error("Fetch user profile error:", err);
        });

        // Presence System: Global Status
        const statusRef = ref(db, `users/${currentUser.uid}/status`);
        const connectedRef = ref(db, ".info/connected");
        
        onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            // We are connected.
            set(statusRef, "online").catch(err => console.error("Set status online failed:", err));
            update(userRef, { lastActive: serverTimestamp() }).catch(err => console.error("Update activity timestamp failed:", err));
            onDisconnect(statusRef).set("offline").catch(err => console.error("Set disconnect offline failed:", err));
          }
        }, (error) => {
          console.error("Presence system connection status failed:", error);
        });
      } else {
        setUser(null);
        setCurrentPage('login');
        setActiveChatUser(null);
        setIsUnlocked(false);
        sessionStorage.removeItem('pulxo_unlocked');
      }
    });
    return () => unsubscribe();
  }, []);

  const navigate = (page) => {
    if (!user && page !== 'login') {
       setCurrentPage('login');
       return;
    }
    setCurrentPage(page);
    if (page !== 'chat') {
      setActiveChatUser(null);
    }
  };

  const handleLogout = async () => {
    if (auth.currentUser) {
      try {
        const statusRef = ref(db, `users/${auth.currentUser.uid}/status`);
        // Write status asynchronously without awaiting to prevent socket latency from blocking logout
        set(statusRef, "offline").catch(err => console.error("Async presence logout fail:", err));
      } catch (err) {
        console.error("Set status offline error:", err);
      }
    }
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Firebase auth.signOut error:", err);
    }
  };

  const handleConfirmLogout = async () => {
    setShowLogoutModal(false);
    await handleLogout();
  };

  const handleSwitchAccount = async () => {
    sessionStorage.setItem('trigger_switch_account', 'true');
    setShowLogoutModal(false);
    await handleLogout();
  };

  const openChat = (chatUser) => {
    setActiveChatUser(chatUser);
    setCurrentPage('chat');
  };

  if (loadingAuth) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <Loader2 className="animate-spin" size={32} color="var(--accent-color)" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!isUnlocked) {
    return (
      <PasscodeLock onUnlock={() => {
        setIsUnlocked(true);
        sessionStorage.setItem('pulxo_unlocked', 'true');
      }} />
    );
  }

  return (
    <PrivacyShield>
      <ErrorBoundary>
        <CallManager />
        <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          {!isMobile && <Sidebar currentPage={currentPage} onNavigate={navigate} onLogout={() => setShowLogoutModal(true)} />}

          <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {currentPage === 'list' && <ChatList onOpenChat={openChat} />}
            {currentPage === 'chat' && <Chat chatUser={activeChatUser} onBack={() => navigate('list')} />}
            {currentPage === 'settings' && <Settings onLogout={() => setShowLogoutModal(true)} />}
          </main>

          {isMobile && currentPage !== 'chat' && (
            <BottomNav currentPage={currentPage} onNavigate={navigate} />
          )}
        </div>

        {/* Custom Logout Confirmation Dialog Modal */}
        {showLogoutModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 6, 10, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
            fontFamily: 'Inter, sans-serif'
          }}>
            <div style={{
              background: '#090a10',
              border: '1px solid var(--border-glass)',
              borderRadius: '24px',
              padding: '36px',
              width: '100%',
              maxWidth: '460px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Ambient Background Glow */}
              <div style={{
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: 'radial-gradient(circle, rgba(217, 70, 239, 0.04) 0%, transparent 60%)',
                pointerEvents: 'none'
              }} />

              {/* Icon */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                color: '#ef4444'
              }}>
                <LogOut size={28} />
              </div>

              <h2 style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '1.5px',
                marginBottom: '12px',
                textTransform: 'uppercase'
              }}>Terminate Session</h2>

              <p style={{
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                marginBottom: '32px'
              }}>
                Ending your operational session will disconnect you from the E2EE network. Select your logout route.
              </p>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Option 1: Standard Logout */}
                <button
                  onClick={handleConfirmLogout}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                >
                  Log Out Current Account
                </button>

                {/* Option 2: Switch Account */}
                <button
                  onClick={handleSwitchAccount}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'var(--accent-gradient)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                    boxShadow: '0 4px 15px rgba(217, 70, 239, 0.3)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Switch Google Account
                </button>

                {/* Option 3: Cancel */}
                <button
                  onClick={() => setShowLogoutModal(false)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-glass)',
                    fontWeight: 500,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    transition: 'color 0.2s, background 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  Stay Connected
                </button>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </PrivacyShield>
  );
}

export default App;
