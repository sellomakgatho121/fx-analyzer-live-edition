
import React from 'react';
import { motion } from 'framer-motion';
import { Brain, TrendingUp, TrendingDown, BookOpen, AlertTriangle, ShieldCheck } from 'lucide-react';

const AGENT_COLORS = {
    cyan: { border: '#00f2ff', rgb: '0, 242, 255' },
    emerald: { border: '#00ff88', rgb: '0, 255, 136' },
    violet: { border: '#a855f7', rgb: '168, 85, 247' },
    orange: { border: '#f97316', rgb: '249, 115, 22' },
};

const AgentCard = ({ title, agentType, analysis, icon: Icon, color }) => {
    if (!analysis) return null;
    const palette = AGENT_COLORS[color] || AGENT_COLORS.cyan;

    return (
        <motion.div
            className="p-4 rounded-xl border backdrop-blur-md"
            style={{
                borderColor: palette.border,
                background: `linear-gradient(145deg, rgba(${palette.rgb}, 0.05) 0%, rgba(${palette.rgb}, 0.1) 100%)`
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg" style={{ background: `rgba(${palette.rgb}, 0.2)` }}>
                    <Icon size={16} style={{ color: palette.border }} />
                </div>
                <h4 className="font-semibold text-sm text-gray-200">{title}</h4>
                <span className="ml-auto text-xs font-mono opacity-70">
                    {Math.round((analysis.confidence || 0) * 100)}% Conf
                </span>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                    <span className="opacity-60">Signal:</span>
                    <span className="font-bold" style={{ color: palette.border }}>
                        {analysis.signal || analysis.bias || analysis.sentiment || 'NEUTRAL'}
                    </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed border-t border-white/5 pt-2 mt-2">
                    {analysis.reasoning}
                </p>
            </div>
        </motion.div>
    );
};

export default function AgentDebate({ breakdown }) {
    if (!breakdown) return null;

    return (
        <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
                <Brain size={18} className="text-purple-400" />
                <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">MoE Consensus Debate</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Technical Agent */}
                <AgentCard
                    title="Technical Expert"
                    icon={TrendingUp}
                    color="cyan"
                    analysis={breakdown.technical}
                />

                {/* Fundamental Agent */}
                <AgentCard
                    title="Macro Strategist"
                    icon={BookOpen}
                    color="emerald"
                    analysis={breakdown.fundamental}
                />

                {/* Sentiment Agent */}
                <AgentCard
                    title="Market Sentiment"
                    icon={TrendingDown}
                    color="violet"
                    analysis={breakdown.sentiment}
                />

                {/* Risk Agent */}
                <AgentCard
                    title="Risk Guardian"
                    icon={ShieldCheck}
                    color="orange"
                    analysis={breakdown.risk}
                />
            </div>
        </div>
    );
}
