export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { description, category } = req.body;

  if (!description || description.trim().length < 20) {
    return res.status(400).json({ error: 'Description too short' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `You are an expert YouTube title strategist. Generate exactly 10 compelling YouTube titles for the following video description.

Video Description: ${description}
Preferred Style: ${category}

Generate 2 titles in each of these 5 styles: Viral, Educational, Documentary, Storytelling, Business.

Rules:
- Each title must be under 70 characters (ideal for YouTube SEO)
- Use proven hooks: numbers, curiosity gaps, "how to", personal stories, controversy
- No clickbait that misleads — titles must reflect the actual content
- Vary the structure across titles (don't start them all the same way)

Respond ONLY with a valid JSON array. No explanation, no markdown, no backticks. Example format:
[
  {"title": "Your Title Here", "category": "Viral"},
  {"title": "Another Title", "category": "Educational"}
]`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip markdown fences if Gemini wraps response anyway
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let titles;
    try {
      titles = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse failed. Raw:', cleaned);
      return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
    }

    if (!Array.isArray(titles) || titles.length === 0) {
      return res.status(500).json({ error: 'Unexpected response format from AI.' });
    }

    // Sanitize output
    const sanitized = titles
      .filter(t => t.title && t.category)
      .map(t => ({
        title: String(t.title).slice(0, 120),
        category: String(t.category),
      }));

    return res.status(200).json({ titles: sanitized });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
