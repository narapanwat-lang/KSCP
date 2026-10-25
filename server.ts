import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  initDb,
  getDb,
  saveDb,
  getEmployees,
  findOrCreateEmployee,
  updateEmployee,
  getReports,
  getReportById,
  addReport,
  markReportsSynced,
  getCheckpoints,
  addCheckpoint,
  updateCheckpoint,
  deleteCheckpoint,
  getSettings,
  updateSettings,
  addSyncLog,
  getSyncLogs,
  getThailandTime,
  calculateDistanceMeters,
  normalizeName,
  PHOTOS_DIR,
} from './server/db.ts';
import { Report, SituationType, GpsVerificationStatus, SystemSettings } from './server/types.ts';

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Database & Storage
initDb();

// Middlewares
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// In-memory admin session storage & rate-limiting
interface AdminSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}

const adminSessions = new Map<string, AdminSession>();

interface LoginAttemptTracker {
  attempts: number;
  lockUntil: number;
}

const loginAttempts = new Map<string, LoginAttemptTracker>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบแอดมินก่อนดำเนินการ' });
  }

  const token = authHeader.substring(7);
  const session = adminSessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    if (session) adminSessions.delete(token);
    return res.status(401).json({ error: 'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  }

  next();
}

// ==========================================
// PUBLIC API ROUTES
// ==========================================

// Health & System Status
app.get('/api/health', (req: Request, res: Response) => {
  const thTime = getThailandTime();
  const db = getDb();
  const settings = getSettings();

  const isPhotosReady = fs.existsSync(PHOTOS_DIR);
  const isGoogleSheetsConfigured = Boolean(
    settings.google_sheets_url && settings.google_sheets_url.trim().startsWith('https://')
  );

  res.json({
    status: 'ok',
    systemName: 'KSCP — KANOKSUWUN CHECK POINT',
    company: settings.company_name,
    serverTime: thTime,
    databaseStatus: 'connected',
    storageStatus: isPhotosReady ? 'ready' : 'not_ready',
    googleSheetsStatus: isGoogleSheetsConfigured ? 'configured' : 'not_configured',
    reportsCount: db.reports.length,
    employeesCount: db.employees.filter((e) => e.active).length,
  });
});

// Accurate Server Time
app.get('/api/time', (req: Request, res: Response) => {
  res.json(getThailandTime());
});

// Employee List for Guards
app.get('/api/employees', (req: Request, res: Response) => {
  const employees = getEmployees(true);
  res.json(employees);
});

// Register / Select Employee
app.post('/api/employees', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อ–นามสกุลพนักงานให้ถูกต้อง' });
  }

  const normalized = normalizeName(name);
  if (normalized.length < 2) {
    return res.status(400).json({ error: 'ชื่อ–นามสกุลต้องมีความยาวอย่างน้อย 2 ตัวอักษร' });
  }

  const emp = findOrCreateEmployee(normalized);
  res.json(emp);
});

// Active Checkpoints for Guards
app.get('/api/checkpoints', (req: Request, res: Response) => {
  const all = getCheckpoints();
  const active = all.filter((c) => c.active);
  const settings = getSettings();
  res.json({
    gpsRequired: settings.gps_required,
    checkpoints: active,
  });
});

// Serve Photos
app.get('/api/photos/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(PHOTOS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Photo not found');
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

