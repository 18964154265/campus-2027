/* 2027届秋招发车榜 - 用户系统与收藏夹（Supabase） */
(function () {
  "use strict";

  var SUPABASE_URL = "https://abbtwchhojtvpjffnhbk.supabase.co";
  var SUPABASE_KEY = "sb_publishable_wI7lV-ZrP-mh0qEooKUsOQ_kWYmd-1i";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("supabase-js 未加载，用户系统不可用");
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var currentUser = null;
  var pendingJob = null; // 待收藏的岗位（未登录时点了收藏，登录后继续）

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function show(el) { el.hidden = false; el.style.display = "flex"; }
  function hide(el) { el.hidden = true; el.style.display = "none"; }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function friendlyErr(err) {
    var m = (err && (err.message || err.error_description)) || "操作失败，请重试";
    var map = [
      [/invalid login credentials/i, "邮箱或密码不正确"],
      [/user already registered/i, "该邮箱已注册，请直接登录"],
      [/email not confirmed/i, "邮箱尚未验证，请先到邮箱点击确认链接"],
      [/password should be at least/i, "密码至少需要 6 位"],
      [/rate limit/i, "操作太频繁，请稍后再试"],
      [/duplicate key.*favorites_user_id_name/i, "已存在同名收藏夹"],
      [/duplicate key.*favorite_jobs_folder_id_url/i, "该岗位已在这个收藏夹中"],
      [/is invalid/i, "邮箱格式不正确"]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(m)) return map[i][1];
    return m;
  }

  // ---------- 顶部登录区 ----------
  function renderAuthArea() {
    var area = $("authArea");
    if (currentUser) {
      area.innerHTML =
        '<button class="auth-btn user" id="gotoProfile" type="button" title="进入个人主页">👤 ' +
        esc(currentUser.email.split("@")[0]) + "</button>" +
        '<button class="auth-btn ghost" id="logoutBtn" type="button">退出</button>';
      $("gotoProfile").addEventListener("click", function () { switchTab("profile"); });
      $("logoutBtn").addEventListener("click", doLogout);
    } else {
      area.innerHTML = '<button class="auth-btn" id="loginBtn" type="button">登录 / 注册</button>';
      $("loginBtn").addEventListener("click", function () { openAuthModal("login"); });
    }
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    if (name === "profile") renderProfile();
  }

  // 个人主页 Tab 点击时刷新内容
  $("profileTab").addEventListener("click", function () { renderProfile(); });

  // ---------- 登录/注册弹窗 ----------
  var authMode = "login";

  function openAuthModal(mode, hint) {
    hide($("favModal")); // 互斥：同一时间只允许一个弹窗
    authMode = mode || "login";
    updateAuthModalUI();
    $("authMsg").textContent = hint || "";
    $("authMsg").className = "auth-msg" + (hint ? " info" : "");
    show($("authModal"));
    setTimeout(function () { $("authEmail").focus(); }, 50);
  }
  function closeAuthModal() { hide($("authModal")); $("authForm").reset(); $("authMsg").textContent = ""; }

  function updateAuthModalUI() {
    document.querySelectorAll(".auth-mode").forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === authMode);
    });
    $("authSubmit").textContent = authMode === "login" ? "登 录" : "注 册";
    $("authPassword").autocomplete = authMode === "login" ? "current-password" : "new-password";
  }

  document.querySelectorAll(".auth-mode").forEach(function (b) {
    b.addEventListener("click", function () { authMode = b.dataset.mode; updateAuthModalUI(); });
  });
  $("authModalClose").addEventListener("click", closeAuthModal);
  $("authModal").addEventListener("click", function (e) { if (e.target === this) closeAuthModal(); });

  $("authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("authEmail").value.trim();
    var password = $("authPassword").value;
    var msg = $("authMsg");
    var btn = $("authSubmit");
    btn.disabled = true;
    msg.className = "auth-msg";
    msg.textContent = authMode === "login" ? "登录中…" : "注册中…";

    var p = authMode === "login"
      ? sb.auth.signInWithPassword({ email: email, password: password })
      : sb.auth.signUp({ email: email, password: password });

    p.then(function (res) {
      btn.disabled = false;
      if (res.error) {
        msg.className = "auth-msg error";
        msg.textContent = friendlyErr(res.error);
        return;
      }
      if (authMode === "register" && res.data && res.data.user && !res.data.session) {
        // 开了邮箱确认：需要去邮箱点链接
        msg.className = "auth-msg info";
        msg.textContent = "注册成功！确认邮件已发送到 " + email + "，请点击邮件中的链接完成验证后再登录。";
        authMode = "login";
        updateAuthModalUI();
        return;
      }
      closeAuthModal();
    });
  });

  function doLogout() {
    sb.auth.signOut().then(function () {
      currentUser = null;
      renderAuthArea();
      var pp = $("panel-profile");
      if (pp.classList.contains("active")) switchTab("companies");
    });
  }

  // ---------- 会话监听 ----------
  sb.auth.onAuthStateChange(function (_event, session) {
    currentUser = session ? session.user : null;
    renderAuthArea();
    if ($("panel-profile").classList.contains("active")) renderProfile();
    // 登录成功后若有待收藏岗位，自动继续收藏流程
    if (currentUser && pendingJob) {
      var job = pendingJob;
      pendingJob = null;
      setTimeout(function () { openFavModal(job); }, 300);
    }
  });
  sb.auth.getSession().then(function (res) {
    currentUser = res.data.session ? res.data.session.user : null;
    renderAuthArea();
    // 未登录时，进站先弹一次登录/注册弹窗（可关闭跳过；同一标签页会话内只弹一次）
    if (!currentUser && !sessionStorage.getItem("authPrompted")) {
      sessionStorage.setItem("authPrompted", "1");
      openAuthModal("login", "登录后可创建收藏夹、收藏心仪岗位（点 × 可先跳过）");
    }
  });

  // ---------- 收藏按钮（全站事件委托） ----------
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".fav-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var job = {
      company: btn.dataset.company || "",
      title: btn.dataset.title || "",
      city: btn.dataset.city || "",
      category: btn.dataset.category || "",
      url: btn.dataset.url || ""
    };
    if (!currentUser) {
      pendingJob = job;
      openAuthModal("login", "登录后即可收藏岗位（没有账号可切换到注册）");
      return;
    }
    openFavModal(job);
  });

  // ---------- 收藏弹窗 ----------
  var favJob = null;

  function openFavModal(job) {
    hide($("authModal")); // 互斥：同一时间只允许一个弹窗
    favJob = job;
    $("favJobDesc").innerHTML =
      '<span class="fjd-company">' + esc(job.company) + "</span> · " + esc(job.title) +
      (job.city ? ' <span class="fjd-city">' + esc(job.city) + "</span>" : "");
    $("favMsg").textContent = "";
    $("favNewForm").reset();
    $("favFolderList").innerHTML = '<p class="fav-loading">加载收藏夹…</p>';
    show($("favModal"));
    loadFoldersInto($("favFolderList"));
  }
  function closeFavModal() { hide($("favModal")); favJob = null; }
  $("favModalClose").addEventListener("click", closeFavModal);
  $("favModal").addEventListener("click", function (e) { if (e.target === this) closeFavModal(); });

  function loadFoldersInto(el) {
    sb.from("favorites").select("id,name,favorite_jobs(count)").order("created_at").then(function (res) {
      if (res.error) { el.innerHTML = '<p class="fav-loading">加载失败：' + esc(friendlyErr(res.error)) + "</p>"; return; }
      if (!res.data.length) {
        el.innerHTML = '<p class="fav-loading">还没有收藏夹，在下方新建一个吧 ↓</p>';
        return;
      }
      el.innerHTML = res.data.map(function (f) {
        var cnt = (f.favorite_jobs && f.favorite_jobs[0] && f.favorite_jobs[0].count) || 0;
        return '<button class="fav-folder" type="button" data-id="' + esc(f.id) + '">' +
               "📁 " + esc(f.name) + '<span class="ff-count">' + cnt + "</span></button>";
      }).join("");
    });
  }

  // 点击某个收藏夹 → 收藏进去
  $("favFolderList").addEventListener("click", function (e) {
    var fb = e.target.closest(".fav-folder");
    if (!fb || !favJob) return;
    saveJobTo(fb.dataset.id);
  });

  // 新建收藏夹并收藏
  $("favNewForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!favJob) return;
    var name = $("favNewName").value.trim();
    if (!name) { $("favMsg").textContent = "请输入收藏夹名称"; $("favMsg").className = "auth-msg error"; return; }
    sb.from("favorites").insert({ name: name }).select("id").single().then(function (res) {
      if (res.error) {
        $("favMsg").textContent = friendlyErr(res.error);
        $("favMsg").className = "auth-msg error";
        return;
      }
      saveJobTo(res.data.id);
    });
  });

  function saveJobTo(folderId) {
    var msg = $("favMsg");
    msg.className = "auth-msg";
    msg.textContent = "收藏中…";
    sb.from("favorite_jobs").insert({
      folder_id: folderId,
      company: favJob.company,
      title: favJob.title,
      city: favJob.city,
      category: favJob.category,
      url: favJob.url
    }).then(function (res) {
      if (res.error) {
        msg.className = "auth-msg error";
        msg.textContent = friendlyErr(res.error);
        return;
      }
      msg.className = "auth-msg ok";
      msg.textContent = "✓ 收藏成功";
      setTimeout(closeFavModal, 700);
    });
  }

  // ---------- 个人主页 ----------
  function renderProfile() {
    var box = $("profileContent");
    if (!currentUser) {
      box.innerHTML =
        '<div class="profile-guest">' +
          "<h2>👤 个人主页</h2>" +
          "<p>登录后可查看账号信息、创建收藏夹并管理收藏的岗位。</p>" +
          '<button class="auth-btn big" id="guestLoginBtn" type="button">登录 / 注册</button>' +
        "</div>";
      $("guestLoginBtn").addEventListener("click", function () { openAuthModal("login"); });
      return;
    }

    box.innerHTML =
      '<div class="profile-head">' +
        "<div>" +
          "<h2>👤 " + esc(currentUser.email) + "</h2>" +
          '<p class="profile-meta">注册于 <span class="mono">' + fmtDate(currentUser.created_at) + "</span></p>" +
        "</div>" +
        '<button class="auth-btn ghost" id="profileLogout" type="button">退出登录</button>' +
      "</div>" +
      '<div class="profile-folders-head">' +
        "<h3>我的收藏夹</h3>" +
        '<form class="fav-new inline" id="profileNewFolder">' +
          '<input type="text" id="profileNewName" maxlength="30" placeholder="新建收藏夹名称">' +
          "<button type=\"submit\">+ 新建</button>" +
        "</form>" +
      "</div>" +
      '<p class="auth-msg" id="profileMsg"></p>' +
      '<div id="folderContainer"><p class="fav-loading">加载中…</p></div>';

    $("profileLogout").addEventListener("click", doLogout);
    $("profileNewFolder").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("profileNewName").value.trim();
      if (!name) return;
      sb.from("favorites").insert({ name: name }).then(function (res) {
        if (res.error) { profileMsg(friendlyErr(res.error), true); return; }
        $("profileNewName").value = "";
        loadProfileFolders();
      });
    });
    loadProfileFolders();
  }

  function profileMsg(text, isErr) {
    var m = $("profileMsg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "auth-msg" + (isErr ? " error" : " ok");
    if (text) setTimeout(function () { if (m.textContent === text) { m.textContent = ""; } }, 3000);
  }

  function loadProfileFolders() {
    var box = $("folderContainer");
    if (!box) return;
    sb.from("favorites")
      .select("id,name,created_at,favorite_jobs(id,company,title,city,category,url,created_at)")
      .order("created_at")
      .then(function (res) {
        if (res.error) { box.innerHTML = '<p class="fav-loading">加载失败：' + esc(friendlyErr(res.error)) + "</p>"; return; }
        if (!res.data.length) {
          box.innerHTML =
            '<div class="folder-empty">还没有收藏夹。去「公司名单」里点岗位旁的 ☆ 收藏，或在上方直接新建一个。</div>';
          return;
        }
        box.innerHTML = res.data.map(function (f) {
          var jobs = f.favorite_jobs || [];
          jobs.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
          var jobsHtml = jobs.length
            ? '<ul class="folder-jobs">' + jobs.map(function (j) {
                return (
                  "<li>" +
                    '<a class="job-link item" href="' + esc(j.url) + '" target="_blank" rel="noopener noreferrer">' +
                      (j.city ? '<span class="jl-city">' + esc(j.city) + "</span>" : "") +
                      '<span class="fj-company">' + esc(j.company) + "</span>" + esc(j.title) + " ↗</a>" +
                    (j.category ? '<span class="fj-cat">' + esc(j.category) + "</span>" : "") +
                    '<button class="fj-del" type="button" data-jid="' + esc(j.id) + '" title="移出收藏夹">删除</button>' +
                  "</li>"
                );
              }).join("") + "</ul>"
            : '<p class="folder-empty small">这个收藏夹还是空的</p>';
          return (
            '<div class="folder-card" data-fid="' + esc(f.id) + '">' +
              '<div class="folder-head">' +
                '<h4>📁 ' + esc(f.name) + '<span class="ff-count">' + jobs.length + "</span></h4>" +
                '<div class="folder-ops">' +
                  '<button class="folder-op rename" type="button" data-fid="' + esc(f.id) + '" data-name="' + esc(f.name) + '">重命名</button>' +
                  '<button class="folder-op del" type="button" data-fid="' + esc(f.id) + '">删除</button>' +
                "</div>" +
              "</div>" +
              jobsHtml +
            "</div>"
          );
        }).join("");
      });
  }

  // 个人主页内的操作（事件委托）
  document.addEventListener("click", function (e) {
    // 删除收藏的岗位
    var delJob = e.target.closest(".fj-del");
    if (delJob) {
      sb.from("favorite_jobs").delete().eq("id", delJob.dataset.jid).then(function (res) {
        if (res.error) { profileMsg(friendlyErr(res.error), true); return; }
        loadProfileFolders();
      });
      return;
    }
    // 删除收藏夹
    var delFolder = e.target.closest(".folder-op.del");
    if (delFolder) {
      if (!window.confirm("删除该收藏夹会同时删除里面收藏的所有岗位，确定删除？")) return;
      sb.from("favorites").delete().eq("id", delFolder.dataset.fid).then(function (res) {
        if (res.error) { profileMsg(friendlyErr(res.error), true); return; }
        loadProfileFolders();
      });
      return;
    }
    // 重命名收藏夹
    var rename = e.target.closest(".folder-op.rename");
    if (rename) {
      var newName = window.prompt("输入新的收藏夹名称（1-30字）：", rename.dataset.name || "");
      if (newName == null) return;
      newName = newName.trim();
      if (!newName || newName.length > 30) { profileMsg("名称需为 1-30 个字符", true); return; }
      sb.from("favorites").update({ name: newName }).eq("id", rename.dataset.fid).then(function (res) {
        if (res.error) { profileMsg(friendlyErr(res.error), true); return; }
        loadProfileFolders();
      });
    }
  });

  // Esc 关闭弹窗
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("favModal").hidden) closeFavModal();
    else if (!$("authModal").hidden) closeAuthModal();
  });
})();
