/* CTool - 赞赏支持页面与每日一次的赞赏提示 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, getPref, setPref } = T;

  const SHOWN_KEY = 'sponsorNoticeShown';
  const DISMISSED_KEY = 'sponsorNoticeDismissed';
  const SPONSOR_TOOL_ID = 'sponsor';
  const WECHAT_QR = 'assets/sponsor-wechat.jpg';
  const ALIPAY_QR = 'assets/sponsor-alipay.png';

  /* 用本地日历日期作为「今天」，避免 UTC 与本地时区跨日偏差。 */
  function todayKey() {
    const now = new Date();
    return String(now.getFullYear()) + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  function isOnSponsorPage() {
    return location.hash.replace(/^#/, '') === SPONSOR_TOOL_ID;
  }

  let activeKeydown = null;

  function removeNotice() {
    if (activeKeydown) {
      document.removeEventListener('keydown', activeKeydown, true);
      activeKeydown = null;
    }
    const old = document.getElementById('sponsor-modal');
    if (old) old.remove();
  }

  function showNotice(options) {
    const settings = options || {};
    const preview = !!settings.preview;
    removeNotice();

    const overlay = document.createElement('div');
    overlay.className = 'sponsor-modal';
    overlay.id = 'sponsor-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sponsor-modal-title');
    overlay.innerHTML = `
      <div class="sponsor-modal-backdrop" data-sponsor-close></div>
      <div class="sponsor-modal-card" role="document">
        <button class="sponsor-modal-x" type="button" data-sponsor-close title="关闭" aria-label="关闭">×</button>
        <div class="sponsor-modal-mark" aria-hidden="true">♥</div>
        <h2 id="sponsor-modal-title">喜欢这个工具箱吗？</h2>
        <p>CTool 完全离线、免费、无广告，也不会上传任何数据。如果它帮你省下过一点时间，欢迎请作者喝杯咖啡，或者看看「底价接活开发」。</p>
        <p class="sponsor-modal-fine">这个提示每天只出现一次，关闭后当天不再打扰。</p>
        <div class="sponsor-modal-actions">
          <button class="btn btn-primary" type="button" id="sponsor-modal-go">去看看</button>
          <button class="btn" type="button" data-sponsor-close>今天不再提示</button>
        </div>
      </div>
    `;

    function close() {
      // 预览仅用于查看效果，不写入当天状态，避免影响正常的每日提示。
      if (!preview) setPref(DISMISSED_KEY, todayKey());
      removeNotice();
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        // 捕获阶段先处理，避免 Esc 冒泡到全局监听时把整个小窗一起收起。
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }

    overlay.addEventListener('click', (event) => {
      if (event.target.closest('[data-sponsor-close]')) {
        close();
        return;
      }
      if (event.target.closest('#sponsor-modal-go')) {
        close();
        if (typeof T.selectTool === 'function') T.selectTool(SPONSOR_TOOL_ID);
        else location.hash = '#' + SPONSOR_TOOL_ID;
      }
    });

    activeKeydown = onKeydown;
    document.addEventListener('keydown', onKeydown, true);
    document.body.appendChild(overlay);

    const focusTarget = $('#sponsor-modal-go', overlay);
    if (focusTarget) {
      try { focusTarget.focus(); } catch (_) { /* 某些嵌入式环境不允许聚焦，忽略。 */ }
    }
  }

  /* 每天最多提示一次；用户关闭后当天不再显示。 */
  function maybeShowNotice() {
    const today = todayKey();
    if (getPref(DISMISSED_KEY, '') === today) return false;
    if (getPref(SHOWN_KEY, '') === today) return false;
    if (isOnSponsorPage()) return false;

    setPref(SHOWN_KEY, today);
    showNotice();
    return true;
  }

  T.maybeShowSponsorNotice = maybeShowNotice;
  T.showSponsorNotice = showNotice;

  /* --------------------------------------------------------------------------
     赞赏页面
     -------------------------------------------------------------------------- */

  T.renderers.sponsor = function renderSponsor(root) {
    root.innerHTML = `
      <div class="stack sponsor-page">
        <section class="card sponsor-hero">
          <div class="card-body sponsor-hero-body">
            <div class="sponsor-hero-mark" aria-hidden="true">♥</div>
            <div class="sponsor-hero-text">
              <h2>请作者喝杯咖啡</h2>
              <p>CTool 完全离线、免费、没有广告，也不收集任何数据。如果它帮你省下过几分钟，欢迎随手赞赏一下，让这个小工具箱能一直更新下去。</p>
              <p class="sponsor-hero-fine">赞赏全凭自愿，不影响任何功能；所有工具永远免费、离线可用。</p>
            </div>
          </div>
        </section>

        <div class="tool-grid sponsor-qr-grid">
          <section class="card sponsor-qr-card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon" data-no-i18n>WX</span><h2>微信赞赏码</h2></div>
              <span class="badge">祝老板彩票中大奖！</span>
            </div>
            <div class="card-body">
              <a class="sponsor-qr-link" href="${WECHAT_QR}" target="_blank" rel="noopener" title="点击查看大图">
                <img class="sponsor-qr-img sponsor-qr-wechat" src="${WECHAT_QR}" alt="微信赞赏码" loading="lazy">
              </a>
              <p class="sponsor-qr-hint">微信「扫一扫」或长按识别 · 点击图片可放大</p>
            </div>
          </section>

          <section class="card sponsor-qr-card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon" data-no-i18n>支</span><h2>支付宝收款码</h2></div>
              <span class="badge">推荐使用支付宝</span>
            </div>
            <div class="card-body">
              <a class="sponsor-qr-link" href="${ALIPAY_QR}" target="_blank" rel="noopener" title="点击查看大图">
                <img class="sponsor-qr-img sponsor-qr-alipay" src="${ALIPAY_QR}" alt="支付宝收款码" loading="lazy">
              </a>
              <p class="sponsor-qr-hint">打开支付宝「扫一扫」 · 点击图片可放大</p>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>DEV</span><h2>底价接活开发</h2></div>
            <span class="badge">AI 辅助 · 快速交付</span>
          </div>
          <div class="card-body sponsor-service">
            <p class="sponsor-lead">除了这个工具箱，作者也接各类小型开发活儿。用 AI 辅助编码、人工逐项把关，把沟通和试错成本压下来，所以能给出很实在的价格——需求说清楚，就能开工。</p>

            <div class="sponsor-service-grid">
              <div class="sponsor-service-item">
                <h3>能做什么</h3>
                <ul>
                  <li>Chrome / Edge 浏览器扩展、油猴脚本</li>
                  <li>工具站、落地页、后台管理界面等前端项目</li>
                  <li>数据清洗、批量处理、格式转换类小工具</li>
                  <li>AI 接口接入、提示词与工作流封装</li>
                  <li>现有项目改功能、修 Bug、做离线化改造</li>
                </ul>
              </div>
              <div class="sponsor-service-item">
                <h3>怎么合作</h3>
                <ul>
                  <li>一句话说清需求、用途和期望效果即可</li>
                  <li>先评估并报一个总价，确认后再动手</li>
                  <li>小步交付，过程中随时可看可改</li>
                  <li>验收通过后交付源码与简要使用说明</li>
                  <li>能用离线方案解决的，不硬塞服务器和订阅</li>
                </ul>
              </div>
              <div class="sponsor-service-item">
                <h3>为什么划算</h3>
                <ul>
                  <li>按件报价，不按工时磨洋工</li>
                  <li>AI 提速的部分不重复计费，省下的算你的</li>
                  <li>小需求不设起做门槛，几小时能做完就按几小时算</li>
                  <li>代码可读、无暗桩、不捆绑后续维护</li>
                  <li>默认本地优先，隐私和数据留在你自己手里</li>
                </ul>
              </div>
            </div>

            <div class="notice sponsor-contact">
              需求、预算、工期一并写清楚，报价会更准。直接发邮件或加 QQ 联系我，也可以在赞赏时附言简述需求；具体价格一律按需求评估，本页不承诺固定金额。
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>@</span><h2>联系方式</h2></div>
            <span class="badge">欢迎来聊需求</span>
          </div>
          <div class="card-body">
            <p class="sponsor-contact-lead">有定制开发需求、想问报价，或者只是想反馈工具箱的问题，都可以通过下面两种方式联系我。</p>
            <div class="sponsor-contact-grid">
              <div class="sponsor-contact-item">
                <div class="sponsor-contact-meta">
                  <span class="sponsor-contact-label">邮箱</span>
                  <code class="sponsor-contact-value" id="sponsor-email">1399838678@qq.com</code>
                </div>
                <button class="btn btn-sm" type="button" data-copy="sponsor-email">复制</button>
              </div>
              <div class="sponsor-contact-item">
                <div class="sponsor-contact-meta">
                  <span class="sponsor-contact-label">QQ</span>
                  <code class="sponsor-contact-value" id="sponsor-qq">1399838678</code>
                </div>
                <button class="btn btn-sm" type="button" data-copy="sponsor-qq">复制</button>
              </div>
            </div>
            <p class="field-hint">点击「复制」即可复制，也可直接选中文字；联系方式只写在本页，不会上传。</p>
          </div>
          <div class="card-foot">
            <a class="btn" href="mailto:1399838678@qq.com" title="使用系统默认邮件客户端">发邮件</a>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>i</span><h2>关于每日提示</h2></div>
          </div>
          <div class="card-body">
            <p>每天首次打开工具箱时提示一次，点关闭后当天不再出现。随时可以从左侧导航回到本页。</p>
            <div class="row-between">
              <span class="field-hint">提示状态只保存在本机浏览器，不会上传。</span>
              <span class="status" id="sponsor-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn" type="button" id="sponsor-preview-notice">预览提示弹窗</button>
          </div>
        </section>
      </div>
    `;

    const previewButton = $('#sponsor-preview-notice', root);
    const status = $('#sponsor-status', root);
    if (previewButton) {
      previewButton.addEventListener('click', () => {
        T.showSponsorNotice({ preview: true });
        if (status) T.setStatus(status, '✓ 已打开预览（不影响今日提示）', 'ok');
      });
    }
    T.bindCopyButtons(root);
  };
})();
