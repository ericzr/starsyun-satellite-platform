import { Link, NavLink, useNavigate } from 'react-router';
import { useTheme } from 'next-themes';
import { Menu, ShoppingCart, Package, User, LogOut, Settings, FileText, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../i18n';
import { useCart } from '../context/CartContext';
import { useUser } from '../context/UserContext';
import { ThemeToggle } from './ThemeToggle';
import { LangToggle } from './LangToggle';
import { cn } from './ui/utils';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import logoBlack from '../../imports/image.png';
import logoWhite from '../../imports/image-1.png';

export function AppHeader() {
  const { t, lang } = useI18n();
  const { resolvedTheme } = useTheme();
  const { items } = useCart();
  const { user, isAuthenticated, logout } = useUser();
  const navigate = useNavigate();
  const logo = resolvedTheme === 'light' ? logoBlack : logoWhite;
  const [mobileOpen, setMobileOpen] = useState(false);

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link to="/" className="flex items-center" aria-label={t.brand}>
          <img src={logo} alt={t.brand} className="h-5 w-auto object-contain" />
        </Link>

        {/* Desktop Navigation */}
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <LangToggle />
          <ThemeToggle />
          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => navigate('/profile')}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="size-8 rounded-full" />
              ) : (
                <User className="size-5" />
              )}
              {cartCount > 0 && (
                <Badge className="absolute -right-1 -top-1 size-5 rounded-full p-0 text-[10px]">{cartCount}</Badge>
              )}
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={() => navigate('/login')}>
              <LogIn className="mr-2 size-4" />
              {lang === 'zh' ? '登录' : 'Sign In'}
            </Button>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="ml-auto flex items-center gap-2 sm:hidden">
          <LangToggle />
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="flex flex-col gap-2 pt-8">
                {isAuthenticated && (
                  <>
                    <button
                      onClick={() => { setMobileOpen(false); navigate('/profile'); }}
                      className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
                    >
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.name} className="size-10 rounded-full" />
                      ) : (
                        <User className="size-10" />
                      )}
                      <div className="flex-1 overflow-hidden text-left">
                        <p className="truncate font-medium">{user?.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                      </div>
                    </button>
                  </>
                )}
                <NavLink
                  to="/"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-4 py-2 text-sm transition-colors hover:bg-accent',
                      isActive && 'bg-accent text-accent-foreground',
                    )
                  }
                >
                  {t.nav.home || '首页'}
                </NavLink>
                <NavLink
                  to="/explore"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-4 py-2 text-sm transition-colors hover:bg-accent',
                      isActive && 'bg-accent text-accent-foreground',
                    )
                  }
                >
                  {t.nav.explore || '数据选择'}
                </NavLink>
                {isAuthenticated ? (
                  <>
                    <NavLink
                      to="/cart"
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between rounded-md px-4 py-2 text-sm transition-colors hover:bg-accent',
                          isActive && 'bg-accent text-accent-foreground',
                        )
                      }
                    >
                      <span>{lang === 'zh' ? '购物车' : 'Cart'}</span>
                      {cartCount > 0 && <Badge className="ml-2">{cartCount}</Badge>}
                    </NavLink>
                    <NavLink
                      to="/orders"
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md px-4 py-2 text-sm transition-colors hover:bg-accent',
                          isActive && 'bg-accent text-accent-foreground',
                        )
                      }
                    >
                      {lang === 'zh' ? '我的订单' : 'Orders'}
                    </NavLink>
                    <NavLink
                      to="/admin"
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md px-4 py-2 text-sm transition-colors hover:bg-accent',
                          isActive && 'bg-accent text-accent-foreground',
                        )
                      }
                    >
                      {t.nav.admin}
                    </NavLink>
                    <Button variant="ghost" className="justify-start px-4 py-2" onClick={handleLogout}>
                      <LogOut className="mr-2 size-4" />
                      {lang === 'zh' ? '退出登录' : 'Sign Out'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => { setMobileOpen(false); navigate('/login'); }}>
                    <LogIn className="mr-2 size-4" />
                    {lang === 'zh' ? '登录' : 'Sign In'}
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
