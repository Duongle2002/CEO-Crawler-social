const GEMINI_API_KEY = "AIzaSyCtxEGJDvhpzMpVXO-3-irpAwcCGoiM-Ws"; // 🔑 Thay bằng key thật

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetchHTML") {
    fetch(msg.url)
      .then(res => res.text())
      .then(html => {
        const bodyOnly = html.split("<body")[1]?.split("</body>")[0] || "";
        const limitedBody = ("<body" + bodyOnly + "</body>").slice(0, 5000);
        sendResponse({ html: limitedBody });
      })
      .catch(() => sendResponse({ html: "" }));
    return true;
  }

  if (msg.action === "askGemini") {
    fetch("https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: msg.prompt }] }]
      })
    })
      .then(res => res.json())
      .then(json => {
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        sendResponse({ answer: text.trim() });
      })
      .catch(() => sendResponse({ answer: "" }));
    return true;
  }
});