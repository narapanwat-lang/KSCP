import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  MapPin,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  RotateCcw,
  ShieldCheck,
  Send,
  User,
  Info,
  Check,
  Navigation,
  Plus,
  Trash2,
  Eye,
  Images,
  X,
} from 'lucide-react';
import { Employee, Checkpoint, SituationType, Report } from '../types.ts';
import { CameraModal } from './CameraModal.tsx';
import { fetchJson } from '../services/apiClient.ts';

interface GuardCheckinFormProps {
  onSuccess: (report: Report) => void;
  onRefreshReports: () => void;
  serverOffsetMs?: number;
}

export const GuardCheckinForm: React.FC<GuardCheckinFormProps> = ({
  onSuccess,
  onRefreshReports,
  serverOffsetMs = 0,
}) => {
  // Employee State
  const [employeeInput, setEmployeeInput] = useState('');
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Situation State
  const [situation, setSituation] = useState<SituationType | null>(null);
  const [incidentDescription, setIncidentDescription] = useState('');

  // Multi-Photo State
  const [photosBase64, setPhotosBase64] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // GPS State
  const [gpsLocation, setGpsLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsRequired, setGpsRequired] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReport, setSuccessReport] = useState<Report | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Load Employees and settings from backend
  useEffect(() => {
    fetchEmployees();
    fetchSystemConfig();
    const lastEmployee = localStorage.getItem('kscp_last_employee');
    if (lastEmployee) {
      setEmployeeInput(lastEmployee);
    }
  }, []);

  // Filter employee autocomplete
  useEffect(() => {
    if (!employeeInput.trim()) {
      setFilteredEmployees(employeesList);
    } else {
      const term = employeeInput.trim().toLowerCase();
      setFilteredEmployees(
        employeesList.filter((e) => e.full_name.toLowerCase().includes(term))
      );
    }
  }, [employeeInput, employeesList]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchEmployees = async () => {
    try {
      const data = await fetchJson<Employee[]>('/api/employees');
      setEmployeesList(data);
    } catch (e) {
      console.warn('Could not load employees list', e);
    }
  };

  const fetchSystemConfig = async () => {
    try {
      const data = await fetchJson<{ checkpoints: Checkpoint[]; gpsRequired: boolean }>('/api/checkpoints');
      setGpsRequired(Boolean(data.gpsRequired));
    } catch (e) {
      console.warn('Could not load config', e);
    }
  };

  const requestGpsLocation = () => {
    setIsGettingGps(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError('อุปกรณ์นี้ไม่รองรับการระบุพิกัด GPS');
      setIsGettingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setIsGettingGps(false);
      },
      (err) => {
        let msg = 'ไม่สามารถดึงตำแหน่งพิกัด GPS ได้';
        if (err.code === 1) {
          msg = 'ระบบไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง GPS (โปรดเปิดการระบุตำแหน่งในเบราว์เซอร์)';
        } else if (err.code === 2) {
          msg = 'สัญญาณ GPS ไม่พร้อมใช้งานในขณะนี้';
        } else if (err.code === 3) {
          msg = 'หมดเวลารอดึงพิกัด GPS';
        }
        setGpsError(msg);
        setIsGettingGps(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }
    );
  };

  const handleDeletePhoto = (indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotosBase64((prev) => prev.filter((_, idx) => idx !== indexToDelete));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Validation: Employee Name
    const cleanName = employeeInput.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setErrorMessage('กรุณาระบุชื่อ–นามสกุลพนักงาน');
      return;
    }

    // 2. Validation: Photos (At least 1 photo required, supports multiple)
    if (photosBase64.length === 0) {
      setErrorMessage('กรุณาถ่ายรูปรายงานตัวอย่างน้อย 1 รูป (สามารถถ่ายได้มากกว่า 1 รูป)');
      return;
    }

    // 3. Validation: Situation
    if (!situation) {
      setErrorMessage('กรุณาเลือกสถานการณ์ (ปกติ / ไม่ปกติ / ฉุกเฉิน)');
      return;
    }

    // 4. Validation: Incident description if abnormal or emergency
    if (situation !== 'normal') {
      if (!incidentDescription.trim()) {
        const label = situation === 'emergency' ? 'รายละเอียดเหตุฉุกเฉิน' : 'รายละเอียดเหตุการณ์';
        setErrorMessage(`กรุณาระบุ${label}ก่อนบันทึก`);
        return;
      }
    }

    // 5. Validation: GPS if strictly required
    if (gpsRequired && !gpsLocation) {
      setErrorMessage('ระบบเปิดใช้งานการตรวจสอบสถานที่จริง โปรดกดระบุตำแหน่ง GPS ก่อนบันทึก');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        employee_name: cleanName,
        situation,
        incident_description: situation !== 'normal' ? incidentDescription.trim() : '',
        photos_base64: photosBase64,
        photo_base64: photosBase64[0],
        latitude: gpsLocation?.lat ?? null,
        longitude: gpsLocation?.lng ?? null,
        gps_accuracy_m: gpsLocation?.accuracy ?? null,
        checkpoint_id: null,
      };

      const data = await fetchJson<{ success: boolean; report: Report }>('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Save employee name to local storage for quick selection next time
      localStorage.setItem('kscp_last_employee', cleanName);

      // Successfully saved
      setSuccessReport(data.report);
      onSuccess(data.report);
      onRefreshReports();
      fetchEmployees();

      // Reset photos and fields
      setPhotosBase64([]);
      setSituation(null);
      setIncidentDescription('');
    } catch (err: any) {
      setErrorMessage(err.message || 'ไม่สามารถบันทึกรายงานได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Success Confirmation Modal/Banner */}
      {successReport && (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 sm:p-5 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base sm:text-lg font-bold text-emerald-950">
                  บันทึกรายงานตัวสำเร็จ
                </h3>
                <span className="text-xs font-mono text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  {successReport.id}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-800 mt-1">
                บันทึกข้อมูลและรูปถ่ายประทับตราลงฐานข้อมูลเรียบร้อยแล้ว พนักงาน:{' '}
                <strong className="font-semibold text-emerald-950">
                  {successReport.employee_name_snapshot}
                </strong>
                {successReport.photo_urls && successReport.photo_urls.length > 1 && (
                  <span className="ml-1 font-semibold text-emerald-900">
                    (แนบรูปถ่ายทั้งหมด {successReport.photo_urls.length} รูป)
                  </span>
                )}
              </p>
              <div className="mt-2 text-xs text-emerald-900 bg-white/80 p-2.5 rounded-xl border border-emerald-200 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block">วันที่รายงาน (ไทย):</span>
                  <span className="font-mono font-medium">{successReport.report_date_th}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">เวลา (ไทย):</span>
                  <span className="font-mono font-medium">{successReport.report_time_th}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">สถานการณ์:</span>
                  <span className="font-medium">
                    {successReport.situation === 'normal'
                      ? 'ปกติ'
                      : successReport.situation === 'abnormal'
                      ? 'ไม่ปกติ'
                      : 'ฉุกเฉิน'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">สถานะ GPS:</span>
                  <span className="font-medium">
                    {successReport.gps_verification_status === 'passed'
                      ? 'ผ่านการยืนยัน'
                      : successReport.gps_verification_status === 'gps_disabled'
                      ? 'ไม่ได้เปิดระบบ GPS'
                      : 'ไม่ผ่านการยืนยัน'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSuccessReport(null)}
                className="mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
              >
                ปิดข้อความแจ้งเตือนนี้
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs sm:text-sm flex items-start gap-2 animate-in fade-in">
            <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* 1. Employee Name Input */}
        <div className="space-y-1.5" ref={dropdownRef}>
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-800" />
              <span>ชื่อ–นามสกุลพนักงาน</span>
              <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400">พิมพ์หรือเลือกจากรายชื่อ</span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={employeeInput}
              onChange={(e) => {
                setEmployeeInput(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="ระบุชื่อและนามสกุล เช่น สมชาย บุญมี"
              className="w-full px-3.5 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent text-sm sm:text-base text-slate-900 placeholder:text-slate-400 bg-white shadow-sm"
              autoComplete="off"
            />

            {/* Clear Button */}
            {employeeInput && (
              <button
                type="button"
                onClick={() => {
                  setEmployeeInput('');
                  setShowDropdown(true);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5 rounded cursor-pointer"
              >
                ล้าง
              </button>
            )}

            {/* Dropdown Suggestions */}
            {showDropdown && filteredEmployees.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-56 overflow-y-auto z-20 divide-y divide-slate-100">
                <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 bg-slate-50">
                  รายชื่อที่เคยบันทึกไว้ในระบบ
                </div>
                {filteredEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      setEmployeeInput(emp.full_name);
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium">{emp.full_name}</span>
                    <span className="text-[11px] text-slate-400">เลือก</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
            <Info className="w-3 h-3 text-slate-400 shrink-0" />
            <span>
              เมื่อบันทึกชื่อแล้วจะจัดเก็บในระบบเพื่อเลือกใช้ซ้ำได้อัตโนมัติ
            </span>
          </p>
        </div>

        {/* 2. Photo Attachment / Multi-Photo Camera */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-emerald-800" />
              <span>ถ่ายรูปรายงานตัว (ถ่ายได้มากกว่า 1 รูป)</span>
              <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              ประทับตราเวลาไทย, GPS & โลโก้
            </span>
          </div>

          {photosBase64.length > 0 ? (
            <div className="space-y-3 bg-slate-50 rounded-2xl p-3 sm:p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Images className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    รูปถ่ายที่แนบแล้ว ({photosBase64.length} รูป)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ถ่ายรูปเพิ่ม</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotosBase64([])}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-red-50 hover:text-red-700 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                    title="ล้างรูปทั้งหมด"
                  >
                    ล้างทั้งหมด
                  </button>
                </div>
              </div>

              {/* Gallery Grid of Photos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {photosBase64.map((photo, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-xl overflow-hidden bg-slate-950 border border-slate-300 shadow-sm aspect-4/3 flex items-center justify-center cursor-pointer"
                    onClick={() => setPreviewPhoto(photo)}
                  >
                    <img
                      src={photo}
                      alt={`ภาพที่ ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    
                    {/* Top index badge */}
                    <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20">
                      รูปที่ {idx + 1}
                    </div>

                    {/* View Icon on hover */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="bg-white/90 text-slate-900 p-1.5 rounded-full shadow">
                        <Eye className="w-4 h-4" />
                      </span>
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => handleDeletePhoto(idx, e)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-red-600/90 hover:bg-red-600 text-white shadow-md transition-colors cursor-pointer z-10"
                      title="ลบรูปนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-emerald-800 bg-emerald-100/70 py-2 px-3 rounded-xl border border-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  รูปภาพทุกรูปได้รับการประทับตราวัน-เวลาไทย, พิกัด GPS, และโลโก้กนกสุวรรณเรียบร้อยแล้ว
                </span>
              </div>
            </div>
          ) : (
            /* Big Photo Button when empty */
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-emerald-700/50 bg-emerald-50/50 hover:bg-emerald-50/90 hover:border-emerald-700 text-emerald-950 flex flex-col items-center justify-center gap-2.5 transition-all group shadow-2xs cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <Camera className="w-7 h-7" />
              </div>
              <div className="text-center">
                <span className="text-sm sm:text-base font-bold text-emerald-950 block">
                  กดถ่ายรูปรายงานตัว (ถ่ายได้มากกว่า 1 รูป)
                </span>
                <span className="text-xs text-slate-600 mt-1 block">
                  ระบบจะประทับตรา <strong>วัน-เวลาประเทศไทย, พิกัด GPS, และโลโก้กนกสุวรรณ</strong> ลงในรูปภาพอัตโนมัติ
                </span>
              </div>
            </button>
          )}
        </div>

        {/* 3. GPS Location Verification (No Checkpoint Required) */}
        <div className="space-y-2 bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-800" />
              <span>พิกัดสถานที่จริง (GPS)</span>
            </span>
            <button
              type="button"
              onClick={requestGpsLocation}
              disabled={isGettingGps}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-medium flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:border-emerald-300 transition-colors cursor-pointer"
            >
              <Navigation className={`w-3.5 h-3.5 ${isGettingGps ? 'animate-spin' : ''}`} />
              <span>{isGettingGps ? 'กำลังดึงพิกัด...' : 'ระบุพิกัด GPS'}</span>
            </button>
          </div>

          {/* GPS Status feedback */}
          {gpsLocation ? (
            <div className="text-xs text-emerald-800 bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-300 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-1 text-emerald-950">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                  <span>ระบุพิกัด GPS สำเร็จ</span>
                </div>
                <div className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                  ละติจูด: {gpsLocation.lat.toFixed(5)}, ลองจิจูด: {gpsLocation.lng.toFixed(5)} (ความแม่นยำ ±{gpsLocation.accuracy} ม.)
                </div>
              </div>
            </div>
          ) : gpsError ? (
            <div className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              {gpsError}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">
              {gpsRequired
                ? '⚠️ ระบบตั้งค่าให้ต้องยืนยันพิกัด GPS โปรดกดปุ่ม "ระบุพิกัด GPS" เพื่อความถูกต้อง'
                : 'สามารถกดปุ่ม "ระบุพิกัด GPS" เพื่อบันทึกตำแหน่งจริงลงในระบบและตราประทับ'}
            </div>
          )}
        </div>

        {/* 4. Situation Selection */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-800" />
            <span>สถานการณ์</span>
            <span className="text-red-500">*</span>
          </label>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Normal */}
            <button
              type="button"
              onClick={() => setSituation('normal')}
              className={`py-3 sm:py-3.5 px-2 rounded-xl border-2 font-medium text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                situation === 'normal'
                  ? 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-sm ring-1 ring-emerald-500'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckCircle
                className={`w-5 h-5 ${
                  situation === 'normal' ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span className="font-semibold">1. ปกติ</span>
            </button>

            {/* Abnormal */}
            <button
              type="button"
              onClick={() => setSituation('abnormal')}
              className={`py-3 sm:py-3.5 px-2 rounded-xl border-2 font-medium text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                situation === 'abnormal'
                  ? 'bg-amber-50 border-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-500'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  situation === 'abnormal' ? 'text-amber-600' : 'text-slate-400'
                }`}
              />
              <span className="font-semibold">2. ไม่ปกติ</span>
            </button>

            {/* Emergency */}
            <button
              type="button"
              onClick={() => setSituation('emergency')}
              className={`py-3 sm:py-3.5 px-2 rounded-xl border-2 font-medium text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                situation === 'emergency'
                  ? 'bg-red-50 border-red-600 text-red-950 shadow-sm ring-1 ring-red-600'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <AlertOctagon
                className={`w-5 h-5 ${
                  situation === 'emergency' ? 'text-red-600' : 'text-slate-400'
                }`}
              />
              <span className="font-semibold">3. ฉุกเฉิน</span>
            </button>
          </div>
        </div>

        {/* 5. Conditional Incident Description */}
        {situation === 'abnormal' && (
          <div className="space-y-1.5 animate-in fade-in duration-200">
            <label className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>รายละเอียดเหตุการณ์</span>
              <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              placeholder="โปรดระบุสิ่งที่เกิดขึ้น และรายละเอียดที่จำเป็น"
              className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs sm:text-sm text-slate-900 bg-amber-50/30"
              required
            />
          </div>
        )}

        {situation === 'emergency' && (
          <div className="space-y-1.5 animate-in fade-in duration-200 p-3 bg-red-50/80 rounded-xl border border-red-200">
            <label className="text-sm font-bold text-red-900 flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-red-600" />
              <span>รายละเอียดเหตุฉุกเฉิน (สำคัญ)</span>
              <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-red-700">
              กรณีฉุกเฉิน โปรดแจ้งหัวหน้าชุดหรือโทรศัพท์สายด่วนควบคู่กับการบันทึกรายงานนี้
            </p>
            <textarea
              rows={3}
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              placeholder="โปรดระบุสิ่งที่เกิดขึ้น และรายละเอียดที่จำเป็นโดยละเอียด"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-red-400 focus:outline-none focus:ring-2 focus:ring-red-600 text-xs sm:text-sm text-slate-900 bg-white"
              required
            />
          </div>
        )}

        {/* 6. Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[52px] sm:min-h-[56px] rounded-2xl bg-emerald-800 hover:bg-emerald-900 active:scale-[0.99] text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังบันทึกข้อมูลและส่งรายงาน...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5 text-amber-400" />
                <span>
                  บันทึกรายงานตัว {photosBase64.length > 0 ? `(${photosBase64.length} รูป)` : ''}
                </span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Camera Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onSavePhotos={(photos) => {
          setPhotosBase64(photos);
        }}
        currentPhotos={photosBase64}
        employeeName={employeeInput}
        locationDetails=""
        gpsLocation={gpsLocation}
        onUpdateGpsLocation={(coords) => setGpsLocation(coords)}
        serverOffsetMs={serverOffsetMs}
        situation={situation}
      />

      {/* Lightbox Preview Modal for Attached Photo */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 bg-slate-900 border-b border-slate-800 text-white">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-amber-300">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>ภาพถ่ายรายงานตัวที่ประทับตราแล้ว</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black">
              <img
                src={previewPhoto}
                alt="รูปตัวอย่างขนาดเต็ม"
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
