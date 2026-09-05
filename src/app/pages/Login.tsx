import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useUser } from '../context/UserContext';
import { useI18n } from '../i18n';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Logo } from '../components/Logo';

export function Login() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useUser();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerCompany, setRegisterCompany] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  // 获取登录前的页面，用于登录成功后跳转
  const from = (location.state as any)?.from || '/';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      await login(loginEmail, loginPassword);
      toast.success(lang === 'zh' ? '登录成功' : 'Login successful');
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(lang === 'zh' ? '登录失败，请检查邮箱和密码' : 'Login failed, please check email and password');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);

    try {
      await register({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
        phone: registerPhone,
        company: registerCompany,
      });
      toast.success(lang === 'zh' ? '注册成功' : 'Registration successful');
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(lang === 'zh' ? '注册失败' : 'Registration failed');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-12 w-auto text-primary" />
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">{lang === 'zh' ? '登录' : 'Sign In'}</TabsTrigger>
            <TabsTrigger value="register">{lang === 'zh' ? '注册' : 'Register'}</TabsTrigger>
          </TabsList>

          {/* 登录表单 */}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4 rounded-lg border border-border bg-card p-6">
              <div className="space-y-2">
                <Label htmlFor="login-email">{lang === 'zh' ? '邮箱' : 'Email'}</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder={lang === 'zh' ? '请输入邮箱' : 'Enter your email'}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">{lang === 'zh' ? '密码' : 'Password'}</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder={lang === 'zh' ? '请输入密码' : 'Enter your password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? (lang === 'zh' ? '登录中...' : 'Signing in...') : (lang === 'zh' ? '登录' : 'Sign In')}
              </Button>
              {import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true' ? (
                <p className="text-center text-xs text-muted-foreground">
                  {lang === 'zh' ? '演示账号：任意邮箱 + 6位以上密码' : 'Demo: any email + 6+ char password'}
                </p>
              ) : null}
            </form>
          </TabsContent>

          {/* 注册表单 */}
          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-4 rounded-lg border border-border bg-card p-6">
              <div className="space-y-2">
                <Label htmlFor="register-name">{lang === 'zh' ? '姓名' : 'Name'} *</Label>
                <Input
                  id="register-name"
                  type="text"
                  placeholder={lang === 'zh' ? '请输入姓名' : 'Enter your name'}
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">{lang === 'zh' ? '邮箱' : 'Email'} *</Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder={lang === 'zh' ? '请输入邮箱' : 'Enter your email'}
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">{lang === 'zh' ? '密码' : 'Password'} *</Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder={lang === 'zh' ? '至少6位密码' : 'At least 6 characters'}
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-phone">{lang === 'zh' ? '手机号' : 'Phone'}</Label>
                <Input
                  id="register-phone"
                  type="tel"
                  placeholder={lang === 'zh' ? '选填' : 'Optional'}
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-company">{lang === 'zh' ? '公司' : 'Company'}</Label>
                <Input
                  id="register-company"
                  type="text"
                  placeholder={lang === 'zh' ? '选填' : 'Optional'}
                  value={registerCompany}
                  onChange={(e) => setRegisterCompany(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={registerLoading}>
                {registerLoading ? (lang === 'zh' ? '注册中...' : 'Registering...') : (lang === 'zh' ? '注册' : 'Register')}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={() => navigate('/')}>
            {lang === 'zh' ? '返回首页' : 'Back to Home'}
          </Button>
        </div>
      </div>
    </div>
  );
}
