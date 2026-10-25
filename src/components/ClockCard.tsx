import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface ClockCardProps {
  serverOffsetMs?: number;
}

export const ClockCard: React.FC<ClockCardProps> = ({ serverOffsetMs = 0 }) => {
  const [timeState, setTimeState] = useState(() => calculateTimes(serverOffsetMs));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeState(calculateTimes(serverOffsetMs));
    }, 1000);
    return () => clearInterval(timer);
  }, [serverOffsetMs]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
              วันและเวลาประเทศไทย
            </h2>
            <p className="text-xs text-slate-500">เขตเวลา Asia/Bangkok (UTC+07:00)</p>
          </div>
        </div>

        {/* Live Indicator */}
        <div className="flex items-center gap-1.5 self-start sm:self-center text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium">เวลาจริงจากระบบ (Asia/Bangkok)</span>
        </div>
      </div>

      {/* Thailand Live Time Only */}
      <div className="pt-3">
        <div className="bg-slate-50/90 rounded-xl p-4 sm:p-5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              เวลาปัจจุบัน (ประเทศไทย)
            </span>
            <div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-emerald-950 tabular-nums mt-0.5">
              {timeState.timeTh}
            </div>
          </div>

          <div className="sm:text-right border-t sm:border-t-0 border-slate-200/60 pt-2 sm:pt-0">
            <div className="text-sm sm:text-base font-semibold text-slate-800">
              {timeState.thaiFormattedDate}
            </div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">
              วดป: <span className="font-medium text-slate-700">{timeState.dateTh}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function calculateTimes(serverOffsetMs: number) {
  const adjusted = new Date(Date.now() + serverOffsetMs);

  // Bangkok time
  const bkk = new Date(adjusted.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));

  const day = String(bkk.getDate()).padStart(2, '0');
  const month = String(bkk.getMonth() + 1).padStart(2, '0');
  const year = bkk.getFullYear();
  const dateTh = `${day}/${month}/${year}`;

  const hours = String(bkk.getHours()).padStart(2, '0');
  const minutes = String(bkk.getMinutes()).padStart(2, '0');
  const seconds = String(bkk.getSeconds()).padStart(2, '0');
  const timeTh = `${hours}:${minutes}:${seconds}`;

  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const thaiDays = [
    'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
  ];

  const thaiFormattedDate = `${thaiDays[bkk.getDay()]}ที่ ${bkk.getDate()} ${thaiMonths[bkk.getMonth()]} ${year + 543}`;

  // UTC
  const utcHours = String(adjusted.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(adjusted.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(adjusted.getUTCSeconds()).padStart(2, '0');
  const timeUtc = `${utcHours}:${utcMinutes}:${utcSeconds}`;
  const utcIso = adjusted.toISOString();

  return {
    dateTh,
    timeTh,
    thaiFormattedDate,
    timeUtc,
    utcIso,
  };
}
