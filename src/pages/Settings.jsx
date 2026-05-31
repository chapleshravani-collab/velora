import React, { useState, useEffect, useRef } from 'react';
import { User, Bell, Lock, Palette, HelpCircle, LogOut, ChevronRight, Edit2, Check, X, Loader2, AtSign, AlignLeft, Music, Image as ImageIcon, Search, Play, Pause, Phone, Shield, Zap, Terminal } from 'lucide-react';
import { ref, onValue, update, get, set } from 'firebase/database';
import { db, auth } from '../firebase';

const Settings = ({ onLogout }) => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [previewAudio, setPreviewAudio] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Edit states
  const [editData, setEditData] = useState({
    displayName: '',
    username: '',
    bio: '',
    pfpUrl: '',
    nickname: '',
    phoneNumber: '',
    song: null
  });

  // Music search states inside Settings
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const userRef = ref(db, `users/${auth.currentUser.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setProfile(data);
        if (!isEditing) {
          setEditData({
            displayName: data.displayName || '',
            username: data.username || '',
            bio: data.bio || '',
            pfpUrl: data.pfpUrl || '',
            nickname: data.nickname || '',
            phoneNumber: data.phoneNumber || '',
            song: data.song || null
          });
        }
      }
    }, (error) => {
      console.error("Settings profile data loading failed:", error);
    });

    return () => unsubscribe();
  }, [isEditing]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setEditData({ ...editData, pfpUrl: dataUrl });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const togglePreview = (url) => {
    if (previewAudio && previewAudio.src === url) {
      if (previewAudio.paused) previewAudio.play();
      else previewAudio.pause();
    } else {
      if (previewAudio) previewAudio.pause();
      const audio = new Audio(url);
      audio.play();
      setPreviewAudio(audio);
    }
  };

  useEffect(() => {
    return () => { if (previewAudio) previewAudio.pause(); };
  }, [previewAudio]);

  const handleSaveProfile = async () => {
    if (!editData.displayName.trim() || !auth.currentUser) return;
    setError('');
    setIsSaving(true);
    
    try {
      const uid = auth.currentUser.uid;
      const cleanUsername = editData.username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
      
      if (cleanUsername !== profile?.username) {
        if (cleanUsername.length < 3) {
          setError('Username too short (min 3 chars)');
          setIsSaving(false);
          return;
        }
        const usernameRef = ref(db, `usernames/${cleanUsername}`);
        const existing = await get(usernameRef);
        if (existing.exists() && existing.val() !== uid) {
          setError('Username already taken!');
          setIsSaving(false);
          return;
        }
        if (profile?.username) await set(ref(db, `usernames/${profile.username}`), null);
        await set(usernameRef, uid);
      }

      await update(ref(db, `users/${uid}`), {
        displayName: editData.displayName.trim(),
        username: cleanUsername,
        bio: editData.bio.trim(),
        pfpUrl: editData.pfpUrl,
        nickname: editData.nickname ? editData.nickname.trim() : '',
        phoneNumber: editData.phoneNumber ? editData.phoneNumber.trim() : '',
        song: editData.song || null
      });
      
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update profile", error);
      setError('Update failed.');
    } finally {
      setIsSaving(false);
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

  const avatarLetter = profile?.displayName ? profile.displayName.charAt(0).toUpperCase() : (auth.currentUser?.email?.charAt(0).toUpperCase() || '?');

  if (!profile) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', gap: '20px' }}>
      <div style={{ position: 'relative' }}>
        <Loader2 className="animate-spin" color="var(--accent-color)" size={48} />
        <Zap size={20} color="var(--accent-color)" fill="var(--accent-color)" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate( -50%, -50%)' }} />
      </div>
      <p style={{ fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.3em', color: 'var(--accent-color)', animation: 'pulse 2s infinite' }}>INITIALIZING COMMAND CENTER...</p>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', position: 'relative' }}>
      <div className="scanline" style={{ pointerEvents: 'none' }} />
      <header style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.15em' }}>COMMAND CENTER</h1>
        {isEditing ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setIsEditing(false)} style={{ padding: '8px', background: 'var(--bg-glass)', borderRadius: '50%', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
            <button onClick={handleSaveProfile} disabled={isSaving} style={{ padding: '8px', background: 'var(--accent-gradient)', borderRadius: '50%', color: 'white' }}>
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
            </button>
          </div>
        ) : (
          <button onClick={() => { setIsEditing(true); setError(''); }} style={{ padding: '8px', background: 'var(--bg-glass)', borderRadius: '50%', color: 'var(--text-primary)' }}>
            <Edit2 size={20} />
          </button>
        )}
      </header>

      <div style={{ padding: '0 20px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {error && (
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AtSign size={16} /> {error}
          </div>
        )}

        {/* Profile Card */}
        <div className="glass-panel" style={{
          padding: '24px', borderRadius: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)'
        }}>
          <div 
            onClick={() => isEditing && fileInputRef.current.click()}
            style={{
              width: '110px', height: '110px', borderRadius: '50%',
              background: 'var(--accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2.8rem', fontWeight: 700, color: 'white', flexShrink: 0,
              overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              border: '4px solid var(--border-glass)', cursor: isEditing ? 'pointer' : 'default',
              position: 'relative'
            }}
          >
            {(editData.pfpUrl || profile?.pfpUrl) ? <img src={editData.pfpUrl || profile.pfpUrl} alt="Avatar" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : avatarLetter}
            {isEditing && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Edit2 size={24} color="white" />
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" style={{ display: 'none' }} />
          </div>
          
          <div style={{ width: '100%' }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input type="text" placeholder="Full Name" value={editData.displayName} onChange={e => setEditData({...editData, displayName: e.target.value})} style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '14px', fontSize: '1.1rem', fontWeight: 600, color: 'white' }} />
                
                <div style={{ position: 'relative' }}>
                  <AtSign size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input type="text" placeholder="username" value={editData.username} onChange={e => setEditData({...editData, username: e.target.value.toLowerCase()})} style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '14px', fontSize: '1rem', color: 'white' }} />
                </div>

                {/* Nickname Input */}
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input type="text" placeholder="Nickname" value={editData.nickname} onChange={e => setEditData({...editData, nickname: e.target.value})} style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '14px', fontSize: '1rem', color: 'white' }} />
                </div>

                {/* Phone Number Input */}
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input type="text" placeholder="Phone Number" value={editData.phoneNumber} onChange={e => setEditData({...editData, phoneNumber: e.target.value})} style={{ width: '100%', padding: '12px 14px 12px 42px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '14px', fontSize: '1rem', color: 'white' }} />
                </div>

                <div style={{ position: 'relative' }}>
                  <AlignLeft size={16} style={{ position: 'absolute', left: '14px', top: '16px', opacity: 0.5 }} />
                  <textarea placeholder="Write a bio..." value={editData.bio} onChange={e => setEditData({...editData, bio: e.target.value})} style={{ width: '100%', padding: '14px 14px 14px 42px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '14px', fontSize: '0.95rem', minHeight: '90px', resize: 'none', color: 'white' }} />
                </div>

                {/* Selected Song Preview and Search inside Editing */}
                <div style={{ border: '1px solid var(--border-glass)', padding: '16px', borderRadius: '18px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-color)', letterSpacing: '0.05em' }}>PROFILE SONG</span>
                  {editData.song ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={editData.song.artwork} alt="" style={{ width: '36px', height: '36px', borderRadius: '6px' }} />
                        <div style={{ textAlign: 'left', minWidth: 0 }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editData.song.title}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editData.song.artist}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button type="button" onClick={() => togglePreview(editData.song.previewUrl)} style={{ padding: '6px', background: 'var(--bg-glass)', borderRadius: '50%', border: 'none', color: 'white', cursor: 'pointer' }}>
                          {previewAudio?.src === editData.song.previewUrl && !previewAudio.paused ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button type="button" onClick={() => setEditData({ ...editData, song: null })} style={{ padding: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '50%', border: 'none', cursor: 'pointer' }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'left' }}>No song selected</div>
                  )}

                  {/* iTunes Music Search Bar */}
                  <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Music size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                      <input 
                        type="text" 
                        placeholder="Search profile song..." 
                        value={musicQuery} 
                        onChange={e => setMusicQuery(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchMusic())}
                        style={{ width: '100%', padding: '10px 10px 10px 36px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '12px', fontSize: '0.85rem', color: 'white' }} 
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={searchMusic} 
                      style={{ padding: '0 16px', background: 'var(--accent-gradient)', border: 'none', borderRadius: '12px', color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {isSearchingMusic ? <Loader2 className="animate-spin" size={14} /> : 'Search'}
                    </button>
                  </div>

                  {/* iTunes Search Results */}
                  {musicResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                      {musicResults.map(s => (
                        <div 
                          key={s.trackId} 
                          onClick={() => {
                            setEditData({
                              ...editData,
                              song: {
                                title: s.trackName,
                                artist: s.artistName,
                                artwork: s.artworkUrl100,
                                previewUrl: s.previewUrl,
                                startTime: 0
                              }
                            });
                            setMusicResults([]);
                            setMusicQuery('');
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'background 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        >
                          <img src={s.artworkUrl100} alt="" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.trackName}</p>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{s.artistName}</p>
                          </div>
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePreview(s.previewUrl);
                            }}
                            style={{ padding: '6px', background: 'var(--bg-glass)', borderRadius: '50%', border: 'none', color: 'white', cursor: 'pointer' }}
                          >
                            {previewAudio?.src === s.previewUrl && !previewAudio.paused ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{profile?.displayName || 'Set Name'}</h2>
                <p style={{ color: 'var(--accent-color)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '8px', letterSpacing: '0.02em' }}>@{profile?.username || 'handle'}</p>
                
                {/* Nickname & Phone View in Command Center */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', width: '100%', marginBottom: '16px' }}>
                  {profile?.nickname && (
                    <div style={{ padding: '6px 12px', borderRadius: '10px', background: 'rgba(217, 70, 239, 0.08)', border: '1px solid rgba(217, 70, 239, 0.2)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={12} fill="var(--accent-color)" /> Nickname: {profile.nickname}
                    </div>
                  )}
                  {profile?.phoneNumber && (
                    <div style={{ padding: '6px 12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Phone size={12} color="var(--accent-color)" /> Phone: {profile.phoneNumber}
                    </div>
                  )}
                </div>

                {profile?.bio && <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', width: '80%', margin: '0 auto 16px', lineHeight: 1.5 }}>{profile.bio}</p>}
                
                {(profile?.song || profile?.note) && (
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', borderRadius: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', width: '100%', maxWidth: '280px' }}>
                    {profile?.song && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                         <div style={{ position: 'relative' }}>
                            <img src={profile.song.artwork} alt="" style={{ width: '48px', height: '48px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
                            <button onClick={() => togglePreview(profile.song.previewUrl)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                               {previewAudio?.src === profile.song.previewUrl && !previewAudio.paused ? <Pause size={20} color="white" fill="white" /> : <Play size={20} color="white" fill="white" />}
                            </button>
                         </div>
                         <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.song.title}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.song.artist}</p>
                         </div>
                      </div>
                    )}
                    {profile?.note && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500, borderTop: profile?.song ? '1px solid var(--border-glass)' : 'none', paddingTop: profile?.song ? '12px' : '0' }}>
                        <AlignLeft size={16} opacity={0.5} /> {profile.note}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <SettingsGroup title="Interface Aesthetics">
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Palette size={20} color="var(--accent-color)" />
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Select Operations Theme</span>
             </div>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {[
                  { id: 'fuchsia', name: 'Velora Fuchsia (Dark)', color: '#d946ef' },
                  { id: 'green', name: 'Cyber Green (Dark)', color: '#22c55e' },
                  { id: 'blue', name: 'Neon Blue (Dark)', color: '#06b6d4' },
                  { id: 'light', name: 'Velora Light (Clean)', color: '#7c3aed' }
                ].map(t => {
                  const currentTheme = localStorage.getItem('velora_theme') || 'fuchsia';
                  const isActive = currentTheme === t.id;
                  
                  return (
                    <button 
                      key={t.id}
                      onClick={() => {
                        localStorage.setItem('velora_theme', t.id);
                        document.documentElement.className = t.id === 'fuchsia' ? '' : `theme-${t.id}`;
                        // Trigger re-render of settings
                        setProfile({ ...profile, dummyThemeUpdate: Math.random() });
                      }}
                      style={{
                        padding: '16px 12px',
                        borderRadius: '16px',
                        background: isActive ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.02)',
                        border: '1px solid',
                        borderColor: isActive ? 'transparent' : 'var(--border-glass)',
                        color: isActive ? 'white' : 'var(--text-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => {
                        if (!isActive) e.currentTarget.style.background = 'var(--bg-glass-hover)';
                      }}
                      onMouseLeave={e => {
                        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      }}
                    >
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: t.color, border: '2px solid white' }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, textAlign: 'center' }}>{t.name}</span>
                    </button>
                  );
                })}
             </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Protocols">
          <SettingsItem 
            icon={<Shield size={20} />} 
            label="Security Briefing" 
            onClick={() => setShowHelp(true)}
          />
          <SettingsItem 
            icon={<LogOut size={20} />} 
            label="Terminate Session" 
            danger 
            onClick={onLogout} 
          />
        </SettingsGroup>
      </div>

      {/* Help & Support Overlay */}
      {showHelp && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, 
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-panel animate-scale-in" style={{
            width: '100%', maxWidth: '400px', borderRadius: '40px', padding: '40px',
            textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px',
            border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.03)'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-gradient)',
              margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 15px 40px rgba(217, 70, 239, 0.3)'
            }}>
              <Phone size={36} color="white" />
            </div>
            
            <div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', marginBottom: '8px', letterSpacing: '0.1em' }}>OPERATIONAL SUPPORT</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>Mission assistance for cleared personnel only.</p>
            </div>

            <div style={{ padding: '20px', borderRadius: '24px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)' }}>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-color)', marginBottom: '4px', letterSpacing: '0.05em' }}>
                9405188077
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.8, fontWeight: 600 }}>
                "This mission briefing is strictly for my baykoo."
              </p>
            </div>

            <button 
              onClick={() => setShowHelp(false)}
              style={{ padding: '18px', borderRadius: '24px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'white', fontWeight: 700, fontSize: '1.1rem' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsGroup = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 700, paddingLeft: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {title}
    </h3>
    <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
      {children}
    </div>
  </div>
);

const SettingsItem = ({ icon, label, danger, onClick }) => (
  <button 
    onClick={onClick}
    style={{
      width: '100%',
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      borderBottom: '1px solid var(--border-glass)',
      color: danger ? '#ef4444' : 'var(--text-primary)',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'var(--bg-glass-hover)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent';
    }}
  >
    <div style={{ color: danger ? '#ef4444' : 'var(--text-secondary)' }}>
      {icon}
    </div>
    <span style={{ fontSize: '1rem', fontWeight: 600 }}>{label}</span>
    {!danger && <ChevronRight size={20} color="var(--text-secondary)" style={{ marginLeft: 'auto' }} />}
  </button>
);

export default Settings;
