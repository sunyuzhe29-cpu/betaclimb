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
  ShoppingBag,
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
import aiHoldCrimp from './assets/ai-hold-crimp.png';
import aiHoldJug from './assets/ai-hold-jug.png';
import aiHoldPinch from './assets/ai-hold-pinch.png';
import aiHoldSloper from './assets/ai-hold-sloper.png';
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
const LOCAL_AI_HISTORY_KEY = 'betaclimb:ai-history';
const LOCAL_TRAINING_PLANS_KEY = 'betaclimb:training-plans';
const MAX_AI_HISTORY_ITEMS = 24;
const ROUTE_STYLE_OPTIONS = ['平衡线', '力量线', '技术线', '指力线'];
const CUSTOM_ROUTE_STYLE_VALUE = '__custom__';

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

const readStoredAiHistory = () => {
  try {
    const storedValue = window.localStorage.getItem(LOCAL_AI_HISTORY_KEY);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? normalizeAiHistory(parsedValue) : [];
  } catch {
    return [];
  }
};

const normalizeAiHistory = (entries) =>
  entries
    .filter(Boolean)
    .map((entry) => {
      if (Array.isArray(entry.messages)) {
        return {
          ...entry,
          messages: entry.messages.filter((message) => message?.role && message?.content),
          updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
        };
      }

      const createdAt = entry.createdAt || new Date().toISOString();
      return {
        id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: entry.mode || 'consult',
        title: String(entry.need || 'AI 对话').slice(0, 32),
        createdAt,
        updatedAt: createdAt,
        messages: [
          {
            id: `${entry.id || createdAt}-user`,
            role: 'user',
            content: entry.need || '',
            createdAt,
          },
          {
            id: `${entry.id || createdAt}-assistant`,
            role: 'assistant',
            content: entry.recommendation || '',
            createdAt,
          },
        ].filter((message) => message.content),
      };
    })
    .filter((entry) => entry.messages.length);

const writeStoredAiHistory = (entries) => {
  try {
    window.localStorage.setItem(LOCAL_AI_HISTORY_KEY, JSON.stringify(normalizeAiHistory(entries)));
  } catch (error) {
    console.warn('AI 历史本地缓存失败。', error);
  }
};

