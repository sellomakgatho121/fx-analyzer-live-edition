'use client';
import React, { createContext, useContext, useCallback } from 'react';
import toast from 'react-hot-toast';
import { X, CheckCircle, AlertCircle, Info, TrendingUp, Bell } from 'lucide-react';

const NotificationContext = createContext();

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}

export function NotificationProvider({ children }) {

    const addNotification = useCallback((type, title, message) => {
        const getIcon = () => {
            switch (type) {
                case 'success': return <CheckCircle size={20} className="text-emerald-500" />;
                case 'error': return <AlertCircle size={20} className="text-red-500" />;
                case 'trade': return <TrendingUp size={20} className="text-yellow-500" />;
                case 'signal': return <Bell size={20} className="text-purple-500" />;
                default: return <Info size={20} className="text-cyan-500" />;
            }
        };

        const getBorderColor = () => {
            switch (type) {
                case 'success': return '#10B981';
                case 'error': return '#EF4444';
                case 'trade': return '#EAB308';
                case 'signal': return '#8B5CF6';
                default: return '#06B6D4';
            }
        };

        toast.custom((t) => (
            <div
                className={`${t.visible ? 'animate-enter' : 'animate-leave'
                    } max-w-md w-full bg-[#0d0d0d] shadow-2xl rounded-lg pointer-events-auto flex ring-1 ring-white/10`}
                style={{
                    borderLeft: `4px solid ${getBorderColor()}`
                }}
            >
                <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 pt-0.5">
                            {getIcon()}
                        </div>
                        <div className="ml-3 flex-1">
                            <p className="text-sm font-medium text-white">
                                {title}
                            </p>
                            <p className="mt-1 text-sm text-gray-400">
                                {message}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex border-l border-white/10">
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>
        ), { duration: 5000 });
    }, []);

    const removeNotification = useCallback((id) => {
        toast.dismiss(id);
    }, []);

    return (
        <NotificationContext.Provider value={{ addNotification, removeNotification }}>
            {children}
        </NotificationContext.Provider>
    );
}
