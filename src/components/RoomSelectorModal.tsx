import React from 'react';
import { Building2, X, ArrowRight } from 'lucide-react';

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
  if (!isOpen) return null;

  const activeRooms = rooms.filter((r) => r.is_active !== 0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Select Room for New Guest
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose a room to register the guest in
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-2 rounded-lg transition-colors cursor-pointer"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Room Grid */}
        <div>
          {activeRooms.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No active rooms available</p>
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
                    className="group relative overflow-hidden rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-600 transition-all duration-200 p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {/* Background accent */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 group-hover:from-blue-500/10 to-transparent transition-all duration-200" />

                    {/* Content */}
                    <div className="relative z-10 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm line-clamp-1">
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

        {/* Footer Info */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
            💡 Tip: Select a room above to register the guest in that specific room. You can always change the room assignment later.
          </p>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="w-full py-2.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-100 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel Room Selection
        </button>
      </div>
    </div>
  );
};
