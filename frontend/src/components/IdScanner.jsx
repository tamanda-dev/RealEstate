import { useState, useRef } from 'react'
import { ScanLine, Upload, Loader2, CheckCircle2 } from 'lucide-react'

// Zimbabwean National ID: "63-123456X15" (2-digit district, 6-7 digit serial,
// 1 check letter, 2-digit district-of-origin) — dashes/spacing vary a lot in the wild,
// so this matches loosely and the raw OCR text is always shown alongside for a human to verify.
const ID_NUMBER_RE = /\b(\d{2}[\s-]?\d{6,7}[\s-]?[A-Za-z][\s-]?\d{2})\b/
const DOB_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/

function parseFields(rawText) {
  const idMatch = rawText.match(ID_NUMBER_RE)
  const dobMatch = rawText.match(DOB_RE)
  // Best-effort name guess: the longest all-caps line of letters/spaces that isn't a
  // known label — Zimbabwean ID cards print the holder's name in capitals.
  const nameGuess = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[A-Z\s'.-]{4,}$/.test(l) && !/REPUBLIC|ZIMBABWE|IDENTITY|NATIONAL|CARD|REGISTRAR/.test(l))
    .sort((a, b) => b.length - a.length)[0] || ''

  return {
    id_number: idMatch ? idMatch[1].replace(/\s+/g, '') : '',
    date_of_birth: dobMatch
      ? `${dobMatch[3].length === 2 ? '20' + dobMatch[3] : dobMatch[3]}-${dobMatch[2].padStart(2, '0')}-${dobMatch[1].padStart(2, '0')}`
      : '',
    full_name: nameGuess,
    raw_text: rawText,
  }
}

/**
 * Client-side OCR ID capture. Runs entirely in the browser via Tesseract.js — there is no
 * server-side Tesseract binary available on this deployment's shared hosting, so OCR happens
 * on the user's device and only the extracted text fields (not the image) get sent to the API.
 * Extraction is a best-effort assist, never an auto-submit: the caller must let staff review
 * and correct every field before it's saved as part of the KYC record.
 */
export default function IdScanner({ onExtracted }) {
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setDone(false)
    setError('')
  }

  const runScan = async () => {
    if (!file) return
    setScanning(true)
    setProgress(0)
    setError('')
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round((m.progress || 0) * 100))
        },
      })
      const { data } = await worker.recognize(file)
      await worker.terminate()
      const fields = parseFields(data.text || '')
      setDone(true)
      onExtracted?.(fields)
    } catch {
      setError('OCR failed to run in this browser — enter the ID details manually below.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4 bg-slate-50">
      <div className="flex items-center gap-2 mb-2">
        <ScanLine size={16} className="text-blue-600" />
        <span className="text-sm font-semibold text-slate-700">Scan ID Document (optional)</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Photograph or upload the National ID / passport. Text is extracted in your browser only —
        review and correct every field below before saving.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={inputRef} type="file" accept="image/*" capture="environment"
          onChange={handleFile} className="hidden" id="id-scan-input" />
        <label htmlFor="id-scan-input"
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-100">
          <Upload size={13} /> {file ? 'Change Image' : 'Choose / Capture Image'}
        </label>

        {file && !done && (
          <button type="button" onClick={runScan} disabled={scanning}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            {scanning ? <><Loader2 size={13} className="animate-spin" /> Scanning… {progress}%</> : <><ScanLine size={13} /> Extract Text</>}
          </button>
        )}

        {done && (
          <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
            <CheckCircle2 size={13} /> Extracted — verify fields below
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {preview && (
        <img src={preview} alt="ID preview" className="mt-3 max-h-40 rounded-lg border border-slate-200" />
      )}
    </div>
  )
}
