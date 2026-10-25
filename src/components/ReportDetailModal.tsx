import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  MapPin,
  ExternalLink,
  CheckCircle2,
  FileText,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { Report } from '../types.ts';
import {
  uploadPhotoToGoogleDrive,
  googleSignIn,
  getAccessToken,
  TARGET_FOLDER_NAME,
} from '../services/googleDrive.ts';

interface ReportDetailModalProps {
  report: Report | null;
  onClose: () => void;
  onReportUpdated?: (updated: Report) => void;
  isAdminLoggedIn?: boolean;
}

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
  report,
  onClose,
  onReportUpdated,
  isAdminLoggedIn = false,
}) => {
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [driveSuccess, setDriveSuccess] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [currentDriveLink, setCurrentDriveLink] = useState<string | null>(
    report?.drive_web_view_link || null
  );

  if (!report) return null;

  const handleSyncToDrive = async () => {
    setIsSyncingDrive(true);
    setDriveSuccess(null);
    setDriveError(null);

    try {
      let token = await getAccessToken();
      if (!token) {
        const signinRes = await googleSignIn();
        if (!signinRes) {
          throw new Error('กรุณาลงชื่อเข้าใช้ Google เพื่อซิงก์รูปภาพ');
        }
        token = signinRes.accessToken;
      }

      const uploadResult = await uploadPhotoToGoogleDrive(report);
      setCurrentDriveLink(uploadResult.webViewLink || null);
      setDriveSuccess(`ซิงก์รูปถ่ายเข้าโฟลเดอร์ "${TARGET_FOLDER_NAME}" บน Google Drive สำเร็จแล้ว`);

      if (onReportUpdated) {
        onReportUpdated({
          ...report,
          drive_file_id: uploadResult.fileId,
          drive_web_view_link: uploadResult.webViewLink,
          drive_synced_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setDriveError(err.message || 'ไม่สามารถซิงก์รูปไปยัง Google Drive ได้');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const situationConfig = {
    normal: {
      label: 'ปกติ',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      icon: ShieldCheck,
      color: 'text-emerald-700',
    },
    abnormal: {
      label: 'ไม่ปกติ',
      bg: 'bg-amber-50 text-amber-800 border-amber-300',
      icon: AlertTriangle,
      color: 'text-amber-700',
    },
    emergency: {
      label: 'ฉุกเฉิน',
      bg: 'bg-red-50 text-red-800 border-red-300',
      icon: AlertOctagon,
      color: 'text-red-700',
    },
  }[report.situation] || {
    label: report.situation,
    bg: 'bg-slate-50 text-slate-800 border-slate-300',
    icon: ShieldCheck,
    color: 'text-slate-700',
  };

  const SituationIcon = situationConfig.icon;

  const hasGps = typeof report.latitude === 'number' && typeof report.longitude === 'number';
  const googleMapsUrl = hasGps
    ? `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-950 text-white border-b border-emerald-900">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                รายละเอียดการรายงานตัว
              </h3>
              <p className="text-[11px] text-emerald-300 font-mono">
                รหัสรายการ: {report.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-emerald-900 transition-colors"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Guard Photo */}
          <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 flex items-center justify-center max-h-72 shadow-inner">
            <img
              src={report.photo_url}
              alt={`ภาพถ่ายของ ${report.employee_name_snapshot}`}
              className="max-h-72 w-auto max-w-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Employee Name */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">
                ชื่อ–นามสกุลพนักงาน
              </span>
              <span className="text-base font-bold text-slate-900">
                {report.employee_name_snapshot}
              </span>
            </div>
          </div>

          {/* Date & Time Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500 flex items-center gap-1 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>วันที่รายงาน (ไทย)</span>
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 block">
                {report.report_date_th}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {report.timezone || 'Asia/Bangkok'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500 flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>เวลาประเทศไทย</span>
              </span>
              <span className="text-sm font-bold font-mono text-emerald-950 block">
                {report.report_time_th}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                (UTC+07:00)
              </span>
            </div>
          </div>

          {/* UTC Verification Timestamp */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-500 block font-medium">เวลาสากลที่บันทึก (UTC Timestamp):</span>
            <span className="font-mono text-slate-800 break-all block mt-0.5 font-medium">
              {report.report_timestamp_utc}
            </span>
          </div>

          {/* Situation & Incident Description */}
          <div className={`p-3.5 rounded-xl border ${situationConfig.bg}`}>
            <div className="flex items-center gap-2">
              <SituationIcon className={`w-5 h-5 ${situationConfig.color} shrink-0`} />
              <div className="font-bold text-sm">
                สถานการณ์: {situationConfig.label}
              </div>
            </div>

            {report.incident_description && (
              <div className="mt-2.5 pt-2 border-t border-current/20 text-xs sm:text-sm">
                <span className="font-semibold block mb-0.5">รายละเอียดเหตุการณ์:</span>
                <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
                  {report.incident_description}
                </p>
              </div>
            )}
          </div>

          {/* Location & GPS Verification */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-800" />
                <span>ข้อมูลสถานที่จริงและ GPS</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  report.gps_verification_status === 'passed'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : report.gps_verification_status === 'gps_disabled'
                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-red-100 text-red-800 border-red-300'
                }`}
              >
                {report.gps_verification_status === 'passed'
                  ? 'ตรวจสอบผ่าน'
                  : report.gps_verification_status === 'gps_disabled'
                  ? 'ไม่ได้เปิดระบบ GPS'
                  : 'ไม่ผ่านการยืนยัน'}
              </span>
            </div>

            {report.checkpoint_name && (
              <div className="text-slate-700">
                จุดตรวจ: <strong className="font-semibold">{report.checkpoint_name}</strong>
              </div>
            )}

            {hasGps ? (
              <div className="space-y-1.5 pt-1">
                <div className="font-mono text-slate-600 text-[11px]">
                  พิกัด: {report.latitude?.toFixed(6)}, {report.longitude?.toFixed(6)}
                  {report.gps_accuracy_m && ` (ความแม่นยำ ±${report.gps_accuracy_m} ม.)`}
                </div>
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-800 hover:text-emerald-950 font-semibold underline text-xs"
                  >
                    <span>เปิดดูตำแหน่งบน Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-slate-500 italic">ไม่มีข้อมูลพิกัด GPS แนบมาในรายงานนี้</p>
            )}
          </div>

          {/* Google Drive Photo Sync Card - Only visible to Admins */}
          {isAdminLoggedIn && (
            <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-blue-700" />
                  <span>การซิงก์รูปถ่ายเข้า Google Drive</span>
                </span>
                <span className="text-[11px] text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded-full font-medium">
                  โฟลเดอร์: {TARGET_FOLDER_NAME}
                </span>
              </div>

              {driveSuccess && (
                <div className="text-emerald-800 bg-emerald-100/80 p-2 rounded-lg text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{driveSuccess}</span>
                </div>
              )}

              {driveError && (
                <div className="text-red-800 bg-red-100/80 p-2 rounded-lg text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>{driveError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {currentDriveLink ? (
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-800 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ซิงก์แล้ว</span>
                    </span>
                    <a
                      href={currentDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold underline text-xs"
                    >
                      <span>เปิดดูรูปใน Google Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <span className="text-slate-500">
                    รูปถ่ายนี้ยังไม่ได้ซิงก์ไปยัง Google Drive
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSyncToDrive}
                  disabled={isSyncingDrive}
                  className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-medium text-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                  <span>{isSyncingDrive ? 'กำลังซิงก์รูป...' : currentDriveLink ? 'ซิงก์ใหม่อีกครั้ง' : 'ซิงก์รูปนี้ไป Google Drive'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Record Status */}
          <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>สถานะรายการ: {report.record_status === 'synced' ? 'ซิงก์แล้ว' : 'บันทึกในฐานข้อมูล'}</span>
            <span>บันทึกเมื่อ: {new Date(report.created_at).toLocaleTimeString('th-TH')}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs sm:text-sm transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
