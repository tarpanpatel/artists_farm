import React, { useEffect, useState } from 'react';
import { IdCard, Trash2, CheckCircle2, AlertCircle, Loader2, X, ScanLine, Check, Copy } from './icons/FlowbiteIcons';
import { Modal, Alert } from 'flowbite-react';
import { Guest } from '../types';
import {
  GuestIdDocument,
  fetchIdDocumentsFromDB,
  saveIdDocumentToDB,
  deleteIdDocumentFromDB,
  completeCheckinVerificationDB,
  uploadImageDBVerbose,
  resizeImageFile,
  API_ROOT_BASE,
} from '../services/api';
import { scanPassportMrz, isOcrDisabledError, type PassportMrzResult } from '../utils/ocrScanner';
import { t } from '../i18n/en';
import { FileInput } from './FileInput';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

// upload_image.php saves a small thumbnail alongside every id_documents
// upload, at <same folder>/thumbs/<same filename> - derived here rather than
// stored, so no schema/response change was needed to wire it up.
const idDocThumbUrl = (filePath: string) => filePath.replace('/id_documents/', '/id_documents/thumbs/');

interface CheckinVerificationModalProps {
  guest: Guest;
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete: (guestId: string) => void;
}

const formatUploadedAt = formatDateDDMMYYYY;

