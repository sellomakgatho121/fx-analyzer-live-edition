const io = require('socket.io-client');

async function testEndToEnd() {
    console.log("🚀 Starting End-to-End Test Client...");

    const socket = io('http://localhost:4000');

    socket.on('connect', () => {
        console.log("✅ Connected to Backend WebSocket");
    });

    socket.on('ticker-update', (data) => {
        process.stdout.write("."); // heartbeat
    });

    socket.on('fx-signal', (signal) => {
        console.log("\n\n✨ RECEIVED SIGNAL FROM ENGINE VIA BACKEND ✨");
        console.log("===========================================");
        console.log(`Symbol: ${signal.symbol} | Action: ${signal.action}`);
        console.log(`Confidence: ${signal.confidence}`);
        console.log(`Reasoning: ${signal.ai_reasoning}`);
        console.log("===========================================\n");
        console.log("✅ Test Passed! Exiting...");
        process.exit(0);
    });

    socket.on('notification', (note) => {
        if (note.type === 'DAILY_BRIEFING') {
            console.log("\n📅 Daily Briefing Received (Engine Active)");
        }
    });

    // Timeout
    setTimeout(() => {
        console.log("\n❌ Test Timed Out (No signals received in 30s). Engine might be quiet or disconnected.");
        process.exit(1);
    }, 30000);
}

testEndToEnd();
