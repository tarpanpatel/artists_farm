import React, { useState, useEffect } from 'react';
import { Copy, Check, AlertCircle, Trash2, Edit2, X, Plus, RefreshCw, Calendar as CalendarIcon, Globe } from 'lucide-react';
import { getPropertySlug, getPropertyAndRoomSlugs } from '../services/api';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';

interface Calendar {
  id: number;
  ical_url: string;
  service_name: string;
  service_type?: string;
  last_sync?: string;
  property_id?: number;
}

interface ICalSyncManagerProps {
  propertyId?: number;
}

export const ICalSyncManager: React.FC<ICalSyncManagerProps> = ({ propertyId }) => {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [exportUrl, setExportUrl] = useState('');
  const [copiedExport, setCopiedExport] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [currentRoomSlug, setCurrentRoomSlug] = useState<string | null>(null);
  const [propertyRooms, setPropertyRooms] = useState<any[]>([]);
  const [copiedUrls, setCopiedUrls] = useState<Set<string | number>>(new Set());

  // State for adding a new calendar
  const [newServiceName, setNewServiceName] = useState('Airbnb Calendar');
  const [customServiceName, setCustomServiceName] = useState('');
  const [newImportUrl, setNewImportUrl] = useState('');
  const [selectedRoomForImport, setSelectedRoomForImport] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);

  // Per-room import form inputs
  const [roomImportPlatforms, setRoomImportPlatforms] = useState<{ [roomId: number]: string }>({});
  const [roomCustomNames, setRoomCustomNames] = useState<{ [roomId: number]: string }>({});
  const [roomImportUrls, setRoomImportUrls] = useState<{ [roomId: number]: string }>({});

  useEffect(() => {
    const { roomSlug } = getPropertyAndRoomSlugs();
    setCurrentRoomSlug(roomSlug || null);
    generateExportUrl();
    loadCalendars();

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

  const loadCalendars = async () => {
    try {
      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=get_ical_syncs', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setCalendars(data.data);
      }
    } catch (error) {
      console.error('Failed to load calendars:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCalendar = async (overrideUrl?: string, overrideName?: string) => {
    const url = overrideUrl !== undefined ? overrideUrl : newImportUrl;
    let finalServiceName = '';

    if (overrideName !== undefined) {
      finalServiceName = overrideName;
    } else {
      const baseName = newServiceName === 'Other' ? customServiceName : newServiceName;
      const roomSuffix = selectedRoomForImport !== 'all' ? ` (${selectedRoomForImport})` : '';
      finalServiceName = `${baseName || 'Imported Calendar'}${roomSuffix}`;
    }

    if (!url.trim()) {
      setMessage('Please enter a valid iCal URL');
      return;
    }

    try {
      setIsAdding(true);
      const propertySlug = getPropertySlug();
      const payload = {
        ical_url: url.trim(),
        service_type: 'ical',
        service_name: finalServiceName,
        sync_enabled: true,
        sync_direction: 'bidirectional',
        ...(propertyId ? { property_id: propertyId } : {}),
      };

      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=create_ical_sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Property-Slug': propertySlug,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.status === 'success') {
        let msg = `✓ Added "${finalServiceName}" successfully`;
        if (data.sync_status === 'success') {
          msg += ` - ${data.sync_message || 'Synced'}`;
        }
        setMessage(msg);
        setNewImportUrl('');
        setCustomServiceName('');
        loadCalendars();
        setTimeout(() => setMessage(''), 5000);
      } else {
        setMessage('✗ ' + (data.message || 'Failed to add calendar'));
      }
    } catch (err: any) {
      setMessage('✗ Error: ' + (err?.message || 'Network error'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleManualSync = async (calId: number, calName: string) => {
    try {
      setSyncingId(calId);
      const formData = new FormData();
      formData.append('id', String(calId));

      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=sync_ical_events', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (data.status === 'success') {
        setMessage(`✓ Synced ${calName}: ${data.message || 'Events updated'}`);
        loadCalendars();
      } else {
        setMessage(`✗ Sync failed for ${calName}: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`✗ Error syncing ${calName}`);
    } finally {
      setSyncingId(null);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const { confirm } = useConfirm();

  const handleDeleteCalendar = async (calId: number, calName: string) => {
    const confirmed = await confirm({
      title: 'Remove Calendar Sync',
      message: `Delete calendar sync for "${calName}"?`,
      confirmText: 'Remove Feed',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const response = await fetch('/artists_farm/php/api/ical_sync.php?action=delete_ical_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: calId }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        setMessage(`✓ Deleted "${calName}"`);
        loadCalendars();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('✗ Delete failed');
      }
    } catch (error: any) {
      setMessage('✗ Error deleting calendar');
    }
  };

  const copyToClipboard = (text: string, id: string | number) => {
    navigator.clipboard.writeText(text);
    setCopiedUrls((prev) => new Set([...prev, id]));
    if (id === 'main_export') {
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    }
    setTimeout(() => {
      setCopiedUrls((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading iCal settings...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 transition-all ${
            message.startsWith('✓')
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}
        >
          <AlertCircle size={20} className={message.startsWith('✓') ? 'text-green-600' : 'text-red-600'} />
          <span
            className={
              message.startsWith('✓')
                ? 'text-green-700 dark:text-green-400 font-medium text-sm'
                : 'text-red-700 dark:text-red-400 font-medium text-sm'
            }
          >
            {message}
          </span>
        </div>
      )}

      {/* Main Grid: Import & Export - Only show if NOT a MultiKey property with rooms */}
      {propertyRooms.length === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Import Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Globe className="w-6 h-6 text-blue-600" />
                  Import Calendars
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Sync availability from Airbnb, Booking.com, Google Calendar, or VRBO
                </p>
              </div>
              <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full">
                {calendars.length} Connected
              </span>
            </div>

            {/* List of Existing Connected Import Calendars */}
            {calendars.length > 0 ? (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Connected iCal Feeds
                </label>
                {calendars.map((cal) => (
                  <div
                    key={cal.id}
                    className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="font-bold text-gray-900 dark:text-white text-sm truncate">
                          {cal.service_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleManualSync(cal.id, cal.service_name)}
                          disabled={syncingId === cal.id}
                          className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
                          title="Sync now"
                        >
                          <RefreshCw size={16} className={syncingId === cal.id ? 'animate-spin' : ''} />
                        </button>

                        <button
                          onClick={() => handleDeleteCalendar(cal.id, cal.service_name)}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                          title="Remove calendar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                      {cal.ical_url}
                    </p>

                    {cal.last_sync && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        Last synced: {new Date(cal.last_sync).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-center text-xs text-gray-500">
                No import calendars added yet. You can add 3 or more iCal feeds below!
              </div>
            )}

            {/* Add New Import Calendar Form */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Plus size={16} className="text-blue-600" />
                Add Import Calendar Feed
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Calendar Platform / Name
                  </label>
                  <StyledSelect
                    value={newServiceName}
                    onChange={setNewServiceName}
                    options={[
                      { value: 'Airbnb Calendar', label: 'Airbnb Calendar' },
                      { value: 'Booking.com Calendar', label: 'Booking.com Calendar' },
                      { value: 'Google Calendar', label: 'Google Calendar' },
                      { value: 'VRBO / HomeAway', label: 'VRBO / HomeAway' },
                      { value: 'Agoda Calendar', label: 'Agoda Calendar' },
                      { value: 'Other', label: 'Other (Custom Name)' },
                    ]}
                  />
                </div>

                {newServiceName === 'Other' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Custom Calendar Name
                    </label>
                    <input
                      type="text"
                      value={customServiceName}
                      onChange={(e) => setCustomServiceName(e.target.value)}
                      placeholder="e.g. Personal Direct Booking Feed"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    iCal Feed URL (.ics link)
                  </label>
                  <input
                    type="url"
                    value={newImportUrl}
                    onChange={(e) => setNewImportUrl(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/ical/..."
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCalendar()}
                  />
                </div>

                <button
                  onClick={() => handleAddCalendar()}
                  disabled={isAdding || !newImportUrl.trim()}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold text-sm rounded-lg transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Plus size={18} />
                  <span>{isAdding ? 'Adding Calendar...' : 'Add Import Calendar'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Export Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm h-fit">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Export Calendar</h2>
            <p className="text-gray-600 dark:text-gray-400 text-xs mb-6">
              Share this iCal feed with OTAs (Airbnb, Booking.com) to export your property availability.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
                  Your Property iCal Feed URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={exportUrl}
                    readOnly
                    className="flex-1 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono break-all"
                  />
                  <button
                    onClick={() => copyToClipboard(exportUrl, 'main_export')}
                    className="px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    title="Copy to clipboard"
                  >
                    {copiedExport ? (
                      <>
                        <Check size={16} className="text-green-600" />
                        <span className="text-xs text-green-600 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        <span className="text-xs font-semibold">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                📋 Paste this link into external channels to block out booked dates automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Per-Room iCal Settings for MultiKey Properties */}
      {propertyRooms.length > 0 && (
        <div className="space-y-6">
          {propertyRooms.map((room) => {
            const propertySlug = getPropertySlug();
            const roomExportUrl = `${window.location.origin}/artists_farm/php/api/ical_export.php?property=${propertySlug}&room=${room.slug}`;
            const isCopied = copiedUrls.has(room.id);

            const platform = roomImportPlatforms[room.id] || 'Airbnb';
            const customName = roomCustomNames[room.id] || '';
            const url = roomImportUrls[room.id] || '';

            // Filter connected feeds for this room
            const roomCalendars = calendars.filter(
              (c) =>
                c.service_name.includes(`[${room.name}]`) ||
                c.service_name.includes(`(${room.name})`) ||
                c.service_name.includes(room.name) ||
                c.service_name.includes(room.slug)
            );

            return (
              <div
                key={room.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-6"
              >
                {/* Room Header */}
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white">{room.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      Slug: {room.slug}
                    </p>
                  </div>
                  <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                    {roomCalendars.length} Feed{roomCalendars.length !== 1 ? 's' : ''} Connected
                  </span>
                </div>

                {/* Connected Feeds List for this Room */}
                {roomCalendars.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Connected iCal Feeds for {room.name}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {roomCalendars.map((cal) => {
                        const displayName = cal.service_name
                          .replace(`[${room.name}] `, '')
                          .replace(` (${room.name})`, '')
                          .replace(`${room.name} - `, '');

                        return (
                          <div
                            key={cal.id}
                            className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0" />
                                <span className="font-bold text-gray-900 dark:text-white text-xs truncate">
                                  {displayName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleManualSync(cal.id, displayName)}
                                  disabled={syncingId === cal.id}
                                  className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition"
                                  title="Sync now"
                                >
                                  <RefreshCw
                                    size={14}
                                    className={syncingId === cal.id ? 'animate-spin' : ''}
                                  />
                                </button>
                                <button
                                  onClick={() => handleDeleteCalendar(cal.id, displayName)}
                                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition"
                                  title="Remove feed"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate">
                              {cal.ical_url}
                            </p>
                            {cal.last_sync && (
                              <p className="text-[9px] text-gray-400 dark:text-gray-500">
                                Synced: {new Date(cal.last_sync).toLocaleString()}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Add Import Calendar Form for this Room */}
                <div className="space-y-3 pt-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                    Import Calendar for {room.name}
                  </label>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <StyledSelect
                      value={platform}
                      onChange={(val) =>
                        setRoomImportPlatforms((prev) => ({ ...prev, [room.id]: val }))
                      }
                      options={[
                        { value: 'Airbnb', label: 'Airbnb' },
                        { value: 'Booking.com', label: 'Booking.com' },
                        { value: 'Google', label: 'Google' },
                        { value: 'VRBO', label: 'VRBO' },
                        { value: 'Other', label: 'Other' },
                      ]}
                    />

                    {platform === 'Other' && (
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) =>
                          setRoomCustomNames((prev) => ({ ...prev, [room.id]: e.target.value }))
                        }
                        placeholder="Label (e.g. MakeMyTrip)"
                        className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 min-w-[160px]"
                      />
                    )}

                    <input
                      type="url"
                      value={url}
                      onChange={(e) =>
                        setRoomImportUrls((prev) => ({ ...prev, [room.id]: e.target.value }))
                      }
                      placeholder="https://calendar.google.com/calendar/ical/..."
                      className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && url.trim()) {
                          const label = platform === 'Other' ? customName : platform;
                          handleAddCalendar(url, `[${room.name}] ${label || 'Imported Feed'}`);
                          setRoomImportUrls((prev) => ({ ...prev, [room.id]: '' }));
                          setRoomCustomNames((prev) => ({ ...prev, [room.id]: '' }));
                        }
                      }}
                    />

                    <button
                      onClick={async () => {
                        if (!url.trim()) return;
                        const label = platform === 'Other' ? customName : platform;
                        await handleAddCalendar(url, `[${room.name}] ${label || 'Imported Feed'}`);
                        setRoomImportUrls((prev) => ({ ...prev, [room.id]: '' }));
                        setRoomCustomNames((prev) => ({ ...prev, [room.id]: '' }));
                      }}
                      disabled={!url.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold text-xs rounded-lg transition whitespace-nowrap cursor-pointer shadow-2xs"
                    >
                      Add Feed
                    </button>
                  </div>
                </div>

                {/* Export Calendar for this Room */}
                <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Export Calendar for {room.name}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={roomExportUrl}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono break-all"
                    />
                    <button
                      onClick={() => copyToClipboard(roomExportUrl, room.id)}
                      className="px-3.5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      title="Copy to clipboard"
                    >
                      {isCopied ? (
                        <>
                          <Check size={14} className="text-green-600" />
                          <span className="text-xs text-green-600 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span className="text-xs font-semibold">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

