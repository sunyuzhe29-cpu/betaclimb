import { useState } from 'react';
import { Lock, LogIn, Mail, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const getAuthMessage = (error) => {
  const message = error?.message || '登录服务暂时不可用，请稍后再试。';

  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码不正确，请检查后再试。';
  }

  if (message.includes('Email not confirmed')) {
    return '这个邮箱还没有完成确认，请先打开确认邮件。';
  }

  if (message.includes('rate limit') || message.includes('For security purposes')) {
    return '确认邮件发送太频繁了，请等一分钟后再试。';
  }

  if (message.includes('User already registered')) {
    return '这个邮箱已经注册过了，请切换到登录。';
  }

  if (message.includes('Password should be at least')) {
    return '密码长度不够，请至少输入 6 位。';
  }

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return '连接 Supabase 失败，请检查网络和 Supabase 项目配置。';
  }

  return message;
};

const getAuthRedirectUrl = () => window.location.origin;

export default function AuthModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  if (!isOpen) return null;

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
    setConfirmationEmail('');
  };

  const handleResendConfirmation = async () => {
    const normalizedEmail = confirmationEmail || email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('请输入邮箱后再重新发送确认邮件。');
      return;
    }

    if (!supabase) {
      setMessage('请先配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。');
      return;
    }

    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });

      if (error) {
        setMessage(getAuthMessage(error));
        return;
      }

      setConfirmationEmail(normalizedEmail);
      setMessage('确认邮件已重新发送。请检查收件箱、垃圾邮件和促销邮件。');
    } catch (error) {
      setMessage(getAuthMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setConfirmationEmail('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('请输入邮箱。');
      return;
    }

    if (!supabase) {
      setMessage('请先配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } =
        mode === 'login'
          ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
          : await supabase.auth.signUp({
              email: normalizedEmail,
              password,
              options: {
                emailRedirectTo: getAuthRedirectUrl(),
              },
            });

      if (error) {
        if (mode === 'login' && error.message.includes('Email not confirmed')) {
          setConfirmationEmail(normalizedEmail);
        }
        setMessage(getAuthMessage(error));
        return;
      }

      if (mode === 'register' && !data.session) {
        setConfirmationEmail(normalizedEmail);
        setMessage('注册成功。请去邮箱点确认链接，确认后再回来登录。');
        return;
      }

      onClose();
    } catch (error) {
      setMessage(getAuthMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭登录弹窗">
          <X size={18} />
        </button>
        <div className="auth-heading">
          <p className="eyebrow">BetaClimb 账户</p>
          <h2 id="auth-title">{mode === 'login' ? '欢迎回来' : '创建新账户'}</h2>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="登录注册切换">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>
            <LogIn size={16} />
            邮箱密码登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => switchMode('register')}>
            <UserPlus size={16} />
            新用户注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>
              <Mail size={16} />
              邮箱
            </span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            <span>
              <Lock size={16} />
              密码
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
          <button className="primary-btn auth-submit" type="submit" disabled={isSubmitting}>
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {isSubmitting ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        {message ? (
          <div className="auth-message">
            <p>{message}</p>
            {confirmationEmail ? (
              <button className="auth-resend" type="button" onClick={handleResendConfirmation} disabled={isResending}>
                {isResending ? '正在重新发送...' : '重新发送确认邮件'}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
