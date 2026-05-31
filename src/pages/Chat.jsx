import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Phone, Video, MoreVertical, Send, Paperclip, Smile, Trash2, Check, CheckCheck, Shield, Clock, Timer, Loader2, Eye, EyeOff, AlertCircle, Search, Layers, Image as ImageIcon, RotateCcw, Info, X, Music, Play, Pause, Pencil, Plus } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { ref, onValue, push, serverTimestamp, remove, update, onDisconnect, set, get, increment } from 'firebase/database';
import { db, auth } from '../firebase';
import { deriveSharedSecret, encryptMessageE2EE, decryptMessageE2EE } from '../cryptoUtils';

// Official Tenor API Key from User's Documentation Screenshot
const TENOR_API_KEY = "LIVDSRZULELA"; 

const Chat = ({ chatUser, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [sharedSecret, setSharedSecret] = useState(null);
  const [isE2EEReady, setIsE2EEReady] = useState(false);
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  
  // Audio state
  const [isPlayingSong, setIsPlayingSong] = useState(false);
  const audioRef = useRef(new Audio());

  // Message Ops State
  const [isEditing, setIsEditing] = useState(false);
  const [editMessageId, setEditMessageId] = useState(null);
  const [showInfoMessage, setShowInfoMessage] = useState(null);

  // Media Picker states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState('emoji'); 
  const [tenorResults, setTenorResults] = useState([]);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('kiss');
  const [mediaError, setMediaError] = useState(null);
  
  // Presence state
  const [isOtherInChat, setIsOtherInChat] = useState(false);
  
  const endOfMessagesRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pickerRef = useRef(null);
  
  const currentUserId = auth.currentUser?.uid || 'unknown';
  const chatId = chatUser ? [currentUserId, chatUser.uid].sort().join('_') : null;

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Snapchat-style Deletion: Delete all seen messages on exit
  const cleanupMessagesOnExit = async () => {
    if (!chatId) return;
    try {
      const messagesRef = ref(db, `messages/${chatId}`);
      const snapshot = await get(messagesRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const updates = {};
        Object.keys(data).forEach(key => {
          if (data[key].seen === true) {
            updates[key] = null; // Delete message
          }
        });
        if (Object.keys(updates).length > 0) {
          await update(messagesRef, updates);
        }
      }
    } catch (err) {
      console.error("Cleanup Error:", err);
    }
  };

  const handleBack = async () => {
    await cleanupMessagesOnExit();
    audioRef.current.pause();
    onBack();
  };

  // E2EE Setup
  useEffect(() => {
    if (!chatUser?.publicKey || !currentUserId) return;
    const setupE2EE = async () => {
      try {
        const secret = await deriveSharedSecret(currentUserId, chatUser.publicKey);
        setSharedSecret(secret);
        setIsE2EEReady(true);
      } catch (err) {
        console.error("E2EE Setup Error:", err);
      }
    };
    setupE2EE();
  }, [chatUser, currentUserId]);

  // Presence Logic
  useEffect(() => {
    if (!chatId || !currentUserId) return;
    const myPresenceRef = ref(db, `presence/${chatId}/${currentUserId}`);
    set(myPresenceRef, true);
    onDisconnect(myPresenceRef).remove();
    const otherPresenceRef = ref(db, `presence/${chatId}/${chatUser.uid}`);
    const unsubscribePresence = onValue(otherPresenceRef, (snap) => {
      setIsOtherInChat(!!snap.val());
    }, (error) => {
      console.error("Presence listener failed:", error);
    });
    // Clear unread count when entering chat
    const myUnreadRef = ref(db, `users/${currentUserId}/unread_counts/${chatUser.uid}`);
    set(myUnreadRef, 0);

    return () => { 
      remove(myPresenceRef); 
      unsubscribePresence(); 
      cleanupMessagesOnExit();
      audioRef.current.pause();
    };
  }, [chatId, currentUserId, chatUser.uid]);

  // Messages Listener
  useEffect(() => {
    if (!chatId || !isE2EEReady || !sharedSecret) return;
    const messagesRef = ref(db, `messages/${chatId}`);
    const unsubscribeMessages = onValue(messagesRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const decryptedMsgs = await Promise.all(
          Object.keys(data).map(async (key) => {
            const msg = data[key];
            let content = null;
            if (msg.encryptedData) {
              const decryptedString = await decryptMessageE2EE(sharedSecret, msg.encryptedData);
              try { content = JSON.parse(decryptedString); } catch (e) { content = decryptedString; }
            }
            return { id: key, ...msg, content };
          })
        );
        const sortedMsgs = decryptedMsgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setMessages(sortedMsgs);
        
        sortedMsgs.forEach(m => {
          if (m.sender !== currentUserId && !m.seen) {
            update(ref(db, `messages/${chatId}/${m.id}`), { seen: true, seenAt: serverTimestamp() });
          }
        });
      } else { setMessages([]); }
    }, (error) => {
      console.error("Messages listener failed:", error);
    });
    
    const typingRef = ref(db, `typing/${chatId}/${chatUser.uid}`);
    const unsubscribeTyping = onValue(typingRef, (snapshot) => { setIsOtherTyping(!!snapshot.val()); }, (error) => {
      console.error("Typing listener failed:", error);
    });
    
    return () => { unsubscribeMessages(); unsubscribeTyping(); };
  }, [chatId, isE2EEReady, sharedSecret]);

  // Handle Sending / Updating
  const handleSend = async (e, customContent = null) => {
    if (e) e.preventDefault();
    const finalContent = customContent || inputText.trim();
    if (!finalContent || !chatId || !isE2EEReady || !sharedSecret) return;
    try {
      const encrypted = await encryptMessageE2EE(sharedSecret, typeof finalContent === 'object' ? JSON.stringify(finalContent) : finalContent);
      
      if (isEditing && editMessageId) {
        // Edit Protocol
        await update(ref(db, `messages/${chatId}/${editMessageId}`), {
          encryptedData: encrypted,
          lastUpdated: serverTimestamp(),
          edited: true
        });
        setIsEditing(false);
        setEditMessageId(null);
      } else {
        // Standard Send Protocol
        await push(ref(db, `messages/${chatId}`), {
          encryptedData: encrypted,
          sender: currentUserId,
          timestamp: serverTimestamp(),
          seen: false,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
        });

        // Increment Unread Count for Receiver
        const receiverUnreadRef = ref(db, `users/${chatUser.uid}/unread_counts/${currentUserId}`);
        update(receiverUnreadRef, { count: increment(1) }).catch(err => {
          set(receiverUnreadRef, { count: 1 });
        });
      }

      if (!customContent) {
        setInputText('');
        set(ref(db, `typing/${chatId}/${currentUserId}`), false);
      }
      setShowEmojiPicker(false);
    } catch (error) { console.error("Send Error:", error); }
  };

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => { scrollToBottom(); }, [messages, isOtherTyping, isOtherInChat]);

  // Unified Tenor Fetcher
  const fetchTenor = async () => {
    setIsMediaLoading(true);
    setMediaError(null);
    try {
      const q = pickerTab === 'sticker' ? `${mediaSearch} sticker` : mediaSearch;
      const url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=24&contentfilter=high&media_filter=minimal`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("API Limit Reached");
      const data = await response.json();
      setTenorResults(data.results || []);
    } catch (e) { 
      console.error("Tenor Fetch Error:", e);
      setMediaError("Connection Error");
    }
    setIsMediaLoading(false);
  };

  useEffect(() => {
    if ((pickerTab === 'gif' || pickerTab === 'sticker') && showEmojiPicker) {
      const timeout = setTimeout(fetchTenor, 500);
      return () => clearTimeout(timeout);
    }
  }, [mediaSearch, pickerTab, showEmojiPicker]);

  const toggleSong = () => {
    if (!chatUser.song?.previewUrl) return;
    if (isPlayingSong) {
      audioRef.current.pause();
      setIsPlayingSong(false);
    } else {
      audioRef.current.src = chatUser.song.previewUrl;
      audioRef.current.play();
      setIsPlayingSong(true);
      audioRef.current.onended = () => setIsPlayingSong(false);
    }
  };


  const handleDeleteMessage = async () => {
    if (!selectedMessage || !chatId) return;
    try {
      await remove(ref(db, `messages/${chatId}/${selectedMessage.id}`));
      setSelectedMessage(null);
    } catch (e) { console.error("Delete Error:", e); }
  };

  const handleEditInit = () => {
    if (!selectedMessage) return;
    if (typeof selectedMessage.content === 'object') return; // Cannot edit media
    setIsEditing(true);
    setEditMessageId(selectedMessage.id);
    setInputText(selectedMessage.content);
    setSelectedMessage(null);
  };

  const handleEditInitDirect = (msg) => {
    setIsEditing(true);
    setEditMessageId(msg.id);
    setInputText(msg.content);
  };

  const handlePointerDown = (msg) => {
    longPressTimerRef.current = setTimeout(() => {
      setSelectedMessage(msg);
      if (window.navigator?.vibrate) window.navigator.vibrate(50);
    }, 500);
  };

  const handlePointerUp = () => clearTimeout(longPressTimerRef.current);

  const handleTyping = (e) => {
    setInputText(e.target.value);
    const myTypingRef = ref(db, `typing/${chatId}/${currentUserId}`);
    if (e.target.value.trim().length > 0) {
      set(myTypingRef, true);
      onDisconnect(myTypingRef).remove();
    } else { set(myTypingRef, false); }
  };

  if (!chatUser) return null;
  const avatarLetter = chatUser.displayName ? chatUser.displayName.charAt(0).toUpperCase() : '?';

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Message Options Overlay */}
      {selectedMessage && (
        <div onClick={() => setSelectedMessage(null)} style={{ position: 'absolute', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
           <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '280px', borderRadius: '24px', overflow: 'hidden', animation: 'pop-in 0.2s ease-out' }}>
              {selectedMessage.sender === currentUserId && (
                <>
                  <button onClick={handleEditInit} style={{ width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', color: 'white', fontSize: '0.95rem', fontWeight: 600, borderBottom: '1px solid var(--border-glass)' }}>
                    <Pencil size={18} color="var(--accent-color)" /> Edit Transmission
                  </button>
                  <button onClick={handleDeleteMessage} style={{ width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', color: '#f87171', fontSize: '0.95rem', fontWeight: 600, borderBottom: '1px solid var(--border-glass)' }}>
                    <Trash2 size={18} color="#f87171" /> Destroy Intelligence
                  </button>
                </>
              )}
              <button onClick={() => { setShowInfoMessage(selectedMessage); setSelectedMessage(null); }} style={{ width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', color: 'white', fontSize: '0.95rem', fontWeight: 600 }}>
                <Info size={18} color="#60a5fa" /> Intelligence Details
              </button>
           </div>
        </div>
      )}

      {/* Message Info Modal */}
      {showInfoMessage && (
        <div onClick={() => setShowInfoMessage(null)} style={{ position: 'absolute', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
           <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '320px', borderRadius: '32px', padding: '24px', border: '1px solid var(--accent-color)', boxShadow: '0 0 40px rgba(34, 197, 94, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>INTEL REPORT</h3>
                <button onClick={() => setShowInfoMessage(null)}><X size={20} /></button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status</span>
                  <span style={{ color: '#34d399', fontWeight: 800 }}>{showInfoMessage.seen ? 'DELIVERED & READ' : 'SENT TO VELORA'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Timestamp</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{new Date(showInfoMessage.timestamp).toLocaleString()}</span>
                </div>
                {showInfoMessage.seenAt && (
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Read At</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#34d399' }}>{new Date(showInfoMessage.seenAt).toLocaleString()}</span>
                  </div>
                )}
                {showInfoMessage.edited && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Integrity</span>
                    <span style={{ color: 'var(--accent-color)', fontWeight: 800 }}>MODIFIED UNIT</span>
                  </div>
                )}
              </div>
              
              <button onClick={() => setShowInfoMessage(null)} style={{ width: '100%', marginTop: '24px', padding: '14px', borderRadius: '16px', background: 'var(--accent-gradient)', color: 'white', fontWeight: 800 }}>CLOSE REPORT</button>
           </div>
        </div>
      )}
      
      {/* Media Picker Modal */}
      {showEmojiPicker && (
        <div ref={pickerRef} style={{ position: 'absolute', bottom: '85px', left: '16px', right: '16px', zIndex: 120, background: 'var(--bg-glass)', backdropFilter: 'blur(50px)', borderRadius: '32px', border: '1px solid var(--border-glass)', height: '480px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ padding: '12px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-glass)' }}>
            {['emoji', 'gif', 'sticker'].map(tab => (
              <button key={tab} onClick={() => { setPickerTab(tab); setMediaError(null); }} style={{ flex: 1, padding: '10px', borderRadius: '14px', background: pickerTab === tab ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)', color: 'white', fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {tab === 'emoji' && <Smile size={16} />}
                {tab === 'gif' && <ImageIcon size={16} />}
                {tab === 'sticker' && <Layers size={16} />}
                {tab}
              </button>
            ))}
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {pickerTab === 'emoji' && (
              <EmojiPicker onEmojiClick={(emoji) => setInputText(p => p + emoji.emoji)} theme="dark" width="100%" height="100%" lazyLoadEmojis={true} />
            )}
            
            {(pickerTab === 'gif' || pickerTab === 'sticker') && (
              <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input type="text" placeholder={`Search Mission ${pickerTab}s...`} value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }} />
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', paddingBottom: '20px' }}>
                  {isMediaLoading ? (
                    <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', paddingTop: '40px' }}><Loader2 className="animate-spin" /></div>
                  ) : mediaError ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', paddingTop: '40px', color: 'var(--text-secondary)' }}>
                      <p>{mediaError}</p>
                      <button onClick={fetchTenor} style={{ marginTop: '8px', color: 'var(--accent-color)', fontSize: '0.8rem' }}>Retry</button>
                    </div>
                  ) : (
                    tenorResults.map(res => (
                      <div key={res.id} onClick={() => handleSend(null, { type: 'media', url: res.media[0].tinygif.url })} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '1/1', position: 'relative' }}>
                        <img src={res.media[0].tinygif.url} alt="Media" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Info Modal */}
      {showProfileInfo && (
        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', background: 'var(--bg-primary)', zIndex: 1000, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
           <div className="scanline" style={{ pointerEvents: 'none' }} />
           
           {/* Top Navigation Bar */}
           <div style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
             <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>OPERATIONAL DOSSIER</h3>
             <button onClick={() => { setShowProfileInfo(false); audioRef.current.pause(); setIsPlayingSong(false); }} style={{ padding: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
           </div>
           
           <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center' }}>
             {/* Avatar Box with Glowing rings */}
             <div style={{ 
               width: '130px', height: '130px', borderRadius: '50%', 
               background: 'var(--accent-gradient)', overflow: 'hidden', 
               display: 'flex', alignItems: 'center', justifyContent: 'center', 
               fontSize: '3.5rem', fontWeight: 700, color: 'white', 
               border: '4px solid var(--border-glass)', 
               boxShadow: '0 0 30px rgba(217, 70, 239, 0.3)' 
             }}>
              {chatUser.pfpUrl ? <img src={chatUser.pfpUrl} alt="Avatar" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : avatarLetter}
             </div>
             
             {/* Header titles */}
             <div>
               <h2 className="text-gradient" style={{ fontSize: '1.8rem', fontWeight: 900 }}>{chatUser.displayName}</h2>
               <p style={{ color: 'var(--accent-color)', fontWeight: 700, fontSize: '1.05rem', marginTop: '4px' }}>@{chatUser.username || 'user'}</p>
             </div>

             {/* Meta Info Dashboard List */}
             <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
               
               {/* Nickname Row */}
               {chatUser.nickname && (
                 <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                   <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(217, 70, 239, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
                     <Zap size={18} fill="var(--accent-color)" />
                   </div>
                   <div>
                     <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>NICKNAME</p>
                     <p style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{chatUser.nickname}</p>
                   </div>
                 </div>
               )}

               {/* Phone Connection Row */}
               {chatUser.phoneNumber && (
                 <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                   <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                     <Phone size={18} />
                   </div>
                   <div style={{ flex: 1 }}>
                     <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PHONE CONNECTION</p>
                     <p style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{chatUser.phoneNumber}</p>
                   </div>
                 </div>
               )}

               {/* Mission Bio / Favourite Line */}
               {chatUser.bio && (
                 <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '18px 20px', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                   <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MISSION BRIEFING / ABOUT</p>
                   <p style={{ fontSize: '0.95rem', fontWeight: 500, lineHeight: 1.5, color: 'var(--text-primary)', fontStyle: 'italic' }}>
                     "{chatUser.bio}"
                   </p>
                 </div>
               )}

               {/* Song Module */}
               {chatUser.song && (
                 <div className="glass-panel" style={{ padding: '20px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '16px', border: '1px solid var(--accent-color)', background: 'rgba(217, 70, 239, 0.03)', textAlign: 'left' }}>
                    <div style={{ position: 'relative', width: '60px', height: '60px', flexShrink: 0 }}>
                      <img src={chatUser.song.artwork} alt="" style={{ width: '100%', height: '100%', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
                      <button onClick={toggleSong} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                         {isPlayingSong ? <Pause size={24} color="white" fill="white" /> : <Play size={24} color="white" fill="white" />}
                      </button>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-color)', letterSpacing: '0.05em', marginBottom: '2px' }}>THEME SONG</p>
                      <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chatUser.song.title}</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chatUser.song.artist}</p>
                    </div>
                 </div>
               )}

             </div>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleBack}><ArrowLeft size={24} color="var(--text-primary)" /></button>
          <div onClick={() => setShowProfileInfo(true)} style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', cursor: 'pointer' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'white', overflow: 'hidden', border: '2px solid var(--border-glass)' }}>
              {chatUser.pfpUrl ? <img src={chatUser.pfpUrl} alt="Avatar" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : avatarLetter}
              {isOtherInChat && ( <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '14px', height: '14px', borderRadius: '50%', background: '#34d399', border: '2px solid var(--bg-primary)', boxShadow: '0 0 10px rgba(52, 211, 153, 0.5)' }} /> )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{chatUser.displayName}</h2><Shield size={14} color="#34d399" /></div>
                <span style={{ fontSize: '0.75rem', color: isOtherTyping ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.05em' }}>@{chatUser.username || 'user'}</span> 
                {isOtherInChat && ( <div className="animate-pulse" style={{ width: '6px', height: '6px', background: '#34d399', borderRadius: '50%' }} /> )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('initiate-call', { detail: { chatUser, type: 'audio' } }))}
            title="Audio Call"
            style={{ 
              width: '42px', height: '42px', borderRadius: '50%', 
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-primary)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-gradient)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 0 15px var(--accent-color)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--border-glass)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Phone size={18} />
          </button>
          
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('initiate-call', { detail: { chatUser, type: 'video' } }))}
            title="Video Call"
            style={{ 
              width: '42px', height: '42px', borderRadius: '50%', 
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-primary)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-gradient)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 0 15px var(--accent-color)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--border-glass)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Video size={18} />
          </button>

          <button 
            onClick={() => setShowProfileInfo(true)}
            title="Profile Info"
            style={{ 
              width: '42px', height: '42px', borderRadius: '50%', 
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-primary)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-gradient)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 0 15px var(--accent-color)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--border-glass)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Info size={18} />
          </button>

          <button 
            title="More Options"
            style={{ 
              width: '42px', height: '42px', borderRadius: '50%', 
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-primary)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-gradient)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 0 15px var(--accent-color)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--border-glass)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </header>

      {/* Messages Viewport */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-primary)', position: 'relative' }}>
        {messages.map((msg) => {
          const isMe = msg.sender === currentUserId;
          const isMedia = msg.content && typeof msg.content === 'object' && msg.content.type === 'media';
          return (
            <div 
              key={msg.id} 
              className="animate-pop-in" 
              style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: isMedia ? '60%' : '75%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative', marginBottom: '4px' }} 
              onPointerDown={() => handlePointerDown(msg)} 
              onPointerUp={handlePointerUp} 
              onPointerLeave={handlePointerUp} 
              onContextMenu={e => { e.preventDefault(); setSelectedMessage(msg); }}
              onDoubleClick={() => isMe && !isMedia && handleEditInitDirect(msg)}
            >
              <div style={{ padding: isMedia ? '4px' : '10px 14px 20px 14px', borderRadius: '16px', borderTopRightRadius: isMe ? '4px' : '16px', borderTopLeftRadius: !isMe ? '4px' : '16px', background: isMe ? 'var(--accent-gradient)' : 'var(--bg-glass)', color: 'white', fontSize: '0.9rem', lineHeight: 1.5, boxShadow: isMe ? '0 4px 15px rgba(217, 70, 239, 0.3)' : 'none', position: 'relative', minWidth: '85px', overflow: 'hidden', border: isMe ? 'none' : '1px solid var(--border-glass)', fontFamily: 'var(--font-mono)' }}>
                <div style={{ marginBottom: isMedia ? '0' : '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                   {isMedia ? (
                     <img src={msg.content.url} alt="Media" style={{ width: '100%', borderRadius: '12px', display: 'block', background: 'rgba(255,255,255,0.03)' }} />
                   ) : (
                     <span style={{ wordBreak: 'break-word', display: 'block', letterSpacing: '0.02em' }}>{msg.content}</span>
                   )}
                   {msg.edited && <span style={{ fontSize: '0.55rem', opacity: 0.5, fontWeight: 900, alignSelf: 'flex-end', paddingBottom: '2px' }}>[EDITED]</span>}
                </div>
                <div style={{ position: 'absolute', bottom: '4px', right: '8px', display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.7, background: isMedia ? 'rgba(0,0,0,0.4)' : 'transparent', padding: isMedia ? '2px 6px' : '0', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700 }}>{msg.time}</span> {isMe && (msg.seen ? <CheckCheck size={12} color="#34d399" /> : <Check size={12} />)}
                </div>
              </div>
            </div>
          );
        })}
        
        {isOtherInChat && (
          <div className="animate-fade-in" style={{ alignSelf: 'flex-start', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-gradient)', border: '2px solid rgba(52, 211, 153, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 4px 12px rgba(52, 211, 153, 0.3)' }}>
              {chatUser.pfpUrl ? <img src={chatUser.pfpUrl} alt="Mini Avatar" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span style={{fontSize: '0.7rem', color: 'white', fontWeight: 800}}>{avatarLetter}</span>}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 800 }}>{(chatUser.displayName ? chatUser.displayName.split(' ')[0] : 'Agent')} is reading</span>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', background: 'var(--bg-primary)' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '28px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-glass)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          <input type="text" placeholder={isEditing ? "UPDATING TRANSMISSION..." : (isE2EEReady ? "SECURE TRANSMISSION..." : "ENCRYPTING CHANNEL...")} value={inputText} onChange={handleTyping} disabled={!isE2EEReady} style={{ flex: 1, fontSize: '0.9rem', background: 'transparent', outline: 'none', color: 'white', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }} />
          {isEditing && (
            <button type="button" onClick={() => { setIsEditing(false); setInputText(''); setEditMessageId(null); }} style={{ color: '#f87171', padding: '4px' }}> <X size={20} /> </button>
          )}
          <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: showEmojiPicker ? 'var(--accent-color)' : 'var(--text-secondary)', transition: 'color 0.2s' }}><Smile size={22} /></button>
          <button type="submit" disabled={!inputText.trim() || !isE2EEReady} style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: (inputText.trim() && isE2EEReady) ? 'var(--accent-gradient)' : 'var(--bg-glass)', color: (inputText.trim() && isE2EEReady) ? 'white' : 'var(--text-secondary)', borderRadius: '50%', boxShadow: (inputText.trim() && isE2EEReady) ? '0 0 15px rgba(217, 70, 239, 0.4)' : 'none' }}> 
            {isEditing ? <Check size={20} /> : <Send size={20} />} 
          </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;
