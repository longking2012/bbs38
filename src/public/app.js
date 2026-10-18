// 客户端：表情面板 + 图片上传 + 光标插入（零依赖）
(function () {
  var EMOJIS = ['😀','😂','🤣','😊','😍','😘','🤔','👍','👎','👏','🙏','💪','🎉','🔥','💯','❤️','💔','😢','😡','😴','🤯','🥳','😎','🤩','🥺','😱','🤝','✌️','🤙','👀','✨','⭐','🌈','🐱','🐶','🍔','⚽','🏀','📚','✏️','🎓','🎵','🎮','💡','📌','✅','❌','⚡','🎯','🎁','🆕'];
  function insertAtCursor(ta, text) {
    var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
  function setup(tools) {
    var ta = tools.parentElement.querySelector('.md-area');
    if (!ta) return;
    var eb = tools.querySelector('.emoji-btn');
    var panel = null;
    if (eb) eb.addEventListener('click', function () {
      if (panel) { panel.remove(); panel = null; return; }
      panel = document.createElement('div');
      panel.className = 'emoji-panel';
      EMOJIS.forEach(function (em) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'emoji-item'; b.textContent = em;
        b.addEventListener('click', function () { insertAtCursor(ta, em); panel.remove(); panel = null; });
        panel.appendChild(b);
      });
      tools.parentElement.appendChild(panel);
    });
    var ib = tools.querySelector('.img-btn input');
    if (ib) ib.addEventListener('change', function () {
      var f = ib.files && ib.files[0]; if (!f) return;
      var fd = new FormData(); fd.append('img', f);
      ib.value = '';
      var txt = tools.querySelector('.img-btn-text'); var orig = txt.textContent; txt.textContent = '⏳';
      fetch('/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          txt.textContent = orig;
          if (d.error) { alert(d.error); return; }
          insertAtCursor(ta, '![](' + d.url + ')');
        }).catch(function () { txt.textContent = orig; alert('上传失败'); });
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    // 茶馆推荐轮换
    var carousel = document.getElementById('recoCarousel');
    if (carousel) {
      var slides = carousel.querySelectorAll('.reco-slide');
      var nextBtn = document.getElementById('recoNext');
      var idx = 0;
      function showNext() {
        if (slides.length <= 1) return;
        slides[idx].classList.remove('active');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('active');
      }
      if (nextBtn) nextBtn.addEventListener('click', function (e) { e.preventDefault(); showNext(); });
      // 自动轮换 8 秒
      if (slides.length > 1) setInterval(showNext, 8000);
    }
    // 汉堡菜单切换
    var navToggle = document.getElementById('navToggle');
    var navMobile = document.getElementById('navMobile');
    if (navToggle && navMobile) {
      navToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        navMobile.classList.toggle('open');
        navToggle.classList.toggle('active');
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('#navMobile') && !e.target.closest('#navToggle')) {
          navMobile.classList.remove('open');
          navToggle.classList.remove('active');
        }
      });
    }
    [].forEach.call(document.querySelectorAll('.editor-tools'), setup);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.emoji-panel') && !e.target.closest('.emoji-btn')) {
        var p = document.querySelector('.emoji-panel'); if (p) p.remove();
      }
      // 图片点击放大
      var img = e.target.closest('.post-img');
      if (img) {
        var lb = document.createElement('div');
        lb.className = 'lightbox';
        var lbImg = document.createElement('img');
        lbImg.src = img.src;
        lb.appendChild(lbImg);
        lb.addEventListener('click', function () { lb.remove(); });
        document.body.appendChild(lb);
        return;
      }
      // 引用回复
      var qb = e.target.closest('.quote-btn');
      if (qb) {
        var postEl = qb.closest('.post');
        var contentEl = postEl ? postEl.querySelector('.post-content') : null;
        var text = contentEl ? contentEl.textContent.trim().slice(0, 200) : '';
        var ta = document.querySelector('.reply-form textarea');
        if (ta && text) { insertAtCursor(ta, '> ' + text + '\n\n'); ta.focus(); }
      }
    });
  });
})();
