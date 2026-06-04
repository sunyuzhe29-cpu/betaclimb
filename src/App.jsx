import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  ImagePlus,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Mail,
  Pencil,
  PlaySquare,
  Plus,
  Save,
  Timer,
  Trash2,
  Upload,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import './App.css';
import { useAuth } from './context/useAuth';
import { supabase } from './lib/supabaseClient';

const gymImage = (base, accent, label) =>
  `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="${base}"/>
      <rect x="76" y="108" width="808" height="354" rx="24" fill="#fffaf0" opacity=".16"/>
      <path d="M120 430 L230 190 L335 430 Z M362 430 L482 128 L612 430 Z M612 430 L710 236 L830 430 Z" fill="#111827" opacity=".48"/>
      <g fill="${accent}" opacity=".95">
        <circle cx="272" cy="352" r="24"/><circle cx="414" cy="304" r="18"/><circle cx="542" cy="236" r="22"/>
        <circle cx="666" cy="358" r="20"/><circle cx="740" cy="300" r="16"/>
      </g>
      <text x="64" y="82" fill="#fffaf0" font-family="system-ui, sans-serif" font-size="42" font-weight="850">${label}</text>
    </svg>
  `)}`;

const STORAGE_PREFIX = 'betaclimb:gyms';
const GUEST_STORAGE_KEY = `${STORAGE_PREFIX}:guest`;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`文件读取失败：${file.name}`));
    reader.readAsDataURL(file);
  });

const readStoredGyms = (storageKey) => {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const getSentEntries = (gyms) =>
  gyms.flatMap((gym) =>
    gym.routes
      .filter((route) => route.sentAt)
      .map((route) => ({
        gymId: gym.id,
        gymName: gym.name,
        routeId: route.id,
        routeName: route.name,
        grade: route.grade.trim().toUpperCase() || '未定级',
        sentAt: route.sentAt,
      })),
  );

const buildCalendarDays = (monthKey, entries) => {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const visitsByDate = entries.reduce((acc, entry) => {
    acc[entry.sentAt] = [...(acc[entry.sentAt] || []), entry];
    return acc;
  }, {});

  return [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      return {
        date,
        day,
        visits: visitsByDate[date] || [],
      };
    }),
  ];
};

const moveMonth = (monthKey, offset) => {
  const [year, month] = monthKey.split('-').map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-');
  return `${year} 年 ${Number(month)} 月`;
};

const getAuthMessage = (error) => {
  const message = error?.message || '登录服务暂时不可用，请稍后再试。';

  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码不正确，请检查后再试。';
  }

  if (message.includes('Email not confirmed')) {
    return '这个邮箱还没有完成确认，请先打开确认邮件。';
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

function AuthModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

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
          : await supabase.auth.signUp({ email: normalizedEmail, password });

      if (error) {
        setMessage(getAuthMessage(error));
        return;
      }

      if (mode === 'register' && !data.session) {
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

        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </div>
  );
}

function UserMenu({ onOpenAuth }) {
  const { isAuthLoading, user } = useAuth();

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  if (isAuthLoading) {
    return <span className="auth-loading">同步账户...</span>;
  }

  if (!user) {
    return (
      <button className="primary-btn auth-entry" type="button" onClick={onOpenAuth}>
        <LogIn size={18} />
        登录/注册
      </button>
    );
  }

  const initial = (user.email || 'U').slice(0, 1).toUpperCase();

  return (
    <div className="user-menu" aria-label="当前登录用户">
      <span className="user-avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="user-email">{user.email}</span>
      <button className="ghost-btn icon-only" type="button" onClick={handleSignOut} aria-label="退出登录">
        <LogOut size={17} />
      </button>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const [gyms, setGyms] = useState([]);
  const [activeGymId, setActiveGymId] = useState('');
  const [activeRouteId, setActiveRouteId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingGym, setIsEditingGym] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState('');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const routePhotoInputRef = useRef(null);
  const gymPhotoInputRef = useRef(null);
  const betaVideoInputRef = useRef(null);
  const storageKey = user?.id ? `${STORAGE_PREFIX}:${user.id}` : GUEST_STORAGE_KEY;

  useEffect(() => {
    const nextGyms = readStoredGyms(storageKey);
    setGyms(nextGyms);
    setActiveGymId('');
    setActiveRouteId('');
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
    setLoadedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(gyms));
  }, [gyms, loadedStorageKey, storageKey]);

  const activeGym = useMemo(
    () => gyms.find((gym) => gym.id === activeGymId) || null,
    [activeGymId, gyms],
  );

  const activeRoute = useMemo(
    () => activeGym?.routes.find((route) => route.id === activeRouteId) || null,
    [activeGym, activeRouteId],
  );

  const totalRoutes = gyms.reduce((sum, gym) => sum + gym.routes.length, 0);
  const sentRoutes = gyms.reduce(
    (sum, gym) => sum + gym.routes.filter((route) => Boolean(route.sentAt)).length,
    0,
  );
  const sentEntries = useMemo(() => getSentEntries(gyms), [gyms]);
  const gradeSummary = useMemo(() => {
    const counts = sentEntries.reduce((acc, entry) => {
      acc[entry.grade] = (acc[entry.grade] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB, 'zh-CN'));
  }, [sentEntries]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth, sentEntries), [calendarMonth, sentEntries]);
  const entriesForSelectedDate = sentEntries.filter((entry) => entry.sentAt === selectedCalendarDate);

  const openCalendarRoute = (entry) => {
    setActiveGymId(entry.gymId);
    setActiveRouteId(entry.routeId);
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
  };

  const selectGym = (gymId) => {
    setActiveGymId(gymId);
    setActiveRouteId('');
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
  };

  const handleCreateGym = () => {
    const name = window.prompt('岩馆名字');
    if (!name?.trim()) return;

    const area = window.prompt('区域/城市', '未填写') || '未填写';
    const nextGym = {
      id: `${Date.now()}-${name}`,
      name: name.trim(),
      area: area.trim() || '未填写',
      imageUrl: gymImage('#475569', '#facc15', name.trim()),
      lastVisit: new Date().toISOString().slice(0, 10),
      routes: [],
    };

    setGyms((currentGyms) => [nextGym, ...currentGyms]);
    setActiveGymId(nextGym.id);
    setIsEditingGym(true);
  };

  const selectRoute = (routeId) => {
    setActiveRouteId(routeId);
    setIsEditing(false);
    setAiAnalysis('');
  };

  const updateActiveGym = (updates) => {
    if (!activeGym) return;

    setGyms((currentGyms) =>
      currentGyms.map((gym) => (gym.id === activeGym.id ? { ...gym, ...updates } : gym)),
    );
  };

  const deleteActiveGym = () => {
    if (!activeGym) return;
    const confirmed = window.confirm(`删除「${activeGym.name}」和里面的 ${activeGym.routes.length} 条线路记录？`);
    if (!confirmed) return;

    setGyms((currentGyms) => currentGyms.filter((gym) => gym.id !== activeGym.id));
    setActiveGymId('');
    setActiveRouteId('');
    setIsEditingGym(false);
  };

  const handleGymPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    updateActiveGym({ imageUrl: await fileToDataUrl(file) });
    event.target.value = '';
  };

  const updateRoute = (updates) => {
    if (!activeGym || !activeRoute) return;

    setGyms((currentGyms) =>
      currentGyms.map((gym) =>
        gym.id === activeGym.id
          ? {
              ...gym,
              routes: gym.routes.map((route) =>
                route.id === activeRoute.id ? { ...route, ...updates } : route,
              ),
            }
          : gym,
      ),
    );
  };

  const deleteActiveRoute = () => {
    if (!activeGym || !activeRoute) return;
    const confirmed = window.confirm(`删除「${activeRoute.name}」这条线路记录？`);
    if (!confirmed) return;

    setGyms((currentGyms) =>
      currentGyms.map((gym) =>
        gym.id === activeGym.id
          ? {
              ...gym,
              routes: gym.routes.filter((route) => route.id !== activeRoute.id),
            }
          : gym,
      ),
    );
    setActiveRouteId('');
    setIsEditing(false);
    setAiAnalysis('');
  };

  const handleAddRoutePhoto = async (event) => {
    if (!activeGym) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const imageUrl = await fileToDataUrl(file);
    const nextRoute = {
      id: `${Date.now()}-${file.name}`,
      name: `未命名线路 ${activeGym.routes.length + 1}`,
      grade: 'V?',
      sentAt: '',
      imageUrl,
      betaVideoUrl: '',
      notes: '',
    };

    setGyms((currentGyms) =>
      currentGyms.map((gym) =>
        gym.id === activeGym.id ? { ...gym, routes: [nextRoute, ...gym.routes] } : gym,
      ),
    );
    setActiveRouteId(nextRoute.id);
    setIsEditing(true);
    event.target.value = '';
  };

  const handleBetaVideo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    updateRoute({ betaVideoUrl: await fileToDataUrl(file) });
    setAiAnalysis('');
    event.target.value = '';
  };

  const handleAiAnalysis = () => {
    if (!activeRoute?.betaVideoUrl) {
      setAiAnalysis('先上传自己的 beta 视频，再发起分析。');
      return;
    }

    setAiAnalysis(
      'AI 视频分析入口已预留：后续接入视频理解模型后，这里可以输出动作节奏、重心偏移、脚法和下一次练习重点。',
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => {
            setActiveGymId('');
            setActiveRouteId('');
            setIsEditingGym(false);
          }}
        >
          <span className="brand-mark">
            <Dumbbell size={22} />
          </span>
          <span>
            <strong>BetaClimb</strong>
            <small>线路记录本</small>
          </span>
        </button>

        <div className="topbar-actions">
          <div className="summary-strip" aria-label="记录统计">
            <span>{gyms.length} 个岩馆</span>
            <span>{totalRoutes} 条线路</span>
            <span>{sentRoutes} 条已过线</span>
          </div>
          <UserMenu onOpenAuth={() => setIsAuthModalOpen(true)} />
        </div>
      </header>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {!activeGym ? (
        <main className="home-view">
          <section className="intro-band">
            <div>
              <p className="eyebrow">我的攀岩地图</p>
              <h1>攀岩日历</h1>
            </div>
            <button className="primary-btn" type="button" onClick={handleCreateGym}>
              <Plus size={18} />
              新建岩馆
            </button>
          </section>

          <section className="dashboard-grid" aria-label="攀岩概况和日历">
            <div className="overview-panel">
              <div className="section-title">
                <p className="eyebrow">概况</p>
                <h2>已过线难度统计</h2>
              </div>
              {gradeSummary.length ? (
                <div className="grade-grid">
                  {gradeSummary.map(([grade, count]) => (
                    <div className="grade-tile" key={grade}>
                      <strong>{grade}</strong>
                      <span>{count} 条</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">还没有带过线日期的线路。</p>
              )}
            </div>

            <div className="calendar-panel">
              <div className="calendar-header">
                <div className="section-title">
                  <p className="eyebrow">日历</p>
                  <h2>{formatMonthLabel(calendarMonth)}</h2>
                </div>
                <div className="month-controls">
                  <button className="ghost-btn icon-only" type="button" onClick={() => setCalendarMonth((month) => moveMonth(month, -1))}>
                    <ChevronLeft size={17} />
                  </button>
                  <button className="ghost-btn icon-only" type="button" onClick={() => setCalendarMonth((month) => moveMonth(month, 1))}>
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>

              <div className="calendar-grid" aria-label={`${formatMonthLabel(calendarMonth)} 攀岩日历`}>
                {['日', '一', '二', '三', '四', '五', '六'].map((weekday) => (
                  <span className="weekday" key={weekday}>{weekday}</span>
                ))}
                {calendarDays.map((day, index) =>
                  day ? (
                    <button
                      className={`calendar-day ${day.visits.length ? 'has-visits' : ''} ${day.date === selectedCalendarDate ? 'selected' : ''}`}
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedCalendarDate(day.date)}
                    >
                      <span>{day.day}</span>
                      {day.visits.length ? <small>{day.visits.length}</small> : null}
                    </button>
                  ) : (
                    <span className="calendar-blank" key={`blank-${index}`} />
                  ),
                )}
              </div>

              <div className="day-detail">
                <strong>{selectedCalendarDate || '选择日期'}</strong>
                {entriesForSelectedDate.length ? (
                  <div className="day-route-list">
                    {entriesForSelectedDate.map((entry) => (
                      <button className="day-route" key={`${entry.gymId}-${entry.routeId}`} type="button" onClick={() => openCalendarRoute(entry)}>
                        <span>
                          <b>{entry.routeName}</b>
                          <small>{entry.gymName}</small>
                        </span>
                        <em>{entry.grade}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">这天还没有记录过线。</p>
                )}
              </div>
            </div>
          </section>

          <section className="gym-list" aria-label="用户爬过的岩馆">
            {gyms.length ? (
              gyms.map((gym) => (
                <button className="gym-row" key={gym.id} type="button" onClick={() => selectGym(gym.id)}>
                  <img className="gym-cover-thumb" src={gym.imageUrl} alt={`${gym.name} 门店照片`} />
                  <span className="gym-info">
                    <strong>{gym.name}</strong>
                    <small>
                      {gym.area} · {gym.routes.length} 条线路 · 最近 {gym.lastVisit}
                    </small>
                  </span>
                  <ChevronRight size={20} />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>还没有岩馆记录</strong>
                <span>点“新建岩馆”开始记录自己的线路、照片和 beta 视频。</span>
              </div>
            )}
          </section>
        </main>
      ) : null}

      {activeGym && !activeRoute ? (
        <main className="routes-view">
          <div className="view-header">
            <button className="ghost-btn" type="button" onClick={() => setActiveGymId('')}>
              <ArrowLeft size={18} />
              岩馆
            </button>
            <div>
              <p className="eyebrow">{activeGym.area}</p>
              <h1>{activeGym.name}</h1>
            </div>
            <div className="header-actions">
              <button className="ghost-btn compact" type="button" onClick={() => setIsEditingGym((value) => !value)}>
                {isEditingGym ? <Save size={18} /> : <Pencil size={18} />}
                {isEditingGym ? '保存岩馆' : '编辑岩馆'}
              </button>
              <button className="primary-btn compact" type="button" onClick={() => routePhotoInputRef.current?.click()}>
                <ImagePlus size={18} />
                添加线路照片
              </button>
            </div>
            <input
              ref={routePhotoInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={handleAddRoutePhoto}
            />
          </div>

          <section className="gym-profile" aria-label="岩馆资料">
            <div className="gym-cover">
              <img src={activeGym.imageUrl} alt={`${activeGym.name} 门店照片`} />
              <div className="cover-actions">
                <button className="ghost-btn" type="button" onClick={() => gymPhotoInputRef.current?.click()}>
                  <Upload size={17} />
                  上传照片
                </button>
                <input
                  ref={gymPhotoInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={handleGymPhoto}
                />
              </div>
            </div>

            <div className="gym-form">
              <label className="field">
                <span>
                  <Pencil size={16} />
                  岩馆名字
                </span>
                <input
                  type="text"
                  value={activeGym.name}
                  disabled={!isEditingGym}
                  onChange={(event) => updateActiveGym({ name: event.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  <MapPin size={16} />
                  地点
                </span>
                <input
                  type="text"
                  value={activeGym.area}
                  disabled={!isEditingGym}
                  onChange={(event) => updateActiveGym({ area: event.target.value })}
                />
              </label>
              <button className="danger-btn" type="button" onClick={deleteActiveGym}>
                <Trash2 size={17} />
                删除这个岩馆
              </button>
            </div>
          </section>

          <section className="route-grid" aria-label="线路照片">
            {activeGym.routes.map((route) => (
              <button className="route-card" key={route.id} type="button" onClick={() => selectRoute(route.id)}>
                <img src={route.imageUrl} alt={`${route.name} 线路照片`} />
                <span className="route-card-meta">
                  <strong>{route.name}</strong>
                  <small>{route.grade} · {route.sentAt || '未记录过线日期'}</small>
                </span>
              </button>
            ))}
          </section>
        </main>
      ) : null}

      {activeGym && activeRoute ? (
        <main className="route-detail-view">
          <div className="view-header">
            <button className="ghost-btn" type="button" onClick={() => setActiveRouteId('')}>
              <ArrowLeft size={18} />
              线路照片
            </button>
            <div>
              <p className="eyebrow">{activeGym.name}</p>
              <h1>{activeRoute.name}</h1>
            </div>
            <button className="primary-btn compact" type="button" onClick={() => setIsEditing((value) => !value)}>
              {isEditing ? <Save size={18} /> : <Pencil size={18} />}
              {isEditing ? '完成' : '编辑'}
            </button>
          </div>

          <section className="detail-layout">
            <div className="route-photo-panel">
              <img src={activeRoute.imageUrl} alt={`${activeRoute.name} 大图`} />
            </div>

            <aside className="record-panel">
              <label className="field">
                <span>
                  <Pencil size={16} />
                  线路名称
                </span>
                <input
                  type="text"
                  value={activeRoute.name}
                  disabled={!isEditing}
                  onChange={(event) => updateRoute({ name: event.target.value })}
                />
              </label>

              <label className="field">
                <span>
                  <Pencil size={16} />
                  线路难度
                </span>
                <input
                  type="text"
                  value={activeRoute.grade}
                  disabled={!isEditing}
                  onChange={(event) => updateRoute({ grade: event.target.value })}
                />
              </label>

              <label className="field">
                <span>
                  <CalendarClock size={16} />
                  过线时间
                </span>
                <input
                  type="date"
                  value={activeRoute.sentAt}
                  disabled={!isEditing}
                  onChange={(event) => updateRoute({ sentAt: event.target.value })}
                />
              </label>

              <label className="field">
                <span>
                  <Timer size={16} />
                  备注
                </span>
                <textarea
                  value={activeRoute.notes}
                  disabled={!isEditing}
                  onChange={(event) => updateRoute({ notes: event.target.value })}
                />
              </label>

              <div className="video-box">
                <div className="video-header">
                  <span>
                    <Video size={16} />
                    自己的 beta 视频
                  </span>
                  <button className="ghost-btn icon-only" type="button" onClick={() => betaVideoInputRef.current?.click()}>
                    <Upload size={17} />
                  </button>
                  <input
                    ref={betaVideoInputRef}
                    className="sr-only"
                    type="file"
                    accept="video/*"
                    onChange={handleBetaVideo}
                  />
                </div>

                {activeRoute.betaVideoUrl ? (
                  <video src={activeRoute.betaVideoUrl} controls />
                ) : (
                  <div className="empty-video">
                    <PlaySquare size={34} />
                    <span>还没有上传 beta 视频</span>
                  </div>
                )}
              </div>

              <button className="ai-btn" type="button" onClick={handleAiAnalysis}>
                <Bot size={18} />
                AI 分析 beta 视频
              </button>
              {aiAnalysis ? <p className="ai-note">{aiAnalysis}</p> : null}

              <button className="danger-btn" type="button" onClick={deleteActiveRoute}>
                <Trash2 size={17} />
                删除这条线路
              </button>
            </aside>
          </section>
        </main>
      ) : null}
    </div>
  );
}
