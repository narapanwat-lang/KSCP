import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSchema, Employee, Report, Checkpoint, SyncLog, SystemSettings } from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PHOTOS_DIR = path.resolve(DATA_DIR, 'photos');
const DB_FILE = path.resolve(DATA_DIR, 'kscp_data.json');

const DEFAULT_SETTINGS: SystemSettings = {
  admin_passcode: '1304',
  gps_required: false,
  company_name: 'บริษัท รักษาความปลอดภัย กนกสุวรรณ และ การจัดการความสะดวก จำกัด',
  google_sheets_url: '',
  auto_sync_sheets: false,
  last_sync_time: null,
};

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp_01',
    full_name: 'สมชาย บุญมี',
    normalized_name: 'สมชาย บุญมี',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'emp_02',
    full_name: 'วิชัย ใจดี',
    normalized_name: 'วิชัย ใจดี',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'emp_03',
    full_name: 'ประสิทธิ์ รัตนกิจ',
    normalized_name: 'ประสิทธิ์ รัตนกิจ',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'emp_04',
    full_name: 'อนุชา มั่งคั่ง',
    normalized_name: 'อนุชา มั่งคั่ง',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_CHECKPOINTS: Checkpoint[] = [
  {
    id: 'chk_01',
    name: 'จุดตรวจหน้าป้อมประตูใหญ่ 1',
    latitude: 13.7563,
    longitude: 100.5018,
    allowed_radius_m: 100,
    active: true,
  },
  {
    id: 'chk_02',
    name: 'จุดตรวจอาคาร A ประตูทางเข้า',
    latitude: 13.7568,
    longitude: 100.5022,
    allowed_radius_m: 80,
    active: true,
  },
  {
    id: 'chk_03',
    name: 'จุดตรวจลานจอดรถหลังอาคาร',
    latitude: 13.7559,
    longitude: 100.5012,
    allowed_radius_m: 120,
    active: true,
  },
];

let dbMemory: DatabaseSchema | null = null;

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function getThailandTime(date = new Date()) {
  // Use Intl formatters to reliably get Asia/Bangkok components
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const day = partMap.day || '01';
  const month = partMap.month || '01';
  const year = partMap.year || '2026';
  const dateTh = `${day}/${month}/${year}`;

  const hours = partMap.hour || '00';
  const minutes = partMap.minute || '00';
  const seconds = partMap.second || '00';
  const timeTh = `${hours}:${minutes}:${seconds}`;

  const utcIso = date.toISOString(); // e.g. 2026-10-23T08:19:09.123Z
  const isoWithOffset = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;

  return {
    dateTh,
    timeTh,
    utcIso,
    isoWithOffset,
    timestamp: date.getTime(),
    timezone: 'Asia/Bangkok',
  };
}

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export function initDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbMemory = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse db file, reinitializing', e);
    }
  }

  if (!dbMemory) {
    dbMemory = {
      employees: INITIAL_EMPLOYEES,
      reports: [],
      checkpoints: INITIAL_CHECKPOINTS,
      sync_logs: [],
      settings: DEFAULT_SETTINGS,
    };
    saveDb();
  } else {
    // Ensure schema keys exist
    if (!dbMemory.employees) dbMemory.employees = INITIAL_EMPLOYEES;
    if (!dbMemory.reports) dbMemory.reports = [];
    if (!dbMemory.checkpoints) dbMemory.checkpoints = INITIAL_CHECKPOINTS;
    if (!dbMemory.sync_logs) dbMemory.sync_logs = [];
    if (!dbMemory.settings) dbMemory.settings = DEFAULT_SETTINGS;
  }

  return dbMemory;
}

export function getDb(): DatabaseSchema {
  if (!dbMemory) {
    return initDb();
  }
  return dbMemory;
}

