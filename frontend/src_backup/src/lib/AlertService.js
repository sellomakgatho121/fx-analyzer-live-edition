export const AlertService = {
    playSignalAlert: (confidence) => {
        if (typeof window === 'undefined') return;

        // Only alert for high confidence > 0.8
        if (confidence < 0.8) return;

        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            // Sci-fi ping sound
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, context.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, context.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0.3, context.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);

            oscillator.start();
            oscillator.stop(context.currentTime + 0.5);
        } catch (e) {
            console.error("Audio play failed", e);
        }
    }
};
