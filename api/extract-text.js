// חילוץ טקסט מ־PDF / DOCX / TXT (Base64)
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { filename = "", base64 = "" } = req.body || {};
    if (!filename || !base64) return res.status(400).json({ error: "filename and base64 required" });

    const buf = Buffer.from(base64, "base64");
    const ext = filename.toLowerCase().split(".").pop();

    if (ext === "pdf") {
      const data = await pdfParse(buf);
      return res.json({ text: data.text || "" });
    } else if (ext === "docx") {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return res.json({ text: value || "" });
    } else if (ext === "txt") {
      return res.json({ text: buf.toString("utf8") });
    } else {
      return res.status(400).json({ error: "unsupported extension" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "extract failed" });
  }
};
