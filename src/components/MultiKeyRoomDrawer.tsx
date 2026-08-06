import React, { useState, useEffect } from 'react';
import { ChevronDown, Home, Layers } from 'lucide-react';
import { navigateToRoomHash } from '../services/api';
import { t } from '../i18n/en';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order: number;
}

interface MultiKeyRoomDrawerProps {
  propertyId: number;
  propertyName: string;
  propertySlug: string;
  currentRoomSlug?: string;
  activeMenuItemKey?: string;
  onNavigateToOverview: () => void;
  onNavigateToRoom: (roomSlug: string) => void;
  rooms?: Room[];
}

export const MultiKeyRoomDrawer: React.FC<MultiKeyRoomDrawerProps> = ({
  propertyId,
  propertyName,
  propertySlug,
  currentRoomSlug,
  activeMenuItemKey,
  onNavigateToOverview,
  onNavigateToRoom,
  rooms: externalRooms,
}) => {
  const [isOpen, setIsOpen] = useState(true); // Always start open for hash-based nav
  const [rooms, setRooms] = useState<Room[]>(externalRooms || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If rooms are passed as a prop, use them directly
    if (externalRooms && externalRooms.length > 0) {
      setRooms(externalRooms);
    } else if (!externalRooms) {
      // Only fetch if no external rooms provided
      loadRooms();
    }
  }, [propertyId, externalRooms]);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setRooms(data.data.rooms || []);
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      {/* MultiKey Property Header - Collapsible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-gray-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors text-left font-medium"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="truncate">{propertyName}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Rooms List - Always Expanded for Hash Navigation */}
      {isOpen && (
        <div className="space-y-1 ml-2">
          {/* Property Overview */}
          <button
            onClick={() => {
              onNavigateToOverview?.();
            }}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-left text-sm ${
              activeMenuItemKey === 'multikey_property_overview'
                ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-900 dark:text-blue-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>{t('multikey_overview_button')}</span>
          </button>

          {/* Rooms */}
          {loading ? (
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{t('loading_rooms_text')}</div>
          ) : rooms.length === 0 ? (
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{t('no_rooms_yet_text')}</div>
          ) : (
            rooms.map((room) => {
              const isActive = activeMenuItemKey === room.slug;
              return (
              <button
                key={room.id}
                onClick={() => onNavigateToRoom?.(room.slug)}
                className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-left text-sm truncate cursor-pointer ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-900 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
                title={room.name}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0"></span>
                <span className="truncate">{room.name}</span>
              </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
