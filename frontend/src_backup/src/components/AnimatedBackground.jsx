
"use client";
import { useEffect, useRef } from 'react';

const AnimatedBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resize);
        resize();

        // Configuration
        const stars = [];
        const numStars = 150;

        // Initialize stars
        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2,
                speed: Math.random() * 0.2 + 0.05,
                opacity: Math.random(),
                direction: Math.random() > 0.5 ? 1 : -1
            });
        }

        const draw = () => {
            ctx.fillStyle = '#020202'; // --bg-void
            ctx.fillRect(0, 0, canvas.width, canvas.height); // Clear screen

            // Draw subtle noise/fog (optional, simulated with gradient)
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 0,
                canvas.width / 2, canvas.height / 2, canvas.width
            );
            gradient.addColorStop(0, '#0a0a0a');
            gradient.addColorStop(1, '#020202');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#ffffff';

            stars.forEach(star => {
                // Move stars
                star.y -= star.speed;
                star.opacity += 0.005 * star.direction;

                // Reset if out of bounds or opacity limits
                if (star.y < 0) {
                    star.y = canvas.height;
                    star.x = Math.random() * canvas.width;
                }

                if (star.opacity > 0.6 || star.opacity < 0.1) {
                    star.direction *= -1;
                }

                ctx.globalAlpha = star.opacity * 0.5; // Very subtle
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;

                // Draw connecting lines if close
                /*
                stars.forEach(otherStar => {
                    const dx = star.x - otherStar.x;
                    const dy = star.y - otherStar.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 100) {
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 * (1 - distance / 100)})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(star.x, star.y);
                        ctx.lineTo(otherStar.x, otherStar.y);
                        ctx.stroke();
                    }
                });
                */
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed top-0 left-0 w-full h-full -z-50 pointer-events-none"
            style={{ background: 'var(--bg-void)' }}
        />
    );
};

export default AnimatedBackground;
