(async () => {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = chrome.runtime.getURL("style.css");
  document.head.appendChild(css);

  const ui = document.createElement("div");
  ui.className = "ceo-ui";
ui.innerHTML = `
  <h2>🚀 CEO Crawler</h2>
  <input type="file" id="uploadCsv" accept=".csv" />
  <button id="startCrawl">▶️ Bắt đầu</button>
  <button id="exportCsv">💾 Export CSV</button>
  <button id="clearData">🗑️ Xóa dữ liệu</button>
  <div id="status"></div>
  <div class="table-container">
    <table id="resultTable">
      <thead><tr><th>Company</th><th>CEO</th><th>LinkedIn</th><th>Facebook</th><th>X</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
`;
  document.body.appendChild(ui);

  let companies = [], results = [];

  chrome.storage.local.get(["ceoCompanies", "ceoResults"], (data) => {
    if (data.ceoCompanies) companies = data.ceoCompanies;
    if (data.ceoResults) {
      results = data.ceoResults.map((r) => {
        const row = addResultRow(r);
        updateRowLink(row, r.linkedin, "linkedin.com");
        updateRowLink(row, r.facebook, "facebook.com");
        updateRowLink(row, r.x, "x.com");
        return row;
      });
    }
    document.getElementById("status").innerText = `🔁 Reloaded ${companies.length} companies`;
  });

  function saveData() {
    chrome.storage.local.set({
      ceoCompanies: companies,
      ceoResults: results.map(r => ({
        company: r.company, ceo: r.ceo,
        linkedin: r.linkedin, facebook: r.facebook, x: r.x
      }))
    });
  }

  function addResultRow({ company, ceo, linkedin, facebook, x }) {
    const tbody = document.querySelector("#resultTable tbody");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${company}</td><td>${ceo}</td>
      <td class="linkedin"></td><td class="facebook"></td><td class="x"></td>`;
    tbody.appendChild(tr);
    return { el: tr, company, ceo, linkedin, facebook, x };
  }

  function updateRowLink(row, link, domain) {
    if (link && link.startsWith("https://")) {
      row.el.querySelector("." + domain.split(".")[0]).innerHTML = `<a href="${link}" target="_blank">${link}</a>`;
      row[domain.split(".")[0]] = link;
    }
  }

  document.getElementById("uploadCsv").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      companies = reader.result.split(/\r?\n/).filter(x => x.trim() !== "");
      document.getElementById("status").innerText = `📄 Loaded ${companies.length} companies`;
      saveData();
    };
    reader.readAsText(file);
  });

  document.getElementById("exportCsv").addEventListener("click", () => {
    const rows = [["Company", "CEO", "LinkedIn", "Facebook", "X"]];
    for (const r of results) {
      rows.push([r.company, r.ceo, r.linkedin || "", r.facebook || "", r.x || ""]);
    }
    const csv = rows.map(r => r.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ceo_results.csv";
    a.click();
  });

  document.getElementById("clearData").addEventListener("click", () => {
    companies = [];
    results = [];
    chrome.storage.local.remove(["ceoCompanies", "ceoResults"], () => {
      document.querySelector("#resultTable tbody").innerHTML = "";
      document.getElementById("status").innerText = "🗑️ Đã xóa toàn bộ dữ liệu";
      saveData();
    });
  });

document.getElementById("startCrawl").addEventListener("click", async () => {
  document.getElementById("status").innerText = "🕵️ Crawling...";
  for (const company of companies) {
    const query = `${company} CEO name 2025`;
    const input = document.querySelector("textarea#sb_form_q") || document.querySelector("input[name='q']");
    if (!input) {
      document.getElementById("status").innerText = "❌ Không tìm thấy ô tìm kiếm";
      continue;
    }
    input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const searchButton = document.querySelector("#sb_form_go") || document.querySelector("button[type='submit']");
    if (searchButton) {
      searchButton.click();
      await new Promise(r => setTimeout(r, 4000));
    } else {
      document.getElementById("status").innerText = "❌ Không tìm thấy nút tìm kiếm";
      continue;
    }

    // Wait for search results
    await new Promise(r => {
      const checkResult = setInterval(() => {
        const results = document.querySelectorAll(".b_algo");
        if (results.length > 0) {
          clearInterval(checkResult);
          r();
        }
      }, 500);
      setTimeout(() => {
        clearInterval(checkResult);
        r();
      }, 6000);
    });

    // Extract HTML from search results
    let html = "";
    const algoResults = document.querySelectorAll(".b_algo");
    if (algoResults.length > 0) {
      html = Array.from(algoResults).map(result => {
        const link = result.querySelector("a")?.href || "";
        const text = result.textContent || "";
        return `${link}\n${text}`;
      }).join("\n").slice(0, 5000);
    } else {
      const copilotAnswer = document.querySelector(".copilot-answer, .rms_answer_container");
      if (copilotAnswer) {
        html = copilotAnswer.outerHTML.slice(0, 5000);
      }
    }
    const ceo = await askGemini(`Trích xuất tên CEO hiện tại của công ty ${company} từ nội dung HTML sau (chỉ phần body, tối đa 5000 ký tự):\n${html}\nChỉ trả lời tên duy nhất hoặc trả lời 'Không tìm thấy' nếu không có.`, "models/gemma-3-12b-it");

    const row = addResultRow({ company, ceo: ceo || "Không tìm thấy", linkedin: "", facebook: "", x: "" });
    results.push(row);
    saveData();

    // Search for social media profiles
    for (const domain of ["linkedin", "facebook", "x"]) { // Changed "twitter" to "x"
      const searchQuery = `${domain} of ${ceo} CEO ${company}`;
      const input = document.querySelector("textarea#sb_form_q") || document.querySelector("input[name='q']");
      if (!input) {
        document.getElementById("status").innerText = `❌ Không tìm thấy ô tìm kiếm cho ${domain}`;
        continue;
      }
      input.value = searchQuery;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const searchButton = document.querySelector("#sb_form_go") || document.querySelector("button[type='submit']");
      if (searchButton) {
        searchButton.click();
        await new Promise(r => setTimeout(r, 4000));
      } else {
        document.getElementById("status").innerText = `❌ Không tìm thấy nút tìm kiếm cho ${domain}`;
        continue;
      }

      // Wait for search results
      await new Promise(r => {
        const checkResult = setInterval(() => {
          const results = document.querySelectorAll(".b_algo");
          if (results.length > 0) {
            clearInterval(checkResult);
            r();
          }
        }, 500);
        setTimeout(() => {
          clearInterval(checkResult);
          r();
        }, 6000);
      });

      // Extract HTML from social media search results
      let socialHTML = "";
      const algoResults = document.querySelectorAll(".b_algo");
      if (algoResults.length > 0) {
        socialHTML = Array.from(algoResults).map(result => {
          const link = result.querySelector("a")?.href || "";
          const text = result.textContent || "";
          return `${link}\n${text}`;
        }).join("\n").slice(0, 5000);
      } else {
        const copilotAnswer = document.querySelector(".copilot-answer, .rms_answer_container");
        if (copilotAnswer) {
          socialHTML = copilotAnswer.outerHTML.slice(0, 5000);
        }
      }
      const prompt = `Dựa trên nội dung HTML sau (tối đa 5000 ký tự, chỉ phần body), hãy trích xuất **một link duy nhất** đến **tài khoản cá nhân chính thức** của CEO trên ${domain}:

          ${socialHTML}

          🔎 Yêu cầu:
          1. Chỉ chọn link bắt đầu bằng:
            - 'https://${domain}.com/' hoặc
            - 'https://www.${domain}.com/'
          2. Link phải là **hồ sơ cá nhân** (ví dụ):
            - LinkedIn: 'https://www.linkedin.com/in/username'
            - Facebook: 'https://facebook.com/username'
            - X: 'https://x.com/username' hoặc 'https://twitter.com/username'
          3. **Không chấp nhận** link:
            - bài viết (posts, status, articles…)
            - trang công ty, nhóm, page, tổ chức
            - link chứa /company/, /status/, /posts/, v.v.
          4. Nếu có nhiều link phù hợp, hãy chọn link **đầu tiên**.
          📌 Nếu không tìm thấy link phù hợp, hãy trả lời đúng **'Không tìm thấy'**.

          🎯 Trả lời:
          - Chỉ 1 link duy nhất **hoặc**
          - 'Không tìm thấy' (không giải thích thêm).`;
      const link = await askGemini(prompt, "models/gemma-3-12b-it");
      updateRowLink(row, link || "Không tìm thấy", `${domain}.com`);
      saveData();
    }
  }
  document.getElementById("status").innerText = `✅ Hoàn tất ${results.length} kết quả`;
});

  function fetchHTML(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "fetchHTML", url }, (res) => resolve(res.html || ""));
    });
  }

  function askGemini(prompt, model = "models/gemma-3-12b-it") {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "askGemini", prompt, model }, (res) => resolve(res.answer));
    });
  }
})();