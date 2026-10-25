import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  RotateCcw,
  Check,
  X,
  SwitchCamera,
  Image as ImageIcon,
  Clock,
  Navigation,
  AlertCircle,
  Plus,
  Trash2,
  Images,
} from 'lucide-react';
import {
  stampSecurityWatermark,
  getThailandTimeStrings,
  WatermarkData,
} from '../utils/watermark.ts';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePhotos: (photos: string[]) => void;
  currentPhotos?: string[];
  employeeName?: string;
  locationDetails?: string;
  gpsLocation?: { lat: number; lng: number; accuracy: number } | null;
  onUpdateGpsLocation?: (loc: { lat: number; lng: number; accuracy: number }) => void;
  serverOffsetMs?: number;
  situation?: 'normal' | 'abnormal' | 'emergency' | null;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onSavePhotos,
  currentPhotos = [],
  employeeName = '',
  locationDetails = '',
  gpsLocation = null,
  onUpdateGpsLocation,
  serverOffsetMs = 0,
  situation = 'normal',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>(currentPhotos);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Live GPS state within camera modal
  const [liveGps, setLiveGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(gpsLocation);
  const [isLocatingGps, setIsLocatingGps] = useState(false);

  // Live Thailand clock ticker for viewfinder HUD
  const [liveClock, setLiveClock] = useState(() => getThailandTimeStrings(serverOffsetMs));

  // Sync initial photos when modal opens
  useEffect(() => {
    if (isOpen) {
      setCapturedPhotos(currentPhotos || []);
      // If there are existing photos, start with camera open unless specified
      setActivePreviewIndex(null);
    }
  }, [isOpen, currentPhotos]);

  // Live clock tick
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setLiveClock(getThailandTimeStrings(serverOffsetMs));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, serverOffsetMs]);

  // GPS auto-acquire when camera opens
  useEffect(() => {
    if (isOpen) {
      refreshGpsLocation();
    }
  }, [isOpen]);

  const refreshGpsLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setLiveGps(coords);
        setIsLocatingGps(false);
        if (onUpdateGpsLocation) {
          onUpdateGpsLocation(coords);
        }
      },
      (err) => {
        console.warn('Could not get live GPS inside camera:', err);
        setIsLocatingGps(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );
  };

  // Start or restart camera stream
  const startCamera = async (mode: 'environment' | 'user') => {
    stopCamera();
    setIsLoadingCamera(true);
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้องโดยตรง');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      let errorMsg = 'ไม่สามารถเปิดกล้องได้ โปรดอนุญาตสิทธิ์เข้าถึงกล้องถ่ายภาพ';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'ถูกปฏิเสธสิทธิ์การเข้าถึงกล้อง โปรดอนุญาตสิทธิ์กล้องในเบราว์เซอร์';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'ไม่พบอุปกรณ์กล้องบนอุปกรณ์นี้';
      }
      setCameraError(errorMsg);
    } finally {
      setIsLoadingCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Lifecycle when open/close or facingMode changes
  useEffect(() => {
    if (isOpen && activePreviewIndex === null) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, activePreviewIndex]);

  /**
   * Capture photo from video stream and stamp watermark
   */
  const handleCapture = async () => {
    if (!videoRef.current || isProcessingPhoto) return;
    setIsProcessingPhoto(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');

      let width = video.videoWidth || 640;
      let height = video.videoHeight || 480;
      const maxDim = 1280;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Flip horizontally if front camera was used
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      // Draw raw captured frame
      ctx.drawImage(video, 0, 0, width, height);

      // Reset transform if mirrored
      if (facingMode === 'user') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // Stamp Official Security Watermark (Thai time, GPS, Guard, Company Logo)
      const nextIndex = capturedPhotos.length;
      const nextTotal = nextIndex + 1;

      const watermarkData: WatermarkData = {
        employeeName: employeeName.trim(),
        locationDetails,
        gps: liveGps,
        serverOffsetMs,
        situation,
        photoIndex: nextIndex,
        totalPhotos: nextTotal,
      };

      await stampSecurityWatermark(canvas, watermarkData);

      // Export high-quality JPEG base64
      const photoBase64 = canvas.toDataURL('image/jpeg', 0.88);

      const updated = [...capturedPhotos, photoBase64];
      setCapturedPhotos(updated);
      setActivePreviewIndex(updated.length - 1);
      stopCamera();
    } catch (err) {
      console.error('Error capturing photo:', err);
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  /**
   * Process and watermark an uploaded image file
   */
  const processImageFile = (file: File, photoIndex: number, totalPhotos: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (!result) return reject(new Error('Cannot read file'));

        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1280;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context not available'));

          ctx.drawImage(img, 0, 0, width, height);

          // Stamp watermark with company logo, time, GPS, Guard info
          const watermarkData: WatermarkData = {
            employeeName: employeeName.trim(),
            locationDetails,
            gps: liveGps,
            serverOffsetMs,
            situation,
            photoIndex,
            totalPhotos,
          };

          await stampSecurityWatermark(canvas, watermarkData);
          const compressed = canvas.toDataURL('image/jpeg', 0.88);
          resolve(compressed);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = result;
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  };

  /**
   * Handle image upload from file or gallery (supports multiple files)
   */
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPhoto(true);
    try {
      const newStamped: string[] = [];
      const totalBatch = capturedPhotos.length + files.length;

      for (let i = 0; i < files.length; i++) {
        const stamped = await processImageFile(
          files[i],
          capturedPhotos.length + i,
          totalBatch
        );
        newStamped.push(stamped);
      }

      const updated = [...capturedPhotos, ...newStamped];
      setCapturedPhotos(updated);
      setActivePreviewIndex(updated.length - 1);
      stopCamera();
    } catch (err) {
      console.error('File process error:', err);
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeletePhoto = (indexToDelete: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = capturedPhotos.filter((_, idx) => idx !== indexToDelete);
    setCapturedPhotos(updated);

    if (updated.length === 0) {
      setActivePreviewIndex(null);
      startCamera(facingMode);
    } else if (activePreviewIndex === indexToDelete) {
      setActivePreviewIndex(Math.max(0, indexToDelete - 1));
    } else if (activePreviewIndex !== null && activePreviewIndex > indexToDelete) {
      setActivePreviewIndex(activePreviewIndex - 1);
    }
  };

  const handleShootMore = () => {
    setActivePreviewIndex(null);
    startCamera(facingMode);
  };

  const handleConfirmAll = () => {
    if (capturedPhotos.length > 0) {
      onSavePhotos(capturedPhotos);
      stopCamera();
      onClose();
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  if (!isOpen) return null;

  const currentPreviewPhoto =
    activePreviewIndex !== null && capturedPhotos[activePreviewIndex]
      ? capturedPhotos[activePreviewIndex]
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh] border border-slate-700/80">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 bg-slate-950 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-amber-400/80 bg-emerald-950 p-0.5 shrink-0">
              <img
                src="/company_logo.jpg"
                alt="โลโก้กนกสุวรรณ"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold flex items-center gap-1.5 leading-tight">
                <span>กล้องถ่ายรายงานตัว รปภ.</span>
                {capturedPhotos.length > 0 && (
                  <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-medium">
                    {capturedPhotos.length} รูป
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                ประทับตราวัน-เวลาไทย, พิกัด GPS, และโลโก้กนกสุวรรณลงในรูปภาพอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Body */}
        <div className="relative flex-1 bg-black min-h-[380px] sm:min-h-[460px] flex items-center justify-center overflow-hidden">
          {currentPreviewPhoto ? (
            /* PREVIEW OF STAMPED PHOTO */
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-black p-1 sm:p-2">
              <img
                src={currentPreviewPhoto}
                alt="ภาพตัวอย่างตรวจจุด รปภ. ที่ประทับตราแล้ว"
                className="max-h-[64vh] w-auto max-w-full rounded-xl object-contain border border-slate-700/60 shadow-2xl"
              />
              {/* Floating verified badge */}
              <div className="absolute top-4 left-4 bg-emerald-950/90 text-emerald-300 text-xs px-3 py-1.5 rounded-xl border border-emerald-500/50 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span className="font-semibold">
                  ประทับตราเวลาไทย, GPS & โลโก้แล้ว (รูปที่ {activePreviewIndex! + 1}/{capturedPhotos.length})
                </span>
              </div>
            </div>
          ) : (
            /* LIVE CAMERA STREAM WITH SECURITY HUD OVERLAY */
            <div className="relative w-full h-full flex items-center justify-center">
              {isLoadingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 z-20 text-slate-300 gap-2.5">
                  <div className="w-9 h-9 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium">กำลังเปิดกล้อง...</span>
                </div>
              )}

              {isProcessingPhoto && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 z-30 text-amber-300 gap-2.5">
                  <div className="w-9 h-9 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold">กำลังประทับตราลายน้ำและบันทึกภาพ...</span>
                </div>
              )}

              {cameraError ? (
                <div className="p-6 text-center text-slate-300 max-w-sm z-10">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto mb-3 border border-amber-500/30">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm mb-4 text-amber-200 leading-relaxed">{cameraError}</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>เลือกรูปภาพจากโทรศัพท์/เครื่อง</span>
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover max-h-[72vh] ${
                      facingMode === 'user' ? 'scale-x-[-1]' : ''
                    }`}
                  />

                  {/* LIVE HUD OVERLAY */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4 z-10">
                    
                    {/* Top Row: Live Clock Badge & Company Logo */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="bg-black/75 backdrop-blur-md rounded-xl p-2 sm:p-2.5 border border-white/20 text-white shadow-lg space-y-0.5">
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-mono tracking-wider">{liveClock.timeFormatted} น.</span>
                          <span className="text-[10px] text-amber-200/80 font-normal hidden sm:inline">(เวลาไทย)</span>
                        </div>
                        <div className="text-[11px] text-slate-200 font-medium">
                          {liveClock.thaiDateShort}
                        </div>
                      </div>

                      <div className="bg-emerald-950/85 backdrop-blur-md rounded-xl px-2.5 py-1.5 border border-amber-500/50 text-white shadow-lg flex items-center gap-2">
                        <img
                          src="/company_logo.jpg"
                          alt="กนกสุวรรณ"
                          className="w-5 h-5 rounded-full object-contain"
                        />
                        <span className="text-xs font-bold text-amber-300">
                          กนกสุวรรณ
                        </span>
                      </div>
                    </div>

                    {/* Center Viewfinder Framing Target */}
                    <div className="relative flex-1 flex items-center justify-center my-4">
                      <div className="w-56 h-56 sm:w-64 sm:h-64 border-2 border-white/30 rounded-3xl relative pointer-events-none">
                        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />
                        
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-6 h-0.5 bg-white/40" />
                          <div className="h-6 w-0.5 bg-white/40 absolute" />
                        </div>
                      </div>
                    </div>

                    {/* Bottom HUD: Live GPS Indicator */}
                    <div className="space-y-1.5">
                      <div className="bg-black/75 backdrop-blur-md rounded-xl p-2.5 border border-white/20 text-white flex items-center justify-between text-xs shadow-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <Navigation className={`w-3.5 h-3.5 ${isLocatingGps ? 'text-amber-400 animate-spin' : liveGps ? 'text-sky-400' : 'text-slate-400'}`} />
                          <span className="truncate font-mono text-[11px] sm:text-xs">
                            {liveGps
                              ? `พิกัด GPS: ${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)} (±${liveGps.accuracy}ม.)`
                              : isLocatingGps
                              ? 'กำลังค้นหาสัญญาณพิกัด GPS...'
                              : 'พิกัด: รอรับสัญญาณ GPS'}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full shrink-0 ml-2">
                          ตราประทับตรวจ รปภ.
                        </span>
                      </div>

                      <div className="text-[10px] text-center text-slate-300/80 bg-black/60 py-1 px-2 rounded-lg">
                        ⚠️ ระบบจะประทับตราวัน-เวลาไทย, พิกัด GPS และโลโก้กนกสุวรรณลงในรูปภาพอัตโนมัติ
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Thumbnail Gallery Strip (If photos have been taken) */}
        {capturedPhotos.length > 0 && (
          <div className="bg-slate-950 px-3 py-2 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
            <div className="text-[11px] font-medium text-slate-400 shrink-0 flex items-center gap-1">
              <Images className="w-3.5 h-3.5 text-amber-400" />
              <span>รูปที่ถ่ายแล้ว ({capturedPhotos.length}):</span>
            </div>

            {capturedPhotos.map((photo, idx) => {
              const isActive = activePreviewIndex === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActivePreviewIndex(idx)}
                  className={`relative group shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    isActive ? 'border-amber-400 ring-2 ring-amber-400/30 scale-105' : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <img
                    src={photo}
                    alt={`รูปที่ ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-center text-white font-mono">
                    #{idx + 1}
                  </span>
                  {/* Delete thumbnail button */}
                  <button
                    type="button"
                    onClick={(e) => handleDeletePhoto(idx, e)}
                    className="absolute top-0 right-0 p-0.5 bg-red-600/90 text-white rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                    title="ลบรูปนี้"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}

            {/* + Add Photo button in strip */}
            <button
              type="button"
              onClick={handleShootMore}
              className="shrink-0 w-12 h-12 rounded-lg border-2 border-dashed border-slate-700 hover:border-amber-400 text-slate-400 hover:text-amber-300 flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-colors cursor-pointer bg-slate-900"
              title="ถ่ายรูปเพิ่ม"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่ม</span>
            </button>
          </div>
        )}

        {/* Hidden Canvas & File Input */}
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Controls Bar */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 sm:gap-3">
          {currentPreviewPhoto ? (
            /* PREVIEW MODE CONTROLS */
            <>
              <button
                type="button"
                onClick={() => handleDeletePhoto(activePreviewIndex!)}
                className="py-2.5 px-3 rounded-xl bg-slate-800 text-red-300 hover:bg-red-950/60 hover:text-red-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                title="ลบรูปภาพนี้"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>ลบรูปนี้</span>
              </button>

              <button
                type="button"
                onClick={handleShootMore}
                className="py-2.5 px-3.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>ถ่ายรูปเพิ่ม</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmAll}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-emerald-900/40 cursor-pointer"
              >
                <Check className="w-4.5 h-4.5 stroke-[2.5]" />
                <span>ใช้รูปภาพ ({capturedPhotos.length} รูป)</span>
              </button>
            </>
          ) : (
            /* LIVE CAMERA MODE CONTROLS */
            <>
              {/* Secondary actions: Switch Camera & Select File */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  disabled={Boolean(cameraError)}
                  className="p-3 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                  title="สลับกล้องหน้า/หลัง"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                  title="แนบรูปภาพจากอัลบั้ม (เลือกได้หลายรูป)"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={handleCapture}
                disabled={Boolean(cameraError || isLoadingCamera || isProcessingPhoto)}
                className="w-16 h-16 rounded-full bg-white hover:bg-slate-100 border-4 border-slate-700 flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                aria-label="กดถ่ายภาพรายงานตัว"
                title="กดถ่ายภาพรายงานตัว"
              >
                <div className="w-12 h-12 rounded-full border-2 border-slate-900 bg-amber-400 flex items-center justify-center shadow-inner">
                  <Camera className="w-5 h-5 text-slate-900" />
                </div>
              </button>

              {/* Right side: Finish button if already have photos, or GPS refresh */}
              <div className="flex items-center justify-end gap-1.5 min-w-[80px]">
                {capturedPhotos.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleConfirmAll}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-md cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>เสร็จ ({capturedPhotos.length})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={refreshGpsLocation}
                    disabled={isLocatingGps}
                    className="p-2.5 rounded-xl bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 text-xs flex items-center gap-1 border border-slate-700 cursor-pointer"
                    title="รีเฟรชพิกัด GPS"
                  >
                    <Navigation className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-spin text-amber-400' : 'text-sky-400'}`} />
                    <span className="text-[10px] hidden sm:inline">GPS</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
