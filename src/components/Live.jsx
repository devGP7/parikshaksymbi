import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
    Eye, EyeOff, Activity, History, UserCheck,
    ShieldAlert, Smile, Meh, Move, Bug
} from 'lucide-react';
import { useFirebase } from "../context/Firebase";
import { useNavigate } from "react-router-dom";
import Logo2 from "../pictures/Logo2.png";

/* ===================== NAVBAR ===================== */
const LiveMonitorNavbar = ({ userRole }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();
    const { isUserLoggedIn, currentUser } = useFirebase();

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const handleNavigation = (path) => {
        navigate(path);
        if (isMenuOpen) {
            setIsMenuOpen(false);
        }
    };

    return (
        <>
            <nav className="fixed top-0 left-0 w-full flex bg-transparent justify-between text-white z-20">
                <div className="left flex flex-row items-center p-2 sm:p-0">
                    <img className="w-14 h-14 sm:w-16 sm:h-16 ms-4 mt-4 sm:ms-20 object-cover scale-180 origin-center" src={Logo2} alt="Logo" />
                    <div className="name mt-0 sm:mt-7 mx-2 sm:mx-5 text-base sm:text-lg font-medium">Parikshak AI</div>
                </div>

                {/* Desktop Navigation */}
                <div className="right hidden sm:flex flex-row justify-around items-center">
                    <span className="mx-6 cursor-pointer" onClick={() => handleNavigation("/")}>Home</span>

                    {/* ROLE SPECIFIC: Student/Admin only see Insights */}
                    {userRole !== "teacher" && (
                        <span onClick={() => handleNavigation("/insights")} className="mx-6 cursor-pointer">Insights</span>
                    )}

                    <span onClick={() => handleNavigation('/textanalysis')} className="mx-6 cursor-pointer">Upload & Analyse</span>
                    <span onClick={() => handleNavigation("/live")} className="mx-6 cursor-pointer">Live Monitor</span>


                    <span onClick={() => handleNavigation("/feedback")} className="mx-6 cursor-pointer">Feedback</span>

                    {isUserLoggedIn ? (
                        <img
                            src={currentUser?.photoURL || "/fallback-avatar.png"}
                            alt="User Profile"
                            className="mx-10 w-10 h-10 rounded-full border border-white cursor-pointer"
                            onClick={() => handleNavigation("/profile")}
                        />
                    ) : (
                        <button className="mx-10 bg-[#24cfa6] h-9 w-28 rounded text-black font-medium" onClick={() => handleNavigation("/login")}>
                            Sign In
                        </button>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <div className="flex items-center sm:hidden me-4">
                    {isUserLoggedIn ? (
                        <img src={currentUser?.photoURL || "/fallback-avatar.png"} alt="User Avatar" className="w-8 h-8 rounded-full border border-white me-4 cursor-pointer" onClick={() => handleNavigation("/profile")} />
                    ) : (
                        <button className="bg-[#24cfa6] h-8 w-16 rounded text-black text-sm font-medium me-4" onClick={() => handleNavigation("/login")}>Sign In</button>
                    )}
                    <button className="text-white text-2xl focus:outline-none" onClick={toggleMenu}>
                        {isMenuOpen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                        )}
                    </button>
                </div>
            </nav>

            {/* Mobile Menu Dropdown */}
            <div className={`fixed top-16 left-0 w-full bg-black/95 backdrop-blur-sm z-10 sm:hidden transition-all duration-300 ease-in-out ${isMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                <div className="flex flex-col items-center py-4 space-y-3">
                    <span className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Home</span>

                    {userRole !== "teacher" && (
                        <span onClick={() => handleNavigation("/insights")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Insights</span>
                    )}

                    <span onClick={() => handleNavigation('/textanalysis')} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Upload & Analyse</span>
                    <span onClick={() => handleNavigation("/live")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Live Monitor</span>


                    <span onClick={() => handleNavigation("/feedback")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Feedback</span>
                </div>
            </div>
        </>
    );
};


// --- Main Component ---
const Live = ({ userRole }) => {
    // ... rest of the Live component logic remains the same ...
    // ... (Your existing code for states, refs, useEffect, predictWebcam, etc.) ...

    // Firebase & Router
    const { isUserLoggedIn, currentUser, loginWithGoogle } = useFirebase();
    const navigate = useNavigate();

    // --- GEMINI API CONFIGURATION ---
    const apiKey = import.meta.env.VITE_EXTERNAL_API_KEY;

    // --- State Management ---
    const [score, setScore] = useState(50);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);

    // Real-time Metrics
    const [gazeStatus, setGazeStatus] = useState("Initializing...");
    const [isAngry, setIsAngry] = useState(false); // Used for visual alert

    // --- Movement Metrics ---
    const [movementIntensity, setMovementIntensity] = useState(0);
    const [movementLabel, setMovementLabel] = useState("Detecting...");
    const [staticTimer, setStaticTimer] = useState(0);

    // Debug Metrics for Calibration
    const [debugMetrics, setDebugMetrics] = useState({ pitchRatio: 0, eyeScore: 0 });

    // Emotion Analysis State (Simplified)
    const [currentEmotion, setCurrentEmotion] = useState({ label: 'Neutral', confidence: 0 });

    // Logs
    const [logs, setLogs] = useState([]);

    // --- AI FEATURES STATE ---
    const [quickTip, setQuickTip] = useState(null);
    const [isTipLoading, setIsTipLoading] = useState(false);

    // --- Refs ---
    const videoRef = useRef(null);
    const landmarkerRef = useRef(null);
    const requestRef = useRef(null);
    const streamRef = useRef(null);
    const lastVideoTimeRef = useRef(-1);

    // --- Logic Refs (Timers) ---
    const lastNosePosRef = useRef({ x: 0.5, y: 0.5 });
    const timersRef = useRef({
        staticStart: Date.now(),
        readingStart: null,
        focusStart: null,
        neutralStart: null,
        happyStart: null,
        angryStart: null
    });

    // --- Constants (PERFECT SCORING PATTERN) ---
    const MOVEMENT_THRESHOLD = 0.005;
    const STATIC_LIMIT_MS = 60000; // Static limit: 60 seconds

    // --- Helper: Add to Log ---
    const addLog = (message, type = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, message, type }, ...prev].slice(0, 10));
    };

    // --- Helper: Stop Webcam ---
    const stopWebcam = useCallback(() => {
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
        addLog("Webcam stopped.", "info");
    }, []);

    // 1. Initialize MediaPipe
    useEffect(() => {
        const loadModel = async () => {
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );

                landmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                        delegate: "GPU"
                    },
                    outputFaceBlendshapes: true,
                    runningMode: "VIDEO",
                    numFaces: 1
                });

                setIsModelLoaded(true);
                addLog("Vision Model loaded.", "success");
            } catch (error) {
                console.error("Error loading MediaPipe:", error);
                addLog("Failed to load Vision Model", "error");
            }
        };
        loadModel();
        return () => stopWebcam();
    }, [stopWebcam]);

    // 4. The Prediction Loop
    const predictWebcam = useCallback(() => {
        const video = videoRef.current;
        const landmarker = landmarkerRef.current;
        const now = Date.now();

        if (video && landmarker) {
            let startTimeMs = performance.now();

            if (video.currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
                lastVideoTimeRef.current = video.currentTime;

                const result = landmarker.detectForVideo(video, startTimeMs);

                if (result.faceBlendshapes && result.faceBlendshapes.length > 0 && result.faceLandmarks && result.faceLandmarks.length > 0) {
                    const shapes = result.faceBlendshapes[0].categories;
                    const landmarks = result.faceLandmarks[0];

                    const getShape = (name) => shapes.find(s => s.categoryName === name)?.score || 0;

                    // ----------------------------------------------------------------
                    // 1. EMOTION DETECTION
                    // ----------------------------------------------------------------
                    const happyScore = (getShape('mouthSmileLeft') + getShape('mouthSmileRight')) / 2;
                    const angryScore = (getShape('browDownLeft') + getShape('browDownRight') + getShape('jawForward')) / 3;
                    const neutralThreshold = 0.3;

                    let emotionLabel = 'Neutral';
                    let maxScore = 0;

                    if (happyScore > neutralThreshold && happyScore > angryScore) {
                        emotionLabel = 'Happy';
                        maxScore = happyScore;
                    } else if (angryScore > neutralThreshold && angryScore > happyScore) {
                        emotionLabel = 'Angry';
                        maxScore = angryScore;
                    }

                    setCurrentEmotion({ label: emotionLabel, confidence: maxScore });
                    setIsAngry(emotionLabel === 'Angry' && angryScore > 0.6);

                    // --- SCORING: EMOTIONS ---

                    // Happy: +1 every 60s
                    if (emotionLabel === 'Happy') {
                        if (!timersRef.current.happyStart) timersRef.current.happyStart = now;
                        else if (now - timersRef.current.happyStart > 60000) {
                            setScore(s => Math.min(100, s + 1));
                            addLog("Reward (+1): Happy for 1 min", "success");
                            timersRef.current.happyStart = now;
                        }
                    } else {
                        timersRef.current.happyStart = null;
                    }

                    // Neutral: -1 every 3 mins (180s)
                    if (emotionLabel === 'Neutral') {
                        if (!timersRef.current.neutralStart) timersRef.current.neutralStart = now;
                        else if (now - timersRef.current.neutralStart > 180000) {
                            setScore(s => Math.max(0, s - 1));
                            addLog("Penalty (-1): Neutral for 3 mins", "warning");
                            timersRef.current.neutralStart = now;
                        }
                    } else {
                        timersRef.current.neutralStart = null;
                    }

                    // Angry: -5 every 10s
                    if (emotionLabel === 'Angry') {
                        if (!timersRef.current.angryStart) timersRef.current.angryStart = now;
                        else if (now - timersRef.current.angryStart > 10000) {
                            setScore(s => Math.max(0, s - 5));
                            addLog("Penalty (-5): Anger detected (10s)", "error");
                            timersRef.current.angryStart = now;
                        }
                    } else {
                        timersRef.current.angryStart = null;
                    }

                    // ----------------------------------------------------------------
                    // 2. GAZE / READING DETECTION
                    // ----------------------------------------------------------------
                    const nose = landmarks[1];
                    const chin = landmarks[152];
                    const forehead = landmarks[10];
                    const noseToChin = Math.abs(chin.y - nose.y);
                    const noseToForehead = Math.abs(nose.y - forehead.y);

                    const headPitchRatio = noseToChin / (noseToForehead || 1);
                    const eyeLookDown = (getShape('eyeLookDownLeft') + getShape('eyeLookDownRight')) / 2;

                    let isReading = false;
                    // Adjusted the reading logic for a wider range of head movements
                    if (headPitchRatio < 1.0 || eyeLookDown > 0.6) {
                        setGazeStatus("Reading / Looking Down");
                        isReading = true;
                    } else {
                        setGazeStatus("Focused on Class");
                        isReading = false;
                    }
                    setDebugMetrics({ pitchRatio: headPitchRatio, eyeScore: eyeLookDown });

                    // --- SCORING: GAZE ---

                    if (isReading) {
                        timersRef.current.focusStart = null;
                        if (!timersRef.current.readingStart) timersRef.current.readingStart = now;
                        else if (now - timersRef.current.readingStart > 30000) { // Penalty every 30s
                            setScore(s => Math.max(0, s - 2));
                            addLog("Penalty (-2): Reading for 30s", "warning");
                            timersRef.current.readingStart = now;
                        }
                    } else {
                        timersRef.current.readingStart = null;
                        if (!timersRef.current.focusStart) timersRef.current.focusStart = now;
                        else if (now - timersRef.current.focusStart > 60000) { // Reward every 60s
                            setScore(s => Math.min(100, s + 1));
                            addLog("Reward (+1): Focused for 1 min", "success");
                            timersRef.current.focusStart = now;
                        }
                    }

                    // ----------------------------------------------------------------
                    // 3. MOVEMENT DETECTION
                    // ----------------------------------------------------------------
                    const prevNose = lastNosePosRef.current;
                    const dist = Math.sqrt(Math.pow(nose.x - prevNose.x, 2) + Math.pow(nose.y - prevNose.y, 2));

                    const normalizedMovement = Math.min(100, (dist * 5000));
                    setMovementIntensity(prev => (prev * 0.9) + (normalizedMovement * 0.1));

                    if (dist > MOVEMENT_THRESHOLD) {
                        setMovementLabel("Dynamic / Active");
                        timersRef.current.staticStart = now;
                        setStaticTimer(0);
                    } else {
                        setMovementLabel("Stationary");
                        const staticElapsed = now - timersRef.current.staticStart;
                        setStaticTimer(staticElapsed / 1000);

                        // Static Penalty: -3 every 60s
                        if (staticElapsed > STATIC_LIMIT_MS) {
                            // trigger once per second multiple check is avoided; use floored seconds check
                            if (Math.floor(staticElapsed / 1000) % 60 === 0 && Math.floor(staticElapsed / 1000) !== Math.floor((staticElapsed - (now - startTimeMs)) / 1000)) {
                                setScore(prev => Math.max(0, prev - 3));
                                addLog("Penalty (-3): Static for 1 min", "warning");
                            }
                        }
                    }
                    lastNosePosRef.current = { x: nose.x, y: nose.y };

                }
            }
        }
        requestRef.current = requestAnimationFrame(predictWebcam);
    }, []);

    // 2. Start Webcam
    const startWebcam = async () => {
        stopWebcam();
        try {
            const constraints = {
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                const videoReady = new Promise(resolve => {
                    videoRef.current.onloadeddata = () => resolve();
                });
                await videoReady;
                setCameraActive(true);
                setScore(50);
                // Reset all timers on start
                const now = Date.now();
                timersRef.current = {
                    staticStart: now,
                    readingStart: null,
                    focusStart: now,
                    neutralStart: null,
                    happyStart: null,
                    angryStart: null
                };
                predictWebcam();
                addLog("Monitoring started.", "success");
            }
        } catch (err) {
            console.error("Error accessing webcam:", err);
            addLog("Error accessing webcam.", "error");
        }
    };

    // --- AI FEATURES (Quick Tip Only) ---
    const getQuickTip = async () => {
        setIsTipLoading(true);
        setQuickTip(null);
        try {
            const prompt = `
                I am a teacher. Current state: dominant emotion is ${currentEmotion.label}, movement is ${movementLabel}, gaze is ${gazeStatus}.
                Give me one short sentence (max 20 words) on how to improve right now to avoid time-based score penalties.
            `;
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                }
            );
            const data = await response.json();
            if (data.candidates && data.candidates[0].content) {
                // Safely extract text, removing quotes if Gemini adds them
                const rawText = data.candidates[0].content.parts[0].text;
                const cleanText = rawText.trim().replace(/^['"]|['"]$/g, '');
                setQuickTip(cleanText);
                addLog("Gemini tip generated.", "info");
            } else {
                addLog("Could not generate tip.", "error");
            }
        } catch (error) {
            console.error("Gemini API Error:", error);
            addLog("Gemini API error.", "error");
        } finally {
            setIsTipLoading(false);
        }
    };

    const getEmotionIcon = (label) => {
        switch (label) {
            case 'Happy': return <Smile className="w-8 h-8 text-green-500" />;
            case 'Angry': return <ShieldAlert className="w-8 h-8 text-red-500" />;
            default: return <Meh className="w-8 h-8 text-zinc-500" />;
        }
    };

    // --- UI Components ---
    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans">
            <div className="absolute top-[-150px] right-[-50px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>
            <div className="absolute bottom-[-150px] left-[-150px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>

            {/* Modular Navbar */}
            <LiveMonitorNavbar
                isUserLoggedIn={isUserLoggedIn}
                currentUser={currentUser}
                navigate={navigate}
                userRole={userRole}
            />

            {/* Main Header */}
            <header className="pt-[100px] sm:pt-28 max-w-6xl mx-auto p-4 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center mt-15">
                <div className="flex items-center gap-3 mb-4 md:mb-0">
                    <div className="bg-[#24cfa6] p-2 rounded-lg">
                        <UserCheck className="text-black w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Live Monitor</h1>
                        <p className="text-sm text-zinc-400">Real-time Engagement Analysis</p>
                    </div>
                </div>

                {/* Score Display */}
                <div className="flex items-center gap-4 border-l border-zinc-700 md:pl-6 w-full md:w-auto">
                    <div className="text-right">
                        <p className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Engagement Quality</p>
                        <div className="flex items-end justify-end">
                            <div className={`text-4xl font-black ${score < 70 ? 'text-red-500' : score < 85 ? 'text-orange-500' : 'text-[#24cfa6]'} transition-colors`}>
                                {score.toFixed(0)}
                            </div>
                            <span className="text-lg text-zinc-500 font-bold">/100</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Grid - Responsive layout */}
            <main className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Video Feed & Movement (Expanded on Lg screens) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Video Feed Card */}
                    <div className="relative bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 aspect-video flex items-center justify-center">
                        {/* Loading State */}
                        {!isModelLoaded && (
                            <div className="absolute z-20 flex flex-col items-center text-zinc-500 animate-pulse p-4 text-center">
                                <Activity className="w-8 h-8 mb-2 text-[#24cfa6]" />
                                <p>Loading AI Vision Models (MediaPipe)...</p>
                            </div>
                        )}

                        {/* Start Button */}
                        {!cameraActive && isModelLoaded && (
                            <button
                                onClick={startWebcam}
                                className="absolute z-20 bg-[#24cfa6] hover:bg-[#17e1b2] text-black px-6 py-3 rounded-full font-bold transition-all flex items-center gap-2 shadow-lg"
                                disabled={!isModelLoaded}
                            >
                                <Eye className="w-5 h-5" /> Start Monitoring
                            </button>
                        )}

                        {/* Stop Button */}
                        {cameraActive && (
                            <button
                                onClick={stopWebcam}
                                className="absolute top-4 right-4 z-20 bg-red-600/80 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-bold transition-all flex items-center gap-1 backdrop-blur-sm shadow-md"
                            >
                                <EyeOff className="w-4 h-4" /> Stop
                            </button>
                        )}

                        {/* Video Element */}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-40'}`}
                        />

                        {/* Overlay Indicators */}
                        {cameraActive && (
                            <div className="absolute top-4 left-4 flex flex-col gap-2">
                                {/* Gaze Badge */}
                                <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 backdrop-blur-md border ${gazeStatus.includes("Reading")
                                    ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-100"
                                    : "bg-green-500/20 border-green-500/50 text-green-100"
                                    }`}>
                                    {gazeStatus.includes("Reading") ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {gazeStatus}
                                </div>

                                {/* Debug Info */}
                                <div className="bg-black/60 backdrop-blur-md p-2 rounded text-[10px] text-zinc-300 font-mono border border-zinc-700">
                                    <div className="flex items-center gap-2 mb-1 border-b border-zinc-700 pb-1 text-zinc-400">
                                        <Bug size={10} /> Calibration
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span>Pitch Ratio:</span> <span>{debugMetrics.pitchRatio.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span>Eye Score:</span> <span>{debugMetrics.eyeScore.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Anger Warning Overlay */}
                        {isAngry && (
                            <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-red-900/80 to-transparent animate-pulse">
                                <div className="flex justify-between text-white text-sm mb-1 font-bold">
                                    <span className="text-red-200 flex items-center gap-2">
                                        <ShieldAlert size={16} /> Extreme Anger Detected (-5 Score Penalty)
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Movement & Energy Card - Moved below the video for better flow on all screens */}
                    <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
                        <h3 className="font-bold text-zinc-100 mb-4 flex items-center gap-2">
                            <Move className="w-5 h-5 text-orange-500" /> Body Movement & Energy
                        </h3>

                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className={`font-semibold ${movementLabel === 'Stationary' ? 'text-orange-400' : 'text-[#24cfa6]'}`}>
                                    {movementLabel}
                                </span>
                                {movementLabel === 'Stationary' && (
                                    <span className="text-xs text-orange-400 font-mono">
                                        Penalty in: <span className="font-bold">{(STATIC_LIMIT_MS / 1000 - staticTimer).toFixed(1)}s</span>
                                    </span>
                                )}
                            </div>

                            {/* Movement Intensity Bar */}
                            <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden flex">
                                <div
                                    className={`h-full transition-all duration-300 ${movementLabel === 'Stationary' ? 'bg-orange-600' : 'bg-green-500'}`}
                                    style={{ width: `${movementIntensity}%` }}
                                />
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">
                                High intensity movement reflects engagement (+1/min). Stationary for 60s triggers a score drop (-3).
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Analytics & Logs (Single column on Lg screens, full width on smaller) */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Emotion Card */}
                    <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
                        <h3 className="font-bold text-zinc-100 mb-4 flex items-center gap-2">
                            <Smile className="w-5 h-5 text-purple-500" /> Emotional State
                        </h3>

                        <div className="flex flex-col gap-4 mb-6 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="bg-zinc-900 p-3 rounded-full border border-zinc-800">
                                    {getEmotionIcon(currentEmotion.label)}
                                </div>
                                <div>
                                    <p className="text-xs text-zinc-500 font-bold uppercase">Dominant Emotion</p>
                                    <p className="text-xl font-bold text-zinc-100">{currentEmotion.label}</p>
                                </div>
                            </div>

                            <div className="mt-2 pt-3 border-t border-zinc-800">
                                {quickTip ? (
                                    <div className="text-xs text-purple-200 bg-purple-900/30 border border-purple-800 p-2 rounded animate-in fade-in slide-in-from-top-2">
                                        <span className="font-bold mr-1">💡 Gemini Tip:</span> {quickTip}
                                        <button onClick={() => setQuickTip(null)} className="ml-2 text-purple-300 hover:text-purple-100 underline">Close</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={getQuickTip}
                                        disabled={isTipLoading || !cameraActive}
                                        className="w-full bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold py-2 rounded-lg transition disabled:bg-zinc-700 disabled:text-zinc-500"
                                    >
                                        {isTipLoading ? 'Generating Tip...' : 'Generate Quick Tip (AI)'}
                                    </button>
                                )}
                                <p className="text-[10px] text-zinc-600 mt-1 text-center">Powered by Gemini AI</p>
                            </div>
                        </div>

                        <p className="text-xs text-zinc-500">
                            Happiness (+1/min) and neutrality (-1/3min) are tracked. Extreme anger (-5/10s) triggers a warning.
                        </p>
                    </div>

                    {/* Log History Card */}
                    <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
                        <h3 className="font-bold text-zinc-100 mb-4 flex items-center gap-2">
                            <History className="w-5 h-5 text-[#24cfa6]" /> Activity Log
                        </h3>
                        <div className="h-64 overflow-y-auto bg-zinc-950 p-3 rounded-lg border border-zinc-800 custom-scrollbar">
                            {logs.length > 0 ? (
                                logs.map((log, index) => (
                                    <div key={index} className="flex text-xs mb-1 last:mb-0">
                                        <span className="text-zinc-500 w-12 flex-shrink-0 font-mono">{log.time.split(':').slice(0, 2).join(':')}</span>
                                        <span className={`flex-grow ${log.type === 'success' ? 'text-[#24cfa6]' :
                                            log.type === 'warning' ? 'text-yellow-400' :
                                                log.type === 'error' ? 'text-red-500' : 'text-zinc-300'
                                            }`}>{log.message}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-zinc-500 text-sm text-center pt-8">Log history will appear here once monitoring starts.</p>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Live;