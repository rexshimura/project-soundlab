import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, Square, Play, Pause, RotateCcw, Volume2, VolumeX, 
  Layers, Radio, ArrowUpRight, HelpCircle, Activity, Trash2, Sliders, ZoomIn, Grid, Timer, Plus, Layout
} from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingGlobal, setIsPlayingGlobal] = useState(false);
  const [isPlayingSandbox, setIsPlayingSandbox] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [status, setStatus] = useState("Ready to record...");
  
  const [tracksList, setTracksList] = useState([1, 2]);
  const [audioItems, setAudioItems] = useState([]); 
  const [mutedTracks, setMutedTracks] = useState({});
  const [sandboxItem, setSandboxItem] = useState(null); 
  const [selectedClipId, setSelectedClipId] = useState(null);
  
  // Track Row selection state
  const [selectedTrackId, setSelectedTrackId] = useState(null);

  // Layout, Zoom & Visual Density Configuration parameters
  const [zoomLevel, setZoomLevel] = useState(60); 
  const [rowHeight, setRowHeight] = useState(96); 
  const [draggingClipId, setDraggingClipId] = useState(null);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  // Record Pre-delay Countdown Timer Config
  const [recordTimer, setRecordTimer] = useState(0); 
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0); // Numerical tracking state for screen overlay

  // Isolated Sandbox Playhead Tracker
  const [sandboxPlayhead, setSandboxSandboxPlayhead] = useState(0);
  const sandboxStartTimeRef = useRef(0);
  const sandboxAnimFrameRef = useRef(null);

  // Live Recording Progress Trackers
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  
  const activeGlobalSourcesRef = useRef([]);
  const sandboxSourceRef = useRef(null);
  const activeGainsRef = useRef({}); 
  
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const animationFrameRef = useRef(null);
  const timelineContainerRef = useRef(null);

  const selectedClip = audioItems.find(item => item.id === selectedClipId);

  // Ref hooks to safely evaluate live boundary state configurations inside loops
  const selectedClipIdRef = useRef(null);
  const audioItemsRef = useRef([]);

  useEffect(() => {
    selectedClipIdRef.current = selectedClipId;
    audioItemsRef.current = audioItems;
  }, [selectedClipId, audioItems]);

  const makeDistortionCurve = (amount) => {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

  const handleAddTrack = () => {
    setTracksList(prev => [...prev, prev.length + 1]);
    setStatus(`Initialized new tracking Lane ${tracksList.length + 1}.`);
  };

  const handleDeleteTrackLane = (trackId) => {
    if (tracksList.length <= 1) {
      alert("Session minimum threshold reached: You must maintain at least one active track lane.");
      return;
    }
    setAudioItems(prev => prev.filter(item => item.trackId !== trackId));
    setAudioItems(prev => prev.map(item => {
      if (item.trackId > trackId) {
        return { ...item, trackId: item.trackId - 1 };
      }
      return item;
    }));
    setTracksList(prev => {
      const remainingRows = prev.filter(t => t !== trackId);
      return remainingRows.map((_, index) => index + 1);
    });
    if (selectedTrackId === trackId) setSelectedTrackId(null);
    setStatus(`Removed Track Lane ${trackId} and cleaned mixed assets layout mapping.`);
  };

  // Keyboard Nudging Event Listener for Selected Sound Cards
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedClipId) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const direction = e.key === 'ArrowLeft' ? -1 : 1;
        const timeDelta = 0.1 * direction; 

        setAudioItems(prev => prev.map(item => {
          if (item.id === selectedClipId) {
            const currentStart = item.startTime || 0;
            const newStart = Math.max(0, currentStart + timeDelta);
            return { ...item, startTime: newStart };
          }
          return item;
        }));
        setStatus(`Nudged clip timeline offset positioning.`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId]);

  // 1. Playhead Loop Engine with Selected Card Boundary Guard
  const updatePlayhead = () => {
    if (!audioContextRef.current || !isPlayingGlobal) return;

    const elapsedSeconds = audioContextRef.current.currentTime - startTimeRef.current;
    const currentTimelineSeconds = pausedAtRef.current + (elapsedSeconds * playbackSpeed);
    
    if (selectedClipIdRef.current) {
      const activeClip = audioItemsRef.current.find(item => item.id === selectedClipIdRef.current);
      if (activeClip) {
        const clipStart = activeClip.startTime || 0;
        const clipDuration = activeClip.duration / (activeClip.speed || 1.0);
        const clipEndThreshold = clipStart + clipDuration;

        if (currentTimelineSeconds >= clipEndThreshold) {
          setPlayheadPosition(clipEndThreshold * zoomLevel);
          pausedAtRef.current = clipEndThreshold;
          stopAllGlobalAudio(false);
          setStatus("Playback intercepted: Hit tail margin boundary of the active selection segment.");
          return;
        }
      }
    }

    setPlayheadPosition(currentTimelineSeconds * zoomLevel);
    animationFrameRef.current = requestAnimationFrame(updatePlayhead);
  };

  useEffect(() => {
    if (isPlayingGlobal) {
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlayingGlobal, playbackSpeed, zoomLevel]);

  // Dynamic sandbox engine update
  const updateSandboxPlayhead = () => {
    if (!audioContextRef.current || !isPlayingSandbox || !sandboxItem) return;
    const elapsed = audioContextRef.current.currentTime - sandboxStartTimeRef.current;
    const currentPos = elapsed * playbackSpeed * zoomLevel;
    
    if (elapsed * playbackSpeed >= sandboxItem.duration) {
      setSandboxSandboxPlayhead(0);
      setIsPlayingSandbox(false);
    } else {
      setSandboxSandboxPlayhead(currentPos);
      sandboxAnimFrameRef.current = requestAnimationFrame(updateSandboxPlayhead);
    }
  };

  useEffect(() => {
    if (isPlayingSandbox) {
      sandboxAnimFrameRef.current = requestAnimationFrame(updateSandboxPlayhead);
    } else {
      cancelAnimationFrame(sandboxAnimFrameRef.current);
      setSandboxSandboxPlayhead(0);
    }
    return () => cancelAnimationFrame(sandboxAnimFrameRef.current);
  }, [isPlayingSandbox, zoomLevel, playbackSpeed]);

  // Sync playhead back to match current zoom mutations
  useEffect(() => {
    if (!isPlayingGlobal) {
      setPlayheadPosition(pausedAtRef.current * zoomLevel);
    }
  }, [zoomLevel]);

  // 2. Upgraded Playhead Scrubbing Mechanics
  const handleTimelineScrub = (e) => {
    if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target)) return;
    if (!timelineContainerRef.current) return;
    const bounds = timelineContainerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, e.clientX - bounds.left - 80); 
    
    const newTimeSeconds = clickX / zoomLevel;
    pausedAtRef.current = newTimeSeconds;
    setPlayheadPosition(clickX);

    if (isPlayingGlobal) {
      stopAllGlobalAudio(false);
      startTimeRef.current = audioContextRef.current.currentTime;
      fireActiveTimelineSources();
    }
  };

  const handlePlayheadPointerDown = (e) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePlayheadPointerMove = (e) => {
    if (!isDraggingPlayhead || !timelineContainerRef.current) return;
    const bounds = timelineContainerRef.current.getBoundingClientRect();
    const dragX = Math.max(0, e.clientX - bounds.left - 80); 
    
    pausedAtRef.current = dragX / zoomLevel;
    setPlayheadPosition(dragX);
  };

  const handlePlayheadPointerUp = (e) => {
    setIsDraggingPlayhead(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isPlayingGlobal) {
      stopAllGlobalAudio(false);
      startTimeRef.current = audioContextRef.current.currentTime;
      fireActiveTimelineSources();
    }
  };

  const handleCycleRecordTimer = () => {
    setRecordTimer(current => {
      if (current === 0) return 1;
      if (current === 1) return 3;
      if (current === 3) return 5;
      return 0;
    });
  };

  const executeStreamCapture = async () => {
    if (sandboxSourceRef.current) sandboxSourceRef.current.stop();
    setIsPlayingSandbox(false);
    setSandboxItem(null);
    setRecordingSeconds(0);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const waveProfile = Array.from({ length: 32 }, () => Math.floor(Math.random() * 70) + 15);
        
        setSandboxItem({
          id: `clip-${Date.now()}`,
          name: `Voice Sample #${audioItems.length + 1}`,
          duration: decodedBuffer.duration,
          buffer: decodedBuffer,
          pitch: 1.0, 
          speed: 1.0, 
          distortion: 0, 
          startTime: 0, 
          waveProfile
        });
        setStatus(`Captured to Sandbox Bay (${decodedBuffer.duration.toFixed(1)}s)`);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("Tracking microphone stream channel...");
      const startTimeStamp = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((Date.now() - startTimeStamp) / 1000);
      }, 30);
    } catch (err) {
      setStatus("Microphone access blocked.");
      console.error(err);
    }
  };

  // 3. Audio Recording Action with Visual Countdown System
  const handleRecording = async () => {
    if (isRecording) {
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus("Processing captured signal profile...");
    } else {
      if (sandboxItem) {
        alert("Staging conflict: Move the current staged Sandbox voice card up into a track lane or delete it before recording a new file.");
        return;
      }

      if (recordTimer > 0) {
        setCountdownActive(true);
        setCountdownSeconds(recordTimer); // Feed initial step layout index value
        let remainingSeconds = recordTimer;
        setStatus(`Recording countdown initializing: ${remainingSeconds}s remaining...`);
        
        const countdownInterval = setInterval(() => {
          remainingSeconds -= 1;
          setCountdownSeconds(remainingSeconds); // Sync downstream to overlay frame
          
          if (remainingSeconds <= 0) {
            clearInterval(countdownInterval);
            setCountdownActive(false);
            executeStreamCapture();
          } else {
            setStatus(`Recording countdown initializing: ${remainingSeconds}s remaining...`);
          }
        }, 1000);
      } else {
        executeStreamCapture();
      }
    }
  };

  const toggleSandboxPlayback = () => {
    if (!sandboxItem) return;
    if (isPlayingSandbox) {
      if (sandboxSourceRef.current) sandboxSourceRef.current.stop();
      setIsPlayingSandbox(false);
      setStatus("Sandbox monitor paused.");
    } else {
      stopAllGlobalAudio(false);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const source = audioContextRef.current.createBufferSource();
      source.buffer = sandboxItem.buffer;
      source.playbackRate.value = playbackSpeed;
      source.connect(audioContextRef.current.destination);
      
      sandboxStartTimeRef.current = audioContextRef.current.currentTime;
      source.start(0);
      sandboxSourceRef.current = source;
      setIsPlayingSandbox(true);
      setStatus("Monitoring Sandbox block...");
      source.onended = () => { setIsPlayingSandbox(false); };
    }
  };

  const fireActiveTimelineSources = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    setIsPlayingGlobal(true);
    setStatus("🔊 Processing waveform effects and routing mix lines...");

    audioItems.forEach(item => {
      const clipStart = item.startTime || 0;
      const modifiedDuration = item.duration / (item.speed || 1.0); 
      if (pausedAtRef.current < (clipStart + modifiedDuration)) {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = item.buffer;
        source.playbackRate.value = playbackSpeed * (item.pitch || 1.0) * (item.speed || 1.0);

        let gainNode = activeGainsRef.current[item.trackId];
        if (!gainNode) {
          gainNode = audioContextRef.current.createGain();
          gainNode.gain.value = mutedTracks[item.trackId] ? 0 : 1;
          activeGainsRef.current[item.trackId] = gainNode;
        }

        if (item.distortion && item.distortion > 0) {
          const waveShaper = audioContextRef.current.createWaveShaper();
          waveShaper.curve = makeDistortionCurve(item.distortion * 2); 
          waveShaper.oversample = '4x';
          
          source.connect(waveShaper);
          waveShaper.connect(gainNode);
        } else {
          source.connect(gainNode);
        }

        gainNode.connect(audioContextRef.current.destination);

        const elapsedSinceClipStart = Math.max(0, pausedAtRef.current - clipStart);
        const bufferStartOffset = elapsedSinceClipStart * (item.speed || 1.0);
        const schedulingTime = Math.max(0, clipStart - pausedAtRef.current);

        source.start(audioContextRef.current.currentTime + schedulingTime, bufferStartOffset);
        activeGlobalSourcesRef.current.push(source);
      }
    });
  };

  const handleGlobalPlayback = () => {
    if (audioItems.length === 0) return;
    if (sandboxSourceRef.current) sandboxSourceRef.current.stop();
    setIsPlayingSandbox(false);

    if (isPlayingGlobal) {
      const elapsedSeconds = audioContextRef.current.currentTime - startTimeRef.current;
      pausedAtRef.current += elapsedSeconds * playbackSpeed;
      stopAllGlobalAudio(false);
      setStatus("Session paused.");
    } else {
      if (selectedClipId) {
        const activeClip = audioItems.find(item => item.id === selectedClipId);
        if (activeClip) {
          const clipStart = activeClip.startTime || 0;
          const clipEnd = clipStart + (activeClip.duration / (activeClip.speed || 1.0));
          if (pausedAtRef.current >= clipEnd || pausedAtRef.current < clipStart) {
            pausedAtRef.current = clipStart;
            setPlayheadPosition(clipStart * zoomLevel);
          }
        }
      }

      startTimeRef.current = audioContextRef.current.currentTime;
      fireActiveTimelineSources();
    }
  };

  const handleGlobalStop = () => {
    stopAllGlobalAudio(false);
    pausedAtRef.current = 0;
    setPlayheadPosition(0);
    setStatus("Session stopped. Playhead reset to zero context.");
  };

  const stopAllGlobalAudio = (resetTimeline = false) => {
    activeGlobalSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e){}
    });
    activeGlobalSourcesRef.current = [];
    setIsPlayingGlobal(false);
    if (resetTimeline) {
      pausedAtRef.current = 0;
      setPlayheadPosition(0);
      setStatus("Mix tracking stopped.");
    }
  };

  const handleMasterSpeedChange = (e) => {
    const targetSpeed = parseFloat(e.target.value);
    setPlaybackSpeed(targetSpeed);
    activeGlobalSourcesRef.current.forEach(source => {
      source.playbackRate.value = targetSpeed;
    });
  };

  const handleClipPitchChange = (clipId, newPitch) => {
    setAudioItems(prev => prev.map(item => 
      item.id === clipId ? { ...item, pitch: parseFloat(newPitch) } : item
    ));
  };

  const handleClipSpeedPropertyChange = (clipId, newSpeed) => {
    setAudioItems(prev => prev.map(item => 
      item.id === clipId ? { ...item, speed: parseFloat(newSpeed) } : item
    ));
  };

  const handleClipDistortionChange = (clipId, newDistortion) => {
    setAudioItems(prev => prev.map(item => 
      item.id === clipId ? { ...item, distortion: parseInt(newDistortion) } : item
    ));
  };

  const handleRenameClip = (clipId, newName) => {
    setAudioItems(prev => prev.map(item => 
      item.id === clipId ? { ...item, name: newName } : item
    ));
  };

  const handleDeleteClip = (clipId) => {
    setAudioItems(prev => prev.filter(item => item.id !== clipId));
    if (selectedClipId === clipId) setSelectedClipId(null);
    setStatus("Removed track element.");
  };

  const toggleMuteTrack = (trackId) => {
    setMutedTracks(prev => {
      const isMuted = !prev[trackId];
      if (activeGainsRef.current[trackId]) activeGainsRef.current[trackId].gain.value = isMuted ? 0 : 1;
      return { ...prev, [trackId]: isMuted };
    });
  };

  const handleDragStart = (e, id, isFromSandbox = false) => {
    setDraggingClipId(id);
    e.dataTransfer.setData("clipId", id);
    e.dataTransfer.setData("isFromSandbox", isFromSandbox ? "true" : "false");
  };

  const handleTrackDrop = (e, targetTrackId) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("clipId");
    const isFromSandbox = e.dataTransfer.getData("isFromSandbox") === "true";

    if (isFromSandbox && sandboxItem && sandboxItem.id === clipId) {
      setAudioItems(prev => [
        ...prev.filter(item => item.trackId !== targetTrackId),
        { ...sandboxItem, trackId: targetTrackId, startTime: 0 }
      ]);
      setSelectedClipId(sandboxItem.id);
      setSandboxItem(null);
      setIsPlayingSandbox(false);
      setStatus(`Assigned clip to Track ${targetTrackId}`);
    } else {
      setAudioItems(prev => {
        const cleanedList = prev.filter(item => item.trackId !== targetTrackId || item.id === clipId);
        return cleanedList.map(item => 
          item.id === clipId ? { ...item, trackId: targetTrackId } : item
        );
      });
      setStatus(`Moved clip to Track ${targetTrackId}`);
    }
    setDraggingClipId(null);
  };

  const handleTrashDrop = (e) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("clipId");
    const isFromSandbox = e.dataTransfer.getData("isFromSandbox") === "true";

    if (isFromSandbox) {
      if (sandboxSourceRef.current) sandboxSourceRef.current.stop();
      setSandboxItem(null);
      setIsPlayingSandbox(false);
      setStatus("Cleared sandbox clip sample profiling.");
    } else {
      handleDeleteClip(clipId);
    }
    setDraggingClipId(null);
  };

  const timeMarkers = Array.from({ length: 40 }, (_, i) => i * 2);

  return (
    <div className="flex h-screen w-screen bg-black font-sans text-zinc-100 overflow-hidden select-none">
      
      {/* LEFT ADJUSTMENTS INSPECTOR PANEL */}
      <aside className="w-80 border-r border-zinc-900 bg-zinc-950 p-6 flex flex-col justify-between shadow-xl z-25 rounded-none">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-none">
              <Activity className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-zinc-100">SoundLab Studio</h1>
              <p className="text-[10px] text-zinc-500 font-mono">Precision Tracking Deck</p>
            </div>
          </div>

          <hr className="border-zinc-900" />

          {selectedClip ? (
            <div className="space-y-5 border border-zinc-900 bg-black p-3.5 animate-fade-in rounded-none">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono">
                <Sliders className="w-3.5 h-3.5" /> Track Properties
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-zinc-500">Track Label</label>
                <input 
                  type="text" value={selectedClip.name}
                  onChange={(e) => handleRenameClip(selectedClip.id, e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-400 px-3 py-2 text-xs outline-none text-zinc-200 rounded-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Timeline Offset</span>
                  <span className="text-white font-bold font-mono">{(selectedClip.startTime || 0).toFixed(1)}s</span>
                </div>
                <div className="text-[10px] text-zinc-500 bg-zinc-900/50 p-2 border border-zinc-800/60 font-mono">
                  Select card, then hold <span className="text-zinc-300">←</span> or <span className="text-zinc-300">→</span> key to reposition clip horizontally.
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Speed (Stretch)</span>
                  <span className="text-white font-bold font-mono">{(selectedClip.speed || 1.0).toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1" 
                  value={selectedClip.speed || 1.0} 
                  onChange={(e) => handleClipSpeedPropertyChange(selectedClip.id, e.target.value)}
                  className="w-full accent-white bg-zinc-800 rounded-none appearance-none h-1.5 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Pitch (Low/High)</span>
                  <span className="text-white font-bold font-mono">{(selectedClip.pitch || 1.0).toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1" 
                  value={selectedClip.pitch || 1.0} 
                  onChange={(e) => handleClipPitchChange(selectedClip.id, e.target.value)}
                  className="w-full accent-white bg-zinc-800 rounded-none appearance-none h-1.5 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Distortion FX</span>
                  <span className="text-white font-bold font-mono">{selectedClip.distortion || 0}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" step="5" 
                  value={selectedClip.distortion || 0} 
                  onChange={(e) => handleClipDistortionChange(selectedClip.id, e.target.value)}
                  className="w-full accent-white bg-zinc-800 rounded-none appearance-none h-1.5 cursor-pointer"
                />
              </div>

              <button onClick={() => handleDeleteClip(selectedClip.id)} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-100 hover:text-black transition-colors rounded-none">
                <Trash2 className="w-3.5 h-3.5"/> Delete Track Audio
              </button>
            </div>
          ) : selectedTrackId ? (
            <div className="space-y-5 border border-zinc-900 bg-black p-3.5 animate-fade-in rounded-none">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono">
                <Layout className="w-3.5 h-3.5" /> Lane Properties
              </div>
              
              <div className="space-y-1">
                <p className="text-xs text-zinc-400">Selected Row Context:</p>
                <p className="text-sm font-bold font-mono text-white">Lane {String(selectedTrackId).padStart(2, '0')}</p>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono">
                Deleting this lane will permanently clear its layout layer and shift subsequent rows up.
              </p>

              <button 
                onClick={() => handleDeleteTrackLane(selectedTrackId)} 
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-red-950/20 border border-red-900/40 text-red-400 hover:bg-red-500 hover:text-black transition-colors rounded-none"
              >
                <Trash2 className="w-3.5 h-3.5"/> Delete Entire Track Lane
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 border border-dashed border-zinc-800 bg-black text-zinc-500 rounded-none">
              <Sliders className="w-6 h-6 mb-2 text-zinc-700" />
              <p className="text-[11px] leading-relaxed">
                Click directly on an audio block to open properties, or double-click a track lane header block to select and delete rows.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-900 pt-4">
          <p className="text-xs text-zinc-400 font-medium bg-black p-2 border border-zinc-900 truncate rounded-none">{status}</p>
        </div>
      </aside>

      {/* RIGHT MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-zinc-950">
        
        {/* TIME INDICATION RULER GRID */}
        <div className="h-12 border-b border-zinc-900 bg-zinc-950 relative flex items-center z-10 overflow-hidden px-4">
          <div className="w-16 border-r border-zinc-900 h-full flex items-center justify-center font-mono font-bold text-[10px] text-zinc-500 uppercase tracking-wider bg-black sticky left-0 z-40">
            Lanes
          </div>
          <div 
            onClick={handleTimelineScrub}
            className="flex-1 h-full relative overflow-x-auto cursor-ew-resize pl-4 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-900 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            {timeMarkers.map(sec => (
              <div key={sec} className="absolute top-0 bottom-0 border-l border-zinc-900 font-mono text-[9px] text-zinc-500 pt-3 pl-2 pointer-events-none flex flex-col justify-between" style={{ left: `${sec * zoomLevel}px` }}>
                <span>{sec}s</span>
                <div className="h-2 w-[1px] bg-zinc-800"></div>
              </div>
            ))}
          </div>
        </div>

        {/* WORKSPACE AREA TRACK CONTAINER */}
        <div 
          ref={timelineContainerRef}
          onClick={(e) => { 
            if (e.target === e.currentTarget) {
              setSelectedClipId(null); 
              setSelectedTrackId(null); 
            }
            handleTimelineScrub(e);
          }} 
          className="flex-1 overflow-y-auto bg-black p-4 space-y-4 relative overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-900 [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          
          {/* NEW PRE-DELAY REC COUNTDOWN SCREEN OVERLAY TIMER */}
          {countdownActive && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-45 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono text-8xl font-black tracking-tighter text-white animate-ping">
                {countdownSeconds}
              </span>
              <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase mt-8">
                Microphone stream tracking armed
              </span>
            </div>
          )}

          {/* WHITE INTERACTIVE GLOBAL PLAYHEAD */}
          <div 
            onPointerDown={handlePlayheadPointerDown}
            onPointerUp={handlePlayheadPointerUp}
            onClick={(e) => e.stopPropagation()} 
            className="absolute top-0 bottom-0 w-[1px] bg-white shadow-[0_0_4px_rgba(255,255,255,0.4)] z-50 cursor-col-resize active:bg-zinc-200 touch-none"
            style={{ 
              left: `${80 + Math.max(0, playheadPosition)}px`
            }}
          />

          {tracksList.map((trackNumber) => {
            const isMuted = mutedTracks[trackNumber];
            const item = audioItems.find(clip => clip.trackId === trackNumber);
            const isSelected = item && selectedClipId === item.id;
            const isRowSelected = selectedTrackId === trackNumber;

            return (
              <div 
                key={trackNumber}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleTrackDrop(e, trackNumber)}
                style={{ height: `${rowHeight}px` }} 
                className={`group flex items-center w-full border transition-all relative rounded-none ${
                  isMuted 
                    ? 'bg-zinc-950/20 border-zinc-950 opacity-30' 
                    : isRowSelected
                      ? 'bg-zinc-900/60 border-zinc-400'
                      : 'bg-zinc-950 border-zinc-900 hover:border-zinc-800'
                } ${draggingClipId ? 'border-dashed border-zinc-800 bg-zinc-950' : ''}`}
              >
                {/* Track Header */}
                <div 
                  onDoubleClick={(e) => { e.stopPropagation(); setSelectedTrackId(trackNumber); setSelectedClipId(null); }}
                  className={`w-16 h-full border-r border-zinc-900 flex flex-col items-center justify-center p-1 z-40 rounded-none relative select-none cursor-pointer transition-colors ${
                    isRowSelected ? 'bg-zinc-900' : 'bg-black hover:bg-zinc-950'
                  }`}
                >
                  <span className={`font-mono font-bold tracking-wider absolute top-1 left-1.5 text-[9px] ${
                    isRowSelected ? 'text-white' : isMuted ? 'text-zinc-700' : 'text-zinc-600 group-hover:text-zinc-400 transition-colors'
                  }`}>
                    {String(trackNumber).padStart(2, '0')}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleMuteTrack(trackNumber); }} 
                    className={`border transition-all rounded-none mt-2 ${rowHeight < 64 ? 'p-0.5' : 'p-1.5'} ${
                      isMuted 
                        ? 'bg-white text-black border-white shadow-sm shadow-zinc-950' 
                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                    title={isMuted ? "Unmute Lane" : "Mute Lane"}
                  >
                    {isMuted ? <VolumeX className={rowHeight < 64 ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} /> : <Volume2 className={rowHeight < 64 ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} />}
                  </button>
                </div>

                {/* SINGLE AUDIO LANE slot container */}
                <div className="flex-1 h-full relative overflow-hidden flex items-center p-2 rounded-none">
                  {item ? (
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.id, false)}
                      onClick={(e) => { e.stopPropagation(); setSelectedClipId(item.id); setSelectedTrackId(null); }} 
                      className={`h-full p-3 flex flex-col justify-between border cursor-grab active:cursor-grabbing absolute transition-all duration-75 rounded-none ${
                        isMuted 
                          ? 'bg-zinc-950 border-zinc-900 text-zinc-700'
                          : isSelected
                            ? 'bg-zinc-900 border-white text-white shadow-lg z-10'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                      style={{ 
                        width: `${(item.duration / (item.speed || 1.0)) * zoomLevel}px`, 
                        minWidth: '160px',
                        left: `${(item.startTime || 0) * zoomLevel}px` 
                      }}
                    >
                      <div className="w-full flex items-center justify-between">
                        <div className="flex flex-col max-w-[50%] leading-tight">
                          <span className={`font-mono font-bold tracking-tight truncate ${rowHeight < 64 ? 'text-[8.5px]' : 'text-[10px]'}`}>{item.name}</span>
                          {rowHeight >= 64 && <span className="text-[8px] opacity-40 font-mono">Length: {(item.duration / (item.speed || 1.0)).toFixed(1)}s</span>}
                        </div>
                        
                        <div className={`flex flex-col font-mono text-[8px] shrink-0 text-right gap-[1px] ${rowHeight < 64 ? 'hidden' : 'flex'}`}>
                          <div className="flex items-center gap-1 justify-end">
                            {item.distortion > 0 && <span className="px-0.5 bg-white text-black font-bold text-[7px] leading-none select-none">DST</span>}
                            <span className={isSelected ? 'text-white' : 'text-zinc-400'}>Spd: {(item.speed || 1.0).toFixed(1)}x</span>
                          </div>
                          <span className={isSelected ? 'text-zinc-300' : 'text-zinc-500'}>Pch: {(item.pitch || 1.0).toFixed(1)}x</span>
                        </div>
                      </div>

                      {/* MINIMALIST WHITE/GRAY WAVE PROFILE */}
                      <div className={`absolute left-28 right-4 gap-[2px] pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity flex items-center justify-center ${rowHeight < 64 ? 'inset-y-1.5 top-1.5' : 'bottom-2 top-6'}`}>
                        {item.waveProfile?.map((height, idx) => (
                          <div 
                            key={idx} 
                            className={`w-[2px] h-full ${isSelected ? 'bg-white' : 'bg-zinc-400'} rounded-none`} 
                            style={{ height: `${height * 0.8}%` }}
                          />
                        ))}
                      </div>

                      {/* CONTEXTUAL KEYBOARD CONTROLS INDICATOR */}
                      {isSelected && rowHeight >= 64 && (
                        <div className="text-[7.5px] font-mono opacity-60 uppercase tracking-wider text-zinc-400 select-none animate-pulse">
                          [ ← ] [ → ] Nudge Position
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-zinc-800 tracking-wider pl-2 select-none">
                      Empty Lane Slot Dropzone
                    </div>
                  )}
                </div>

              </div>
            );
          })}

          {/* DYNAMIC TRACK APPENDER */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleAddTrack(); }}
            className="w-full h-11 bg-zinc-950/40 hover:bg-zinc-900/80 border border-dashed border-zinc-900 hover:border-zinc-700 transition-all flex items-center justify-center gap-2 font-mono text-xs text-zinc-500 hover:text-zinc-300 rounded-none cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Audio Track Lane</span>
          </button>
        </div>

        {/* SANDBOX LAYER CAPTURE BAY */}
        <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-3 z-10 shadow-inner rounded-none">
          <div className="flex items-center gap-4 border border-dashed border-zinc-900 bg-black p-3 rounded-none">
            
            <div className="flex items-center shrink-0 gap-2">
              <button 
                onClick={handleRecording} 
                disabled={countdownActive}
                title={countdownActive ? "Pre-delay tracking armed" : "Record Voice"} 
                className={`p-2.5 transition-all border rounded-none ${isRecording ? 'bg-white text-black border-white shadow-lg' : 'bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800'} disabled:opacity-40`}
              >
                {isRecording ? <Square className="w-4 h-4 fill-black text-black" /> : <Mic className="w-4 h-4" />}
              </button>

              <button 
                onClick={handleCycleRecordTimer}
                disabled={isRecording || countdownActive}
                title="Toggle Capture Pre-delay Timer"
                className={`p-2.5 transition-all border rounded-none flex items-center gap-1.5 ${recordTimer > 0 ? 'bg-zinc-100 text-black border-white font-bold' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'} disabled:opacity-20`}
              >
                <Timer className="w-4 h-4" />
                <span className="font-mono text-[10px] tracking-tighter">{recordTimer > 0 ? `${recordTimer}s` : '0s'}</span>
              </button>
            </div>

            {/* LIVE TRACK WITH REAL-TIME PLAYHEAD */}
            <div className="flex-1 min-h-[56px] relative flex items-center p-1 bg-zinc-950 border border-zinc-900 overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-900 rounded-none">
              
              {isPlayingSandbox && sandboxItem && (
                <div 
                  className="absolute top-0 bottom-0 w-[1px] bg-white z-40 shadow-[0_0_4px_rgba(255,255,255,0.7)]"
                  style={{ left: `${sandboxPlayhead}px` }}
                />
              )}

              {countdownActive ? (
                <div className="w-full text-center py-2 text-xs font-mono text-zinc-400 tracking-widest uppercase animate-pulse">
                  ⏱️ Capture sequence delayed: {countdownSeconds}s remaining...
                </div>
              ) : isRecording ? (
                <div 
                  className="h-12 bg-zinc-900 border border-zinc-700 text-white p-2.5 flex items-center justify-between shadow-lg overflow-hidden whitespace-nowrap animate-pulse rounded-none"
                  style={{ width: `${Math.max(1, recordingSeconds * zoomLevel)}px` }}
                >
                  {recordingSeconds * zoomLevel > 140 && (
                    <span className="text-[9px] font-mono font-bold tracking-tight text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" /> Tracking Signal...
                    </span>
                  )}
                  <span className="ml-auto bg-black px-1.5 py-0.5 text-white border border-zinc-800 font-bold font-mono text-[9px] rounded-none">
                    {recordingSeconds.toFixed(1)}s
                  </span>
                </div>
              ) : sandboxItem ? (
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, sandboxItem.id, true)}
                  className="h-12 bg-zinc-900 border border-zinc-700 text-zinc-200 p-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing shadow-lg group/sandbox rounded-none relative"
                  style={{ width: `${sandboxItem.duration * zoomLevel}px`, minWidth: '180px' }}
                >
                  <span className="text-[9px] font-mono font-bold tracking-tight text-zinc-400 flex items-center gap-1 z-10">
                    Drag Up to a Row Slot <ArrowUpRight className="w-2.5 h-2.5" />
                  </span>
                  
                  <div className="flex-1 max-w-[40%] flex items-center justify-center gap-[1.5px] h-4 opacity-20 px-4">
                    {sandboxItem.waveProfile?.slice(0, 12).map((height, idx) => (
                      <div key={idx} className="w-[2px] bg-white rounded-none" style={{ height: `${height * 0.6}%` }} />
                    ))}
                  </div>

                  <span className="bg-black px-1.5 py-0.5 text-zinc-400 border border-zinc-800 font-bold font-mono text-[9px] rounded-none z-10">{sandboxItem.duration.toFixed(1)}s</span>
                </div>
              ) : (
                <div className="w-full text-center py-2 text-xs font-mono text-zinc-700">
                  Staging layout clear. Use the mic tool to capture profiles.
                </div>
              )}
            </div>

            {/* TRASH DROPZONE */}
            <div className="pl-2 border-l border-zinc-900 h-full flex items-center">
              {draggingClipId ? (
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleTrashDrop}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 border border-dashed border-red-900/60 bg-red-950/20 text-red-400 font-bold text-xs font-mono animate-pulse rounded-none h-10 box-border"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Drop to Trash</span>
                </div>
              ) : (
                <button 
                  onClick={toggleSandboxPlayback} 
                  disabled={!sandboxItem || isRecording || countdownActive} 
                  className="flex items-center gap-1.5 px-3.5 py-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-20 rounded-none h-10"
                >
                  {isPlayingSandbox ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>Solo Preview</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* CONTROLS MASTER FOOTER BAR */}
        <footer className="h-20 border-t border-zinc-900 bg-black px-8 flex items-center justify-between backdrop-blur-md z-20 rounded-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-zinc-955 border border-zinc-900 px-3 py-1 rounded-none gap-2 shadow-inner">
              <button 
                onClick={handleGlobalPlayback} 
                disabled={audioItems.length === 0 || isRecording || countdownActive} 
                className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 font-bold text-xs tracking-wide uppercase transition-all disabled:opacity-20 rounded-none"
              >
                {isPlayingGlobal ? <Pause className="w-3.5 h-3.5 fill-zinc-100" /> : <Play className="w-3.5 h-3.5 fill-zinc-100" />}
                <span>{isPlayingGlobal ? 'Pause' : 'Play'}</span>
              </button>

              <button 
                onClick={handleGlobalStop} 
                disabled={audioItems.length === 0 || isRecording || countdownActive} 
                className="flex items-center gap-2 px-4 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-zinc-400 font-bold text-xs tracking-wide uppercase transition-all disabled:opacity-20 rounded-none"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Stop / Reset</span>
              </button>
            </div>
          </div>
          
          {/* BOTTOM RIGHT CONTROLS SUB-GRID */}
          <div className="flex items-center gap-8 font-mono">
            {/* ROW HEIGHT DENSITY SLIDER */}
            <div className="space-y-1 w-32 hidden xl:block">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>ROW DENSITY</span>
                <span className="text-zinc-400">{rowHeight}px</span>
              </div>
              <input 
                type="range" min="48" max="96" step="8" 
                value={rowHeight} onChange={(e) => setRowHeight(parseInt(e.target.value))}
                className="w-full accent-white bg-zinc-800 rounded-none appearance-none h-1 cursor-pointer"
              />
            </div>

            {/* ZOOM SLIDER */}
            <div className="space-y-1 w-36 hidden lg:block">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span className="flex items-center gap-1"><ZoomIn className="w-2.5 h-2.5"/> ZOOM</span>
                <span className="text-zinc-400">{zoomLevel}px/s</span>
              </div>
              <input 
                type="range" min="40" max="150" step="10" 
                value={zoomLevel} onChange={(e) => setZoomLevel(parseInt(e.target.value))}
                className="w-full accent-white bg-zinc-800 rounded-none appearance-none h-1 cursor-pointer"
              />
            </div>

            {/* MASTER DECK SYSTEM SPEED */}
            <div className="space-y-1 w-36 hidden sm:block">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>GLOBAL SPEED</span>
                <span className="text-zinc-300 font-bold">{playbackSpeed.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.5" max="2.0" step="0.1" 
                value={playbackSpeed} onChange={handleMasterSpeedChange}
                className="w-full accent-white bg-zinc-800 rounded-none appearance-none h-1 cursor-pointer"
              />
            </div>

            <div className="text-right hidden md:block">
              <p className="text-[10px] font-bold uppercase text-zinc-600 tracking-wider">Mix Layout Array</p>
              <p className="text-xs text-zinc-500 font-medium">{audioItems.length} Tracks Assigned</p>
            </div>
          </div>
        </footer>

      </main>

    </div>
  );
}