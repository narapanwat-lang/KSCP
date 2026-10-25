export type SituationType = 'normal' | 'abnormal' | 'emergency';

export type GpsVerificationStatus = 'passed' | 'failed' | 'not_verified' | 'gps_disabled';

export interface Employee {
  id: string;
  full_name: string;
  normalized_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowed_radius_m: number;
  active: boolean;
}

export interface Report {
  id: string;
  employee_id?: string;
  employee_name_snapshot: string;
  report_date_th: string;
  report_time_th: string;
  timezone: string;
  report_timestamp_iso: string;
  report_timestamp_utc: string;
  server_received_at: string;
  situation: SituationType;
  incident_description?: string;
  photo_url: string;
  photo_id: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
  checkpoint_id?: string | null;
  checkpoint_name?: string | null;
  gps_verification_status: GpsVerificationStatus;
  drive_file_id?: string | null;
  drive_web_view_link?: string | null;
  drive_synced_at?: string | null;
  record_status: 'active' | 'synced';
  created_at: string;
}

export interface SystemStatus {
  status: string;
  systemName: string;
  company: string;
  serverTime: {
    dateTh: string;
    timeTh: string;
    utcIso: string;
    isoWithOffset: string;
    timestamp: number;
    timezone: string;
  };
  databaseStatus: 'connected' | 'error';
  storageStatus: 'ready' | 'not_ready';
  googleSheetsStatus: 'configured' | 'not_configured';
  reportsCount: number;
  employeesCount: number;
}

export interface SyncLog {
  id: string;
  destination: string;
  sync_status: 'success' | 'failed';
  synced_at: string;
  error_message?: string;
  records_count?: number;
}

export interface SystemSettings {
  gps_required: boolean;
  company_name: string;
  google_sheets_url: string;
  auto_sync_sheets: boolean;
  last_sync_time: string | null;
}