const readStoredTrainingPlans = () => {
  try {
    const storedValue = window.localStorage.getItem(LOCAL_TRAINING_PLANS_KEY);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const writeStoredTrainingPlans = (plans) => {
  try {
    window.localStorage.setItem(LOCAL_TRAINING_PLANS_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn('长期训练计划本地缓存失败。', error);
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

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const parseLocalDate = (dateKey) => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const TRAINING_WEEKDAYS = [
  { value: 0, label: '周日' },
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
];

const DEFAULT_TRAINING_SESSIONS = [
  { weekday: 2, focus: '技术和脚法', intensity: 6, durationMinutes: 90 },
  { weekday: 4, focus: '力量耐力', intensity: 7, durationMinutes: 100 },
  { weekday: 6, focus: '项目尝试', intensity: 8, durationMinutes: 120 },
];

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const inferLongTermPlanDraft = (need, context = {}) => {
  const normalizedNeed = String(need || '');
  const frequencyMatch = normalizedNeed.match(/每周(?:去|爬)?\s*(\d+)\s*次|一周(?:去|爬)?\s*(\d+)\s*次|周(?:去|爬)?\s*(\d+)\s*次/);
  const weeksMatch = normalizedNeed.match(/(\d+)\s*(周|星期|week)/i);
  const minutesMatch = normalizedNeed.match(/(\d+)\s*(分钟|分|min)/i);
  const intensityMatch = normalizedNeed.match(/强度\s*(\d+)|(\d+)\s*\/\s*10/);
  const routeCount = Array.isArray(context.recentRoutes) ? context.recentRoutes.length : 0;
  const weeklyFrequency = clampNumber(
    frequencyMatch?.[1] || frequencyMatch?.[2] || frequencyMatch?.[3] || (routeCount >= 6 ? 3 : 2),
    1,
    5,
    2,
  );
  const durationWeeks = clampNumber(weeksMatch?.[1] || 6, 2, 16, 6);
  const durationMinutes = clampNumber(minutesMatch?.[1] || 90, 45, 150, 90);
  const intensity = clampNumber(intensityMatch?.[1] || intensityMatch?.[2] || 7, 3, 9, 7);
  const startDate = formatLocalDate(new Date());

  return {
    id: `draft-${Date.now()}`,
    title: normalizedNeed ? `长期计划：${normalizedNeed.slice(0, 18)}` : '长期攀岩训练计划',
    startDate,
    durationWeeks,
    weeklyFrequency,
    reminder: '训练当天 10:00 提醒打卡',
    status: 'draft',
    sessions: DEFAULT_TRAINING_SESSIONS.slice(0, weeklyFrequency).map((session, index) => ({
      ...session,
      durationMinutes,
      intensity: clampNumber(intensity + index - 1, 3, 9, intensity),
    })),
  };
};

const expandTrainingPlanEntries = (plans) =>
  plans
    .filter((plan) => plan.status === 'accepted')
    .flatMap((plan) => {
      const startDate = parseLocalDate(plan.startDate);
      const endDate = addDays(startDate, clampNumber(plan.durationWeeks, 1, 52, 6) * 7 - 1);
      const entries = [];

      for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
        const dateKey = formatLocalDate(date);
        (plan.sessions || [])
          .filter((session) => Number(session.weekday) === date.getDay())
          .forEach((session, index) => {
            entries.push({
              id: `${plan.id}:${dateKey}:${index}`,
              planId: plan.id,
              date: dateKey,
              title: plan.title,
              focus: session.focus || '攀岩训练',
              intensity: session.intensity,
              durationMinutes: session.durationMinutes,
              reminder: plan.reminder,
              checked: Boolean(plan.checkIns?.[dateKey]),
            });
          });
      }

      return entries;
    });

const buildCalendarDays = (monthKey, entries, plannedEntries = []) => {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const visitsByDate = entries.reduce((acc, entry) => {
    acc[entry.sentAt] = [...(acc[entry.sentAt] || []), entry];
    return acc;
  }, {});
  const plansByDate = plannedEntries.reduce((acc, entry) => {
    acc[entry.date] = [...(acc[entry.date] || []), entry];
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
        plans: plansByDate[date] || [],
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

const getRouteStyleLabel = (route) => String(route.style || route.routeStyle || '').trim();

const getRouteStyleSelectValue = (route) => {
  const style = getRouteStyleLabel(route);
  if (!style) return '';
  return ROUTE_STYLE_OPTIONS.includes(style) ? style : CUSTOM_ROUTE_STYLE_VALUE;
};

const getRouteStyleTags = (route) => {
  const selectedStyle = getRouteStyleLabel(route);
  if (selectedStyle) return [selectedStyle];

  const text = `${route.name || ''} ${route.notes || ''}`.toLowerCase();
  const tagRules = [
    ['平衡线', /slab|平衡|重心|脚法|脚点|balance|footwork/],
    ['力量线', /overhang|roof|仰角|大仰|屋檐|陡墙|力量|锁定|引体|爆发|power/],
    ['技术线', /dyno|动态|跳|协调|coordination|技术|technical|耐力|泵|pump|连续/],
    ['指力线', /crimp|小点|小手点|抠点|指力|finger|pinch|捏点|sloper|圆包|摩擦/],
  ];
  const tags = tagRules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  return tags.length ? tags : ['未标注'];
};

const buildRecentRouteRecommendationContext = (gyms, days = 30) => {
  const endDate = new Date();
  const startDate = addDays(endDate, -days + 1);
  const startKey = formatLocalDate(startDate);
  const endKey = formatLocalDate(endDate);
  const routes = [];
  const byGrade = {};
  const byStyle = {};

  gyms.forEach((gym) => {
    gym.routes.forEach((route) => {
      const addedAt = getRouteAddedAt(route, gym);
      const activityDate = route.sentAt || addedAt;
      if (activityDate < startKey || activityDate > endKey) return;

      const grade = route.grade?.trim().toUpperCase() || '未定级';
      const status = route.sentAt ? 'sent' : 'project';
      const styleTags = getRouteStyleTags(route);
      const routeSummary = {
        gymName: gym.name,
        gymArea: gym.area,
        routeName: route.name,
        grade,
        status,
        activityDate,
        sentAt: route.sentAt || '',
        addedAt,
        notes: route.notes ? route.notes.slice(0, 180) : '',
        style: getRouteStyleLabel(route),
        styleTags,
      };

      routes.push(routeSummary);
      byGrade[grade] = byGrade[grade] || { grade, sent: 0, project: 0, total: 0 };
      byGrade[grade][status === 'sent' ? 'sent' : 'project'] += 1;
      byGrade[grade].total += 1;

      styleTags.forEach((style) => {
        byStyle[style] = byStyle[style] || { style, sent: 0, project: 0, total: 0 };
        byStyle[style][status === 'sent' ? 'sent' : 'project'] += 1;
        byStyle[style].total += 1;
      });
    });
  });

  const sentCount = routes.filter((route) => route.status === 'sent').length;
  const projectCount = routes.length - sentCount;

  return {
    days,
    startDate: startKey,
    endDate: endKey,
    routeCount: routes.length,
    sentCount,
    projectCount,
    successRate: routes.length ? Math.round((sentCount / routes.length) * 100) : 0,
    byGrade: Object.values(byGrade).sort((gradeA, gradeB) => gradeA.grade.localeCompare(gradeB.grade, 'zh-CN')),
    byStyle: Object.values(byStyle)
      .map((style) => ({
        ...style,
        successRate: style.total ? Math.round((style.sent / style.total) * 100) : 0,
      }))
      .sort((styleA, styleB) => styleB.total - styleA.total || styleA.style.localeCompare(styleB.style, 'zh-CN'))
      .slice(0, 8),
    recentProjects: routes
      .filter((route) => route.status === 'project')
      .sort((routeA, routeB) => routeB.activityDate.localeCompare(routeA.activityDate))
      .slice(0, 12),
    recentSends: routes
      .filter((route) => route.status === 'sent')
      .sort((routeA, routeB) => routeB.activityDate.localeCompare(routeA.activityDate))
      .slice(0, 12),
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
    <button className={`bottom-nav-btn ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <Icon size={17} />
      <span>{children}</span>
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

const formatAiHistoryTime = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '刚刚';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

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
    description: '生成可调整的长期安排和单次训练细节',
    icon: ClipboardList,
    placeholder: '例如：未来 6 周想一周去 3 次岩馆，提高 V4-V5 完攀率，每次 90 分钟，强度 6-8/10。',
    action: '生成长期计划',
    loading: '正在生成计划...',
  },
  {
    id: 'route_history',
    title: '路线推荐',
    description: '汇总最近一个月线路记录，给出推荐和短板',
    icon: Target,
    placeholder: '可选：例如今天想轻松一点、想练脚法、想冲 V5。留空也可以直接生成总结。',
    action: '生成路线推荐',
    loading: '正在统计最近记录...',
  },
];

const AI_HOLD_MASCOTS = [
  {
    image: aiHoldPinch,
    name: 'Pinch',
    description: '细腰捏点',
  },
  {
    image: aiHoldCrimp,
    name: 'Crimp',
    description: '小手点',
  },
  {
    image: aiHoldSloper,
    name: 'Sloper',
    description: '圆包点',
  },
  {
    image: aiHoldJug,
    name: 'Jug',
    description: '大把手',
  },
];

const PRODUCT_CATALOG = [
  {
    id: 'la-sportiva-tarantulace',
    name: 'La Sportiva Tarantulace',
    category: '攀岩鞋',
    brand: 'La Sportiva',
    price: '约 $99',
    match: '新手第一双鞋、馆内抱石和顶绳',
    fit: '中性鞋楦，绑带适合微调脚背和脚宽',
    tags: ['入门', '舒适', '绑带'],
    source: 'La Sportiva / REI 公开商品资料',
    sourceUrl: 'https://www.lasportiva.com/en/shoes-climbing-tarantulace-man-zfcs134',
    imageUrl:
      'https://www.lasportiva.com/media/catalog/product/Z/F/ZFCS134_G00E29_ZFCS134.jpg?bg-color=255%2C255%2C255&canvas=700%3A700&fit=bounds&height=700&quality=80&width=700',
    colors: ['#facc15', '#1f2937'],
    summary: '经典入门鞋，重点是舒适和可调整性，适合作为第一双馆内训练鞋。',
  },
  {
    id: 'scarpa-instinct-vsr',
    name: 'SCARPA Instinct VSR',
    category: '攀岩鞋',
    brand: 'SCARPA',
    price: '约 $219',
    match: '进阶抱石、微小脚点、陡墙发力',
    fit: '偏性能取向，包裹强，适合有一定经验后试穿',
    tags: ['进阶', '抱石', '敏感'],
    source: 'SCARPA 官方商品资料',
    sourceUrl: 'https://us.scarpa.com/instinct-vsr',
    imageUrl: 'https://us.scarpa.com/cdn/shop/files/70015_000_1_ins_vsr_blk_azu_instinct_vsr_black_azure_1.jpg?v=1732097117&width=900',
    colors: ['#2563eb', '#f97316'],
    summary: '进阶性能鞋，更适合已经知道自己脚型和尺码偏好的用户。',
  },
  {
    id: 'black-diamond-momentum',
    name: 'Black Diamond Momentum',
    category: '攀岩鞋',
    brand: 'Black Diamond',
    price: '约 $100',
    match: '长时间训练、热身线路、脚感舒适优先',
    fit: '平直鞋型，针织鞋面透气，适合不想太挤脚的训练日',
    tags: ['舒适', '训练', '平直'],
    source: 'Black Diamond 官方商品资料',
    sourceUrl: 'https://www.blackdiamondequipment.com/en_US/product/momentum-climbing-shoes-mens/',
    imageUrl: 'https://blackdiamondequipment.com/cdn/shop/files/570101_9118_M_MOMENTUM_CLIMB_SHOES_BLACK_ANTHRACITE_01.jpg?v=1742402670&width=900',
    colors: ['#0f766e', '#111827'],
    summary: '舒适型训练鞋，适合高频去岩馆、希望降低脚部压力的用户。',
  },
  {
    id: 'black-diamond-white-gold',
    name: 'Black Diamond White Gold',
    category: '镁粉',
    brand: 'Black Diamond',
    price: '约 $8-$15',
    match: '日常馆内训练、手汗控制、补充消耗品',
    fit: '散装镁粉，适合已有粉袋或粉桶的用户',
    tags: ['镁粉', '消耗品', '训练'],
    source: 'Black Diamond 官方商品资料',
    sourceUrl: 'https://blackdiamondequipment.com/products/white-gold-loose-chalk-300-g',
    imageUrl: 'https://blackdiamondequipment.com/cdn/shop/files/550495_0000_300G_WHITE_GOLD_LOOSE_CHALK_NO_COLOR_01.jpg?v=1742402292&width=900',
    colors: ['#e5e7eb', '#38bdf8'],
    summary: '通用散粉，适合作为日常训练补给，不需要根据等级做太复杂选择。',
  },
  {
    id: 'frictionlabs-unicorn-dust',
    name: 'Friction Labs Unicorn Dust',
    category: '镁粉',
    brand: 'Friction Labs',
    price: '约 $15-$20',
    match: '手汗明显、想要更细腻摩擦感',
    fit: '细粉质感，适合对镁粉手感比较敏感的用户',
    tags: ['细粉', '手汗', '高摩擦'],
    source: 'Friction Labs 官方商品资料',
    sourceUrl: 'https://shop.frictionlabs.com/products/friction-labs-loose-chalk-in-new-recyclable-packaging',
    imageUrl: 'https://shop.frictionlabs.com/cdn/shop/products/6ozFamilyStones_600x600_a17c0c6b-9886-45e6-82c8-99bebd481e64.jpg?v=1678933735',
    colors: ['#f8fafc', '#db2777'],
    summary: '偏精细的高端镁粉，适合已经能感知不同粉质差异的用户。',
  },
  {
    id: 'petzl-sakapoche',
    name: 'Petzl Sakapoche Chalk Bag',
    category: '粉袋',
    brand: 'Petzl',
    price: '约 $25-$35',
    match: '抱石和绳攀通用、需要拉链袋收纳小物',
    fit: '带腰带和拉链口袋，适合馆内外都想轻装的人',
    tags: ['粉袋', '收纳', '通用'],
    source: 'Petzl 官方商品资料',
    sourceUrl: 'https://www.petzl.com/US/en/Sport/Packs-and-accessories/SAKAPOCHE',
    imageUrl: 'https://www.petzl.com/sfc/servlet.shepherd/version/download/0686800000NNjfoAAD',
    colors: ['#dc2626', '#111827'],
    summary: '实用型粉袋，重点是稳定开口和小物收纳，适合作为第一只粉袋。',
  },
];

function ProductVisual({ product, large = false }) {
  return (
    <span
      className={`product-visual ${large ? 'product-visual-large' : ''}`}
      style={{
        '--product-primary': product.colors[0],
        '--product-secondary': product.colors[1],
      }}
      aria-hidden="true"
    >
      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <Package size={large ? 58 : 42} />}
    </span>
  );
}

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
  const [aiMascot] = useState(() => AI_HOLD_MASCOTS[Math.floor(Math.random() * AI_HOLD_MASCOTS.length)]);
  const [aiMode, setAiMode] = useState('consult');
  const [aiNeedsByMode, setAiNeedsByMode] = useState({});
  const [aiHistory, setAiHistory] = useState(() => readStoredAiHistory());
  const [activeAiSessionIdsByMode, setActiveAiSessionIdsByMode] = useState({});
  const [aiRecommendationsByMode, setAiRecommendationsByMode] = useState({});
  const [aiLoadingByMode, setAiLoadingByMode] = useState({});
  const [trainingPlans, setTrainingPlans] = useState(() => readStoredTrainingPlans());
  const [trainingPlanDraft, setTrainingPlanDraft] = useState(null);
  const [activeTrainingPlanId, setActiveTrainingPlanId] = useState('');
  const [activeProductId, setActiveProductId] = useState(PRODUCT_CATALOG[0]?.id || '');
  const [storePage, setStorePage] = useState('list');
  const [productAiAnswer, setProductAiAnswer] = useState('');
  const [isProductAiLoading, setIsProductAiLoading] = useState(false);
  const [aiPage, setAiPage] = useState('home');
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
    setStorePage('list');
    setAiPage('home');
  };

  useEffect(() => {
    const normalizedHistory = normalizeAiHistory(aiHistory);
    if (!normalizedHistory.length) return;

    setActiveAiSessionIdsByMode((currentIds) => {
      const nextIds = { ...currentIds };
      let changed = false;
      AI_ASSISTANT_MODES.forEach((mode) => {
        if (!nextIds[mode.id]) {
          const recentSession = normalizedHistory.find((entry) => entry.mode === mode.id);
          if (recentSession) {
            nextIds[mode.id] = recentSession.id;
            changed = true;
          }
        }
      });
      return changed ? nextIds : currentIds;
    });

    if (!activeAiSessionIdsByMode[aiMode]) {
      const recentSession = normalizedHistory.find((entry) => entry.mode === aiMode);
      if (recentSession && !aiRecommendation) {
        const latestAssistantMessage = [...recentSession.messages].reverse().find((message) => message.role === 'assistant')?.content || '';
        setAiRecommendationsByMode((currentRecommendations) => ({
          ...currentRecommendations,
          [aiMode]: latestAssistantMessage,
        }));
      }
    }
  }, [activeAiSessionIdsByMode, aiHistory, aiMode, aiRecommendation]);

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
  const plannedTrainingEntries = useMemo(() => expandTrainingPlanEntries(trainingPlans), [trainingPlans]);
  const activeTrainingPlan = trainingPlans.find((plan) => plan.id === activeTrainingPlanId) || null;
  const gradeSummary = useMemo(() => {
    const counts = sentEntries.reduce((acc, entry) => {
      acc[entry.grade] = (acc[entry.grade] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB, 'zh-CN'));
  }, [sentEntries]);
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth, sentEntries, plannedTrainingEntries),
    [calendarMonth, plannedTrainingEntries, sentEntries],
  );
  const entriesForSelectedDate = sentEntries.filter((entry) => entry.sentAt === selectedCalendarDate);
  const plannedEntriesForSelectedDate = plannedTrainingEntries.filter((entry) => entry.date === selectedCalendarDate);
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
  const activeProduct = PRODUCT_CATALOG.find((product) => product.id === activeProductId) || PRODUCT_CATALOG[0];
  const selectedAiMode = AI_ASSISTANT_MODES.find((mode) => mode.id === aiMode) || AI_ASSISTANT_MODES[0];
  const aiNeed = aiNeedsByMode[aiMode] || '';
  const aiRecommendation = aiRecommendationsByMode[aiMode] || '';
  const isAiLoading = Boolean(aiLoadingByMode[aiMode]);
  const activeAiHistoryId = activeAiSessionIdsByMode[aiMode] || '';
  const activeAiSession = aiHistory.find((entry) => entry.id === activeAiHistoryId) || null;
  const activeAiConversationMessages = activeAiSession?.mode === aiMode ? activeAiSession.messages || [] : [];
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

  const selectProduct = (productId) => {
    setActiveProductId(productId);
    setProductAiAnswer('');
    setStorePage('detail');
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
      style: '',
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

  const getAiContext = () => ({
    month: calendarMonth,
    recentRouteWindow: buildRecentRouteRecommendationContext(gyms, 30),
    personalGyms: gyms.slice(0, 8).map((gym) => ({
      name: gym.name,
      area: gym.area,
      lastVisit: gym.lastVisit,
      routeCount: gym.routes.length,
      sentCount: gym.routes.filter((route) => route.sentAt).length,
      routes: gym.routes.slice(0, 10).map((route) => ({
        name: route.name,
        grade: route.grade,
        style: getRouteStyleLabel(route),
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
    productCatalog: PRODUCT_CATALOG.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      brand: product.brand,
      price: product.price,
      match: product.match,
      fit: product.fit,
      imageUrl: product.imageUrl,
      tags: product.tags,
      summary: product.summary,
      source: product.source,
    })),
  });

  const getProductRecommendationNeed = (product) =>
    `请结合我的攀岩记录判断「${product.name}」是否适合我。请重点看我的常爬难度、最近是否有未过线挑战、训练频率和使用场景；如果数据不足，请告诉我还需要补充脚型、预算、试穿感受或手汗情况。`;

  const formatRouteHistoryRecommendation = (structuredRecommendation, fallbackText) => {
    if (!structuredRecommendation || typeof structuredRecommendation !== 'object') {
      return fallbackText || '路线推荐已完成，但结果格式需要再试一次。';
    }

    const recommendations = Array.isArray(structuredRecommendation.recommendations)
      ? structuredRecommendation.recommendations.slice(0, 3)
      : [];
    const summary = structuredRecommendation.summary || {};
    const styleStats = Array.isArray(structuredRecommendation.styleStats)
      ? structuredRecommendation.styleStats.slice(0, 6)
      : [];
    const skillGaps = Array.isArray(structuredRecommendation.skillGaps)
      ? structuredRecommendation.skillGaps.filter(Boolean).slice(0, 4)
      : [];
    const localStyleStats = buildRecentRouteRecommendationContext(gyms, 30).byStyle;
    const visibleStyleStats = styleStats.length
      ? styleStats
      : localStyleStats.map((style) => ({
          style: style.style,
          routeCount: style.total,
          sentCount: style.sent,
          projectCount: style.project,
          successRate: style.successRate,
        }));
    const lines = [
      structuredRecommendation.windowLabel || '最近 30 天',
      structuredRecommendation.headline || summary.primaryPattern || '根据最近记录生成路线推荐。',
      '',
      `记录：${summary.routeCount ?? '?'} 条线路 · 已过 ${summary.sentCount ?? '?'} · 待挑战 ${summary.projectCount ?? '?'} · 总成功率 ${
        summary.overallSuccessRate ?? '?'
      }%`,
      '',
      '风格统计：',
      ...(visibleStyleStats.length
        ? visibleStyleStats.flatMap((style) => [
            `${style.style || '未标注'}：${style.routeCount ?? style.total ?? 0} 条 · 已过 ${style.sentCount ?? style.sent ?? 0} · 待挑战 ${
              style.projectCount ?? style.project ?? 0
            } · 成功率 ${style.successRate ?? 0}%`,
            style.note ? `小结：${style.note}` : '',
          ])
        : ['还没有足够的路线风格记录。']),
      '',
      '今天推荐：',
      ...(recommendations.length
        ? recommendations.flatMap((item) => [
            `${item.grade || ''} ${item.style || item.label || '推荐线路'}${item.label && item.style ? ` · ${item.label}` : ''}`.trim(),
            item.reason ? `原因：${item.reason}` : '',
            item.tryPlan ? `尝试：${item.tryPlan}` : '',
            '',
          ])
        : ['暂无足够记录，先补 3-5 条带等级和是否完攀的线路。', '']),
    ].filter((line) => line !== '');

    if (skillGaps.length) {
      lines.push('建议补充：');
      skillGaps.forEach((gap) => lines.push(`- ${gap}`));
      lines.push('');
    }

    if (structuredRecommendation.recordingTip) lines.push(`下次记录：${structuredRecommendation.recordingTip}`);

    return lines.join('\n');
  };

  const getFallbackRouteHistoryRecommendation = (need) => {
    const recentWindow = buildRecentRouteRecommendationContext(gyms, 30);
    const bestProjects = recentWindow.recentProjects.slice(0, 3);
    const gradeText = recentWindow.byGrade
      .slice(0, 4)
      .map((item) => `${item.grade} ${item.sent}/${item.total}`)
      .join('、');
    const styleText = recentWindow.byStyle.length
      ? recentWindow.byStyle
          .map((item) => `${item.style}：${item.total} 条 · 已过 ${item.sent} · 待挑战 ${item.project} · 成功率 ${item.successRate}%`)
          .join('\n')
      : '还没有足够的路线风格记录。';
    const projectLines = bestProjects.length
      ? bestProjects.map((route) => `${route.grade} ${route.style || route.styleTags?.[0] || ''} · ${route.routeName} @ ${route.gymName}`.trim())
      : ['V? 技术线 · 先补一条可控项目', 'V? 平衡线 · 低强度练脚法'];

    return `最近 30 天\n${need || '根据你的线路记录生成推荐。'}\n\n记录：${recentWindow.routeCount} 条线路 · 已过 ${recentWindow.sentCount} · 待挑战 ${recentWindow.projectCount} · 总成功率 ${recentWindow.successRate}%\n等级参考：${gradeText || '还没有足够等级记录'}\n\n风格统计：\n${styleText}\n\n今天推荐：\n${projectLines.join('\n\n')}\n\n建议补充：\n- 平衡\n- 脚法\n\n下次记录：给线路选择路线风格，推荐会更准。`;
  };

  const getFallbackAiRecommendation = (need, mode = aiMode) => {
    if (mode === 'route_history') {
      return getFallbackRouteHistoryRecommendation(need);
    }

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
      return `根据你的描述：“${need}”\n\n建议先做 6 周长期计划：每周 2-3 次岩馆，至少间隔 1 天恢复。每周安排 1 次技术低强度、1 次力量耐力中高强度、1 次项目尝试；如果疲劳或疼痛明显，就把项目日改成技术日。\n\n单次训练可以分三段：热身 20 分钟，选择 2-3 条低一级线路做脚点和重心练习；主训练 45-70 分钟，挑 1-2 条略有挑战的线路拆动作；最后 15 分钟做肩背和髋部放松。\n\n可优先参考：${routeText || '公开广场里本月同城用户分享的线路'}。计划草案已生成，你可以调整频率、强度和训练日后接受。\n\nAI 后端暂时不可用，这是本地备用训练计划。`;
    }

    const productIntentPattern = /鞋|攀岩鞋|镁粉|粉|粉袋|装备|购买|买|预算|脚型|手汗|chalk|shoe|bag/i;
    const productText = productIntentPattern.test(need)
      ? `\n\n模拟商品可参考：${PRODUCT_CATALOG.slice(0, 3)
          .map((product) => `「${product.name}」（${product.category}，${product.match}）`)
          .join('、')}。如果要买装备，先明确脚型、预算、使用场景和可试穿渠道。`
      : '';

    return `根据你的描述：“${need}”\n\n可以先围绕 ${gymText || '你最近常去的岩馆'} 做选择。如果你在问线路，优先挑一条略低于极限等级的线路拆 beta；如果你在问岩馆，优先比较距离、墙型、线路更新频率和同伴情况。${productText}\n\n可参考的记录：${routeText || '公开广场里本月同城用户分享的线路'}。\n\nAI 后端暂时不可用，这是本地备用咨询建议。`;
  };

  const updateAiNeedForMode = (mode, value) => {
    setAiNeedsByMode((currentNeeds) => ({
      ...currentNeeds,
      [mode]: value,
    }));
  };

  const setActiveAiSessionForMode = (mode, sessionId) => {
    setActiveAiSessionIdsByMode((currentIds) => ({
      ...currentIds,
      [mode]: sessionId || '',
    }));
  };

  const updateAiRecommendationForMode = (mode, recommendation) => {
    setAiRecommendationsByMode((currentRecommendations) => ({
      ...currentRecommendations,
      [mode]: recommendation || '',
    }));
  };

  const setAiLoadingForMode = (mode, isLoading) => {
    setAiLoadingByMode((currentLoading) => ({
      ...currentLoading,
      [mode]: Boolean(isLoading),
    }));
  };

  const startNewAiSession = (mode = aiMode) => {
    setAiMode(mode);
    setActiveAiSessionForMode(mode, '');
    updateAiNeedForMode(mode, '');
    updateAiRecommendationForMode(mode, '');
    setTrainingPlanDraft(null);
    setAiPage('chat');
  };

  const saveAiHistoryEntry = ({ mode, need, recommendation }) => {
    const now = new Date().toISOString();
    const userMessage = {
      id: `${now}-user-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: need,
      createdAt: now,
    };
    const assistantMessage = {
      id: `${now}-assistant-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      content: recommendation,
      createdAt: now,
    };
    const normalizedHistory = normalizeAiHistory(aiHistory);
    const activeSession = normalizedHistory.find((entry) => entry.id === activeAiHistoryId && entry.mode === mode);
    const nextSession = activeSession
      ? {
          ...activeSession,
          title: activeSession.title || need.slice(0, 32) || 'AI 对话',
          updatedAt: now,
          messages: [...(activeSession.messages || []), userMessage, assistantMessage],
        }
      : {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mode,
          title: need.slice(0, 32) || 'AI 对话',
          createdAt: now,
          updatedAt: now,
          messages: [userMessage, assistantMessage],
        };
    const nextHistory = [
      nextSession,
      ...normalizedHistory.filter((entry) => entry.id !== nextSession.id),
    ].slice(0, MAX_AI_HISTORY_ITEMS);

    writeStoredAiHistory(nextHistory);
    setAiHistory(nextHistory);
    setActiveAiSessionForMode(mode, nextSession.id);
  };

  const updateTrainingPlanDraft = (updates) => {
    setTrainingPlanDraft((currentDraft) => (currentDraft ? { ...currentDraft, ...updates } : currentDraft));
  };

  const updateTrainingPlanSession = (index, updates) => {
    setTrainingPlanDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;

      return {
        ...currentDraft,
        sessions: currentDraft.sessions.map((session, sessionIndex) =>
          sessionIndex === index ? { ...session, ...updates } : session,
        ),
      };
    });
  };

  const syncDraftSessionCount = (nextFrequency) => {
    const weeklyFrequency = clampNumber(nextFrequency, 1, 5, 2);
    setTrainingPlanDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;

      const currentSessions = currentDraft.sessions || [];
      const sessions = Array.from({ length: weeklyFrequency }, (_, index) => ({
        ...(DEFAULT_TRAINING_SESSIONS[index] || DEFAULT_TRAINING_SESSIONS[DEFAULT_TRAINING_SESSIONS.length - 1]),
        ...(currentSessions[index] || {}),
      }));

      return {
        ...currentDraft,
        weeklyFrequency,
        sessions,
      };
    });
  };

  const acceptTrainingPlanDraft = () => {
    if (!trainingPlanDraft) return;

    const acceptedPlan = {
      ...trainingPlanDraft,
      id: `plan-${Date.now()}`,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      checkIns: {},
    };

    setTrainingPlans((currentPlans) => {
      const nextPlans = [acceptedPlan, ...currentPlans];
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
    setActiveTrainingPlanId(acceptedPlan.id);
    setTrainingPlanDraft(null);
    setCalendarMonth(acceptedPlan.startDate.slice(0, 7));
    setSelectedCalendarDate(acceptedPlan.startDate);
    setActiveView('personal');
  };

  const updateTrainingPlan = (planId, updates) => {
    setTrainingPlans((currentPlans) => {
      const nextPlans = currentPlans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : plan,
      );
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
  };

  const updateAcceptedTrainingPlanSession = (planId, index, updates) => {
    setTrainingPlans((currentPlans) => {
      const nextPlans = currentPlans.map((plan) => {
        if (plan.id !== planId) return plan;

        return {
          ...plan,
          sessions: (plan.sessions || []).map((session, sessionIndex) =>
            sessionIndex === index ? { ...session, ...updates } : session,
          ),
          updatedAt: new Date().toISOString(),
        };
      });
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
  };

  const syncAcceptedPlanSessionCount = (planId, nextFrequency) => {
    const weeklyFrequency = clampNumber(nextFrequency, 1, 5, 2);
    setTrainingPlans((currentPlans) => {
      const nextPlans = currentPlans.map((plan) => {
        if (plan.id !== planId) return plan;

        const currentSessions = plan.sessions || [];
        const sessions = Array.from({ length: weeklyFrequency }, (_, index) => ({
          ...(DEFAULT_TRAINING_SESSIONS[index] || DEFAULT_TRAINING_SESSIONS[DEFAULT_TRAINING_SESSIONS.length - 1]),
          ...(currentSessions[index] || {}),
        }));

        return {
          ...plan,
          weeklyFrequency,
          sessions,
          updatedAt: new Date().toISOString(),
        };
      });
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
  };

  const createManualTrainingPlan = () => {
    const manualPlan = {
      ...inferLongTermPlanDraft('我的长期攀岩计划', getAiContext()),
      id: `plan-${Date.now()}`,
      title: '我的长期攀岩计划',
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      checkIns: {},
    };

    setTrainingPlans((currentPlans) => {
      const nextPlans = [manualPlan, ...currentPlans];
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
    setActiveTrainingPlanId(manualPlan.id);
    setCalendarMonth(manualPlan.startDate.slice(0, 7));
    setSelectedCalendarDate(manualPlan.startDate);
    setActiveView('personal');
  };

  const deleteTrainingPlan = (planId) => {
    const plan = trainingPlans.find((currentPlan) => currentPlan.id === planId);
    if (!plan) return;
    if (!window.confirm(`确定删除「${plan.title}」吗？这会同时移除日历里的计划日和打卡记录。`)) return;

    setTrainingPlans((currentPlans) => {
      const nextPlans = currentPlans.filter((currentPlan) => currentPlan.id !== planId);
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
    if (activeTrainingPlanId === planId) {
      setActiveTrainingPlanId('');
    }
  };

  const toggleTrainingPlanCheckIn = (planId, date) => {
    setTrainingPlans((currentPlans) => {
      const nextPlans = currentPlans.map((plan) => {
        if (plan.id !== planId) return plan;

        const checkIns = { ...(plan.checkIns || {}) };
        if (checkIns[date]) {
          delete checkIns[date];
        } else {
          checkIns[date] = new Date().toISOString();
        }

        return { ...plan, checkIns };
      });
      writeStoredTrainingPlans(nextPlans);
      return nextPlans;
    });
  };

  const handleAiRecommendation = async () => {
    const need = aiNeed.trim();
    const selectedMode = AI_ASSISTANT_MODES.find((mode) => mode.id === aiMode) || AI_ASSISTANT_MODES[0];
    if (!need && aiMode !== 'route_history') {
      updateAiRecommendationForMode(
        aiMode,
        aiMode === 'training'
          ? '先写下今天的训练目标，比如“想练脚法，强度不要太大，训练 90 分钟”。'
          : '先写下你想问的内容，比如“怎么选第一双攀岩鞋”或“今晚去哪家岩馆练 slab”。',
      );
      return;
    }

    setAiLoadingForMode(aiMode, true);
    updateAiRecommendationForMode(aiMode, selectedMode.loading);
    setTrainingPlanDraft(null);
    const aiContext = getAiContext();
    const requestNeed = need || '请根据我最近 30 天的线路记录生成今天路线推荐。';

    try {
      const response = await fetch('/api/ai-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          need: requestNeed,
          mode: aiMode,
          context: aiContext,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'AI 服务暂时不可用。');
      }

      const recommendation =
        aiMode === 'route_history'
          ? formatRouteHistoryRecommendation(result.structuredRecommendation, result.recommendation)
          : result.recommendation || getFallbackAiRecommendation(requestNeed, aiMode);
      updateAiRecommendationForMode(aiMode, recommendation);
      saveAiHistoryEntry({
        mode: aiMode,
        need: aiMode === 'route_history' ? `最近 30 天路线推荐：${requestNeed}` : requestNeed,
        recommendation,
      });
      if (aiMode === 'training') {
        setTrainingPlanDraft(inferLongTermPlanDraft(requestNeed, aiContext));
      }
    } catch (error) {
      console.warn('AI 推荐失败', error);
      const recommendation = `${error.message}\n\n${getFallbackAiRecommendation(requestNeed, aiMode)}`;
      updateAiRecommendationForMode(aiMode, recommendation);
      saveAiHistoryEntry({
        mode: aiMode,
        need: aiMode === 'route_history' ? `最近 30 天路线推荐：${requestNeed}` : requestNeed,
        recommendation,
      });
      if (aiMode === 'training') {
        setTrainingPlanDraft(inferLongTermPlanDraft(requestNeed, aiContext));
      }
    } finally {
      updateAiNeedForMode(aiMode, '');
      setAiLoadingForMode(aiMode, false);
    }
  };

  const handleProductAiRecommendation = async (product) => {
    if (!product) return;

    const need = getProductRecommendationNeed(product);
    setActiveProductId(product.id);
    setStorePage('detail');
    setIsProductAiLoading(true);
    setProductAiAnswer(`正在结合你的记录分析「${product.name}」...`);

    try {
      const response = await fetch('/api/ai-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          need,
          mode: 'consult',
          context: {
            ...getAiContext(),
            focusedProduct: {
              id: product.id,
              name: product.name,
              category: product.category,
              brand: product.brand,
              price: product.price,
              match: product.match,
              fit: product.fit,
              imageUrl: product.imageUrl,
              tags: product.tags,
              summary: product.summary,
              source: product.source,
            },
          },
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'AI 服务暂时不可用。');
      }

      setProductAiAnswer(result.recommendation || getFallbackAiRecommendation(need, 'consult'));
    } catch (error) {
      console.warn('商品 AI 分析失败', error);
      setProductAiAnswer(`${error.message}\n\n${getFallbackAiRecommendation(need, 'consult')}`);
    } finally {
      setIsProductAiLoading(false);
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

      {activeView === 'store' ? (
        <main className="store-view">
          {storePage === 'detail' && activeProduct ? (
            <>
              <section className="view-header">
                <button className="ghost-btn" type="button" onClick={() => setStorePage('list')}>
                  <ArrowLeft size={18} />
                  商城
                </button>
                <div>
                  <p className="eyebrow">{activeProduct.category}</p>
                  <h1>{activeProduct.name}</h1>
                </div>
              </section>

              <section className="product-detail-page" aria-label="商品详情和 AI 建议">
                <div className="product-detail-media">
                  <ProductVisual product={activeProduct} large />
                </div>
                <aside className="product-detail-panel" aria-label="商品信息">
                  <div className="section-title">
                    <p className="eyebrow">{activeProduct.brand}</p>
                    <h2>{activeProduct.price}</h2>
                  </div>
                  <p className="product-detail-summary">{activeProduct.summary}</p>
                  <dl className="product-spec-list">
                    <div>
                      <dt>适合场景</dt>
                      <dd>{activeProduct.match}</dd>
                    </div>
                    <div>
                      <dt>尺码/手感</dt>
                      <dd>{activeProduct.fit}</dd>
                    </div>
                    <div>
                      <dt>模拟价格</dt>
                      <dd>{activeProduct.price}</dd>
                    </div>
                  </dl>
                  <a className="source-link" href={activeProduct.sourceUrl} target="_blank" rel="noreferrer">
                    {activeProduct.source}
                  </a>
                  <button className="ai-btn product-ai-trigger" type="button" onClick={() => handleProductAiRecommendation(activeProduct)} disabled={isProductAiLoading}>
                    <Sparkles size={18} />
                    {isProductAiLoading ? 'AI 正在看你的记录...' : '结合我的数据分析'}
                  </button>
                  <div className="product-ai-panel" aria-live="polite">
                    {productAiAnswer ? (
                      <pre className="ai-result">{productAiAnswer}</pre>
                    ) : (
                      <div className="ai-empty-state compact">
                        <Bot size={21} />
                        <strong>让 AI 先看记录</strong>
                        <p>会结合你的岩馆、难度、未过线挑战和商品用途回答是否适合。</p>
                      </div>
                    )}
                  </div>
                </aside>
              </section>
            </>
          ) : (
            <>
              <section className="intro-band">
                <div>
                  <p className="eyebrow">模拟商城</p>
                  <h1>攀岩装备精选</h1>
                </div>
              </section>

              <section className="product-grid" aria-label="攀岩装备商城">
                {PRODUCT_CATALOG.map((product) => (
                  <article className="product-card" key={product.id}>
                    <button className="product-main" type="button" onClick={() => selectProduct(product.id)}>
                      <ProductVisual product={product} />
                      <span className="product-copy">
                        <small>{product.brand} · {product.category}</small>
                        <strong>{product.name}</strong>
                        <em>{product.price}</em>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <p>{product.summary}</p>
                    <div className="product-tags">
                      {product.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
        </main>
      ) : null}

      {activeView === 'ai' ? (
        <main className="ai-view">
          {aiPage === 'history' ? (
            <>
              <section className="view-header">
                <button className="ghost-btn" type="button" onClick={() => setAiPage('home')}>
                  <ArrowLeft size={18} />
                  AI 助手
                </button>
                <div>
                  <p className="eyebrow">最近咨询</p>
                  <h1>AI 历史记录</h1>
                </div>
                {aiHistory.length ? (
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={() => {
                      setAiHistory([]);
                      setActiveAiSessionIdsByMode({});
                      setAiNeedsByMode({});
                      setAiRecommendationsByMode({});
                      setAiLoadingByMode({});
                      writeStoredAiHistory([]);
                    }}
                    aria-label="清空 AI 历史"
                  >
                    <Trash2 size={16} />
                    清空
                  </button>
                ) : null}
              </section>

              <section className="ai-history-panel ai-history-page" aria-label="AI 历史记录">
                {aiHistory.length ? (
                  <div className="ai-history-list">
                    {aiHistory.map((entry) => {
                      const entryMode = AI_ASSISTANT_MODES.find((mode) => mode.id === entry.mode) || AI_ASSISTANT_MODES[0];
                      const messageCount = entry.messages?.filter((message) => message.role === 'user').length || 0;
                      const latestAssistantMessage =
                        [...(entry.messages || [])].reverse().find((message) => message.role === 'assistant')?.content || '';

                      return (
                        <button
                          className={`ai-history-item ${activeAiHistoryId === entry.id ? 'active' : ''}`}
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setAiMode(entry.mode);
                            setActiveAiSessionForMode(entry.mode, entry.id);
                            updateAiNeedForMode(entry.mode, '');
                            updateAiRecommendationForMode(entry.mode, latestAssistantMessage);
                            setAiPage('chat');
                          }}
                        >
                          <span>{entryMode.title}</span>
                          <strong>{entry.title || entry.messages?.[0]?.content || 'AI 对话'}</strong>
                          <small>
                            {messageCount} 轮对话 · {formatAiHistoryTime(entry.updatedAt || entry.createdAt)}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>还没有保存的 AI 回答</strong>
                    <span>生成一次建议后会自动出现在这里。</span>
                  </div>
                )}
              </section>
            </>
          ) : aiPage === 'chat' ? (
            <>
              <section className="view-header">
                <button className="ghost-btn" type="button" onClick={() => setAiPage('home')}>
                  <ArrowLeft size={18} />
                  AI 助手
                </button>
                <div>
                  <p className="eyebrow">AI 模块</p>
                  <h1>{selectedAiMode.title}</h1>
                </div>
                <div className="header-actions">
                  <button className="ghost-btn" type="button" onClick={() => startNewAiSession(aiMode)}>
                    <Plus size={17} />
                    新对话
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => setAiPage('history')}>
                    <ClipboardList size={17} />
                    历史
                  </button>
                </div>
              </section>

              <section className="ai-chat-page" aria-label={`${selectedAiMode.title}聊天`}>
                <div className="ai-chat-thread" aria-live="polite">
                  {activeAiConversationMessages.length ? (
                    activeAiConversationMessages.map((message) => (
                      <div
                        className={`chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                        key={message.id}
                      >
                        <span>{message.role === 'user' ? '你' : selectedAiMode.title}</span>
                        {message.role === 'assistant' ? (
                          <pre className="ai-result">{message.content}</pre>
                        ) : (
                          <p>{message.content}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="ai-empty-state chat-empty">
                      <Bot size={22} />
                      <strong>{selectedAiMode.title}</strong>
                      <p>{selectedAiMode.description}</p>
                    </div>
                  )}
                  {aiRecommendation && !activeAiConversationMessages.length && !isAiLoading ? (
                    <div className="chat-message assistant-message">
                      <span>{selectedAiMode.title}</span>
                      <p>{aiRecommendation}</p>
                    </div>
                  ) : null}
                  {isAiLoading ? (
                    <article className="ai-chat-pair pending">
                      <div className="chat-message user-message">
                        <span>你</span>
                        <p>{aiNeed.trim() || '请根据我最近 30 天的线路记录生成今天路线推荐。'}</p>
                      </div>
                      <div className="chat-message assistant-message">
                        <span>{selectedAiMode.title}</span>
                        <p>{selectedAiMode.loading}</p>
                      </div>
                    </article>
                  ) : null}
                </div>

                {trainingPlanDraft && aiMode === 'training' ? (
                  <section className="training-plan-panel chat-plan-panel" aria-label="长期训练计划草案">
                    <div className="training-plan-heading">
                      <div>
                        <p className="eyebrow">计划草案</p>
                        <h2>调整后接受到日历</h2>
                      </div>
                      <button className="primary-btn compact" type="button" onClick={acceptTrainingPlanDraft}>
                        <Save size={17} />
                        接受计划
                      </button>
                    </div>

                    <div className="plan-settings-grid">
                      <label className="field">
                        <span>计划名称</span>
                        <input
                          value={trainingPlanDraft.title}
                          onChange={(event) => updateTrainingPlanDraft({ title: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>开始日期</span>
                        <input
                          type="date"
                          value={trainingPlanDraft.startDate}
                          onChange={(event) => updateTrainingPlanDraft({ startDate: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>持续周数</span>
                        <input
                          type="number"
                          min="2"
                          max="16"
                          value={trainingPlanDraft.durationWeeks}
                          onChange={(event) => updateTrainingPlanDraft({ durationWeeks: clampNumber(event.target.value, 2, 16, 6) })}
                        />
                      </label>
                      <label className="field">
                        <span>每周次数</span>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={trainingPlanDraft.weeklyFrequency}
                          onChange={(event) => syncDraftSessionCount(event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="training-session-list">
                      {trainingPlanDraft.sessions.map((session, index) => (
                        <div className="training-session-row" key={`${session.weekday}-${index}`}>
                          <strong>第 {index + 1} 次</strong>
                          <select
                            value={session.weekday}
                            onChange={(event) => updateTrainingPlanSession(index, { weekday: Number(event.target.value) })}
                            aria-label={`第 ${index + 1} 次训练日`}
                          >
                            {TRAINING_WEEKDAYS.map((weekday) => (
                              <option key={weekday.value} value={weekday.value}>
                                {weekday.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={session.focus}
                            onChange={(event) => updateTrainingPlanSession(index, { focus: event.target.value })}
                            aria-label={`第 ${index + 1} 次训练重点`}
                          />
                          <label>
                            <span>强度</span>
                            <input
                              type="number"
                              min="3"
                              max="9"
                              value={session.intensity}
                              onChange={(event) => updateTrainingPlanSession(index, { intensity: clampNumber(event.target.value, 3, 9, 7) })}
                            />
                          </label>
                          <label>
                            <span>分钟</span>
                            <input
                              type="number"
                              min="45"
                              max="150"
                              step="5"
                              value={session.durationMinutes}
                              onChange={(event) =>
                                updateTrainingPlanSession(index, { durationMinutes: clampNumber(event.target.value, 45, 150, 90) })
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>

                    <label className="field">
                      <span>
                        <CalendarClock size={16} />
                        打卡提示
                      </span>
                      <input
                        value={trainingPlanDraft.reminder}
                        onChange={(event) => updateTrainingPlanDraft({ reminder: event.target.value })}
                      />
                    </label>
                  </section>
                ) : null}

                <div className="ai-chat-composer">
                  <label className="field">
                    <span>
                      <Target size={16} />
                      {aiMode === 'route_history' ? '补充目标' : '你的问题'}
                    </span>
                    <textarea
                      value={aiNeed}
                      placeholder={selectedAiMode.placeholder}
                      onChange={(event) => updateAiNeedForMode(aiMode, event.target.value)}
                    />
                  </label>
                  <button className="ai-btn ai-submit" type="button" onClick={handleAiRecommendation} disabled={isAiLoading}>
                    <Send size={18} />
                    {isAiLoading ? selectedAiMode.loading : selectedAiMode.action}
                  </button>
                </div>
              </section>
            </>
          ) : (
            <section className="ai-workspace">
              <div className="ai-hero">
                <div className="ai-hero-copy">
                  <p className="eyebrow">AI 攀岩助手</p>
                  <h1>选择一个模块</h1>
                  <p>
                    每个模块都有独立聊天页，可以一问一答地继续咨询。
                  </p>
                  <span className="ai-mascot-label">
                    今日岩点：{aiMascot.name} · {aiMascot.description}
                  </span>
                  <button className="ghost-btn ai-history-entry" type="button" onClick={() => setAiPage('history')}>
                    <ClipboardList size={17} />
                    历史记录
                    {aiHistory.length ? <small>{aiHistory.length}</small> : null}
                  </button>
                </div>
                <img src={aiMascot.image} alt={`BetaClimb AI ${aiMascot.description}形象`} />
              </div>

              <div className="ai-mode-grid" aria-label="AI 助手模块">
                {AI_ASSISTANT_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const modeHistoryCount = aiHistory.filter((entry) => entry.mode === mode.id).length;

                  return (
                    <button
                      className="ai-mode-card"
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        const recentSession = aiHistory.find((entry) => entry.mode === mode.id);
                        setAiMode(mode.id);
                        updateAiNeedForMode(mode.id, '');
                        setActiveAiSessionForMode(mode.id, recentSession?.id || '');
                        updateAiRecommendationForMode(
                          mode.id,
                          [...(recentSession?.messages || [])].reverse().find((message) => message.role === 'assistant')?.content || '',
                        );
                        setAiPage('chat');
                      }}
                    >
                      <span className="ai-mode-icon">
                        <Icon size={18} />
                      </span>
                      <strong>{mode.title}</strong>
                      <small>{mode.description}</small>
                      <em>{modeHistoryCount ? `${modeHistoryCount} 条记录` : '开始聊天'}</em>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
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
              <button className="ghost-btn compact" type="button" onClick={createManualTrainingPlan}>
                <ClipboardList size={18} />
                新建计划
              </button>
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

              <section className="plan-manager-panel" aria-label="长期训练计划">
                <div className="section-title">
                  <p className="eyebrow">训练计划</p>
                  <h2>自主调整安排</h2>
                </div>
                {trainingPlans.length ? (
                  <div className="plan-manager-list">
                    {trainingPlans.map((plan) => (
                      <div
                        className={`plan-manager-item ${activeTrainingPlanId === plan.id ? 'active' : ''}`}
                        key={plan.id}
                      >
                        <button
                          className="plan-manager-edit"
                          type="button"
                          onClick={() => {
                            setActiveTrainingPlanId(plan.id);
                            setCalendarMonth(String(plan.startDate || formatLocalDate(new Date())).slice(0, 7));
                            setSelectedCalendarDate(plan.startDate || formatLocalDate(new Date()));
                          }}
                        >
                          <span>
                            <b>{plan.title}</b>
                            <small>
                              {plan.durationWeeks} 周 · 每周 {plan.weeklyFrequency} 次
                            </small>
                          </span>
                          <Pencil size={16} />
                        </button>
                        <button className="plan-delete-btn" type="button" onClick={() => deleteTrainingPlan(plan.id)} aria-label={`删除${plan.title}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">可以让 AI 起草，也可以点“新建计划”自己安排。</p>
                )}
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
                      className={`calendar-day ${day.visits.length ? 'has-visits' : ''} ${day.plans.length ? 'has-plans' : ''} ${
                        day.plans.some((plan) => plan.checked) ? 'has-checkins' : ''
                      } ${day.date === selectedCalendarDate ? 'selected' : ''}`}
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedCalendarDate(day.date)}
                    >
                      <span>{day.day}</span>
                      {day.visits.length || day.plans.length ? (
                        <small>{day.visits.length + day.plans.length}</small>
                      ) : null}
                    </button>
                  ) : (
                    <span className="calendar-blank" key={`blank-${index}`} />
                  ),
                )}
              </div>

              <div className="day-detail">
                <strong>{selectedCalendarDate || '选择日期'}</strong>
                {plannedEntriesForSelectedDate.length ? (
                  <div className="planned-session-list">
                    {plannedEntriesForSelectedDate.map((entry) => (
                      <div className="planned-session" key={entry.id}>
                        <span>
                          <b>{entry.focus}</b>
                          <small>
                            {entry.durationMinutes} 分钟 · 强度 {entry.intensity}/10
                          </small>
                          <small>{entry.reminder}</small>
                        </span>
                        <button
                          className={`checkin-btn ${entry.checked ? 'checked' : ''}`}
                          type="button"
                          onClick={() => toggleTrainingPlanCheckIn(entry.planId, entry.date)}
                        >
                          <CheckCircle2 size={16} />
                          {entry.checked ? '已打卡' : '打卡'}
                        </button>
                        <button className="ghost-btn icon-only" type="button" onClick={() => setActiveTrainingPlanId(entry.planId)} aria-label="编辑计划">
                          <Pencil size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                  <p className="empty-copy">
                    {plannedEntriesForSelectedDate.length ? '这天还没有记录过线。' : '这天还没有计划或过线记录。'}
                  </p>
                )}
              </div>

              {activeTrainingPlan ? (
                <section className="training-plan-panel calendar-plan-editor" aria-label="编辑长期训练计划">
                  <div className="training-plan-heading">
                    <div>
                      <p className="eyebrow">编辑计划</p>
                      <h2>日历会自动同步</h2>
                    </div>
                    <div className="plan-editor-actions">
                      <button className="plan-delete-text-btn" type="button" onClick={() => deleteTrainingPlan(activeTrainingPlan.id)}>
                        <Trash2 size={16} />
                        删除计划
                      </button>
                      <button className="ghost-btn compact" type="button" onClick={() => setActiveTrainingPlanId('')}>
                        <EyeOff size={16} />
                        收起
                      </button>
                    </div>
                  </div>

                  <div className="plan-settings-grid">
                    <label className="field">
                      <span>计划名称</span>
                      <input
                        value={activeTrainingPlan.title}
                        onChange={(event) => updateTrainingPlan(activeTrainingPlan.id, { title: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>开始日期</span>
                      <input
                        type="date"
                        value={activeTrainingPlan.startDate}
                        onChange={(event) => {
                          updateTrainingPlan(activeTrainingPlan.id, { startDate: event.target.value });
                          setCalendarMonth(event.target.value.slice(0, 7));
                          setSelectedCalendarDate(event.target.value);
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>持续周数</span>
                      <input
                        type="number"
                        min="2"
                        max="16"
                        value={activeTrainingPlan.durationWeeks}
                        onChange={(event) =>
                          updateTrainingPlan(activeTrainingPlan.id, { durationWeeks: clampNumber(event.target.value, 2, 16, 6) })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>每周次数</span>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={activeTrainingPlan.weeklyFrequency}
                        onChange={(event) => syncAcceptedPlanSessionCount(activeTrainingPlan.id, event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="training-session-list">
                    {(activeTrainingPlan.sessions || []).map((session, index) => (
                      <div className="training-session-row" key={`${activeTrainingPlan.id}-${index}`}>
                        <strong>第 {index + 1} 次</strong>
                        <select
                          value={session.weekday}
                          onChange={(event) =>
                            updateAcceptedTrainingPlanSession(activeTrainingPlan.id, index, { weekday: Number(event.target.value) })
                          }
                          aria-label={`第 ${index + 1} 次训练日`}
                        >
                          {TRAINING_WEEKDAYS.map((weekday) => (
                            <option key={weekday.value} value={weekday.value}>
                              {weekday.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={session.focus}
                          onChange={(event) => updateAcceptedTrainingPlanSession(activeTrainingPlan.id, index, { focus: event.target.value })}
                          aria-label={`第 ${index + 1} 次训练重点`}
                        />
                        <label>
                          <span>强度</span>
                          <input
                            type="number"
                            min="3"
                            max="9"
                            value={session.intensity}
                            onChange={(event) =>
                              updateAcceptedTrainingPlanSession(activeTrainingPlan.id, index, {
                                intensity: clampNumber(event.target.value, 3, 9, 7),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>分钟</span>
                          <input
                            type="number"
                            min="45"
                            max="150"
                            step="5"
                            value={session.durationMinutes}
                            onChange={(event) =>
                              updateAcceptedTrainingPlanSession(activeTrainingPlan.id, index, {
                                durationMinutes: clampNumber(event.target.value, 45, 150, 90),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <label className="field">
                    <span>
                      <CalendarClock size={16} />
                      打卡提示
                    </span>
                    <input
                      value={activeTrainingPlan.reminder}
                      onChange={(event) => updateTrainingPlan(activeTrainingPlan.id, { reminder: event.target.value })}
                    />
                  </label>
                </section>
              ) : null}

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
                            <small>
                              {route.grade} · {getRouteStyleLabel(route) || '未选风格'} · 添加于 {getRouteAddedAt(route, activeGym)}
                            </small>
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
                            <small>{route.grade} · {getRouteStyleLabel(route) || '未选风格'} · {route.sentAt}</small>
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
                  <Target size={16} />
                  路线风格
                </span>
                <select
                  value={getRouteStyleSelectValue(activeRoute)}
                  disabled={!isEditing}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    updateRoute({ style: nextValue === CUSTOM_ROUTE_STYLE_VALUE ? '' : nextValue });
                  }}
                >
                  <option value="">未选择</option>
                  {ROUTE_STYLE_OPTIONS.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                  <option value={CUSTOM_ROUTE_STYLE_VALUE}>自定义</option>
                </select>
              </label>

              {getRouteStyleSelectValue(activeRoute) === CUSTOM_ROUTE_STYLE_VALUE || (isEditing && !getRouteStyleLabel(activeRoute)) ? (
                <label className="field">
                  <span>
                    <Pencil size={16} />
                    自定义风格
                  </span>
                  <input
                    type="text"
                    value={ROUTE_STYLE_OPTIONS.includes(getRouteStyleLabel(activeRoute)) ? '' : getRouteStyleLabel(activeRoute)}
                    disabled={!isEditing}
                    placeholder="例如：动态协调线、耐力线、脚法线"
                    onChange={(event) => updateRoute({ style: event.target.value })}
                  />
                </label>
              ) : null}

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

      <nav className="bottom-nav" aria-label="主功能">
        <TopNavButton active={activeView === 'personal'} icon={Dumbbell} onClick={() => switchView('personal')}>
          我的
        </TopNavButton>
        <TopNavButton active={activeView === 'gyms' || activeView === 'routeDiscussion'} icon={Building2} onClick={() => switchView('gyms')}>
          岩馆
        </TopNavButton>
        <TopNavButton active={activeView === 'square'} icon={Users} onClick={() => switchView('square')}>
          广场
        </TopNavButton>
        <TopNavButton active={activeView === 'store'} icon={ShoppingBag} onClick={() => switchView('store')}>
          商城
        </TopNavButton>
        <TopNavButton active={activeView === 'ai'} icon={Sparkles} onClick={() => switchView('ai')}>
          AI
        </TopNavButton>
      </nav>
    </div>
  );
}
