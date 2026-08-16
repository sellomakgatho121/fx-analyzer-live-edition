"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const MOCK_EVENTS = [
    { id: 1, date: '2026-02-06', time: '13:30', currency: 'USD', event: 'Non-Farm Employment Change', impact: 'High', actual: '', forecast: '180K', previous: '216K' },
    { id: 2, date: '2026-02-06', time: '13:30', currency: 'USD', event: 'Unemployment Rate', impact: 'High', actual: '', forecast: '3.7%', previous: '3.7%' },
    { id: 3, date: '2026-02-13', time: '13:30', currency: 'USD', event: 'CPI m/m', impact: 'High', actual: '', forecast: '0.3%', previous: '0.3%' },
    { id: 4, date: '2026-02-21', time: '19:00', currency: 'USD', event: 'FOMC Meeting Minutes', impact: 'High', actual: '', forecast: '', previous: '' },
    { id: 5, date: '2026-02-28', time: '13:30', currency: 'USD', event: 'Prelim GDP q/q', impact: 'Medium', actual: '', forecast: '3.2%', previous: '4.9%' },
];

export default function EconomicCalendar() {
    const [events, setEvents] = useState([]);

    useEffect(() => {
        // Simulating API fetch
        setEvents(MOCK_EVENTS);
    }, []);

    const getImpactColor = (impact) => {
        switch (impact) {
            case 'High': return 'text-red-500 shadow-red-500/50';
            case 'Medium': return 'text-yellow-500 shadow-yellow-500/50';
            case 'Low': return 'text-green-500 shadow-green-500/50';
            default: return 'text-gray-500';
        }
    };

    return (
        <div className="p-6 bg-black/60 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl">
            <h2 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent mb-4">
                Economic Calendar
            </h2>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs uppercase bg-white/5 text-gray-300">
                        <tr>
                            <th className="px-4 py-3 rounded-l-lg">Time (GMT)</th>
                            <th className="px-4 py-3">Cur</th>
                            <th className="px-4 py-3">Event</th>
                            <th className="px-4 py-3">Impact</th>
                            <th className="px-4 py-3 rounded-r-lg">Forecast</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event, index) => (
                            <motion.tr
                                key={event.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                                <td className="px-4 py-3 text-white font-mono">{event.date} {event.time}</td>
                                <td className="px-4 py-3 font-bold text-gray-200">{event.currency}</td>
                                <td className="px-4 py-3 text-white">{event.event}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 text-xs font-bold border border-current rounded-md ${getImpactColor(event.impact)}`}>
                                        {event.impact}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-mono">{event.forecast}</td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 text-xs text-center text-gray-600">
                * Data simulated for MVP. Integration with ForexFactory API pending.
            </div>
        </div>
    );
}
