import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  EyeOff,
  ImagePlus,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  PlaySquare,
  Plus,
  Save,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Target,
  Timer,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import './App.css';
import aiHoldsMascot from './assets/ai-holds-mascot.png';
import AuthModal from './components/AuthModal';
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
const CLOUD_GYMS_TABLE = 'user_gyms';
const PUBLIC_GYMS_TABLE = 'public_gyms';
const PUBLIC_ROUTES_TABLE = 'public_route_posts';
const PUBLIC_COMMENTS_TABLE = 'public_route_comments';
const PUBLIC_SQUARE_POSTS_TABLE = 'public_square_posts';
const PUBLIC_SQUARE_COMMENTS_TABLE = 'public_square_comments';
const BETA_VIDEO_BUCKET = 'beta-videos';
const MAX_LOCAL_VIDEO_BYTES = 6 * 1024 * 1024;
const LOCAL_SQUARE_POSTS_KEY = 'betaclimb:square-posts';

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

const writeStoredGyms = (storageKey, gyms) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(gyms));
    return true;
  } catch (error) {
    console.warn('本地存储空间不足，已跳过本机缓存。', error);
    return false;
  }
};

const readStoredSquarePosts = () => {
  try {
    const storedValue = window.localStorage.getItem(LOCAL_SQUARE_POSTS_KEY);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const writeStoredSquarePosts = (posts) => {
  try {
    window.localStorage.setItem(LOCAL_SQUARE_POSTS_KEY, JSON.stringify(posts));
  } catch (error) {
    console.warn('广场帖子本地缓存失败。', error);
  }
};

const sanitizeStorageName = (name) =>
  String(name || 'beta-video')
    .trim()
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'beta-video';

const sanitizeStorageSegment = (value, fallback) =>
  String(value || fallback)
    .replace(/data:[^,]+,/g, '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;

const getUserNickname = (user) => {
  const metadata = user?.user_metadata || {};
  const nickname = metadata.nickname || metadata.display_name || metadata.full_name || metadata.name;
  return String(nickname || '').trim();
};

const getPublicUserLabel = (user, fallback = '匿名用户') => getUserNickname(user) || fallback;

const getVisibleUserLabel = (label) => {
  const visibleLabel = String(label || '').trim();
  if (!visibleLabel || visibleLabel.includes('@')) return '匿名用户';
  return visibleLabel;
};

const isOwnPublicContent = (item, user) => {
  const itemUserId = String(item?.user_id || '');
  if (user?.id) return itemUserId === user.id;
  return itemUserId === 'local';
};

const saveCloudGyms = async (userId, gyms) => {
  if (!supabase || !userId) return { error: null };

  return supabase
    .from(CLOUD_GYMS_TABLE)
    .upsert(
      {
        user_id: userId,
        gyms,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
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

const getPublicRoutesFromGyms = (gyms, user) =>
  gyms.flatMap((gym) =>
    gym.routes
      .filter((route) => route.isPublic)
      .map((route) => ({
        id: `${user?.id || 'local'}:${route.id}`,
        user_id: user?.id || 'local',
        user_label: getPublicUserLabel(user, '我'),
        gym_id: gym.id,
        gym_name: gym.name,
        gym_area: gym.area,
        route_id: route.id,
        route_name: route.name,
        grade: route.grade,
        sent_at: route.sentAt || null,
        route_image_url: route.imageUrl,
        beta_video_url: route.betaVideoUrl || '',
        notes: route.notes || '',
        discussion_prompt: route.publicNote || '',
        created_at: route.publishedAt || new Date().toISOString(),
      })),
  );

const toPublicRoutePayload = (user, gym, route) => ({
  user_id: user.id,
  user_label: getPublicUserLabel(user),
  gym_id: gym.id,
  gym_name: gym.name,
  gym_area: gym.area,
  route_id: route.id,
  route_name: route.name,
  grade: route.grade,
  sent_at: route.sentAt || null,
  route_image_url: route.imageUrl,
  beta_video_url: route.betaVideoUrl || '',
  notes: route.notes || '',
  discussion_prompt: route.publicNote || '',
  updated_at: new Date().toISOString(),
});

const toPublicRoutePayloadFromLocalRoute = (user, route) => ({
  user_id: user.id,
  user_label: getPublicUserLabel(user),
  gym_id: route.gym_id,
  gym_name: route.gym_name,
  gym_area: route.gym_area,
  route_id: route.route_id,
  route_name: route.route_name,
  grade: route.grade,
  sent_at: route.sent_at,
  route_image_url: route.route_image_url,
  beta_video_url: route.beta_video_url,
  notes: route.notes,
  discussion_prompt: route.discussion_prompt,
  updated_at: new Date().toISOString(),
});

const toPublicGymPayload = (user, gym) => ({
  user_id: user.id,
  gym_id: gym.id,
  gym_name: gym.name,
  gym_area: gym.area || '未填写',
  image_url: gym.imageUrl || '',
  updated_at: new Date().toISOString(),
});

const getCurrentMonthRoutes = (routes, monthKey) =>
  routes.filter((route) => (route.sent_at || route.created_at || '').startsWith(monthKey));

const normalizeKeyPart = (value) => String(value || '').trim().toLowerCase();

const getGymDirectoryKey = (gym) =>
  `${normalizeKeyPart(gym.gym_name || gym.name || gym.gym_id || gym.id)}::${normalizeKeyPart(gym.gym_area || gym.area)}`;

const getRouteGymKey = (route) =>
  `${normalizeKeyPart(route.gym_name || route.gym_id)}::${normalizeKeyPart(route.gym_area)}`;

const getImageFingerprint = (imageUrl) =>
  new Promise((resolve) => {
    if (!imageUrl) {
      resolve('');
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 8, 8);
        const { data } = context.getImageData(0, 0, 8, 8);
        const values = [];

        for (let index = 0; index < data.length; index += 4) {
          values.push((data[index] + data[index + 1] + data[index + 2]) / 3);
        }

        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        resolve(values.map((value) => (value >= average ? '1' : '0')).join(''));
      } catch {
        resolve(imageUrl.slice(0, 120));
      }
    };
    image.onerror = () => resolve(imageUrl.slice(0, 120));
    image.src = imageUrl;
  });

const getHashDistance = (hashA, hashB) => {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Number.POSITIVE_INFINITY;
  return [...hashA].reduce((distance, bit, index) => distance + (bit === hashB[index] ? 0 : 1), 0);
};

const getNormalizedRouteName = (route) =>
  normalizeKeyPart(route.route_name)
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/未命名线路\d*/g, '');

const getNormalizedGrade = (route) => normalizeKeyPart(route.grade || '未定级');

const getRouteImageScore = (route) => {
  const imageUrl = route.route_image_url || '';
  const sizeHint = imageUrl.startsWith('data:image') ? Math.min(imageUrl.length / 1000, 900) : 120;
  const hasVideoBonus = route.beta_video_url ? 40 : 0;
  const hasNotesBonus = route.notes ? 20 : 0;
  return sizeHint + hasVideoBonus + hasNotesBonus;
};

const chooseRepresentativeRoute = (routes) =>
  [...routes].sort((routeA, routeB) => getRouteImageScore(routeB) - getRouteImageScore(routeA))[0] || routes[0];

const shouldMergeRoutes = (group, route, routeHash) => {
  const representative = group.representative;
  const nameA = getNormalizedRouteName(representative);
  const nameB = getNormalizedRouteName(route);
  const bothNamed = nameA.length >= 2 && nameB.length >= 2;
  const namesMatch = bothNamed && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA));
  const gradesMatch = getNormalizedGrade(representative) === getNormalizedGrade(route);
  const imageDistance = getHashDistance(group.imageHash, routeHash);
  const imagesVeryCloseWithSignal = imageDistance <= 3 && (namesMatch || gradesMatch);
  const imagesCloseWithSameMetadata = imageDistance <= 8 && namesMatch && gradesMatch;

  return (namesMatch && gradesMatch && imageDistance <= 14) || imagesVeryCloseWithSignal || imagesCloseWithSameMetadata;
};

const groupRoutesBySimilarity = (routes, routeImageFingerprints) =>
  routes.reduce((groups, route) => {
    const routeHash = routeImageFingerprints[route.id] || route.route_image_url || '';
    const matchingGroup = groups.find((group) => shouldMergeRoutes(group, route, routeHash));

    if (matchingGroup) {
      matchingGroup.routes.push(route);
      matchingGroup.userIds.add(route.user_id || route.user_label || 'unknown');
      matchingGroup.grades[route.grade || '未定级'] = (matchingGroup.grades[route.grade || '未定级'] || 0) + 1;
      matchingGroup.representative = chooseRepresentativeRoute(matchingGroup.routes);
      return groups;
    }

    groups.push({
      id: `${route.gym_id || route.gym_name}:${routeHash || route.id}`,
      imageHash: routeHash,
      representative: route,
      routes: [route],
      userIds: new Set([route.user_id || route.user_label || 'unknown']),
      grades: {
        [route.grade || '未定级']: 1,
      },
    });
    return groups;
  }, []);

const buildPublicGymStats = (gymDirectory = [], routes, monthKey, routeImageFingerprints) => {
  const routesThisMonth = getCurrentMonthRoutes(routes, monthKey);
  const statsByGym = gymDirectory.reduce((acc, gym) => {
    const gymId = getGymDirectoryKey(gym);
    acc[gymId] = {
      id: gymId,
      name: gym.gym_name || gym.name || '未命名岩馆',
      area: gym.gym_area || gym.area || '未填写',
      imageUrl: gym.image_url || gym.imageUrl || '',
      routeCount: 0,
      userIds: new Set(),
      grades: {},
      routes: [],
      routeGroups: [],
    };
    return acc;
  }, {});

  routesThisMonth.forEach((route) => {
    const gymId = getRouteGymKey(route);
    const current = statsByGym[gymId] || {
      id: gymId,
      name: route.gym_name || '未命名岩馆',
      area: route.gym_area || '未填写',
      imageUrl: '',
      routeCount: 0,
      userIds: new Set(),
      grades: {},
      routes: [],
      routeGroups: [],
    };

    current.routeCount += 1;
    current.userIds.add(route.user_id || route.user_label || 'unknown');
    current.grades[route.grade || '未定级'] = (current.grades[route.grade || '未定级'] || 0) + 1;
    current.routes.push(route);
    statsByGym[gymId] = current;
  });

  return Object.values(statsByGym)
    .map((gym) => ({
      ...gym,
      userCount: gym.userIds.size,
      gradeSummary: Object.entries(gym.grades).sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB, 'zh-CN')),
      routeGroups: groupRoutesBySimilarity(gym.routes, routeImageFingerprints)
        .map((group) => ({
          ...group,
          userCount: group.userIds.size,
          routeCount: group.routes.length,
          gradeSummary: Object.entries(group.grades).sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB, 'zh-CN')),
        }))
        .sort((groupA, groupB) => getRouteImageScore(groupB.representative) - getRouteImageScore(groupA.representative)),
    }))
    .sort((gymA, gymB) => gymB.routeCount - gymA.routeCount || gymA.name.localeCompare(gymB.name, 'zh-CN'));
};

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

