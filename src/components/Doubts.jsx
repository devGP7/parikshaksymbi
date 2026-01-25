import React from 'react';
import { useNavigate } from 'react-router-dom';

const Doubts = () => {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <div className="text-center">
                <h1 className="text-3xl font-bold mb-4">Doubts Section Removed</h1>
                <p className="text-gray-400 mb-8">This feature is no longer available.</p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-[#24cfa6] text-black rounded-lg font-bold"
                >
                    Go Home
                </button>
            </div>
        </div>
    );
};

export default Doubts;