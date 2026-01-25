import React, { useState, useEffect } from "react";

import { useFirebase, app } from "../context/Firebase";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import Logo2 from "../pictures/Logo2.png";

const firestore = getFirestore(app);

const Feedback = ({ userRole }) => {
  const [teachers, setTeachers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isUserLoggedIn, currentUser, loginWithGoogle, addTeacher } = useFirebase(); // Added addTeacher

  // Fetch Teachers
  const fetchTeachers = async () => {
    try {
      const querySnapshot = await getDocs(collection(firestore, "teachers"));
      const teachersData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          subject: Array.isArray(data.topics) ? data.topics.join(", ") : (data.subject || "General"),
          authenticity: data.authenticity || Math.floor(Math.random() * 15) + 80,
          bias: data.bias || Math.floor(Math.random() * 15) + 5,
        };
      });
      setTeachers(teachersData);
    } catch (error) {
      console.error("Error fetching teachers: ", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Modal & Form States
  const [showModal, setShowModal] = useState(false);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false); // Admin only
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  // Feedback States
  const [feedbackText, setFeedbackText] = useState("");
  const [ratings, setRatings] = useState({ doubt: 0, example: 0, topic: 0, interaction: 0 });
  const [classGrade, setClassGrade] = useState("");
  const [section, setSection] = useState("");

  // Add Teacher States
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherSubject, setNewTeacherSubject] = useState("");

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const handleNavigation = (path) => {
    navigate(path);
    if (isMenuOpen) setIsMenuOpen(false);
  };

  const openModal = (teacher) => {
    if (!isUserLoggedIn) {
      loginWithGoogle();
      return;
    }
    setSelectedTeacher(teacher);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!classGrade || !section) {
      alert("Please enter Class and Section.");
      return;
    }

    if (feedbackText.trim() === "") { alert("Please enter feedback text."); return; }

    const { doubt, example, topic, interaction } = ratings;
    if (doubt === 0 || example === 0 || topic === 0 || interaction === 0) {
      alert("Please rate all categories.");
      return;
    }

    const avgRating = (doubt + example + topic + interaction) / 4;

    try {
      const feedbackRef = collection(firestore, "teachers", selectedTeacher.id, "feedbacks");
      await addDoc(feedbackRef, {
        rating: avgRating,
        ratings: ratings,
        feedback: feedbackText,
        user: currentUser?.displayName || "Anonymous",
        userEmail: currentUser?.email || "No Email",
        userPhoto: currentUser?.photoURL || null,
        timestamp: serverTimestamp()
      });

      setFeedbackText("");
      setRatings({ doubt: 0, example: 0, topic: 0, interaction: 0 });
      alert("Feedback Submitted!");
      setShowModal(false);
    } catch (e) {
      console.error(e);
      alert("Error submitting feedback");
    }
  };

  const handleAddTeacher = async () => {
    if (!newTeacherName.trim()) return;
    try {
      await addTeacher({
        name: newTeacherName,
        subject: newTeacherSubject,
        topics: [newTeacherSubject]
      });
      alert("Teacher Added Successfully!");
      setNewTeacherName("");
      setNewTeacherSubject("");
      setShowAddTeacherModal(false);
      fetchTeachers(); // Refresh list
    } catch (error) {
      console.error(error);
      alert("Failed to add teacher");
    }
  };

  const computeRatingDisplay = (rating) => {
    if (rating == null) return "N/A";
    if (Array.isArray(rating)) {
      if (rating.length === 0) return "N/A";
      const sum = rating.reduce((a, b) => a + b, 0);
      return (sum / rating.length).toFixed(1);
    }
    if (typeof rating === "number") return Number.isFinite(rating) ? rating.toFixed(1) : "N/A";
    if (typeof rating === "string") return rating;
    return "N/A";
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-150px] right-[-50px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>
      <div className="absolute bottom-[-150px] left-[-150px] w-[350px] h-[350px] bg-[#24cfa6] rounded-full blur-[160px] opacity-70"></div>

      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 w-full flex bg-transparent justify-between text-white z-20">
        <div className="left flex flex-row items-center p-2 sm:p-0">
          <img className="w-14 h-14 sm:w-16 sm:h-16 ms-4 mt-4 sm:ms-20 object-cover scale-180 origin-center" src={Logo2} alt="Logo" />
          <div className="name mt-0 sm:mt-7 mx-2 sm:mx-5 text-base sm:text-lg font-medium">Parikshak AI</div>
        </div>

        {/* Desktop Navigation */}
        <div className="right hidden sm:flex flex-row justify-around items-center">
          <span className="mx-6 cursor-pointer" onClick={() => handleNavigation("/")}>Home</span>

          {/* Student/Admin see Insights */}
          <span onClick={() => handleNavigation("/insights")} className="mx-6 cursor-pointer">Insights</span>

          <span onClick={() => handleNavigation('/textanalysis')} className="mx-6 cursor-pointer">Upload & Analyse</span>
          <span onClick={() => handleNavigation("/live")} className="mx-6 cursor-pointer">Live Monitor</span>
          <span onClick={() => handleNavigation("/feedback")} className="mx-6 cursor-pointer text-[#24cfa6] font-bold">Feedback</span>

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
          <button className="text-white text-2xl focus:outline-none" onClick={toggleMenu}>
            {isMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      <div className={`fixed top-16 left-0 w-full bg-black/95 backdrop-blur-sm z-10 sm:hidden transition-all duration-300 ease-in-out ${isMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="flex flex-col items-center py-4 space-y-3">
          <span onClick={() => handleNavigation("/")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Home</span>
          <span onClick={() => handleNavigation("/insights")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Insights</span>
          <span onClick={() => handleNavigation('/textanalysis')} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Upload & Analyse</span>
          <span onClick={() => handleNavigation("/live")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Live Monitor</span>
          <span onClick={() => handleNavigation("/feedback")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Feedback</span>
        </div>
      </div>

      {/* HEADER */}
      <div className="pt-32 pb-10 text-center relative z-10">
        <h1 className="text-4xl font-semibold mb-4 tracking-wide">Feedback Portal</h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto px-4">
          Share your experience to help educators improve.
        </p>

        {/* ADMIN ACTION: ADD TEACHER */}
        {userRole === 'admin' && (
          <div className="mt-8">
            <button
              onClick={() => setShowAddTeacherModal(true)}
              className="px-6 py-2 bg-slate-800 border border-[#24cfa6] text-[#24cfa6] rounded-full hover:bg-[#24cfa6] hover:text-black transition-all"
            >
              + Add New Teacher (Admin)
            </button>
          </div>
        )}
      </div>

      {/* TEACHER GRID */}
      <div className="px-10 pb-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
        {!isLoading && teachers.length === 0 && (
          <div className="col-span-full text-center py-10">
            <h3 className="text-2xl font-bold text-gray-500 mb-2">No Instructors Found</h3>
            <p className="text-gray-400">Admin needs to add instructors.</p>
          </div>
        )}

        {teachers.map((t, idx) => (
          <div key={idx} className="bg-white/5 border border-white/10 p-6 backdrop-blur-md rounded-2xl shadow-lg hover:shadow-[#24cfa6]/30 hover:border-[#24cfa6] transition transform hover:-translate-y-2">
            <h2 className="text-xl font-semibold">{t.name}</h2>
            <p className="text-gray-400 mb-4">{t.subject}</p>
            <div className="flex justify-between text-sm mb-4">
              <span>Rating: <span className="text-yellow-400">{computeRatingDisplay(t.rating)}</span></span>
              <span>Authenticity: <span className="text-[#24cfa6]">{t.authenticity}%</span></span>
            </div>

            <div className="flex flex-col gap-3 mt-3">
              <div className="flex gap-2">
                <button onClick={() => navigate(`/feedback/${t.name}`)} className="flex-1 py-2 bg-[#1e293b] hover:bg-[#243447] rounded-lg font-medium text-sm">View Stats</button>
                <button onClick={() => openModal(t)} className="flex-1 py-2 bg-[#24cfa6] hover:bg-[#1ba988] rounded-lg text-black font-semibold text-sm">Feedback +</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FEEDBACK MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="bg-[#111] p-6 rounded-2xl border border-white/20 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-semibold mb-4">
              Rate <span className="text-[#24cfa6]">{selectedTeacher.name}</span>
            </h2>

            {/* Class & Section Inputs */}
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                placeholder="Class (e.g. 10)"
                value={classGrade}
                onChange={(e) => setClassGrade(e.target.value)}
                className="w-1/2 p-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-[#24cfa6] outline-none"
              />
              <input
                type="text"
                placeholder="Section (e.g. B)"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-1/2 p-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-[#24cfa6] outline-none"
              />
            </div>

            <div className="space-y-4">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="How was your experience with this teacher?"
                className="w-full h-28 p-3 rounded-lg bg-black/40 border border-white/10 focus:border-[#24cfa6] outline-none"
              />
              <div>
                <div className="space-y-4">
                  {Object.keys(ratings).map((key) => (
                    <div key={key}>
                      <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1">
                        {key === 'doubt' ? 'Doubt Solving' :
                          key === 'example' ? 'Example Quality' :
                            key === 'topic' ? 'Topic Coverage' : 'Class Interaction'}
                      </label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setRatings({ ...ratings, [key]: star })}
                            className={`text-2xl transition-colors ${ratings[key] >= star ? "text-yellow-400" : "text-gray-600"}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSubmit} className="px-8 py-2 bg-[#24cfa6] rounded-lg text-black font-bold hover:scale-105 transition-transform">
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ADD TEACHER MODAL */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="bg-[#111] p-6 rounded-2xl border border-white/20 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-semibold mb-6 text-[#24cfa6]">Add New Teacher Profile</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 mb-1 text-sm">Teacher Name</label>
                <input
                  type="text"
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                  className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-white focus:border-[#24cfa6] outline-none"
                  placeholder="e.g. Dr. Smith"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 text-sm">Subject/Specialization</label>
                <input
                  type="text"
                  value={newTeacherSubject}
                  onChange={(e) => setNewTeacherSubject(e.target.value)}
                  className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-white focus:border-[#24cfa6] outline-none"
                  placeholder="e.g. Physics"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setShowAddTeacherModal(false)}
                className="px-5 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTeacher}
                className="px-6 py-2 bg-[#24cfa6] rounded-lg text-black font-bold hover:bg-[#1fa082]"
              >
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Feedback;