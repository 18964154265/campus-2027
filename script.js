/* 2027届秋招发车榜 - 前端逻辑（原生 JS，无依赖） */
(function () {
  let DATA = null;
  let filters = { cat: "all", city: "all", keyword: "" };

  // ---------- 数据加载 ----------
  fetch("data.json?t=" + Date.now())
    .then(function (res) { return res.json(); })
    .then(function (json) {
      DATA = json;
      document.getElementById("lastUpdated").textContent = json.lastUpdated;
      document.getElementById("notice").textContent = json.notice || "";
      renderDepartures();
      renderCompanies();
      renderTimeline();
      renderTable();
      renderWindows();
      renderCity();
    })
    .catch(function (err) {
      document.getElementById("lastUpdated").textContent = "加载失败";
      console.error(err);
    });

  // ---------- Tab 切换 ----------
  document.getElementById("tabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
  });

  // ---------- 筛选 ----------
  document.getElementById("categoryFilters").addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    this.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    filters.cat = chip.dataset.cat;
    renderCompanies();
  });

  document.getElementById("cityFilters").addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    this.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    filters.city = chip.dataset.city;
    renderCompanies();
  });

  document.getElementById("searchBox").addEventListener("input", function () {
    filters.keyword = this.value.trim();
    renderCompanies();
  });

  // ---------- 工具 ----------
  function statusClass(status) {
    if (status.indexOf("已开启") >= 0 || status.indexOf("开放中") >= 0) return "open";
    if (status.indexOf("滚动") >= 0) return "rolling";
    return "soon";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(u) {
    return u && /^https:\/\//.test(u) ? u : "";
  }

  // ---------- 签名元素：发车榜（仅显示已开启/滚动开放的批次） ----------
  function renderDepartures() {
    var open = DATA.companies.filter(function (c) {
      return statusClass(c.status) !== "soon";
    });
    var html = open.map(function (c) {
      var url = safeUrl(c.channelUrl);
      return (
        '<a class="dep-row" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="dep-name">' + esc(c.name) + "</span>" +
          '<span class="dep-batch">' + esc(c.batch) + "</span>" +
          '<span class="dep-status">正在检票</span>' +
          '<span class="dep-deadline">' + esc(c.deadline) + "</span>" +
          '<span class="dep-go">去投递 →</span>' +
        "</a>"
      );
    }).join("");
    document.getElementById("departures").insertAdjacentHTML("beforeend", html);
  }

  // ---------- 公司卡片（整卡可点击，跳官方投递页） ----------
  function renderCompanies() {
    if (!DATA) return;
    var list = DATA.companies.filter(function (c) {
      if (filters.cat !== "all" && c.category !== filters.cat) return false;
      if (filters.city !== "all" && !c.cities.some(function (city) { return city.indexOf(filters.city) >= 0; })) return false;
      if (filters.keyword && c.name.indexOf(filters.keyword) < 0) return false;
      return true;
    });

    var html = list.map(function (c, idx) {
      var url = safeUrl(c.channelUrl);
      var cityTags = c.cities.map(function (city) {
        var hot = ["上海", "深圳", "香港"].some(function (k) { return city.indexOf(k) >= 0; });
        return '<span class="city-tag' + (hot ? " hot" : "") + '">' + esc(city) + "</span>";
      }).join("");

      // 岗位直投区：优先渲染抓取到的真实岗位（按分类分组，base 沪/港）
      var jobsHtml = "";
      var hasRealJobs = c.jobCategories && c.jobCategories.some(function (g) { return g.jobs && g.jobs.length; });
      if (hasRealJobs) {
        jobsHtml =
          '<div class="jobcats">' +
            '<div class="jobcats-head">岗位直投<em>base 上海/香港 · 抓取于 ' + esc(c.jobsFetchedAt || DATA.lastUpdated) + "</em></div>" +
            c.jobCategories.map(function (g, gi) {
              if (!g.jobs || !g.jobs.length) return "";
              return (
                '<div class="jobcat">' +
                  '<span class="jobcat-name p' + gi + '">' + esc(g.name) + "</span>" +
                  '<ul class="jobcat-list">' +
                  g.jobs.map(function (j) {
                    var ju = safeUrl(j.url);
                    if (!ju) return "";
                    return (
                      '<li class="jobcat-li"><a class="job-link item" href="' + esc(ju) + '" target="_blank" rel="noopener noreferrer">' +
                        '<span class="jl-city">' + esc(j.city) + "</span>" + esc(j.title) + " ↗</a>" +
                        '<button class="fav-btn" type="button" title="收藏此岗位" aria-label="收藏此岗位"' +
                          ' data-company="' + esc(c.name) + '" data-title="' + esc(j.title) + '"' +
                          ' data-city="' + esc(j.city) + '" data-category="' + esc(g.name) + '"' +
                          ' data-url="' + esc(ju) + '">☆</button></li>'
                    );
                  }).join("") +
                  "</ul>" +
                "</div>"
              );
            }).join("") +
          "</div>";
      } else if (c.jobLinks && c.jobLinks.length) {
        // 兜底：官网筛选入口（该公司官网暂无法直接抓取具体岗位）
        jobsHtml =
          '<div class="jobcats">' +
            '<div class="jobcats-head">岗位直投<em>官网筛选入口（暂无沪/港岗位抓取源）</em></div>' +
            '<div class="job-links">' +
            c.jobLinks.map(function (j) {
              var ju = safeUrl(j.url);
              if (!ju) return "";
              return (
                '<a class="job-link" href="' + esc(ju) + '" target="_blank" rel="noopener noreferrer" ' +
                  'aria-label="' + esc(c.name) + " " + esc(j.label) + '">' +
                  esc(j.label) + " ↗</a>"
              );
            }).join("") +
            "</div>" +
          "</div>";
      }

      return (
        '<div class="company-card" data-url="' + esc(url) + '" tabindex="0" role="link" ' +
          'aria-label="' + esc(c.name) + '：前往官方投递页">' +
          '<div class="card-head"><h3>' + esc(c.name) + '</h3>' +
          '<span class="badge cat-' + esc(c.category) + '">' + esc(c.category) + "</span></div>" +
          '<span class="status ' + statusClass(c.status) + '">' + esc(c.status) + "</span>" +
          "<dl>" +
            "<dt>开启时间</dt><dd class=\"mono\">" + esc(c.openDate) + "</dd>" +
            "<dt>截止时间</dt><dd class=\"mono\">" + esc(c.deadline) + "</dd>" +
            "<dt>投递渠道</dt><dd>" + esc(c.channel) + "</dd>" +
            "<dt>产品/运营岗位</dt><dd>" + esc(c.positions) + "</dd>" +
            "<dt>能力要求</dt><dd>" + esc(c.skills) + "</dd>" +
            "<dt>笔试/面试流程</dt><dd>" + esc(c.process) + "</dd>" +
          "</dl>" +
          jobsHtml +
          '<div class="city-tags">' + cityTags + "</div>" +
          '<p class="tips">' + esc(c.tips) + "</p>" +
          '<div class="card-cta"><span>去官方投递 →</span></div>' +
        "</div>"
      );
    }).join("");

    var listEl = document.getElementById("companyList");
    listEl.innerHTML =
      html || '<p style="color:#66727E">没有符合筛选条件的公司。</p>';

    // 整卡点击跳官方投递页；点击内部岗位直投链接时不触发整卡跳转
    if (!listEl.dataset.bound) {
      listEl.dataset.bound = "1";
      listEl.addEventListener("click", function (e) {
        if (e.target.closest(".job-link") || e.target.closest(".fav-btn")) return; // 岗位链接/收藏按钮自行处理
        var card = e.target.closest(".company-card");
        if (card && card.dataset.url) window.open(card.dataset.url, "_blank", "noopener");
      });
      listEl.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" || e.target.closest(".job-link") || e.target.closest(".fav-btn")) return;
        var card = e.target.closest(".company-card");
        if (card && card.dataset.url) window.open(card.dataset.url, "_blank", "noopener");
      });
    }
  }

  // ---------- 时间线 ----------
  function renderTimeline() {
    document.getElementById("timelineList").innerHTML = DATA.timeline.map(function (t) {
      return (
        '<div class="timeline-item">' +
          '<span class="period">' + esc(t.period) + '</span>' +
          '<span class="phase">' + esc(t.phase) + "</span>" +
          "<p>" + esc(t.events) + "</p>" +
        "</div>"
      );
    }).join("");
  }

  // ---------- 对比表格（整行可点击） ----------
  function rowJobLinks(c) {
    if (!c.jobLinks || !c.jobLinks.length) return "";
    return c.jobLinks.map(function (j) {
      var ju = safeUrl(j.url);
      if (!ju) return "";
      var short = j.label.indexOf("产品") >= 0 || j.label.indexOf("品牌") >= 0 ? "产品" : "运营";
      return '<a class="job-link sm" href="' + esc(ju) + '" target="_blank" rel="noopener noreferrer" ' +
             'aria-label="' + esc(c.name) + " " + esc(j.label) + '">' + short + " ↗</a>";
    }).join("");
  }

  function renderTable() {
    var tbody = document.querySelector("#compareTable tbody");
    tbody.innerHTML = DATA.companies.map(function (c, i) {
      return (
        '<tr data-idx="' + i + '" tabindex="0" role="link" aria-label="' + esc(c.name) + '：前往官方投递页">' +
          "<td>" + esc(c.name) + "</td>" +
          "<td>" + esc(c.category) + "</td>" +
          '<td><span class="status ' + statusClass(c.status) + '">' + esc(c.status) + "</span></td>" +
          '<td class="mono">' + esc(c.openDate) + "</td>" +
          '<td class="mono">' + esc(c.deadline) + "</td>" +
          "<td>" + esc(c.salary) + "</td>" +
          "<td>" + esc(c.cities.join("、")) + "</td>" +
          '<td class="td-go"><span class="row-go">官网 →</span>' + rowJobLinks(c) + "</td>" +
        "</tr>"
      );
    }).join("");

    function go(tr) {
      var c = DATA.companies[Number(tr.dataset.idx)];
      var url = c && safeUrl(c.channelUrl);
      if (url) window.open(url, "_blank", "noopener");
    }
    tbody.addEventListener("click", function (e) {
      if (e.target.closest(".job-link")) return; // 岗位直投链接自行处理
      var tr = e.target.closest("tr[data-idx]");
      if (tr) go(tr);
    });
    tbody.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.target.closest(".job-link")) return;
      var tr = e.target.closest("tr[data-idx]");
      if (tr) go(tr);
    });
  }

  // ---------- 投递窗口 ----------
  function renderWindows() {
    document.getElementById("windowList").innerHTML = DATA.windows.map(function (w) {
      return '<div class="window-card"><h3>' + esc(w.title) + "</h3><p>" + esc(w.detail) + "</p></div>";
    }).join("");
  }

  // ---------- 城市站台 ----------
  function renderCity() {
    var html = "";
    for (var city in DATA.cityFocus) {
      html += '<div class="city-card"><h3>' + esc(city) +
              "</h3><p>" + esc(DATA.cityFocus[city]) + "</p></div>";
    }
    document.getElementById("cityList").innerHTML = html;
  }
})();
