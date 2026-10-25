import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { ClockCard } from './components/ClockCard.tsx';
import { GuardCheckinForm } from './components/GuardCheckinForm.tsx';
import { ReportsTable } from './components/ReportsTable.tsx';
import { AdminModal } from './components/AdminModal.tsx';
import { Report } from './types.ts';
import { fetchJson } from './services/apiClient.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'checkin' | 'reports'>('checkin');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return sessionStorage.getItem('kscp_admin_token') || null;
  });
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Sync time with server on mount
  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const start = Date.now();
        const data = await fetchJson<{ timestamp: number }>('/api/time');
        const latency = Math.round((Date.now() - start) / 2);
        const serverTime = data.timestamp + latency;
        setServerOffsetMs(serverTime - Date.now());
      } catch (err) {
        console.warn('Could not sync with server time, using local clock', err);
      }
    };

    fetchServerTime();
    const interval = setInterval(fetchServerTime, 5 * 60 * 1000); // re-sync every 5 mins
    return () => clearInterval(interval);
  }, []);

  const handleAdminLoginSuccess = (token: string) => {
    setAdminToken(token);
    sessionStorage.setItem('kscp_admin_token', token);
  };

  const handleAdminLogout = () => {
    setAdminToken(null);
    sessionStorage.removeItem('kscp_admin_token');
    setIsAdminOpen(false);
  };

  const handleReportCreated = (report: Report) => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70 text-slate-800">
      {/* App Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenAdmin={() => setIsAdminOpen(true)}
        isAdminLoggedIn={Boolean(adminToken)}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-4">
        {currentTab === 'checkin' ? (
          <>
            {/* Live Thailand Time Card */}
            <ClockCard serverOffsetMs={serverOffsetMs} />

            {/* Guard Check-in Form */}
            <GuardCheckinForm
              onSuccess={handleReportCreated}
              onRefreshReports={() => setRefreshKey((k) => k + 1)}
              serverOffsetMs={serverOffsetMs}
            />
          </>
        ) : (
          <>
            {/* Reports Table View (Modeled after user's reference) */}
            <ReportsTable
              key={refreshKey}
              onExportCsv={() => setIsAdminOpen(true)}
              isAdminLoggedIn={Boolean(adminToken)}
            />
          </>
        )}
      </main>

      {/* Admin Control Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        adminToken={adminToken}
        onLoginSuccess={handleAdminLoginSuccess}
        onLogout={handleAdminLogout}
      />

      {/* Quiet Corporate Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-500">
          <p className="font-medium text-slate-700">
            ระบบรายงานตัวและบันทึกเวลาพนักงานรักษาความปลอดภัย — KSCP (KANOKSUWUN CHECK POINT)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            สงวนลิขสิทธิ์ บริษัท รักษาความปลอดภัย กนกสุวรรณ และ การจัดการความสะดวก จำกัด · เขตเวลาประเทศไทย Asia/Bangkok (UTC+07:00)
          </p>
        </div>
      </footer>
    </div>
  );
}
