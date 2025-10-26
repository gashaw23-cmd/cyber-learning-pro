*** /dev/null
--- a/api/extract-text.js
@@ -0,0 +1,131 @@
+// api/extract-text.js
+// Supports: PDF, DOCX, TXT
+// Request body: { filename: string, base64: string }
+
+const { Buffer } = require('buffer');
+
+async function parsePdf(buffer) {
+  const pdfParse = require('pdf-parse'); // lazy require
+  const data = await pdfParse(buffer);
+  return (data.text || '').trim();
+}
+
+async function parseDocx(buffer) {
+  const mammoth = require('mammoth'); // lazy require
+  const { value } = await mammoth.extractRawText({ buffer });
+  return (value || '').trim();
+}
+
+function parseTxt(buffer) {
+  return buffer.toString('utf8').trim();
+}
+
+function extOf(name = '') {
+  const dot = name.lastIndexOf('.');
+  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
+}
+
+module.exports = async (req, res) => {
+  try {
+    if (req.method !== 'POST') {
+      res.status(405).json({ error: 'Method not allowed' });
+      return;
+    }
+
+    const { filename, base64 } = req.body || {};
+    if (!filename || !base64) {
+      res.status(400).json({ error: 'Missing filename/base64' });
+      return;
+    }
+
+    // decode base64 -> Buffer
+    let buffer;
+    try {
+      buffer = Buffer.from(base64, 'base64');
+    } catch {
+      res.status(400).json({ error: 'Invalid base64' });
+      return;
+    }
+
+    // size guard
+    const MAX_BYTES = 20 * 1024 * 1024; // 20MB
+    if (buffer.length > MAX_BYTES) {
+      res.status(413).json({ error: 'File too large (max 20MB)' });
+      return;
+    }
+
+    const ext = extOf(filename);
+    let text = '';
+
+    if (ext === 'pdf') {
+      text = await parsePdf(buffer);
+    } else if (ext === 'docx') {
+      text = await parseDocx(buffer);
+    } else if (ext === 'txt') {
+      text = parseTxt(buffer);
+    } else {
+      res.status(415).json({ error: `Unsupported file type: .${ext}` });
+      return;
+    }
+
+    // normalize & clamp
+    text = (text || '')
+      .replace(/\r/g, '')
+      .replace(/\t/g, ' ')
+      .replace(/[ \u00A0]{2,}/g, ' ')
+      .trim();
+
+    const HARD_LIMIT = 120_000; // ~120K chars
+    if (text.length > HARD_LIMIT) text = text.slice(0, HARD_LIMIT);
+
+    res.status(200).json({ text });
+  } catch (err) {
+    console.error('extract-text error:', err);
+    res.status(500).json({ error: 'extract failed' });
+  }
+};
+
+// body size hint (ignored if setup doesn’t use Next.js API routing)
+module.exports.config = {
+  api: {
+    bodyParser: {
+      sizeLimit: '25mb',
+    },
+  },
+};
