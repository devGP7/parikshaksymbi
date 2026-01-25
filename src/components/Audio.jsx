import React, { useState, useRef, useEffect } from 'react';
import { useFirebase, app } from "../context/Firebase";
import { getFirestore, collection, getDocs, doc, addDoc, updateDoc, setDoc, arrayUnion, serverTimestamp, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import Logo2 from "../pictures/Logo2.png";
import {
    Mic, Upload, Activity, FileAudio, Play,
    AlertCircle, RotateCcw, WifiOff, Heart,
    BarChart3, Lock, BrainCircuit, Users,
    GraduationCap, MessageCircle, CheckCircle2,
    HelpCircle, BookOpen, Zap, Gauge,
    Waves, MoveRight, Mic2, Cpu, PartyPopper, Users2, Clock, Server, Download, Key, Link, AlertTriangle, Volume2, Radio, Layers
} from 'lucide-react';

// API Keys & Endpoints (Allow Env Override but default to User Code)
const DEFAULT_GOOGLE_KEY = import.meta.env.VITE_EXTERNAL_API_KEY || "";
const DEFAULT_SERVER_URL = import.meta.env.VITE_DEFAULT_SERVER_URL || "https://knaggy-nonadhesively-aaliyah.ngrok-free.dev";

const Audio = ({ userRole }) => {
    // --- NAVIGATION STATE ---
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { isUserLoggedIn, currentUser } = useFirebase();
    const navigate = useNavigate();

    const handleNavigation = (path) => {
        navigate(path);
        setIsMenuOpen(false);
    };

    // --- ANALYSIS STATE ---
    const [googleKey, setGoogleKey] = useState(DEFAULT_GOOGLE_KEY);
    const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);

    const [file, setFile] = useState(null);
    const [status, setStatus] = useState("idle");
    const [logs, setLogs] = useState([]);
    const [results, setResults] = useState(null);
    const [partialResults, setPartialResults] = useState(null); // For real-time streaming updates
    const [audioUrl, setAudioUrl] = useState(null);

    // Libs & Models loaded dynamically
    const [Pitchfinder, setPitchfinder] = useState(null);

    useEffect(() => {
        const loadLibs = async () => {
            try {
                // 1. Load Pitchfinder (Signal Analysis)
                const pfModule = await import('https://esm.sh/pitchfinder@2.3.0');
                setPitchfinder(pfModule);

                addLog("✅ Local Signal Engine Ready");
            } catch (e) {
                console.error("Failed to load libraries:", e);
                addLog("⚠️ Warning: Local libraries failed. Functionality limited.");
            }
        };
        loadLibs();
    }, []);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
            setAudioUrl(URL.createObjectURL(e.target.files[0]));
            setResults(null);
            setPartialResults(null);
            setLogs([]);
            setStatus("idle");
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const mapDimensionsToLabel = (arousal, valence) => {
        if (arousal >= 0.5 && valence >= 0.5) return "Happy/High Energy";
        if (arousal >= 0.75 && valence < 0.5) return "High Energy"; // Replaces Angry, harder threshold
        if (arousal < 0.5 && valence >= 0.5) return "Calm/Relaxed";
        if (arousal < 0.5 && valence < 0.5) return "Sad/Bored";
        return "Neutral";
    };

    // --- STREAMING SERVER ANALYSIS (NDJSON) ---
    const runServerAnalysis = async (audioFile, onChunk) => {
        if (!serverUrl) {
            addLog("⚠️ No Server URL provided. Skipping server analysis.");
            return [];
        }

        const cleanUrl = serverUrl.replace(/\/$/, "");
        const API_ENDPOINT = `${cleanUrl}/analyze`;

        addLog(`🌐 Opening Stream to Colab Backend (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)...`);

        const formData = new FormData();
        formData.append('file', audioFile);

        let accumulatedResults = [];

        try {
            const response = await fetch(API_ENDPOINT, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                if (response.status === 404) throw new Error("Endpoint not found (404). Check Server URL.");
                if (response.status === 502) throw new Error("Bad Gateway (502). Ngrok tunnel might be down.");
                throw new Error(`Server Error ${response.status}`);
            }

            // Stream Handling
            if (!response.body) throw new Error("ReadableStream not supported.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            addLog("⚡ Stream Connected. Receiving live analysis...");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");

                // Keep the last part if incomplete
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);

                        // Map server result
                        const mappedChunk = {
                            start: chunk.start,
                            end: chunk.end,
                            emotion: mapDimensionsToLabel(chunk.emotions.arousal, chunk.emotions.valence),
                            confidence: (chunk.emotions.arousal + chunk.emotions.dominance) / 2,
                            raw_emotion: chunk.emotions,
                            server_disturbances: chunk.disturbances || chunk.noise_events || []
                        };

                        accumulatedResults.push(mappedChunk);

                        // Notify Caller for UI Update
                        if (onChunk) onChunk(mappedChunk, accumulatedResults);

                    } catch (e) {
                        console.warn("JSON Parse Error in stream:", e);
                    }
                }
            }

            addLog(`✅ Server Stream Complete. ${accumulatedResults.length} segments received.`);
            return accumulatedResults;

        } catch (e) {
            console.error("Stream error:", e);
            addLog(`⚠️ Stream Interrupted: ${e.message}. Using partial data (${accumulatedResults.length} segments)...`);
            // CRITICAL: Return what we have so far instead of failing completely
            return accumulatedResults;
        }
    };

    // --- BUCKET DISTURBANCES INTO 30s SEGMENTS ---
    // Updated to only rely on Server Data
    const generateDisturbanceTimeline = (totalDuration, serverTimeline) => {
        const segments = [];
        const segmentDuration = 30;

        // If streaming failed early, totalDuration might be longer than serverTimeline covers.
        for (let t = 0; t < totalDuration; t += segmentDuration) {
            const end = Math.min(t + segmentDuration, totalDuration);

            // 1. Check Server Data for this time slice
            const serverChunk = serverTimeline?.find(c => c.start >= t && c.start < end);
            const serverEvents = serverChunk?.server_disturbances || [];

            // 2. Merge (Just server events now)
            const allEvents = [...new Set([...serverEvents])];

            segments.push({
                start: t,
                end: end,
                hasDisturbance: allEvents.length > 0,
                events: allEvents,
                source: "Server"
            });
        }
        return segments;
    };

    // --- SIGNAL PROCESSING ---
    const calculateAudioFeatures = async (file) => {
        if (!Pitchfinder) return null;
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Simple Pitch/Energy calculation
        let sumSquares = 0;
        const detectPitch = Pitchfinder.YIN({ sampleRate });
        const pitches = [];
        const step = 8192;
        let iteration = 0;

        for (let i = 0; i < data.length; i += step) {
            const chunk = data.slice(i, i + 2048);
            if (chunk.length < 2048) break;
            let sum = 0;
            for (let s of chunk) sum += s * s;
            sumSquares += sum;
            const p = detectPitch(chunk);
            if (p && p > 60 && p < 500) pitches.push(p);
            iteration++;
            if (iteration % 50 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }

        const avgRMS = Math.sqrt(sumSquares / (data.length / (step / 2048)));
        const avgPitch = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0;
        const estimatedPace = (pitches.length / (audioBuffer.duration / 60)) * 2;

        return { avgRMS, avgPitch, estimatedPace, audioBuffer };
    };

    // Convert file to Base64
    const fileToGenerativePart = async (file) => {
        const base64EncodedDataPromise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });
        return {
            inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
        };
    };

    // --- HELPERS FOR LARGE FILE CHUNKING ---

    // Convert AudioBuffer to WAV Blob (Mono, 16-bit to save space)
    const audioBufferToWav = (buffer, startSample, endSample) => {
        const numOfChan = 1; // Force mono
        const length = (endSample - startSample) * 2 + 44;
        const outBuffer = new ArrayBuffer(length);
        const view = new DataView(outBuffer);
        const channels = [];
        let i;
        let sample;
        let offset = 0;
        let pos = 0;

        // Write WAVE Header
        const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
        const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit

        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        // Interleave data (only 1 channel here)
        // Get left channel (or mono)
        const channelData = buffer.getChannelData(0);

        // Write data
        let p = startSample;
        while (p < endSample && p < channelData.length) {
            sample = Math.max(-1, Math.min(1, channelData[p])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale
            view.setInt16(44 + offset, sample, true);
            offset += 2;
            p++;
        }

        return new Blob([outBuffer], { type: "audio/wav" });
    };

    const runAnalysis = async () => {
        if (!file) return;
        setStatus("processing");
        setLogs([]);
        setResults(null);
        setPartialResults({ timeline: [], disturbanceTimeline: [], signal: null });

        try {
            addLog("⚙️ Initializing Pipeline...");

            // 1. SIGNAL PROCESSING
            addLog("📊 Processing Signal Metrics (Local)...");
            const signalMetrics = await calculateAudioFeatures(file);
            const { audioBuffer } = signalMetrics;
            addLog(`✅ Signal: ${Math.round(signalMetrics.avgPitch)}Hz | ${Math.round(signalMetrics.estimatedPace)} bpm`);

            setPartialResults(prev => ({ ...prev, signal: signalMetrics }));

            // 2. SERVER ANALYSIS (Streaming)
            const handleServerChunk = (newChunk, allChunks) => {
                const currentDisturbanceTimeline = generateDisturbanceTimeline(audioBuffer.duration, allChunks);
                setPartialResults(prev => ({
                    ...prev,
                    timeline: allChunks,
                    disturbanceTimeline: currentDisturbanceTimeline
                }));
            };

            let serverTimeline = await runServerAnalysis(file, handleServerChunk);
            const disturbanceTimeline = generateDisturbanceTimeline(audioBuffer.duration, serverTimeline);

            // 3. CLOUD ANALYSIS (LLM)
            addLog("📤 Uploading to LLM Engine...");

            // Check file size limit (18MB safety threshold for inline data)
            const MAX_INLINE_SIZE = 18 * 1024 * 1024;

            let finalAiAnalysis = null;

            if (file.size <= MAX_INLINE_SIZE) {
                // --- STANDARD FLOW (Small File) ---
                const audioPart = await fileToGenerativePart(file);
                finalAiAnalysis = await generateStandardReport(audioPart, audioBuffer.duration, serverTimeline, disturbanceTimeline, signalMetrics);
            } else {
                // --- CHUNKING FLOW (Large File) ---
                addLog(`📦 Large File Detected (>18MB). Engaging Chunked Analysis Mode...`);

                // Chunk Config: 3 minutes (~172 seconds of 16-bit 48kHz mono is ~16MB)
                const CHUNK_DURATION_SEC = 180;
                const totalDuration = audioBuffer.duration;
                const chunks = Math.ceil(totalDuration / CHUNK_DURATION_SEC);
                const partialSummaries = [];

                for (let i = 0; i < chunks; i++) {
                    const startT = i * CHUNK_DURATION_SEC;
                    const endT = Math.min((i + 1) * CHUNK_DURATION_SEC, totalDuration);

                    addLog(`🔹 Processing Chunk ${i + 1}/${chunks} (${formatTime(startT)} - ${formatTime(endT)})...`);

                    // 1. Extract valid audio slice
                    const startSample = Math.floor(startT * audioBuffer.sampleRate);
                    const endSample = Math.floor(endT * audioBuffer.sampleRate);
                    const chunkBlob = audioBufferToWav(audioBuffer, startSample, endSample);

                    // 2. Prepare Base64
                    const base64Promise = new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(chunkBlob);
                    });
                    const chunkBase64 = await base64Promise;
                    const chunkPart = { inlineData: { data: chunkBase64, mimeType: "audio/wav" } };

                    // 3. Filter Metadata for this chunk
                    const chunkEmotions = serverTimeline.filter(s => s.start >= startT && s.end <= endT);
                    const chunkDisturbances = disturbanceTimeline.filter(d => d.start >= startT && d.end <= endT && d.hasDisturbance);

                    // 4. Analyze Chunk
                    try {
                        const summary = await analyzeChunk(chunkPart, i, chunks, startT, endT, chunkEmotions, chunkDisturbances);
                        partialSummaries.push(summary);
                    } catch (e) {
                        console.error(`Chunk ${i} failed`, e);
                        addLog(`⚠️ Chunk ${i + 1} analysis failed. Continuing...`);
                    }
                }

                addLog("🔮 Synthesizing God Report from chunks...");
                finalAiAnalysis = await synthesizeGodReport(partialSummaries, serverTimeline, disturbanceTimeline, signalMetrics);
            }

            setResults({
                ai: finalAiAnalysis,
                signal: signalMetrics,
                timeline: serverTimeline || [],
                disturbanceTimeline: disturbanceTimeline,
                rawDisturbances: []
            });
            setStatus("success");
            setPartialResults(null);
            addLog("✨ Analysis Complete.");

        } catch (err) {
            console.error(err);
            addLog(`❌ Error: ${err.message}`);
            setStatus("error");
        }
    };

    // --- LLM HELPERS ---

    const fetchWithRetry = async (prompt, audioPart = null) => {
        const fetchFromModel = async (modelName) => {
            const parts = [{ text: prompt }];
            if (audioPart) parts.push(audioPart);

            return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: parts }] })
            });
        };

        // Standard Flow: Try Gemini 2.5 Flash -> Fallback to 1.5 Flash
        let response = await fetchFromModel("gemini-2.5-flash-preview-09-2025");

        if (!response.ok) {
            const errText = await response.text();
            addLog(`⚠️ 2.5 Flash Failed (${response.status}). Retrying with 1.5 Flash...`);
            console.warn("Gemini 2.5 Error:", errText);

            response = await fetchFromModel("gemini-1.5-flash");
        }

        if (!response.ok) throw new Error(`Cloud API Failed: ${response.status}`);

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        return text.replace(/```json/g, '').replace(/```/g, '').trim();
    };

    // 1. Analyze a single chunk (returns text summary)
    const analyzeChunk = async (audioPart, index, total, startT, endT, emotions, disturbances) => {
        const emotionContext = JSON.stringify(emotions.map(s => ({ t: `${Math.round(s.start)}-${Math.round(s.end)}s`, e: s.emotion })));
        const disturbanceContext = JSON.stringify(disturbances.map(d => ({ t: `${d.start}-${d.end}s`, events: d.events })));

        const prompt = `
        Analyze this PARTIAL AUDIO CHUNK (${index + 1} of ${total}).
        Time Range: ${Math.round(startT)}s to ${Math.round(endT)}s.
        
        Context Data for this chunk:
        - Emotions: ${emotionContext}
        - Disturbances: ${disturbanceContext}
        
        Task: Briefly summarize the teaching interaction, student engagement, and any specific disturbances heard in this segment. 
        Focus on clarity and pedagogical quality.
        Output a short paragraph.
        `;

        return await fetchWithRetry(prompt, audioPart);
    };

    // 2. Synthesize God Report (No audio, just text)
    const synthesizeGodReport = async (summaries, emotionTimeline, disturbanceTimeline, signalMetrics) => {
        const prompt = `
        Generate a Final Pedagogical God Report based on these sequential analysis summaries of a long classroom recording.
        
        CHUNK SUMMARIES (Chronological):
        ${summaries.map((s, i) => `Chunk ${i + 1}: ${s}`).join('\n\n')}
        
        GLOBAL METRICS:
        - Avg Pitch: ${Math.round(signalMetrics.avgPitch)}Hz
        - Pace: ${Math.round(signalMetrics.estimatedPace)}bpm
        - Total Emotions: ${emotionTimeline.length} segments analyzed
        
        Output strictly this JSON:
        {
            "interaction_summary": "Comprehensive summary of the entire session.",
            "disturbance_conclusion": "Conclusion on how noise/interruptions evolved throughout the session.",
            "metrics": {
                "doubt_clarity_score": (1-10),
                "explanation_quality_score": (1-10),
                "interaction_understandability": (1-10)
            },
            "feedback": "Detailed pedagogical critique and recommendations."
        }
        `;

        const jsonStr = await fetchWithRetry(prompt, null);
        return JSON.parse(jsonStr);
    };

    // 3. Standard Single-Pass Report
    const generateStandardReport = async (audioPart, duration, emotionTimeline, disturbanceTimeline, signalMetrics) => {
        const emotionContext = JSON.stringify(emotionTimeline.map(s => ({ t: `${Math.round(s.start)}-${Math.round(s.end)}s`, e: s.emotion })));
        const disturbanceContext = JSON.stringify(disturbanceTimeline.filter(d => d.hasDisturbance).map(d => ({ t: `${d.start}-${d.end}s`, events: d.events })));

        const prompt = `
        Analyze this classroom audio.
        Duration: ${Math.round(duration)}s
        
        DATA:
        - Emotion Timeline: ${emotionContext}
        - Disturbance Timeline: ${disturbanceContext}
        - Pitch: ${Math.round(signalMetrics.avgPitch)}Hz
        - Pace: ${Math.round(signalMetrics.estimatedPace)}bpm
        
        TASK: Evaluate teaching quality, clarity, and engagement.
        
        Output strictly this JSON:
        {
            "interaction_summary": "1-sentence summary.",
            "disturbance_conclusion": "Detailed conclusion about noise/disturbances.",
            "metrics": {
                "doubt_clarity_score": (1-10),
                "explanation_quality_score": (1-10),
                "interaction_understandability": (1-10)
            },
            "feedback": "Pedagogical critique."
        }
        `;

        const jsonStr = await fetchWithRetry(prompt, audioPart);
        return JSON.parse(jsonStr);
    };

    // Determine which dataset to show (Final Results OR Partial/Live Results)
    const activeData = results || (status === 'processing' ? partialResults : null);

    return (
        <div>
            {/* --- NAVBAR (Preserved) --- */}
            <nav className="fixed top-0 left-0 w-full flex bg-black justify-between text-white z-20 shadow-lg">
                <div className="left flex flex-row items-center p-2 sm:p-0">
                    <img className="w-14 h-14 sm:w-16 sm:h-16 ms-4 mt-4 sm:ms-20 object-cover scale-180 origin-center" src={Logo2} alt="Logo" />
                    <div className="name mt-0 sm:mt-7 mx-2 sm:mx-5 text-base sm:text-lg font-medium">Parikshak AI</div>
                </div>

                {/* Desktop Navigation */}
                <div className="right hidden sm:flex flex-row justify-around items-center">
                    {userRole !== 'teacher' && (
                        <>
                            <span className="mx-6 cursor-pointer" onClick={() => handleNavigation("/")}>Home</span>
                            <span onClick={() => handleNavigation("/insights")} className="mx-6 cursor-pointer">Insights</span>
                        </>
                    )}
                    <span onClick={() => handleNavigation('/textanalysis')} className="mx-6 cursor-pointer">Upload & Analyse</span>
                    {userRole !== 'teacher' && (
                        <span onClick={() => handleNavigation("/live")} className="mx-6 cursor-pointer">Live Monitor</span>
                    )}
                    <span onClick={() => handleNavigation("/audio")} className="mx-6 cursor-pointer font-bold text-[#24cfa6]">Audio Analysis</span>
                    <span onClick={() => handleNavigation("/feedback")} className="mx-6 cursor-pointer">Feedback</span>
                    {isUserLoggedIn ? (
                        <img src={currentUser?.photoURL || "/fallback-avatar.png"} alt="User Profile" className="mx-10 w-10 h-10 rounded-full border border-white cursor-pointer" onClick={() => handleNavigation("/profile")} />
                    ) : (
                        <button className="mx-10 bg-[#24cfa6] h-9 w-28 rounded text-black font-medium" onClick={() => handleNavigation("/login")}>Sign In</button>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <div className="flex items-center sm:hidden me-4">
                    <button className="text-white text-2xl focus:outline-none" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        {isMenuOpen ? "✕" : "☰"}
                    </button>
                </div>
            </nav>

            <div className="min-h-screen pt-24 p-6 md:p-12 flex flex-col items-center bg-black font-sans text-slate-100">
                <div className="max-w-6xl w-full space-y-8">

                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex items-center justify-center p-3 bg-slate-800 rounded-full mb-2">
                            <GraduationCap className="w-8 h-8 text-[#24cfa6]" />
                        </div>
                        <h1 className="text-4xl font-bold text-white tracking-tight">
                            Classroom Interaction Analyst
                        </h1>
                        <p className="text-slate-400 max-w-xl mx-auto">
                            Powered by <strong>Audeering Wav2Vec2 (Streaming)</strong> and <strong>Gemini 2.5</strong>.
                        </p>
                    </div>

                    {/* API Key Inputs (HIDDEN) */}
                    {/* Keys are loaded from env but state is kept for logic to work */}

                    {/* API Key Inputs */}


                    {/* File Upload */}
                    <div className={`
                        relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 group
                        ${file ? 'border-[#24cfa6] bg-slate-900' : 'border-slate-700 bg-slate-900 hover:border-[#24cfa6] hover:bg-slate-800'}
                    `}>
                        <input
                            type="file"
                            accept="audio/*,video/*"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center justify-center text-center pointer-events-none">
                            {file ? (
                                <>
                                    <FileAudio className="w-16 h-16 text-[#24cfa6] mb-4 animate-bounce" />
                                    <p className="text-lg font-medium text-slate-200">{file.name}</p>
                                    <p className="text-sm text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    <audio src={audioUrl} controls className="mt-4 w-64 h-8 pointer-events-auto" />
                                </>
                            ) : (
                                <>
                                    <Upload className="w-16 h-16 text-slate-500 mb-4 group-hover:text-[#24cfa6] transition-colors" />
                                    <p className="text-lg font-medium text-slate-300">Drop audio recording here</p>
                                    <p className="text-sm text-slate-500 mt-1">Supports MP3, WAV, M4A</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-center flex-col items-center gap-2">
                        <button
                            onClick={runAnalysis}
                            disabled={!file || status === 'processing'}
                            className={`
                                flex items-center gap-2 px-8 py-4 rounded-full font-bold text-lg shadow-lg transition-all transform hover:scale-105
                                ${status === 'processing'
                                    ? 'bg-slate-800 text-[#24cfa6] cursor-wait ring-2 ring-[#24cfa6]'
                                    : 'bg-[#24cfa6] text-black hover:bg-[#1ea887] hover:shadow-[#24cfa6]/30'}
                            `}
                        >
                            {status === 'processing' ? (
                                <><Radio className="animate-pulse text-red-500" /> Analysis in Progress...</>
                            ) : (
                                <><Zap className="fill-current text-black" /> Analyze Recording</>
                            )}
                        </button>
                        {file && file.size > 18 * 1024 * 1024 && (
                            <div className="text-xs text-orange-400 flex items-center gap-1 font-semibold">
                                <Layers className="w-3 h-3" />
                                Large file mode: Analysis will be chunked
                            </div>
                        )}
                    </div>

                    {/* Logs Area */}
                    {(status === 'processing' || logs.length > 0) && (
                        <div className="bg-slate-900 text-green-400 font-mono text-sm p-4 rounded-xl overflow-hidden shadow-inner max-h-40 overflow-y-auto">
                            {logs.map((log, i) => (
                                <div key={i} className="mb-1 opacity-90 border-l-2 border-green-500 pl-2">{log}</div>
                            ))}
                            {status === 'processing' && <div className="animate-pulse pl-2 flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full"></span> Live Stream Active...</div>}
                        </div>
                    )}

                    {/* ACTIVE DASHBOARD (Shows Partial or Final Results) */}
                    {activeData && (
                        <div className="animate-fade-in space-y-8 pb-12">

                            {/* SECTION 1: SIGNAL DASHBOARD */}
                            {activeData.signal && (
                                <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl transition-all duration-500">
                                    <h3 className="text-xl font-bold flex items-center gap-3 mb-6">
                                        <Waves className="text-blue-400" />
                                        Audio Signal Profile
                                        {status === 'processing' && <span className="text-xs font-bold text-red-500 bg-red-500/10 border border-red-500 px-2 py-1 rounded-full animate-pulse">LIVE</span>}
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Avg Pitch</span>
                                                <Mic2 className="w-4 h-4 text-purple-400" />
                                            </div>
                                            <div className="text-3xl font-mono font-bold text-purple-200">
                                                {Math.round(activeData.signal.avgPitch)} <span className="text-sm text-purple-400">Hz</span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Est. Pace</span>
                                                <Gauge className="w-4 h-4 text-cyan-400" />
                                            </div>
                                            <div className="text-3xl font-mono font-bold text-cyan-200">
                                                {Math.round(activeData.signal.estimatedPace)} <span className="text-sm text-cyan-400">bpm</span>
                                            </div>
                                        </div>

                                        <div className="bg-gradient-to-br from-orange-900 to-orange-800 p-4 rounded-xl border border-orange-700">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-orange-300 text-xs uppercase font-bold tracking-wider">Disturbances</span>
                                                <AlertTriangle className="w-4 h-4 text-orange-400" />
                                            </div>
                                            <div className="text-2xl font-bold text-orange-100">
                                                {activeData.rawDisturbances && activeData.rawDisturbances.length > 0 ? activeData.rawDisturbances.length : (activeData.disturbanceTimeline.filter(d => d.hasDisturbance).length)} <span className="text-sm text-orange-400">events</span>
                                            </div>
                                            <div className="text-xs text-orange-300 mt-1">
                                                Detected Segments
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SECTION 2: EMOTION TIMELINE (Streaming Updates) */}
                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-lg transition-all duration-300">
                                <h3 className="text-xl font-bold flex items-center gap-3 mb-6 text-slate-800">
                                    <Heart className="text-pink-500" />
                                    Emotional Timeline
                                    <span className="text-xs font-normal text-white bg-pink-500 px-2 py-1 rounded-md flex items-center gap-1">
                                        {status === 'processing' ? <><Activity className="w-3 h-3 animate-spin" /> Live Stream</> : "Final Report"}
                                    </span>
                                </h3>

                                {activeData.timeline && activeData.timeline.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse-once">
                                        {activeData.timeline.map((seg, idx) => (
                                            <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all hover:shadow-md hover:border-pink-200">
                                                <div className="text-xs font-mono font-bold text-slate-400 mb-2 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatTime(seg.start)} - {formatTime(seg.end)}
                                                </div>
                                                <div className={`text-lg font-bold capitalize mb-1 ${seg.emotion.toLowerCase().includes('hap') ? 'text-green-600' :
                                                    seg.emotion.toLowerCase().includes('ang') ? 'text-red-600' :
                                                        seg.emotion.toLowerCase().includes('sad') ? 'text-blue-600' : 'text-slate-600'
                                                    }`}>
                                                    {seg.emotion}
                                                </div>
                                                <span className="text-[10px] text-slate-400 mt-1">Intensity: {Math.round(seg.confidence * 100)}%</span>
                                            </div>
                                        ))}
                                        {status === 'processing' && (
                                            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center opacity-50">
                                                <Activity className="w-6 h-6 text-slate-300 animate-spin mb-2" />
                                                <span className="text-xs text-slate-400">Analyzing next chunk...</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-400 py-8 bg-slate-50 rounded-xl border-dashed border-2 border-slate-200">
                                        <div className="flex flex-col items-center gap-2">
                                            <Activity className="w-8 h-8 text-slate-300 animate-pulse" />
                                            <p>Waiting for first stream packet...</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* SECTION 3: DISTURBANCE TIMELINE */}
                            <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <Volume2 className="w-64 h-64 text-white" />
                                </div>
                                <h3 className="text-xl font-bold flex items-center gap-3 mb-6 text-white relative z-10">
                                    <Volume2 className="text-orange-500" />
                                    Disturbance Timeline
                                    <span className="text-xs font-normal text-white bg-orange-600 px-2 py-1 rounded-md">Server Detected</span>
                                </h3>

                                {activeData.disturbanceTimeline && activeData.disturbanceTimeline.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                                        {activeData.disturbanceTimeline.map((seg, idx) => (
                                            <div key={idx} className={`
                                                rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all border-l-4
                                                ${seg.hasDisturbance
                                                    ? 'bg-orange-900/20 border-orange-500 shadow-sm'
                                                    : 'bg-slate-800 border-green-500/50 opacity-70'}
                                            `}>
                                                <div className="text-xs font-mono font-bold text-slate-400 mb-2 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatTime(seg.start)} - {formatTime(seg.end)}
                                                </div>

                                                {seg.hasDisturbance ? (
                                                    <>
                                                        <div className="flex flex-wrap justify-center gap-1 mb-1">
                                                            {seg.events.slice(0, 2).map((evt, i) => (
                                                                <span key={i} className="text-[10px] font-bold uppercase bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">
                                                                    {evt}
                                                                </span>
                                                            ))}
                                                            {seg.events.length > 2 && (
                                                                <span className="text-[10px] text-orange-600">+{seg.events.length - 2} more</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-orange-400 mt-1">Disturbed</div>
                                                    </>
                                                ) : (
                                                    <div className="text-sm font-medium text-green-600 flex items-center gap-1">
                                                        <CheckCircle2 className="w-4 h-4" /> Clean
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 italic">No disturbance data available yet.</p>
                                )}
                            </div>

                            {/* SECTION 4: AI ANALYSIS (Only shown when done) */}
                            {status === 'success' && activeData.ai && (
                                <>
                                    <div className="bg-[#24cfa6]/10 p-8 rounded-3xl border border-[#24cfa6]/20 shadow-sm">
                                        <h3 className="text-xl font-bold flex items-center gap-3 mb-4 text-[#24cfa6]">
                                            <AlertTriangle className="text-[#24cfa6]" />
                                            Disturbance Analysis Conclusion
                                        </h3>
                                        <div className="space-y-4 text-slate-200">
                                            <p className="font-medium leading-relaxed">{activeData.ai.disturbance_conclusion}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <ScoreCard
                                            title="Understandability"
                                            score={activeData.ai.metrics.interaction_understandability}
                                            icon={<BrainCircuit className="text-emerald-500" />}
                                            color="text-emerald-400"
                                            sub="Doubt Resolution Score"
                                        />
                                        <ScoreCard
                                            title="Explanation Quality"
                                            score={activeData.ai.metrics.explanation_quality_score}
                                            icon={<BookOpen className="text-blue-500" />}
                                            color="text-blue-400"
                                            sub="Teacher Clarity"
                                        />
                                        <ScoreCard
                                            title="Doubt Clarity"
                                            score={activeData.ai.metrics.doubt_clarity_score}
                                            icon={<HelpCircle className="text-amber-500" />}
                                            color="text-amber-400"
                                            sub="Student Articulation"
                                        />
                                    </div>

                                    <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-sm">
                                        <div className="flex items-start gap-4 mb-6">
                                            <div className="p-3 bg-slate-800 rounded-lg">
                                                <MessageCircle className="w-6 h-6 text-[#24cfa6]" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white">Final Pedagogy Judgement</h3>
                                                <p className="text-slate-400 text-sm mt-1">AI assessment of the teaching strategy</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-4 bg-slate-800 rounded-lg border-l-4 border-slate-600">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Interaction Summary</span>
                                                <p className="text-slate-300 italic">{activeData.ai.interaction_summary}</p>
                                            </div>
                                            <div className="p-4 bg-[#24cfa6]/10 rounded-lg border-l-4 border-[#24cfa6]">
                                                <span className="text-xs font-bold text-[#24cfa6] uppercase tracking-wider block mb-1">Critique</span>
                                                <p className="text-slate-200">{activeData.ai.feedback}</p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ScoreCard({ title, score, icon, color, sub }) {
    const getScoreColor = (s) => {
        if (s >= 8) return "text-emerald-400";
        if (s >= 5) return "text-amber-400";
        return "text-red-400";
    };

    return (
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-sm flex flex-col items-center text-center transform transition-all hover:-translate-y-1 hover:shadow-md">
            <div className="mb-3 bg-slate-800 p-3 rounded-full">{icon}</div>
            <h4 className="text-slate-400 font-medium text-sm uppercase tracking-wider">{title}</h4>
            <div className={`text-5xl font-bold my-2 ${getScoreColor(score)}`}>
                {score}<span className="text-2xl text-slate-500">/10</span>
            </div>
            <p className="text-xs font-semibold text-slate-400 bg-slate-800 px-3 py-1 rounded-full">{sub}</p>
        </div>
    );
}

export default Audio;