export const CheckinVerificationModal: React.FC<CheckinVerificationModalProps> = ({
  guest,
  isOpen,
  onClose,
  onVerificationComplete,
}) => {
  const [documents, setDocuments] = useState<GuestIdDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string>('');
  const [completing, setCompleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [scanningDocId, setScanningDocId] = useState<number | null>(null);
  const [passportResults, setPassportResults] = useState<Record<number, PassportMrzResult>>({});
  const [copiedDocId, setCopiedDocId] = useState<number | null>(null);

  const requiredCount = 1;

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsUploading(false);
    setUploadProgress(null);
    setUploadProgressLabel('');
    setScanningDocId(null);
    setPassportResults({});
    setCopiedDocId(null);
    setLoading(true);
    fetchIdDocumentsFromDB(guest.id).then((docs) => {
      setDocuments(docs);
      setLoading(false);
    });
  }, [isOpen, guest.id]);

  const handleScanPassportDoc = async (docId: number, filePath: string) => {
    setScanningDocId(docId);
    setErrorMsg(null);
    try {
      const fullUrl = filePath.startsWith('http') ? filePath : `${API_ROOT_BASE}${filePath}`;
      const res = await scanPassportMrz(fullUrl);
      setPassportResults((prev) => ({ ...prev, [docId]: res }));
      if (res.passportNumber) {
        setSuccessMsg(`Passport detected: ${res.passportNumber} (${res.nationality || 'Foreign'})`);
      } else {
        setErrorMsg("Could not detect passport MRZ lines in this document. Make sure the bottom 2-line code is clear.");
      }
    } catch (err) {
      if (isOcrDisabledError(err)) {
        setErrorMsg("Document scanning is currently disabled by the administrator.");
      } else {
        setErrorMsg("Failed to scan document with OCR.");
      }
    } finally {
      setScanningDocId(null);
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsUploading(true);
    setUploadProgress(0);

    const total = files.length;
    let successCount = 0;

    // Keep track of indices already taken so each new file gets a distinct slot
    const existingIndices = new Set(documents.map((d) => d.guestIndex));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let targetIndex = 0;
      while (existingIndices.has(targetIndex)) {
        targetIndex++;
      }
      existingIndices.add(targetIndex);

      setUploadProgressLabel(
        total > 1
          ? `Uploading file ${i + 1} of ${total}: ${file.name}`
          : `Uploading ${file.name}...`
      );

      const basePct = (i / total) * 100;
      const slicePct = (1 / total) * 100;

      try {
        const resized = await resizeImageFile(file);
        const { url: uploadedUrl, error: uploadError } = await uploadImageDBVerbose(
          resized,
          'id_documents',
          (pct) => {
            const currentPct = Math.round(basePct + (pct / 100) * slicePct);
            setUploadProgress(currentPct);
          }
        );

        if (!uploadedUrl) {
          setErrorMsg(uploadError || `Failed to upload ${file.name}. Please try again.`);
          continue;
        }

        const result = await saveIdDocumentToDB(guest.id, targetIndex, uploadedUrl);
        if (result.success && result.document) {
          setDocuments((prev) => [...prev.filter((d) => d.guestIndex !== targetIndex), result.document!]);
          successCount++;
        } else if (result.success) {
          const refreshed = await fetchIdDocumentsFromDB(guest.id);
          setDocuments(refreshed);
          successCount++;
        } else {
          setErrorMsg(result.message || `Failed to save ${file.name}.`);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || `Failed to process ${file.name}.`);
      }
    }

    setUploadProgress(100);
    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(null);
      setUploadProgressLabel('');
    }, 400);

    if (successCount > 0) {
      setSuccessMsg(
        successCount === 1
          ? 'ID document uploaded successfully.'
          : `${successCount} ID documents uploaded successfully.`
      );
    }
  };

  const handleDelete = async (docId: number) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const ok = await deleteIdDocumentFromDB(docId);
    if (ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      setErrorMsg('Failed to remove the ID document. Please try again.');
    }
  };

  const handleCompleteCheckin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setCompleting(true);
    const result = await completeCheckinVerificationDB(guest.id);
    setCompleting(false);
    if (result.success) {
      setSuccessMsg('Check-in verification complete.');
      onVerificationComplete(String(guest.id));
      // Brief pause so the success message is actually visible, then close
      setTimeout(() => onClose(), 900);
    } else {
      setErrorMsg(result.message || 'Failed to complete check-in verification.');
    }
  };

  const requiredUploadedCount = documents.length;
  const allUploaded = documents.length >= requiredCount;
  const alreadyComplete = guest.idVerificationStatus === 'Complete';

  return (
    <Modal show={isOpen} onClose={onClose} dismissible size="lg" popup className="z-70 checkin-verification-modal__overlay">
      <div className="flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <IdCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="checkin-verification-modal__subtitle text-base font-semibold text-slate-800 dark:text-slate-100 m-0">
                {t('complete_checkin_heading_prefix', 'Complete Check-in —')} {guest.guestName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 m-0">
                {guest.roomNumber} · {requiredCount} {t('id_documents_required_text', 'ID document')}{requiredCount > 1 ? 's' : ''} required
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {successMsg && (
            <Alert color="success" icon={CheckCircle2} className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              <p className="text-xs font-medium">{successMsg}</p>
            </Alert>
          )}
          {errorMsg && (
            <Alert color="failure" icon={AlertCircle} className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              <p className="text-xs font-medium">{errorMsg}</p>
            </Alert>
          )}
          {alreadyComplete && !successMsg && (
            <Alert color="success" icon={CheckCircle2} className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              <p className="text-xs font-medium">
                {t('already_verified_message', "This booking's check-in is already verified. You can still upload additional or replacement documents below.")}
              </p>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Full-width Multi-File Upload Input */}
              <div className="p-3.5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-900/30 transition-colors">
                <FileInput
                  id="checkin-multi-id-upload"
                  multiple
                  accept="image/*"
                  sizing="md"
                  label={documents.length === 0 ? t('upload_guest_id_documents', 'Upload Guest ID Documents') : t('add_more_id_documents', 'Upload / Add More ID Documents')}
                  helperText={t('multiple_id_upload_hint', 'You can select multiple photos in one go (front & back ID, Aadhaar, Passport).')}
                  disabled={isUploading}
                  isUploading={isUploading}
                  progress={uploadProgress}
                  uploadProgressLabel={uploadProgressLabel}
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    if (selected.length > 0) handleFilesSelected(selected);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Uploaded Documents List */}
              {documents.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>{t('uploaded_documents_heading', 'Uploaded Documents')} ({documents.length})</span>
                    <span className="text-2xs font-medium text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('ready_for_verification', 'Ready for verification')}
                    </span>
                  </div>
                    <div className="grid grid-cols-1 gap-2.5">
                    {documents.map((doc, idx) => (
                      <div
                        key={doc.id || idx}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-2xs space-y-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={idDocThumbUrl(doc.filePath)}
                            alt={`ID Document ${idx + 1}`}
                            loading="lazy"
                            className="w-12 h-12 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (img.src !== doc.filePath) img.src = doc.filePath;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {t('guest_id_label', 'Guest ID')} #{idx + 1}
                            </p>
                            <p className="text-2xs text-slate-500 dark:text-slate-400">
                              {formatUploadedAt(doc.uploadedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleScanPassportDoc(doc.id, doc.filePath)}
                              disabled={isUploading || scanningDocId === doc.id}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
                              title={t('scan_passport_mrz_button', 'Scan Passport (OCR)')}
                            >
                              {scanningDocId === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                              ) : (
                                <ScanLine className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc.id)}
                              disabled={isUploading}
                              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
                              title={t('remove_id_document', 'Remove ID document')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Scanned Passport Details */}
                        {passportResults[doc.id] && (
                          <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs space-y-1">
                            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                              <span className="flex items-center gap-1.5">
                                <span>📘</span>
                                <span>{passportResults[doc.id].fullName || 'Foreign Passport'}</span>
                              </span>
                              {passportResults[doc.id].countryCode && (
                                <span className="text-2xs font-medium px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                                  {passportResults[doc.id].nationality || passportResults[doc.id].countryCode}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-2xs text-slate-600 dark:text-slate-300 pt-1">
                              <div>
                                <span className="text-slate-400">Passport: </span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{passportResults[doc.id].passportNumber || 'N/A'}</span>
                              </div>
                              {passportResults[doc.id].dob && (
                                <div>
                                  <span className="text-slate-400">DOB: </span>
                                  <span className="font-medium">{passportResults[doc.id].dob}</span>
                                </div>
                              )}
                              {passportResults[doc.id].expiryDate && (
                                <div>
                                  <span className="text-slate-400">Exp: </span>
                                  <span className="font-medium">{passportResults[doc.id].expiryDate}</span>
                                </div>
                              )}
                              {passportResults[doc.id].gender && (
                                <div>
                                  <span className="text-slate-400">Sex: </span>
                                  <span className="font-medium">{passportResults[doc.id].gender}</span>
                                </div>
                              )}
                            </div>
                            {passportResults[doc.id].passportNumber && (
                              <button
                                type="button"
                                onClick={() => {
                                  const text = `${passportResults[doc.id].fullName || ''} · ${passportResults[doc.id].passportNumber} · ${passportResults[doc.id].nationality || ''}`;
                                  navigator.clipboard.writeText(text);
                                  setCopiedDocId(doc.id);
                                  setTimeout(() => setCopiedDocId(null), 2000);
                                }}
                                className="mt-1 inline-flex items-center gap-1 text-2xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                              >
                                {copiedDocId === doc.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{copiedDocId === doc.id ? 'Copied to Clipboard' : 'Copy Passport Details'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col items-stretch gap-3 bg-gray-50 dark:bg-gray-850 rounded-b-lg shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center m-0">
            {requiredUploadedCount} of {requiredCount} required ID document uploaded
          </p>
          <button
            onClick={handleCompleteCheckin}
            disabled={!allUploaded || completing || isUploading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {completing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {t('completing_button', 'Completing...')}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> {t('checkin_complete_button', 'Check-in Complete')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
