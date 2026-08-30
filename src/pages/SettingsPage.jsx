import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';

import db from '../lib/db';
import { supabase } from '../lib/supabase';
import { fullSync, getSyncStatus } from '../lib/syncEngine';
import { useAuthContext } from '../App';
import useOnlineStatus from '../hooks/useOnlineStatus';
import LanguageToggle from '../components/LanguageToggle';

const DEFAULT_CATEGORY_ICONS = ['📱', '🔌', '🎧', '💻', '📺', '⌚', '📷', '🔋', '📦'];

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, isOwner: authIsOwner, logout } = useAuthContext();
  const isOnline = useOnlineStatus();

  const [isSyncing, setIsSyncing] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📱');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Reactive Dexie sync metadata & queue count
  const syncMeta = useLiveQuery(() => db.syncMeta.get('last_sync_time'), []);
  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) ?? 0;
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const branches = useLiveQuery(() => db.branches.toArray(), []) || [];

  // Determine user role and branch
  const userRole = profile?.role || (authIsOwner ? 'owner' : 'staff');
  const isOwner = userRole === 'owner' || authIsOwner;

  const currentBranch = branches.find(b => b.id === profile?.branch_id);
  const branchName = currentBranch?.name || profile?.branch || 'Hyderabad Store';
  const userName = profile?.full_name || profile?.name || user?.user_metadata?.full_name || 'Staff User';
  const userPhone = profile?.phone || user?.phone || (user?.email?.includes('@stockeasy.local') ? user.email.replace('@stockeasy.local', '') : user?.email) || 'N/A';

  // Manual Sync trigger
  const handleManualSync = async () => {
    if (!isOnline) {
      toast.error(t('sync.offline', 'Cannot sync while offline'));
      return;
    }

    setIsSyncing(true);
    try {
      const result = await fullSync();
      if (result.success) {
        toast.success(t('sync.syncSuccess', 'Sync completed successfully!'));
      } else {
        toast.error(result.error || t('sync.syncError', 'Sync error occurred'));
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      toast.error(err.message || t('sync.syncError', 'Sync failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Add category handler
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      toast.error(t('common.error', 'Category name is required'));
      return;
    }

    try {
      setIsAddingCat(true);
      const catId = crypto.randomUUID();
      const newCategory = {
        id: catId,
        name: newCatName.trim(),
        icon: newCatIcon || '📦'
      };

      await db.categories.put(newCategory);
      await db.syncQueue.add({
        table: 'categories',
        operation: 'INSERT',
        record_id: catId,
        data: newCategory,
        created_at: new Date().toISOString()
      });

      setNewCatName('');
      toast.success('Category added successfully!');
    } catch (err) {
      console.error('Failed to add category:', err);
      toast.error('Failed to add category');
    } finally {
      setIsAddingCat(false);
    }
  };

  // Delete category handler
  const handleDeleteCategory = async (categoryId) => {
    try {
      await db.categories.delete(categoryId);
      await db.syncQueue.add({
        table: 'categories',
        operation: 'DELETE',
        record_id: categoryId,
        data: { id: categoryId },
        created_at: new Date().toISOString()
      });

      setShowDeleteConfirm(null);
      toast.success('Category deleted');
    } catch (err) {
      console.error('Failed to delete category:', err);
      toast.error('Failed to delete category');
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      // 1. Supabase auth sign out
      if (typeof logout === 'function') {
        await logout();
      } else {
        await supabase.auth.signOut();
      }

      // 2. Clear local Dexie database tables
      await Promise.all([
        db.products.clear(),
        db.inventory.clear(),
        db.stockMovements.clear(),
        db.categories.clear(),
        db.branches.clear(),
        db.syncQueue.clear(),
        db.syncMeta.clear()
      ]);

      toast.success('Logged out successfully');
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Error during logout');
      navigate('/login', { replace: true });
    }
  };

  const formatLastSync = (isoString) => {
    if (!isoString) return 'Never';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: 'numeric',
        month: 'short'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-base-content">
          {t('settings.title', 'Settings')}
        </h1>
        <p className="text-sm text-base-content/70">
          Application configuration and store profile
        </p>
      </div>

      {/* SECTION 1: Profile */}
      <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-base-content flex items-center gap-2">
            <span>👤</span>
            <span>{t('settings.profile', 'User Profile')}</span>
          </h2>
          <span
            className={`badge text-xs font-semibold uppercase px-2.5 py-1 ${
              isOwner ? 'badge-primary' : 'badge-neutral'
            }`}
          >
            {isOwner ? t('settings.owner', 'Owner') : t('settings.staff', 'Staff')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 text-sm">
          <div className="bg-base-200/60 p-3 rounded-2xl">
            <span className="text-xs text-base-content/60 block mb-0.5">Name</span>
            <span className="font-bold text-base-content break-words">{userName}</span>
          </div>

          <div className="bg-base-200/60 p-3 rounded-2xl">
            <span className="text-xs text-base-content/60 block mb-0.5">{t('auth.phone', 'Phone')}</span>
            <span className="font-bold text-base-content font-mono">{userPhone}</span>
          </div>

          <div className="bg-base-200/60 p-3 rounded-2xl col-span-2">
            <span className="text-xs text-base-content/60 block mb-0.5">{t('settings.branch', 'Branch')}</span>
            <span className="font-bold text-base-content flex items-center gap-1">
              <span>📍</span>
              <span>{branchName}</span>
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 2: Language */}
      <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-5 space-y-3">
        <h2 className="font-bold text-base text-base-content flex items-center gap-2">
          <span>🌐</span>
          <span>{t('settings.language', 'Language')}</span>
        </h2>
        <LanguageToggle />
      </div>

      {/* SECTION 3: Sync Status & Manual Sync */}
      <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-base-content flex items-center gap-2">
            <span>🔄</span>
            <span>Cloud Synchronization</span>
          </h2>
          <span
            className={`badge gap-1 text-xs font-semibold ${
              isOnline ? 'badge-success text-success-content' : 'badge-error text-white'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success-content' : 'bg-white'}`} />
            {isOnline ? 'Online' : t('sync.offline', 'Offline')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-base-200/60 p-3 rounded-2xl">
            <span className="text-xs text-base-content/60 block mb-0.5">
              {t('dashboard.pendingSync', 'Pending Changes')}
            </span>
            <span className="text-xl font-bold text-primary">
              {pendingCount}
            </span>
          </div>

          <div className="bg-base-200/60 p-3 rounded-2xl">
            <span className="text-xs text-base-content/60 block mb-0.5">
              {t('settings.lastSync', 'Last Synced')}
            </span>
            <span className="text-xs font-semibold text-base-content block mt-1">
              {formatLastSync(syncMeta?.value)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncing || !isOnline}
          className="btn btn-primary btn-block btn-lg min-h-[50px] rounded-2xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
        >
          {isSyncing ? (
            <>
              <span className="loading loading-spinner loading-md"></span>
              <span>{t('sync.syncing', 'Syncing...')}</span>
            </>
          ) : (
            <>
              <span className="text-lg">⚡</span>
              <span>{t('settings.syncNow', 'Sync Now')}</span>
            </>
          )}
        </button>
      </div>

      {/* SECTION 4: Admin Controls (Only visible for Owner) */}
      {isOwner && (
        <div className="space-y-4">
          <div className="px-1 text-xs font-bold text-primary uppercase tracking-wider">
            Owner & Administration
          </div>

          {/* Manage Staff Placeholder */}
          <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-base text-base-content flex items-center gap-2">
              <span>👥</span>
              <span>{t('settings.manageStaff', 'Manage Staff')}</span>
            </h2>
            <div className="bg-base-200/50 p-4 rounded-2xl text-center space-y-2 border border-dashed border-base-300">
              <span className="text-2xl">🛡️</span>
              <p className="text-sm font-semibold text-base-content">
                Manage staff accounts from Supabase dashboard
              </p>
              <p className="text-xs text-base-content/60 max-w-xs mx-auto">
                Role assignments, PIN reset, and permissions can be administered securely in the cloud console.
              </p>
            </div>
          </div>

          {/* Manage Categories */}
          <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-5 space-y-4">
            <h2 className="font-bold text-base text-base-content flex items-center gap-2">
              <span>🗂️</span>
              <span>{t('settings.manageCategories', 'Manage Categories')}</span>
            </h2>

            {/* Add Category Form */}
            <form onSubmit={handleAddCategory} className="space-y-2 bg-base-200/50 p-3.5 rounded-2xl">
              <span className="text-xs font-bold text-base-content/70 block mb-1">
                Add New Category
              </span>
              
              <div className="flex gap-2">
                {/* Emoji / Icon Selector */}
                <select
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  className="select select-bordered text-lg w-18 min-h-[48px] rounded-xl"
                  aria-label="Category Icon"
                >
                  {DEFAULT_CATEGORY_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>

                {/* Category Name Input */}
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category name (e.g. Smart Watches)"
                  className="input input-bordered flex-1 min-h-[48px] text-sm rounded-xl"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isAddingCat || !newCatName.trim()}
                className="btn btn-primary btn-sm min-h-[42px] w-full rounded-xl font-semibold mt-1"
              >
                {isAddingCat ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  '＋ Add Category'
                )}
              </button>
            </form>

            {/* Existing Categories List */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-semibold text-base-content/60 block px-1">
                Existing Categories ({categories.length})
              </span>

              {categories.length > 0 ? (
                <div className="divide-y divide-base-200 bg-base-200/30 rounded-2xl overflow-hidden border border-base-200">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 text-sm hover:bg-base-200/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{cat.icon || '📦'}</span>
                        <span className="font-medium text-base-content">{cat.name}</span>
                      </div>

                      {showDeleteConfirm === cat.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="btn btn-error btn-xs min-h-[32px] px-2 rounded-lg text-white"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(null)}
                            className="btn btn-ghost btn-xs min-h-[32px] px-2 rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(cat.id)}
                          className="btn btn-ghost btn-circle btn-sm min-h-[36px] min-w-[36px] text-error hover:bg-error/10"
                          title="Delete category"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-base-content/50 italic py-2 px-1">
                  No custom categories yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: App Info */}
      <div className="card bg-base-100 border border-base-200 shadow-sm rounded-3xl p-5 text-center space-y-1">
        <h3 className="font-bold text-base text-base-content">
          {t('common.appName', 'StockEasy')} PWA
        </h3>
        <p className="text-xs font-mono text-base-content/60">
          Version 1.0.0 (Offline-First Edition)
        </p>
        <p className="text-xs text-base-content/50 pt-1">
          Made for Electronics Retail Store, Hyderabad, India 🇮🇳
        </p>
      </div>

      {/* SECTION 6: Logout Button (min 48px touch height, btn-error btn-outline) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-error btn-outline btn-block btn-lg min-h-[52px] h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-sm"
        >
          <span>🚪</span>
          <span>{t('auth.logout', 'Sign Out')}</span>
        </button>
      </div>
    </div>
  );
}
