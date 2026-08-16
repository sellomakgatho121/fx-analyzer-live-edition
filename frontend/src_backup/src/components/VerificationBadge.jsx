'use client';
import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VerificationBadge({ verification }) {
    if (!verification) return null;

    const { score, level, verified } = verification;

    let color = 'var(--text-muted)';
    let Icon = Shield;
    let bg = 'rgba(255, 255, 255, 0.05)';
    let label = 'UNVERIFIED';

    if (score >= 80) {
        color = 'var(--neon-emerald)';
        Icon = ShieldCheck;
        bg = 'rgba(0, 255, 136, 0.1)';
        label = 'VERIFIED';
    } else if (score >= 50) {
        color = 'var(--neon-gold)'; // Assuming gold/yellow variable
        Icon = Shield;
        bg = 'rgba(255, 204, 0, 0.1)';
        label = 'MODERATE';
    } else {
        color = 'var(--neon-ruby)';
        Icon = ShieldAlert;
        bg = 'rgba(255, 51, 102, 0.1)';
        label = 'RISKY';
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10"
            style={{ background: bg, borderColor: color }}
        >
            <Icon size={14} style={{ color }} />
            <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold tracking-wider opacity-60">SCORE</span>
                <span className="text-xs font-mono font-bold" style={{ color }}>{score}/100</span>
            </div>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color }}>
                {label}
            </span>
        </motion.div>
    );
}
