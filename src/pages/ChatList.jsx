import React, { useState, useEffect, useRef } from 'react';
import { Search, Pencil, Loader2, Music, AtSign, Play, Pause, Plus, X, Check, ArrowRight, MessageSquareCode, Shield, Share2, Trash, Zap, Edit3, Trash2, Camera, Video, Type, Image as ImageIcon } from 'lucide-react';
import { ref, onValue, update, get, set, push, serverTimestamp } from 'firebase/database';
import { db, auth } from '../firebase';

const ChatList = ({ onOpenChat }) => {
  const [users, setUsers] = useState([]);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingNoteUid, setPlayingNoteUid] = useState(null);
  const audioRef = useRef(new Audio());
  
  // Note Editor states (Original Status Note)
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [songStartTime, setSongStartTime] = useState(0); 
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [previewAudio, setPreviewAudio] = useState(new Audio());

  // Note Detail states
  const [selectedNoteUser, setSelectedNoteUser] = useState(null);
  const [replies, setReplies] = useState({}); // { noteOwnerUid: [replies] }
  const [replyingToUid, setReplyingToUid] = useState(null); 

  // --- NEW STORIES STATE ---
  const [allStories, setAllStories] = useState({});
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [storyType, setStoryType] = useState('text'); // 'text' | 'image' | 'video'
  const [storyMedia, setStoryMedia] = useState(null); // base64 URL
  const [storyCaption, setStoryCaption] = useState('');
  const [textBgColor, setTextBgColor] = useState('linear-gradient(135deg, #d946ef, #7c3aed)'); // Theme purple-pink
  const [isDeployingStory, setIsDeployingStory] = useState(false);

  // Stories Player states
  const [activeStoryUser, setActiveStoryUser] = useState(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [isStoryPaused, setIsStoryPaused] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Fetch Current User Profile
    const myRef = ref(db, `users/${auth.currentUser.uid}`);
    const unsubscribeMe = onValue(myRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setCurrentUserProfile(data);
        if (!showNoteEditor) {
          setNoteText(data.note || '');
          setSelectedSong(data.song || null);
          setSongStartTime(data.song?.startTime || 0);
        }
      }
    }, (error) => {
      console.error("Fetch current user profile failed:", error);
      setLoading(false);
    });

    // Fetch Other Users
    const usersRef = ref(db, 'users');
    const unsubscribeOthers = onValue(usersRef, (snapshot) => {
      setLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const usersList = Object.keys(data)
          .map(uid => ({ uid, ...data[uid] }))
          .filter(u => u.uid !== auth.currentUser.uid);
        setUsers(usersList);
      } else {
        setUsers([]);
      }
    }, (error) => {
      console.error("Fetch other users failed:", error);
      setLoading(false);
    });

    // Fetch Note Replies for Current User
    const repliesRef = ref(db, `note_replies/${auth.currentUser.uid}`);
    const unsubscribeReplies = onValue(repliesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const formattedReplies = {
          [auth.currentUser.uid]: Object.keys(data).map(rid => ({
            id: rid,
            ...data[rid]
          }))
        };
        setReplies(formattedReplies);
      } else {
        setReplies({});
      }
    }, (error) => {
      console.error("Fetch note replies failed:", error);
    });

    // Fetch All Stories
    const storiesRef = ref(db, 'stories');
    const unsubscribeStories = onValue(storiesRef, (snapshot) => {
      if (snapshot.exists()) {
        setAllStories(snapshot.val());
      } else {
        setAllStories({});
      }
    }, (error) => {
      console.error("Fetch stories failed:", error);
    });

    return () => {
      unsubscribeMe();
      unsubscribeOthers();
      unsubscribeReplies();
      unsubscribeStories();
      audioRef.current.pause();
      previewAudio.pause();
    };
  }, [showNoteEditor]);

  // Story Progress Controller
  useEffect(() => {
    if (!activeStoryUser) return;
    
    const slides = compileUserSlides(activeStoryUser);
    if (slides.length === 0) {
      setActiveStoryUser(null);
      return;
    }
    
    const activeSlide = slides[activeStoryIndex];
    const songUrl = activeSlide.song?.previewUrl;
    const start = activeSlide.song?.startTime || 0;
    
    if (songUrl) {
      audioRef.current.src = songUrl;
      audioRef.current.currentTime = start;
      if (!isStoryPaused) {
        audioRef.current.play().catch(e => console.error("Autoplay blocked:", e));
      } else {
        audioRef.current.pause();
      }
    } else {
      audioRef.current.pause();
    }
    
    const slideDuration = activeSlide.type === 'video' ? 8000 : 5000;
    const intervalTime = 50; 
    let elapsed = 0;
    
    setStoryProgress(0);
    
    const timer = setInterval(() => {
      if (isStoryPaused) return;
      
      elapsed += intervalTime;
      const pct = Math.min((elapsed / slideDuration) * 100, 100);
      setStoryProgress(pct);
      
      if (elapsed >= slideDuration) {
        clearInterval(timer);
        if (activeStoryIndex < slides.length - 1) {
          setActiveStoryIndex(prev => prev + 1);
        } else {
          setActiveStoryUser(null);
          audioRef.current.pause();
        }
      }
    }, intervalTime);
    
    return () => {
      clearInterval(timer);
    };
  }, [activeStoryUser, activeStoryIndex, isStoryPaused]);

  // Helper to filter 24h stories
  const getActiveStories = (uid) => {
    const userStoriesObj = allStories[uid] || {};
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return Object.values(userStoriesObj)
      .filter(s => s.timestamp > oneDayAgo)
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  // Compile user slides (stories + fallback status note)
  const compileUserSlides = (userObj) => {
    const slides = [];
    const richStories = getActiveStories(userObj.uid);
    slides.push(...richStories);
    
    if (slides.length === 0 && ((userObj.note && userObj.note.trim().length > 0) || userObj.song)) {
      slides.push({
        id: 'note_fallback',
        type: 'text',
        caption: userObj.note || '',
        bgColor: 'linear-gradient(135deg, #0f172a, #020617)', // Dark slate fallback
        song: userObj.song || null,
        timestamp: userObj.lastActive || Date.now(),
        isFallback: true
      });
    }
    return slides;
  };

  const handleStoryTap = (e) => {
    const width = window.innerWidth;
    const clickX = e.clientX;
    const slides = compileUserSlides(activeStoryUser);
    
    if (clickX < width / 3) {
      if (activeStoryIndex > 0) {
        setActiveStoryIndex(prev => prev - 1);
      } else {
        setActiveStoryUser(null);
        audioRef.current.pause();
      }
    } else {
      if (activeStoryIndex < slides.length - 1) {
        setActiveStoryIndex(prev => prev + 1);
      } else {
        setActiveStoryUser(null);
        audioRef.current.pause();
      }
    }
  };

  const handleStoryPointerDown = () => {
    setIsStoryPaused(true);
  };

  const handleStoryPointerUp = () => {
    setIsStoryPaused(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const fileType = file.type;
    if (storyType === 'image') {
      if (!fileType.startsWith('image/')) {
        alert("Please select an image file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxVal = 800;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxVal) {
              height *= maxVal / width;
              width = maxVal;
            }
          } else {
            if (height > maxVal) {
              width *= maxVal / height;
              height = maxVal;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setStoryMedia(dataUrl);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } else if (storyType === 'video') {
      if (!fileType.startsWith('video/')) {
        alert("Please select a video file.");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert("Video exceeds 2MB limit.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setStoryMedia(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveStory = async () => {
    if (!auth.currentUser) return;
    setIsDeployingStory(true);
    try {
      const storyId = 'story_' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const storyData = {
        id: storyId,
        type: storyType,
        mediaUrl: storyType === 'text' ? null : storyMedia,
        caption: storyCaption.trim(),
        bgColor: storyType === 'text' ? textBgColor : null,
        song: selectedSong ? { ...selectedSong, startTime: songStartTime } : null,
        timestamp: Date.now()
      };
      
      await set(ref(db, `stories/${auth.currentUser.uid}/${storyId}`), storyData);
      
      // Reset creator state
      setShowStoryCreator(false);
      setStoryCaption('');
      setStoryMedia(null);
      setSelectedSong(null);
    } catch (err) {
      console.error("Save story failed:", err);
    } finally {
      setIsDeployingStory(false);
    }
  };

  const handleDeleteStory = async (e, storyId) => {
    e.stopPropagation();
    try {
      await set(ref(db, `stories/${auth.currentUser.uid}/${storyId}`), null);
      const slides = compileUserSlides(activeStoryUser);
      if (slides.length <= 1) {
        setActiveStoryUser(null);
        audioRef.current.pause();
      } else {
        setActiveStoryIndex(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Delete story failed:", err);
    }
  };

  const handleDeleteNote = async () => {
    if (!auth.currentUser) return;
    try {
      await update(ref(db, `users/${auth.currentUser.uid}`), {
        note: null,
        song: null
      });
      setSelectedNoteUser(null);
    } catch (err) {
      console.error("Delete Note Error:", err);
    }
  };

  const handlePlayNote = (e, user) => {
    e.stopPropagation();
    setSelectedNoteUser(user);
    const songUrl = user.song?.previewUrl;
    const start = user.song?.startTime || 0;

    if (!songUrl) return;

    if (playingNoteUid === user.uid) {
      audioRef.current.pause();
      setPlayingNoteUid(null);
    } else {
      audioRef.current.src = songUrl;
      audioRef.current.currentTime = start;
      audioRef.current.play();
      setPlayingNoteUid(user.uid);
      audioRef.current.onended = () => setPlayingNoteUid(null);
    }
  };

  const searchMusic = async () => {
    if (!musicQuery.trim()) return;
    setIsSearchingMusic(true);
    try {
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(musicQuery)}&entity=song&limit=5`);
      const data = await resp.json();
      setMusicResults(data.results || []);
    } catch (err) {
      console.error("Music search failed", err);
    } finally {
      setIsSearchingMusic(false);
    }
  };

  const safeFormatTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  };

  const togglePreview = (url) => {
    if (previewAudio.src === url) {
      if (previewAudio.paused) {
        previewAudio.currentTime = songStartTime;
        previewAudio.play();
      } else previewAudio.pause();
    } else {
      previewAudio.pause();
      previewAudio.src = url;
      previewAudio.currentTime = songStartTime;
      previewAudio.play();
    }
    setMusicResults([...musicResults]);
  };

  const handleStartTimeChange = (val) => {
    setSongStartTime(val);
    if (previewAudio.src && !previewAudio.paused) {
      previewAudio.currentTime = val;
    }
  };

  const saveNote = async () => {
    if (!auth.currentUser) return;
    setIsSavingNote(true);
    try {
      const songData = selectedSong ? { ...selectedSong, startTime: songStartTime } : null;
      
      if (replyingToUid) {
        await handleReplyToNote(replyingToUid, songData);
      } else {
        await update(ref(db, `users/${auth.currentUser.uid}`), {
          note: noteText.trim(),
          song: songData
        });
      }
      
      setShowNoteEditor(false);
      setReplyingToUid(null);
      previewAudio.pause();
    } catch (err) {
      console.error("Save note failed", err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleReplyToNote = async (ownerUid, replySong) => {
    if (!auth.currentUser) return;
    const replyRef = ref(db, `note_replies/${ownerUid}`);
    await push(replyRef, {
      uid: auth.currentUser.uid,
      displayName: currentUserProfile?.displayName || 'User',
      username: currentUserProfile?.username || 'user',
      pfpUrl: currentUserProfile?.pfpUrl || '',
      song: replySong,
      timestamp: serverTimestamp()
    });
    setSelectedNoteUser(null);
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Intel Feed: Users with notes OR stories
  const usersWithFeedItems = users.filter(u => {
    const hasNote = (u.note && u.note.trim().length > 0) || u.song;
    const hasStories = getActiveStories(u.uid).length > 0;
    return hasNote || hasStories;
  });

  const myAvatarLetter = currentUserProfile?.displayName?.charAt(0).toUpperCase() || '?';
  const myStories = getActiveStories(auth.currentUser?.uid || '');

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--bg-primary)' }}>
      
      {/* Story Creator Modal */}
      {showStoryCreator && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1150, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', padding: '24px 20px', animation: 'slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <button onClick={() => { setShowStoryCreator(false); setStoryMedia(null); setSelectedSong(null); previewAudio.pause(); }} style={{ padding: '8px', background: 'var(--bg-glass)', borderRadius: '50%' }}><X size={24} /></button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Deploy Story Status</h2>
            <button onClick={saveStory} disabled={isDeployingStory || (storyType !== 'text' && !storyMedia)} style={{ padding: '10px 24px', background: 'var(--accent-gradient)', borderRadius: '24px', color: 'white', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(217, 70, 239, 0.4)', opacity: (storyType !== 'text' && !storyMedia) ? 0.5 : 1 }}>
              {isDeployingStory ? <Loader2 className="animate-spin" size={18} /> : 'Deploy'}
            </button>
          </header>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '28px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflowY: 'auto' }}>
            {/* Type Selector */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
              {[
                { id: 'text', label: 'Intel Text', icon: <Type size={16} /> },
                { id: 'image', label: 'Photo', icon: <ImageIcon size={16} /> },
                { id: 'video', label: 'Video Clip', icon: <Video size={16} /> }
              ].map(t => (
                <button key={t.id} onClick={() => { setStoryType(t.id); setStoryMedia(null); }} style={{ flex: 1, padding: '10px', borderRadius: '12px', background: storyType === t.id ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.03)', color: 'white', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Creator Viewport */}
            <div style={{ position: 'relative', width: '100%', height: '240px', borderRadius: '20px', background: storyType === 'text' ? textBgColor : 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
              {storyType === 'text' && (
                <textarea 
                  placeholder="Type secure report status..." 
                  value={storyCaption} 
                  onChange={e => setStoryCaption(e.target.value)}
                  style={{ width: '85%', background: 'transparent', border: 'none', color: 'white', fontSize: '1.25rem', fontWeight: 700, textAlign: 'center', resize: 'none', outline: 'none', minHeight: '100px' }} 
                />
              )}

              {storyType === 'image' && (
                storyMedia ? (
                  <img src={storyMedia} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <button onClick={() => fileInputRef.current.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--accent-color)' }}>
                    <Camera size={36} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>UPLOAD IMAGE</span>
                  </button>
                )
              )}

              {storyType === 'video' && (
                storyMedia ? (
                  <video src={storyMedia} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <button onClick={() => fileInputRef.current.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--accent-color)' }}>
                    <Video size={36} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>UPLOAD VIDEO (MAX 2MB)</span>
                  </button>
                )
              )}

              {storyType !== 'text' && storyMedia && (
                <button onClick={() => setStoryMedia(null)} style={{ position: 'absolute', top: '12px', right: '12px', padding: '6px', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', color: 'white' }}><X size={16} /></button>
              )}
            </div>

            <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept={storyType === 'image' ? "image/*" : "video/*"} />

            {/* Background Color Picker for Text Stories */}
            {storyType === 'text' && (
              <div>
                <p style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px' }}>BACKGROUND SHIELD</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    'linear-gradient(135deg, #10b981, #065f46)', // Cyber green
                    'linear-gradient(135deg, #7c3aed, #4c1d95)', // Cyber purple
                    'linear-gradient(135deg, #ef4444, #7f1d1d)', // Crimson ops
                    'linear-gradient(135deg, #1e293b, #0f172a)'  // Dark carbon
                  ].map(gradient => (
                    <button key={gradient} onClick={() => setTextBgColor(gradient)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: gradient, border: textBgColor === gradient ? '2px solid white' : 'none', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Captions for Media */}
            {storyType !== 'text' && (
              <input 
                type="text" 
                placeholder="Write a caption..." 
                value={storyCaption}
                onChange={e => setStoryCaption(e.target.value)}
                style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid var(--border-glass)', color: 'white' }} 
              />
            )}

            {/* iTunes Song Selector (Unified) */}
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Music size={18} color="var(--accent-color)" />
                <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Attach Audio Track</span>
              </div>
              
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input 
                  type="text" 
                  placeholder="Search audio..." 
                  value={musicQuery}
                  onChange={e => setMusicQuery(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && searchMusic()}
                  style={{ width: '100%', padding: '12px 12px 12px 42px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', color: 'white', border: '1px solid var(--border-glass)' }} 
                />
              </div>

              {musicResults.length > 0 && !selectedSong && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {musicResults.map(song => (
                    <div key={song.trackId} onClick={() => { setSelectedSong({ title: song.trackName, artist: song.artistName, previewUrl: song.previewUrl, artwork: song.artworkUrl100 }); setSongStartTime(0); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                      <img src={song.artworkUrl60} style={{ width: '40px', height: '40px', borderRadius: '8px' }} alt="" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.trackName}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{song.artistName}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); togglePreview(song.previewUrl); }} style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {previewAudio.src === song.previewUrl && !previewAudio.paused ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedSong && (
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <img src={selectedSong.artwork} style={{ width: '48px', height: '48px', borderRadius: '10px' }} alt="" />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 800, fontSize: '0.95rem' }}>{selectedSong.title}</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedSong.artist}</p>
                    </div>
                    <button onClick={() => setSelectedSong(null)} style={{ color: '#ef4444', padding: '6px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}><X size={16} /></button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 700 }}>
                      <span>Start Stanza</span>
                      <span>{songStartTime}s</span>
                    </div>
                    <input type="range" min="0" max="25" step="1" value={songStartTime} onChange={e => handleStartTimeChange(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-color)' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stories Viewer Player Overlay */}
      {activeStoryUser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'black', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
          {/* Progress indicators */}
          <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', display: 'flex', gap: '6px', zIndex: 1220 }}>
            {compileUserSlides(activeStoryUser).map((slide, idx) => (
              <div key={slide.id} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  background: 'white', 
                  width: idx < activeStoryIndex ? '100%' : (idx === activeStoryIndex ? `${storyProgress}%` : '0%'),
                  transition: idx === activeStoryIndex ? 'width 50ms linear' : 'none'
                }} />
              </div>
            ))}
          </div>

          {/* User profile header info */}
          <div style={{ position: 'absolute', top: '32px', left: '16px', right: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-gradient)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, color: 'white', border: '1.5px solid white' }}>
                {activeStoryUser.pfpUrl ? <img src={activeStoryUser.pfpUrl} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : activeStoryUser.displayName?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 style={{ color: 'white', fontSize: '0.9rem', fontWeight: 800 }}>{activeStoryUser.displayName}</h4>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600 }}>@{activeStoryUser.username}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {activeStoryUser.uid === auth.currentUser.uid && !compileUserSlides(activeStoryUser)[activeStoryIndex].isFallback && (
                <button onClick={(e) => handleDeleteStory(e, compileUserSlides(activeStoryUser)[activeStoryIndex].id)} style={{ color: '#ef4444', padding: '8px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '50%' }}><Trash2 size={18} /></button>
              )}
              <button onClick={() => { setActiveStoryUser(null); audioRef.current.pause(); }} style={{ color: 'white', padding: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%' }}><X size={20} /></button>
            </div>
          </div>

          {/* Main Story Content Viewport */}
          <div 
            onClick={handleStoryTap}
            onPointerDown={handleStoryPointerDown}
            onPointerUp={handleStoryPointerUp}
            onPointerLeave={handleStoryPointerUp}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'pointer' }}
          >
            {compileUserSlides(activeStoryUser)[activeStoryIndex].type === 'text' && (
              <div style={{ width: '100%', height: '100%', background: compileUserSlides(activeStoryUser)[activeStoryIndex].bgColor || 'linear-gradient(135deg, #1e293b, #0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                <p style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, textAlign: 'center', wordBreak: 'break-word', maxWidth: '90%' }}>
                  {compileUserSlides(activeStoryUser)[activeStoryIndex].caption}
                </p>
              </div>
            )}

            {compileUserSlides(activeStoryUser)[activeStoryIndex].type === 'image' && (
              <div style={{ width: '100%', height: '100%', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={compileUserSlides(activeStoryUser)[activeStoryIndex].mediaUrl} alt="Story" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                {compileUserSlides(activeStoryUser)[activeStoryIndex].caption && (
                  <div style={{ position: 'absolute', bottom: '80px', left: '20px', right: '20px', background: 'rgba(0,0,0,0.6)', padding: '12px 18px', borderRadius: '16px', color: 'white', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {compileUserSlides(activeStoryUser)[activeStoryIndex].caption}
                  </div>
                )}
              </div>
            )}

            {compileUserSlides(activeStoryUser)[activeStoryIndex].type === 'video' && (
              <div style={{ width: '100%', height: '100%', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video src={compileUserSlides(activeStoryUser)[activeStoryIndex].mediaUrl} autoPlay muted={!!compileUserSlides(activeStoryUser)[activeStoryIndex].song} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                {compileUserSlides(activeStoryUser)[activeStoryIndex].caption && (
                  <div style={{ position: 'absolute', bottom: '80px', left: '20px', right: '20px', background: 'rgba(0,0,0,0.6)', padding: '12px 18px', borderRadius: '16px', color: 'white', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {compileUserSlides(activeStoryUser)[activeStoryIndex].caption}
                  </div>
                )}
              </div>
            )}

            {/* Song Tag overlay */}
            {compileUserSlides(activeStoryUser)[activeStoryIndex].song && (
              <div className="glass-panel" style={{ position: 'absolute', bottom: '32px', left: '16px', right: '16px', padding: '12px 16px', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.1)' }}>
                <Music size={16} color="var(--accent-color)" className="animate-pulse" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: 'white', fontSize: '0.8rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{compileUserSlides(activeStoryUser)[activeStoryIndex].song.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>{compileUserSlides(activeStoryUser)[activeStoryIndex].song.artist}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Note Editor Modal (Original fallback note status creator) */}
      {showNoteEditor && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1100, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', padding: '24px 20px', animation: 'slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
           <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <button onClick={() => { setShowNoteEditor(false); setReplyingToUid(null); previewAudio.pause(); }} style={{ padding: '8px', background: 'var(--bg-glass)', borderRadius: '50%' }}><X size={24} /></button>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{replyingToUid ? 'Reply with Song' : 'Share a Note'}</h2>
              <button onClick={saveNote} disabled={isSavingNote} style={{ padding: '10px 24px', background: 'var(--accent-gradient)', borderRadius: '24px', color: 'white', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(217, 70, 239, 0.4)' }}>
                {isSavingNote ? <Loader2 className="animate-spin" size={18} /> : (replyingToUid ? 'Reply' : 'Share')}
              </button>
           </header>

           <div className="glass-panel" style={{ padding: '24px', borderRadius: '32px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                 <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-gradient)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 800, color: 'white', border: '2px solid var(--border-glass)' }}>
                    {currentUserProfile?.pfpUrl ? <img src={currentUserProfile.pfpUrl} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="" /> : myAvatarLetter}
                 </div>
                 <div style={{ flex: 1 }}>
                    <textarea 
                      placeholder="Share a thought..." 
                      value={noteText} 
                      onChange={e => setNoteText(e.target.value)}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', fontWeight: 500, resize: 'none', outline: 'none', minHeight: '80px' }} 
                    />
                 </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '24px' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ padding: '8px', background: 'rgba(217, 70, 239, 0.1)', borderRadius: '12px' }}>
                      <Music size={20} color="var(--accent-color)" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1rem' }}>Choose a Stanza</span>
                 </div>
                 
                 <div style={{ position: 'relative', marginBottom: '20px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                    <input 
                      type="text" 
                      placeholder="Search songs..." 
                      value={musicQuery}
                      onChange={e => setMusicQuery(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && searchMusic()}
                      style={{ width: '100%', padding: '16px 14px 16px 52px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', color: 'white', border: '1px solid var(--border-glass)' }} 
                    />
                 </div>

                 {musicResults.length > 0 && !selectedSong && (
                   <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {musicResults.map(song => (
                        <div key={song.trackId} onClick={() => { setSelectedSong({ title: song.trackName, artist: song.artistName, previewUrl: song.previewUrl, artwork: song.artworkUrl100 }); setSongStartTime(0); }} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid transparent', cursor: 'pointer', transition: '0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                           <img src={song.artworkUrl60} style={{ width: '48px', height: '48px', borderRadius: '12px' }} alt="" />
                           <div style={{ flex: 1, minWidth: 0 }}>
                             <p style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.trackName}</p>
                             <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{song.artistName}</p>
                           </div>
                           <button onClick={(e) => { e.stopPropagation(); togglePreview(song.previewUrl); }} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                              {previewAudio.src === song.previewUrl && !previewAudio.paused ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
                           </button>
                        </div>
                      ))}
                   </div>
                 )}

                 {selectedSong && (
                   <div className="animate-scale-in" style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '24px', border: '1px solid var(--border-glass)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                        <img src={selectedSong.artwork} style={{ width: '64px', height: '64px', borderRadius: '14px', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }} alt="" />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{selectedSong.title}</p>
                          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selectedSong.artist}</p>
                        </div>
                        <button onClick={() => setSelectedSong(null)} style={{ color: '#ef4444', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}><X size={20} /></button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                            <span>Select Stanza</span>
                            <span>{Math.floor(songStartTime)}s / 30s</span>
                         </div>
                         <input 
                           type="range" min="0" max="25" step="1" 
                           value={songStartTime} 
                           onChange={e => handleStartTimeChange(parseInt(e.target.value))}
                           style={{ width: '100%', accentColor: 'var(--accent-color)', height: '6px', cursor: 'pointer' }}
                         />
                         <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.6 }}>Drag to select the starting point of your 30s preview</p>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Note Detail Overlay */}
      {selectedNoteUser && (
        <div onClick={() => setSelectedNoteUser(null)} style={{ position: 'absolute', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', animation: 'fade-in 0.3s ease' }}>
           <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--bg-primary)', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '32px 24px', animation: 'slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ width: '40px', height: '4px', background: 'var(--border-glass)', borderRadius: '2px', margin: '0 auto 24px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                 <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-gradient)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: 'white', border: '2px solid var(--accent-color)', flexShrink: 0 }}>
                    {selectedNoteUser.pfpUrl ? <img src={selectedNoteUser.pfpUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (selectedNoteUser.displayName?.charAt(0) || 'A')}
                 </div>
                 <div>
                    <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{selectedNoteUser.displayName || 'Agent'}</h2>
                    <p style={{ color: 'var(--accent-color)', fontWeight: 700 }}>@{selectedNoteUser.username || 'user'}</p>
                 </div>
              </div>

              <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', marginBottom: '32px', background: 'rgba(255,255,255,0.02)' }}>
                 <p style={{ fontSize: '1.3rem', fontWeight: 500, marginBottom: '24px', fontStyle: selectedNoteUser.note ? 'normal' : 'italic', color: selectedNoteUser.note ? 'white' : 'var(--text-secondary)' }}>
                    {selectedNoteUser.note || "Just vibing to music..."}
                 </p>
                 
                 {selectedNoteUser.song && (
                   <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--accent-gradient)', borderRadius: '20px', boxShadow: '0 10px 30px rgba(34, 197, 94, 0.3)' }}>
                      <img src={selectedNoteUser.song.artwork || selectedNoteUser.song.artworkUrl100} style={{ width: '60px', height: '60px', borderRadius: '12px', objectFit: 'cover' }} alt="" />
                      <div style={{ flex: 1 }}>
                         <p style={{ fontWeight: 800, color: 'white' }}>{selectedNoteUser.song.title}</p>
                         <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>{selectedNoteUser.song.artist}</p>
                      </div>
                      <button onClick={(e) => handlePlayNote(e, selectedNoteUser)} style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                         {playingNoteUid === selectedNoteUser.uid ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                      </button>
                   </div>
                 )}
              </div>

              <div style={{ marginBottom: '24px' }}>
                 <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={14} fill="var(--accent-color)" color="var(--accent-color)" /> INTEL REPLIES
                 </h3>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {replies[selectedNoteUser.uid]?.map(reply => (
                      <div key={reply.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                         <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-gradient)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, color: 'white', flexShrink: 0 }}>
                            {reply.pfpUrl ? <img src={reply.pfpUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (reply.displayName?.charAt(0) || reply.username?.charAt(0) || 'A')}
                         </div>
                         <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                               <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{reply.username || 'agent'}</span>
                               <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>• {safeFormatTime(reply.timestamp)}</span>
                            </div>
                            <div style={{ marginTop: '4px', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                               {reply.song && <Music size={14} color="var(--accent-color)" />}
                               <span style={{ fontSize: '0.85rem' }}>{reply.song ? <span>shared <b>{reply.song.title}</b></span> : (reply.note || 'Hey!')}</span>
                            </div>
                         </div>
                      </div>
                    )) || <p style={{ textAlign: 'center', opacity: 0.4, padding: '20px' }}>Be the first to reply with a song!</p>}
                 </div>
              </div>

              {/* Action Buttons: Reply or Delete/Update */}
              {selectedNoteUser.uid === auth.currentUser.uid ? (
                <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
                  <button 
                    onClick={() => { setShowNoteEditor(true); setSelectedNoteUser(null); }}
                    style={{ flex: 1, padding: '16px', borderRadius: '24px', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)', color: 'white', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Pencil size={18} /> Update Note
                  </button>
                  <button 
                    onClick={handleDeleteNote}
                    style={{ flex: 1, padding: '16px', borderRadius: '24px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Trash size={18} /> Delete
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => { setReplyingToUid(selectedNoteUser.uid); setShowNoteEditor(true); setSelectedNoteUser(null); }}
                  style={{ width: '100%', padding: '18px', background: 'var(--accent-gradient)', borderRadius: '24px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'white', boxShadow: '0 10px 25px rgba(217, 70, 239, 0.4)' }}
                >
                  <Plus size={24} /> Reply with a Song
                </button>
              )}
           </div>
        </div>
      )}

      {/* Header */}
      <header style={{ padding: '24px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '0.15em', background: 'linear-gradient(to right, #fff, rgba(255,255,255,0.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>REGISTRY</h1>
        <button 
          onClick={() => setShowStoryCreator(true)}
          style={{ 
            width: '44px', height: '44px', borderRadius: '50%', 
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}
        >
          <Camera size={20} color="var(--accent-color)" />
        </button>
      </header>

      {/* Stories / Notes Section */}
      <div style={{ marginBottom: '24px' }}>
          <div style={{ padding: '0 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>INTEL STORIES</span>
             <div style={{ width: '40px', height: '2px', background: 'var(--accent-gradient)', borderRadius: '1px' }} />
          </div>
          
          <div style={{ 
            padding: '16px 20px 32px', display: 'flex', gap: '28px', overflowX: 'auto', 
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', minHeight: '140px' 
          }}>
              
              {/* Current User "Your Story / Note" */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', minWidth: '84px' }}>
                <div style={{ position: 'relative' }}>
                  <div 
                    onClick={() => {
                      if (myStories.length > 0) {
                        setActiveStoryUser({...currentUserProfile, uid: auth.currentUser.uid});
                        setActiveStoryIndex(0);
                      } else {
                        setShowStoryCreator(true);
                      }
                    }}
                    style={{ 
                      width: '76px', height: '76px', borderRadius: '50%', padding: '3px', 
                      background: myStories.length > 0 ? 'var(--accent-gradient)' : 'var(--border-glass)',
                      cursor: 'pointer',
                      boxShadow: myStories.length > 0 ? '0 0 15px var(--accent-color)' : 'none'
                    }}
                  >
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-primary)', padding: '2px' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-secondary)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', opacity: 0.8 }}>
                        {currentUserProfile?.pfpUrl ? <img src={currentUserProfile.pfpUrl} alt="Note" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : myAvatarLetter}
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    onClick={() => setShowStoryCreator(true)}
                    style={{ position: 'absolute', bottom: '2px', right: '2px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-gradient)', border: '3px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(217, 70, 239, 0.4)', cursor: 'pointer' }}
                  >
                    <Plus size={14} color="white" />
                  </div>
                  
                  {/* Current Fallback Note Bubble */}
                  {(currentUserProfile?.note || currentUserProfile?.song) && myStories.length === 0 && (
                    <div 
                      onClick={(e) => { e.stopPropagation(); setSelectedNoteUser({...currentUserProfile, uid: auth.currentUser.uid}); }}
                      style={{ 
                        position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255, 255, 255, 0.22)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.2)',
                        padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', whiteSpace: 'nowrap',
                        maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white',
                        boxShadow: '0 12px 35px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: '8px',
                        zIndex: 10, borderBottom: '2.5px solid var(--accent-color)', cursor: 'pointer'
                      }}
                    >
                      {currentUserProfile.song ? (playingNoteUid === auth.currentUser.uid ? <Pause size={14} fill="white" /> : <Music size={14} color="var(--accent-color)" />) : <AtSign size={14} color="var(--accent-color)" />}
                      <span style={{ fontWeight: 800 }}>{currentUserProfile.note || currentUserProfile.song?.title}</span>
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Your Status</span>
              </div>

              {/* Other Users' Stories/Notes */}
              {usersWithFeedItems.map(user => {
                const userActiveStories = getActiveStories(user.uid);
                const hasActiveStories = userActiveStories.length > 0;
                
                return (
                  <div 
                    key={user.uid} 
                    onClick={() => {
                      if (hasActiveStories) {
                        setActiveStoryUser(user);
                        setActiveStoryIndex(0);
                      } else {
                        setSelectedNoteUser(user);
                      }
                    }} 
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', minWidth: '84px', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} 
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'} 
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ position: 'relative' }}>
                      <div style={{ 
                        width: '76px', height: '76px', borderRadius: '50%', padding: '3px',
                        background: hasActiveStories ? 'var(--accent-gradient)' : 'var(--border-glass)',
                        boxShadow: hasActiveStories ? '0 0 15px var(--accent-color)' : 'none'
                      }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-primary)', padding: '2px' }}>
                          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--accent-gradient)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
                            {user.pfpUrl ? <img src={user.pfpUrl} alt="Note" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (user.displayName?.charAt(0) || '?')}
                          </div>
                        </div>
                      </div>
                      
                      {/* Online Status Dot */}
                      {user.status === 'online' && (
                        <div style={{ 
                          position: 'absolute', bottom: '2px', right: '4px', width: '18px', height: '18px', 
                          borderRadius: '50%', background: '#34d399', border: '3px solid var(--bg-primary)',
                          boxShadow: '0 0 15px rgba(52, 211, 153, 0.6)', zIndex: 1
                        }} />
                      )}
                      
                      {/* Note Bubble (Display only if user has no active stories) */}
                      {!hasActiveStories && (user.note || user.song) && (
                        <div 
                          onClick={(e) => { e.stopPropagation(); handlePlayNote(e, user); }}
                          style={{ 
                            position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(255, 255, 255, 0.18)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(255,255,255,0.1)',
                            padding: '5px 14px', borderRadius: '18px', fontSize: '0.8rem', whiteSpace: 'nowrap',
                            maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '8px',
                            zIndex: 10
                          }}
                        >
                          {user.song ? (playingNoteUid === user.uid ? <Pause size={12} fill="white" /> : <Music size={12} color="var(--accent-color)" />) : <AtSign size={12} color="var(--accent-color)" />}
                          <span style={{ fontWeight: 700 }}>{user.note || user.song?.title || 'Hey!'}</span>
                        </div>
                      )}

                      {/* Reply Stack indicator */}
                      {replies[user.uid] && !hasActiveStories && (
                        <div style={{ position: 'absolute', top: '10px', right: '-10px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent-color)', border: '2px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: 'white', zIndex: 11 }}>
                          {replies[user.uid].length}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.85rem', color: hasActiveStories ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: 800, maxWidth: '84px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                      {user.username || (user.displayName ? user.displayName.split(' ')[0] : 'Agent')}
                    </span>
                  </div>
                );
              })}
          </div>
      </div>

      <div style={{ padding: '0 20px', marginBottom: '16px' }}>
        <div style={{ 
          display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', 
          padding: '16px 20px', borderRadius: '24px', gap: '14px',
          border: '1px solid var(--border-glass)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
        }}>
          <Search size={20} color="var(--accent-color)" style={{ opacity: 0.8 }} />
          <input 
            type="text" 
            placeholder="Search creators..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '1rem', background: 'transparent', outline: 'none', color: 'white', fontWeight: 500 }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 100px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <Loader2 className="animate-spin" color="var(--accent-color)" size={32} />
          </div>
         ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', color: 'var(--text-secondary)' }}>
            <Search size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
            <p style={{ fontWeight: 600 }}>No users found for "{searchQuery}"</p>
          </div>
         ) : filteredUsers.map(user => {
          const avatarLetter = user.displayName ? user.displayName.charAt(0).toUpperCase() : '?';
          
          return (
            <div 
              key={user.uid}
              onClick={() => onOpenChat(user)}
              style={{
                display: 'flex', alignItems: 'center', padding: '14px 16px', 
                borderRadius: '24px', cursor: 'pointer', transition: 'all 0.2s ease',
                marginBottom: '6px', background: 'rgba(255,255,255,0.01)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
            >
              <div style={{ position: 'relative', marginRight: '18px', flexShrink: 0 }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'var(--accent-gradient)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 800, color: 'white',
                  overflow: 'hidden',
                  border: '2px solid var(--border-glass)', boxShadow: '0 6px 16px rgba(0,0,0,0.3)'
                }}>
                  {user.pfpUrl ? <img src={user.pfpUrl} alt="Avatar" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : avatarLetter}
                </div>
                {user.status === 'online' && (
                  <div style={{ 
                    position: 'absolute', bottom: '0', right: '0', width: '18px', height: '18px', 
                    borderRadius: '50%', background: '#34d399', border: '3px solid var(--bg-primary)',
                    boxShadow: '0 0 20px rgba(52, 211, 153, 0.7)'
                  }} />
                )}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
                    {user.displayName}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <p style={{ 
                    color: 'var(--accent-color)', 
                    fontSize: '0.9rem', fontWeight: 700
                  }}>
                    @{user.username || 'user'}
                  </p>
                  {user.song && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '8px' }}>
                      <Music size={12} color="var(--accent-color)" /> <span style={{ opacity: 0.8, fontWeight: 600 }}>{user.song.title}</span>
                    </div>
                  )}
                </div>
                
                {/* Unread Message Count Badge */}
                {currentUserProfile?.unread_counts?.[user.uid]?.count > 0 && (
                  <div className="animate-pop-in" style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'var(--accent-gradient)', borderRadius: '12px', boxShadow: '0 4px 15px rgba(217, 70, 239, 0.4)' }}>
                    <MessageSquareCode size={14} color="white" fill="white" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 900, color: 'white' }}>
                      {currentUserProfile.unread_counts[user.uid].count} SECURE MESSAGE{currentUserProfile.unread_counts[user.uid].count > 1 ? 'S' : ''}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ opacity: 0.3 }}>
                 <ArrowRight size={20} />
              </div>
            </div>
          );
         })}
      </div>
    </div>
  );
};

export default ChatList;
