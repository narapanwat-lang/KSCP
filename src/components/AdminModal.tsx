import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Lock,
  Unlock,
  Key,
  Users,
  MapPin,
  FileSpreadsheet,
  Settings,
  Shield,
  Download,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  HardDrive,
  FolderArchive,
  Clock,
  Eye,
  Image as ImageIcon,
  Calendar,
  Filter,
  CheckSquare,
  Square,
  Search,
  Cloud,
  ArrowDownToLine,
  Archive,
  Info,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  Employee,
  Checkpoint,
  SystemSettings,
  SyncLog,
  SystemStatus,
  Report,
  PhotoArchiveReport,
  PhotoArchiveStats,
} from '../types.ts';
import officialLogo from '../assets/images/kanoksuwan_logo.jpg';
import { User } from 'firebase/auth';
import {
  googleSignIn,
  logoutGoogle,
  initAuth,
  getAccessToken,
  getCurrentUser,
  getOrCreateTargetFolder,
  syncReportsToGoogleDrive,
  TARGET_FOLDER_NAME,
} from '../services/googleDrive.ts';


interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminToken: string | null;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  adminToken,
  onLoginSuccess,
  onLogout,
}) => {
  // Login State
  const [passcodeInput, setPasscodeInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active Admin Tab
  const [activeTab, setActiveTab] = useState<
    'photo_archive' | 'export_sheets' | 'employees' | 'checkpoints' | 'settings'
  >('photo_archive');

  // Photo Archive States (30-day retention folder)
  const [photoArchiveReports, setPhotoArchiveReports] = useState<PhotoArchiveReport[]>([]);
  const [photoArchiveStats, setPhotoArchiveStats] = useState<PhotoArchiveStats | null>(null);
  const [isPhotoArchiveLoading, setIsPhotoArchiveLoading] = useState(false);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [archiveFilterRetention, setArchiveFilterRetention] = useState<
    'within_30' | 'expiring_soon' | 'not_synced' | 'all'
  >('within_30');
  const [archiveFilterGuard, setArchiveFilterGuard] = useState('all');
  const [archiveFilterDate, setArchiveFilterDate] = useState('');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoArchiveReport | null>(null);
  const [singleDriveSyncingId, setSingleDriveSyncingId] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Admin Data States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingEmployeeName, setEditingEmployeeName] = useState('');

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [newCpName, setNewCpName] = useState('');
  const [newCpLat, setNewCpLat] = useState('');
  const [newCpLng, setNewCpLng] = useState('');
  const [newCpRadius, setNewCpRadius] = useState('100');

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [sheetsUrlInput, setSheetsUrlInput] = useState('');
  const [gpsRequiredInput, setGpsRequiredInput] = useState(false);
  const [autoSyncInput, setAutoSyncInput] = useState(false);
  const [companyNameInput, setCompanyNameInput] = useState('');
  const [newPasscodeInput, setNewPasscodeInput] = useState('');
  const [confirmPasscodeInput, setConfirmPasscodeInput] = useState('');

  // CSV Export Filter states
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportSituation, setExportSituation] = useState('all');

  // Google Sheets sync states
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Google Drive state
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [isDriveAuthLoading, setIsDriveAuthLoading] = useState(false);
  const [driveFolderLink, setDriveFolderLink] = useState<string | null>(null);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveSyncProgress, setDriveSyncProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [driveSyncResult, setDriveSyncResult] = useState<{
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [reportsForSync, setReportsForSync] = useState<Report[]>([]);

  // System Status
  const [systemHealth, setSystemHealth] = useState<SystemStatus | null>(null);
  const [appScriptTemplate, setAppScriptTemplate] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [saveSettingsSuccess, setSaveSettingsSuccess] = useState<string | null>(null);
  const [saveSettingsError, setSaveSettingsError] = useState<string | null>(null);

  // Initialize Google Drive Auth Listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setDriveUser(user);
        getOrCreateTargetFolder()
          .then((folder) => {
            setDriveFolderLink(folder.webViewLink || null);
          })
          .catch(() => {});
      },
      () => {
        setDriveUser(null);
        setDriveFolderLink(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (adminToken && isOpen) {
      loadAdminData();
    }
  }, [adminToken, isOpen, activeTab]);

  const loadAdminData = async () => {
    if (!adminToken) return;

    const headers = { Authorization: `Bearer ${adminToken}` };

    try {
      // 1. Settings & Health
      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setSystemHealth(hData);
      }

      const settingsRes = await fetch('/api/admin/settings', { headers });
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setSettings(sData);
        setSheetsUrlInput(sData.google_sheets_url || '');
        setGpsRequiredInput(Boolean(sData.gps_required));
        setAutoSyncInput(Boolean(sData.auto_sync_sheets));
        setCompanyNameInput(sData.company_name || 'บริษัท รักษาความปลอดภัย กนกสุวรรณ และ การจัดการความสะดวก จำกัด');
      }

      // Always fetch photo archive statistics for the badge
      const archiveRes = await fetch('/api/admin/photo-archive', { headers });
      if (archiveRes.ok) {
        const aData = await archiveRes.json();
        setPhotoArchiveReports(aData.reports || []);
        setPhotoArchiveStats(aData.stats || null);
      }

      // 2. Tab Specific Data
      if (activeTab === 'employees') {
        const empRes = await fetch('/api/admin/employees', { headers });
        if (empRes.ok) setEmployees(await empRes.json());
      } else if (activeTab === 'checkpoints') {
        const cpRes = await fetch('/api/admin/checkpoints', { headers });
        if (cpRes.ok) setCheckpoints(await cpRes.json());
      } else if (activeTab === 'export_sheets') {
        const logsRes = await fetch('/api/admin/sync/logs', { headers });
        if (logsRes.ok) setSyncLogs(await logsRes.json());

        const tmplRes = await fetch('/api/admin/google-script-template', { headers });
        if (tmplRes.ok) setAppScriptTemplate(await tmplRes.text());

        // Also fetch all reports for Drive photo sync
        const repRes = await fetch('/api/reports?limit=500');
        if (repRes.ok) {
          const repData = await repRes.json();
          setReportsForSync(repData.reports || []);
        }
      }
    } catch (e) {
      console.error('Failed to load admin data', e);
    }
  };

  // Filtered Archive Photos based on search, retention period, guard, and date
  const filteredArchiveReports = useMemo(() => {
    return photoArchiveReports.filter((item) => {
      // 1. Search Query
      if (archiveSearchQuery.trim()) {
        const q = archiveSearchQuery.toLowerCase().trim();
        const matchName = item.employee_name_snapshot.toLowerCase().includes(q);
        const matchCp = (item.checkpoint_name || '').toLowerCase().includes(q);
        const matchDate = item.report_date_th.includes(q);
        const matchTime = item.report_time_th.includes(q);
        if (!matchName && !matchCp && !matchDate && !matchTime) return false;
      }

      // 2. Retention Filter
      if (archiveFilterRetention === 'within_30') {
        if (item.is_expired) return false;
      } else if (archiveFilterRetention === 'expiring_soon') {
        if (item.is_expired || item.remaining_days > 5) return false;
      } else if (archiveFilterRetention === 'not_synced') {
        if (item.drive_file_id || item.drive_synced_at) return false;
      }

      // 3. Guard Filter
      if (archiveFilterGuard !== 'all') {
        if (item.employee_name_snapshot !== archiveFilterGuard) return false;
      }

      // 4. Date Filter
      if (archiveFilterDate) {
        const [y, m, d] = archiveFilterDate.split('-');
        const formatted = `${d}/${m}/${y}`;
        if (item.report_date_th !== formatted) return false;
      }

      return true;
    });
  }, [
    photoArchiveReports,
    archiveSearchQuery,
    archiveFilterRetention,
    archiveFilterGuard,
    archiveFilterDate,
  ]);

  // Unique list of guards for filter dropdown
  const uniqueArchiveGuards = useMemo(() => {
    const set = new Set<string>();
    for (const r of photoArchiveReports) {
      if (r.employee_name_snapshot) set.add(r.employee_name_snapshot);
    }
    return Array.from(set).sort();
  }, [photoArchiveReports]);

  // Selection handlers
  const handleToggleSelectPhoto = (id: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllVisiblePhotos = () => {
    if (selectedPhotoIds.size === filteredArchiveReports.length && filteredArchiveReports.length > 0) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(filteredArchiveReports.map((r) => r.id)));
    }
  };

  // Download single photo
  const handleDownloadSinglePhoto = async (rep: PhotoArchiveReport) => {
    try {
      const res = await fetch(rep.photo_url);
      if (!res.ok) throw new Error('ไม่สามารถดึงรูปภาพได้');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateClean = rep.report_date_th.replace(/\//g, '-');
      const timeClean = rep.report_time_th.replace(/:/g, '-');
      const guardClean = rep.employee_name_snapshot.replace(/\s+/g, '_');
      const cpClean = (rep.checkpoint_name || 'จุดตรวจ').replace(/\s+/g, '_');
      a.download = `KSCP_รูปรายงานตัว_${dateClean}_${timeClean}_${guardClean}_${cpClean}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดรูป: ' + err.message);
    }
  };

  // Batch download selected photos as .ZIP
  const handleBatchDownloadZip = async () => {
    const targetReports = filteredArchiveReports.filter((r) => selectedPhotoIds.has(r.id));
    if (targetReports.length === 0) {
      alert('กรุณาเลือกรูปภาพอย่างน้อย 1 รูปที่ต้องการเซฟย้อนหลังเป็นไฟล์ ZIP');
      return;
    }

    setIsDownloadingZip(true);
    setZipProgress(`กำลังเตรียมดาวน์โหลด 0/${targetReports.length}...`);

    try {
      const zip = new JSZip();
      const folder = zip.folder('รวมรูปถ่ายรปภ_ย้อนหลัง30วัน');

      for (let i = 0; i < targetReports.length; i++) {
        const rep = targetReports[i];
        setZipProgress(`กำลังโหลดรูปที่ ${i + 1}/${targetReports.length} (${rep.employee_name_snapshot})...`);
        try {
          const res = await fetch(rep.photo_url);
          if (res.ok) {
            const blob = await res.blob();
            const dateClean = rep.report_date_th.replace(/\//g, '-');
            const timeClean = rep.report_time_th.replace(/:/g, '-');
            const guardClean = rep.employee_name_snapshot.replace(/\s+/g, '_');
            const cpClean = (rep.checkpoint_name || 'จุดตรวจ').replace(/\s+/g, '_');
            const fileName = `${dateClean}_${timeClean}_${guardClean}_${cpClean}.jpg`;
            folder?.file(fileName, blob);
          }
        } catch (itemErr) {
          console.warn('Failed to fetch photo for zip:', rep.id, itemErr);
        }
      }

      setZipProgress('กำลังบีบอัดไฟล์ ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      a.download = `KSCP_รูปถ่ายรปภ_ย้อนหลัง30วัน_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setArchiveNotice({
        type: 'success',
        message: `ดาวน์โหลดรูปภาพย้อนหลังสำเร็จ ${targetReports.length} รูปเรียบร้อยแล้ว`,
      });
      setTimeout(() => setArchiveNotice(null), 5000);
    } catch (err: any) {
      setArchiveNotice({
        type: 'error',
        message: 'ดาวน์โหลดไฟล์ ZIP ไม่สำเร็จ: ' + err.message,
      });
    } finally {
      setIsDownloadingZip(false);
      setZipProgress(null);
    }
  };

  // Sync selected photos to Google Drive folder
  const handleSyncSelectedToDrive = async () => {
    if (!driveUser) {
      await handleGoogleDriveSignIn();
      return;
    }

    const targetReports = filteredArchiveReports.filter((r) => selectedPhotoIds.has(r.id));
    if (targetReports.length === 0) {
      alert('กรุณาเลือกรูปภาพที่ต้องการซิงก์ไปยัง Google Drive อย่างน้อย 1 รูป');
      return;
    }

    const confirmed = window.confirm(
      `ต้องการซิงก์รูปถ่ายที่เลือกจำนวน ${targetReports.length} รูป ไปยังโฟลเดอร์ "${TARGET_FOLDER_NAME}" บน Google Drive ใช่หรือไม่?`
    );
    if (!confirmed) return;

    setDriveSyncing(true);
    setDriveError(null);
    try {
      const result = await syncReportsToGoogleDrive(targetReports, (current, total, name) => {
        setDriveSyncProgress({ current, total, name });
      });
      setArchiveNotice({
        type: 'success',
        message: `ซิงก์รูปย้อนหลังไปยัง Google Drive สำเร็จ ${result.successCount} รูป`,
      });
      setTimeout(() => setArchiveNotice(null), 5000);
      loadAdminData();
    } catch (err: any) {
      setArchiveNotice({
        type: 'error',
        message: err.message || 'ซิงก์รูปภาพไปยัง Google Drive ไม่สำเร็จ',
      });
    } finally {
      setDriveSyncing(false);
      setDriveSyncProgress(null);
    }
  };

  // Sync single photo to Google Drive
  const handleSyncSinglePhotoToDrive = async (rep: PhotoArchiveReport) => {
    if (!driveUser) {
      await handleGoogleDriveSignIn();
      return;
    }

    setSingleDriveSyncingId(rep.id);
    try {
      await syncReportsToGoogleDrive([rep]);
      setArchiveNotice({
        type: 'success',
        message: `ซิงก์รูปของ ${rep.employee_name_snapshot} ขึ้น Google Drive สำเร็จ`,
      });
      setTimeout(() => setArchiveNotice(null), 4000);
      loadAdminData();
    } catch (err: any) {
      setArchiveNotice({
        type: 'error',
        message: err.message || 'ซิงก์รูปภาพไม่สำเร็จ',
      });
    } finally {
      setSingleDriveSyncingId(null);
    }
  };

  const handleGoogleDriveSignIn = async () => {
    setIsDriveAuthLoading(true);
    setDriveError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setDriveUser(res.user);
        const folder = await getOrCreateTargetFolder();
        setDriveFolderLink(folder.webViewLink || null);
      }
    } catch (err: any) {
      setDriveError(err.message || 'เข้าสู่ระบบ Google Drive ไม่สำเร็จ');
    } finally {
      setIsDriveAuthLoading(false);
    }
  };

  const handleGoogleDriveSignOut = async () => {
    await logoutGoogle();
    setDriveUser(null);
    setDriveFolderLink(null);
  };

  const handleBatchSyncDrive = async () => {
    if (!driveUser) {
      await handleGoogleDriveSignIn();
      return;
    }

    if (reportsForSync.length === 0) {
      alert('ไม่มีรายการรายงานที่ต้องซิงก์รูปภาพในขณะนี้');
      return;
    }

    const confirmed = window.confirm(
      `คุณต้องการซิงก์รูปถ่ายรายงานตัวของ รปภ. ทั้งหมด ${reportsForSync.length} รูป ไปยังโฟลเดอร์ "${TARGET_FOLDER_NAME}" บน Google Drive ใช่หรือไม่?`
    );
    if (!confirmed) return;

    setDriveSyncing(true);
    setDriveError(null);
    setDriveSyncResult(null);

    try {
      const result = await syncReportsToGoogleDrive(reportsForSync, (current, total, name) => {
        setDriveSyncProgress({ current, total, name });
      });
      setDriveSyncResult(result);
      loadAdminData(); // refresh reports data
    } catch (err: any) {
      setDriveError(err.message || 'เกิดข้อผิดพลาดในการซิงก์รูปภาพไปยัง Google Drive');
    } finally {
      setDriveSyncing(false);
      setDriveSyncProgress(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'รหัสผ่านไม่ถูกต้อง');
      }

      setPasscodeInput('');
      onLoginSuccess(data.token);
    } catch (err: any) {
      setLoginError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Employees Handlers
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEmployeeName.trim() }),
      });
      if (res.ok) {
        setNewEmployeeName('');
        loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleEmployeeActive = async (emp: Employee) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ active: !emp.active }),
      });
      loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveEmployeeName = async (id: string) => {
    if (!adminToken || !editingEmployeeName.trim()) return;
    try {
      await fetch(`/api/admin/employees/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ full_name: editingEmployeeName.trim() }),
      });
      setEditingEmployeeId(null);
      setEditingEmployeeName('');
      loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // Checkpoints Handlers
  const handleAddCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !newCpName.trim() || !newCpLat || !newCpLng) return;

    try {
      const res = await fetch('/api/admin/checkpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: newCpName.trim(),
          latitude: parseFloat(newCpLat),
          longitude: parseFloat(newCpLng),
          allowed_radius_m: parseInt(newCpRadius, 10) || 100,
          active: true,
        }),
      });
      if (res.ok) {
        setNewCpName('');
        setNewCpLat('');
        setNewCpLng('');
        setNewCpRadius('100');
        loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCheckpoint = async (id: string) => {
    if (!adminToken || !confirm('คุณแน่ใจว่าต้องการลบจุดตรวจนี้หรือไม่?')) return;
    try {
      await fetch(`/api/admin/checkpoints/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      loadAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    if (!adminToken) return;
    const params = new URLSearchParams();
    if (exportStartDate) params.set('startDate', exportStartDate);
    if (exportEndDate) params.set('endDate', exportEndDate);
    if (exportSituation !== 'all') params.set('situation', exportSituation);

    const exportUrl = `/api/admin/export/csv?${params.toString()}`;

    // Download via fetch with auth header
    fetch(exportUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('ไม่สามารถดาวน์โหลดไฟล์ CSV ได้');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date().toISOString().split('T')[0];
        a.download = `KSCP_Report_${now}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch((err) => {
        alert(err.message);
      });
  };

  // Google Sheets Sync
  const handleManualSyncSheets = async () => {
    if (!adminToken) return;
    setIsSyncingSheets(true);
    setSyncMessage(null);
    setSyncError(null);

    try {
      const res = await fetch('/api/admin/sync/google-sheets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'การซิงก์ข้อมูลล้มเหลว');
      }

      setSyncMessage(data.message);
      loadAdminData();
    } catch (err: any) {
      setSyncError(err.message || 'ไม่สามารถติดต่อ Google Apps Script ได้');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;

    setSaveSettingsSuccess(null);
    setSaveSettingsError(null);

    if (newPasscodeInput) {
      if (newPasscodeInput.length < 4) {
        setSaveSettingsError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
        return;
      }
      if (newPasscodeInput !== confirmPasscodeInput) {
        setSaveSettingsError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
        return;
      }
    }

    try {
      const payload: any = {
        gps_required: gpsRequiredInput,
        company_name: companyNameInput.trim(),
        google_sheets_url: sheetsUrlInput.trim(),
        auto_sync_sheets: autoSyncInput,
      };

      if (newPasscodeInput) {
        payload.new_passcode = newPasscodeInput.trim();
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ');
      }

      setSaveSettingsSuccess('บันทึกการตั้งค่าเรียบร้อยแล้ว');
      setNewPasscodeInput('');
      setConfirmPasscodeInput('');
      loadAdminData();
    } catch (err: any) {
      setSaveSettingsError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const copyScriptToClipboard = () => {
    if (!appScriptTemplate) return;
    navigator.clipboard.writeText(appScriptTemplate);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-950 text-white border-b-2 border-amber-500">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-amber-400 bg-emerald-950 shrink-0 p-0.5">
              <img
                src={officialLogo}
                alt="โลโก้บริษัท กนกสุวรรณ"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                ระบบจัดการผู้ดูแลระบบ (Admin Control)
              </h2>
              <p className="text-[11px] text-emerald-300">
                KSCP — บริษัท รักษาความปลอดภัย กนกสุวรรณ และ การจัดการความสะดวก จำกัด
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {adminToken && (
              <button
                type="button"
                onClick={onLogout}
                className="px-2.5 py-1 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-slate-300 hover:text-white text-xs flex items-center gap-1 border border-emerald-700/60 transition-colors"
                title="ออกจากระบบแอดมิน"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-emerald-900 transition-colors"
              title="ปิด"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {!adminToken ? (
          /* Admin Login Form */
          <div className="p-6 sm:p-10 flex flex-col items-center justify-center max-w-md mx-auto w-full my-auto">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-amber-400 shadow-md mb-3 bg-emerald-950 p-1">
              <img
                src={officialLogo}
                alt="โลโก้บริษัท กนกสุวรรณ"
                className="w-full h-full object-contain rounded-full"
              />
            </div>

            <h3 className="text-lg font-bold text-slate-900 text-center">
              เข้าสู่ระบบผู้ดูแลระบบ
            </h3>
            <p className="text-xs text-slate-500 text-center mt-1 mb-6">
              เฉพาะผู้ได้รับอนุญาตเท่านั้น ระบบจะทำการตรวจสอบรหัสผ่านที่เซิร์ฟเวอร์
            </p>

            {loginError && (
              <div className="w-full bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  รหัสผ่านแอดมิน (Admin Passcode)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="กรอกรหัสผ่าน..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-sm text-slate-900 bg-white"
                    required
                    autoFocus
                  />
                  <Key className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>กำลังตรวจสอบสิทธิ์...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 text-amber-400" />
                    <span>เข้าสู่ระบบ</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Admin Dashboard */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Admin Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto gap-1">
              <button
                onClick={() => setActiveTab('photo_archive')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'photo_archive'
                    ? 'border-emerald-800 text-emerald-950 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderArchive className="w-4 h-4 text-emerald-700" />
                <span>โฟลเดอร์รูปภาพ 30 วัน</span>
                {photoArchiveStats && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                    {photoArchiveStats.valid_30_days}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('export_sheets')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'export_sheets'
                    ? 'border-emerald-800 text-emerald-950 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span>ส่งออก CSV, Google Sheets & Google Drive</span>
              </button>

              <button
                onClick={() => setActiveTab('employees')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'employees'
                    ? 'border-emerald-800 text-emerald-950 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4 text-emerald-700" />
                <span>จัดการรายชื่อพนักงาน</span>
              </button>

              <button
                onClick={() => setActiveTab('checkpoints')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'checkpoints'
                    ? 'border-emerald-800 text-emerald-950 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-4 h-4 text-emerald-700" />
                <span>จัดการจุดตรวจ & GPS</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'settings'
                    ? 'border-emerald-800 text-emerald-950 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="w-4 h-4 text-emerald-700" />
                <span>ตั้งค่าระบบ & เปลี่ยนรหัส</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* TAB 0: PHOTO ARCHIVE (30-DAY RETENTION FOLDER) */}
              {activeTab === 'photo_archive' && (
                <div className="space-y-5">
                  {/* Notice Alert */}
                  {archiveNotice && (
                    <div
                      className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
                        archiveNotice.type === 'success'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : 'bg-red-50 text-red-900 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {archiveNotice.type === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                        )}
                        <span className="font-medium">{archiveNotice.message}</span>
                      </div>
                      <button
                        onClick={() => setArchiveNotice(null)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Header & Policy Banner */}
                  <div className="bg-linear-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center border border-amber-400/30 shrink-0">
                          <FolderArchive className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-white">
                              โฟลเดอร์เก็บรูปภาพ รปภ. (คลังเซฟย้อนหลัง 30 วัน)
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 shadow-2xs">
                              อายุจัดเก็บ 30 วัน
                            </span>
                          </div>
                          <p className="text-xs text-emerald-200/80 mt-0.5">
                            ดาวน์โหลดรูปภาพหรือเซฟย้อนหลังลงเครื่อง / ซิงก์เก็บเข้า Google Drive ประจำหน่วยงาน
                          </p>
                        </div>
                      </div>

                      {driveFolderLink && (
                        <a
                          href={driveFolderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/15 shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
                          <span>เปิดโฟลเดอร์ใน Google Drive</span>
                        </a>
                      )}
                    </div>

                    <div className="bg-emerald-950/70 rounded-xl p-3 border border-emerald-800/60 text-xs text-emerald-100 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-300">ข้อกำหนดอายุการจัดเก็บรูปภาพ: </span>
                        รูปถ่ายรายงานตัวของเจ้าหน้าที่ รปภ. จะมีอายุ <strong>30 วัน</strong> สำหรับดาวน์โหลดหรือเซฟย้อนหลังนับจากวันเวลาที่ถ่ายรายงานตัว เมื่อเกิน 30 วัน รูปภาพจะเข้าสู่สถานะหมดอายุการเซฟย้อนหลัง แนะนำให้แอดมินดาวน์โหลดลงเครื่องเป็นไฟล์ .ZIP หรือซิงก์เข้าสู่ Google Drive โฟลเดอร์ &quot;{TARGET_FOLDER_NAME}&quot; อย่างสม่ำเสมอ
                      </div>
                    </div>
                  </div>

                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-medium">รูปภาพในระยะ 30 วัน</span>
                        <FolderArchive className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-xl font-bold text-slate-900">
                        {photoArchiveStats?.valid_30_days ?? 0}{' '}
                        <span className="text-xs font-normal text-slate-500">รูป (พร้อมเซฟ)</span>
                      </div>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-medium">ใกล้หมดอายุ (&le; 5 วัน)</span>
                        <Clock className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="text-xl font-bold text-amber-600">
                        {photoArchiveStats?.expiring_soon ?? 0}{' '}
                        <span className="text-xs font-normal text-slate-500">รูป</span>
                      </div>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-medium">ซิงก์เข้า Google Drive</span>
                        <Cloud className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="text-xl font-bold text-blue-600">
                        {photoArchiveStats?.drive_synced ?? 0}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          / {photoArchiveStats?.total ?? 0} รูป
                        </span>
                      </div>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-medium">ขนาดพื้นที่จัดเก็บ</span>
                        <HardDrive className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="text-xl font-bold text-slate-900">
                        {photoArchiveStats?.total_mb ?? '0.00'}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          MB ({photoArchiveStats?.total_files ?? 0} รูป)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Filter & Toolbar */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={archiveSearchQuery}
                          onChange={(e) => setArchiveSearchQuery(e.target.value)}
                          placeholder="ค้นหาชื่อ รปภ. / จุดตรวจ..."
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 text-slate-900"
                        />
                      </div>

                      {/* Retention Filter */}
                      <div>
                        <select
                          value={archiveFilterRetention}
                          onChange={(e: any) => setArchiveFilterRetention(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 text-slate-900"
                        >
                          <option value="within_30">รูปในระยะ 30 วัน (พร้อมเซฟ)</option>
                          <option value="expiring_soon">ใกล้หมดอายุ (&le; 5 วัน)</option>
                          <option value="not_synced">ยังไม่ได้ซิงก์ Google Drive</option>
                          <option value="all">รูปภาพทั้งหมด (รวมเกิน 30 วัน)</option>
                        </select>
                      </div>

                      {/* Guard Filter */}
                      <div>
                        <select
                          value={archiveFilterGuard}
                          onChange={(e) => setArchiveFilterGuard(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 text-slate-900"
                        >
                          <option value="all">รปภ. ทั้งหมด ({uniqueArchiveGuards.length} นาย)</option>
                          {uniqueArchiveGuards.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date Filter */}
                      <div>
                        <input
                          type="date"
                          value={archiveFilterDate}
                          onChange={(e) => setArchiveFilterDate(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 text-slate-900"
                          title="กรองตามวันที่รายงานตัว"
                        />
                      </div>
                    </div>

                    {/* Action Bar (Batch Selection & Download) */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSelectAllVisiblePhotos}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {selectedPhotoIds.size === filteredArchiveReports.length &&
                          filteredArchiveReports.length > 0 ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>
                            {selectedPhotoIds.size === filteredArchiveReports.length &&
                            filteredArchiveReports.length > 0
                              ? 'ยกเลิกการเลือกทั้งหมด'
                              : `เลือกทั้งหมด (${filteredArchiveReports.length} รูป)`}
                          </span>
                        </button>

                        {selectedPhotoIds.size > 0 && (
                          <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                            เลือกอยู่ {selectedPhotoIds.size} รูป
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Batch Download ZIP */}
                        <button
                          onClick={handleBatchDownloadZip}
                          disabled={isDownloadingZip || selectedPhotoIds.size === 0}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                          title="ดาวน์โหลดรูปภาพที่เลือกรวมเป็นไฟล์ .ZIP เพื่อเซฟลงเครื่องย้อนหลัง"
                        >
                          {isDownloadingZip ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>{zipProgress || 'กำลังบีบอัด...'}</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-3.5 h-3.5 text-amber-300" />
                              <span>
                                เซฟย้อนหลังเป็น .ZIP ({selectedPhotoIds.size} รูป)
                              </span>
                            </>
                          )}
                        </button>

                        {/* Batch Drive Sync */}
                        <button
                          onClick={handleSyncSelectedToDrive}
                          disabled={driveSyncing || selectedPhotoIds.size === 0}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                          title="ซิงก์รูปถ่ายที่เลือกไปยัง Google Drive"
                        >
                          {driveSyncing ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>กำลังซิงก์ Drive...</span>
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3.5 h-3.5 text-amber-300" />
                              <span>ซิงก์เข้า Google Drive</span>
                            </>
                          )}
                        </button>

                        {/* Refresh Button */}
                        <button
                          onClick={loadAdminData}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="รีเฟรชข้อมูลคลังรูปภาพ"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Photo Cards Grid */}
                  {filteredArchiveReports.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-700">ไม่พบรูปภาพตามเงื่อนไขที่เลือก</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {archiveSearchQuery || archiveFilterDate || archiveFilterGuard !== 'all'
                          ? 'ลองปรับคำค้นหาหรือตัวกรองเพื่อค้นหารูปภาพที่ต้องการ'
                          : 'ยังไม่มีรูปภาพรายงานตัวที่บันทึกไว้ในระบบ'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredArchiveReports.map((rep) => {
                        const isSelected = selectedPhotoIds.has(rep.id);
                        const isExpiringSoon = !rep.is_expired && rep.remaining_days <= 5;
                        const isExpired = rep.is_expired;

                        return (
                          <div
                            key={rep.id}
                            className={`bg-white rounded-2xl border transition-all shadow-2xs overflow-hidden flex flex-col ${
                              isSelected
                                ? 'border-emerald-600 ring-2 ring-emerald-600/20'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {/* Image Header with Badges */}
                            <div className="relative aspect-4/3 bg-slate-900 group overflow-hidden">
                              <img
                                src={rep.photo_url}
                                alt={`รูปรายงานตัว ${rep.employee_name_snapshot}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />

                              {/* Selection Checkbox */}
                              <button
                                onClick={() => handleToggleSelectPhoto(rep.id)}
                                className="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-xs text-white flex items-center justify-center hover:bg-black/80 transition-colors cursor-pointer"
                                title={isSelected ? 'ยกเลิกการเลือก' : 'เลือกรูปนี้'}
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-white/80" />
                                )}
                              </button>

                              {/* 30-Day Retention Countdown Badge */}
                              <div className="absolute top-2.5 right-2.5">
                                {isExpired ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800/90 text-red-300 border border-red-500/40 backdrop-blur-xs flex items-center gap-1 shadow-xs">
                                    <Clock className="w-3 h-3 text-red-400" />
                                    <span>หมดอายุเซฟย้อนหลัง (&gt;30 วัน)</span>
                                  </span>
                                ) : isExpiringSoon ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1 shadow-md animate-pulse">
                                    <AlertTriangle className="w-3 h-3 text-slate-950" />
                                    <span>ใกล้หมดอายุ: เหลืออีก {rep.remaining_days} วัน</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-200 border border-emerald-500/40 backdrop-blur-xs flex items-center gap-1 shadow-xs">
                                    <Clock className="w-3 h-3 text-emerald-400" />
                                    <span>เหลือเวลาเซฟ {rep.remaining_days} วัน</span>
                                  </span>
                                )}
                              </div>

                              {/* Quick Zoom Button */}
                              <button
                                onClick={() => setLightboxPhoto(rep)}
                                className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[11px] font-medium flex items-center gap-1 hover:bg-black/85 transition-colors cursor-pointer"
                                title="เปิดดูภาพขนาดเต็ม"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-300" />
                                <span>ดูภาพเต็ม</span>
                              </button>
                            </div>

                            {/* Card Body */}
                            <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                              <div className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-bold text-xs text-slate-900 truncate">
                                    รปภ. {rep.employee_name_snapshot}
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                      rep.situation === 'normal'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : rep.situation === 'abnormal'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {rep.situation === 'normal'
                                      ? 'ปกติ'
                                      : rep.situation === 'abnormal'
                                      ? 'ไม่ปกติ'
                                      : 'ฉุกเฉิน'}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  <span className="truncate">
                                    {rep.checkpoint_name || 'ไม่ระบุจุดตรวจ'}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>
                                    {rep.report_date_th} เวลา {rep.report_time_th} น.
                                  </span>
                                </div>

                                {/* Drive Sync status */}
                                <div className="pt-1 flex items-center justify-between text-[11px]">
                                  {rep.drive_file_id || rep.drive_synced_at ? (
                                    <div className="flex items-center gap-1 text-emerald-700 font-medium">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      <span>ซิงก์ Google Drive แล้ว</span>
                                    </div>
                                  ) : (
                                    <div className="text-slate-400 text-[10px]">
                                      ยังไม่ได้ซิงก์ Google Drive
                                    </div>
                                  )}

                                  {rep.drive_web_view_link && (
                                    <a
                                      href={rep.drive_web_view_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline flex items-center gap-1 text-[10px] font-semibold"
                                    >
                                      <span>ดูบน Drive</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>

                              {/* Card Action Buttons */}
                              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleDownloadSinglePhoto(rep)}
                                  className="py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-emerald-200"
                                  title="ดาวน์โหลดรูปภาพนี้ลงเครื่อง"
                                >
                                  <ArrowDownToLine className="w-3.5 h-3.5" />
                                  <span>เซฟรูป (JPG)</span>
                                </button>

                                <button
                                  onClick={() => handleSyncSinglePhotoToDrive(rep)}
                                  disabled={singleDriveSyncingId === rep.id}
                                  className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-slate-300 disabled:opacity-50"
                                  title="ซิงก์รูปนี้ไปยัง Google Drive รวมรูปถ่ายรปภ.กัลยา"
                                >
                                  {singleDriveSyncingId === rep.id ? (
                                    <div className="w-3 h-3 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Cloud className="w-3.5 h-3.5 text-blue-600" />
                                  )}
                                  <span>ซิงก์ Drive</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 1: CSV EXPORT & GOOGLE SHEETS */}
              {activeTab === 'export_sheets' && (
                <div className="space-y-6">
                  {/* CSV Export Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                          <Download className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            ส่งออกข้อมูลเป็นไฟล์ CSV (รองรับ Excel & Google Sheets)
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            เข้ารหัส UTF-8 with BOM และป้องกันสูตรคำนวณอันตราย (Formula Injection)
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                          ตั้งแต่วันที่:
                        </label>
                        <input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                          ถึงวันที่:
                        </label>
                        <input
                          type="date"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                          สถานการณ์:
                        </label>
                        <select
                          value={exportSituation}
                          onChange={(e) => setExportSituation(e.target.value)}
                          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="all">ทั้งหมด</option>
                          <option value="normal">ปกติ</option>
                          <option value="abnormal">ไม่ปกติ</option>
                          <option value="emergency">ฉุกเฉิน</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="w-full sm:w-auto px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-2xs"
                    >
                      <Download className="w-4 h-4 text-amber-400" />
                      <span>ดาวน์โหลดไฟล์ CSV ตอนนี้</span>
                    </button>
                  </div>

                  {/* Google Sheets Live Integration */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-100 text-green-800 flex items-center justify-center">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            การเชื่อมต่อ Google Sheets แบบอัตโนมัติ
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            ส่งข้อมูลผ่าน HTTPS ไปยัง Google Apps Script Web App
                          </p>
                        </div>
                      </div>

                      {/* Real status indicator */}
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          settings?.google_sheets_url
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {settings?.google_sheets_url
                          ? 'กำหนด URL แล้ว'
                          : 'Google Sheets ยังไม่ได้เชื่อมต่อ'}
                      </span>
                    </div>

                    {syncMessage && (
                      <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{syncMessage}</span>
                      </div>
                    )}

                    {syncError && (
                      <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>{syncError}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Google Apps Script Web App URL:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={sheetsUrlInput}
                          onChange={(e) => setSheetsUrlInput(e.target.value)}
                          placeholder="https://script.google.com/macros/s/.../exec"
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleSaveSettings}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold whitespace-nowrap"
                        >
                          บันทึก URL
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleManualSyncSheets}
                        disabled={isSyncingSheets || !settings?.google_sheets_url}
                        className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                        <span>{isSyncingSheets ? 'กำลังซิงก์...' : 'ซิงก์ข้อมูลไป Google Sheets ทันที'}</span>
                      </button>

                      {settings?.last_sync_time && (
                        <span className="text-[11px] text-slate-500 font-mono">
                          ซิงก์สำเร็จล่าสุด: {new Date(settings.last_sync_time).toLocaleString('th-TH')}
                        </span>
                      )}
                    </div>

                    {/* Step-by-Step Instructions & Ready-to-copy code */}
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-slate-800">
                          โค้ด Google Apps Script (คัดลอกไปวางใน Google Sheets ได้ทันที):
                        </h5>
                        <button
                          type="button"
                          onClick={copyScriptToClipboard}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 border border-slate-200 transition-colors"
                        >
                          {copiedScript ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>คัดลอกแล้ว!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>คัดลอกโค้ด</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono text-[11px] max-h-40 overflow-y-auto leading-relaxed border border-slate-800">
                        <pre className="whitespace-pre-wrap">{appScriptTemplate || 'กำลังโหลดโค้ดตัวอย่าง...'}</pre>
                      </div>

                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <p>1. เปิด Google Sheets &gt; ไปที่เมนู <strong>ส่วนขยาย (Extensions)</strong> &gt; <strong>Apps Script</strong></p>
                        <p>2. วางโค้ดด้านบนแทนที่โค้ดเดิมทั้งหมด</p>
                        <p>3. กด <strong>ทำให้ใช้งานได้ (Deploy)</strong> &gt; <strong>การทำให้ใช้งานได้รายการใหม่ (New deployment)</strong> &gt; ประเภท: <strong>เว็บแอป (Web app)</strong></p>
                        <p>4. ตั้งสิทธิ์เข้าถึง: <strong>ทุกคน (Anyone)</strong> แล้วกดเสร็จสิ้น จากนั้นนำ URL ที่ได้มาวางในช่องด้านบน</p>
                      </div>
                    </div>
                  </div>

                  {/* Google Drive Photos Integration Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            ซิงก์รูปถ่ายพนักงานไปยัง Google Drive
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            จัดเก็บรูปถ่าย รปภ. ทั้งหมดเข้าสู่โฟลเดอร์ <strong>"{TARGET_FOLDER_NAME}"</strong>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          driveUser
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {driveUser ? 'เชื่อมต่อ Google Drive แล้ว' : 'ยังไม่ได้เชื่อมต่อ Google Drive'}
                      </span>
                    </div>

                    {driveError && (
                      <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>{driveError}</span>
                      </div>
                    )}

                    {driveSyncResult && (
                      <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span>ซิงก์รูปถ่ายสำเร็จ {driveSyncResult.successCount} รูป</span>
                        </div>
                        {driveSyncResult.failCount > 0 && (
                          <p className="text-amber-800 text-[11px]">
                            พบข้อผิดพลาด {driveSyncResult.failCount} รูป
                          </p>
                        )}
                      </div>
                    )}

                    {!driveUser ? (
                      /* Sign in with Google Button */
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <p className="text-xs text-slate-600">
                          ลงชื่อเข้าใช้ด้วยบัญชี Google เพื่ออนุญาตให้ระบบสร้างและเข้าถึงโฟลเดอร์ <strong>"{TARGET_FOLDER_NAME}"</strong> สำหรับจัดเก็บรูปถ่าย รปภ. ทั้งหมดบน Google Drive ของคุณ
                        </p>

                        <button
                          type="button"
                          onClick={handleGoogleDriveSignIn}
                          disabled={isDriveAuthLoading}
                          className="inline-flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium shadow-2xs transition-colors cursor-pointer"
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                          </svg>
                          <span>{isDriveAuthLoading ? 'กำลังเชื่อมต่อ Google...' : 'ลงชื่อเข้าใช้ด้วย Google (Sign in with Google)'}</span>
                        </button>
                      </div>
                    ) : (
                      /* Authenticated Drive Controls */
                      <div className="space-y-3">
                        <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="text-slate-500 block text-[11px]">บัญชี Google ที่เชื่อมต่อ:</span>
                            <span className="font-semibold text-slate-800">{driveUser.email}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {driveFolderLink && (
                              <a
                                href={driveFolderLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs flex items-center gap-1 transition-colors shadow-2xs"
                              >
                                <span>เปิดโฟลเดอร์ใน Google Drive</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={handleGoogleDriveSignOut}
                              className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-red-600 rounded-lg text-xs"
                            >
                              ออกจากระบบ Google
                            </button>
                          </div>
                        </div>

                        {/* Drive Sync Stats */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span className="text-slate-500 block text-[11px]">โฟลเดอร์ปลายทาง:</span>
                            <span className="font-bold text-slate-800 text-xs sm:text-sm">
                              {TARGET_FOLDER_NAME}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span className="text-slate-500 block text-[11px]">จำนวนรูปถ่ายในระบบ:</span>
                            <span className="font-bold text-slate-800 text-xs sm:text-sm">
                              {reportsForSync.length} รูป
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar during Sync */}
                        {driveSyncProgress && (
                          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs space-y-1.5">
                            <div className="flex justify-between font-medium text-blue-900">
                              <span>กำลังซิงก์รูปภาพ: {driveSyncProgress.name}</span>
                              <span>{driveSyncProgress.current} / {driveSyncProgress.total}</span>
                            </div>
                            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-blue-600 h-2 transition-all duration-300"
                                style={{
                                  width: `${(driveSyncProgress.current / driveSyncProgress.total) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Button */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={handleBatchSyncDrive}
                            disabled={driveSyncing || reportsForSync.length === 0}
                            className="w-full sm:w-auto px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                          >
                            <HardDrive className={`w-4 h-4 ${driveSyncing ? 'animate-bounce' : ''}`} />
                            <span>
                              {driveSyncing
                                ? 'กำลังซิงก์รูปถ่ายทั้งหมดเข้า Google Drive...'
                                : `ซิงก์รูปถ่ายทั้งหมด (${reportsForSync.length} รูป) ไปยัง Google Drive`}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: EMPLOYEES */}
              {activeTab === 'employees' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        รายชื่อพนักงานรักษาความปลอดภัย ({employees.length} คน)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        เพิ่ม แก้ไข หรือปิดใช้งานรายชื่อ (ประวัติเดิมจะไม่ถูกลบ)
                      </p>
                    </div>
                  </div>

                  {/* Add Employee Form */}
                  <form onSubmit={handleAddEmployee} className="flex gap-2">
                    <input
                      type="text"
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                      placeholder="ระบุชื่อ–นามสกุลพนักงานใหม่..."
                      className="flex-1 px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-white"
                      required
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-2xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>เพิ่มพนักงาน</span>
                    </button>
                  </form>

                  {/* Employee Table */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-100 text-slate-700 text-xs font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">ชื่อ–นามสกุล</th>
                          <th className="py-2.5 px-3">สถานะ</th>
                          <th className="py-2.5 px-3 text-right">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {employees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              {editingEmployeeId === emp.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editingEmployeeName}
                                    onChange={(e) => setEditingEmployeeName(e.target.value)}
                                    className="px-2 py-1 text-xs border border-slate-300 rounded"
                                  />
                                  <button
                                    onClick={() => handleSaveEmployeeName(emp.id)}
                                    className="text-xs text-emerald-700 font-semibold"
                                  >
                                    บันทึก
                                  </button>
                                  <button
                                    onClick={() => setEditingEmployeeId(null)}
                                    className="text-xs text-slate-400"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              ) : (
                                <span>{emp.full_name}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  emp.active
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-slate-200 text-slate-600 border-slate-300'
                                }`}
                              >
                                {emp.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-2">
                              {editingEmployeeId !== emp.id && (
                                <button
                                  onClick={() => {
                                    setEditingEmployeeId(emp.id);
                                    setEditingEmployeeName(emp.full_name);
                                  }}
                                  className="text-xs text-slate-600 hover:text-slate-900 underline"
                                >
                                  แก้ไขชื่อ
                                </button>
                              )}
                              <button
                                onClick={() => handleToggleEmployeeActive(emp)}
                                className={`text-xs font-medium underline ${
                                  emp.active ? 'text-amber-700' : 'text-emerald-700'
                                }`}
                              >
                                {emp.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: CHECKPOINTS & GPS */}
              {activeTab === 'checkpoints' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        จุดตรวจและรัศมีที่อนุญาต ({checkpoints.length} จุด)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        กำหนดพิกัดละติจูด ลองจิจูด และรัศมีเป็นเมตรสำหรับการตรวจสอบสถานที่จริง
                      </p>
                    </div>
                  </div>

                  {/* Add Checkpoint Form */}
                  <form onSubmit={handleAddCheckpoint} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      เพิ่มจุดตรวจใหม่:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-medium text-slate-600 block mb-0.5">
                          ชื่อจุดตรวจ:
                        </label>
                        <input
                          type="text"
                          value={newCpName}
                          onChange={(e) => setNewCpName(e.target.value)}
                          placeholder="เช่น จุดตรวจป้อมประตู 1"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 block mb-0.5">
                          ละติจูด (Lat):
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={newCpLat}
                          onChange={(e) => setNewCpLat(e.target.value)}
                          placeholder="13.7563"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 block mb-0.5">
                          ลองจิจูด (Lng):
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={newCpLng}
                          onChange={(e) => setNewCpLng(e.target.value)}
                          placeholder="100.5018"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2 text-xs">
                        <label className="text-[11px] font-medium text-slate-600">
                          รัศมีที่อนุญาต (เมตร):
                        </label>
                        <input
                          type="number"
                          value={newCpRadius}
                          onChange={(e) => setNewCpRadius(e.target.value)}
                          className="w-20 px-2.5 py-1 border border-slate-300 rounded-lg bg-white"
                          min="10"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>บันทึกจุดตรวจ</span>
                      </button>
                    </div>
                  </form>

                  {/* Checkpoints List */}
                  <div className="space-y-2">
                    {checkpoints.map((cp) => (
                      <div
                        key={cp.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div>
                          <div className="font-semibold text-xs sm:text-sm text-slate-900">
                            {cp.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            พิกัด: {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)} · รัศมี {cp.allowed_radius_m} ม.
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteCheckpoint(cp.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบจุดตรวจ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: SETTINGS & CHANGE PASSCODE */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  {/* System Status Indicators */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      สถานะการเชื่อมต่อระบบจริง
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">ฐานข้อมูลระบบ</span>
                        <span className="font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>เชื่อมต่อแล้ว (พร้อมใช้งาน)</span>
                        </span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">พื้นที่จัดเก็บรูปภาพ</span>
                        <span className="font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>พร้อมใช้งาน</span>
                        </span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Google Sheets</span>
                        <span
                          className={`font-semibold flex items-center gap-1 mt-0.5 ${
                            settings?.google_sheets_url
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {settings?.google_sheets_url ? (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>เชื่อมต่อแล้ว</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>ยังไม่ได้เชื่อมต่อ</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {saveSettingsSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{saveSettingsSuccess}</span>
                    </div>
                  )}

                  {saveSettingsError && (
                    <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{saveSettingsError}</span>
                    </div>
                  )}

                  {/* Settings Form */}
                  <form onSubmit={handleSaveSettings} className="space-y-4">
                    {/* Company Name */}
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        ชื่อบริษัท / องค์กร:
                      </label>
                      <input
                        type="text"
                        value={companyNameInput}
                        onChange={(e) => setCompanyNameInput(e.target.value)}
                        className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-white"
                        required
                      />
                    </div>

                    {/* GPS Requirement Switch */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          บังคับตรวจสอบพิกัด GPS ก่อนบันทึก
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          หากเปิดใช้งาน พนักงานต้องยืนยันตำแหน่งและอยู่ในรัศมีจุดตรวจจึงจะบันทึกได้
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={gpsRequiredInput}
                        onChange={(e) => setGpsRequiredInput(e.target.checked)}
                        className="w-5 h-5 accent-emerald-700 rounded cursor-pointer"
                      />
                    </div>

                    {/* Auto Sync Google Sheets Switch */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          ซิงก์ข้อมูลไปยัง Google Sheets อัตโนมัติในพื้นหลัง
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          ส่งรายงานไปทันทีเมื่อพนักงานกดบันทึกสำเร็จ (ต้องตั้งค่า URL แล้ว)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoSyncInput}
                        onChange={(e) => setAutoSyncInput(e.target.checked)}
                        className="w-5 h-5 accent-emerald-700 rounded cursor-pointer"
                      />
                    </div>

                    {/* Change Admin Passcode Section */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-500" />
                        <h4 className="text-xs font-bold text-slate-900">
                          เปลี่ยนรหัสผ่านแอดมิน (เริ่มต้นคือ 1304)
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        หากไม่ต้องการเปลี่ยนรหัสผ่าน ให้เว้นว่างช่องนี้ไว้
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-slate-600 block mb-0.5">
                            รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร):
                          </label>
                          <input
                            type="password"
                            value={newPasscodeInput}
                            onChange={(e) => setNewPasscodeInput(e.target.value)}
                            placeholder="รหัสผ่านใหม่"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-600 block mb-0.5">
                            ยืนยันรหัสผ่านใหม่:
                          </label>
                          <input
                            type="password"
                            value={confirmPasscodeInput}
                            onChange={(e) => setConfirmPasscodeInput(e.target.value)}
                            placeholder="ยืนยันรหัสผ่านใหม่"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-2xs"
                    >
                      บันทึกการตั้งค่าทั้งหมด
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Photo Lightbox / Preview Modal */}
        {lightboxPhoto && (
          <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
            <div className="relative bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      รูปรายงานตัว: รปภ. {lightboxPhoto.employee_name_snapshot}
                    </h4>
                    <p className="text-[11px] text-slate-300">
                      {lightboxPhoto.report_date_th} เวลา {lightboxPhoto.report_time_th} น. · {lightboxPhoto.checkpoint_name || 'ไม่ระบุจุดตรวจ'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setLightboxPhoto(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="ปิด"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Photo Display */}
              <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden p-2 min-h-[300px]">
                <img
                  src={lightboxPhoto.photo_url}
                  alt={`รูปรายงานตัว ${lightboxPhoto.employee_name_snapshot}`}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>

              {/* Modal Details & Action Bar */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">อายุการเซฟย้อนหลัง:</span>
                    {lightboxPhoto.is_expired ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                        หมดอายุแล้ว (&gt;30 วัน)
                      </span>
                    ) : lightboxPhoto.remaining_days <= 5 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        ⚠️ ใกล้หมดอายุ: เหลืออีก {lightboxPhoto.remaining_days} วัน
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        เหลือเวลาเซฟย้อนหลังอีก {lightboxPhoto.remaining_days} วัน (อายุ 30 วัน)
                      </span>
                    )}

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        lightboxPhoto.situation === 'normal'
                          ? 'bg-emerald-100 text-emerald-800'
                          : lightboxPhoto.situation === 'abnormal'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {lightboxPhoto.situation === 'normal'
                        ? 'ปกติ'
                        : lightboxPhoto.situation === 'abnormal'
                        ? 'ไม่ปกติ'
                        : 'ฉุกเฉิน'}
                    </span>
                  </div>

                  {lightboxPhoto.incident_description && (
                    <p className="text-slate-600 italic text-[11px]">
                      &quot;{lightboxPhoto.incident_description}&quot;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadSinglePhoto(lightboxPhoto)}
                    className="py-2 px-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <ArrowDownToLine className="w-4 h-4 text-amber-300" />
                    <span>ดาวน์โหลดรูปนี้ (JPG)</span>
                  </button>

                  <button
                    onClick={() => handleSyncSinglePhotoToDrive(lightboxPhoto)}
                    disabled={singleDriveSyncingId === lightboxPhoto.id}
                    className="py-2 px-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {singleDriveSyncingId === lightboxPhoto.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Cloud className="w-4 h-4 text-amber-300" />
                    )}
                    <span>ซิงก์ Google Drive</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

