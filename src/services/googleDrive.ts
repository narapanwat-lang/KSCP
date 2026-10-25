import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Report } from '../types.ts';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export const TARGET_FOLDER_NAME = 'รวมรูปถ่ายรปภ.กัลยา';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
// Prompt user to select account if needed
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;
let cachedFolderId: string | null = null;
let cachedFolderWebViewLink: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // If user is logged in to Firebase but token expired in memory, prompt or refresh
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedUser = null;
      cachedAccessToken = null;
      cachedFolderId = null;
      cachedFolderWebViewLink = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถรับสิทธิ์การเข้าถึง (Access Token) จาก Google ได้');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in with Google error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return cachedUser;
};

export const logoutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedUser = null;
  cachedFolderId = null;
  cachedFolderWebViewLink = null;
};

/**
 * Searches for or creates the Google Drive folder "รวมรูปถ่ายรปภ.กัลยา"
 */
export const getOrCreateTargetFolder = async (
  folderName: string = TARGET_FOLDER_NAME
): Promise<{ id: string; webViewLink?: string }> => {
  if (cachedFolderId) {
    return { id: cachedFolderId, webViewLink: cachedFolderWebViewLink || undefined };
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error('ยังไม่ได้เข้าสู่ระบบ Google Drive กรุณากดปุ่มเชื่อมต่อ Google ก่อน');
  }

  // 1. Search for existing folder
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) {
    throw new Error(`ค้นหาโฟลเดอร์ใน Google Drive ล้มเหลว (${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const existing = searchData.files[0];
    cachedFolderId = existing.id;
    cachedFolderWebViewLink = existing.webViewLink;
    return { id: existing.id, webViewLink: existing.webViewLink };
  }

  // 2. Create the folder if not exists
  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'โฟลเดอร์จัดเก็บรูปถ่ายการรายงานตัวของพนักงาน รปภ. บริษัท กนกสุวรรณ แฟซิลิตี้ แมเนจเม้นท์ จำกัด',
      }),
    }
  );

  if (!createRes.ok) {
    throw new Error(`สร้างโฟลเดอร์ "${folderName}" ใน Google Drive ไม่สำเร็จ (${createRes.status})`);
  }

  const newFolder = await createRes.json();
  cachedFolderId = newFolder.id;
  cachedFolderWebViewLink = newFolder.webViewLink;
  return { id: newFolder.id, webViewLink: newFolder.webViewLink };
};

/**
 * Uploads a single report's photo to the Google Drive folder "รวมรูปถ่ายรปภ.กัลยา"
 */
export const uploadPhotoToGoogleDrive = async (
  report: Report,
  folderId?: string
): Promise<{ fileId: string; webViewLink?: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('ยังไม่ได้เข้าสู่ระบบ Google Drive');
  }

  const targetFolder = folderId
    ? { id: folderId }
    : await getOrCreateTargetFolder(TARGET_FOLDER_NAME);

  const photosToUpload = report.photo_urls && report.photo_urls.length > 0
    ? report.photo_urls
    : [report.photo_url];

  const cleanDate = report.report_date_th.replace(/\//g, '-');
  const cleanTime = report.report_time_th.replace(/:/g, '-');
  const situationThai =
    report.situation === 'normal'
      ? 'ปกติ'
      : report.situation === 'abnormal'
      ? 'ไม่ปกติ'
      : 'ฉุกเฉิน';

  let primaryUploadedFile: { fileId: string; webViewLink?: string } = {
    fileId: '',
    webViewLink: undefined,
  };

  for (let i = 0; i < photosToUpload.length; i++) {
    const photoUrl = photosToUpload[i];
    const imageRes = await fetch(photoUrl);
    if (!imageRes.ok) {
      continue;
    }
    const imageBlob = await imageRes.blob();

    const suffix = photosToUpload.length > 1 ? `_${i + 1}` : '';
    const fileName = `[${cleanDate}_${cleanTime}] ${report.employee_name_snapshot} - ${situationThai}${suffix}.jpg`;

    const metadata = {
      name: fileName,
      parents: [targetFolder.id],
      description: `รปภ.: ${report.employee_name_snapshot} | วันที่: ${report.report_date_th} เวลา: ${report.report_time_th} น. | สถานการณ์: ${situationThai}${
        report.incident_description ? ` (${report.incident_description})` : ''
      } | รูปที่ ${i + 1}/${photosToUpload.length} | รหัสอ้างอิง: ${report.id}`,
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataBlob = new Blob([JSON.stringify(metadata)], {
      type: 'application/json; charset=UTF-8',
    });

    const multipartBody = new Blob(
      [
        delimiter,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        metadataBlob,
        delimiter,
        'Content-Type: image/jpeg\r\n\r\n',
        imageBlob,
        closeDelimiter,
      ],
      { type: `multipart/related; boundary=${boundary}` }
    );

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      if (i === 0) {
        primaryUploadedFile = { fileId: data.id, webViewLink: data.webViewLink };
      }
    }
  }

  // 5. Update report on backend with Drive metadata
  if (primaryUploadedFile.fileId) {
    try {
      await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drive_file_id: primaryUploadedFile.fileId,
          drive_web_view_link: primaryUploadedFile.webViewLink,
          drive_synced_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.warn('Failed to persist drive sync metadata to backend', err);
    }
  }

  return primaryUploadedFile;
};

/**
 * Batch upload multiple reports' photos to the folder
 */
export const syncReportsToGoogleDrive = async (
  reports: Report[],
  onProgress?: (completed: number, total: number, currentName: string) => void
): Promise<{ successCount: number; failCount: number; errors: string[] }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('กรุณาลงชื่อเข้าใช้ Google Drive ก่อนดำเนินการ');
  }

  const folder = await getOrCreateTargetFolder(TARGET_FOLDER_NAME);
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    if (onProgress) {
      onProgress(i + 1, reports.length, r.employee_name_snapshot);
    }

    try {
      await uploadPhotoToGoogleDrive(r, folder.id);
      successCount++;
    } catch (err: any) {
      console.error(`Error uploading report ${r.id}:`, err);
      failCount++;
      errors.push(`${r.employee_name_snapshot} (${r.report_date_th}): ${err.message || 'เกิดข้อผิดพลาด'}`);
    }
  }

  return { successCount, failCount, errors };
};
