import React from 'react';
import { Shield, Clock, FileSpreadsheet, Lock } from 'lucide-react';
import officialLogo from '../assets/images/kanoksuwan_logo.jpg';

interface HeaderProps {
  currentTab: 'checkin' | 'reports';
  onSelectTab: (tab: 'checkin' | 'reports') => void;
  onOpenAdmin: () => void;
  isAdminLoggedIn: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenAdmin,
  isAdminLoggedIn,
}) => {
  return (
    <header className="bg-emerald-950 text-white shadow-md border-b-2 border-amber-500/80 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
          {/* Brand zone */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-amber-400 shadow-sm shrink-0 bg-emerald-950 p-0.5">
              <img
                src={officialLogo}
                alt="โลโก้บริษัท กนกสุวรรณ แฟซิลิตี้ แมเนจเม้นท์ จำกัด KSCP"
                className="w-full h-full object-contain rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-bold tracking-wide text-base sm:text-lg leading-tight">
                  KSCP
                </span>
                <span className="text-emerald-300 text-xs sm:text-sm font-medium tracking-normal">
                  — KANOKSUWUN CHECK POINT
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAdmin}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isAdminLoggedIn
                  ? 'bg-amber-500 text-emerald-950 border-amber-400 shadow-sm'
                  : 'bg-emerald-900/80 text-amber-300 border-amber-500/40 hover:bg-emerald-800'
              }`}
              title="เข้าสู่ระบบผู้ดูแลระบบ"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isAdminLoggedIn ? 'แอดมิน (เข้าสู่ระบบแล้ว)' : 'แอดมิน'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-t border-emerald-800/80 -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            onClick={() => onSelectTab('checkin')}
            className={`flex-1 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
              currentTab === 'checkin'
                ? 'border-amber-400 text-amber-300 bg-emerald-900/50'
                : 'border-transparent text-emerald-200/80 hover:text-white hover:bg-emerald-900/30'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>รายงานตัวพนักงาน</span>
          </button>
          <button
            onClick={() => onSelectTab('reports')}
            className={`flex-1 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
              currentTab === 'reports'
                ? 'border-amber-400 text-amber-300 bg-emerald-900/50'
                : 'border-transparent text-emerald-200/80 hover:text-white hover:bg-emerald-900/30'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>ตารางรายงานตัว</span>
          </button>
        </div>
      </div>
    </header>
  );
};
