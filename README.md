# 🎓 Parikshak AI

URL : https://parikshakfinalhost.vercel.app/
> **Your Personal AI Pedagogical Coach**

**Prekshak AI** (meaning "Examiner" in Hindi) is an advanced AI-powered platform designed to evaluate and improve classroom teaching quality. It acts as a smart coach for teachers and an evaluation tool for students/admins, analyzing **Video, Audio, and Content** to provide a 360-degree performance report.

---

## 🚀 What Does It Do?
Parikshak AI watches a classroom lecture just like a human expert would, but with the precision of AI. It answers three key questions:
1.  **How does the teacher look?** (Body language, confidence, eye contact)
2.  **How does the teacher sound?** (Tone, clarity, speed, enthusiasm)
3.  **What is the teacher saying?** (Syllabus coverage, correctness, explanation quality)

---

## ✨ Key Features

### 1. 📹 **Video Behavioral Analysis** (Computer Vision)
We use computer vision to track the teacher's movements frame-by-frame:
*   **Emotion Detection**: Are they smiling, neutral, or angry?
*   **Gaze Tracking**: Are they maintaining eye contact or constantly reading from notes?
*   **Posture & Gestures**: Are they standing confident or closed off? Are they using hand gestures to explain concepts?
*   **Activity Tracking**: Detects when they are writing on the board vs. lecturing.

### 2. 🎙️ **Deep Audio Forensics** (Signal Processing & AI)
We analyze the audio waveform and transcript to understand delivery:
*   **Voice Analytics**: Measures speaking pace (too fast/slow?) and pitch variation (monotone vs. dynamic).
*   **Diarization**: Distinguishes between when the Teacher is speaking vs. Student interactions.
*   **Disturbance Detection**: Identifies background noise or interruptions.

### 3. 🧠 **Content & Syllabus Verification** (Generative AI)
*   **Syllabus Matching**: Upload a PDF or paste text (e.g., "Intro to Physics"), and the AI checks if the teacher actually covered the required topics.
*   **Quality Check**: Evaluates the examples used, content simplification, and how well doubts were answered.
*   **Hallucination Check**: Ensures the teacher stays on topic.

### 4. 📊 **Comprehensive Reports (Insights)**
*   Get a **single "Quality Score"** (out of 5).
*   View detailed timelines of the class (e.g., *"At 10:05, Teacher explained code clearly"; "At 10:20, Teacher looked confused"*).
*   **Live Monitor**: Real-time analysis for active classroom sessions.

---

## 🛠️ Technology Stack
*   **Frontend**: React.js (Vite), TailwindCSS
*   **AI Models**:
    *   **Google Gemini 2.5 Flash**: For deep semantic analysis (transcript, feedback, syllabus matching).
    *   **MediaPipe**: For real-time facial landmarks and pose detection on the edge (browser).
    *   **Pitchfinder**: For audio signal processing (pitch/frequency analysis).
*   **Backend / Database**: Firebase (Firestore, Auth)

---

## ⚡ How to Run Locally

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/devGP7/parikshaksymbi.git
    cd parikshaksymbi
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Set Up Environment Keys**
    Create a file named `.env` in the root folder and add your keys:
    ```env
    VITE_FIREBASE_API_KEY=your_firebase_key
    VITE_EXTERNAL_API_KEY=your_google_gemini_key
    ```

4.  **Run the App**
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

---

## 📸 Usage Workflow
1.  **Login**: Sign in as a Student or Admin.
2.  **Upload**: Go to "Upload & Analyse" and select a video file of a lecture.
3.  **Reference (Optional)**: Upload a Syllabus PDF to compare against.
4.  **Evaluate**: Click "Evaluate". The AI will process video, audio, and text in parallel.
5.  **View Results**: See the scores, graphs, and actionable feedback immediately.

---

**Built with ❤️ for better education.**
