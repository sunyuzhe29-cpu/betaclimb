const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const AI_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/responses';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_GATEWAY_MODEL = 'openai/gpt-4.1-mini';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const ROUTE_HISTORY_MODE = 'route_history';

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
};

const getOutputText = (payload) => {
  const chatText = (payload.choices || [])
    .map((choice) => choice.message?.content || choice.delta?.content || '')
    .filter(Boolean)
    .join('\n')
    .trim();
  if (chatText) return chatText;

  if (typeof payload.output_text === 'string') return payload.output_text;

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
};

const parseJsonOutput = (text) => {
  const trimmedText = String(text || '').trim();
  if (!trimmedText) return null;

  try {
    return JSON.parse(trimmedText);
  } catch {
    const jsonMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/) || trimmedText.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      return null;
    }
  }
};

const getPrompt = ({ mode, need, context }) => `
你是 BetaClimb 的攀岩 AI 助手。请用简体中文回答。

当前模式：
${
  mode === 'training'
    ? '训练计划：重点输出训练安排、强度控制、恢复建议。'
    : '综合咨询：可以讨论线路 beta、装备选择、岩馆选择、当天攀爬策略。'
}

用户今天的描述：
${need}

可用数据 JSON：
${JSON.stringify(context, null, 2)}

请基于这些数据给出实用建议：
1. 如果是综合咨询，优先回答用户问到的线路、装备、岩馆或当天策略，不强行生成完整训练计划。
2. 如果是训练计划，先给出 2-16 周的长期安排，包含每周去几次岩馆、持续多久、每次训练重点、强度 1-10、单次时长和恢复日；再给出下一次 60-120 分钟训练安排，包含热身、主训练、收尾和强度控制。
3. 推荐 1-3 个相关岩馆或线路时，要说明原因。
4. 如果数据不足，要明确说明，并给出如何补充记录的建议。
5. 不要编造不存在的岩馆、线路、距离、价格、营业时间或装备价格。
6. 不提供医疗诊断；如果用户描述疼痛或受伤，只给低风险训练调整和休息建议。
7. 可用数据里可能包含模拟商品目录。只有当用户明确提到装备、产品、购买、预算、攀岩鞋、镁粉、粉袋、脚型、手汗等需求，或 context.focusedProduct 存在时，才可以推荐或比较商品；否则不要主动推产品，也不要把商品插入训练计划或线路 beta。
8. 推荐商品时必须说明它为什么匹配用户记录或为什么数据不足；价格只能引用商品目录里的模拟价格，不能编造折扣、库存或购买链接。
9. 训练计划模式必须包含“长期计划草案”和“打卡提示”两段，让用户能按这个草案调整后放进日历。
10. 输出要简洁、可执行，适合手机阅读。
`;

const getRouteHistoryPrompt = ({ need, context }) => `
你是 BetaClimb 的攀岩路线推荐引擎。请在后台分析用户最近 30 天的线路记录、完攀记录、未过线挑战、常去岩馆和公开线路数据，最后只给用户展示总结与推荐，不展示完整分析过程。

用户补充：
${need || '用户没有补充目标，请根据最近记录推荐今天适合尝试的线路类型。'}

可用数据 JSON：
${JSON.stringify(context, null, 2)}

要求：
1. 你可以内部统计最近 30 天成功率、常爬等级、未过线线路、偏好墙型/动作类型和能力短板，但不要把逐条分析过程暴露给用户。
2. 优先推荐用户记录中真实存在的未过线线路；如果没有足够候选，再推荐“线路类型”，不要编造不存在的具体线路名。
3. 成功率可以基于同等级/相近等级历史完攀与未过线记录估算；如果样本少，要保守并在 reason 里说明。
4. 输出必须是严格 JSON，不要 Markdown，不要代码块。
5. JSON schema:
{
  "headline": "一句话总结，比如 最近动态路线过多，今天适合补脚法和平衡",
  "windowLabel": "最近 30 天",
  "summary": {
    "routeCount": 0,
    "sentCount": 0,
    "projectCount": 0,
    "primaryPattern": "一句话概括最近记录"
  },
  "recommendations": [
    {
      "label": "线路名或线路类型，例如 V4 Slab",
      "grade": "例如 V4",
      "style": "例如 平衡线 / 力量线 / 技术线 / 指力线",
      "successRate": 0-100,
      "reason": "面向用户的简短理由",
      "tryPlan": "今天尝试时的具体策略"
    }
  ],
  "skillGaps": ["平衡", "脚法"],
  "recordingTip": "建议用户补充哪些记录让推荐更准"
}
`;

