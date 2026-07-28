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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // 从 localStorage 恢复用户状态
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const isAuthenticated = !!user;

  useEffect(() => {
    // 用户状态变化时保存到 localStorage
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    // 模拟登录 API 调用
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 模拟验证 - 实际项目中应该调用后端 API
    if (password.length < 6) {
      throw new Error('密码错误');
    }

    // 创建用户对象
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: email.split('@')[0],
      email,
      role: email.includes('admin') ? 'admin' : 'user',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
    };

    setUser(newUser);
  };

  const logout = () => {
    setUser(null);
  };

  const register = async (data: RegisterData) => {
    // 模拟注册 API 调用
    await new Promise((resolve) => setTimeout(resolve, 500));

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
