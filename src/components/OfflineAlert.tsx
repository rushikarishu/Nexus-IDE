import React from 'react';
import { WifiOff } from 'lucide-react';

const OfflineAlert: React.FC = () => {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1e1e1e] border border-red-500/30 rounded-lg p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-red-500/10 rounded-full">
                        <WifiOff className="w-12 h-12 text-red-500" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">No Internet Connection</h2>
                <p className="text-gray-400 mb-6">
                    You are currently offline. Please check your internet connection to continue using Nexus IDE.
                </p>
                <div className="text-xs text-gray-500">
                    Waiting for connection...
                </div>
            </div>
        </div>
    );
};

export default OfflineAlert;
