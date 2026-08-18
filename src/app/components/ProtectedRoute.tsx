import { Navigate, useLocation } from 'react-router';
import { useUser } from '../context/UserContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useUser();
  const location = useLocation();

  if (!isAuthenticated) {
    // 未登录，跳转到登录页，并记录当前页面用于登录后返回
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    // 需要管理员权限但用户不是管理员
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
