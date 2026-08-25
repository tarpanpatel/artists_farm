import React, { useEffect, useState } from 'react';
import { IdCard, Upload, Trash2, CheckCircle2, AlertCircle, Loader2, Plus } from './icons/FlowbiteIcons';
import { Modal, Alert } from 'flowbite-react';
import { X } from './icons/FlowbiteIcons';
import { Guest } from '../types';
import {
  GuestIdDocument,
  fetchIdDocumentsFromDB,
  saveIdDocumentToDB,
  deleteIdDocumentFromDB,
  completeCheckinVerificationDB,
  uploadImageDBVerbose,
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

  const requiredCount = 1;

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
    const { url: uploadedUrl, error: uploadError } = await uploadImageDBVerbose(resized, 'id_documents');
    if (!uploadedUrl) {
      // Surface the real server-side reason (auth/session expired, file too
      // large, an image format the server couldn't decode, etc.) instead of
      // one generic message no matter the cause - the old version gave no
      // way to tell those apart on a real device with no devtools open
      // (found 20 Aug 2026).
      setErrorMsg(uploadError || 'Failed to upload the photo. Please try again.');
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

  const requiredUploadedCount = documents.length;
  const allUploaded = documents.length >= requiredCount;
  const alreadyComplete = guest.idVerificationStatus === 'Complete';

  const highestUploadedIndex = documents.reduce((max, d) => Math.max(max, d.guestIndex), -1);
  const initialSlotCount = 1;
  const totalSlotCount = Math.max(initialSlotCount, highestUploadedIndex + 1) + extraSlots;

  return (
    // Modal, not Drawer (25 Aug 2026, DESIGN.md's "nested dialogs never stack a second
    // Drawer" rule) - this always opens from inside BookingDetailsModal, which is itself
    // already an open Drawer. z-70 is the correct existing scale tier for "a secondary
    // dialog stacking above an already-open page modal" (custom.css's own z-index scale) -
    // unchanged from when this was a Drawer, only the shape changed.
    <Modal show={isOpen} onClose={onClose} dismissible size="lg" popup className="z-70 checkin-verification-modal__overlay">
      <div className="flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
            <IdCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="checkin-verification-modal__subtitle text-base font-semibold text-slate-800 dark:text-slate-100 m-0">
              {t('complete_checkin_heading_prefix')} {guest.guestName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 m-0">
              {guest.roomNumber} · {requiredCount} {t('id_documents_required_text')}{requiredCount > 1 ? 's' : ''} required
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
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
              {t('already_verified_message', "This booking's check-in is already verified. You can still replace a photo below if needed.")}
            </p>
          </Alert>
        )}

        {/* Upload slots */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="checkin-verification-modal__grid grid grid-cols-2 gap-3">
              {Array.from({ length: totalSlotCount }, (_, index) => {
                const doc = docForIndex(index);
                const isUploading = uploadingIndex === index;
                const isExtra = index >= requiredCount;
                const label = isExtra ? `${t('extra_photo_label')} ${index - requiredCount + 1}` : `${t('guest_id_label')} ${index + 1} ID`;
                return (
                  <div key={index} className="space-y-1.5">
                    <label
                      className={`relative flex flex-col items-center justify-center aspect-square rounded-lg border-2 overflow-hidden cursor-pointer transition-colors ${
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
                          <span className="text-2xs text-slate-500 dark:text-slate-400 font-semibold mt-1 text-center px-1">
                            {label}
                          </span>
                        </>
                      )}
                    </label>
                    {doc && (
                      <div className="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400">
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
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col items-stretch gap-3 bg-gray-50 dark:bg-gray-850 rounded-b-lg shrink-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center m-0">
          {requiredUploadedCount} of {requiredCount} required ID document uploaded
        </p>
        <button
          onClick={handleCompleteCheckin}
          disabled={!allUploaded || completing}
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
