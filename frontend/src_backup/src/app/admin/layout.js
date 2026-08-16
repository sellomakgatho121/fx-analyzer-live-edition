'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSessionStore from '@/store/sessionStore';

/**
 * Admin area guard — /admin is outside the (main) shell, so it gets its own
 * auth gate. Unauthenticated users → /login; non-admins → /dashboard.
 * The store hydrates the JWT synchronously from localStorage, so the token
 * is available on the first client render.
 */
export default function AdminLayout({ children }) {
  const router = useRouter();
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!token) router.replace('/login');
    else if (user && user.role !== 'admin') router.replace('/dashboard');
  }, [token, user, router]);

  if (mounted && (!token || (user && user.role !== 'admin'))) return null;

  return <>{children}</>;
}