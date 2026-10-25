import React, { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  RefreshCw,
  Download,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  X,
} from 'lucide-react';
import { Report } from '../types.ts';
import { ReportDetailModal } from './ReportDetailModal.tsx';
import { fetchJson } from '../services/apiClient.ts';

interface ReportsTableProps {
  onExportCsv?: () => void;
  isAdminLoggedIn?: boolean;
}

export const ReportsTable: React.FC<ReportsTableProps> = ({
  onExportCsv,
  isAdminLoggedIn = false,
}) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Detail Modal
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const fetchReports = async (pageToFetch = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeSearch) params.set('q', activeSearch);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', String(pageToFetch));
      params.set('limit', '15');

      const data = await fetchJson<{
        reports: Report[];
        totalPages: number;
        total: number;
        page: number;
      }>(`/api/reports?${params.toString()}`);

      setReports(data.reports || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
      setPage(data.page || 1);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(page);
  }, [activeSearch, startDate, endDate, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
    setPage(1);
  };

  const handleClearDateFilter = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* 1. Search Bar & 2. Search Button & 3. Actions Menu */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาตามชื่อพนักงาน, วันที่, เวลา หรือจุดตรวจ..."
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            {searchTerm && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search Button */}
            <button
              type="submit"
              className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>ค้นหา</span>
            </button>

            {/* Actions Menu Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 border border-slate-200"
              >
                <Filter className="w-3.5 h-3.5 text-slate-600" />
                <span>การดำเนินการ (Actions)</span>
              </button>

              {/* Dropdown Menu */}
              {showActionsMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 divide-y divide-slate-100 animate-in fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionsMenu(false);
                      setShowDateFilter(!showDateFilter);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span>เลือกช่วงวันที่</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowActionsMenu(false);
                      fetchReports(page);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                    <span>รีเฟรชข้อมูล</span>
                  </button>

                  {isAdminLoggedIn && onExportCsv && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionsMenu(false);
                        onExportCsv();
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-emerald-800 font-medium hover:bg-emerald-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4 text-emerald-700" />
                      <span>ส่งออก CSV</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Date Filter Bar */}
        {showDateFilter && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-600">ช่วงวันที่:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
            />
            <span className="text-slate-400">ถึง</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleClearDateFilter}
                className="text-xs text-red-600 hover:underline px-1"
              >
                ล้างช่วงวัน
              </button>
            )}
          </div>
        )}

        {/* Active filter tags */}
        {(activeSearch || startDate || endDate) && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
            <span>ตัวกรองที่ใช้งาน:</span>
            {activeSearch && (
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                "{activeSearch}"
              </span>
            )}
            {startDate && (
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                จาก {startDate}
              </span>
            )}
            {endDate && (
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                ถึง {endDate}
              </span>
            )}
            <button
              onClick={() => {
                handleClearSearch();
                handleClearDateFilter();
              }}
              className="text-emerald-700 hover:underline ml-1"
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}
      </div>

      {/* 4. Reports Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Table Summary Bar */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="font-semibold text-slate-900">
            ตารางบันทึกเวลารายงานตัว ({totalCount} รายการ)
          </div>
          <div className="text-slate-500">เรียงจากใหม่ไปเก่าตามเวลาจริง</div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-xs">กำลังโหลดข้อมูลรายงาน...</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-red-600 px-4">
            <p className="text-sm font-medium">{error}</p>
            <button
              onClick={() => fetchReports(page)}
              className="mt-3 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700"
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800">
              {activeSearch || startDate || endDate
                ? 'ไม่พบข้อมูลรายงานที่ตรงกับคำค้นหา'
                : 'ยังไม่มีประวัติการรายงานตัวในระบบ'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {activeSearch || startDate || endDate
                ? 'ลองปรับเปลี่ยนคำค้นหาหรือล้างตัวกรองวันที่เพื่อดูรายงานทั้งหมด'
                : 'เมื่อพนักงานทำการรายงานตัว รายการจะถูกบันทึกและแสดงในตารางนี้โดยอัตโนมัติ'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3 sm:px-4">วดป.</th>
                  <th className="py-3 px-3 sm:px-4">เวลา</th>
                  <th className="py-3 px-3 sm:px-4">พนักงาน</th>
                  <th className="py-3 px-2 sm:px-4 text-center">สถานการณ์</th>
                  <th className="py-3 px-3 sm:px-4 text-center">ดูรายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {reports.map((r) => {
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      {/* วดป. */}
                      <td className="py-3.5 px-3 sm:px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {r.report_date_th}
                      </td>

                      {/* เวลา */}
                      <td className="py-3.5 px-3 sm:px-4 font-mono font-semibold text-emerald-950 whitespace-nowrap">
                        {r.report_time_th}
                      </td>

                      {/* พนักงาน */}
                      <td className="py-3.5 px-3 sm:px-4 font-medium text-slate-800 max-w-[140px] truncate">
                        {r.employee_name_snapshot}
                      </td>

                      {/* สถานการณ์ */}
                      <td className="py-3.5 px-2 sm:px-4 text-center whitespace-nowrap">
                        {r.situation === 'normal' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>ปกติ</span>
                          </span>
                        ) : r.situation === 'abnormal' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>ไม่ปกติ</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                            <AlertOctagon className="w-3 h-3 text-red-600" />
                            <span>ฉุกเฉิน</span>
                          </span>
                        )}
                      </td>

                      {/* ดูรายละเอียด (Eye Icon Button) */}
                      <td className="py-3.5 px-3 sm:px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedReport(r)}
                          className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 hover:border-emerald-300 font-medium text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="กดดูรายละเอียดและรูปถ่าย"
                          aria-label={`ดูรายละเอียดรายงานของ ${r.employee_name_snapshot}`}
                        >
                          <Eye className="w-4 h-4 text-emerald-700" />
                          <span className="hidden sm:inline">ดูรายละเอียด</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              หน้า {page} จาก {totalPages} (ทั้งหมด {totalCount} รายการ)
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors"
                title="หน้าก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors"
                title="หน้าถัดไป"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Report Detail Modal */}
      <ReportDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onReportUpdated={(updated) => {
          setSelectedReport(updated);
          fetchReports(page);
        }}
        isAdminLoggedIn={isAdminLoggedIn}
      />
    </div>
  );
};