const getProviderConfig = () => {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      apiUrl: process.env.DEEPSEEK_API_URL || DEEPSEEK_API_URL,
      model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
      provider: 'deepseek',
      protocol: 'chat-completions',
    };
  }

  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      apiUrl: AI_GATEWAY_API_URL,
      model: process.env.AI_GATEWAY_MODEL || DEFAULT_GATEWAY_MODEL,
      provider: 'vercel-ai-gateway',
      protocol: 'responses',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      apiUrl: OPENAI_API_URL,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      provider: 'openai',
      protocol: 'responses',
    };
  }

  return null;
};

const getProviderBody = ({ provider, need, mode, context }) => {
  const systemContent =
    '你是专业、谨慎、务实的攀岩助手。你会根据用户记录、公开线路数据和用户当天目标，输出安全且可执行的建议。';
  const isRouteHistoryMode = mode === ROUTE_HISTORY_MODE;
  const userContent = isRouteHistoryMode ? getRouteHistoryPrompt({ need, context }) : getPrompt({ mode, need, context });

  if (provider.protocol === 'chat-completions') {
    return {
      model: provider.model,
      messages: [
        {
          role: 'system',
          content: systemContent,
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
      max_tokens: 1100,
      temperature: 0.45,
    };
  }

  return {
    model: provider.model,
    input: [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    max_output_tokens: isRouteHistoryMode ? 1400 : 1100,
  };
};

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method === 'GET') {
    const provider = getProviderConfig();
    json(response, 200, {
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY),
      hasAiGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
      hasVercelOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
      hasViteOpenAIKey: Boolean(process.env.VITE_OPENAI_API_KEY),
      provider: provider?.provider || 'none',
      model: provider?.model || process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
      note: 'This endpoint never returns secret values. It prefers DEEPSEEK_API_KEY, then AI Gateway, then OPENAI_API_KEY.',
    });
    return;
  }

  if (request.method !== 'POST') {
    json(response, 405, { error: '只支持 POST 请求。' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    json(response, 400, { error: '请求内容不是有效 JSON。' });
    return;
  }

  const mode = body.mode === 'training' ? 'training' : body.mode === ROUTE_HISTORY_MODE ? ROUTE_HISTORY_MODE : 'consult';
  const need = String(body.need || '').trim() || (mode === ROUTE_HISTORY_MODE ? '请根据我最近 30 天的线路记录生成今天路线推荐。' : '');
  if (!need) {
    json(response, 400, { error: '请先描述今天的攀岩需求。' });
    return;
  }

  const provider = getProviderConfig();
  if (!provider) {
    json(response, 500, { error: '后端还没有可用的 AI 鉴权。请配置 DEEPSEEK_API_KEY、Vercel AI Gateway 或 OPENAI_API_KEY。' });
    return;
  }

  try {
    const openaiResponse = await fetch(provider.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...getProviderBody({
          provider,
          need,
          mode,
          context: body.context || {},
        }),
      }),
    });

    const payload = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const message = payload?.error?.message || 'AI 请求失败。';
      json(response, openaiResponse.status, { error: message });
      return;
    }

    const outputText = getOutputText(payload);
    const structuredRecommendation = mode === ROUTE_HISTORY_MODE ? parseJsonOutput(outputText) : null;

    json(response, 200, {
      recommendation: outputText,
      structuredRecommendation,
      model: payload.model,
      provider: provider.provider,
    });
  } catch (error) {
    json(response, 500, { error: error.message || 'AI 服务请求失败。' });
  }
}
