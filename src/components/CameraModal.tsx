import React, { useRef, useState, useEffect } from 'react';
import { Camera, RotateCcw, Check, X, SwitchCamera, Image as ImageIcon } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Photo: string) => void;
  currentPhoto: string | null;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  currentPhoto,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [tempPhoto, setTempPhoto] = useState<string | null>(currentPhoto);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);

  // Initialize camera when modal opens
  useEffect(() => {
    if (isOpen && !tempPhoto) {
      startCamera(facingMode);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async (mode: 'environment' | 'user') => {
    setIsLoadingCamera(true);
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('เบราว์เซอร์ไม่รองรับการเปิดกล้องโดยตรง กรุณาใช้การเลือกไฟล์ภาพ');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError('ไม่สามารถเปิดกล้องถ่ายทอดสดได้ (โปรดอนุญาตสิทธิ์กล้อง หรือใช้การแนบรูปภาพจากโทรศัพท์)');
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

  const handleCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');

    // Cap maximum dimension to 1280px for network efficiency
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

    // Flip if front camera
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);

    setTempPhoto(photoBase64);
    stopCamera();
  };

  const handleRetake = () => {
    setTempPhoto(null);
    startCamera(facingMode);
  };

  const handleConfirm = () => {
    if (tempPhoto) {
      onCapture(tempPhoto);
      stopCamera();
      onClose();
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        // Resize file to max 1280px
        const img = new Image();
        img.onload = () => {
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
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            setTempPhoto(compressed);
            stopCamera();
          }
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-semibold">ถ่ายรูปรายงานตัว</h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Body */}
        <div className="relative flex-1 bg-black min-h-[340px] sm:min-h-[420px] flex items-center justify-center overflow-hidden">
          {tempPhoto ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={tempPhoto}
                alt="ภาพตัวอย่างรายงานตัว"
                className="max-h-[70vh] w-auto max-w-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-emerald-950/90 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/40 backdrop-blur-sm">
                ภาพตัวอย่างพร้อมบันทึก
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              {isLoadingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-10 text-slate-300 gap-2">
                  <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">กำลังเปิดกล้อง...</span>
                </div>
              )}

              {cameraError ? (
                <div className="p-6 text-center text-slate-300 max-w-sm">
                  <p className="text-sm mb-4 text-amber-200">{cameraError}</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 shadow-lg"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>เลือกรูปภาพจากเครื่อง</span>
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover max-h-[70vh] ${
                      facingMode === 'user' ? 'scale-x-[-1]' : ''
                    }`}
                  />
                  {/* Viewfinder Overlay Guide */}
                  <div className="absolute inset-8 border border-white/20 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                    <div className="text-[11px] text-white/70 bg-black/40 px-2.5 py-0.5 rounded self-start">
                      จัดวางให้เห็นใบหน้าและจุดตรวจชัดเจน
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Hidden Canvas & File Input */}
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Controls Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          {tempPhoto ? (
            <>
              <button
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 font-medium text-sm flex items-center justify-center gap-2 transition-colors border border-slate-700"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ถ่ายใหม่</span>
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/40"
              >
                <Check className="w-4 h-4" />
                <span>ใช้รูปนี้</span>
              </button>
            </>
          ) : (
            <>
              {/* Secondary actions: Switch Camera & Select File */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  disabled={Boolean(cameraError)}
                  className="p-3 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
                  title="สลับกล้องหน้า/หลัง"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  title="แนบรูปภาพจากอัลบั้ม"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={handleCapture}
                disabled={Boolean(cameraError || isLoadingCamera)}
                className="w-16 h-16 rounded-full bg-white hover:bg-slate-200 border-4 border-slate-700 flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-40"
                aria-label="กดถ่ายภาพ"
              >
                <div className="w-12 h-12 rounded-full border-2 border-slate-900 bg-amber-400" />
              </button>

              {/* Empty placeholder for symmetry */}
              <div className="w-14" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
