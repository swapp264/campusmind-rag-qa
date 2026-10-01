const MISTRAL_API_URL = 'https://api.mistral.ai/v1';

export async function getMistralApiKey() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY environment variable is not configured.');
  }
  return apiKey;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fast fetch wrapper with 1 quick retry for HTTP 429 Rate Limits before falling back to local natural QA engine.
 */
async function fetchWithRetry(url, options, maxRetries = 1, initialDelay = 400) {
  let attempt = 0;
  let delay = initialDelay;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        attempt++;
        if (attempt > maxRetries) {
          throw new Error('MISTRAL_RATE_LIMIT');
        }
        console.warn(`[Mistral API 429 Rate Limit] Fast retry (attempt ${attempt}/${maxRetries}) in ${delay}ms...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Mistral API Error (${response.status}):`, errorText);
        throw new Error(`Mistral API error (${response.status}): ${errorText}`);
      }

      return response;
    } catch (err) {
      if (err.message === 'MISTRAL_RATE_LIMIT') {
        throw err;
      }
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
}

/**
 * Generate embeddings using Mistral API mistral-embed model.
 * @param {string | string[]} inputs - Single text string or array of text strings.
 * @returns {Promise<number[][]>} Array of embedding vectors (1024 floats each).
 */
export async function getMistralEmbeddings(inputs) {
  const apiKey = await getMistralApiKey();
  const inputList = Array.isArray(inputs) ? inputs : [inputs];

  if (inputList.length === 0) return [];

  const cleanedInputs = inputList.map(t => (t || '').trim() || 'empty chunk');

  const BATCH_SIZE = 32;
  const allEmbeddings = [];

  for (let i = 0; i < cleanedInputs.length; i += BATCH_SIZE) {
    const batch = cleanedInputs.slice(i, i + BATCH_SIZE);
    
    const response = await fetchWithRetry(`${MISTRAL_API_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: batch,
      }),
    });

    const data = await response.json();
    const sortedData = (data.data || []).sort((a, b) => a.index - b.index);
    for (const item of sortedData) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

/**
 * Generate chat completion using Mistral API mistral-small-latest model.
 * @param {Array<{role: string, content: string}>} messages 
 * @param {number} temperature 
 * @returns {Promise<string>} Generated answer
 */
export async function getMistralCompletion(messages, temperature = 0.1) {
  const apiKey = await getMistralApiKey();

  const response = await fetchWithRetry(`${MISTRAL_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages,
      temperature,
    }),
  });

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Mistral API returned an empty or invalid response choice.');
  }

  return choice.message.content.trim();
}
