const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';

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
  if (typeof payload.output_text === 'string') return payload.output_text;

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
};

const getPrompt = ({ need, context }) => `
你是 BetaClimb 的攀岩训练和线路推荐助手。请用简体中文回答。

用户今天的描述：
${need}

可用数据 JSON：
${JSON.stringify(context, null, 2)}

请基于这些数据给出实用建议：
1. 推荐 1-3 个岩馆或线路，并说明原因。
2. 给出今天 60-120 分钟的训练安排。
3. 如果数据不足，要明确说明，并给出如何补充记录的建议。
4. 不要编造不存在的岩馆、线路、距离、价格或营业时间。
5. 不提供医疗诊断；如果用户描述疼痛或受伤，只给低风险训练调整和休息建议。
6. 输出要简洁、可执行，适合手机阅读。
`;

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    json(response, 405, { error: '只支持 POST 请求。' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    json(response, 500, { error: '后端还没有配置 OPENAI_API_KEY。' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    json(response, 400, { error: '请求内容不是有效 JSON。' });
    return;
  }

  const need = String(body.need || '').trim();
  if (!need) {
    json(response, 400, { error: '请先描述今天的攀岩需求。' });
    return;
  }

  try {
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          {
            role: 'system',
            content:
              '你是专业、谨慎、务实的攀岩训练助手。你会根据用户记录、公开线路数据和用户当天目标，输出安全且可执行的建议。',
          },
          {
            role: 'user',
            content: getPrompt({
              need,
              context: body.context || {},
            }),
          },
        ],
        max_output_tokens: 900,
      }),
    });

    const payload = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const message = payload?.error?.message || 'OpenAI 请求失败。';
      json(response, openaiResponse.status, { error: message });
      return;
    }

    json(response, 200, {
      recommendation: getOutputText(payload),
      model: payload.model,
    });
  } catch (error) {
    json(response, 500, { error: error.message || 'AI 服务请求失败。' });
  }
}
