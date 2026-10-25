/**
 * Utility for stamping official Security Inspection watermarks
 * directly into image canvas pixels.
 * 
 * Features:
 * - Current Thailand Date and Time (Asia/Bangkok UTC+07:00, Thai Buddhist calendar)
 * - GPS Coordinates (Latitude, Longitude, Accuracy)
 * - Security Guard (รปภ.) Name & Situation Status (ปกติ / ไม่ปกติ / ฉุกเฉิน)
 * - Small Official Company Logo Watermark (กนกสุวรรณ Kanoksuwan Facility Management)
 * - Multi-photo numbering badge (e.g. รูปที่ 1/3)
 * - Note: Checkpoint (จุดตรวจ) is intentionally excluded per operational requirements.
 */

export interface WatermarkData {
  employeeName?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
  } | null;
  serverOffsetMs?: number;
  situation?: 'normal' | 'abnormal' | 'emergency' | string | null;
  companyName?: string;
  photoIndex?: number;
  totalPhotos?: number;
}

// In-memory cache for official company logo image
let cachedLogoImage: HTMLImageElement | null = null;
let logoLoadingPromise: Promise<HTMLImageElement | null> | null = null;

/**
 * Preloads the company logo for high-speed canvas drawing
 */
export function preloadCompanyLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (cachedLogoImage && cachedLogoImage.complete && cachedLogoImage.naturalWidth > 0) {
    return Promise.resolve(cachedLogoImage);
  }
  if (logoLoadingPromise) return logoLoadingPromise;

  logoLoadingPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedLogoImage = img;
      resolve(img);
    };
    img.onerror = () => {
      // Try fallback url
      const fallback = new Image();
      fallback.crossOrigin = 'anonymous';
      fallback.onload = () => {
        cachedLogoImage = fallback;
        resolve(fallback);
      };
      fallback.onerror = () => resolve(null);
      fallback.src = '/company_logo.jpg';
    };
    img.src = '/company_logo.jpg';
  });

  return logoLoadingPromise;
}

// Kick off preload immediately
if (typeof window !== 'undefined') {
  preloadCompanyLogo().catch(() => {});
}

/**
 * Returns Thailand (Asia/Bangkok) time formatted strings
 */
export function getThailandTimeStrings(serverOffsetMs: number = 0) {
  const adjusted = new Date(Date.now() + serverOffsetMs);

  // Format in Asia/Bangkok
  const bkk = new Date(adjusted.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));

  const day = String(bkk.getDate()).padStart(2, '0');
  const month = String(bkk.getMonth() + 1).padStart(2, '0');
  const year = bkk.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;

  const hours = String(bkk.getHours()).padStart(2, '0');
  const minutes = String(bkk.getMinutes()).padStart(2, '0');
  const seconds = String(bkk.getSeconds()).padStart(2, '0');
  const timeFormatted = `${hours}:${minutes}:${seconds}`;

  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const thaiMonthsFull = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const thaiDateShort = `${bkk.getDate()} ${thaiMonths[bkk.getMonth()]} ${year + 543}`;
  const thaiDateFull = `${bkk.getDate()} ${thaiMonthsFull[bkk.getMonth()]} พ.ศ. ${year + 543}`;

  return {
    dateFormatted,
    timeFormatted,
    thaiDateShort,
    thaiDateFull,
    timestampString: `${dateFormatted} ${timeFormatted} น. (เวลาประเทศไทย UTC+07:00)`,
    fullThaiBadge: `${thaiDateShort} เวลา ${timeFormatted} น. (Asia/Bangkok)`,
  };
}

/**
 * Helper to draw a circular clipped image on canvas
 */
function drawCircularImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number,
  borderWidth: number = 2,
  borderColor: string = '#F59E0B'
) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Outer dark background disk
  ctx.beginPath();
  ctx.arc(cx, cy, radius + borderWidth, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5, 12, 22, 0.85)';
  ctx.fill();

  // Draw circular image
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  // Draw gold outer ring
  if (borderWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Stamps security audit watermark directly onto a canvas element
 */
export async function stampSecurityWatermark(
  canvas: HTMLCanvasElement,
  data: WatermarkData
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Ensure logo is loaded
  let logoImg = cachedLogoImage;
  if (!logoImg || !logoImg.complete || logoImg.naturalWidth === 0) {
    logoImg = await preloadCompanyLogo();
  }

  const width = canvas.width;
  const height = canvas.height;

  // Responsive scale factor based on image dimensions
  const scale = Math.max(0.7, Math.min(width / 900, 2.0));
  const timeInfo = getThailandTimeStrings(data.serverOffsetMs || 0);

  // GPS Coordinates string
  let gpsText = 'พิกัด GPS: ไม่ได้ระบุตำแหน่ง';
  let gpsAccuracyText = '';
  if (data.gps && typeof data.gps.lat === 'number' && typeof data.gps.lng === 'number') {
    const latStr = data.gps.lat.toFixed(6);
    const lngStr = data.gps.lng.toFixed(6);
    gpsText = `พิกัด GPS: ${latStr}, ${lngStr}`;
    if (data.gps.accuracy) {
      gpsAccuracyText = ` (ความแม่นยำ ±${Math.round(data.gps.accuracy)} ม.)`;
    }
  }

  // Guard Name string
  const guardName = data.employeeName?.trim() || 'เจ้าหน้าที่ประจำจุด';

  // Situation status label & color
  let situationLabel = 'สถานการณ์: ปกติ (NORMAL)';
  let situationColor = '#34D399'; // Emerald
  if (data.situation === 'abnormal') {
    situationLabel = 'สถานการณ์: ไม่ปกติ (ABNORMAL)';
    situationColor = '#FBBF24'; // Amber
  } else if (data.situation === 'emergency') {
    situationLabel = 'สถานการณ์: ฉุกเฉิน (EMERGENCY)';
    situationColor = '#EF4444'; // Red
  }

  // Photo batch counter badge (if multiple photos)
  const photoBadgeText =
    data.totalPhotos && data.totalPhotos > 1
      ? `📷 รูปที่ ${(data.photoIndex ?? 0) + 1}/${data.totalPhotos}`
      : null;

  // Calculate layout sizes
  const paddingX = Math.round(20 * scale);
  const paddingY = Math.round(16 * scale);
  const bannerMargin = Math.round(14 * scale);
  const lineHeight = Math.round(24 * scale);

  // 4 rows: (1) Header/Company, (2) Thailand Time, (3) GPS, (4) Guard/Situation
  const rowCount = 4;
  const bannerContentHeight = Math.round(rowCount * lineHeight + 34 * scale);
  const bannerWidth = width - bannerMargin * 2;
  const bannerY = height - bannerContentHeight - bannerMargin;
  const bannerX = bannerMargin;
  const borderRadius = Math.round(12 * scale);

  ctx.save();

  // 1. Draw banner background (translucent dark slate with gradient for maximum readability)
  const bgGradient = ctx.createLinearGradient(bannerX, bannerY, bannerX, bannerY + bannerContentHeight);
  bgGradient.addColorStop(0, 'rgba(8, 14, 26, 0.93)');
  bgGradient.addColorStop(1, 'rgba(2, 6, 15, 0.97)');

  // Rounded rectangle path
  ctx.beginPath();
  ctx.moveTo(bannerX + borderRadius, bannerY);
  ctx.lineTo(bannerX + bannerWidth - borderRadius, bannerY);
  ctx.quadraticCurveTo(bannerX + bannerWidth, bannerY, bannerX + bannerWidth, bannerY + borderRadius);
  ctx.lineTo(bannerX + bannerWidth, bannerY + bannerContentHeight - borderRadius);
  ctx.quadraticCurveTo(bannerX + bannerWidth, bannerY + bannerContentHeight, bannerX + bannerWidth - borderRadius, bannerY + bannerContentHeight);
  ctx.lineTo(bannerX + borderRadius, bannerY + bannerContentHeight);
  ctx.quadraticCurveTo(bannerX, bannerY + bannerContentHeight, bannerX, bannerY + bannerContentHeight - borderRadius);
  ctx.lineTo(bannerX, bannerY + borderRadius);
  ctx.quadraticCurveTo(bannerX, bannerY, bannerX + borderRadius, bannerY);
  ctx.closePath();

  // Outer shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 12 * scale;
  ctx.fillStyle = bgGradient;
  ctx.fill();

  // Border outline
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.stroke();

  // Reset shadow for text and icons
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Left decorative accent bar (Amber/Gold security color)
  const accentBarWidth = Math.round(6 * scale);
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(bannerX + borderRadius, bannerY);
  ctx.lineTo(bannerX + borderRadius + accentBarWidth, bannerY);
  ctx.lineTo(bannerX + borderRadius + accentBarWidth, bannerY + bannerContentHeight);
  ctx.lineTo(bannerX + borderRadius, bannerY + bannerContentHeight);
  ctx.quadraticCurveTo(bannerX, bannerY + bannerContentHeight, bannerX, bannerY + bannerContentHeight - borderRadius);
  ctx.lineTo(bannerX, bannerY + borderRadius);
  ctx.quadraticCurveTo(bannerX, bannerY, bannerX + borderRadius, bannerY);
  ctx.closePath();
  ctx.fill();

  // Content start coordinates
  const contentLeft = bannerX + paddingX + accentBarWidth + Math.round(8 * scale);
  const maxContentWidth = bannerWidth - (paddingX * 2 + accentBarWidth + Math.round(16 * scale));
  let currentY = bannerY + paddingY + Math.round(12 * scale);

  // Set font base
  const fontSans = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", "Prompt", "Sarabun", sans-serif';
  const fontMono = '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

  // Helper to draw text with drop shadow for clarity
  const drawTextWithShadow = (
    text: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: CanvasTextAlign = 'left'
  ) => {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetX = 1 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  // Helper to truncate text to fit width
  const fitText = (text: string, font: string, maxWidth: number): string => {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 3 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  };

  // ROW 1: HEADER WITH LOGO ICON & COMPANY NAME
  let headerTextX = contentLeft;
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const bannerLogoRadius = Math.round(13 * scale);
    const bannerLogoCy = currentY;
    const bannerLogoCx = contentLeft + bannerLogoRadius;
    drawCircularImage(ctx, logoImg, bannerLogoCx, bannerLogoCy, bannerLogoRadius, 1.5 * scale, '#F59E0B');
    headerTextX = bannerLogoCx + bannerLogoRadius + Math.round(8 * scale);
  }

  const headerFont = `bold ${Math.round(13 * scale)}px ${fontSans}`;
  const headerText = 'บจก. รักษาความปลอดภัย กนกสุวรรณ — KSCP PATROL';
  drawTextWithShadow(headerText, headerTextX, currentY, headerFont, '#FBBF24');

  // Right top pill badge: Photo index or Timezone
  if (photoBadgeText) {
    const badgeFont = `bold ${Math.round(11 * scale)}px ${fontSans}`;
    drawTextWithShadow(
      photoBadgeText,
      bannerX + bannerWidth - paddingX,
      currentY,
      badgeFont,
      '#67E8F9',
      'right'
    );
  } else {
    const timezoneBadge = 'เวลาประเทศไทย (Asia/Bangkok)';
    const badgeFont = `600 ${Math.round(10.5 * scale)}px ${fontSans}`;
    drawTextWithShadow(
      timezoneBadge,
      bannerX + bannerWidth - paddingX,
      currentY,
      badgeFont,
      '#93C5FD',
      'right'
    );
  }

  currentY += Math.round(20 * scale);

  // Separator line
  ctx.beginPath();
  ctx.moveTo(contentLeft, currentY - Math.round(8 * scale));
  ctx.lineTo(bannerX + bannerWidth - paddingX, currentY - Math.round(8 * scale));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = Math.max(1, 1 * scale);
  ctx.stroke();

  // ROW 2: THAILAND DATE & TIME
  const timeLabelFont = `bold ${Math.round(13 * scale)}px ${fontSans}`;
  const timeValueFont = `bold ${Math.round(15.5 * scale)}px ${fontMono}`;

  drawTextWithShadow('🕒 วัน-เวลา (ไทย):', contentLeft, currentY, timeLabelFont, '#E2E8F0');

  const timeLabelWidth = ctx.measureText('🕒 วัน-เวลา (ไทย): ').width;
  const timeDisplay = `${timeInfo.dateFormatted}  ${timeInfo.timeFormatted} น.`;
  drawTextWithShadow(timeDisplay, contentLeft + timeLabelWidth, currentY, timeValueFont, '#FFFFFF');

  // Thai Date Short label on right
  const thaiDateNote = `(${timeInfo.thaiDateShort})`;
  const thaiDateNoteFont = `600 ${Math.round(11 * scale)}px ${fontSans}`;
  drawTextWithShadow(
    thaiDateNote,
    bannerX + bannerWidth - paddingX,
    currentY,
    thaiDateNoteFont,
    '#CBD5E1',
    'right'
  );

  currentY += lineHeight;

  // ROW 3: GPS COORDINATES
  const gpsLabelFont = `bold ${Math.round(13 * scale)}px ${fontSans}`;
  const gpsValueFont = `600 ${Math.round(13 * scale)}px ${fontMono}`;

  drawTextWithShadow('🌐 พิกัดที่ถ่าย:', contentLeft, currentY, gpsLabelFont, '#E2E8F0');

  const gpsLabelWidth = ctx.measureText('🌐 พิกัดที่ถ่าย: ').width;
  const fullGpsString = gpsText + gpsAccuracyText;
  const fittedGps = fitText(fullGpsString, gpsValueFont, maxContentWidth - gpsLabelWidth);
  const gpsColor = data.gps ? '#38BDF8' : '#FCD34D';
  drawTextWithShadow(fittedGps, contentLeft + gpsLabelWidth, currentY, gpsValueFont, gpsColor);

  currentY += lineHeight;

  // ROW 4: GUARD NAME & SITUATION STATUS
  const guardLabelFont = `bold ${Math.round(12.5 * scale)}px ${fontSans}`;
  const guardValueFont = `600 ${Math.round(13 * scale)}px ${fontSans}`;

  drawTextWithShadow('👤 จนท. รปภ.:', contentLeft, currentY, guardLabelFont, '#E2E8F0');

  const guardLabelWidth = ctx.measureText('👤 จนท. รปภ.: ').width;
  const fittedGuard = fitText(guardName, guardValueFont, (maxContentWidth - guardLabelWidth) * 0.52);
  drawTextWithShadow(fittedGuard, contentLeft + guardLabelWidth, currentY, guardValueFont, '#FFFFFF');

  // Situation badge on right
  const sitFont = `bold ${Math.round(11.5 * scale)}px ${fontSans}`;
  drawTextWithShadow(
    situationLabel,
    bannerX + bannerWidth - paddingX,
    currentY,
    sitFont,
    situationColor,
    'right'
  );

  // ==========================================
  // TOP-LEFT CORNER: SMALL COMPANY LOGO WATERMARK EMBLEM
  // ==========================================
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const emblemRadius = Math.round(28 * scale); // ~56px diameter scaled
    const emblemCx = Math.round(20 * scale) + emblemRadius;
    const emblemCy = Math.round(20 * scale) + emblemRadius;

    // Draw circular emblem with crisp border
    drawCircularImage(ctx, logoImg, emblemCx, emblemCy, emblemRadius, 2.5 * scale, '#F59E0B');

    // Subtle side company branding badge
    const brandX = emblemCx + emblemRadius + Math.round(10 * scale);
    const brandY1 = emblemCy - Math.round(7 * scale);
    const brandY2 = emblemCy + Math.round(8 * scale);

    const brandTopFont = `bold ${Math.round(11.5 * scale)}px ${fontSans}`;
    const brandBottomFont = `600 ${Math.round(8.5 * scale)}px ${fontSans}`;

    drawTextWithShadow('บริษัท กนกสุวรรณ จำกัด', brandX, brandY1, brandTopFont, '#FFFFFF');
    drawTextWithShadow('KANOKSUWAN FACILITY MANAGEMENT', brandX, brandY2, brandBottomFont, '#FBBF24');
  }

  // ==========================================
  // TOP-RIGHT CORNER: AUDIT VERIFIED SEAL
  // ==========================================
  const sealX = width - Math.round(20 * scale);
  const sealY = Math.round(24 * scale);
  const sealFont = `700 ${Math.round(10 * scale)}px ${fontSans}`;
  drawTextWithShadow(
    'KSCP VERIFIED INSPECTION PHOTO',
    sealX,
    sealY,
    sealFont,
    'rgba(255, 255, 255, 0.85)',
    'right'
  );
  drawTextWithShadow(
    `${timeInfo.dateFormatted} • ${timeInfo.timeFormatted}`,
    sealX,
    sealY + Math.round(14 * scale),
    `600 ${Math.round(9.5 * scale)}px ${fontMono}`,
    'rgba(251, 191, 36, 0.95)',
    'right'
  );

  ctx.restore();
}
