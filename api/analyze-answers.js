const fetch = require("node-fetch");

// מקבל {questions, userAnswers} ומחזיר ניתוח טקסטואלי קצר בעברית
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { questions = [], userAnswers = [] } = req.body || {};
    const apiKey = req.headers["x-api-key"] || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(401).json({ error: "missing OPENAI_API_KEY" });

    const score = questions.reduce((acc, q, i) => acc + (Number(userAnswers[i]) === Number(q.answer) ? 1 : 0), 0);
    const topicsWrong = [];
    questions.forEach((q, i) => {
      if (Number(userAnswers[i]) !== Number(q.answer)) topicsWrong.push(q.topic || "ללא נושא");
    });

    const system = "את/ה מחנך/ת סייבר. כתוב/כתבי ניתוח תמציתי בעברית, ממוקד וידידותי, עד 140 מילים.";
    const user = `ציון: ${score}/${questions.length}\nנושאים חלשים: ${topicsWrong.join(", ") || "לא זוהו"}\nתן 3 המלצות ממוספרות ללמידה.`

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.5,
        max_output_tokens: 400
      })
    });

    const data = await r.json();
    const text =
      (data.output && data.output[0]?.content?.[0]?.text) ||
      data.output_text || "تحليل לא זמין כרגע.";
    return res.json({ analysis: text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "analyze failed" });
  }
};
