import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, addDoc, getDocs } from "firebase/firestore";
import { app, useFirebase } from "../context/Firebase";
import { FilesetResolver, FaceLandmarker, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import * as Icons from "lucide-react";
import Logo2 from "../pictures/Logo2.png";
import useravatar from "../pictures/useravatar.jpg";

const firestore = getFirestore(app);

// WORKER CODE (Inline for specialized processing)


const Upload = ({ userRole }) => {
    // --- STATE MANAGEMENT ---
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const firebase = useFirebase();
    // const firestore = getFirestore(app); // Moved outside
    const navigate = useNavigate();
    const { isUserLoggedIn, currentUser } = useFirebase();

    const [teachers, setTeachers] = useState([]);
    const [subject, setSubject] = useState('');
    const [file, setFile] = useState(null);
    const [refmat, setRefmat] = useState("");
    const [transcribedText, setTranscribedText] = useState('');
    const [teachername, setTeachername] = useState('');
    const [pdfFile, setPdfFile] = useState(null);

    // Combined Results
    const [combinedReport, setCombinedReport] = useState(null);

    // Status Flags
    const [isUploading, setIsUploading] = useState(false);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);

    // Audio Analysis State
    const [audioReport, setAudioReport] = useState(null);
    const [audioSignalMetrics, setAudioSignalMetrics] = useState(null);
    const [Pitchfinder, setPitchfinder] = useState(null);

    // Video Metrics State (Raw data to be sent to Gemini later)
    const [videoMetrics, setVideoMetrics] = useState(null);
    const [videoProgress, setVideoProgress] = useState(0);
    const [videoStatusMsg, setVideoStatusMsg] = useState('');
    const [liveFeedback, setLiveFeedback] = useState({ text: "Ready", color: "text-slate-500", timestamp: "00:00" });

    const workerRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const GEMINI_API_KEY = import.meta.env.VITE_EXTERNAL_API_KEY;
    console.log("Debug API Key:", GEMINI_API_KEY);



    // Load Pitchfinder
    useEffect(() => {
        const loadLibs = async () => {
            try {
                const pfModule = await import('https://esm.sh/pitchfinder@2.3.0');
                setPitchfinder(pfModule);
                console.log("Pitchfinder loaded");
            } catch (e) {
                console.error("Failed to load Pitchfinder:", e);
            }
        };
        loadLibs();
    }, []);

    // ----------------------------------------------------------------------------------
    // 2. VIDEO ANALYSIS (Generates Metrics Only - No Gemini Call Here)
    // ----------------------------------------------------------------------------------
    const runVideoAnalysis = async (fileToAnalyze) => {
        if (!fileToAnalyze || !GEMINI_API_KEY) return;

        setIsAnalyzingVideo(true);
        setVideoMetrics(null);
        setLiveFeedback({ text: "Booting Vision AI...", color: "text-slate-400", timestamp: "00:00" });

        try {
            setVideoStatusMsg("Loading Vision Models...");

            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
            );

            const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });

            const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numPoses: 1
            });

            setVideoStatusMsg("Models Ready. Processing Video...");

            const stats = {
                total_time: 0, focused_sec: 0, reading_sec: 0, board_work_sec: 0, stationary_sec: 0,
                happy_sec: 0, angry_sec: 0, neutral_sec: 0, closed_posture_sec: 0,
                writing_count: 0, movement_scores: [], max_reading_streak: 0, current_reading_streak: 0
            };
            const events = [];

            // Logic Trackers
            let prevNose = null;
            let stationaryFrames = 0;
            let angryFrames = 0;
            const fps = 4;
            const step = 0.25;

            // Sticky Counters & Buckets
            let stickyWriting = 0;
            let stickyPointing = 0;
            let bucket = { writing: 0, pointing: 0, reading: 0, focused: 0, angry: 0, happy: 0, frames: 0 };

            // Load Video
            const videoElement = videoRef.current;
            const fileURL = URL.createObjectURL(fileToAnalyze);
            videoElement.src = fileURL;
            videoElement.load();

            await new Promise((resolve, reject) => {
                const onLoaded = () => {
                    resolve();
                };
                videoElement.onloadeddata = onLoaded;
                videoElement.onerror = () => reject(new Error("Video Load Failed"));

                // If already ready
                if (videoElement.readyState >= 2) resolve();
            });

            stats.total_time = videoElement.duration || 0;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const drawingUtils = new DrawingUtils(ctx);

            if (!Number.isFinite(stats.total_time) || stats.total_time === 0) throw new Error("Video duration invalid.");

            // --- ANALYSIS LOOP ---
            for (let t = 0; t < stats.total_time; t += step) {
                videoElement.currentTime = t;

                await new Promise(resolve => {
                    const onSeek = () => {
                        videoElement.removeEventListener('seeked', onSeek);
                        resolve();
                    };
                    videoElement.addEventListener('seeked', onSeek);
                    setTimeout(resolve, 300);
                });

                const startTimeMs = t * 1000;
                const faceResult = faceLandmarker.detectForVideo(videoElement, startTimeMs);
                const poseResult = poseLandmarker.detectForVideo(videoElement, startTimeMs);

                // Draw Overlay
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (poseResult.landmarks && poseResult.landmarks.length > 0) {
                    drawingUtils.drawLandmarks(poseResult.landmarks[0], { radius: 3, color: "#ef4444" });
                    drawingUtils.drawConnectors(poseResult.landmarks[0], PoseLandmarker.POSE_CONNECTIONS, { color: "#22c55e", lineWidth: 2 });
                }

                // Metric Calculations
                const timeStr = new Date(t * 1000).toISOString().substr(14, 5);
                let isWriting = false; let isPointing = false; let isReading = false;
                let isAngry = false; let isHappy = false;
                let frameStatus = "Scanning..."; let frameColor = "text-blue-400";

                // Emotion & Gaze
                if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
                    const cats = faceResult.faceBlendshapes[0].categories;
                    const browDown = ((cats.find(c => c.categoryName === 'browDownLeft')?.score || 0) +
                        (cats.find(c => c.categoryName === 'browDownRight')?.score || 0)) / 2;
                    if (browDown > 0.65) {
                        angryFrames++;
                        if (angryFrames >= (10 * fps)) {
                            isAngry = true;
                            if (angryFrames === (10 * fps)) events.push({ time: timeStr, type: "Emotion", desc: "😠 Sustained Anger" });
                        }
                    } else { angryFrames = 0; }

                    const smile = ((cats.find(c => c.categoryName === 'mouthSmileLeft')?.score || 0) +
                        (cats.find(c => c.categoryName === 'mouthSmileRight')?.score || 0)) / 2;
                    if (smile > 0.5) { isHappy = true; stats.happy_sec += step; }

                    const lookDownScore = ((cats.find(c => c.categoryName === 'eyeLookDownLeft')?.score || 0) +
                        (cats.find(c => c.categoryName === 'eyeLookDownRight')?.score || 0)) / 2;
                    if (lookDownScore > 0.75) isReading = true;
                }

                // Pose & Movement
                if (poseResult.landmarks && poseResult.landmarks.length > 0) {
                    const pose = poseResult.landmarks[0];
                    const nose = pose[0];
                    const lWrist = pose[15]; const rWrist = pose[16];
                    const lShoulder = pose[11]; const rShoulder = pose[12];

                    if (prevNose) {
                        const dist = Math.sqrt(Math.pow(nose.x - prevNose.x, 2) + Math.pow(nose.y - prevNose.y, 2));
                        stats.movement_scores.push(Math.min(100, dist * 5000));
                        if (dist < 0.005) {
                            stats.stationary_sec += step;
                            stationaryFrames++;
                            if (stationaryFrames === (30 * fps)) events.push({ time: timeStr, type: "Engagement", desc: "Stationary > 30s" });
                        } else { stationaryFrames = 0; }
                    }
                    prevNose = nose;

                    const wristDist = Math.abs(lWrist.x - rWrist.x);
                    if (wristDist < 0.2 && lWrist.y > lShoulder.y) stats.closed_posture_sec += step;

                    if (lWrist.y < lShoulder.y || rWrist.y < rShoulder.y) stickyWriting = 4;
                    if (Math.abs(lWrist.x - lShoulder.x) > 0.25 || Math.abs(rWrist.x - rShoulder.x) > 0.25) stickyPointing = 4;
                }

                if (stickyWriting > 0) { isWriting = true; stats.board_work_sec += step; stats.writing_count++; stickyWriting--; }
                else if (stickyPointing > 0) { isPointing = true; stats.writing_count += 0.5; stickyPointing--; }

                if (isWriting) { bucket.writing++; frameStatus = "✍️ Writing on Board"; frameColor = "text-purple-400"; }
                else if (isPointing) { bucket.pointing++; frameStatus = "👉 Pointing / Gesturing"; frameColor = "text-indigo-400"; }
                else if (isAngry) { bucket.angry++; stats.angry_sec += step; frameStatus = "😠 Expression: Angry"; frameColor = "text-red-500"; }
                else if (isReading) {
                    bucket.reading++; stats.reading_sec += step; stats.current_reading_streak += step;
                    if (stats.current_reading_streak > stats.max_reading_streak) stats.max_reading_streak = stats.current_reading_streak;
                    frameStatus = "👀 Reading / Looking Down"; frameColor = "text-yellow-400";
                } else {
                    stats.current_reading_streak = 0; stats.focused_sec += step; bucket.focused++;
                    if (isHappy) { bucket.happy++; frameStatus = "😊 Happy / Smiling"; frameColor = "text-green-300"; }
                    else { stats.neutral_sec += step; frameStatus = "✅ Focused on Class"; frameColor = "text-green-400"; }
                }
                bucket.frames++;

                // Timeline Event
                if (Math.floor(t) % 5 === 0 && Math.floor(t) !== Math.floor(t - step)) {
                    let type = "Engagement"; let desc = "Teaching (Focused)";
                    if (bucket.writing > 2) { type = "Board Work"; desc = "Writing on Board"; }
                    else if (bucket.pointing > 2) { type = "Gesture"; desc = "Pointing / Explaining"; }
                    else if (bucket.angry > 2) { type = "Emotion"; desc = "Stern/Angry Expression"; }
                    else if (bucket.happy > 2) { type = "Emotion"; desc = "Smiling / Positive"; }
                    else if (bucket.reading > (bucket.frames * 0.5)) { type = "Gaze"; desc = "Reading Notes"; }
                    events.push({ time: timeStr, type, desc });
                    bucket = { writing: 0, pointing: 0, reading: 0, focused: 0, angry: 0, happy: 0, frames: 0 };
                }

                setLiveFeedback({ text: frameStatus, color: frameColor, timestamp: timeStr });
                setVideoProgress(Math.round((t / stats.total_time) * 100));
            }

            // --- CALCULATE FINAL VIDEO METRICS ---
            setVideoStatusMsg("Video Analysis Complete. Ready for Evaluation.");
            setLiveFeedback({ text: "Processing Done", color: "text-blue-400", timestamp: "DONE" });

            const dur = stats.total_time || 1;
            const focusRatio = (stats.focused_sec / dur);
            const readingRatio = (stats.reading_sec / dur);
            const boardRatio = (stats.board_work_sec / dur);
            const postureRatio = (stats.closed_posture_sec / dur);
            const happyRatio = (stats.happy_sec / dur);
            const angryRatio = (stats.angry_sec / dur);

            setVideoMetrics({
                metrics: { focusRatio, readingRatio, boardRatio, happyRatio, angryRatio, postureRatio },
                stats: stats,
                events: events,
                raw_duration: dur
            });

        } catch (error) {
            console.error(error);
            setVideoStatusMsg("Video Analysis Error: " + error.message);
        } finally {
            setIsAnalyzingVideo(false);
        }
    };

    // ----------------------------------------------------------------------------------
    // 3. COMBINED EVALUATION (TEXT + VIDEO + PDF)
    // ----------------------------------------------------------------------------------

    // Helper: Convert File to Base64 for Gemini
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

    const handleGeminiEvaluate = async () => {
        try {
            if (!transcribedText || transcribedText.trim().length === 0) {
                alert("Please wait for audio transcription to complete.");
                return;
            }
            if ((!refmat || refmat.trim().length === 0) && !pdfFile) {
                alert("Please provide reference material (Text or PDF) before evaluating.");
                return;
            }
            if (!videoMetrics) {
                alert("Please wait for Video Analysis to complete (or video is missing).");
                return;
            }

            setIsEvaluating(true);
            setVideoStatusMsg("Constructing Multi-Modal Query...");

            // --- 1. PREPARE DATA METRICS ---
            let engagementScore = 0, deliveryScore = 0, profScore = 0;
            let gesturesPerMin = 0;
            let teachingScore = "0", happinessScore = "0", readingScore = "0", angerScore = "0";

            if (videoMetrics) {
                const m = videoMetrics.metrics;
                const stats = videoMetrics.stats;
                const dur = videoMetrics.raw_duration || 1;

                // Extract for Prompt
                var boardRatio = m.boardRatio || 0;
                var focusRatio = m.focusRatio || 0;
                var happyRatio = m.happyRatio || 0;
                var angryRatio = m.angryRatio || 0;
                var readingRatio = m.readingRatio || 0;
                var events = videoMetrics.events || [];

                // --- CUSTOM METRICS FOR PROMPT ---
                // --- CUSTOM METRICS FOR PROMPT ---
                teachingScore = ((boardRatio + focusRatio) * 100).toFixed(0);
                happinessScore = (happyRatio * 100).toFixed(0);
                readingScore = (readingRatio * 100).toFixed(0);
                angerScore = (angryRatio * 100).toFixed(0);

                if (stats && dur > 0) {
                    gesturesPerMin = (stats.writing_count / (dur / 60));
                }

                // Engagement
                engagementScore = 60;
                if (gesturesPerMin > 8) engagementScore += 20;
                if ((m.focusRatio + m.boardRatio) > 0.8) engagementScore += 20;
                engagementScore = Math.min(100, engagementScore);

                // Delivery
                deliveryScore = 50;
                if (m.boardRatio > 0.15) deliveryScore += 25;
                if (m.focusRatio > 0.4) deliveryScore += 25;
                deliveryScore = Math.min(100, deliveryScore);

                // Professionalism
                profScore = 80;
                if (m.happyRatio > 0.1) profScore += 20;
                if (m.angryRatio > 0.05) profScore -= 30;
                if (m.postureRatio > 0.4) profScore -= 10;
                if (m.readingRatio > 0.3) profScore -= 20;
                profScore = Math.min(100, Math.max(0, profScore));
            }

            // --- 2. PREPARE PROMPT ---
            const systemPrompt = `
            You are "Parikshak AI", an expert pedagogical coach. 
            Analyze the teacher based on:
            1. Audio Transcript (Lecture Content)
            2. Video Behavioral Metrics (Body Language, Emotion)
            3. Reference Syllabus (PDF or Text) - IF PROVIDED
            
            CRITICAL: The transcript contains repetitions/hallucinations. **DO NOT HALLUCINATE TOPICS NOT PRESENT IN THE TRANSCRIPT.** If the transcript is about Coding, DO NOT discuss Physics. If it is about Physics, DO NOT discuss History. USE ONLY THE TRANSCRIPT.

            ## INPUT DATA EXPLANATION
            - Engagement Score: Derived from active gestures and class focus.
            - Delivery Score: Balance of writing on board vs. speaking to class.
            - Professionalism: Emotional tone (happy/strict) and posture (open/closed).

            Return strictly VALID JSON matching this schema:
            {
              "subject": "Inferred Topic (1-3 words) - STRICTLY FROM TRANSCRIPT",
              "overall_rating": (Float 1-5),
              "improvement_percentage": (Integer),
              "text_analysis": {
                 "semantic_parsing": "Analyze student doubts. If none, say 'No doubts raised'.",
                 "syllabus_coverage": "List of topics covered vs expected (if ref provided).",
                 "suitable_examples": "Evaluate quality/relevance of examples used.",
                 "content_simplification": "How well did they simplify complex topics?",
                 "doubt_resolution_quality": "Rate/Review the teacher's answers to doubts."
              },
              "metrics": {
                 "clarity_score": (0-100),
                 "example_quality": (0-100),
                 "doubt_resolution": (0-100),
                 "student_engagement": (0-100),
                 "content_simplification": (0-100),
                 "Areas to Improve": "Specific feedback string",
                 "Way to improve": "Actionable tips string"
              },
              "syllabus_coverage": {
                  "covered_topics": ["topic1", "topic2"],
                  "missing_topics": ["topic3", "topic4"],
                  "score": (0-100),
                  "summary": "Brief analysis of syllabus vs lecture."
              },
              "video_analysis": {
                 "body_language_score": (0-100),
                 "visual_summary": "Merge 'EXECUTIVE SUMMARY', 'TIMELINE NARRATIVE', 'EMOTIONAL ANALYSIS', 'MULTIMODAL USE' into this detailed string (POINTWISE REPORT). Use the specific scores provided.",
                 "rubric_breakdown": "Engagement: ${engagementScore}/100, Delivery: ${deliveryScore}/100, Professionalism: ${profScore}/100"
              },
              "timeline_narrative": "Story of the class based on TIMELINE NARRATIVE analysis."
            }`;

            const userPrompt = `
             Act as "Parikshak AI", a supportive pedagogical coach.
                    
            ## METRICS (VISUAL ANALYSIS)
            - Score: ${(engagementScore * 0.4 + deliveryScore * 0.3 + profScore * 0.3).toFixed(0)}/100
            - Teaching Score (Focus+Board): ${teachingScore}% (Target: >80%)
            - Happiness/Smile: ${happinessScore}% (Target: >10%)
            - Reading Notes: ${readingScore}% (Target: <5%)
            - Angry/Stern: ${angerScore}% (Target: 0%)
            
            - Overall Engagement: ${engagementScore}/100 (Gestures: ${gesturesPerMin.toFixed(1)}/min)
            - Delivery: ${deliveryScore}/100
            - Professionalism: ${profScore}/100
            
            ## TIMELINE
            ${JSON.stringify(events)}
            
            ## CONTENT CONTEXT
            TRANSCRIPT: ${transcribedText.substring(0, 15000)}...
            REFERENCE: ${refmat || "None"}

            OUTPUT FORMAT:
            1. EXECUTIVE SUMMARY: (Verdict on teaching style)
            2. TIMELINE NARRATIVE: (Story of the class)
            3. EMOTIONAL ANALYSIS: (Discuss facial expressions - Happiness/Anger and Posture - Open/Closed)
            4. MULTIMODAL USE: (Discuss Board vs. Speech balance)
            5. AREAS FOR IMPROVEMENT: (Specific tips)

            **FOR 'TEXT_ANALYSIS' JSON KEY:**
            - Use the TRANSCRIPT to fill: semantic_parsing, syllabus_coverage, suitable_examples, content_simplification, doubt_resolution_quality.
            - IF TRANSCRIPT IS CODING, DO NOT TALK ABOUT PHYSICS. Focus only on the content provided in transcript.
            `;

            // Prepare Content Parts
            const requestParts = [
                { text: systemPrompt },
                { text: userPrompt }
            ];

            // If PDF is selected, append it
            if (pdfFile) {
                const pdfPart = await fileToGenerativePart(pdfFile);
                requestParts.push(pdfPart);
                requestParts.push({ text: "Please use the attached PDF as the Syllabus/Reference Material for comparison." });
            }

            // --- 3. CALL GEMINI (Raw REST API) ---
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
            const resp = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: requestParts }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
                })
            });

            if (!resp.ok) {
                const errData = await resp.json();
                throw new Error(errData.error?.message || "Gemini API Failed");
            }

            const data = await resp.json();
            const textResponse = data.candidates[0].content.parts[0].text;
            let parsed = JSON.parse(textResponse.replace(/```json|```/g, ""));

            setCombinedReport(parsed);

            // --- 4. GENERATE AUDIO SPECIFIC REPORT (Parallel) --- 
            if (audioSignalMetrics && file) {
                try {
                    setVideoStatusMsg("Generating Audio Analysis Report...");
                    const wavBlob = audioBufferToWav(audioSignalMetrics.audioBuffer, 0, audioSignalMetrics.audioBuffer.length);
                    const audioPart = await fileToGenerativePart(wavBlob); // Reuse existing helper but with Blob
                    const audioRep = await generateAudioReport(audioPart, audioSignalMetrics.audioBuffer.duration, audioSignalMetrics);
                    setAudioReport(audioRep);
                } catch (e) {
                    console.error("Audio Report Generation Failed:", e);
                }
            }


            // Update Firestore
            // ... (Existing Firestore Logic for Combined Report)
            if (teachername) {
                const teacherRef = doc(firestore, "teachers", teachername);
                const teacherSnap = await getDoc(teacherRef);
                const newRating = parsed.overall_rating;
                const newTopic = parsed.subject;

                // Handle Rating Update (Average Calculation)
                let finalRating = newRating;
                let ratingCount = 1;

                if (teacherSnap.exists()) {
                    const data = teacherSnap.data();

                    // Legacy check: if rating is array, migrate it
                    if (Array.isArray(data.rating)) {
                        const sum = data.rating.reduce((a, b) => a + b, 0);
                        const count = data.rating.length;
                        // New Weighted Average
                        ratingCount = count + 1;
                        finalRating = (sum + newRating) / ratingCount;
                    } else if (typeof data.rating === 'number') {
                        const currentAvg = data.rating || 0;
                        const currentCount = data.ratingCount || 1;
                        ratingCount = currentCount + 1;
                        finalRating = ((currentAvg * currentCount) + newRating) / ratingCount;
                    }
                }

                // Payload
                const payload = {
                    rating: finalRating,
                    ratingCount: ratingCount,
                    topics: arrayUnion(newTopic),
                    // Optional: Keep history if needed, or rely on subcollection reports
                    ratingHistory: arrayUnion(newRating)
                };

                if (teacherSnap.exists()) await updateDoc(teacherRef, payload);
                else await setDoc(teacherRef, { ...payload, name: teachername });

                // SAVE FULL REPORT TO SUBCOLLECTION
                const reportsRef = collection(teacherRef, "analysis_reports");
                await addDoc(reportsRef, {
                    ...parsed,
                    audio_analysis: audioReport || {}, // Try to save audio report if ready, or update later? 
                    // Note: audioReport might not be ready in this closure if it's async parallel.
                    // Better to save what we have. For now, we'll just save the text/video one.
                    timestamp: serverTimestamp(),
                    analyzedBy: currentUser?.displayName || "Student/User",
                    userRole: userRole // Track who evaluated
                });
                setVideoStatusMsg("Evaluation Complete & Report Saved!");
            } else {
                setVideoStatusMsg("Evaluation Complete (No Teacher Name - Not Saved)");
            }

            setVideoStatusMsg("Evaluation Complete!");

        } catch (error) {
            console.error("Evaluation Error:", error);
            alert("Error: " + error.message);
            setVideoStatusMsg("Failed: " + error.message);
        } finally {
            setIsEvaluating(false);
        }
    };

    // --- AUDIO & SIGNAL HELPERS ---
    const generateAudioReport = async (audioPart, duration, signalMetrics) => {
        const prompt = `
        You are an expert Classroom Pedagogical Analyst. 
        Analyze this ${Math.round(duration)}s extract of a classroom session.
        
        Signal Metrics:
        - Pitch: ${Math.round(signalMetrics.avgPitch)}Hz
        - Pace: ${Math.round(signalMetrics.estimatedPace)}bpm

        TASKS:
        1. **Diarization**: Distinguish "Teacher" vs "Student".
        2. **Interaction Timeline**: Create a detailed log of the interaction. For every emotion/speaker change, mark the exact start and end time.
        3. **Emotion Analysis**: Identify the specific emotion (Curious, Frustrated, Excited, Bored, Strict, etc.).
        4. **Disturbances**: Identify loud noises or interruptions.

        Output strictly this JSON format:
        {
            "timeline": [
                { "start": 0, "end": 15, "speaker": "Teacher", "emotion": "Energetic", "content": "Brief summary of what was said" },
                { "start": 15, "end": 20, "speaker": "Student", "emotion": "Confused", "content": "Question about topic" }
            ],
            "disturbances": [
                { "start": 45, "end": 50, "type": "Loud Chatter" }
            ],
            "metrics": {
                "teacher_clarity": (1-10),
                "student_engagement": (1-10),
                "interaction_quality": (1-10)
            },
            "summary": "Concise summary.",
            "feedback": "Actionable feedback for the teacher."
        }
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, audioPart] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
            })
        });

        if (!response.ok) throw new Error("Audio Analysis Gemini Failed");
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
    };

    const calculateAudioFeatures = async (file) => {
        setVideoStatusMsg("extracting audio signal...");
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        let avgPitch = 0;
        let estimatedPace = 0;

        if (Pitchfinder) {
            let sumSquares = 0;
            const detectPitch = Pitchfinder.YIN({ sampleRate });
            const pitches = [];
            const step = 8192;
            let iteration = 0;

            for (let i = 0; i < data.length; i += step) {
                const chunk = data.slice(i, i + 2048);
                if (chunk.length < 2048) break;

                const p = detectPitch(chunk);
                if (p && p > 60 && p < 500) pitches.push(p);
            }

            avgPitch = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0;
            estimatedPace = (pitches.length / (audioBuffer.duration / 60)) * 2;
        }

        return { avgPitch, estimatedPace, audioBuffer };
    };

    const audioBufferToWav = (buffer, startSample, endSample) => {
        const numOfChan = 1;
        const length = (endSample - startSample) * 2 + 44;
        const outBuffer = new ArrayBuffer(length);
        const view = new DataView(outBuffer);
        const channels = [];
        let i;
        let sample;
        let offset = 0;
        let pos = 0;

        const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
        const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8);
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt "
        setUint32(16);
        setUint16(1);
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);

        setUint32(0x61746164); // "data"
        setUint32(length - pos - 4);

        const channelData = buffer.getChannelData(0);
        let p = startSample;
        while (p < endSample && p < channelData.length) {
            sample = Math.max(-1, Math.min(1, channelData[p]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(44 + offset, sample, true);
            offset += 2;
            p++;
        }

        return new Blob([outBuffer], { type: "audio/wav" });
    };


    // --- RENDER HELPERS ---
    const MetricCard = ({ label, value, color = "text-white" }) => (
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
    );

    // --- GEMINI TRANSCRIPTION (Replaces Local Worker) ---
    const transcribeWithGemini = async (fileToTranscribe) => {
        if (!fileToTranscribe || !GEMINI_API_KEY) return;

        setTranscribedText("Transcribing audio with Gemini...");
        setIsUploading(true);

        try {
            const audioPart = await fileToGenerativePart(fileToTranscribe);
            const prompt = "Generate a verbatim transcription of this audio. Output ONLY the raw text, no formatting, no timestamps, no speaker labels.";

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, audioPart] }],
                    generationConfig: { responseMimeType: "text/plain" }
                })
            });

            if (!response.ok) throw new Error("Transcription Failed");

            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            setTranscribedText(text);
        } catch (error) {
            console.error(error);
            setTranscribedText("Transcription failed: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    // --- EVENT HANDLERS ---
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setAudioReport(null);
            setCombinedReport(null);
            setVideoMetrics(null);
            setVideoStatusMsg("");

            // 1. START TRANSCRIPTION (Gemini)
            transcribeWithGemini(selectedFile);

            // 2. START VIDEO ANALYSIS (Background)
            runVideoAnalysis(selectedFile);

            // 3. START AUDIO SIGNAL ANALYSIS (Background)
            calculateAudioFeatures(selectedFile).then(metrics => {
                setAudioSignalMetrics(metrics);
            }).catch(e => console.error("Signal Analysis failed:", e));
        }
    };

    // Navigation & UI Handlers
    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const handleNavigation = (path) => { navigate(path); if (isMenuOpen) setIsMenuOpen(false); };
    useEffect(() => {
        const fetchTeachers = async () => {
            const querySnapshot = await getDocs(collection(firestore, "teachers"));
            setTeachers(querySnapshot.docs.map((doc) => doc.data().name));
        };
        fetchTeachers();
    }, []);


    return (
        <div>
            {/* STYLES */}
            <style>
                {`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
                .scan-line {
                    position: absolute; top: 0; left: 0; width: 100%; height: 3px;
                    background: #3b82f6; box-shadow: 0 0 15px #3b82f6;
                    animation: scan 2.5s linear infinite; z-index: 20; opacity: 0.8;
                }
                @keyframes scan { 0% { top: 0%; } 100% { top: 100%; } }
                `}
            </style>

            <section className="w-full flex flex-col items-center justify-around bg-black text-white text-center pt-20 relative overflow-hidden min-h-screen">
                <div className="absolute top-[-150px] right-[-50px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>
                <div className="absolute bottom-[-150px] left-[-150px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>

                <nav className="fixed top-0 left-0 w-full flex bg-transparent justify-between text-white z-20">
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



                        <span onClick={() => handleNavigation("/feedback")} className="mx-6 cursor-pointer">Feedback</span>

                        {isUserLoggedIn ? (
                            currentUser?.photoURL ? (
                                <img
                                    src={currentUser.photoURL}
                                    alt="User Profile"
                                    className="mx-10 w-10 h-10 rounded-full border border-white cursor-pointer"
                                    onClick={() => handleNavigation("/profile")}
                                />
                            ) : (
                                <div
                                    className="mx-10 w-10 h-10 rounded-full border border-white flex items-center justify-center cursor-pointer bg-zinc-800"
                                    onClick={() => handleNavigation("/profile")}
                                >
                                    👤
                                </div>
                            )
                        ) : (
                            <button className="mx-10 bg-[#24cfa6] h-9 w-28 rounded text-black font-medium" onClick={() => handleNavigation("/login")}>
                                Sign In
                            </button>
                        )}

                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex items-center sm:hidden me-4">
                        {isUserLoggedIn ? (
                            <img src={currentUser?.photoURL || useravatar} className="w-8 h-8 rounded-full border border-white me-4 cursor-pointer" onClick={() => handleNavigation("/profile")} />
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

                        {userRole !== 'teacher' && (
                            <span onClick={() => handleNavigation("/insights")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Insights</span>
                        )}

                        <span onClick={() => handleNavigation('/textanalysis')} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Upload & Analyse</span>
                        <span onClick={() => handleNavigation("/live")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Live Monitor</span>


                        <span onClick={() => handleNavigation("/feedback")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Feedback</span>
                    </div>
                </div>
                <div className="instructions flex flex-col items-center md:flex-row md:justify-around w-full max-w-4xl mt-10 p-4 gap-4 text-white">

                    <div className="step flex flex-col items-center bg-gray-900 rounded-lg p-4 shadow-md w-full md:w-48 text-center">

                        <div className="step-number w-10 h-10 flex items-center justify-center bg-[#24cfa6] rounded-full text-black font-bold mb-2">1</div>

                        <span className="font-semibold text-md">Select teacher and topic</span>

                        <p className="text-gray-400 mt-1 text-sm">Choose the teacher and topic</p>

                    </div>



                    <div className="step flex flex-col items-center bg-gray-900 rounded-lg p-4 shadow-md w-full md:w-48 text-center">

                        <div className="step-number w-10 h-10 flex items-center justify-center bg-[#24cfa6] rounded-full text-black font-bold mb-2">2</div>

                        <span className="font-semibold text-md">Upload audio/video recording</span>

                        <p className="text-gray-400 mt-1 text-sm">Provide your recording for analysis</p>

                    </div>



                    <div className="step flex flex-col items-center bg-gray-900 rounded-lg p-4 shadow-md w-full md:w-48 text-center">

                        <div className="step-number w-10 h-10 flex items-center justify-center bg-[#24cfa6] rounded-full text-black font-bold mb-2">3</div>

                        <span className="font-semibold text-md">Add Reference Material</span>

                        <p className="text-gray-400 mt-1 text-sm">Attach any supplementary material</p>

                    </div>

                </div>

                {/* MAIN CONTENT */}
                <div className="w-full max-w-7xl px-4 mt-8 flex flex-col items-center z-10">

                    {/* 1. INPUT SECTION */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mb-8">
                        <div className="flex flex-col gap-4">
                            <label className="font-medium text-left">Select Teacher & Subject</label>
                            <input list="teachers" onChange={(e) => setTeachername(e.target.value)} className="border p-2 rounded text-white bg-black/50" placeholder="Teacher Name..." />
                            <datalist id="teachers">{teachers.map((name, i) => <option key={i} value={name} />)}</datalist>
                            <input type="text" onChange={(e) => setSubject(e.target.value)} placeholder="Subject..." className="border p-2 rounded text-white bg-black/50" />

                            <label className="font-medium text-left mt-2">Upload Video</label>
                            <input type="file" accept="video/*" className="border p-2 rounded text-white bg-black/50" onChange={handleFileChange} />
                        </div>
                        <div className="flex flex-col">
                            <label className="font-medium text-left mb-2">Reference Material</label>

                            {/* PDF Upload */}
                            <div className="mb-2">
                                <label className="text-xs text-slate-400 block mb-1">Method A: Upload Syllabus PDF</label>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={(e) => setPdfFile(e.target.files[0])}
                                    className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#24cfa6] file:text-black hover:file:bg-[#1ba988] cursor-pointer bg-slate-900 rounded-lg border border-slate-700"
                                />
                            </div>

                            <label className="text-xs text-slate-400 block mb-1">Method B: Paste Text</label>
                            <textarea onChange={(e) => setRefmat(e.target.value)} className="border p-2 rounded text-white bg-black/50 h-full min-h-[150px]" placeholder="Paste reference content here..."></textarea>
                        </div>
                    </div>

                    {/* 2. VIDEO PREVIEW (Visual Feedback) */}
                    <div className="w-full max-w-4xl relative bg-black rounded-2xl overflow-hidden border border-slate-800 aspect-video flex items-center justify-center mb-8 shadow-2xl">
                        {!file && <p className="text-slate-600">Video Preview</p>}
                        <video ref={videoRef} className="w-full h-full object-contain" muted playsInline controls></video>
                        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"></canvas>

                        {isAnalyzingVideo && (
                            <>
                                <div className="scan-line"></div>
                                <div className="absolute top-4 left-4 bg-black/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-700 z-30 text-left">
                                    <span className={`text-sm font-bold ${liveFeedback.color}`}>{liveFeedback.text}</span>
                                    <p className="text-xs text-slate-400">{videoStatusMsg}</p>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-800">
                                    <div className="h-full bg-[#24cfa6] transition-all duration-300" style={{ width: `${videoProgress}%` }}></div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* 3. EVALUATE BUTTON */}
                    <button
                        onClick={handleGeminiEvaluate}

                        className={`text-white bg-[#24cfa6] h-12 w-64 rounded-full font-bold text-lg hover:bg-[#1ba988] transition shadow-lg mb-12 ${isEvaluating ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isEvaluating}
                    >
                        {isEvaluating ? "Generating Combined Report..." : "Evaluate Content & Video"}
                    </button>

                    {/* 4. RESULTS DISPLAY */}
                    {combinedReport && (
                        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 mb-20 animate-in fade-in slide-in-from-bottom-8">

                            {/* Score & Metrics Card */}
                            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 text-left">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold text-[#24cfa6]">Overall Rating</h2>
                                        <p className="text-slate-400">{combinedReport.subject}</p>
                                    </div>
                                    <div className="text-5xl font-black text-white">{combinedReport.overall_rating}<span className="text-xl text-slate-500">/5</span></div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <MetricCard label="Engagement" value={combinedReport.metrics.student_engagement} />
                                    <MetricCard label="Clarity" value={combinedReport.metrics.clarity_score} />
                                    <MetricCard label="Body Language" value={combinedReport.video_analysis?.body_language_score || "N/A"} color="text-yellow-400" />
                                    <MetricCard label="Simplify" value={combinedReport.metrics.content_simplification} />
                                </div>

                                <div className="bg-slate-800 p-4 rounded-xl">
                                    <h3 className="text-lg font-bold text-[#24cfa6] mb-2">Video Visual Summary</h3>
                                    <p className="text-slate-300 text-sm">{combinedReport.video_analysis?.visual_summary}</p>
                                </div>

                                {/* Raw Timeline Events from Video (Moved Here) */}
                                {videoMetrics && (
                                    <div className="mt-6 border-t border-slate-700 pt-4">
                                        <h4 className="text-slate-500 font-bold text-xs uppercase mb-3">Detected Video Events</h4>
                                        <div className="space-y-2">
                                            {videoMetrics.events.slice(0, 5).map((ev, i) => (
                                                <div key={i} className="flex gap-2 text-xs text-slate-400">
                                                    <span className="font-mono text-[#24cfa6]">{ev.time}</span>
                                                    <span>{ev.desc}</span>
                                                </div>
                                            ))}
                                            {videoMetrics.events.length > 5 && <p className="text-xs text-slate-600 italic">...and {videoMetrics.events.length - 5} more events</p>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Narrative & Timeline Card */}
                            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 text-left overflow-y-auto max-h-[600px] custom-scrollbar">
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Icons.Brain /> Qualitative Analysis</h3>

                                {/* NEW: SYLLABUS COVERAGE (PDF) */}
                                {combinedReport.syllabus_coverage && (
                                    <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
                                        <h4 className="text-indigo-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                                            <Icons.BookOpen className="w-4 h-4" /> Syllabus Comparison
                                        </h4>

                                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
                                            <span className="text-xs text-slate-400">Match score</span>
                                            <span className={`font-mono font-bold ${combinedReport.syllabus_coverage.score > 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {combinedReport.syllabus_coverage.score}%
                                            </span>
                                        </div>

                                        {combinedReport.syllabus_coverage.missing_topics && combinedReport.syllabus_coverage.missing_topics.length > 0 ? (
                                            <div className="mt-2">
                                                <span className="text-red-400 text-xs font-bold uppercase block mb-1">
                                                    Missing / Weak Topics:
                                                </span>
                                                <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                                                    {combinedReport.syllabus_coverage.missing_topics.map((t, i) => (
                                                        <li key={i} className="text-red-200/80">{t}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : (
                                            <p className="text-green-400 text-xs font-bold">✓ All reference topics covered!</p>
                                        )}
                                    </div>
                                )}

                                <div className="mb-6">
                                    <h4 className="text-[#24cfa6] font-bold text-sm uppercase mb-2">Timeline Narrative</h4>
                                    <p className="text-slate-300 text-sm leading-relaxed">{combinedReport.timeline_narrative}</p>
                                </div>

                                <div className="mb-6">
                                    <h4 className="text-red-400 font-bold text-sm uppercase mb-2">Areas to Improve</h4>
                                    <p className="text-slate-300 text-sm">{combinedReport.metrics["Areas to Improve"]}</p>
                                </div>

                                <div className="mb-6">
                                    <h4 className="text-green-400 font-bold text-sm uppercase mb-2">Ways to Improve</h4>
                                    <p className="text-slate-300 text-sm">{combinedReport.metrics["Way to improve"]}</p>
                                </div>

                                {/* Raw Timeline Events from Video */}
                                {/* TEXT ANALYSIS FIELDS */}
                                {combinedReport.text_analysis && (
                                    <>
                                        <div className="mb-6">
                                            <h4 className="text-blue-400 font-bold text-sm uppercase mb-2">Student Doubts</h4>
                                            <p className="text-slate-300 text-sm">{combinedReport.text_analysis.semantic_parsing}</p>
                                        </div>
                                        <div className="mb-6">
                                            <h4 className="text-purple-400 font-bold text-sm uppercase mb-2">Example Quality</h4>
                                            <p className="text-slate-300 text-sm">{combinedReport.text_analysis.suitable_examples}</p>
                                        </div>
                                        <div className="mb-6">
                                            <h4 className="text-yellow-400 font-bold text-sm uppercase mb-2">Content Simplification</h4>
                                            <p className="text-slate-300 text-sm">{combinedReport.text_analysis.content_simplification}</p>
                                            <p className="text-slate-300 text-sm mt-2">{combinedReport.text_analysis.doubt_resolution_quality}</p>
                                        </div>
                                    </>
                                )}
                            </div>

                        </div>
                    )}

                    {/* --- AUDIO ANALYSIS REPORT SECTION (New) --- */}
                    {audioReport && audioSignalMetrics && (
                        <div className="w-full max-w-7xl mb-20 animate-in fade-in slide-in-from-bottom-12">
                            <h2 className="text-3xl font-bold text-white mb-8 border-b border-slate-800 pb-4 flex items-center gap-3">
                                <Icons.Mic2 className="text-indigo-500" />
                                Deep Audio Analysis
                            </h2>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* 1. Signal Metrics */}
                                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
                                    <h3 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2">
                                        <Icons.Waves className="w-5 h-5" /> Acoustic Signal
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-black/30 p-4 rounded-xl text-center">
                                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Average Pitch</span>
                                            <div className="text-3xl font-mono text-purple-200 font-bold mt-1">
                                                {Math.round(audioSignalMetrics.avgPitch)} <span className="text-sm text-purple-500">Hz</span>
                                            </div>
                                        </div>
                                        <div className="bg-black/30 p-4 rounded-xl text-center">
                                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Speaking Pace</span>
                                            <div className="text-3xl font-mono text-cyan-200 font-bold mt-1">
                                                {Math.round(audioSignalMetrics.estimatedPace)} <span className="text-sm text-cyan-500">bpm</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Disturbances */}
                                    <div className="mt-6">
                                        <h4 className="text-orange-400 font-bold text-xs uppercase mb-3 flex items-center gap-2">
                                            <Icons.AlertTriangle className="w-4 h-4" /> Detected Disturbances
                                        </h4>
                                        {audioReport.disturbances && audioReport.disturbances.length > 0 ? (
                                            <div className="space-y-2">
                                                {audioReport.disturbances.map((d, i) => (
                                                    <div key={i} className="bg-orange-950/30 border border-orange-900/50 p-2 rounded text-orange-200 text-sm flex justify-between">
                                                        <span>{d.type}</span>
                                                        <span className="font-mono text-orange-500/80">{d.start}s - {d.end}s</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-slate-500 italic text-sm">No significant audio disturbances detected.</p>
                                        )}
                                    </div>
                                </div>

                                {/* 2. Audio Interaction Timeline */}
                                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 overflow-y-auto max-h-[500px] custom-scrollbar">
                                    <h3 className="text-lg font-bold text-indigo-400 mb-4 flex items-center gap-2">
                                        <Icons.Users className="w-5 h-5" /> Interaction Log (Diarization)
                                    </h3>
                                    <div className="space-y-4 relative">
                                        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-800"></div>
                                        {audioReport.timeline.map((seg, idx) => {
                                            const isTeacher = seg.speaker.toLowerCase().includes('teacher');
                                            return (
                                                <div key={idx} className="relative pl-10">
                                                    <div className={`
                                                        absolute left-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-sm z-10
                                                        ${isTeacher ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}
                                                    `}>
                                                        {isTeacher ? <Icons.UserCheck size={14} /> : <Icons.User size={14} />}
                                                    </div>
                                                    <div className={`p-3 rounded-lg border text-sm ${isTeacher ? 'bg-indigo-950/30 border-indigo-900/50' : 'bg-emerald-950/30 border-emerald-900/50'}`}>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className={`font-bold ${isTeacher ? 'text-indigo-400' : 'text-emerald-400'}`}>{seg.speaker}</span>
                                                            <span className="text-xs text-slate-500 font-mono">{Math.floor(seg.start / 60)}:{(seg.start % 60).toString().padStart(2, '0')} - {Math.floor(seg.end / 60)}:{(seg.end % 60).toString().padStart(2, '0')}</span>
                                                        </div>
                                                        <p className="text-slate-300 italic">"{seg.content}"</p>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className="text-[10px] uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{seg.emotion}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* 3. Audio Summary & Insights (ADDED THIS SECTION) */}
                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
                                    <h3 className="text-lg font-bold text-[#24cfa6] mb-3 flex items-center gap-2">
                                        <Icons.MessageCircle className="w-5 h-5" /> Audio Summary
                                    </h3>
                                    <p className="text-slate-300 leading-relaxed text-sm">
                                        {audioReport.summary || "No summary generated."}
                                    </p>
                                </div>
                                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
                                    <h3 className="text-lg font-bold text-blue-400 mb-3 flex items-center gap-2">
                                        <Icons.Zap className="w-5 h-5" /> Pedagogical Feedback
                                    </h3>
                                    <p className="text-slate-300 leading-relaxed text-sm">
                                        {audioReport.feedback || "No feedback generated."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Upload;
