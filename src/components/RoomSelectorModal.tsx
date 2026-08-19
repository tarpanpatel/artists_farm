import React from 'react';
import { Building2, ArrowRight, Lightbulb } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, Alert } from 'flowbite-react';
import { t } from '../i18n/en';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order?: number;
  is_active?: number;
}

interface RoomSelectorModalProps {
  isOpen: boolean;
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const RoomSelectorModal: React.FC<RoomSelectorModalProps> = ({
  isOpen,
  rooms,
  onSelectRoom,
  onClose,
  isLoading = false,
}) => {
  const activeRooms = rooms.filter((r) => r.is_active !== 0);

  return (
    <Modal show={isOpen} onClose={onClose} dismissible={!isLoading} size="2xl" className="z-58 room-selector-modal__root">
      <ModalHeader as="div">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="room-selector-modal__subtitle text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t('select_room_heading')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('select_room_subtext')}
            </p>
          </div>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-6">
        <div>
          {activeRooms.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">{t('no_active_rooms_text')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {activeRooms
                .sort((a, b) => (a.room_order ?? 0) - (b.room_order ?? 0))
                .map((room) => (
                  <button
                    key={room.id}
                    onClick={() => {
                      onSelectRoom(room);
                      onClose();
                    }}
                    disabled={isLoading}
                    className="group relative overflow-hidden rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-600 transition-all duration-200 p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {/* Background accent */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 group-hover:from-blue-500/10 to-transparent transition-all duration-200" />

                    {/* Content */}
                    <div className="relative z-10 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="room-selector-modal__caption font-semibold text-slate-800 dark:text-slate-100 text-sm line-clamp-1">
                            {room.name}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                            {room.slug}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all duration-200" />
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        <Alert color="blue" icon={Lightbulb} className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          <p className="text-xs font-medium">{t('room_selector_tip')}</p>
        </Alert>
      </ModalBody>
    </Modal>
  );
};
