import React, { useState, useEffect, useRef } from 'react';
import { Video, Phone, PhoneOff, Mic, MicOff, VideoOff, Camera, PhoneIncoming } from 'lucide-react';
import { ref, onValue, set, push, onDisconnect, remove } from 'firebase/database';
import { auth, db } from '../firebase';

// WebRTC Configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const CallManager = () => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [callState, setCallState] = useState('idle'); // 'idle', 'calling', 'ringing', 'connected'
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  
  const [currentCallId, setCurrentCallId] = useState(null);
  const [remoteUser, setRemoteUser] = useState(null);
  const [callType, setCallType] = useState('video');

  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  const [errorMsg, setErrorMsg] = useState(null);
  const isCancelledRef = useRef(false);

  // Assign streams to video elements when they become available
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  // Clean up function to close RTCPeerConnection and stop media tracks
  const cleanupCall = () => {
    isCancelledRef.current = true;
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setIncomingCall(null);
    setCurrentCallId(null);
    setRemoteUser(null);
    setIsMuted(false);
    setIsVideoDisabled(false);
  };

  // Listen for incoming calls on our UID node
  useEffect(() => {
    if (!auth.currentUser) return;

    const incomingRef = ref(db, `users/${auth.currentUser.uid}/incoming_call`);
    const unsubscribe = onValue(incomingRef, (snapshot) => {
      const callData = snapshot.val();
      if (callData && callState === 'idle') {
        // We have an incoming call!
        setIncomingCall(callData);
        setCallState('ringing');
      } else if (!callData && callState === 'ringing') {
        // Caller cancelled
        cleanupCall();
      }
    });

    return () => unsubscribe();
  }, [callState]);

  // Listen for the custom initiate-call event from Chat.jsx
  useEffect(() => {
    const handleInitiateCall = async (e) => {
      const { chatUser, type } = e.detail;
      if (callState !== 'idle') return;
      
      isCancelledRef.current = false;
      setCallType(type);
      setRemoteUser(chatUser);
      setCallState('calling');
      await initiateCall(chatUser, type);
    };

    window.addEventListener('initiate-call', handleInitiateCall);
    return () => window.removeEventListener('initiate-call', handleInitiateCall);
  }, [callState]);

  // Helper to get media stream based on type
  const getMediaStream = async (type) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn("Failed to get video+audio stream, trying audio-only fallback...", err);
      if (type === 'video') {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
          });
          setCallType('audio'); // Fallback call type to audio
          setLocalStream(audioStream);
          return audioStream;
        } catch (audioErr) {
          console.error("Audio-only fallback also failed", audioErr);
        }
      }
      setErrorMsg("Could not access camera or microphone. Please verify that site camera/microphone permissions are allowed in your browser settings (click the lock icon in the URL bar) and try again.");
      return null;
    }
  };

  // Helper to setup RTCPeerConnection
  const setupPeerConnection = (callId, role) => {
    pcRef.current = new RTCPeerConnection(rtcConfig);

    // Setup remote stream holding
    const remoteMedia = new MediaStream();
    setRemoteStream(remoteMedia);

    pcRef.current.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteMedia.addTrack(track);
      });
    };

    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateRef = ref(db, `calls/${callId}/${role}Candidates`);
        push(candidateRef, event.candidate.toJSON());
      }
    };
    
    // Connection state change
    pcRef.current.onconnectionstatechange = () => {
      if (pcRef.current?.connectionState === 'connected') {
        setCallState('connected');
      } else if (pcRef.current?.connectionState === 'disconnected' || pcRef.current?.connectionState === 'failed') {
        handleEndCall(callId, role === 'caller' ? remoteUser?.uid : incomingCall?.callerUid);
      }
    };
  };

  // Initiate an outgoing call
  const initiateCall = async (chatUser, type) => {
    const stream = await getMediaStream(type);
    
    if (isCancelledRef.current) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      cleanupCall();
      return;
    }

    if (!stream) {
      cleanupCall();
      return;
    }

    const callId = push(ref(db, 'calls')).key;
    setCurrentCallId(callId);
    
    setupPeerConnection(callId, 'caller');
    stream.getTracks().forEach((track) => pcRef.current.addTrack(track, stream));

    // Create Offer
    const offerDescription = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offerDescription);

    const callDoc = {
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp,
      },
      callerUid: auth.currentUser.uid,
      callerName: auth.currentUser.displayName,
      receiverUid: chatUser.uid,
      type: type,
      status: 'ringing'
    };

    await set(ref(db, `calls/${callId}`), callDoc);

    // Notify receiver
    const receiverIncomingRef = ref(db, `users/${chatUser.uid}/incoming_call`);
    await set(receiverIncomingRef, {
      callId: callId,
      callerUid: auth.currentUser.uid,
      callerName: auth.currentUser.displayName || 'Agent',
      callerPfp: auth.currentUser.photoURL || '',
      type: type
    });
    
    // Setup cleanup if caller disconnects
    onDisconnect(receiverIncomingRef).remove();
    onDisconnect(ref(db, `calls/${callId}`)).remove();

    // Listen for Answer
    const callRef = ref(db, `calls/${callId}`);
    onValue(callRef, (snapshot) => {
      const data = snapshot.val();
      if (!pcRef.current) return;
      
      if (!data) {
        // Call was ended or rejected
        cleanupCall();
        return;
      }
      
      if (data.answer && !pcRef.current.currentRemoteDescription) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pcRef.current.setRemoteDescription(answerDescription);
      }
    });

    // Listen for remote ICE candidates
    const receiverCandidatesRef = ref(db, `calls/${callId}/receiverCandidates`);
    onValue(receiverCandidatesRef, (snapshot) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        snapshot.forEach((childSnapshot) => {
          const candidate = new RTCIceCandidate(childSnapshot.val());
          pcRef.current.addIceCandidate(candidate);
        });
      }
    });
  };

  // Accept an incoming call
  const acceptCall = async () => {
    if (!incomingCall) return;
    
    const { callId, callerUid, callerName, type } = incomingCall;
    setCallType(type);
    setRemoteUser({ uid: callerUid, displayName: callerName });
    setCurrentCallId(callId);
    
    const stream = await getMediaStream(type);
    if (!stream) {
      handleRejectCall();
      return;
    }

    setCallState('connected');
    setupPeerConnection(callId, 'receiver');
    stream.getTracks().forEach((track) => pcRef.current.addTrack(track, stream));

    const callRef = ref(db, `calls/${callId}`);
    
    // Read the offer
    onValue(callRef, async (snapshot) => {
      const callData = snapshot.val();
      if (!callData) {
        cleanupCall();
        return;
      }
      
      if (callData.offer && !pcRef.current.currentRemoteDescription) {
        const offerDescription = new RTCSessionDescription(callData.offer);
        await pcRef.current.setRemoteDescription(offerDescription);

        const answerDescription = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answerDescription);

        const answer = {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        };

        await set(ref(db, `calls/${callId}/answer`), answer);
      }
    }, { onlyOnce: true });

    // Clear the incoming call signal
    await remove(ref(db, `users/${auth.currentUser.uid}/incoming_call`));

    // Listen for remote ICE candidates
    const callerCandidatesRef = ref(db, `calls/${callId}/callerCandidates`);
    onValue(callerCandidatesRef, (snapshot) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        snapshot.forEach((childSnapshot) => {
          const candidate = new RTCIceCandidate(childSnapshot.val());
          pcRef.current.addIceCandidate(candidate);
        });
      }
    });
    
    // Setup listener to end call if remote disconnects
    onValue(callRef, (snapshot) => {
      if (!snapshot.exists()) {
        cleanupCall();
      }
    });
  };

  const handleRejectCall = async () => {
    isCancelledRef.current = true;
    if (incomingCall) {
      await remove(ref(db, `users/${auth.currentUser.uid}/incoming_call`));
      await remove(ref(db, `calls/${incomingCall.callId}`));
    }
    cleanupCall();
  };

  const handleEndCall = async (callIdToClear = currentCallId, receiverId = remoteUser?.uid) => {
    isCancelledRef.current = true;
    if (callIdToClear) {
      await remove(ref(db, `calls/${callIdToClear}`));
    }
    if (receiverId) {
       await remove(ref(db, `users/${receiverId}/incoming_call`));
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoDisabled(!isVideoDisabled);
    }
  };

  if (callState === 'idle' && !errorMsg) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, 
      background: callState === 'connected' ? 'black' : 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      animation: 'fade-in 0.3s ease'
    }}>
      <div className="scanline" style={{ pointerEvents: 'none' }} />

      {errorMsg ? (
        <div className="glass-panel animate-scale-in" style={{
          width: '90%', maxWidth: '420px', padding: '40px 32px', borderRadius: '32px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)'
          }}>
            <VideoOff size={36} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', letterSpacing: '0.08em', marginBottom: '8px' }}>MEDIA PERMISSION ERROR</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, fontWeight: 600 }}>
              {errorMsg}
            </p>
          </div>
          <button 
            onClick={() => { setErrorMsg(null); cleanupCall(); }}
            style={{
              width: '100%', padding: '16px', borderRadius: '20px', background: 'var(--accent-gradient)',
              color: 'white', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '1.05rem',
              boxShadow: '0 8px 20px rgba(217, 70, 239, 0.3)', transition: 'transform 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            DISMISS REPORT
          </button>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* --- INCOMING CALL / OUTGOING CALL UI --- */}
          {(callState === 'ringing' || callState === 'calling') && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
              
              <div className="animate-pulse" style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 800, color: 'white', boxShadow: '0 0 40px rgba(217, 70, 239, 0.4)' }}>
                {(callState === 'ringing' ? incomingCall?.callerName : remoteUser?.displayName)?.charAt(0).toUpperCase() || 'A'}
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                  {callState === 'ringing' ? incomingCall?.callerName : remoteUser?.displayName}
                </h2>
                <p style={{ color: 'var(--accent-color)', fontSize: '1.1rem', fontWeight: 600 }}>
                  {callState === 'ringing' ? `Incoming ${incomingCall?.type} call...` : `Calling...`}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
                 {callState === 'ringing' && (
                   <button onClick={acceptCall} style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#22c55e', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px rgba(34, 197, 94, 0.5)', cursor: 'pointer' }}>
                     <PhoneIncoming size={32} color="white" />
                   </button>
                 )}
                 
                 <button onClick={() => handleEndCall(incomingCall?.callId || currentCallId, remoteUser?.uid)} style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#ef4444', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px rgba(239, 68, 68, 0.5)', cursor: 'pointer' }}>
                   <PhoneOff size={32} color="white" />
                 </button>
              </div>
            </div>
          )}

          {/* --- CONNECTED CALL UI --- */}
          {callState === 'connected' && (
            <>
              {callType === 'video' ? (
                <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', background: '#000' }}>
                   {/* Remote Video (Fullscreen) */}
                   <video 
                     ref={remoteVideoRef} 
                     autoPlay 
                     playsInline 
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                   />
                   
                   {/* Local Video (PiP) */}
                   <div style={{ position: 'absolute', top: '24px', right: '24px', width: '120px', height: '160px', borderRadius: '16px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', background: '#1e293b' }}>
                      <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                      />
                      {isVideoDisabled && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
                           <VideoOff color="white" size={24} />
                        </div>
                      )}
                   </div>
                </div>
              ) : (
                // Audio Call UI
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
                   <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', fontWeight: 800, color: 'white', boxShadow: '0 0 50px rgba(217, 70, 239, 0.2)', marginBottom: '32px' }}>
                     {(remoteUser?.displayName || incomingCall?.callerName)?.charAt(0).toUpperCase()}
                   </div>
                   <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                     {remoteUser?.displayName || incomingCall?.callerName}
                   </h2>
                   <p style={{ color: 'var(--accent-color)', fontSize: '1.2rem', fontWeight: 600 }}>00:00 • Secure Audio Call</p>
                   
                   {/* Hidden Audio Elements for streams */}
                   <video ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
                   <video ref={localVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />
                </div>
              )}

              {/* Call Controls Bar */}
              <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '20px', padding: '16px 24px', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
                 <button onClick={toggleMute} style={{ width: '56px', height: '56px', borderRadius: '50%', background: isMuted ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}>
                    {isMuted ? <MicOff size={24} color="black" /> : <Mic size={24} color="white" />}
                 </button>
                 
                 {callType === 'video' && (
                   <button onClick={toggleVideo} style={{ width: '56px', height: '56px', borderRadius: '50%', background: isVideoDisabled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}>
                      {isVideoDisabled ? <VideoOff size={24} color="black" /> : <Video size={24} color="white" />}
                   </button>
                 )}

                 <button onClick={() => handleEndCall()} style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ef4444', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)' }}>
                    <PhoneOff size={24} color="white" />
                 </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CallManager;
