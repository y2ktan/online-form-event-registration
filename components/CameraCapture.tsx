"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, RotateCcw, SwitchCamera, Zap, ZoomIn, ZoomOut, Check, X } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [capabilities, setCapabilities] = useState<MediaTrackCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const blobRef = useRef<Blob | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    stopStream();

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setHasPermission(true);

      const track = newStream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() as any : null;
      setCapabilities(caps);
      
      if (caps?.zoom) {
        setZoom((track.getSettings() as any).zoom || 1);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setHasPermission(false);
    } finally {
      setIsLoading(false);
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const handleZoom = async (value: number) => {
    const caps = capabilities as any;
    if (!streamRef.current || !caps?.zoom) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newZoom = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max || 1, value));
    
    try {
      await track.applyConstraints({ advanced: [{ zoom: newZoom }] as any });
      setZoom(newZoom);
    } catch (err) {
      console.error("Error applying zoom:", err);
    }
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // If using front camera, flip the image horizontally for a natural selfie look
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImage(dataUrl);

      // Generate blob directly from canvas for reliable upload
      canvas.toBlob(
        (blob) => { blobRef.current = blob; },
        "image/jpeg",
        0.8
      );
    }
  };

  const handleTapToFocus = async (e: React.MouseEvent<HTMLVideoElement> | React.TouchEvent<HTMLVideoElement>) => {
    if (!streamRef.current || !videoRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() as any : null;
    
    if (caps?.focusMode?.includes('manual')) {
      try {
        // Simple tap-to-focus: attempt to trigger focus at point
        // This is a simplified version as actual point-of-interest focus 
        // is not widely supported in browsers yet, but we can toggle focus mode
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }] as any
        });
        
        // Visual feedback for focus could be added here
        console.log("Attempted focus");
      } catch (err) {
        console.error("Focus error:", err);
      }
    }
  };

  const handleConfirm = () => {
    if (!capturedImage) return;
    stopStream();

    if (blobRef.current) {
      onCapture(blobRef.current);
    } else {
      // Fallback: manually convert data URL to Blob
      const parts = capturedImage.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const byteStr = atob(parts[1]);
      const buf = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i);
      onCapture(new Blob([buf], { type: mime }));
    }
  };

  const retake = () => {
    setCapturedImage(null);
    blobRef.current = null;
  };

  if (hasPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
        <Camera className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-center text-gray-600 mb-4">Camera permission denied or not available.</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const caps = capabilities as any;

  return (
    <div className="relative w-full max-w-md mx-auto aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Captured image preview overlay */}
      {capturedImage && (
        <div className="absolute inset-0 z-30">
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-8 px-4">
            <button
              onClick={retake}
              className="flex flex-col items-center gap-1 text-white group"
            >
              <div className="p-4 bg-white/20 backdrop-blur-md rounded-full group-hover:bg-white/30 transition-all">
                <RotateCcw className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium">Retake</span>
            </button>
            <button
              onClick={handleConfirm}
              className="flex flex-col items-center gap-1 text-white group"
            >
              <div className="p-4 bg-indigo-600 rounded-full group-hover:bg-indigo-500 transition-all shadow-lg">
                <Check className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium">Confirm</span>
            </button>
          </div>
        </div>
      )}

      {/* Camera live view - always mounted to preserve videoRef */}
      <div className="relative flex-1 min-h-0">
        {isLoading && !capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
        
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onClick={handleTapToFocus}
          onTouchStart={handleTapToFocus}
          className={`absolute inset-0 w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
        />

        {/* Top Controls */}
        {!capturedImage && (
          <div className="absolute top-4 left-0 right-0 flex justify-between px-4 z-20">
            <button
              onClick={onCancel}
              className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
            >
              <X className="h-6 w-6" />
            </button>
            <button
              onClick={toggleCamera}
              className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
            >
              <SwitchCamera className="h-6 w-6" />
            </button>
          </div>
        )}

        {/* Zoom Controls (Bottom Right) */}
        {!capturedImage && caps?.zoom && (
          <div className="absolute right-4 bottom-32 flex flex-col gap-3 z-20">
            <button
              onClick={() => handleZoom(zoom + 0.5)}
              className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
              title="Zoom In"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleZoom(zoom - 0.5)}
              className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Capture Button Container */}
        {!capturedImage && (
          <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20">
            <button
              onClick={capture}
              className="relative p-1 bg-white rounded-full transition-transform active:scale-95"
            >
              <div className="h-16 w-16 rounded-full border-4 border-black/10 flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-white shadow-inner"></div>
              </div>
            </button>
          </div>
        )}
        
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
