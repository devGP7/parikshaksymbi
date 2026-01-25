import React, { useState, useRef, useEffect } from 'react'
import { useFirebase } from "../context/Firebase";
import { useNavigate } from "react-router-dom";
import Logo2 from "../pictures/Logo2.png"
import useravatar from "../pictures/useravatar.jpg";


const Home = ({ userRole }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();
    const { isUserLoggedIn, currentUser } = useFirebase();
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = 4.0;
        }
    }, []);

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
        <div>
            <section className="w-full flex flex-col items-center justify-start bg-black text-white text-center pt-24 relative overflow-x-hidden min-h-screen">

                {/* Background Glows */}
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
                        <span onClick={() => handleNavigation("/")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Home</span>

                        {userRole !== "teacher" && (
                            <span onClick={() => handleNavigation("/insights")} className="w-full text-center py-2 hover:bg-[#24cfa6]/20 cursor-pointer text-lg">Insights</span>
                        )}

                        <span onClick={() => handleNavigation('/textanalysis')} className="w-full text-center py-2 hover:text-[#24cfa6] cursor-pointer text-lg transition-colors">Upload & Analyse</span>
                        <span onClick={() => handleNavigation("/live")} className="w-full text-center py-2 hover:text-[#24cfa6] cursor-pointer text-lg transition-colors">Live Monitor</span>


                        <span onClick={() => handleNavigation("/feedback")} className="w-full text-center py-2 hover:text-[#24cfa6] cursor-pointer text-lg transition-colors">Feedback</span>
                    </div>
                </div>

                {/* Hero Section Container */}
                <div className="flex flex-col-reverse md:flex-row items-center justify-center w-full max-w-[90rem] px-4 mt-8 md:mt-12 gap-10 md:gap-16 z-10">

                    {/* Left: Video Demo */}
                    <div className="w-full md:w-[60%] flex justify-center md:justify-start animate-fade-in-up">
                        <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-[#24cfa6]/50 via-cyan-900/30 to-black/0 shadow-[0_0_80px_rgba(36,207,166,0.15)] hover:shadow-[0_0_100px_rgba(36,207,166,0.3)] transition-all duration-500 group">
                            {/* Inner Mask for smoother blend */}
                            <div className="absolute inset-0 bg-black/40 rounded-2xl pointer-events-none"></div>

                            <div className="w-full h-[400px] bg-black/50 rounded-xl border border-white/5 flex flex-col items-center justify-center relative z-10 backdrop-blur-sm">
                                <div className="text-[#24cfa6] text-6xl mb-4">
                                    ▶
                                </div>
                                <h3 className="text-white text-xl font-bold mb-2">Platform Demo</h3>
                                <p className="text-slate-400 text-sm max-w-xs text-center">
                                    Watch how Parikshak AI evaluates teaching performance in real-time
                                </p>
                            </div>

                            <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-mono text-[#24cfa6] border border-[#24cfa6]/20 flex items-center gap-2 z-20">
                                <span className="animate-pulse w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>
                                Live Demo (Preview)
                            </div>
                        </div>
                    </div>

                    {/* Right: Text Content */}
                    <div className="w-full md:w-[40%] text-center md:text-left space-y-8 pl-4">
                        <span className="text-5xl md:text-6xl font-bold leading-tight block text-white">
                            We help you <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#24cfa6] to-cyan-400">evaluate</span> <br />
                            what makes teaching <br />
                            truly <span className="italic font-serif bg-clip-text text-transparent bg-gradient-to-r from-[#24cfa6] to-cyan-400">effective</span>.
                        </span>

                        <div className="text-slate-300 text-lg md:text-xl leading-relaxed">
                            Use smart evaluation tools to <br className="hidden md:block" />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#24cfa6] to-cyan-400 font-bold">elevate teacher performance</span><br className="hidden md:block" />
                            and create better educational experiences <br className="hidden md:block" />
                            for students.
                        </div>

                        <button
                            onClick={() => handleNavigation("/textanalysis")}
                            className="px-8 py-3.5 text-black bg-gradient-to-r from-[#24cfa6] to-cyan-500 hover:from-[#1ea887] hover:to-cyan-600 rounded-lg text-lg font-bold shadow-[0_0_25px_rgba(36,207,166,0.3)] hover:shadow-[0_0_40px_rgba(36,207,166,0.5)] transition-all transform hover:-translate-y-1"
                        >
                            {userRole === "teacher" ? "Review Submissions" : "Evaluate Your Teacher Effectively"}
                        </button>
                    </div>
                </div>

                {/* Milestones */}
                <div className="bottom w-full py-16 mt-20 mb-10 bg-slate-900/30 border-y border-white/5 backdrop-blur-sm">
                    <div className="mileStones flex flex-wrap justify-center gap-16 md:gap-32">
                        <div className="mileStone text-center transform hover:scale-105 transition-transform duration-300">
                            <h2 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-[#24cfa6] to-cyan-500 mb-2">20k+</h2>
                            <p className="text-lg text-slate-300 font-medium tracking-wide">Videos Evaluated</p>
                        </div>
                        <div className="mileStone text-center transform hover:scale-105 transition-transform duration-300">
                            <h2 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-[#24cfa6] to-cyan-500 mb-2">20+</h2>
                            <p className="text-lg text-slate-300 font-medium tracking-wide">Instructor Ratings</p>
                        </div>
                        <div className="mileStone text-center transform hover:scale-105 transition-transform duration-300">
                            <h2 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-[#24cfa6] to-cyan-500 mb-2">65k+</h2>
                            <p className="text-lg text-slate-300 font-medium tracking-wide">Students Support</p>
                        </div>
                    </div>
                </div>
            </section>
        </div >
    )
}

export default Home;