export function saveDb(): void {
  if (!dbMemory) return;
  const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(dbMemory, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

// Employee Helpers
export function getEmployees(activeOnly = true): Employee[] {
  const db = getDb();
  if (activeOnly) {
    return db.employees.filter((e) => e.active);
  }
  return db.employees;
}

export function findOrCreateEmployee(name: string): Employee {
  const db = getDb();
  const normalized = normalizeName(name);
  let emp = db.employees.find((e) => e.normalized_name.toLowerCase() === normalized.toLowerCase());

  if (emp) {
    if (!emp.active) {
      emp.active = true;
      emp.updated_at = new Date().toISOString();
      saveDb();
    }
    return emp;
  }

  const newEmp: Employee = {
    id: `emp_${crypto.randomUUID().slice(0, 8)}`,
    full_name: normalized,
    normalized_name: normalized,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.employees.push(newEmp);
  saveDb();
  return newEmp;
}

export function updateEmployee(id: string, updates: Partial<Employee>): Employee | null {
  const db = getDb();
  const emp = db.employees.find((e) => e.id === id);
  if (!emp) return null;

  if (updates.full_name) {
    emp.full_name = normalizeName(updates.full_name);
    emp.normalized_name = normalizeName(updates.full_name);
  }
  if (updates.active !== undefined) {
    emp.active = updates.active;
  }
  emp.updated_at = new Date().toISOString();
  saveDb();
  return emp;
}

// Report Helpers
export function getReports(filter?: {
  q?: string;
  startDate?: string;
  endDate?: string;
  employee?: string;
  situation?: string;
}): Report[] {
  const db = getDb();
  let list = [...db.reports];

  // Sort descending by time
  list.sort((a, b) => new Date(b.report_timestamp_utc).getTime() - new Date(a.report_timestamp_utc).getTime());

  if (!filter) return list;

  if (filter.q && filter.q.trim()) {
    const term = filter.q.trim().toLowerCase();
    list = list.filter(
      (r) =>
        r.employee_name_snapshot.toLowerCase().includes(term) ||
        r.report_date_th.includes(term) ||
        r.report_time_th.includes(term) ||
        (r.checkpoint_name && r.checkpoint_name.toLowerCase().includes(term)) ||
        (r.incident_description && r.incident_description.toLowerCase().includes(term))
    );
  }

  if (filter.employee && filter.employee.trim()) {
    const term = filter.employee.trim().toLowerCase();
    list = list.filter((r) => r.employee_name_snapshot.toLowerCase().includes(term));
  }

  if (filter.situation && filter.situation !== 'all') {
    list = list.filter((r) => r.situation === filter.situation);
  }

  if (filter.startDate) {
    // Format YYYY-MM-DD or DD/MM/YYYY
    const sDate = parseFilterDate(filter.startDate);
    if (sDate) {
      list = list.filter((r) => {
        const rDate = parseDateTh(r.report_date_th);
        return rDate ? rDate >= sDate : true;
      });
    }
  }

  if (filter.endDate) {
    const eDate = parseFilterDate(filter.endDate);
    if (eDate) {
      eDate.setHours(23, 59, 59, 999);
      list = list.filter((r) => {
        const rDate = parseDateTh(r.report_date_th);
        return rDate ? rDate <= eDate : true;
      });
    }
  }

  return list;
}

function parseFilterDate(str: string): Date | null {
  if (!str) return null;
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }
  return parseDateTh(str);
}

function parseDateTh(dateTh: string): Date | null {
  // DD/MM/YYYY
  const parts = dateTh.split('/');
  if (parts.length === 3) {
    const d = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const y = Number(parts[2]);
    return new Date(y, m, d);
  }
  return null;
}

export function getReportById(id: string): Report | null {
  const db = getDb();
  return db.reports.find((r) => r.id === id) || null;
}

export function addReport(report: Report): Report {
  const db = getDb();
  db.reports.unshift(report);
  saveDb();
  return report;
}

export function markReportsSynced(ids: string[]): void {
  const db = getDb();
  const idSet = new Set(ids);
  for (const r of db.reports) {
    if (idSet.has(r.id)) {
      r.record_status = 'synced';
    }
  }
  saveDb();
}

// Checkpoints
export function getCheckpoints(): Checkpoint[] {
  return getDb().checkpoints;
}

export function addCheckpoint(cp: Omit<Checkpoint, 'id'>): Checkpoint {
  const db = getDb();
  const newCp: Checkpoint = {
    ...cp,
    id: `chk_${crypto.randomUUID().slice(0, 8)}`,
  };
  db.checkpoints.push(newCp);
  saveDb();
  return newCp;
}

export function updateCheckpoint(id: string, updates: Partial<Checkpoint>): Checkpoint | null {
  const db = getDb();
  const cp = db.checkpoints.find((c) => c.id === id);
  if (!cp) return null;
  Object.assign(cp, updates);
  saveDb();
  return cp;
}

export function deleteCheckpoint(id: string): boolean {
  const db = getDb();
  const initialLength = db.checkpoints.length;
  db.checkpoints = db.checkpoints.filter((c) => c.id !== id);
  if (db.checkpoints.length !== initialLength) {
    saveDb();
    return true;
  }
  return false;
}

// Settings
export function getSettings(): SystemSettings {
  return getDb().settings;
}

export function updateSettings(updates: Partial<SystemSettings>): SystemSettings {
  const db = getDb();
  Object.assign(db.settings, updates);
  saveDb();
  return db.settings;
}

// Sync Logs
export function addSyncLog(log: Omit<SyncLog, 'id' | 'synced_at'>): SyncLog {
  const db = getDb();
  const newLog: SyncLog = {
    ...log,
    id: `sync_${crypto.randomUUID().slice(0, 8)}`,
    synced_at: new Date().toISOString(),
  };
  db.sync_logs.unshift(newLog);
  // Keep only last 50 logs
  if (db.sync_logs.length > 50) {
    db.sync_logs = db.sync_logs.slice(0, 50);
  }
  saveDb();
  return newLog;
}

export function getSyncLogs(): SyncLog[] {
  return getDb().sync_logs;
}

// Photos path helper
export { PHOTOS_DIR };
