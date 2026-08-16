const io = require('socket.io-client');

const socket = io('http://127.0.0.1:4000');

console.log('Connecting to server...');

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('connect_error', (err) => {
    console.log('Connection error:', err.message);
});

socket.on('fx-signal', (signal) => {
    console.log('Received signal:', JSON.stringify(signal, null, 2));
    socket.disconnect(); // Verify one signal then exit
});

socket.on('ticker-update', (data) => {
    // console.log('Ticker received (suppressed)');
});

setTimeout(() => {
    console.log('Timeout waiting for signal');
    socket.disconnect();
}, 20000);
