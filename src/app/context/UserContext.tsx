import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role: 'user' | 'admin';
  avatar?: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  company?: string;
}

interface UserContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: RegisterData) => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const STORAGE_KEY = 'starsyun_user';

type SessionUser = { id?: string; email: string; name?: string; phone?: string; company?: string; role: 'user' | 'admin' };

function userFromSession(session: SessionUser): User {
  return {
    id: session.id ?? `${session.role}-${session.email}`,
    name: session.name || session.email.split('@')[0],
    email: session.email,
    phone: session.phone,
    company: session.company,
    role: session.role,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.email}`,
  };
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // 从 localStorage 恢复用户状态
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const isAuthenticated = !!user;

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { user?: SessionUser };
        if (active && payload.user) setUser(userFromSession(payload.user));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // 用户状态变化时保存到 localStorage
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    if (password.length < 6) {
      throw new Error('密码错误');
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { user?: SessionUser };
        if (!payload.user) throw new Error('admin login returned no user');
        setUser(userFromSession(payload.user));
        return;
      }
      if (response.status === 401) throw new Error('密码错误');
      // A 404/503 means this deployment does not expose the admin service; keep demo login available.
      if (response.status !== 404 && response.status !== 503) throw new Error('登录服务暂不可用');
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }

    const mockAuthEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';
    if (!mockAuthEnabled) throw new Error('登录服务未配置');
    const demoAdmin = mockAuthEnabled;
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: email.split('@')[0],
      email,
      role: demoAdmin && email.includes('admin') ? 'admin' : 'user',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
    };

    setUser(newUser);
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setUser(null);
  };

  const register = async (data: RegisterData) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        const payload = (await response.json()) as { user?: SessionUser; confirmationRequired?: boolean };
        if (payload.confirmationRequired || !payload.user) throw new Error('请先验证邮箱后再登录');
        setUser(userFromSession(payload.user));
        return;
      }
      if (response.status !== 404 && response.status !== 503) throw new Error('注册失败');
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }

    const mockAuthEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';
    if (!mockAuthEnabled) throw new Error('注册服务未配置');

    // 注册成功后自动登录
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      role: 'user',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
    };

    setUser(newUser);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        logout,
        register,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
