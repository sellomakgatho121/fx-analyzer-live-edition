'use client';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function StatsCard({ label, value, prefix = '', suffix = '', icon: Icon, variant = 'default', animate = true, onClick }) {
    const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    const isNumeric = !isNaN(numericValue);

    // Initialize state based on animation prop to avoid sync setState in effect
    // Initialize state. If animating, start at 0. If not, doesn't matter as we won't use it.
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        if (!animate || !isNumeric) return;

        const duration = 1000;
        const startTime = performance.now();
        const startValue = 0;

        let animationFrameId;

        const animateValue = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (numericValue - startValue) * easeOut;

            setDisplayValue(current);

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animateValue);
            }
        };

        animationFrameId = requestAnimationFrame(animateValue);

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [numericValue, animate, isNumeric]);

    const formatValue = () => {
        if (!isNumeric) return value;

        // Use numericValue directly if not animating, otherwise use animated displayValue
        const valToFormat = (!animate) ? numericValue : displayValue;

        if (suffix === '%') {
            return valToFormat.toFixed(1);
        }
        if (prefix === '$' || prefix === '+$') {
            return valToFormat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return Math.round(valToFormat).toLocaleString();
    };

    const variantClasses = {
        default: '',
        success: 'stat-value positive',
        danger: 'stat-value negative',
        info: 'text-cyan',
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={onClick ? { y: -4, boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.5)', cursor: 'pointer' } : {}}
            whileTap={onClick ? { scale: 0.98 } : {}}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="stat-card"
            onClick={onClick}
        >
            {Icon && (
                <div
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        opacity: 0.3,
                    }}
                >
                    <Icon size={32} />
                </div>
            )}
            <p className="stat-label">{label}</p>
            <p className={`stat-value ${variantClasses[variant] || ''}`}>
                {prefix}
                {formatValue()}
                {suffix}
            </p>
        </motion.div>
    );
}
