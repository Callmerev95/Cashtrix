/**
 * Profile context — account-level state shared by the Profile tab, the
 * category manager, and the category form.
 *
 * Holds the `profiles` row, the merged category list (system + custom, both
 * archive sources resolved), and a signed URL for the private avatar. Mounted
 * innermost in the root layout so category mutations can also refresh the
 * transaction option lists — otherwise the Add Transaction grid would keep
 * showing a category the user just archived.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { onLocalDataPurge } from '@/supabase';
import { useTransactions } from '@/features/transactions';

import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getAvatarSignedUrl,
  getProfile,
  listManagedCategories,
  unarchiveCategory,
  updateCategory,
  updateProfile,
  uploadAvatar,
  type Profile,
} from './api';
import type { CategoryKind, CurrencyCode, ManagedCategory } from './domain';

type ProfileContextValue = {
  profile: Profile | null;
  categories: ManagedCategory[];
  avatarSignedUrl: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveProfile: (input: {
    displayName?: string;
    currencyCode?: CurrencyCode;
  }) => Promise<void>;
  /** Full pipeline: resize → upload → persist path → re-mint signed URL. */
  saveAvatar: (input: { userId: string; sourceUri: string }) => Promise<void>;
  createManagedCategory: (input: {
    userId: string;
    name: string;
    icon: string;
    kind: CategoryKind;
  }) => Promise<string>;
  updateManagedCategory: (input: {
    id: string;
    name: string;
    icon: string;
  }) => Promise<void>;
  archiveManagedCategory: (input: {
    userId: string;
    id: string;
    isSystem: boolean;
  }) => Promise<void>;
  unarchiveManagedCategory: (input: {
    userId: string;
    id: string;
    isSystem: boolean;
  }) => Promise<void>;
  deleteManagedCategory: (input: {
    id: string;
    isSystem: boolean;
  }) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const transactions = useTransactions();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getProfile();
      const nextCategories = await listManagedCategories();
      const signedUrl = await getAvatarSignedUrl(next?.avatarUrl ?? null);
      if (!mounted.current) return;
      setProfile(next);
      setCategories(nextCategories);
      setAvatarSignedUrl(signedUrl);
      setError(null);
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error ? cause.message : 'Gagal memuat profil',
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getProfile(),
      listManagedCategories(),
    ])
      .then(async ([next, nextCategories]) => {
        const signedUrl = await getAvatarSignedUrl(next?.avatarUrl ?? null);
        if (cancelled || !mounted.current) return;
        setProfile(next);
        setCategories(nextCategories);
        setAvatarSignedUrl(signedUrl);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || !mounted.current) return;
        setError(
          cause instanceof Error ? cause.message : 'Gagal memuat profil',
        );
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Sign out drops the cached profile, categories, and signed URL.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setProfile(null);
        setCategories([]);
        setAvatarSignedUrl(null);
        setError(null);
      }),
    [],
  );

  const saveProfile = useCallback(
    async (input: { displayName?: string; currencyCode?: CurrencyCode }) => {
      await updateProfile(input);
      await refresh();
    },
    [refresh],
  );

  const saveAvatar = useCallback(
    async (input: { userId: string; sourceUri: string }) => {
      const path = await uploadAvatar(input);
      await updateProfile({ avatarUrl: path });
      await refresh();
    },
    [refresh],
  );

  // Category writes refresh the transaction option lists too, so the Add
  // Transaction grid and the budget picker never show stale categories.
  const refreshCategories = useCallback(async () => {
    await Promise.all([refresh(), transactions.refresh()]);
  }, [refresh, transactions]);

  const createManagedCategory = useCallback(
    async (input: {
      userId: string;
      name: string;
      icon: string;
      kind: CategoryKind;
    }) => {
      const id = await createCategory(input);
      await refreshCategories();
      return id;
    },
    [refreshCategories],
  );

  const updateManagedCategory = useCallback(
    async (input: { id: string; name: string; icon: string }) => {
      await updateCategory(input);
      await refreshCategories();
    },
    [refreshCategories],
  );

  const archiveManagedCategory = useCallback(
    async (input: { userId: string; id: string; isSystem: boolean }) => {
      await archiveCategory(input);
      await refreshCategories();
    },
    [refreshCategories],
  );

  const unarchiveManagedCategory = useCallback(
    async (input: { userId: string; id: string; isSystem: boolean }) => {
      await unarchiveCategory(input);
      await refreshCategories();
    },
    [refreshCategories],
  );

  const deleteManagedCategory = useCallback(
    async (input: { id: string; isSystem: boolean }) => {
      await deleteCategory(input);
      await refreshCategories();
    },
    [refreshCategories],
  );

  const value = useMemo(
    () => ({
      profile,
      categories,
      avatarSignedUrl,
      loading,
      error,
      refresh,
      saveProfile,
      saveAvatar,
      createManagedCategory,
      updateManagedCategory,
      archiveManagedCategory,
      unarchiveManagedCategory,
      deleteManagedCategory,
    }),
    [
      profile,
      categories,
      avatarSignedUrl,
      loading,
      error,
      refresh,
      saveProfile,
      saveAvatar,
      createManagedCategory,
      updateManagedCategory,
      archiveManagedCategory,
      unarchiveManagedCategory,
      deleteManagedCategory,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile harus dipakai di dalam ProfileProvider');
  }
  return context;
}
