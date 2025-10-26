// Serverless function: יצירת שאלות אמריקאיות מ־GPT-4o
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text = "", numQuestions = 8, difficulty = "בינוני" } = req.body || {};
    if (!text.trim()) return res.status(400).json({ error: "missing text" });

    const apiKey = req.headers["x-api-key"] || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(401).json({ error: "missing OPENAI_API_KEY" });

    const system = `
את/ה מחולל/ת מבחן בעברית. הפק(י) רק JSON תקין:
{
  "questions": [
    {
      "q": "ניסוח השאלה",
      "options": ["תשובה א", "תשובה ב", "תשובה ג", "תשובה ד"],
      "answer": 0..3,            // אינדקס נכון
      "topic": "נושא/פרק",
      "explanation": "הסבר קצר"
    }, ...
  ]
}
כל השאלות אמריקאיות, ללא טקסט מיותר, מותאם לרמת קושי: ${difficulty}.
`;

    const prompt = `טקסט המקור לשאיבה:\n"""\n${text.slice(0, 35_000)}\n"""\n
צור ${numQuestions} שאלות מגוונות, אל תחזור מילה במילה על המקור.`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.4,
        max_output_tokens: 2000,
        input: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({ error: "OpenAI error", detail: data });
    }

    // התשובה מגיעה ב-choices[0].message.content[0].text או כ-field text
    const content = (data.output && data.output[0] && data.output[0].content && data.output[0].content[0] && data.output[0].content[0].text)
      || data.content?.[0]?.text
      || data.output_text
      || data.response
      || JSON.stringify(data);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // נסה לחלץ JSON מתוך טקסט
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return res.status(500).json({ error: "bad AI format", raw: content });
    }

    // וידוא מבנה תשובות
    parsed.questions = parsed.questions.slice(0, numQuestions).map(q => ({
      q: String(q.q || "").trim(),
      options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
      answer: Number.isInteger(q.answer) ? q.answer : 0,
      topic: String(q.topic || "").trim(),
      explanation: String(q.explanation || "").trim()
    })).filter(q => q.q && q.options.length === 4);

    return res.json({ questions: parsed.questions });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
};
