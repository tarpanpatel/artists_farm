import React, { useEffect, useState } from 'react';
import { IdCard, X, Upload, Trash2, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';
import { Guest } from '../types';
import {
  GuestIdDocument,
  fetchIdDocumentsFromDB,
  saveIdDocumentToDB,
  deleteIdDocumentFromDB,
  completeCheckinVerificationDB,
  uploadImageDB,
  resizeImageFile,
} from '../services/api';
import { t } from '../i18n/en';
import { Input } from './Input';

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

const formatUploadedAt = (dateStr: string) => {
  const dateOnly = dateStr.split(' ')[0];
  const parts = dateOnly.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
};

export const CheckinVerificationModal: React.FC<CheckinVerificationModalProps> = ({
  guest,
  isOpen,
  onClose,
  onVerificationComplete,
}) => {
  const [documents, setDocuments] = useState<GuestIdDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // Extra blank slots beyond whatever's required/already uploaded, added via
  // "+ Add More Images" - covers front/back-of-ID as separate files, or
  // guests who show up later than the original headcount.
  const [extraSlots, setExtraSlots] = useState(0);

  const requiredCount = Math.max(1, guest.numberOfGuests || 1);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setExtraSlots(0);
    setLoading(true);
    fetchIdDocumentsFromDB(guest.id).then((docs) => {
      setDocuments(docs);
      setLoading(false);
    });
  }, [isOpen, guest.id]);

  if (!isOpen) return null;

  const docForIndex = (index: number) => documents.find((d) => d.guestIndex === index);

  const handleFileSelected = async (index: number, file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setUploadingIndex(index);
    // Downscale before it ever hits the network - a phone camera photo is
    // routinely several MB, and that's almost the entire wait time on a
    // resort's connection. No FileReader/base64 preview round-trip either,
    // this flow never previews the image, only uploads it.
    const resized = await resizeImageFile(file);
    const uploadedUrl = await uploadImageDB(resized, 'id_documents');
    if (!uploadedUrl) {
      setErrorMsg('Failed to upload the photo. Please try again.');
      setUploadingIndex(null);
      return;
    }
    const result = await saveIdDocumentToDB(guest.id, index, uploadedUrl);
    if (result.success && result.document) {
      // Merge the one saved/changed row locally instead of a third
      // round-trip re-fetching the entire document list.
      setDocuments((prev) => [...prev.filter((d) => d.guestIndex !== index), result.document!]);
    } else if (result.success) {
      // Backend didn't return the row for some reason - fall back to a
      // full refresh rather than leave the UI out of sync.
      const refreshed = await fetchIdDocumentsFromDB(guest.id);
      setDocuments(refreshed);
    } else {
      setErrorMsg(result.message || 'Failed to save the uploaded ID document.');
    }
    setUploadingIndex(null);
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
      // Brief pause so the success message is actually visible, then close -
      // this used to stay open indefinitely until manually dismissed.
      setTimeout(() => onClose(), 900);
    } else {
      setErrorMsg(result.message || 'Failed to complete check-in verification.');
    }
  };

  const requiredUploadedCount = documents.filter((d) => d.guestIndex < requiredCount).length;
  const extraUploadedCount = documents.length - requiredUploadedCount;
  const allUploaded = requiredUploadedCount >= requiredCount;
  const alreadyComplete = guest.idVerificationStatus === 'Complete';

  const highestUploadedIndex = documents.reduce((max, d) => Math.max(max, d.guestIndex), -1);
  const totalSlotCount = Math.max(requiredCount, highestUploadedIndex + 1) + extraSlots;

  return (
    <div className="checkin-verification-modal__overlay fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="checkin-verification-modal__content bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="checkin-verification-modal__header flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <IdCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="checkin-verification-modal__subtitle text-lg font-semibold text-slate-800 dark:text-slate-100">
                {t('complete_checkin_heading_prefix')} {guest.guestName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {guest.roomNumber} · {requiredCount} {t('id_documents_required_text')}{requiredCount > 1 ? 's' : ''} required
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-2 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg && (
          <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">{successMsg}</p>
          </div>
        )}
        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300 font-medium">{errorMsg}</p>
          </div>
        )}
        {alreadyComplete && !successMsg && (
          <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {t('already_verified_message', "This booking's check-in is already verified. You can still replace a photo below if needed.")}
            </p>
          </div>
        )}

        {/* Upload slots */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="checkin-verification-modal__grid grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: totalSlotCount }, (_, index) => {
                const doc = docForIndex(index);
                const isUploading = uploadingIndex === index;
                const isExtra = index >= requiredCount;
                const label = isExtra ? `${t('extra_photo_label')} ${index - requiredCount + 1}` : `${t('guest_id_label')} ${index + 1} ID`;
                return (
                  <div key={index} className="space-y-1.5">
                    <label
                      className={`relative flex flex-col items-center justify-center aspect-square rounded-xl border-2 overflow-hidden cursor-pointer transition-colors ${
                        doc
                          ? 'border-emerald-300 dark:border-emerald-700'
                          : 'border-dashed border-slate-300 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500 bg-slate-50 dark:bg-slate-700'
                      }`}
                    >
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelected(index, file);
                          e.target.value = '';
                        }}
                      />
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                      ) : doc ? (
                        <img
                          src={idDocThumbUrl(doc.filePath)}
                          alt={label}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          // Documents uploaded before thumbnails existed have
                          // no file at the thumbs/ path - fall back to the
                          // full-size image rather than show a broken icon.
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src !== doc.filePath) img.src = doc.filePath;
                          }}
                        />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400" />
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-1 text-center px-1">
                            {label}
                          </span>
                        </>
                      )}
                    </label>
                    {doc && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span>{formatUploadedAt(doc.uploadedAt)}</span>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer"
                          title={t('remove_reupload_tooltip', 'Remove and re-upload')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setExtraSlots((n) => n + 1)}
              className="w-full py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> {t('add_more_images_button', 'Add More Images')}
            </button>
          </>
        )}

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center">
            {requiredUploadedCount} {t('required_uploaded_text')} {requiredCount} {t('required_uploaded_suffix')}{requiredCount > 1 ? 's' : ''} {t('uploaded_suffix')}
            {extraUploadedCount > 0 && ` (+${extraUploadedCount} ${t('extra_uploaded_suffix')})`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-100 font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {t('close_button', 'Close')}
            </button>
            <button
              onClick={handleCompleteCheckin}
              disabled={!allUploaded || completing}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
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
      </div>
    </div>
  );
};
