import { vi } from 'vitest'
import { PROVIDERS } from '../src/main/vision/providers'

const output = {
  description: 'Una aldea junto al río',
  dimension: 'minecraft:overworld',
  biome_id: 'minecraft:plains',
  biome_confidence: 0.8,
  time_of_day: 'day',
  weather: 'clear',
  mobs: [{ id: 'minecraft:villager', count: 2 }],
  structures: ['minecraft:village']
}
const image = { base64: 'AAAA', mimeType: 'image/jpeg' as const }
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('advanced-AI providers', () => {
  it('OpenAI: sends the image with a strict JSON schema and parses the answer', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ model: 'gpt-x', choices: [{ message: { content: JSON.stringify(output) } }] })
    )
    const r = await PROVIDERS.openai.analyze({ apiKey: 'sk', model: 'gpt-x' }, image, 'hola')
    expect(r.output.structures).toEqual(['minecraft:village'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    const body = JSON.parse(init.body)
    expect(body.response_format.type).toBe('json_schema')
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
    expect(init.headers.Authorization).toBe('Bearer sk')
  })

  it('OpenAI-compatible servers without json_schema: retries in plain JSON mode', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: 'response_format not supported' } }, 400))
      .mockResolvedValueOnce(
        json({
          model: 'local',
          choices: [{ message: { content: '```json\n' + JSON.stringify(output) + '\n```' } }]
        })
      )
    const r = await PROVIDERS.openai.analyze(
      { apiKey: 'k', model: 'm', baseUrl: 'http://localhost:1234/v1/' },
      image,
      'x'
    )
    expect(r.output.biome_id).toBe('minecraft:plains')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({
      type: 'json_object'
    })
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('Gemini: inline image + JSON schema, key in header (never in the URL)', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] })
    )
    const r = await PROVIDERS.gemini.analyze(
      { apiKey: 'AIza', model: 'models/gemini-x' },
      image,
      'x'
    )
    expect(r.model).toBe('gemini-x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/models/gemini-x:generateContent')
    expect(url).not.toContain('AIza')
    expect(init.headers['x-goog-api-key']).toBe('AIza')
    expect(JSON.parse(init.body).generationConfig.responseJsonSchema).toBeTruthy()
  })

  it('Ollama: no key needed, local URL, schema as format', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ model: 'qwen2.5vl', message: { content: JSON.stringify(output) } })
    )
    const r = await PROVIDERS.ollama.analyze({ apiKey: null, model: 'qwen2.5vl' }, image, 'x')
    expect(r.output.mobs[0].count).toBe(2)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/api/chat')
    expect(JSON.parse(init.body).messages[1].images).toEqual(['AAAA'])
  })

  it('explains common failures in plain Spanish', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'bad key' } }, 401))
    await expect(PROVIDERS.gemini.analyze({ apiKey: 'x', model: 'm' }, image, 'x')).rejects.toThrow(
      /clave inválida/
    )
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(
      PROVIDERS.ollama.analyze({ apiKey: null, model: 'm' }, image, 'x')
    ).rejects.toThrow(/No se pudo conectar con Ollama/)
    await expect(
      PROVIDERS.openai.analyze({ apiKey: null, model: 'm' }, image, 'x')
    ).rejects.toThrow(/Falta la clave/)
    fetchMock.mockResolvedValueOnce(
      json({ model: 'x', choices: [{ message: { content: '{"nope":1}' } }] })
    )
    await expect(PROVIDERS.openai.analyze({ apiKey: 'k', model: 'm' }, image, 'x')).rejects.toThrow(
      /formato esperado/
    )
  })

  it('lists models (vision-capable Gemini models, Ollama tags)', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        models: [
          { name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }
        ]
      })
    )
    expect(await PROVIDERS.gemini.listModels({ apiKey: 'k', model: '' })).toEqual(['gemini-a'])
    fetchMock.mockResolvedValueOnce(json({ models: [{ name: 'qwen2.5vl:7b' }] }))
    expect(await PROVIDERS.ollama.listModels({ apiKey: null, model: '' })).toEqual(['qwen2.5vl:7b'])
  })
})
