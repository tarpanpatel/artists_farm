import React, { useState } from 'react';
import { Plus, Trash2, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { PropertyTelegramConfig, TelegramGroup } from '../types';

function slugify(name: string, existingKeys: string[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'group';
  let key = base;
  let n = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${n}`;
    n++;
  }
  return key;
}

interface TelegramConnectionSettingsProps {
  config: PropertyTelegramConfig;
  onChange: (patch: Partial<PropertyTelegramConfig>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

// Connection-level settings only: on/off, bot token, and the list of named
// group chats. Which notification goes to which group is configured per
// template, right in the template editor (see TelegramNotificationModal).
export const TelegramConnectionSettings: React.FC<TelegramConnectionSettingsProps> = ({
  config,
  onChange,
  onSave,
  saving,
  saved,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupChatId, setNewGroupChatId] = useState('');

  const addGroup = () => {
    if (!newGroupName.trim() || !newGroupChatId.trim()) return;
    const key = slugify(newGroupName, config.groups.map((g) => g.key));
    const newGroup: TelegramGroup = { key, name: newGroupName.trim(), chatId: newGroupChatId.trim() };
    onChange({ groups: [...config.groups, newGroup] });
    setNewGroupName('');
    setNewGroupChatId('');
  };

  const removeGroup = (key: string) => {
    const routing = { ...config.routing };
    Object.keys(routing).forEach((tplKey) => {
      if (routing[tplKey] === key) delete routing[tplKey];
    });
    onChange({ groups: config.groups.filter((g) => g.key !== key), routing });
  };

  const updateGroupField = (key: string, field: 'name' | 'chatId', value: string) => {
    onChange({ groups: config.groups.map((g) => (g.key === key ? { ...g, [field]: value } : g)) });
  };

  return (
    <div className="bg-slate-900 text-white p-4 rounded-xl space-y-4 border border-slate-700 animate-fade-in shadow-inner">
      {/* Master toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="text-sm font-bold text-slate-100">Telegram Notifications for this Property</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Turn off to stop all Telegram alerts for this property, regardless of the settings below.
          </div>
        </div>
        <button
          onClick={() => onChange({ enabled: !config.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
            config.enabled ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Bot token */}
      <div>
        <label className="text-[11px] font-semibold text-slate-300 block mb-1">Bot API Token</label>
        <input
          type="text"
          value={config.botToken ?? ''}
          onChange={(e) => onChange({ botToken: e.target.value })}
          placeholder="Leave blank to use the platform default bot"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      {/* Reminder nudge threshold */}
      <div>
        <label className="text-[11px] font-semibold text-slate-300 block mb-1">
          Auto-Reminder Interval <span className="text-slate-500 font-normal">— minutes before an unaddressed order/dish gets nudged again</span>
        </label>
        <input
          type="number"
          min={1}
          value={config.reminderThresholdMinutes ?? 5}
          onChange={(e) => onChange({ reminderThresholdMinutes: Math.max(1, Number(e.target.value) || 5) })}
          className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      {/* Groups */}
      <div>
        <label className="text-[11px] font-semibold text-slate-300 block mb-2">
          Group Chats <span className="text-slate-500 font-normal">— pick which one each notification goes to from its template editor below</span>
        </label>
        <div className="space-y-2">
          {config.groups.map((group) => (
            <div key={group.key} className="flex items-center gap-2">
              <input
                type="text"
                value={group.name}
                onChange={(e) => updateGroupField(group.key, 'name', e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                placeholder="Group name"
              />
              <input
                type="text"
                value={group.chatId}
                onChange={(e) => updateGroupField(group.key, 'chatId', e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                placeholder="Chat ID (e.g. -100123456789)"
              />
              <button
                onClick={() => removeGroup(group.key)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 cursor-pointer"
                title="Remove group"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {config.groups.length === 0 && (
            <div className="text-[11px] text-slate-500 italic">No groups configured yet — add one below.</div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. Kitchen Staff"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
          />
          <input
            type="text"
            value={newGroupChatId}
            onChange={(e) => setNewGroupChatId(e.target.value)}
            placeholder="Chat ID"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={addGroup}
            disabled={!newGroupName.trim() || !newGroupChatId.trim()}
            className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white cursor-pointer"
            title="Add group"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
        {saved && (
          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saving ? 'Saving…' : 'Save Connection Settings'}</span>
        </button>
      </div>
    </div>
  );
};
