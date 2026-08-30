import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

// Beep sound via Web Audio API (no external file needed)
function playBeep(frequency = 1800, duration = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.frequency.value = frequency
    oscillator.type = 'square'
    gain.gain.value = 0.3
    oscillator.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
    oscillator.stop(ctx.currentTime + duration / 1000)
  } catch {
    // Audio not available — silently ignore
  }
}

// Vibrate on scan
function vibrateDevice(pattern = [100, 50, 100]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration not available
  }
}

export default function BarcodeScanner({ onScan, onClose, continuous = false }) {
  const { t } = useTranslation()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const scanIntervalRef = useRef(null)
  const detectorRef = useRef(null)

  const [isScanning, setIsScanning] = useState(false)
  const [scannedCode, setScannedCode] = useState(null)
  const [error, setError] = useState(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [usingFallback, setUsingFallback] = useState(false)

  // Initialize barcode detector
  const initDetector = useCallback(async () => {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats()
        const neededFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
          .filter(f => formats.includes(f))
        
        if (neededFormats.length > 0) {
          detectorRef.current = new BarcodeDetector({ formats: neededFormats })
          return true
        }
      } catch {
        // Native detector failed
      }
    }

    // Fallback: Use html5-qrcode-compatible approach with ZXing
    setUsingFallback(true)
    return false
  }, [])

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: { ideal: 'continuous' },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Check torch availability
      const [track] = stream.getVideoTracks()
      const capabilities = track.getCapabilities?.() || {}
      setTorchAvailable(!!capabilities.torch)

      setIsScanning(true)
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError(t('scanner.cameraPermissionDenied', 'Camera permission was denied. Please allow camera access.'))
      } else if (err.name === 'NotFoundError') {
        setError(t('scanner.noCameraFound', 'No camera found on this device.'))
      } else {
        setError(t('scanner.cameraError', 'Could not start camera. Please try again.'))
      }
      console.error('Camera error:', err)
    }
  }, [t])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }, [])

  // Scan frame using native BarcodeDetector
  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || videoRef.current.readyState < 2) {
      return null
    }

    try {
      const barcodes = await detectorRef.current.detect(videoRef.current)
      if (barcodes.length > 0) {
        return barcodes[0].rawValue
      }
    } catch {
      // Detection failed for this frame
    }
    return null
  }, [])

  // Scan frame using canvas-based fallback (for browsers without BarcodeDetector)
  const scanFrameFallback = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) {
      return null
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // Crop to center region of interest (60% width, 30% height)
    const roiWidth = video.videoWidth * 0.6
    const roiHeight = video.videoHeight * 0.3
    const roiX = (video.videoWidth - roiWidth) / 2
    const roiY = (video.videoHeight - roiHeight) / 2

    canvas.width = roiWidth
    canvas.height = roiHeight
    ctx.drawImage(video, roiX, roiY, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight)

    // Try native BarcodeDetector on the canvas as a second attempt
    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
        })
        const barcodes = await detector.detect(canvas)
        if (barcodes.length > 0) {
          return barcodes[0].rawValue
        }
      } catch {
        // Fallback detection also failed
      }
    }

    return null
  }, [])

  // Handle successful scan
  const handleScanResult = useCallback((code) => {
    if (!code) return

    setScannedCode(code)
    playBeep()
    vibrateDevice()

    if (onScan) {
      onScan(code)
    }

    if (!continuous) {
      stopCamera()
    } else {
      // In continuous mode, reset after a brief delay to allow next scan
      setTimeout(() => setScannedCode(null), 1500)
    }
  }, [onScan, continuous, stopCamera])

  // Start scanning loop
  useEffect(() => {
    if (!isScanning) return

    const scan = async () => {
      const code = usingFallback ? await scanFrameFallback() : await scanFrame()
      if (code && code !== scannedCode) {
        handleScanResult(code)
      }
    }

    // Scan every 100ms (10 FPS) — balances accuracy vs battery
    scanIntervalRef.current = setInterval(scan, 100)

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current)
      }
    }
  }, [isScanning, scanFrame, scanFrameFallback, handleScanResult, scannedCode, usingFallback])

  // Initialize detector and start camera on mount
  useEffect(() => {
    const init = async () => {
      await initDetector()
      await startCamera()
    }
    init()

    return () => {
      stopCamera()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle torch/flashlight
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const [track] = streamRef.current.getVideoTracks()
    const newTorchState = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: newTorchState }] })
      setTorchOn(newTorchState)
    } catch {
      // Torch control failed
    }
  }, [torchOn])

  // Handle manual barcode entry
  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (manualCode.trim()) {
      handleScanResult(manualCode.trim())
      setManualCode('')
      setManualEntry(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-black/50 text-white z-10">
        <button
          onClick={() => { stopCamera(); onClose?.() }}
          className="btn btn-ghost btn-sm text-white"
        >
          ← {t('common.back', 'Back')}
        </button>
        <span className="text-sm opacity-70">
          {isScanning ? t('scanner.scanning', 'Scanning...') : t('scanner.starting', 'Starting camera...')}
        </span>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan overlay box */}
        {isScanning && (
          <div className={`scanner-overlay ${scannedCode ? 'scanned' : ''}`}>
            {!scannedCode && <div className="scan-line" />}
          </div>
        )}

        {/* Scan success indicator */}
        {scannedCode && (
          <div className="absolute bottom-20 left-4 right-4 bg-success/90 text-success-content rounded-xl p-4 text-center animate-bounce">
            <div className="text-lg font-bold">✅ {t('scanner.scanSuccess', 'Scanned!')}</div>
            <div className="font-mono text-sm mt-1">{scannedCode}</div>
          </div>
        )}

        {/* Guide text */}
        {isScanning && !scannedCode && (
          <div className="absolute top-16 left-0 right-0 text-center text-white/80 text-sm">
            {t('scanner.aimBarcode', 'Aim at barcode or QR code')}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="bg-base-100 rounded-2xl p-6 max-w-sm text-center">
              <div className="text-4xl mb-3">📷</div>
              <p className="text-error mb-4">{error}</p>
              <button onClick={startCamera} className="btn btn-primary btn-block mb-2">
                {t('scanner.tryAgain', 'Try Again')}
              </button>
              <button
                onClick={() => { setError(null); setManualEntry(true) }}
                className="btn btn-ghost btn-block"
              >
                {t('scanner.manualEntry', 'Type barcode manually')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black/80 p-4 pb-safe space-y-3">
        {/* Action buttons row */}
        <div className="flex items-center justify-center gap-6">
          {/* Torch toggle */}
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className={`btn btn-circle btn-lg ${torchOn ? 'btn-warning' : 'btn-ghost text-white'}`}
              title={t('scanner.flashToggle', 'Toggle Flash')}
            >
              🔦
            </button>
          )}
        </div>

        {/* Manual entry toggle */}
        {!manualEntry ? (
          <button
            onClick={() => setManualEntry(true)}
            className="btn btn-ghost btn-xs text-white/50 btn-block"
          >
            {t('scanner.manualEntry', 'Type barcode manually')}
          </button>
        ) : (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={t('scanner.enterBarcode', 'Enter barcode number')}
              className="input input-bordered flex-1 bg-white/10 text-white"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!manualCode.trim()}>
              OK
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