const getRouteAddedAt = (route, gym) => {
  if (route.createdAt || route.addedAt) return (route.createdAt || route.addedAt).slice(0, 10);

  const timestamp = Number(String(route.id || '').split('-')[0]);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  return (gym.lastVisit || new Date().toISOString()).slice(0, 10);
};

const buildMonthlyPersonalStats = (gyms, monthKey) => {
  const gymStatsById = {};
  const visitKeys = new Set();
  const unsentRoutes = [];
  let sentCount = 0;
  let unsentCount = 0;

  gyms.forEach((gym) => {
    const gymStats = gymStatsById[gym.id] || {
      gymId: gym.id,
      gymName: gym.name,
      gymArea: gym.area,
      visitDates: new Set(),
      sentCount: 0,
      unsentCount: 0,
    };

    gym.routes.forEach((route) => {
      const addedAt = getRouteAddedAt(route, gym);

      if (route.sentAt?.startsWith(monthKey)) {
        sentCount += 1;
        gymStats.sentCount += 1;
        gymStats.visitDates.add(route.sentAt);
        visitKeys.add(`${gym.id}:${route.sentAt}`);
      }

      if (!route.sentAt && addedAt.startsWith(monthKey)) {
        unsentCount += 1;
        gymStats.unsentCount += 1;
        gymStats.visitDates.add(addedAt);
        visitKeys.add(`${gym.id}:${addedAt}`);
        unsentRoutes.push({
          gymId: gym.id,
          gymName: gym.name,
          gymArea: gym.area,
          routeId: route.id,
          routeName: route.name,
          grade: route.grade.trim().toUpperCase() || '未定级',
        });
      }
    });

    if (gymStats.sentCount || gymStats.unsentCount || gymStats.visitDates.size) {
      gymStatsById[gym.id] = gymStats;
    }
  });

  return {
    gymCount: Object.keys(gymStatsById).length,
    visitCount: visitKeys.size,
    sentCount,
    unsentCount,
    gymStats: Object.values(gymStatsById)
      .map((gymStats) => ({
        ...gymStats,
        visitCount: gymStats.visitDates.size,
      }))
      .sort(
        (gymA, gymB) =>
          gymB.visitCount - gymA.visitCount ||
          gymB.sentCount - gymA.sentCount ||
          gymB.unsentCount - gymA.unsentCount ||
          gymA.gymName.localeCompare(gymB.gymName, 'zh-CN'),
      ),
    unsentRoutes: unsentRoutes.sort(
      (routeA, routeB) =>
        routeA.gymName.localeCompare(routeB.gymName, 'zh-CN') ||
        routeA.grade.localeCompare(routeB.grade, 'zh-CN') ||
        routeA.routeName.localeCompare(routeB.routeName, 'zh-CN'),
    ),
  };
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

const groupGymRoutesByStatusAndMonth = (gym) => {
  if (!gym) {
    return { sent: [], unsent: [] };
  }

  const buildGroups = (routes, getMonthKey) => {
    const groupsByMonth = routes.reduce((acc, route) => {
      const monthKey = getMonthKey(route).slice(0, 7);
      acc[monthKey] = [...(acc[monthKey] || []), route];
      return acc;
    }, {});

    return Object.entries(groupsByMonth)
      .sort(([monthA], [monthB]) => monthB.localeCompare(monthA))
      .map(([monthKey, routes]) => ({
        monthKey,
        routes: routes.sort((routeA, routeB) =>
          (getMonthKey(routeB) || '').localeCompare(getMonthKey(routeA) || ''),
        ),
      }));
  };

  return {
    sent: buildGroups(
      gym.routes.filter((route) => route.sentAt),
      (route) => route.sentAt,
    ),
    unsent: buildGroups(
      gym.routes.filter((route) => !route.sentAt),
      (route) => getRouteAddedAt(route, gym),
    ),
  };
};

const getFavoriteRouteEntries = (gyms) =>
  gyms
    .flatMap((gym) =>
      gym.routes
        .filter((route) => route.isFavorite)
        .map((route) => ({
          gymId: gym.id,
          gymName: gym.name,
          gymArea: gym.area,
          routeId: route.id,
          routeName: route.name,
          grade: route.grade.trim().toUpperCase() || '未定级',
          sentAt: route.sentAt || '',
          addedAt: getRouteAddedAt(route, gym),
          favoriteAt: route.favoriteAt || '',
          imageUrl: route.imageUrl,
        })),
    )
    .sort(
      (routeA, routeB) =>
        (routeB.favoriteAt || routeB.sentAt || routeB.addedAt).localeCompare(
          routeA.favoriteAt || routeA.sentAt || routeA.addedAt,
        ) ||
        routeA.gymName.localeCompare(routeB.gymName, 'zh-CN') ||
        routeA.routeName.localeCompare(routeB.routeName, 'zh-CN'),
    );

function UserMenu({ onOpenAuth }) {
  const { isAuthLoading, user } = useAuth();
  const nickname = getUserNickname(user);
  const visibleName = nickname || '设置昵称';

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  const handleSetNickname = async () => {
    const nextNickname = window.prompt('设置昵称', nickname);
    if (nextNickname === null) return;

    const trimmedNickname = nextNickname.trim();
    if (!trimmedNickname) return;

    const { error } = await supabase.auth.updateUser({
      data: {
        nickname: trimmedNickname,
      },
    });

    if (error) {
      window.alert('昵称保存失败，请稍后再试。');
    }
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

  const initial = (nickname || '攀').slice(0, 1).toUpperCase();

  return (
    <div className="user-menu" aria-label="当前登录用户">
      <span className="user-avatar" aria-hidden="true">
        {initial}
      </span>
      <button className="user-label" type="button" onClick={handleSetNickname}>
        {visibleName}
      </button>
      <button className="ghost-btn icon-only" type="button" onClick={handleSignOut} aria-label="退出登录">
        <LogOut size={17} />
      </button>
    </div>
  );
}

function TopNavButton({ active, children, icon: Icon, onClick }) {
  return (
    <button className={`top-nav-btn ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <Icon size={17} />
      {children}
    </button>
  );
}

function PublicDataStatus({ status }) {
  if (!status.message) return null;

  return (
    <div className={`public-sync-status ${status.state}`} role="status">
      <span>{status.message}</span>
      <small>
        Supabase {status.remoteCount} 条 · 本机已同意公开 {status.localCount} 条
      </small>
    </div>
  );
}

function OwnBadge({ children = '我' }) {
  return <span className="own-badge">{children}</span>;
}

const AI_ASSISTANT_MODES = [
  {
    id: 'consult',
    title: '攀岩咨询',
    description: '线路 beta、装备选择、岩馆取舍和当天策略',
    icon: MessageCircle,
    placeholder: '例如：我想买第一双攀岩鞋，脚型偏宽；或者今晚在静安附近找一家适合练 slab 的岩馆。',
    action: '生成攀岩建议',
    loading: '正在整理建议...',
  },
  {
    id: 'training',
    title: '训练计划',
    description: '把目标、疲劳和记录整理成一次完整训练',
    icon: ClipboardList,
    placeholder: '例如：今天想练动态，但肩膀有点累，希望强度控制在 7/10，训练 90 分钟。',
    action: '生成训练计划',
    loading: '正在生成计划...',
  },
];

export default function App() {
  const { user } = useAuth();
  const [gyms, setGyms] = useState([]);
  const [activeView, setActiveView] = useState('personal');
  const [activeGymId, setActiveGymId] = useState('');
  const [activeRouteId, setActiveRouteId] = useState('');
  const [activePublicGymId, setActivePublicGymId] = useState('');
  const [activePublicGrade, setActivePublicGrade] = useState('');
  const [activePublicRouteGroupId, setActivePublicRouteGroupId] = useState('');
  const [activeDiscussionRouteId, setActiveDiscussionRouteId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingGym, setIsEditingGym] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiMode, setAiMode] = useState('consult');
  const [aiNeed, setAiNeed] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [gymSearchQuery, setGymSearchQuery] = useState('');
  const [publicGyms, setPublicGyms] = useState([]);
  const [publicRoutes, setPublicRoutes] = useState([]);
  const [routeImageFingerprints, setRouteImageFingerprints] = useState({});
  const [publicDataStatus, setPublicDataStatus] = useState({
    state: 'idle',
    remoteCount: 0,
    localCount: 0,
    syncedCount: 0,
    message: '',
  });
  const [squarePosts, setSquarePosts] = useState([]);
  const [activeSquarePostId, setActiveSquarePostId] = useState('');
  const [squarePostDraft, setSquarePostDraft] = useState({
    category: '闲聊',
    title: '',
    content: '',
  });
  const [squareComments, setSquareComments] = useState([]);
  const [squareCommentDraft, setSquareCommentDraft] = useState('');
  const [publicComments, setPublicComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState('');
  const [isCloudStorageReady, setIsCloudStorageReady] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const routePhotoInputRef = useRef(null);
  const gymPhotoInputRef = useRef(null);
  const betaVideoInputRef = useRef(null);
  const localSquareIdRef = useRef(0);
  const storageKey = user?.id ? `${STORAGE_PREFIX}:${user.id}` : GUEST_STORAGE_KEY;

  const switchView = (nextView) => {
    setActiveView(nextView);
    setActiveGymId('');
    setActiveRouteId('');
    setActivePublicGrade('');
    setActivePublicRouteGroupId('');
    setIsFavoritesOpen(false);
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
  };

  useEffect(() => {
    let isActive = true;

    setActiveGymId('');
    setActiveRouteId('');
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
    setLoadedStorageKey('');
    setIsCloudStorageReady(false);

    const loadGyms = async () => {
      const localGyms = readStoredGyms(storageKey);
      const guestGyms = user ? readStoredGyms(GUEST_STORAGE_KEY) : [];
      const fallbackGyms = localGyms.length ? localGyms : guestGyms;

      if (!user || !supabase) {
        if (!isActive) return;
        setGyms(localGyms);
        setLoadedStorageKey(storageKey);
        setIsCloudStorageReady(false);
        return;
      }

      const { data, error } = await supabase
        .from(CLOUD_GYMS_TABLE)
        .select('gyms')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        console.error('读取云端攀岩数据失败', error);
        setGyms(fallbackGyms);
        setLoadedStorageKey(storageKey);
        setIsCloudStorageReady(false);
        return;
      }

      const cloudGyms = Array.isArray(data?.gyms) ? data.gyms : null;
      const nextGyms = cloudGyms || fallbackGyms;
      setGyms(nextGyms);
      writeStoredGyms(storageKey, nextGyms);

      if (!cloudGyms && fallbackGyms.length) {
        const { error: saveError } = await saveCloudGyms(user.id, fallbackGyms);
        if (saveError) {
          console.error('初始化云端攀岩数据失败', saveError);
        }
      }

      if (!isActive) return;
      setLoadedStorageKey(storageKey);
      setIsCloudStorageReady(true);
    };

    loadGyms();

    return () => {
      isActive = false;
    };
  }, [storageKey, user]);

  useEffect(() => {
    let isActive = true;

    const loadPublicGyms = async () => {
      const localPublicGyms = gyms.map((gym) => ({
        id: gym.id,
        gym_id: gym.id,
        gym_name: gym.name,
        gym_area: gym.area || '未填写',
        image_url: gym.imageUrl || '',
      }));

      if (!supabase) {
        setPublicGyms(localPublicGyms);
        return;
      }

      let syncedGyms = [];
      if (user && gyms.length) {
        const { data: syncedData, error: syncError } = await supabase
          .from(PUBLIC_GYMS_TABLE)
          .upsert(gyms.map((gym) => toPublicGymPayload(user, gym)), {
            onConflict: 'user_id,gym_id',
          })
          .select('*');

        if (!isActive) return;

        if (syncError) {
          console.warn('公开岩馆目录同步失败。', syncError);
        } else {
          syncedGyms = Array.isArray(syncedData) ? syncedData : [];
        }
      }

      const { data, error } = await supabase
        .from(PUBLIC_GYMS_TABLE)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(240);

      if (!isActive) return;

      if (error) {
        console.warn('公开岩馆目录不可用，使用本机岩馆目录。', error);
        setPublicGyms(localPublicGyms);
        return;
      }

      const remoteGyms = Array.isArray(data) ? data : [];
      const syncedGymKeys = new Set(syncedGyms.map((gym) => `${gym.user_id}:${gym.gym_id}`));
      const mergedGyms = [
        ...syncedGyms,
        ...remoteGyms.filter((gym) => !syncedGymKeys.has(`${gym.user_id}:${gym.gym_id}`)),
      ];
      setPublicGyms(mergedGyms.length ? mergedGyms : localPublicGyms);
    };

    loadPublicGyms();

    return () => {
      isActive = false;
    };
  }, [gyms, user]);

  useEffect(() => {
    let isActive = true;

    const loadSquarePosts = async () => {
      const localPosts = readStoredSquarePosts();

      if (!supabase) {
        setSquarePosts(localPosts);
        return;
      }

      const { data, error } = await supabase
        .from(PUBLIC_SQUARE_POSTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(120);

      if (!isActive) return;

      if (error) {
        console.warn('广场帖子表还不可用，使用本机广场帖子。', error);
        setSquarePosts(localPosts);
        return;
      }

      const remotePosts = Array.isArray(data) ? data : [];
      const localOnlyPosts = localPosts.filter((post) => String(post.id).startsWith('local-'));
      setSquarePosts([...localOnlyPosts, ...remotePosts]);
    };

    loadSquarePosts();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadPublicRoutes = async () => {
      const localPublicRoutes = getPublicRoutesFromGyms(gyms, user);
      setPublicDataStatus({
        state: 'loading',
        remoteCount: 0,
        localCount: localPublicRoutes.length,
        syncedCount: 0,
        message: '正在同步公开线路...',
      });

      if (!supabase) {
        setPublicRoutes(localPublicRoutes);
        setPublicDataStatus({
          state: 'local',
          remoteCount: 0,
          localCount: localPublicRoutes.length,
          syncedCount: 0,
          message: '未连接 Supabase，当前只显示本机公开预览。',
        });
        return;
      }

      const { data, error } = await supabase
        .from(PUBLIC_ROUTES_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(120);

      if (!isActive) return;

      if (error) {
        console.warn('公开线路表还不可用，使用本地公开预览数据。', error);
        setPublicRoutes(localPublicRoutes);
        setPublicDataStatus({
          state: 'error',
          remoteCount: 0,
          localCount: localPublicRoutes.length,
          syncedCount: 0,
          message: '公开数据读取失败，当前只显示本机公开预览。',
        });
        return;
      }

      const remoteRoutes = Array.isArray(data) ? data : [];
      let syncedRoutes = [];

      if (user && localPublicRoutes.length) {
        const { data: syncedData, error: syncError } = await supabase
          .from(PUBLIC_ROUTES_TABLE)
          .upsert(localPublicRoutes.map((route) => toPublicRoutePayloadFromLocalRoute(user, route)), {
            onConflict: 'user_id,route_id',
          })
          .select('*');

        if (!isActive) return;

        if (syncError) {
          console.warn('本机公开线路补同步失败。', syncError);
        } else {
          syncedRoutes = Array.isArray(syncedData) ? syncedData : [];
        }
      }

      const syncedRouteKeys = new Set(syncedRoutes.map((route) => `${route.user_id}:${route.route_id}`));
      const nextRemoteRoutes = [
        ...syncedRoutes,
        ...remoteRoutes.filter((route) => !syncedRouteKeys.has(`${route.user_id}:${route.route_id}`)),
      ];
      const remoteRouteKeys = new Set(nextRemoteRoutes.map((route) => `${route.user_id}:${route.route_id}`));
      const mergedRoutes = [
        ...nextRemoteRoutes,
        ...localPublicRoutes.filter((route) => !remoteRouteKeys.has(`${route.user_id}:${route.route_id}`)),
      ];
      setPublicRoutes(mergedRoutes);
      setPublicDataStatus({
        state: syncedRoutes.length ? 'synced' : 'ready',
        remoteCount: nextRemoteRoutes.length,
        localCount: localPublicRoutes.length,
        syncedCount: syncedRoutes.length,
        message: syncedRoutes.length
          ? `已同步 ${nextRemoteRoutes.length} 条公开线路，其中 ${syncedRoutes.length} 条来自本机补同步。`
          : `已从 Supabase 读取 ${nextRemoteRoutes.length} 条公开线路。`,
      });
    };

    loadPublicRoutes();

    return () => {
      isActive = false;
    };
  }, [gyms, user]);

  useEffect(() => {
    let isActive = true;

    const loadRouteImageFingerprints = async () => {
      const missingRoutes = publicRoutes.filter((route) => route.route_image_url && !routeImageFingerprints[route.id]);
      if (!missingRoutes.length) return;

      const nextEntries = await Promise.all(
        missingRoutes.map(async (route) => [route.id, await getImageFingerprint(route.route_image_url)]),
      );

      if (!isActive) return;

      setRouteImageFingerprints((currentFingerprints) => ({
        ...currentFingerprints,
        ...Object.fromEntries(nextEntries),
      }));
    };

    loadRouteImageFingerprints();

    return () => {
      isActive = false;
    };
  }, [publicRoutes, routeImageFingerprints]);

  useEffect(() => {
    let isActive = true;

    const loadComments = async () => {
      if (!supabase || !activeDiscussionRouteId) {
        setPublicComments([]);
        return;
      }

      const { data, error } = await supabase
        .from(PUBLIC_COMMENTS_TABLE)
        .select('*')
        .eq('post_id', activeDiscussionRouteId)
        .order('created_at', { ascending: true })
        .limit(60);

      if (!isActive) return;

      if (error) {
        console.warn('公开讨论表还不可用，暂时隐藏讨论数据。', error);
        setPublicComments([]);
        return;
      }

      setPublicComments(Array.isArray(data) ? data : []);
    };

    loadComments();

    return () => {
      isActive = false;
    };
  }, [activeDiscussionRouteId]);

  useEffect(() => {
    let isActive = true;

    const loadSquareComments = async () => {
      if (!supabase || !activeSquarePostId || String(activeSquarePostId).startsWith('local-')) {
        setSquareComments([]);
        return;
      }

      const { data, error } = await supabase
        .from(PUBLIC_SQUARE_COMMENTS_TABLE)
        .select('*')
        .eq('post_id', activeSquarePostId)
        .order('created_at', { ascending: true })
        .limit(80);

      if (!isActive) return;

      if (error) {
        console.warn('广场评论表还不可用，暂时隐藏评论数据。', error);
        setSquareComments([]);
        return;
      }

      setSquareComments(Array.isArray(data) ? data : []);
    };

    loadSquareComments();

    return () => {
      isActive = false;
    };
  }, [activeSquarePostId]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    writeStoredGyms(storageKey, gyms);

    if (!user || !isCloudStorageReady) return;

    const timeoutId = window.setTimeout(() => {
      saveCloudGyms(user.id, gyms).then(({ error }) => {
        if (error) {
          console.error('保存云端攀岩数据失败', error);
        }
      });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [gyms, isCloudStorageReady, loadedStorageKey, storageKey, user]);

  const activeGym = useMemo(
    () => gyms.find((gym) => gym.id === activeGymId) || null,
    [activeGymId, gyms],
  );

  const activeRoute = useMemo(
    () => activeGym?.routes.find((route) => route.id === activeRouteId) || null,
    [activeGym, activeRouteId],
  );
  const activeGymRouteGroups = useMemo(() => groupGymRoutesByStatusAndMonth(activeGym), [activeGym]);

  const totalRoutes = gyms.reduce((sum, gym) => sum + gym.routes.length, 0);
  const sentRoutes = gyms.reduce(
    (sum, gym) => sum + gym.routes.filter((route) => Boolean(route.sentAt)).length,
    0,
  );
  const favoriteRoutes = useMemo(() => getFavoriteRouteEntries(gyms), [gyms]);
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
  const monthlyPersonalStats = useMemo(
    () => buildMonthlyPersonalStats(gyms, calendarMonth),
    [calendarMonth, gyms],
  );
  const publicGymStats = useMemo(
    () => buildPublicGymStats(publicGyms, publicRoutes, calendarMonth, routeImageFingerprints),
    [calendarMonth, publicGyms, publicRoutes, routeImageFingerprints],
  );
  const filteredPublicGymStats = useMemo(() => {
    const query = gymSearchQuery.trim().toLowerCase();
    if (!query) return publicGymStats;

    return publicGymStats.filter((gym) =>
      [gym.name, gym.area]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [gymSearchQuery, publicGymStats]);
  const activePublicGym = publicGymStats.find((gym) => gym.id === activePublicGymId) || null;
  const activePublicRouteGroups = useMemo(() => {
    if (!activePublicGym) return [];
    if (!activePublicGrade) return activePublicGym.routeGroups;

    return activePublicGym.routeGroups.filter((group) =>
      group.routes.some((route) => (route.grade || '未定级') === activePublicGrade),
    );
  }, [activePublicGrade, activePublicGym]);
  const activePublicRouteGroup =
    activePublicRouteGroups.find((group) => group.id === activePublicRouteGroupId) ||
    activePublicGym?.routeGroups.find((group) => group.id === activePublicRouteGroupId) ||
    null;

  useEffect(() => {
    if (!activePublicRouteGroupId) return;
    if (activePublicRouteGroups.some((group) => group.id === activePublicRouteGroupId)) return;
    setActivePublicRouteGroupId('');
  }, [activePublicRouteGroupId, activePublicRouteGroups]);

  const squareRoutes = useMemo(
    () =>
      [...publicRoutes].sort(
        (routeA, routeB) =>
          new Date(routeB.created_at || routeB.updated_at || 0).getTime() -
          new Date(routeA.created_at || routeA.updated_at || 0).getTime(),
      ),
    [publicRoutes],
  );
  const sortedSquarePosts = useMemo(
    () =>
      [...squarePosts].sort(
        (postA, postB) =>
          new Date(postB.created_at || postB.updated_at || 0).getTime() -
          new Date(postA.created_at || postA.updated_at || 0).getTime(),
      ),
    [squarePosts],
  );
  const activeSquarePost = sortedSquarePosts.find((post) => post.id === activeSquarePostId) || null;
  const activeDiscussionRoute = squareRoutes.find((route) => route.id === activeDiscussionRouteId) || null;
  const activePublicRouteSections = activePublicRouteGroup
    ? [
        {
          title: '我的记录',
          routes: activePublicRouteGroup.routes.filter((route) => isOwnPublicContent(route, user)),
        },
        {
          title: '其他人的记录',
          routes: activePublicRouteGroup.routes.filter((route) => !isOwnPublicContent(route, user)),
        },
      ].filter((section) => section.routes.length)
    : [];

  const openCalendarRoute = (entry) => {
    setActiveGymId(entry.gymId);
    setActiveRouteId(entry.routeId);
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
  };

  const openChallengeRoute = (route) => {
    setActiveGymId(route.gymId);
    setActiveRouteId(route.routeId);
    setIsFavoritesOpen(false);
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
  };

  const openFavoriteRoute = (route) => {
    setActiveView('personal');
    setActiveGymId(route.gymId);
    setActiveRouteId(route.routeId);
    setIsFavoritesOpen(false);
    setIsEditing(false);
    setIsEditingGym(false);
    setAiAnalysis('');
  };

  const selectGym = (gymId) => {
    setActiveGymId(gymId);
    setActiveRouteId('');
    setIsFavoritesOpen(false);
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
    setIsFavoritesOpen(false);
    setIsEditing(false);
    setAiAnalysis('');
  };

  const selectPublicGym = (gymId) => {
    setActivePublicGymId(gymId);
    setActivePublicGrade('');
    setActivePublicRouteGroupId('');
  };

  const selectPublicGrade = (grade) => {
    setActivePublicGrade((currentGrade) => (currentGrade === grade ? '' : grade));
    setActivePublicRouteGroupId('');
  };

  const openPublicRouteDiscussion = (routeId) => {
    const route = publicRoutes.find((publicRoute) => publicRoute.id === routeId);
    setActiveView('routeDiscussion');
    if (route) {
      setActivePublicGymId(getRouteGymKey(route));
    }
    setActiveDiscussionRouteId(routeId);
    setActiveSquarePostId('');
    setActiveGymId('');
    setActiveRouteId('');
    setIsEditing(false);
    setIsEditingGym(false);
  };

  const closePublicRouteDiscussion = () => {
    setActiveView('gyms');
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

  const toggleFavoriteRoute = () => {
    if (!activeRoute) return;

    const nextIsFavorite = !activeRoute.isFavorite;
    updateRoute({
      isFavorite: nextIsFavorite,
      favoriteAt: nextIsFavorite ? new Date().toISOString() : '',
    });
  };

  const publishActiveRoute = async (isPublic) => {
    if (!activeGym || !activeRoute) return;

    if (isPublic && !user) {
      setIsAuthModalOpen(true);
      return;
    }

    const publishedAt = isPublic ? activeRoute.publishedAt || new Date().toISOString() : '';
    updateRoute({ isPublic, publishedAt });

    if (!supabase || !user) return;

    if (!isPublic) {
      const { error } = await supabase
        .from(PUBLIC_ROUTES_TABLE)
        .delete()
        .eq('user_id', user.id)
        .eq('route_id', activeRoute.id);
      if (error) console.warn('取消公开线路失败，请确认公开线路表已创建。', error);
      return;
    }

    const { data, error } = await supabase
      .from(PUBLIC_ROUTES_TABLE)
      .upsert(toPublicRoutePayload(user, activeGym, { ...activeRoute, isPublic, publishedAt }), {
        onConflict: 'user_id,route_id',
      })
      .select()
      .single();

    if (error) {
      console.warn('公开线路失败，请确认公开线路表已创建。', error);
      return;
    }

    if (data) {
      setPublicRoutes((currentRoutes) => [
        data,
        ...currentRoutes.filter((route) => `${route.user_id}:${route.route_id}` !== `${data.user_id}:${data.route_id}`),
      ]);
    }
  };

  const handleSubmitComment = async () => {
    const content = commentDraft.trim();
    if (!content || !activeDiscussionRoute) return;

    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const optimisticComment = {
      id: `local-route-comment-${(localSquareIdRef.current += 1)}`,
      post_id: activeDiscussionRoute.id,
      user_id: user.id,
      user_label: getPublicUserLabel(user, '我'),
      content,
      created_at: new Date().toISOString(),
    };

    setCommentDraft('');
    setPublicComments((currentComments) => [...currentComments, optimisticComment]);

    if (!supabase) return;

    const { data, error } = await supabase
      .from(PUBLIC_COMMENTS_TABLE)
      .insert({
        post_id: activeDiscussionRoute.id,
        user_id: user.id,
        user_label: getPublicUserLabel(user),
        content,
      })
      .select()
      .single();

    if (error) {
      console.warn('发送讨论失败，请确认公开讨论表已创建。', error);
      return;
    }

    if (data) {
      setPublicComments((currentComments) =>
        currentComments.map((comment) => (comment.id === optimisticComment.id ? data : comment)),
      );
    }
  };

  const handleCreateSquarePost = async () => {
    const title = squarePostDraft.title.trim();
    const content = squarePostDraft.content.trim();
    const category = squarePostDraft.category.trim() || '闲聊';
    if (!title || !content) return;

    if (!user && supabase) {
      setIsAuthModalOpen(true);
      return;
    }

    const optimisticPost = {
      id: `local-post-${(localSquareIdRef.current += 1)}`,
      user_id: user?.id || 'local',
      user_label: getPublicUserLabel(user, '本机用户'),
      category,
      title,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const nextPosts = [optimisticPost, ...squarePosts];
    setSquarePosts(nextPosts);
    writeStoredSquarePosts(nextPosts);
    setActiveSquarePostId(optimisticPost.id);
    setSquarePostDraft({ category, title: '', content: '' });

    if (!supabase) return;

    const { data, error } = await supabase
      .from(PUBLIC_SQUARE_POSTS_TABLE)
      .insert({
        user_label: getPublicUserLabel(user),
        category,
        title,
        content,
      })
      .select()
      .single();

    if (error) {
      console.warn('发布广场帖子失败，请确认广场帖子表已创建。', error);
      return;
    }

    if (data) {
      setSquarePosts((currentPosts) => {
        const updatedPosts = currentPosts.map((post) => (post.id === optimisticPost.id ? data : post));
        writeStoredSquarePosts(updatedPosts);
        return updatedPosts;
      });
      setActiveSquarePostId(data.id);
    }
  };

  const handleSubmitSquareComment = async () => {
    const content = squareCommentDraft.trim();
    if (!content || !activeSquarePost) return;

    if (!user && supabase) {
      setIsAuthModalOpen(true);
      return;
    }

    const optimisticComment = {
      id: `local-comment-${(localSquareIdRef.current += 1)}`,
      post_id: activeSquarePost.id,
      user_id: user?.id || 'local',
      user_label: getPublicUserLabel(user, '本机用户'),
      content,
      created_at: new Date().toISOString(),
    };

    setSquareCommentDraft('');
    setSquareComments((currentComments) => [...currentComments, optimisticComment]);

    if (!supabase || String(activeSquarePost.id).startsWith('local-')) return;

    const { data, error } = await supabase
      .from(PUBLIC_SQUARE_COMMENTS_TABLE)
      .insert({
        post_id: activeSquarePost.id,
        user_id: user.id,
        user_label: getPublicUserLabel(user),
        content,
      })
      .select()
      .single();

    if (error) {
      console.warn('发送广场评论失败，请确认广场评论表已创建。', error);
      return;
    }

    if (data) {
      setSquareComments((currentComments) =>
        currentComments.map((comment) => (comment.id === optimisticComment.id ? data : comment)),
      );
    }
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
      createdAt: new Date().toISOString().slice(0, 10),
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

    if (!activeGym || !activeRoute) {
      event.target.value = '';
      return;
    }

    try {
      setAiAnalysis('正在上传 beta 视频...');

      let betaVideoUrl = '';

      if (supabase && user) {
        const extension = sanitizeStorageSegment(file.name.includes('.') ? file.name.split('.').pop() : 'mp4', 'mp4');
        const fileName = `${Date.now()}-${crypto.randomUUID()}-${sanitizeStorageName(file.name || `beta.${extension}`)}`;
        const filePath = `${user.id}/${fileName}`;
        const { error } = await supabase.storage
          .from(BETA_VIDEO_BUCKET)
          .upload(filePath, file, {
            cacheControl: '31536000',
            contentType: file.type || 'video/mp4',
            upsert: true,
          });

        if (error) {
          throw new Error(`视频上传失败：${error.message}`);
        }

        const { data } = supabase.storage.from(BETA_VIDEO_BUCKET).getPublicUrl(filePath);
        betaVideoUrl = data.publicUrl;
      } else {
        if (file.size > MAX_LOCAL_VIDEO_BYTES) {
          throw new Error('请先登录再上传较大的 beta 视频。未登录时只支持 6MB 以内的本地预览。');
        }
        betaVideoUrl = await fileToDataUrl(file);
      }

      const nextRoute = {
        ...activeRoute,
        betaVideoUrl,
      };
      updateRoute({ betaVideoUrl });

      if (activeRoute.isPublic && supabase && user) {
        const { error } = await supabase
          .from(PUBLIC_ROUTES_TABLE)
          .upsert(toPublicRoutePayload(user, activeGym, nextRoute), {
            onConflict: 'user_id,route_id',
          });

        if (error) {
          console.warn('公开视频地址同步失败。', error);
        }
      }

      setAiAnalysis('beta 视频已上传。');
    } catch (error) {
      console.warn('上传 beta 视频失败', error);
      setAiAnalysis(error.message || '视频上传失败，请换一个较小的视频再试。');
    } finally {
      event.target.value = '';
    }
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

  const getAiContext = () => ({
    month: calendarMonth,
    personalGyms: gyms.slice(0, 8).map((gym) => ({
      name: gym.name,
      area: gym.area,
      lastVisit: gym.lastVisit,
      routeCount: gym.routes.length,
      sentCount: gym.routes.filter((route) => route.sentAt).length,
      routes: gym.routes.slice(0, 10).map((route) => ({
        name: route.name,
        grade: route.grade,
        sentAt: route.sentAt || '',
        createdAt: getRouteAddedAt(route, gym),
        notes: route.notes ? route.notes.slice(0, 240) : '',
        hasBetaVideo: Boolean(route.betaVideoUrl),
        isPublic: Boolean(route.isPublic),
      })),
    })),
    publicGymStats: publicGymStats.slice(0, 8).map((gym) => ({
      name: gym.name,
      area: gym.area,
      routeCount: gym.routeCount,
      userCount: gym.userCount,
      gradeSummary: gym.gradeSummary,
    })),
    publicRoutes: squareRoutes.slice(0, 20).map((route) => ({
      gymName: route.gym_name,
      gymArea: route.gym_area,
      routeName: route.route_name,
      grade: route.grade,
      sentAt: route.sent_at || '',
      notes: route.notes ? route.notes.slice(0, 180) : '',
    })),
  });

  const getFallbackAiRecommendation = (need, mode = aiMode) => {
    const candidateGyms = gyms.length ? gyms : publicGymStats;
    const routes = gyms.flatMap((gym) =>
      gym.routes.map((route) => ({
        gymName: gym.name,
        gymArea: gym.area,
        routeName: route.name,
        grade: route.grade,
        sentAt: route.sentAt,
        notes: route.notes,
      })),
    );
    const gymText = candidateGyms
      .slice(0, 3)
      .map((gym) => `「${gym.name}」${gym.area ? `（${gym.area}）` : ''}`)
      .join('、');
    const routeText = routes
      .slice(0, 4)
      .map((route) => `「${route.routeName}」${route.grade} @ ${route.gymName}`)
      .join('、');

    if (mode === 'training') {
      return `根据你的描述：“${need}”\n\n推荐先去 ${gymText || '你最近常去的岩馆'}。今天训练可以分三段：热身 20 分钟，选择 2-3 条低一级线路做脚点和重心练习；主训练 45 分钟，挑一条略有挑战的线路反复拆动作；最后 15 分钟做肩背和髋部放松。\n\n可优先参考：${routeText || '公开广场里本月同城用户分享的线路'}。\n\nAI 后端暂时不可用，这是本地备用训练计划。`;
    }

    return `根据你的描述：“${need}”\n\n可以先围绕 ${gymText || '你最近常去的岩馆'} 做选择。如果你在问线路，优先挑一条略低于极限等级的线路拆 beta；如果你在问装备，先明确脚型、预算、使用场景和可试穿渠道；如果你在问岩馆，优先比较距离、墙型、线路更新频率和同伴情况。\n\n可参考的记录：${routeText || '公开广场里本月同城用户分享的线路'}。\n\nAI 后端暂时不可用，这是本地备用咨询建议。`;
  };

  const handleAiRecommendation = async () => {
    const need = aiNeed.trim();
    const selectedMode = AI_ASSISTANT_MODES.find((mode) => mode.id === aiMode) || AI_ASSISTANT_MODES[0];
    if (!need) {
      setAiRecommendation(
        aiMode === 'training'
          ? '先写下今天的训练目标，比如“想练脚法，强度不要太大，训练 90 分钟”。'
          : '先写下你想问的内容，比如“怎么选第一双攀岩鞋”或“今晚去哪家岩馆练 slab”。',
      );
      return;
    }

    setIsAiLoading(true);
    setAiRecommendation(selectedMode.loading);

    try {
      const response = await fetch('/api/ai-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          need,
          mode: aiMode,
          context: getAiContext(),
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'AI 服务暂时不可用。');
      }

      setAiRecommendation(result.recommendation || getFallbackAiRecommendation(need, aiMode));
    } catch (error) {
      console.warn('AI 推荐失败', error);
      setAiRecommendation(`${error.message}\n\n${getFallbackAiRecommendation(need, aiMode)}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => {
            switchView('personal');
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
          <nav className="top-nav" aria-label="主功能">
            <TopNavButton active={activeView === 'personal'} icon={Dumbbell} onClick={() => switchView('personal')}>
              我的
            </TopNavButton>
            <TopNavButton active={activeView === 'gyms'} icon={Building2} onClick={() => switchView('gyms')}>
              岩馆
            </TopNavButton>
            <TopNavButton active={activeView === 'square'} icon={Users} onClick={() => switchView('square')}>
              广场
            </TopNavButton>
            <TopNavButton active={activeView === 'ai'} icon={Sparkles} onClick={() => switchView('ai')}>
              AI
            </TopNavButton>
          </nav>
          <div className="summary-strip" aria-label="记录统计">
            <span>{gyms.length} 个岩馆</span>
            <span>{totalRoutes} 条线路</span>
            <span>{sentRoutes} 条已过线</span>
            <span>{favoriteRoutes.length} 条喜爱</span>
          </div>
          <UserMenu onOpenAuth={() => setIsAuthModalOpen(true)} />
        </div>
      </header>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {activeView === 'gyms' ? (
        <main className="public-view">
          <section className="intro-band">
            <div>
              <p className="eyebrow">全站公开数据</p>
              <h1>本月岩馆线路</h1>
            </div>
            <div className="month-controls">
              <button className="ghost-btn icon-only" type="button" onClick={() => setCalendarMonth((month) => moveMonth(month, -1))}>
                <ChevronLeft size={17} />
              </button>
              <button className="ghost-btn month-label" type="button">
                {formatMonthLabel(calendarMonth)}
              </button>
              <button className="ghost-btn icon-only" type="button" onClick={() => setCalendarMonth((month) => moveMonth(month, 1))}>
                <ChevronRight size={17} />
              </button>
            </div>
          </section>
          <PublicDataStatus status={publicDataStatus} />

          <label className="gym-search" aria-label="搜索岩馆">
            <Search size={17} />
            <input
              type="search"
              value={gymSearchQuery}
              placeholder="搜索岩馆名称或区域"
              onChange={(event) => setGymSearchQuery(event.target.value)}
            />
          </label>

          <section className="public-grid">
            <div className="public-list" aria-label="公开岩馆列表">
              {filteredPublicGymStats.length ? (
                filteredPublicGymStats.map((gym) => (
                  <button
                    className={`public-gym-row ${gym.id === activePublicGymId ? 'active' : ''}`}
                    key={gym.id}
                    type="button"
                    onClick={() => selectPublicGym(gym.id)}
                  >
                    <span>
                      <strong>{gym.name}</strong>
                      <small>{gym.area} · {gym.routeCount} 条本月公开线路 · {gym.userCount} 位用户</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <strong>{gymSearchQuery.trim() ? '没有找到岩馆' : '还没有公开岩馆'}</strong>
                  <span>{gymSearchQuery.trim() ? '换个关键词试试。' : '用户创建过的岩馆会出现在这里，线路仍需同意公开后才显示。'}</span>
                </div>
              )}
            </div>

            <div className="public-detail">
              {activePublicGym ? (
                <>
                  <div className="section-title">
                    <p className="eyebrow">{activePublicGym.area}</p>
                    <h2>{activePublicGym.name}</h2>
                  </div>
                  {activePublicGym.gradeSummary.length ? (
                    <div className="grade-grid public-grade-grid">
                      {activePublicGym.gradeSummary.map(([grade, count]) => (
                        <button
                          className={`grade-tile grade-filter ${activePublicGrade === grade ? 'active' : ''}`}
                          key={grade}
                          type="button"
                          onClick={() => selectPublicGrade(grade)}
                        >
                          <strong>{grade}</strong>
                          <span>{count} 条</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">这个岩馆已在目录中，但本月还没有用户公开线路。</p>
                  )}
                  {activePublicGrade ? (
                    <p className="route-filter-note">
                      正在查看 {activePublicGrade} · {activePublicRouteGroups.length} 条线路
                    </p>
                  ) : null}
                  {activePublicRouteGroups.length ? (
                    <div className="public-route-list">
                      {activePublicRouteGroups.map((group) => {
                        const route = group.representative;
                        const hasOwnRoute = group.routes.some((groupRoute) => isOwnPublicContent(groupRoute, user));
                        return (
                          <button
                            className={`public-route-item ${group.id === activePublicRouteGroupId ? 'active' : ''}`}
                            key={group.id}
                            type="button"
                            onClick={() => setActivePublicRouteGroupId(group.id)}
                          >
                            <img src={route.route_image_url} alt={`${route.route_name} 线路照片`} />
                            <span>
                              <strong className="route-title-line">
                                {route.route_name}
                                {hasOwnRoute ? <OwnBadge>含我的</OwnBadge> : null}
                              </strong>
                              <small>
                                {route.grade} · {group.routeCount} 次分享 · {group.userCount} 位用户 · {route.sent_at || '未记录完攀日期'}
                              </small>
                            </span>
                            <MessageCircle size={18} />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {activePublicRouteGroup ? (
                    <section className="public-route-detail-panel" aria-label="公开线路详情">
                      <div className="route-detail-heading">
                        <div>
                          <p className="eyebrow">线路详情</p>
                          <h2>{activePublicRouteGroup.representative.route_name}</h2>
                        </div>
                      </div>
                      <img
                        className="public-route-detail-image"
                        src={activePublicRouteGroup.representative.route_image_url}
                        alt={`${activePublicRouteGroup.representative.route_name} 代表线路照片`}
                      />
                      <div className="beta-video-list">
                        {activePublicRouteSections.map((section) => (
                          <section className="beta-video-section" key={section.title} aria-label={section.title}>
                            <h3>{section.title}</h3>
                            {section.routes.map((route) => (
                              <article className={`beta-video-item ${isOwnPublicContent(route, user) ? 'own-content' : ''}`} key={route.id}>
                                <div>
                                  <strong className="author-line">
                                    {getVisibleUserLabel(route.user_label)}
                                    {isOwnPublicContent(route, user) ? <OwnBadge>我的记录</OwnBadge> : null}
                                  </strong>
                                  <small>{route.grade} · {route.sent_at || '未记录完攀日期'}</small>
                                </div>
                                {route.beta_video_url ? (
                                  <video src={route.beta_video_url} controls />
                                ) : (
                                  <p className="empty-copy">这个用户还没有公开视频。</p>
                                )}
                                <button className="ghost-btn compact" type="button" onClick={() => openPublicRouteDiscussion(route.id)}>
                                  <MessageCircle size={17} />
                                  讨论这条记录
                                </button>
                              </article>
                            ))}
                          </section>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <strong>选择一个岩馆</strong>
                  <span>查看这个月公开分享的线路、难度分布和完攀记录。</span>
                </div>
              )}
            </div>
          </section>
        </main>
      ) : null}

      {activeView === 'routeDiscussion' ? (
        <main className="route-discussion-view">
          <section className="view-header">
            <button className="ghost-btn" type="button" onClick={closePublicRouteDiscussion}>
              <ArrowLeft size={18} />
              岩馆线路
            </button>
            <div>
              <p className="eyebrow">{activeDiscussionRoute?.gym_name || '线路讨论'}</p>
              <h1>{activeDiscussionRoute?.route_name || '讨论记录'}</h1>
            </div>
          </section>

          {activeDiscussionRoute ? (
            <section className="route-discussion-layout" aria-label="线路记录讨论页">
              <div className="route-discussion-media-panel">
                <div className="section-title">
                  <p className="eyebrow">{activeDiscussionRoute.grade || '未定级'}</p>
                  <h2>{activeDiscussionRoute.route_name}</h2>
                </div>
                <img
                  className="public-route-detail-image"
                  src={activeDiscussionRoute.route_image_url}
                  alt={`${activeDiscussionRoute.route_name} 线路照片`}
                />
                <article className="beta-video-item">
                  <div>
                    <strong className="author-line">
                      {getVisibleUserLabel(activeDiscussionRoute.user_label)}
                      {isOwnPublicContent(activeDiscussionRoute, user) ? <OwnBadge>我的记录</OwnBadge> : null}
                    </strong>
                    <small>
                      {activeDiscussionRoute.grade} · {activeDiscussionRoute.sent_at || '未记录完攀日期'}
                    </small>
                  </div>
                  {activeDiscussionRoute.beta_video_url ? (
                    <video src={activeDiscussionRoute.beta_video_url} controls />
                  ) : (
                    <p className="empty-copy">这个用户还没有公开视频。</p>
                  )}
                  {activeDiscussionRoute.discussion_prompt || activeDiscussionRoute.notes ? (
                    <p className="post-copy">{activeDiscussionRoute.discussion_prompt || activeDiscussionRoute.notes}</p>
                  ) : null}
                </article>
              </div>

              <aside className="discussion-panel route-discussion-comments">
                <div className="section-title">
                  <p className="eyebrow">讨论</p>
                  <h2>{activeDiscussionRoute.route_name}</h2>
                </div>
                <div className="comment-list">
                  {publicComments.length ? (
                    publicComments.map((comment) => (
                      <div className={`comment ${isOwnPublicContent(comment, user) ? 'own-content' : ''}`} key={comment.id}>
                        <strong className="author-line">
                          {getVisibleUserLabel(comment.user_label)}
                          {isOwnPublicContent(comment, user) ? <OwnBadge /> : null}
                        </strong>
                        <p>{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="empty-copy">还没有讨论，问一个 beta 或训练建议吧。</p>
                  )}
                </div>
                <div className="comment-compose">
                  <textarea
                    value={commentDraft}
                    placeholder="写下你的观察或问题..."
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <button className="primary-btn compact" type="button" onClick={handleSubmitComment}>
                    <Send size={17} />
                    发送
                  </button>
                </div>
              </aside>
            </section>
          ) : (
            <div className="empty-state">
              <strong>没有找到这条记录</strong>
              <span>回到岩馆页重新选择一条公开线路记录。</span>
            </div>
          )}
        </main>
      ) : null}

      {activeView === 'square' ? (
        <main className="public-view">
          <section className="intro-band">
            <div>
              <p className="eyebrow">公开广场</p>
              <h1>自由发帖</h1>
            </div>
          </section>

          <section className="square-layout">
            <div className="square-feed" aria-label="公开广场帖子">
              <section className="square-compose" aria-label="发布广场帖子">
                <div className="section-title">
                  <p className="eyebrow">发帖</p>
                  <h2>聊点攀岩以外的攀岩事</h2>
                </div>
                <div className="compose-row">
                  {['闲聊', '装备', '岩馆'].map((category) => (
                    <button
                      className={`category-chip ${squarePostDraft.category === category ? 'active' : ''}`}
                      key={category}
                      type="button"
                      onClick={() => setSquarePostDraft((draft) => ({ ...draft, category }))}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <input
                  className="compose-title"
                  type="text"
                  value={squarePostDraft.title}
                  placeholder="标题，比如：新手第一双鞋怎么选？"
                  onChange={(event) => setSquarePostDraft((draft) => ({ ...draft, title: event.target.value }))}
                />
                <textarea
                  value={squarePostDraft.content}
                  placeholder="写装备体验、岩馆感受，或者任何想聊的攀岩话题。"
                  onChange={(event) => setSquarePostDraft((draft) => ({ ...draft, content: event.target.value }))}
                />
                <button className="primary-btn compact" type="button" onClick={handleCreateSquarePost}>
                  <Send size={17} />
                  发布
                </button>
              </section>

              {sortedSquarePosts.length ? (
                sortedSquarePosts.map((post) => (
                  <article
                    className={`square-post text-post ${post.id === activeSquarePostId ? 'active' : ''}`}
                    key={post.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveSquarePostId(post.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveSquarePostId(post.id);
                      }
                    }}
                  >
                    <div className="square-post-body">
                      <div>
                        <p className="eyebrow">{post.category || '闲聊'}</p>
                        <h2>{post.title}</h2>
                      </div>
                      <p className="post-meta">
                        <span className="author-line inline">
                          {getVisibleUserLabel(post.user_label)}
                          {isOwnPublicContent(post, user) ? <OwnBadge /> : null}
                        </span>
                        · {(post.created_at || '').slice(0, 10) || '刚刚'}
                      </p>
                      <p className="post-copy">{post.content}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <strong>广场还没有帖子</strong>
                  <span>可以先发一个装备、岩馆或日常话题。</span>
                </div>
              )}
            </div>

            <aside className="discussion-panel">
              {activeSquarePost ? (
                <>
                  <div className="section-title">
                    <p className="eyebrow">{activeSquarePost.category || '闲聊'}</p>
                    <h2>{activeSquarePost.title}</h2>
                  </div>
                  <p className="post-meta">
                    <span className="author-line inline">
                      {getVisibleUserLabel(activeSquarePost.user_label)}
                      {isOwnPublicContent(activeSquarePost, user) ? <OwnBadge /> : null}
                    </span>
                    · {(activeSquarePost.created_at || '').slice(0, 10) || '刚刚'}
                  </p>
                  <p className="post-copy detail-copy">{activeSquarePost.content}</p>
                  <div className="section-title compact-title">
                    <p className="eyebrow">评论</p>
                    <h2>继续聊</h2>
                  </div>
                  <div className="comment-list">
                    {squareComments.length ? (
                      squareComments.map((comment) => (
                        <div className={`comment ${isOwnPublicContent(comment, user) ? 'own-content' : ''}`} key={comment.id}>
                          <strong className="author-line">
                            {getVisibleUserLabel(comment.user_label)}
                            {isOwnPublicContent(comment, user) ? <OwnBadge /> : null}
                          </strong>
                          <p>{comment.content}</p>
                        </div>
                      ))
                    ) : (
                      <p className="empty-copy">还没有评论，接一句也行。</p>
                    )}
                  </div>
                  <div className="comment-compose">
                    <textarea
                      value={squareCommentDraft}
                      placeholder="写下你的回复..."
                      onChange={(event) => setSquareCommentDraft(event.target.value)}
                    />
                    <button className="primary-btn compact" type="button" onClick={handleSubmitSquareComment}>
                      <Send size={17} />
                      发送
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <strong>选择一个帖子</strong>
                  <span>装备、岩馆和日常话题都可以在这里聊。</span>
                </div>
              )}
            </aside>
          </section>
        </main>
      ) : null}

      {activeView === 'ai' ? (
        <main className="ai-view">
          <section className="ai-workspace">
            <div className="ai-hero">
              <div className="ai-hero-copy">
                <p className="eyebrow">AI 攀岩助手</p>
                <h1>今天聊点攀岩的。</h1>
                <p>
                  可以问线路 beta、装备选择、岩馆安排，也可以单独生成一次训练计划。
                </p>
              </div>
              <img src={aiHoldsMascot} alt="BetaClimb AI 岩点形象" />
            </div>

            <div className="ai-mode-grid" role="tablist" aria-label="AI 助手类型">
              {AI_ASSISTANT_MODES.map((mode) => {
                const Icon = mode.icon;

                return (
                  <button
                    className={`ai-mode-card ${aiMode === mode.id ? 'active' : ''}`}
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={aiMode === mode.id}
                    onClick={() => {
                      setAiMode(mode.id);
                      setAiRecommendation('');
                    }}
                  >
                    <span className="ai-mode-icon">
                      <Icon size={18} />
                    </span>
                    <strong>{mode.title}</strong>
                    <small>{mode.description}</small>
                  </button>
                );
              })}
            </div>

            <div className="ai-console">
              <div className="ai-prompt-panel">
                <label className="field">
                  <span>
                    <Target size={16} />
                    你的需求
                  </span>
                  <textarea
                    value={aiNeed}
                    placeholder={(AI_ASSISTANT_MODES.find((mode) => mode.id === aiMode) || AI_ASSISTANT_MODES[0]).placeholder}
                    onChange={(event) => setAiNeed(event.target.value)}
                  />
                </label>
                <div className="ai-chip-row" aria-label="可以咨询的主题">
                  <span>
                    <MessageCircle size={14} />
                    线路 beta
                  </span>
                  <span>
                    <Package size={14} />
                    装备
                  </span>
                  <span>
                    <Building2 size={14} />
                    岩馆
                  </span>
                  <span>
                    <Dumbbell size={14} />
                    训练
                  </span>
                </div>
                <button className="ai-btn ai-submit" type="button" onClick={handleAiRecommendation} disabled={isAiLoading}>
                  <Sparkles size={18} />
                  {isAiLoading
                    ? (AI_ASSISTANT_MODES.find((mode) => mode.id === aiMode) || AI_ASSISTANT_MODES[0]).loading
                    : (AI_ASSISTANT_MODES.find((mode) => mode.id === aiMode) || AI_ASSISTANT_MODES[0]).action}
                </button>
              </div>
              <div className="ai-result-panel" aria-live="polite">
                {aiRecommendation ? (
                  <pre className="ai-result">{aiRecommendation}</pre>
                ) : (
                  <div className="ai-empty-state">
                    <Bot size={22} />
                    <strong>把问题丢过来</strong>
                    <p>我会结合你的本地记录和公开线路数据给出回答。</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : null}

      {activeView === 'personal' && !activeGym && isFavoritesOpen ? (
        <main className="home-view">
          <section className="view-header">
            <button className="ghost-btn" type="button" onClick={() => setIsFavoritesOpen(false)}>
              <ArrowLeft size={18} />
              我的
            </button>
            <div>
              <p className="eyebrow">收藏线路</p>
              <h1>喜爱列表</h1>
            </div>
            <span className="favorite-total">
              <Star size={17} />
              {favoriteRoutes.length} 条
            </span>
          </section>

          {favoriteRoutes.length ? (
            <section className="favorite-route-grid" aria-label="用户喜爱的线路">
              {favoriteRoutes.map((route) => (
                <button
                  className="route-card favorite-route-card"
                  key={`${route.gymId}-${route.routeId}`}
                  type="button"
                  onClick={() => openFavoriteRoute(route)}
                >
                  <img src={route.imageUrl} alt={`${route.routeName} 线路照片`} />
                  <span className="route-card-meta">
                    <strong>{route.routeName}</strong>
                    <small>
                      {route.grade} · {route.gymName} · {route.sentAt ? `过线于 ${route.sentAt}` : `添加于 ${route.addedAt}`}
                    </small>
                  </span>
                  <span className="favorite-badge" aria-label="已收藏">
                    <Star size={15} />
                  </span>
                </button>
              ))}
            </section>
          ) : (
            <div className="empty-state">
              <strong>还没有喜爱的线路</strong>
              <span>进入线路详情，点亮星标后会出现在这里。</span>
            </div>
          )}
        </main>
      ) : null}

      {activeView === 'personal' && !activeGym && !isFavoritesOpen ? (
        <main className="home-view">
          <section className="intro-band">
            <div>
              <p className="eyebrow">我的攀岩地图</p>
              <h1>攀岩日历</h1>
            </div>
            <div className="header-actions">
              <button className="ghost-btn compact" type="button" onClick={() => setIsFavoritesOpen(true)}>
                <Star size={18} />
                喜爱列表
              </button>
              <button className="primary-btn" type="button" onClick={handleCreateGym}>
                <Plus size={18} />
                新建岩馆
              </button>
            </div>
          </section>

          <section className="dashboard-grid" aria-label="攀岩概况和日历">
            <div className="home-sidebar">
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

              <div className="monthly-stats" aria-label={`${formatMonthLabel(calendarMonth)} 月度统计`}>
                <div className="monthly-stat-header">
                  <span>
                    <Dumbbell size={16} />
                    本月统计
                  </span>
                  <small>{formatMonthLabel(calendarMonth)}</small>
                </div>
                <div className="monthly-stat-grid">
                  <div className="monthly-stat-tile">
                    <strong>{monthlyPersonalStats.gymCount}</strong>
                    <span>家岩馆</span>
                  </div>
                  <div className="monthly-stat-tile">
                    <strong>{monthlyPersonalStats.visitCount}</strong>
                    <span>次到访</span>
                  </div>
                  <div className="monthly-stat-tile">
                    <strong>{monthlyPersonalStats.sentCount}</strong>
                    <span>条过线</span>
                  </div>
                  <div className="monthly-stat-tile">
                    <strong>{monthlyPersonalStats.unsentCount}</strong>
                    <span>待挑战</span>
                  </div>
                </div>

                {monthlyPersonalStats.gymStats.length ? (
                  <div className="monthly-gym-list">
                    {monthlyPersonalStats.gymStats.map((gym) => (
                      <div className="monthly-gym-row" key={gym.gymId}>
                        <span>
                          <b>{gym.gymName}</b>
                          <small>{gym.gymArea}</small>
                        </span>
                        <em>{gym.visitCount} 次 · {gym.sentCount} 条</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">这个月还没有过线记录，也没有待挑战线路。</p>
                )}
              </div>

              <div className="challenge-panel" aria-label="还没有过的线路">
                <div className="monthly-stat-header">
                  <span>
                    <Target size={16} />
                    未过线挑战
                  </span>
                  <small>{monthlyPersonalStats.unsentRoutes.length} 条</small>
                </div>
                {monthlyPersonalStats.unsentRoutes.length ? (
                  <div className="challenge-route-list">
                    {monthlyPersonalStats.unsentRoutes.map((route) => (
                      <button
                        className="challenge-route"
                        key={`${route.gymId}-${route.routeId}`}
                        type="button"
                        onClick={() => openChallengeRoute(route)}
                      >
                        <span>
                          <b>{route.routeName}</b>
                          <small>{route.gymName} · {route.gymArea}</small>
                        </span>
                        <em>{route.grade}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">所有记录里的线路都已经过了，漂亮。可以去添加新的挑战。</p>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : null}

      {activeView === 'personal' && activeGym && !activeRoute ? (
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

          <section className="gym-route-sections" aria-label="线路照片">
            <div className="gym-route-section">
              <div className="route-section-header">
                <div>
                  <p className="eyebrow">待挑战</p>
                  <h2>未过线</h2>
                </div>
                <span>{activeGymRouteGroups.unsent.reduce((sum, group) => sum + group.routes.length, 0)} 条</span>
              </div>
              {activeGymRouteGroups.unsent.length ? (
                activeGymRouteGroups.unsent.map((group) => (
                  <div className="route-month-group" key={`unsent-${group.monthKey}`}>
                    <div className="route-month-header">
                      <strong>{formatMonthLabel(group.monthKey)}</strong>
                      <small>按添加日期</small>
                    </div>
                    <div className="route-grid">
                      {group.routes.map((route) => (
                        <button className="route-card" key={route.id} type="button" onClick={() => selectRoute(route.id)}>
                          <img src={route.imageUrl} alt={`${route.name} 线路照片`} />
                          <span className="route-card-meta">
                            <strong>{route.name}</strong>
                            <small>{route.grade} · 添加于 {getRouteAddedAt(route, activeGym)}</small>
                          </span>
                          {route.isFavorite ? (
                            <span className="favorite-badge" aria-label="已收藏">
                              <Star size={15} />
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-copy">这个岩馆没有未过线线路。</p>
              )}
            </div>

            <div className="gym-route-section">
              <div className="route-section-header">
                <div>
                  <p className="eyebrow">完成记录</p>
                  <h2>已过线</h2>
                </div>
                <span>{activeGymRouteGroups.sent.reduce((sum, group) => sum + group.routes.length, 0)} 条</span>
              </div>
              {activeGymRouteGroups.sent.length ? (
                activeGymRouteGroups.sent.map((group) => (
                  <div className="route-month-group" key={`sent-${group.monthKey}`}>
                    <div className="route-month-header">
                      <strong>{formatMonthLabel(group.monthKey)}</strong>
                      <small>按过线日期</small>
                    </div>
                    <div className="route-grid">
                      {group.routes.map((route) => (
                        <button className="route-card" key={route.id} type="button" onClick={() => selectRoute(route.id)}>
                          <img src={route.imageUrl} alt={`${route.name} 线路照片`} />
                          <span className="route-card-meta">
                            <strong>{route.name}</strong>
                            <small>{route.grade} · {route.sentAt}</small>
                          </span>
                          {route.isFavorite ? (
                            <span className="favorite-badge" aria-label="已收藏">
                              <Star size={15} />
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-copy">这个岩馆还没有已过线记录。</p>
              )}
            </div>
          </section>
        </main>
      ) : null}

      {activeView === 'personal' && activeGym && activeRoute ? (
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
            <div className="header-actions">
              <button
                className={`ghost-btn compact favorite-toggle ${activeRoute.isFavorite ? 'active' : ''}`}
                type="button"
                onClick={toggleFavoriteRoute}
              >
                <Star size={18} />
                {activeRoute.isFavorite ? '已喜爱' : '标为喜爱'}
              </button>
              <button className="primary-btn compact" type="button" onClick={() => setIsEditing((value) => !value)}>
                {isEditing ? <Save size={18} /> : <Pencil size={18} />}
                {isEditing ? '完成' : '编辑'}
              </button>
            </div>
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

              <div className="share-box">
                <div>
                  <span>
                    {activeRoute.isPublic ? <CheckCircle2 size={16} /> : <EyeOff size={16} />}
                    岩馆公开
                  </span>
                  <p>
                    {activeRoute.isPublic
                      ? '这条线路会出现在全站岩馆统计和对应岩馆讨论里。'
                      : '默认仅自己可见。打开后才会公开线路、照片、视频和备注。'}
                  </p>
                </div>
                <button
                  className={activeRoute.isPublic ? 'ghost-btn compact' : 'primary-btn compact'}
                  type="button"
                  onClick={() => publishActiveRoute(!activeRoute.isPublic)}
                >
                  <Share2 size={17} />
                  {activeRoute.isPublic ? '取消公开' : '同意公开'}
                </button>
              </div>

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
