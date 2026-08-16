'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, TrendingUp, ChevronDown, X } from 'lucide-react';
import { CURRENCY_PAIRS, getPairsByCategory } from '../data/currencyPairs';

export default function PairSelector({ selectedPair, onPairChange, favorites = [], onToggleFavorite }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    const categories = [
        { id: 'all', label: 'All Pairs' },
        { id: 'favorites', label: 'Favorites' },
        { id: 'major', label: 'Majors' },
        { id: 'cross', label: 'Crosses' },
        { id: 'exotic', label: 'Exotics' },
    ];

    const filteredPairs = CURRENCY_PAIRS.filter(pair => {
        // Category filter
        if (activeCategory === 'favorites') {
            if (!favorites.includes(pair.symbol)) return false;
        } else if (activeCategory !== 'all') {
            if (pair.category !== activeCategory) return false;
        }

        // Search filter
        if (searchQuery) {
            return pair.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pair.symbol.toLowerCase().includes(searchQuery.toLowerCase());
        }

        return true;
    });

    const handleSelectPair = (pair) => {
        onPairChange(pair);
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Selected Pair Button */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-sm"
                style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    fontWeight: 600,
                }}
            >
                <span>{selectedPair.name}</span>
                <span className="text-caption text-muted">{selectedPair.category}</span>
                <ChevronDown size={16} className={isOpen ? 'rotate-180' : ''} style={{ transition: 'transform 0.2s' }} />
            </motion.button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.5)',
                                zIndex: 40,
                            }}
                        />

                        {/* Dropdown Panel */}
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: 'var(--space-sm)',
                                width: '380px',
                                maxHeight: '500px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                                overflow: 'hidden',
                                zIndex: 50,
                            }}
                        >
                            {/* Search Bar */}
                            <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div className="flex items-center gap-sm input" style={{ padding: 'var(--space-sm)' }}>
                                    <Search size={16} className="text-muted" />
                                    <input
                                        type="text"
                                        placeholder="Search pairs..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{
                                            flex: 1,
                                            background: 'transparent',
                                            border: 'none',
                                            outline: 'none',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.875rem',
                                        }}
                                        autoFocus
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <X size={14} className="text-muted" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Category Tabs */}
                            <div
                                className="flex gap-xs"
                                style={{
                                    padding: 'var(--space-sm) var(--space-md)',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    overflowX: 'auto',
                                }}
                            >
                                {categories.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setActiveCategory(cat.id)}
                                        style={{
                                            padding: '4px 12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            background: activeCategory === cat.id ? 'rgba(0, 242, 255, 0.1)' : 'transparent',
                                            color: activeCategory === cat.id ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                                            border: '1px solid',
                                            borderColor: activeCategory === cat.id ? 'var(--neon-cyan)' : 'transparent',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>

                            {/* Pairs List */}
                            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                                {filteredPairs.length === 0 ? (
                                    <div style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                                        <p className="text-body text-muted">No pairs found</p>
                                    </div>
                                ) : (
                                    filteredPairs.map((pair) => {
                                        const isFavorite = favorites.includes(pair.symbol);
                                        const isSelected = selectedPair.symbol === pair.symbol;

                                        return (
                                            <motion.div
                                                key={pair.symbol}
                                                whileHover={{ background: 'rgba(255, 255, 255, 0.03)' }}
                                                onClick={() => handleSelectPair(pair)}
                                                className="flex items-center justify-between"
                                                style={{
                                                    padding: 'var(--space-sm) var(--space-md)',
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'rgba(0, 242, 255, 0.05)' : 'transparent',
                                                    borderLeft: isSelected ? '2px solid var(--neon-cyan)' : '2px solid transparent',
                                                }}
                                            >
                                                <div className="flex items-center gap-md">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onToggleFavorite?.(pair.symbol);
                                                        }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                    >
                                                        <Star
                                                            size={14}
                                                            fill={isFavorite ? 'var(--neon-gold)' : 'none'}
                                                            stroke={isFavorite ? 'var(--neon-gold)' : 'var(--text-tertiary)'}
                                                        />
                                                    </button>

                                                    <div>
                                                        <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{pair.name}</p>
                                                        <p className="text-caption text-muted">{pair.category}</p>
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <span className="badge badge-cyan">Active</span>
                                                )}
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
