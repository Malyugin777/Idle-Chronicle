'use client';

import { useState, useEffect } from 'react';
import type { ActiveBuff } from '../types';
import { BUFF_ICONS, BUFF_DURATIONS } from '../constants';

interface BuffIconProps {
  buff: ActiveBuff;
}

export default function BuffIcon({ buff }: BuffIconProps) {
  const [remaining, setRemaining] = useState(0);
  const duration = BUFF_DURATIONS[buff.type] || 30000;

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, buff.expiresAt - Date.now()));
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [buff.expiresAt]);

  const percent = (remaining / duration) * 100;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="relative w-9 h-9">
      {/* SVG circular progress */}
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r={radius}
          fill="rgba(0,0,0,0.7)"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="2"
        />
        <circle
          cx="18" cy="18" r={radius}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-100"
        />
      </svg>
      {/* Icon centered */}
      <span className="absolute inset-0 flex items-center justify-center text-lg">
        {BUFF_ICONS[buff.type]}
      </span>
    </div>
  );
}
