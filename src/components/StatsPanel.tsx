import React from 'react';
import { motion } from 'framer-motion';

interface StatsPanelProps {
  total: number;
  bestStreak: number;
  highestDay: number;
  average: number;
}

export function StatsPanel({
  total,
  bestStreak,
  highestDay,
  average
}: StatsPanelProps) {
  const stats = [
    { label: 'Total', value: total.toLocaleString() },
    { label: 'Best Streak', value: `${bestStreak} days` },
    { label: 'Highest Day', value: highestDay.toLocaleString() },
    { label: 'Average', value: average.toFixed(2) }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="bg-black/80 backdrop-blur-md border border-white/20 p-5 md:p-6 w-full lg:w-56 pointer-events-auto"
    >
      <h2
        className="text-xl md:text-2xl font-bold text-white mb-6 tracking-tight"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        CONTRIBUTION STATS
      </h2>

      <div className="space-y-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
            className="flex justify-between items-baseline"
          >
            <span
              className="text-sm text-white/60 uppercase tracking-wider"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {stat.label}
            </span>
            <span
              className="text-2xl md:text-3xl font-bold text-white"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {stat.value}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
