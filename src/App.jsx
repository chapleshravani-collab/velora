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
import { Loader2 } from 'lucide-react';
import { generateAndStoreKeyPair } from './cryptoUtils';
import ErrorBoundary from './components/ErrorBoundary';
import PasscodeLock from './components/PasscodeLock';
import PrivacyShield from './components/PrivacyShield';
import CallManager from './components/CallManager';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('login'); // 'login', 'list', 'chat', 'settings'
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
          {!isMobile && <Sidebar currentPage={currentPage} onNavigate={navigate} />}

          <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {currentPage === 'list' && <ChatList onOpenChat={openChat} />}
            {currentPage === 'chat' && <Chat chatUser={activeChatUser} onBack={() => navigate('list')} />}
            {currentPage === 'settings' && <Settings onLogout={() => auth.signOut()} />}
          </main>

          {isMobile && currentPage !== 'chat' && (
            <BottomNav currentPage={currentPage} onNavigate={navigate} />
          )}
        </div>
      </ErrorBoundary>
    </PrivacyShield>
  );
}

export default App;
