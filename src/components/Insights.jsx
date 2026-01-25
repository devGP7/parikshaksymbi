import React, { useState, useEffect } from "react";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    doc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useFirebase, app } from "../context/Firebase";
import Logo2 from "../pictures/Logo2.png";

const firestore = getFirestore(app);

const Insights = ({ userRole }) => {
    // const firestore = getFirestore(app); // Moved outside
    const navigate = useNavigate();
    const { isUserLoggedIn, currentUser, loginWithGoogle } = useFirebase();

    // START: ADDED/MODIFIED FOR MOBILE MENU
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const handleNavigation = (path) => {
        navigate(path);
        // Close menu after navigating only if it was a mobile click
        if (isMenuOpen) {
            setIsMenuOpen(false);
        }
    };
    // END: ADDED/MODIFIED FOR MOBILE MENU

    const [teachers, setTeachers] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");

    // --- RATING & FEEDBACK STATE ---
    const [showModal, setShowModal] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [ratingValue, setRatingValue] = useState(5);
    const [feedbackText, setFeedbackText] = useState("");
    const [teacherFeedbacks, setTeacherFeedbacks] = useState([]);
    const [analysisList, setAnalysisList] = useState([]);
    const [modalTab, setModalTab] = useState("reviews");
    const [expandedReportId, setExpandedReportId] = useState(null);

    const [isLoading, setIsLoading] = useState(true);

    // Fetch Teachers
    useEffect(() => {
        console.log("Insights: Setting up teachers listener...");
        // Real-time listener for teachers to update ratings instantly on UI
        const q = collection(firestore, "teachers");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Insights: Fetched ${snapshot.docs.length} teachers.`);
            const teachersData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            setTeachers(teachersData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching teachers: ", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []); // Empty dependency array as firestore is stable

    // Fetch Feedbacks when a teacher is selected
    useEffect(() => {
        if (selectedTeacher) {
            const feedbacksRef = collection(firestore, "teachers", selectedTeacher.id, "feedbacks");
            const q = query(feedbacksRef, orderBy("timestamp", "desc"));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fbData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTeacherFeedbacks(fbData);
            });

            // FETCH ANALYSIS REPORTS
            const reportsRef = collection(firestore, "teachers", selectedTeacher.id, "analysis_reports");
            const qReports = query(reportsRef, orderBy("timestamp", "desc"));
            const unsubReports = onSnapshot(qReports, (snapshot) => {
                const repData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAnalysisList(repData);
            });

            return () => { unsubscribe(); unsubReports(); };
        }
    }, [selectedTeacher, firestore]);


    const openRatingModal = (teacher) => {
        if (!isUserLoggedIn) {
            alert("Please login to rate teachers.");
            loginWithGoogle();
            return;
        }
        setSelectedTeacher(teacher);
        setShowModal(true);
        setRatingValue(5);
        setFeedbackText("");
        setTeacherFeedbacks([]); // Clear previous until loaded
    };

    const closeRatingModal = () => {
        setShowModal(false);
        setSelectedTeacher(null);
    };

    const handleSubmitFeedback = async () => {
        if (!feedbackText.trim()) return alert("Please write some feedback.");
        if (!selectedTeacher) return;

        try {
            // 1. Add feedback to subcollection
            const feedbackRef = collection(firestore, "teachers", selectedTeacher.id, "feedbacks");
            await addDoc(feedbackRef, {
                rating: Number(ratingValue),
                feedback: feedbackText,
                user: currentUser?.displayName || "Anonymous",
                userEmail: currentUser?.email || "No Email",
                userPhoto: currentUser?.photoURL || null,
                timestamp: serverTimestamp()
            });

            // 2. Update Teacher's Average Rating
            const teacherRef = doc(firestore, "teachers", selectedTeacher.id);

            // Calculate new average
            // We can do this by fetching all again (safer) or incrementally.
            // For simplicity/robustness, let's re-calculate from the new list we just added to?
            // Actually, since we have the list in `teacherFeedbacks` (state) it might not be updated *immediately* inside this function due to async listener.
            // So let's do a quick fresh fetch of all ratings for this teacher to be perfectly accurate.

            // NOTE: For scale, you'd use distributed counters or cloud functions. For this scale, client-side recalc is fine.
            const allFeedbacksSnap = await getDocs(feedbackRef);
            const allRatings = allFeedbacksSnap.docs.map(d => d.data().rating);
            const total = allRatings.reduce((acc, r) => acc + r, 0) + Number(ratingValue); // + current one if not in snap yet? 
            // Wait, addDoc adds it. `getDocs` called AFTER addDoc WILL include it.

            const sum = allRatings.reduce((a, b) => a + b, 0);
            const count = allRatings.length;
            const newAvg = count > 0 ? (sum / count) : 0;

            await updateDoc(teacherRef, {
                rating: newAvg,
                ratingCount: count
            });

            setFeedbackText("");
            setRatingValue(5);
            // Modal stays open so they can see their comment appear? Or close it?
            // UX: Maybe keep it open or show success.
            alert("Feedback submitted successfully!");

        } catch (error) {
            console.error("Error submitting feedback:", error);
            alert("Failed to save feedback.");
        }
    };


    // Normalize search term once
    const normalizedSearch = (searchTerm || "").trim().toLowerCase();

    // Helper to safely compute a displayable rating
    const computeRatingDisplay = (rating) => {
        if (rating == null) return "N/A";

        // Handle Array (Admin Uploads)
        if (Array.isArray(rating)) {
            if (rating.length === 0) return "N/A";
            const sum = rating.reduce((a, b) => a + b, 0);
            return (sum / rating.length).toFixed(1);
        }

        if (typeof rating === "number") {
            return Number.isFinite(rating) ? rating.toFixed(1) : "N/A";
        }
        if (typeof rating === "string") return rating;
        return "N/A";
    };

    // FILTER: if searchTerm is empty -> show all teachers; otherwise filter by name includes
    const filteredTeachers = normalizedSearch
        ? teachers.filter((t) => {
            const name = (t?.name || "").toString().toLowerCase();
            return name.includes(normalizedSearch);
        })
        : teachers;

    return (
        <section className="w-full min-h-screen flex flex-col items-center justify-start bg-black
text-white text-center pt-20 relative overflow-hidden">

            <div className="absolute top-[-150px] right-[-50px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>
            <div className="absolute bottom-[-150px] left-[-150px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>

            {/* NAVBAR - MODIFIED FOR MOBILE */}
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
                    <span onClick={() => handleNavigation("/")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Home</span>

                    {userRole !== "teacher" && (
                        <span onClick={() => handleNavigation("/insights")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Insights</span>
                    )}

                    <span onClick={() => handleNavigation('/textanalysis')} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Upload & Analyse</span>
                    <span onClick={() => handleNavigation("/live")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Live Monitor</span>


                    <span onClick={() => handleNavigation("/feedback")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Feedback</span>
                </div>
            </div>

            <h2 className="text-xl font-bold mb-8 mt-10 text-center text-white">
                Search by Name
            </h2>

            {/* SEARCH INPUT */}
            <div>
                <input
                    className="border-2 border-white hover:border-[#24cfa6] h-8 w-80 p-2 text-black"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Type a teacher's name..."
                />
            </div>

            <div className="container mx-auto mt-10 p-4 max-w-7xl pb-20">
                <h2 className="text-xl font-bold text-white mb-8 text-center">
                    Instructors
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {!isLoading && filteredTeachers.length === 0 && (
                        <div className="col-span-full text-center py-20">
                            <h3 className="text-2xl font-bold text-gray-500 mb-2">No Instructors Found</h3>
                            <p className="text-gray-400">Try adjusting your search or check back later.</p>
                        </div>
                    )}

                    {filteredTeachers.map((item, index) => (
                        <div
                            key={item.id || index}
                            className="bg-gray-900 rounded-lg p-5 shadow-md border border-gray-800 hover:border-[#24cfa6] transition-all duration-300 flex flex-col justify-between h-auto group min-h-[180px]"
                        >
                            {/* Top Section */}
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-lg font-bold text-white group-hover:text-[#24cfa6] transition-colors truncate pr-2">
                                    {item.name}
                                </h3>
                                <div className="flex items-center gap-1 bg-gray-800 h-8 px-2 rounded-md shrink-0">
                                    <span className="text-[#24cfa6] text-sm">★</span>
                                    <span className="text-white text-sm font-semibold">
                                        {computeRatingDisplay(item.rating)}
                                    </span>
                                </div>
                            </div>

                            {/* Topics */}
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {(item.topics || []).map((it, ind) => (
                                    <span
                                        key={ind}
                                        className="bg-[#24cfa6]/10 text-[#24cfa6] text-xs px-2 py-0.5 rounded-full border border-[#24cfa6]/20"
                                    >
                                        {it}
                                    </span>
                                ))}
                            </div>

                            {/* Action Button */}
                            <button
                                onClick={() => openRatingModal(item)}
                                className="w-full mt-auto py-2 bg-[#24cfa6]/10 hover:bg-[#24cfa6] border border-[#24cfa6] text-[#24cfa6] hover:text-black rounded-md transition-all font-medium text-sm flex items-center justify-center gap-2"
                            >
                                <span>See Reviews / Rate</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* RATING & FEEDBACK MODAL */}
            {showModal && selectedTeacher && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#111] w-full max-w-2xl max-h-[90vh] rounded-2xl border border-white/20 shadow-2xl flex flex-col overflow-hidden">

                        {/* Header */}
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a]">
                            <div>
                                <h3 className="text-xl font-bold text-white">Rate <span className="text-[#24cfa6]">{selectedTeacher.name}</span></h3>
                                <div className="flex gap-4 mt-2">
                                    <button
                                        onClick={() => setModalTab("reviews")}
                                        className={`text-sm font-medium pb-1 border-b-2 transition-all ${modalTab === "reviews" ? "border-[#24cfa6] text-[#24cfa6]" : "border-transparent text-gray-400"}`}
                                    >
                                        Student Reviews
                                    </button>
                                    <button
                                        onClick={() => setModalTab("analysis")}
                                        className={`text-sm font-medium pb-1 border-b-2 transition-all ${modalTab === "analysis" ? "border-[#24cfa6] text-[#24cfa6]" : "border-transparent text-gray-400"}`}
                                    >
                                        AI Analysis Reports
                                    </button>
                                </div>
                            </div>
                            <button onClick={closeRatingModal} className="text-gray-400 hover:text-white transition">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        {/* Content Scrollable Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">

                            {modalTab === "reviews" ? (
                                <>
                                    {/* Input Area */}
                                    <div className="bg-gray-900/50 p-4 rounded-xl border border-white/10">
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Your Rating</label>
                                        <div className="flex gap-2 mb-4">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    onClick={() => setRatingValue(star)}
                                                    className={`text-2xl transition-transform hover:scale-110 ${ratingValue >= star ? "text-[#24cfa6]" : "text-gray-600"}`}
                                                >
                                                    ★
                                                </button>
                                            ))}
                                            <span className="ml-2 text-lg font-bold text-[#24cfa6]">{ratingValue}/5</span>
                                        </div>

                                        <label className="block text-sm font-medium text-gray-300 mb-2">Your Feedback</label>
                                        <textarea
                                            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-[#24cfa6] outline-none h-24 resize-none"
                                            placeholder="Write a helpful review..."
                                            value={feedbackText}
                                            onChange={(e) => setFeedbackText(e.target.value)}
                                        ></textarea>

                                        <button
                                            onClick={handleSubmitFeedback}
                                            className="mt-3 w-full bg-[#24cfa6] text-black font-bold py-2 rounded-lg hover:bg-[#1fae8c] transition-colors"
                                        >
                                            Submit Review
                                        </button>
                                    </div>

                                    {/* Reviews List */}
                                    <div>
                                        <h4 className="text-lg font-semibold text-white mb-4 border-l-4 border-[#24cfa6] pl-3">Student Reviews ({teacherFeedbacks.length})</h4>

                                        {teacherFeedbacks.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500 italic bg-gray-900/30 rounded-lg">
                                                No reviews yet. Be the first to rate!
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {teacherFeedbacks.map((fb) => (
                                                    <div key={fb.id} className="bg-white/5 p-4 rounded-lg border border-white/5 hover:border-white/10 transition">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center text-xs font-bold">
                                                                    {fb.userPhoto ? <img src={fb.userPhoto} alt="u" className="w-full h-full object-cover" /> : fb.user?.charAt(0) || "A"}
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-semibold text-white">{fb.user || "Anonymous"}</p>
                                                                    <p className="text-xs text-gray-500">{fb.timestamp?.toDate ? fb.timestamp.toDate().toLocaleDateString() : "Just now"}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center bg-[#24cfa6]/10 px-2 py-1 rounded text-[#24cfa6] text-xs font-bold border border-[#24cfa6]/20">
                                                                {fb.rating} ★
                                                            </div>
                                                        </div>
                                                        <p className="text-gray-300 text-sm leading-relaxed">{fb.feedback}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (

                                <div className="space-y-6">
                                    {analysisList.length === 0 ? (
                                        <div className="text-center py-10 text-gray-500">No Analysis Reports found for this teacher.</div>
                                    ) : (
                                        analysisList.map((report) => (
                                            <div key={report.id} className="bg-gray-900 p-5 rounded-lg border border-gray-700 hover:border-[#24cfa6] transition-all text-left">
                                                <div className="flex justify-between items-center mb-3">
                                                    <div className="flex items-center gap-2">
                                                        {report.type === 'audio' ? (
                                                            <div className="bg-purple-900/50 p-1.5 rounded text-purple-400" title="Audio Analysis">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-blue-900/50 p-1.5 rounded text-blue-400" title="Video Analysis">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.6 11.6L22 7v10l-6.4-4.5v-1z" /><path d="M4 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></svg>
                                                            </div>
                                                        )}
                                                        <h4 className="text-[#24cfa6] font-bold text-lg">{report.subject || "General Analysis"}</h4>
                                                    </div>
                                                    <span className="text-xs text-gray-400">{report.timestamp?.toDate ? report.timestamp.toDate().toLocaleDateString() : "Recent"}</span>
                                                </div>

                                                <div className="flex gap-4 mb-4 text-sm">
                                                    <div className="bg-black/40 px-3 py-1 rounded border border-white/10">
                                                        <span className="text-gray-400">Rating:</span> <span className="font-bold text-white">{report.overall_rating ? report.overall_rating.toFixed(1) : "N/A"}/5</span>
                                                    </div>
                                                    {report.metrics?.student_engagement && (
                                                        <div className="bg-black/40 px-3 py-1 rounded border border-white/10">
                                                            <span className="text-gray-400">Engag:</span> <span className="font-bold text-white">{report.metrics.student_engagement}%</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mb-3">
                                                    {report.type === 'audio' ? (
                                                        <>
                                                            <p className="text-gray-300 text-sm italic border-l-2 border-purple-500 pl-3 mb-2">
                                                                "{report.audio_analysis?.interaction_summary || "No summary provided"}"
                                                            </p>
                                                            {report.audio_analysis?.disturbance_conclusion && (
                                                                <div className="text-xs text-orange-300 bg-orange-900/20 p-2 rounded mt-2">
                                                                    <strong>⚠️ Noise Impact:</strong> {report.audio_analysis.disturbance_conclusion}
                                                                </div>
                                                            )}
                                                            {report.audio_analysis?.feedback && (
                                                                <div className="text-xs text-gray-400 mt-2 border-t border-gray-800 pt-2">
                                                                    <strong>Feedback:</strong> {report.audio_analysis.feedback}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="text-gray-300 text-sm italic border-l-2 border-blue-500 pl-3">
                                                                "{report.video_analysis?.visual_summary?.substring(0, 150)}..."
                                                            </p>
                                                            <div className="flex flex-wrap gap-2 mt-2">
                                                                <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">Improve: {report.metrics?.['Areas to Improve']?.substring(0, 30)}...</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}

        </section >
    );
};

export default Insights;