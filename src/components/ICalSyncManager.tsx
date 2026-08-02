import React, { useState, useEffect } from 'react';
import { Copy, Check, AlertCircle, Trash2, Edit2, X } from 'lucide-react';
import { getPropertySlug, getPropertyAndRoomSlugs } from '../services/api';

interface Calendar {
  id: number;
  ical_url: string;
  service_name: string;
  last_sync?: string;
}

interface ICalSyncManagerProps {
  propertyId?: number;
}

export const ICalSyncManager: React.FC<ICalSyncManagerProps> = ({ propertyId }) => {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [exportUrl, setExportUrl] = useState('');
  const [copiedExport, setCopiedExport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentRoomSlug, setCurrentRoomSlug] = useState<string | null>(null);
  const [propertyRooms, setPropertyRooms] = useState<any[]>([]);
  const [copiedUrls, setCopiedUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    const { roomSlug } = getPropertyAndRoomSlugs();
    setCurrentRoomSlug(roomSlug || null);
    generateExportUrl();
    loadCalendar();

    // Always fetch property rooms for display
    if (propertyId) {
      fetchPropertyRooms(propertyId);
    }
  }, [propertyId]);

  const fetchPropertyRooms = async (id: number) => {
    try {
      const response = await fetch(`/php/api/router.php?action=get_multikey_property&property_id=${id}`, {
        credentials: 'include',
      });
      const data = await response.json();
      console.log('[ICalSyncManager] Fetched rooms:', data.data?.rooms);
      if (data.success && data.data?.rooms) {
        setPropertyRooms(data.data.rooms);
      }
    } catch (err) {
      console.error('Failed to fetch property rooms:', err);
    }
  };

  const generateExportUrl = () => {
    const { propertySlug, roomSlug } = getPropertyAndRoomSlugs();
    let url = `${window.location.origin}/artists_farm/php/api/ical_export.php?property=${propertySlug}`;
    if (roomSlug) {
      url += `&room=${roomSlug}`;
    }
    setExportUrl(url);
  };

  const loadCalendar = async () => {
    try {
      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=get_ical_syncs', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.status === 'success' && data.data && data.data.length > 0) {
        setCalendar(data.data[0]);
        setImportUrl(data.data[0].ical_url || '');
      }
    } catch (error) {
      console.error('Failed to load calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCalendar = async () => {
    if (!importUrl.trim()) {
      setMessage('Please enter an iCal URL');
      return;
    }

    try {
      const action = calendar ? 'update_ical_sync' : 'create_ical_sync';
      const payload = {
        ...(calendar && { id: calendar.id }),
        ical_url: importUrl,
        service_type: 'ical',
        service_name: calendar?.service_name || 'Property Calendar',
        sync_enabled: true,
        sync_direction: 'bidirectional',
      };

      console.log('📤 Sending request:', {
        action,
        url: `/artists_farm/php/api/ical_sync.php?action=${action}`,
        payload,
      });

      const propertySlug = getPropertySlug();
      const response = await fetch(`/artists_farm/php/api/ical_sync.php?action=${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Property-Slug': propertySlug,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log('📥 Response:', { status: response.status, body: responseText });

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ Failed to parse JSON:', responseText);
        setMessage('✗ Server error: Invalid response format');
        return;
      }

      if (data.status === 'success') {
        let successMsg = '✓ Calendar saved successfully';
        if (data.sync_status === 'success') {
          successMsg += ' - ' + (data.sync_message || 'Events synced');
        }
        setMessage(successMsg);
        setIsEditing(false);
        loadCalendar();
        setTimeout(() => setMessage(''), 5000);
      } else {
        console.error('❌ API error:', data);
        setMessage('✗ ' + (data.message || 'Save failed'));
      }
    } catch (error: any) {
      console.error('❌ Network/Runtime error:', error);
      setMessage('✗ Error: ' + (error?.message || 'Network error'));
    }
  };

  const handleDelete = async () => {
    if (!calendar) return;
    if (!window.confirm('Delete this calendar sync?')) return;

    try {
      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=delete_ical_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: calendar.id }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        setMessage('✓ Calendar deleted');
        setCalendar(null);
        setImportUrl('');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('✗ Delete failed');
      }
    } catch (error: any) {
      setMessage('✗ Error deleting calendar');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">iCal Calendar Sync</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {currentRoomSlug
            ? `Manage this room's calendar synchronization`
            : "Manage your property's calendar synchronization"}
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.startsWith('✓')
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <AlertCircle size={20} className={message.startsWith('✓') ? 'text-green-600' : 'text-red-600'} />
          <span className={message.startsWith('✓') ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
            {message}
          </span>
        </div>
      )}

      {/* Only show property-level sections if NOT a MultiKey property */}
      {propertyRooms.length === 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Import Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Import Calendar</h2>
            {calendar && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
            )}
          </div>

          {calendar && !isEditing ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Connected Calendar</p>
                <p className="font-semibold text-gray-900 dark:text-white">{calendar.service_name}</p>
              </div>
              {calendar.last_sync && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Last synced: {new Date(calendar.last_sync).toLocaleString()}
                  </p>
                </div>
              )}
              <button
                onClick={() => handleDelete()}
                className="w-full px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Remove Calendar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {calendar ? 'Update' : 'Add'} an external iCal feed from Google Calendar, Airbnb, or any platform
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  iCal Feed URL
                </label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleSaveCalendar()}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveCalendar}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
                >
                  Save Calendar
                </button>
                {calendar && (
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setImportUrl(calendar.ical_url || '');
                    }}
                    className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                💡 Tip: Copy the iCal link from your calendar platform settings
              </p>
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Export Calendar</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Share this link with other platforms to sync your availability
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your iCal Feed URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={exportUrl}
                  readOnly
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono break-all"
                />
                <button
                  onClick={() => copyToClipboard(exportUrl)}
                  className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition flex items-center gap-2 whitespace-nowrap"
                  title="Copy to clipboard"
                >
                  {copiedExport ? (
                    <>
                      <Check size={18} className="text-green-600" />
                      <span className="text-sm text-green-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={18} />
                      <span className="text-sm">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              📋 Paste this link in Airbnb, Booking.com, or any OTA that accepts iCal feeds
            </p>
          </div>
        </div>
      </div>
      )}

      {/* All Rooms iCal URLs - Always show for MultiKey properties */}
      {propertyRooms.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">All Rooms iCal Settings</h2>
          <div className="space-y-6">
            {propertyRooms.map((room) => {
              const roomExportUrl = `${window.location.origin}/artists_farm/php/api/ical_export.php?property=${getPropertySlug()}&room=${room.slug}`;
              const isCopied = copiedUrls.has(room.id);

              return (
                <div key={room.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{room.name}</h3>

                  {/* Room Import */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Import Calendar
                    </label>
                    <input
                      type="url"
                      placeholder="https://calendar.google.com/calendar/ical/..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono break-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add an external iCal feed for this room</p>
                  </div>

                  {/* Room Export */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Export Calendar
                    </label>
                    <div className="flex gap-2">
                    <input
                      type="text"
                      value={roomExportUrl}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono break-all"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(roomExportUrl);
                        setCopiedUrls(prev => new Set([...prev, room.id]));
                        setTimeout(() => {
                          setCopiedUrls(prev => {
                            const next = new Set(prev);
                            next.delete(room.id);
                            return next;
                          });
                        }, 2000);
                      }}
                      className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition flex items-center gap-2 whitespace-nowrap"
                      title="Copy to clipboard"
                    >
                      {isCopied ? (
                        <>
                          <Check size={16} className="text-green-600" />
                          <span className="text-xs text-green-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          <span className="text-xs">Copy</span>
                        </>
                      )}
                    </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