// Create Report (Guard Check-in)
app.post('/api/reports', async (req: Request, res: Response) => {
  try {
    const {
      employee_name,
      situation,
      incident_description,
      photo_base64,
      latitude,
      longitude,
      gps_accuracy_m,
      checkpoint_id,
    } = req.body;

    // 1. Validate Employee Name
    if (!employee_name || typeof employee_name !== 'string' || !employee_name.trim()) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อ–นามสกุลพนักงานก่อนบันทึก' });
    }
    const cleanName = normalizeName(employee_name);

    // 2. Validate Situation
    const validSituations: SituationType[] = ['normal', 'abnormal', 'emergency'];
    if (!situation || !validSituations.includes(situation)) {
      return res.status(400).json({ error: 'กรุณาเลือกสถานการณ์ (ปกติ / ไม่ปกติ / ฉุกเฉิน)' });
    }

    // 3. Validate Incident Details if Abnormal/Emergency
    if (situation !== 'normal') {
      if (!incident_description || typeof incident_description !== 'string' || !incident_description.trim()) {
        const fieldName = situation === 'emergency' ? 'รายละเอียดเหตุฉุกเฉิน' : 'รายละเอียดเหตุการณ์';
        return res.status(400).json({ error: `กรุณากรอก${fieldName}ก่อนบันทึกรายงาน` });
      }
    }

    // 4. Validate Photo
    if (!photo_base64 || typeof photo_base64 !== 'string') {
      return res.status(400).json({ error: 'กรุณาถ่ายรูปหรือแนบรูปรายงานตัวก่อนบันทึก' });
    }

    // Save Photo File
    const reportId = `rep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const photoId = `photo_${reportId}.jpg`;
    const photoPath = path.join(PHOTOS_DIR, photoId);

    try {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(photoPath, buffer);
    } catch (err) {
      console.error('Failed to save photo file', err);
      return res.status(500).json({ error: 'ไม่สามารถจัดเก็บรูปภาพได้ กรุณาลองใหม่อีกครั้ง' });
    }

    const photoUrl = `/api/photos/${photoId}`;

    // 5. Authoritative Server Time
    const now = new Date();
    const serverTime = getThailandTime(now);

    // 6. Check GPS and Checkpoint
    const settings = getSettings();
    let verificationStatus: GpsVerificationStatus = 'not_verified';
    let matchedCheckpointName: string | null = null;

    const lat = typeof latitude === 'number' ? latitude : null;
    const lng = typeof longitude === 'number' ? longitude : null;
    const accuracy = typeof gps_accuracy_m === 'number' ? gps_accuracy_m : null;

    if (!settings.gps_required) {
      verificationStatus = lat !== null && lng !== null ? 'passed' : 'gps_disabled';
    } else {
      if (lat === null || lng === null) {
        verificationStatus = 'failed';
        return res.status(400).json({
          error: 'ระบบกำหนดให้ต้องใช้พิกัด GPS เพื่อยืนยันสถานที่ โปรดอนุญาตการระบุตำแหน่งบนโทรศัพท์',
        });
      }

      if (checkpoint_id) {
        const cp = getCheckpoints().find((c) => c.id === checkpoint_id && c.active);
        if (cp) {
          matchedCheckpointName = cp.name;
          const dist = calculateDistanceMeters(lat, lng, cp.latitude, cp.longitude);
          if (dist <= cp.allowed_radius_m) {
            verificationStatus = 'passed';
          } else {
            verificationStatus = 'failed';
            return res.status(400).json({
              error: `ตำแหน่งปัจจุบันของคุณอยู่นอกรัศมีจุดตรวจ "${cp.name}" (ระยะห่าง ${dist} ม. เกินกว่าที่อนุญาต ${cp.allowed_radius_m} ม.)`,
            });
          }
        }
      } else {
        verificationStatus = 'passed';
      }
    }

    // Find or create employee entry to maintain known employee list
    const emp = findOrCreateEmployee(cleanName);

    // 7. Assemble Report Record
    const newReport: Report = {
      id: reportId,
      employee_id: emp.id,
      employee_name_snapshot: cleanName,
      report_date_th: serverTime.dateTh,
      report_time_th: serverTime.timeTh,
      timezone: 'Asia/Bangkok',
      report_timestamp_iso: serverTime.isoWithOffset,
      report_timestamp_utc: serverTime.utcIso,
      server_received_at: now.toISOString(),
      situation,
      incident_description: situation !== 'normal' ? incident_description.trim() : undefined,
      photo_url: photoUrl,
      photo_id: photoId,
      latitude: lat,
      longitude: lng,
      gps_accuracy_m: accuracy,
      checkpoint_id: checkpoint_id || null,
      checkpoint_name: matchedCheckpointName,
      gps_verification_status: verificationStatus,
      record_status: 'active',
      created_at: now.toISOString(),
    };

    // Save Report to Database
    addReport(newReport);

    // Optional Background Google Sheets Auto-Sync
    if (settings.google_sheets_url && settings.auto_sync_sheets) {
      syncReportToGoogleSheets(newReport, settings.google_sheets_url).catch((e) => {
        console.error('Background sheets sync error:', e);
      });
    }

    res.status(201).json({
      success: true,
      message: 'บันทึกรายงานตัวสำเร็จ',
      report: newReport,
    });
  } catch (err: any) {
    console.error('Create report error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง' });
  }
});

// View Reports List (Ordered Newest to Oldest)
app.get('/api/reports', (req: Request, res: Response) => {
  const { q, startDate, endDate, employee, situation, page = '1', limit = '20' } = req.query;

  const filtered = getReports({
    q: typeof q === 'string' ? q : undefined,
    startDate: typeof startDate === 'string' ? startDate : undefined,
    endDate: typeof endDate === 'string' ? endDate : undefined,
    employee: typeof employee === 'string' ? employee : undefined,
    situation: typeof situation === 'string' ? situation : undefined,
  });

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = filtered.slice(startIndex, startIndex + limitNum);

  res.json({
    reports: paginated,
    total: filtered.length,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(filtered.length / limitNum),
  });
});

// Single Report Detail Modal
app.get('/api/reports/:id', (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลรายงานที่ต้องการ' });
  }
  res.json(report);
});

// Update Report (e.g. Drive sync status)
app.patch('/api/reports/:id', (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลรายงานที่ต้องการ' });
  }
  const { drive_file_id, drive_web_view_link, drive_synced_at } = req.body;
  if (drive_file_id !== undefined) report.drive_file_id = drive_file_id;
  if (drive_web_view_link !== undefined) report.drive_web_view_link = drive_web_view_link;
  if (drive_synced_at !== undefined) report.drive_synced_at = drive_synced_at;
  saveDb();
  res.json({ success: true, report });
});

// ==========================================
// ADMIN AUTHENTICATION & MANAGEMENT
// ==========================================

// Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const now = Date.now();

  const tracker = loginAttempts.get(clientIp) || { attempts: 0, lockUntil: 0 };
  if (tracker.lockUntil > now) {
    const remainingSec = Math.ceil((tracker.lockUntil - now) / 1000);
    return res.status(429).json({
      error: `คุณกรอกรหัสผิดเกินกำหนด กรุณารออีก ${remainingSec} วินาที ก่อนลองใหม่`,
    });
  }

  const { passcode } = req.body;
  if (!passcode || typeof passcode !== 'string') {
    return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านผู้ดูแลระบบ' });
  }

  const settings = getSettings();
  const currentPasscode = settings.admin_passcode || '1304';

  if (passcode !== currentPasscode) {
    tracker.attempts += 1;
    if (tracker.attempts >= 5) {
      tracker.lockUntil = now + 60 * 1000; // 60 seconds lockout
      tracker.attempts = 0;
    }
    loginAttempts.set(clientIp, tracker);

    // Intentional 400ms delay to thwart timing attacks
    return setTimeout(() => {
      res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง โปรดตรวจสอบแล้วลองใหม่อีกครั้ง' });
    }, 400);
  }

  // Login Success: reset attempt tracker
  loginAttempts.delete(clientIp);

  const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
  const expiresIn = 12 * 60 * 60 * 1000; // 12 hours
  adminSessions.set(token, {
    token,
    createdAt: now,
    expiresAt: now + expiresIn,
  });

  res.json({
    success: true,
    token,
    expiresInSeconds: expiresIn / 1000,
  });
});

// Admin Logout
app.post('/api/admin/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    adminSessions.delete(token);
  }
  res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
});

// Verify Admin Session
app.get('/api/admin/verify', verifyAdmin, (req: Request, res: Response) => {
  res.json({ authenticated: true });
});

// Admin System Settings
app.get('/api/admin/settings', verifyAdmin, (req: Request, res: Response) => {
  const settings = getSettings();
  res.json({
    gps_required: settings.gps_required,
    company_name: settings.company_name,
    google_sheets_url: settings.google_sheets_url,
    auto_sync_sheets: settings.auto_sync_sheets,
    last_sync_time: settings.last_sync_time,
  });
});

// Update Settings
app.post('/api/admin/settings', verifyAdmin, (req: Request, res: Response) => {
  const { new_passcode, gps_required, company_name, google_sheets_url, auto_sync_sheets } = req.body;

  const updates: Partial<SystemSettings> = {};

  if (typeof gps_required === 'boolean') updates.gps_required = gps_required;
  if (typeof company_name === 'string' && company_name.trim()) updates.company_name = company_name.trim();
  if (typeof google_sheets_url === 'string') updates.google_sheets_url = google_sheets_url.trim();
  if (typeof auto_sync_sheets === 'boolean') updates.auto_sync_sheets = auto_sync_sheets;

  if (new_passcode && typeof new_passcode === 'string') {
    const cleanPass = new_passcode.trim();
    if (cleanPass.length < 4) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
    }
    updates.admin_passcode = cleanPass;
  }

  const updated = updateSettings(updates);
  res.json({
    success: true,
    message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว',
    settings: {
      gps_required: updated.gps_required,
      company_name: updated.company_name,
      google_sheets_url: updated.google_sheets_url,
      auto_sync_sheets: updated.auto_sync_sheets,
      last_sync_time: updated.last_sync_time,
    },
  });
});

// Admin Employee Management
app.get('/api/admin/employees', verifyAdmin, (req: Request, res: Response) => {
  res.json(getEmployees(false));
});

app.put('/api/admin/employees/:id', verifyAdmin, (req: Request, res: Response) => {
  const { full_name, active } = req.body;
  const updated = updateEmployee(req.params.id, { full_name, active });
  if (!updated) {
    return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' });
  }
  res.json({ success: true, employee: updated });
});

// Admin Checkpoints Management
app.get('/api/admin/checkpoints', verifyAdmin, (req: Request, res: Response) => {
  res.json(getCheckpoints());
});

app.post('/api/admin/checkpoints', verifyAdmin, (req: Request, res: Response) => {
  const { name, latitude, longitude, allowed_radius_m, active } = req.body;
  if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'ข้อมูลจุดตรวจไม่ครบถ้วน (ต้องมีชื่อ, ละติจูด, ลองจิจูด)' });
  }

  const created = addCheckpoint({
    name: name.trim(),
    latitude,
    longitude,
    allowed_radius_m: typeof allowed_radius_m === 'number' ? allowed_radius_m : 100,
    active: active !== false,
  });

  res.status(201).json({ success: true, checkpoint: created });
});

app.put('/api/admin/checkpoints/:id', verifyAdmin, (req: Request, res: Response) => {
  const updated = updateCheckpoint(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'ไม่พบจุดตรวจที่ต้องการแก้ไข' });
  }
  res.json({ success: true, checkpoint: updated });
});

app.delete('/api/admin/checkpoints/:id', verifyAdmin, (req: Request, res: Response) => {
  const deleted = deleteCheckpoint(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'ไม่พบจุดตรวจที่ต้องการลบ' });
  }
  res.json({ success: true, message: 'ลบจุดตรวจเรียบร้อยแล้ว' });
});

// ==========================================
// CSV EXPORT (UTF-8 BOM + FORMULA SANITIZATION)
// ==========================================

function sanitizeForCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // CSV Formula Injection mitigation:
  // If cell begins with =, +, -, @, or tab/return, prepend single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape inner double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

app.get('/api/admin/export/csv', verifyAdmin, (req: Request, res: Response) => {
  const { startDate, endDate, employee, situation } = req.query;

  const reports = getReports({
    startDate: typeof startDate === 'string' ? startDate : undefined,
    endDate: typeof endDate === 'string' ? endDate : undefined,
    employee: typeof employee === 'string' ? employee : undefined,
    situation: typeof situation === 'string' ? situation : undefined,
  });

  const headers = [
    'report_id',
    'employee_name',
    'report_date_th',
    'report_time_th',
    'timezone',
    'report_timestamp_iso',
    'report_timestamp_utc',
    'server_received_at',
    'situation',
    'incident_description',
    'photo_url',
    'latitude',
    'longitude',
    'gps_accuracy_m',
    'checkpoint_name',
    'gps_verification_status',
    'record_status',
  ];

  const appUrl = process.env.APP_URL || '';
  const rows: string[] = [headers.join(',')];

  for (const r of reports) {
    const fullPhotoUrl = r.photo_url.startsWith('http')
      ? r.photo_url
      : `${appUrl}${r.photo_url}`;

    const situationThai =
      r.situation === 'normal'
        ? 'ปกติ'
        : r.situation === 'abnormal'
        ? 'ไม่ปกติ'
        : 'ฉุกเฉิน';

    const row = [
      sanitizeForCsv(r.id),
      sanitizeForCsv(r.employee_name_snapshot),
      sanitizeForCsv(r.report_date_th),
      sanitizeForCsv(r.report_time_th),
      sanitizeForCsv(r.timezone || 'Asia/Bangkok'),
      sanitizeForCsv(r.report_timestamp_iso),
      sanitizeForCsv(r.report_timestamp_utc),
      sanitizeForCsv(r.server_received_at),
      sanitizeForCsv(situationThai),
      sanitizeForCsv(r.incident_description || ''),
      sanitizeForCsv(fullPhotoUrl),
      sanitizeForCsv(r.latitude ?? ''),
      sanitizeForCsv(r.longitude ?? ''),
      sanitizeForCsv(r.gps_accuracy_m ?? ''),
      sanitizeForCsv(r.checkpoint_name || ''),
      sanitizeForCsv(r.gps_verification_status),
      sanitizeForCsv(r.record_status),
    ];
    rows.push(row.join(','));
  }

  // Prepend UTF-8 BOM so Excel on Windows/Mac properly reads Thai characters
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const filename = `KSCP_Report_${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
});

// Admin Photo Archive & 30-Day Retention Folder
app.get('/api/admin/photo-archive', verifyAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const photoReports = db.reports
    .filter((r) => r.photo_url || r.photo_id)
    .map((r) => {
      const createdTime = new Date(r.created_at || r.report_timestamp_utc || r.server_received_at).getTime();
      const ageMs = Math.max(0, now - createdTime);
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const remainingMs = THIRTY_DAYS_MS - ageMs;
      const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
      const isExpired = ageMs > THIRTY_DAYS_MS;

      return {
        ...r,
        age_days: ageDays,
        remaining_days: remainingDays,
        is_expired: isExpired,
        expires_at: new Date(createdTime + THIRTY_DAYS_MS).toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Statistics
  const valid30Days = photoReports.filter((p) => !p.is_expired);
  const expiringSoon = photoReports.filter((p) => !p.is_expired && p.remaining_days <= 5);
  const driveSynced = photoReports.filter((p) => p.drive_file_id || p.drive_synced_at);

  // Check physical storage disk usage
  let totalPhotoFiles = 0;
  let totalPhotoBytes = 0;
  try {
    if (fs.existsSync(PHOTOS_DIR)) {
      const files = fs.readdirSync(PHOTOS_DIR);
      totalPhotoFiles = files.length;
      for (const f of files) {
        try {
          const stat = fs.statSync(path.join(PHOTOS_DIR, f));
          totalPhotoBytes += stat.size;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  res.json({
    reports: photoReports,
    stats: {
      total: photoReports.length,
      valid_30_days: valid30Days.length,
      expiring_soon: expiringSoon.length,
      expired: photoReports.length - valid30Days.length,
      drive_synced: driveSynced.length,
      total_files: totalPhotoFiles,
      total_bytes: totalPhotoBytes,
      total_mb: (totalPhotoBytes / (1024 * 1024)).toFixed(2),
    },
  });
});

// Direct photo download with custom filename
app.get('/api/photos/:filename/download', (req: Request, res: Response) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(PHOTOS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Photo not found');
  }

  const downloadName = typeof req.query.name === 'string' && req.query.name.trim()
    ? req.query.name.trim()
    : safeFilename;

  res.download(filePath, downloadName);
});


// ==========================================
// GOOGLE SHEETS SYNC & APPS SCRIPT TEMPLATE
// ==========================================

async function syncReportToGoogleSheets(report: Report, scriptUrl: string): Promise<boolean> {
  const appUrl = process.env.APP_URL || '';
  const fullPhotoUrl = report.photo_url.startsWith('http')
    ? report.photo_url
    : `${appUrl}${report.photo_url}`;

  const payload = {
    action: 'sync_report',
    report: {
      report_id: report.id,
      employee_name: report.employee_name_snapshot,
      report_date_th: report.report_date_th,
      report_time_th: report.report_time_th,
      timezone: report.timezone,
      report_timestamp_iso: report.report_timestamp_iso,
      report_timestamp_utc: report.report_timestamp_utc,
      server_received_at: report.server_received_at,
      situation:
        report.situation === 'normal'
          ? 'ปกติ'
          : report.situation === 'abnormal'
          ? 'ไม่ปกติ'
          : 'ฉุกเฉิน',
      incident_description: report.incident_description || '',
      photo_url: fullPhotoUrl,
      latitude: report.latitude || '',
      longitude: report.longitude || '',
      gps_accuracy_m: report.gps_accuracy_m || '',
      checkpoint_name: report.checkpoint_name || '',
      gps_verification_status: report.gps_verification_status,
      record_status: report.record_status,
    },
  };

  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Google Apps Script responded with HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.status !== 'success') {
    throw new Error(result.message || 'Google Apps Script returned failure status');
  }

  return true;
}

// Manual Sync All or Unsynced to Google Sheets
app.post('/api/admin/sync/google-sheets', verifyAdmin, async (req: Request, res: Response) => {
  const settings = getSettings();
  if (!settings.google_sheets_url || !settings.google_sheets_url.trim()) {
    return res.status(400).json({
      error: 'Google Sheets ยังไม่ได้เชื่อมต่อ: โปรดระบุ URL ของ Google Apps Script ในหน้าตั้งค่าก่อน',
    });
  }

  const scriptUrl = settings.google_sheets_url.trim();
  const reports = getReports();

  if (reports.length === 0) {
    return res.json({
      success: true,
      message: 'ไม่มีรายการรายงานที่ต้องซิงก์ในปัจจุบัน',
      syncedCount: 0,
    });
  }

  try {
    const appUrl = process.env.APP_URL || '';
    const payload = {
      action: 'sync_batch',
      reports: reports.map((r) => ({
        report_id: r.id,
        employee_name: r.employee_name_snapshot,
        report_date_th: r.report_date_th,
        report_time_th: r.report_time_th,
        timezone: r.timezone,
        report_timestamp_iso: r.report_timestamp_iso,
        report_timestamp_utc: r.report_timestamp_utc,
        server_received_at: r.server_received_at,
        situation:
          r.situation === 'normal'
            ? 'ปกติ'
            : r.situation === 'abnormal'
            ? 'ไม่ปกติ'
            : 'ฉุกเฉิน',
        incident_description: r.incident_description || '',
        photo_url: r.photo_url.startsWith('http') ? r.photo_url : `${appUrl}${r.photo_url}`,
        latitude: r.latitude ?? '',
        longitude: r.longitude ?? '',
        gps_accuracy_m: r.gps_accuracy_m ?? '',
        checkpoint_name: r.checkpoint_name || '',
        gps_verification_status: r.gps_verification_status,
        record_status: r.record_status,
      })),
    };

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`เซิร์ฟเวอร์ปลายทางตอบกลับด้วยรหัส HTTP ${response.status}`);
    }

    const jsonRes = await response.json();

    // Mark reports synced
    markReportsSynced(reports.map((r) => r.id));
    updateSettings({ last_sync_time: new Date().toISOString() });

    addSyncLog({
      destination: 'Google Sheets Web App',
      sync_status: 'success',
      records_count: reports.length,
    });

    res.json({
      success: true,
      message: `ซิงก์ข้อมูลไปยัง Google Sheets สำเร็จ (${reports.length} รายการ)`,
      details: jsonRes,
    });
  } catch (err: any) {
    console.error('Manual Google Sheets sync error:', err);
    addSyncLog({
      destination: 'Google Sheets Web App',
      sync_status: 'failed',
      error_message: err.message || 'ไม่สามารถติดต่อปลายทางได้',
    });

    res.status(502).json({
      error: `ไม่สามารถส่งข้อมูลไปยัง Google Sheets ได้: ${err.message || 'ข้อผิดพลาดการเชื่อมต่อ'}`,
    });
  }
});

// View Sync Logs
app.get('/api/admin/sync/logs', verifyAdmin, (req: Request, res: Response) => {
  res.json(getSyncLogs());
});

// Ready-to-copy Google Apps Script Code
app.get('/api/admin/google-script-template', verifyAdmin, (req: Request, res: Response) => {
  const scriptTemplate = `// ========================================================
// KSCP — KANOKSUWUN CHECK POINT Google Apps Script Receiver
// วางโค้ดนี้ใน Extensions > Apps Script ใน Google Sheets ของคุณ
// แล้วเลือก Deploy > New deployment > Select type: Web app
// ตั้ง Execute as: Me และ Who has access: Anyone
// ========================================================

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('KSCP_Reports') || ss.getActiveSheet();

    var headers = [
      'report_id',
      'employee_name',
      'report_date_th',
      'report_time_th',
      'timezone',
      'report_timestamp_iso',
      'report_timestamp_utc',
      'server_received_at',
      'situation',
      'incident_description',
      'photo_url',
      'latitude',
      'longitude',
      'gps_accuracy_m',
      'checkpoint_name',
      'gps_verification_status',
      'record_status'
    ];

    // Check if sheet is empty and write headers
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#14532d').setFontColor('#ffffff');
    }

    // Get existing report_ids to prevent duplicates
    var existingIds = {};
    if (sheet.getLastRow() > 1) {
      var idValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < idValues.length; i++) {
        if (idValues[i][0]) existingIds[String(idValues[i][0])] = true;
      }
    }

    var items = [];
    if (data.action === 'sync_report' && data.report) {
      items = [data.report];
    } else if (data.action === 'sync_batch' && Array.isArray(data.reports)) {
      items = data.reports;
    }

    var addedCount = 0;
    for (var j = 0; j < items.length; j++) {
      var r = items[j];
      if (!r || !r.report_id) continue;
      if (existingIds[r.report_id]) continue; // Skip duplicates

      sheet.appendRow([
        r.report_id,
        r.employee_name,
        r.report_date_th,
        r.report_time_th,
        r.timezone || 'Asia/Bangkok',
        r.report_timestamp_iso,
        r.report_timestamp_utc,
        r.server_received_at,
        r.situation,
        r.incident_description || '',
        r.photo_url,
        r.latitude || '',
        r.longitude || '',
        r.gps_accuracy_m || '',
        r.checkpoint_name || '',
        r.gps_verification_status,
        r.record_status || 'synced'
      ]);

      existingIds[r.report_id] = true;
      addedCount++;
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      received: items.length,
      added: addedCount
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(scriptTemplate);
});

// ==========================================
// VITE DEV SERVER OR STATIC PRODUCTION BUILD
// ==========================================

async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KSCP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
