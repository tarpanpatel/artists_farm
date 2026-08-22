import React, { useState } from 'react';
import { Card } from 'flowbite-react';
import { Plus, Trash2, Save, CheckCircle2, Loader2 } from './icons/FlowbiteIcons';
import { PropertyTelegramConfig, TelegramGroup } from '../types';
import { t } from '../i18n/en';

import { Button } from './Button';
import { Input } from './Input';
import { ToggleSwitch } from './ToggleSwitch';

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
    <Card className="border-gray-200 dark:border-gray-700 space-y-4 telegram-connection-settings">
      {/* Master toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('telegram_notifications_heading')}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t('telegram_toggle_description')}
          </div>
        </div>
        <ToggleSwitch
          enabled={!!config.enabled}
          onChange={(val) => onChange({ enabled: val })}
        />
      </div>

      {/* Bot token */}
      <div>
        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('bot_api_token_label')}</label>
        <Input
          type="text"
          value={config.botToken ?? ''}
          onChange={(e) => onChange({ botToken: e.target.value })}
          placeholder={t('leave_blank_platform_default_placeholder')}
        />
      </div>

      {/* Reminder nudge threshold */}
      <div>
        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          {t('auto_reminder_interval_label')}
        </label>
        <div className="w-32">
          <Input
            type="number"
            min={1}
            value={config.reminderThresholdMinutes ?? 5}
            onChange={(e) => onChange({ reminderThresholdMinutes: Math.max(1, Number(e.target.value) || 5) })}
          />
        </div>
      </div>

      {/* Groups */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          {t('group_chats_label')}
        </label>
        <div className="space-y-2">
          {config.groups.map((group) => (
            <div key={group.key} className="flex items-center gap-2">
              <Input
                type="text"
                value={group.name}
                onChange={(e) => updateGroupField(group.key, 'name', e.target.value)}
                placeholder={t('group_name_placeholder')}
              />
              <Input
                type="text"
                value={group.chatId}
                onChange={(e) => updateGroupField(group.key, 'chatId', e.target.value)}
                placeholder={t('chat_id_placeholder')}
              />
              <Button
                variant="danger"
                size="xs"
                onClick={() => removeGroup(group.key)}
                title={t('remove_group_tooltip')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {config.groups.length === 0 && (
            <div className="text-xs text-gray-500 italic">{t('no_groups_configured_text')}</div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <Input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder={t('e_g_kitchen_staff_placeholder')}
          />
          <Input
            type="text"
            value={newGroupChatId}
            onChange={(e) => setNewGroupChatId(e.target.value)}
            placeholder={t('chat_id_placeholder')}
          />
          <Button
            type="button"
            variant="primary"
            size="xs"
            onClick={addGroup}
            disabled={!newGroupName.trim() || !newGroupChatId.trim()}
            title={t('add_group_tooltip')}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        {saved && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('saved_badge')}
          </span>
        )}
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={onSave}
          disabled={saving}
          leftIcon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        >
          <span>{saving ? t('saving_ellipsis_text') : t('save_connection_settings_button')}</span>
        </Button>
      </div>
    </Card>
  );
};
