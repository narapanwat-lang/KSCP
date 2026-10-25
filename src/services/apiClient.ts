/**
 * Safe fetch helper for API calls.
 * Prevents "Unexpected token 'T', 'The page could not be found'... is not valid JSON" errors
 * by checking HTTP status, content-type headers, and parsing errors gracefully.
 */

export async function fetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (netErr: any) {
    throw new Error(`ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ${netErr.message || 'Network Error'}`);
  }

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `เซิร์ฟเวอร์แจ้งข้อผิดพลาด (HTTP ${res.status})`);
    }
    return data as T;
  }

  // If response is not JSON (e.g. Vercel 404 HTML page "The page could not be found")
  const rawText = await res.text();

  if (
    res.status === 404 ||
    rawText.includes('The page could not be found') ||
    rawText.includes('NOT_FOUND')
  ) {
    throw new Error(
      'ไม่พบปลายทาง API บนเซิร์ฟเวอร์ (HTTP 404: The page could not be found) กรุณาตรวจสอบการตั้งค่าหรือรีเฟรชหน้าเว็บ'
    );
  }

  if (!res.ok) {
    throw new Error(`เซิร์ฟเวอร์ตอบกลับรหัส ${res.status}: ${rawText.slice(0, 100)}`);
  }

  throw new Error('การตอบกลับจากเซิร์ฟเวอร์ไม่ใช่รูปแบบ JSON ที่ถูกต้อง');
}
