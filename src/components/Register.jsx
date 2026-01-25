import React, { useState } from "react";
import { useFirebase } from "../context/Firebase";
import { useNavigate } from "react-router-dom";

// Accept setUserRole as a prop for prop drilling
const Register = ({ setUserRole }) => {
  const firebase = useFirebase();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student"); // Local state for UI toggle

  // Helper function to update both local UI and Parent App state
  const handleRoleSelection = (selectedRole) => {
    setRole(selectedRole);      // Updates the green border/highlight locally
    setUserRole(selectedRole);  // Sends the value up to App.js (Prop Drilling)
    setEmail(""); // Clear inputs
    setPassword("");
  };

  const handlesubmit = async (e) => {
    e.preventDefault();
    try {
      await firebase.signupuser(email, password, role);
      navigate("/");
    } catch (error) {
      console.error("Registration Error", error);
      alert("Registration Failed: " + error.message);
    }
  };

  const handleGoogleSignup = async () => {
    await firebase.loginWithGoogle();
    navigate("/");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "linear-gradient(135deg, #0d0d0d, #111418)",
      }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8 shadow-lg backdrop-blur-sm"
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <h2
          className="text-3xl font-semibold text-center mb-8"
          style={{ color: "#24CFA6" }}
        >
          Create Account
        </h2>

        {/* Role Selection Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => handleRoleSelection("student")}
            className={`flex-1 py-2 rounded-lg border transition-all font-medium text-sm ${role === "student"
              ? "border-[#24CFA6] text-[#24CFA6] bg-[#24CFA6]/10"
              : "border-gray-700 text-gray-500 hover:border-gray-500"
              }`}
          >
            Student
          </button>
          <button
            type="button"
            onClick={() => handleRoleSelection("admin")}
            className={`flex-1 py-2 rounded-lg border transition-all font-medium text-sm ${role === "admin"
              ? "border-[#24CFA6] text-[#24CFA6] bg-[#24CFA6]/10"
              : "border-gray-700 text-gray-500 hover:border-gray-500"
              }`}
          >
            Admin
          </button>
        </div>

        <form className="space-y-6" onSubmit={handlesubmit}>
          <div>
            <label className="block mb-1 text-gray-300">
              Email
            </label>
            <input
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              type="email"
              required
              className="w-full px-4 py-3 rounded-lg bg-black/20 text-white 
                         border border-gray-700 outline-none transition
                         focus:border-[#24CFA6] focus:shadow-[0_0_6px_#24CFA6]"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block mb-1 text-gray-300">Password</label>
            <input
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              type="password"
              required
              className="w-full px-4 py-3 rounded-lg bg-black/20 text-white 
                         border border-gray-700 outline-none transition
                         focus:border-[#24CFA6] focus:shadow-[0_0_6px_#24CFA6]"
              placeholder="********"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 font-semibold rounded-lg transition text-black"
            style={{
              background: "#24CFA6",
              boxShadow: "0 0 10px rgba(36, 207, 166, 0.3)"
            }}
          >
            Register as {role.charAt(0).toUpperCase() + role.slice(1)}
          </button>
        </form>

        {role !== 'teacher' && (
          <div className="mt-6">
            <button
              onClick={handleGoogleSignup}
              type="button"
              className="w-full py-3 flex items-center justify-center gap-3 rounded-lg 
                       bg-white/10 text-white border border-gray-600 hover:bg-white/20 
                       transition font-medium"
            >
              <img
                src="https://www.svgrepo.com/show/475656/google-color.svg"
                alt="google"
                className="w-5 h-5"
              />
              Continue with Google
            </button>
          </div>
        )}

        <p className="text-gray-400 text-center mt-6">
          Already have an account?{" "}
          <span
            onClick={() => navigate("/login")}
            className="cursor-pointer font-semibold"
            style={{ color: "#24CFA6" }}
          >
            Login
          </span>
        </p>
      </div>
    </div>
  );
};

export default Register;