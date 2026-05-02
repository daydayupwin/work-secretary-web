// 工作秘书 v2.0 — 核心逻辑
// 支持：多 AI Provider / localStorage / PWA / 响应式

// ==================== 数据 ====================
const STORAGE_KEY = 'wsData_v2';

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : defaultData();
    } catch { return defaultData(); }
}

function defaultData() {
    return {
        schedules: [],
        tasks: [],
        documents: [],
        settings: {
            provider: (typeof AI_CONFIG !== 'undefined') ? AI_CONFIG.provider : 'tongyi',
            apiKey: (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.apiKey) ? AI_CONFIG.apiKey : '',
            model: (typeof AI_CONFIG !== 'undefined') ? AI_CONFIG.model : 'qwen-turbo'
        }
    };
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

let appData = loadData();

// ==================== 工具 ====================
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
function fmtTime(s) {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
function isToday(s) { return s && s.startsWith(todayStr()); }
function isThisWeek(s) {
    if (!s) return false;
    const d = new Date(s), now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    return d >= start && d < end;
}
function isOverdue(deadline) {
    if (!deadline) return false;
    return new Date(deadline + 'T23:59:59') < new Date();
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initBottomNav();
    initViewBtns();
    initFilterBtns();
    initDocTypeBtns();
    tick();
    setInterval(tick, 1000);
    renderSchedules();
    renderTasks();
    renderDashboard();
    updateStats();
    updateAiStatus();

    // 初始化默认日期
    const now = new Date().toISOString().slice(0, 16);
    if (document.getElementById('scheduleStart')) document.getElementById('scheduleStart').value = now;
});

function tick() {
    const now = new Date();
    const dateEl = document.getElementById('currentDate');
    const timeEl = document.getElementById('currentTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('zh-CN');
}

// ==================== 导航 ====================
function initNav() {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            switchTab(el.dataset.tab);
        });
    });
}

function initBottomNav() {
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            switchTab(el.dataset.tab);
        });
    });
}

function switchTab(tab) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
    document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
    closeSidebar();
    if (tab === 'dashboard') renderDashboard();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
}

// ==================== 弹窗 ====================
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openScheduleModal() {
    document.getElementById('scheduleStart').value = new Date().toISOString().slice(0,16);
    openModal('scheduleModal');
}
function openTaskModal() { openModal('taskModal'); }

// ==================== 统计 ====================
function updateStats() {
    const today = todayStr();
    document.getElementById('todayTasks').textContent =
        appData.tasks.filter(t => !t.completed && t.deadline === today).length;
    document.getElementById('urgentTasks').textContent =
        appData.tasks.filter(t => !t.completed && (t.priority === 'urgent-important' || t.priority === 'urgent')).length;
    document.getElementById('completedWeek').textContent =
        appData.tasks.filter(t => t.completed && isThisWeek(t.completedDate)).length;
}

// ==================== 日程 ====================
let currentView = 'day';

function initViewBtns() {
    document.querySelectorAll('.view-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentView = b.dataset.view;
            renderSchedules(currentView);
        });
    });
}

function renderSchedules(view = currentView) {
    const c = document.getElementById('scheduleContainer');
    let list = [...appData.schedules];
    if (view === 'day') list = list.filter(s => isToday(s.start));
    else if (view === 'week') list = list.filter(s => isThisWeek(s.start));
    list.sort((a, b) => new Date(a.start) - new Date(b.start));

    if (!list.length) {
        c.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>暂无${view==='day'?'今日':'本周'}日程</p><p style="font-size:12px;margin-top:6px">点击"+ 新增"添加</p></div>`;
        return;
    }
    c.innerHTML = list.map(s => `
        <div class="schedule-item type-${s.type||'meeting'}">
            <div class="schedule-time">
                <div class="time">${fmtTime(s.start)}</div>
                <div class="date">${fmtDate(s.start)}</div>
            </div>
            <div class="schedule-info">
                <div class="schedule-title">${escHtml(s.title)}</div>
                <span class="tag">${typeLabel(s.type)}</span>
                ${s.note ? `<div class="schedule-note">${escHtml(s.note)}</div>` : ''}
            </div>
            <button class="item-del" onclick="delSchedule('${s.id}')">🗑</button>
        </div>
    `).join('');
}

function typeLabel(t) {
    return { meeting:'会议', deadline:'截止', reminder:'提醒', event:'活动' }[t] || t;
}

function saveSchedule() {
    const title = document.getElementById('scheduleTitle').value.trim();
    const start = document.getElementById('scheduleStart').value;
    if (!title || !start) { alert('请填写标题和开始时间'); return; }
    appData.schedules.push({
        id: id(), title, start,
        end: document.getElementById('scheduleEnd').value,
        type: document.getElementById('scheduleType').value,
        note: document.getElementById('scheduleNote').value.trim()
    });
    save();
    closeModal('scheduleModal');
    document.getElementById('scheduleTitle').value = '';
    document.getElementById('scheduleNote').value = '';
    renderSchedules();
    updateStats();
}

function delSchedule(sid) {
    if (!confirm('删除此日程？')) return;
    appData.schedules = appData.schedules.filter(s => s.id !== sid);
    save(); renderSchedules();
}

// ==================== 任务 ====================
let currentFilter = 'all';

function initFilterBtns() {
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentFilter = b.dataset.filter;
            renderTasks(currentFilter);
        });
    });
}

function renderTasks(filter = currentFilter) {
    const c = document.getElementById('tasksContainer');
    let list = [...appData.tasks];
    if (filter === 'all') list = list.filter(t => !t.completed);
    else if (filter === 'completed') list = list.filter(t => t.completed);
    else list = list.filter(t => !t.completed && t.priority === filter);

    const order = { 'urgent-important': 0, urgent: 1, important: 2, normal: 3 };
    list.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));

    if (!list.length) {
        c.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>暂无任务</p></div>`;
        return;
    }
    c.innerHTML = list.map(t => {
        const overdue = !t.completed && isOverdue(t.deadline);
        return `
        <div class="task-item">
            <div class="priority-bar ${t.priority}"></div>
            <div class="task-info">
                <div class="task-title ${t.completed ? 'done' : ''}">
                    ${escHtml(t.title)}
                    ${overdue ? '<span style="font-size:11px;color:var(--danger);background:#FDECEA;padding:1px 6px;border-radius:8px;">已逾期</span>' : ''}
                </div>
                <div class="task-meta">
                    <span class="task-project">${escHtml(t.project || '未分类')}</span>
                    ${t.deadline ? `<span class="${overdue?'deadline-badge':''}">📅 ${t.deadline}</span>` : ''}
                </div>
                ${t.desc ? `<div class="task-desc">${escHtml(t.desc)}</div>` : ''}
            </div>
            <div class="task-actions">
                ${!t.completed ? `<button class="complete-btn" onclick="completeTask('${t.id}')">✅</button>` : ''}
                <button class="del-btn" onclick="delTask('${t.id}')">🗑</button>
            </div>
        </div>
    `}).join('');
}

function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) { alert('请填写任务标题'); return; }
    appData.tasks.push({
        id: id(), title,
        project: document.getElementById('taskProject').value,
        priority: document.getElementById('taskPriority').value,
        deadline: document.getElementById('taskDeadline').value,
        desc: document.getElementById('taskDesc').value.trim(),
        completed: false,
        createdDate: new Date().toISOString()
    });
    save();
    closeModal('taskModal');
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskDeadline').value = '';
    renderTasks();
    updateStats();
}

function completeTask(tid) {
    const t = appData.tasks.find(x => x.id === tid);
    if (t) { t.completed = true; t.completedDate = new Date().toISOString(); save(); renderTasks(); updateStats(); }
}
function delTask(tid) {
    if (!confirm('删除此任务？')) return;
    appData.tasks = appData.tasks.filter(x => x.id !== tid);
    save(); renderTasks(); updateStats();
}

// ==================== 文档生成 ====================
let currentDocType = 'notification';

function initDocTypeBtns() {
    document.querySelectorAll('.doc-type-card').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.doc-type-card').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentDocType = b.dataset.type;
        });
    });
}

async function generateDocument() {
    const input = document.getElementById('docInput').value.trim();
    if (!input) { alert('请输入需求描述'); return; }
    const output = document.getElementById('docOutput');
    const btn = document.getElementById('generateBtn');
    const btnText = document.getElementById('generateBtnText');

    btn.disabled = true;
    btnText.textContent = '⏳ 生成中…';
    output.innerHTML = '<p class="placeholder-text">🤖 AI 正在生成，请稍候…</p>';

    const { provider, apiKey, model } = appData.settings;
    let result;

    if (apiKey) {
        try {
            result = await callAI(provider, apiKey, model, input, currentDocType);
        } catch (e) {
            result = `[AI调用失败: ${e.message}]\n\n${templateGenerate(input, currentDocType)}`;
        }
    } else {
        await new Promise(r => setTimeout(r, 800)); // 模拟延迟
        result = templateGenerate(input, currentDocType);
    }

    output.innerHTML = `
        <div class="output-text">${escHtml(result)}</div>
        <div class="output-actions">
            <button class="btn-secondary" onclick="copyOutput()">📋 复制全文</button>
            <button class="btn-secondary" onclick="downloadOutput()">📥 下载 .txt</button>
        </div>
    `;
    btn.disabled = false;
    btnText.textContent = '✨ AI 生成';

    // 保存历史
    appData.documents.push({ id: id(), type: currentDocType, input, output: result, created: new Date().toISOString() });
    save();
}

// ==================== AI API 调用 ====================
async function callAI(provider, apiKey, model, userInput, docType) {
    const docTypeNames = {
        notification: '工作通知', report: '工作汇报', email: '工作邮件',
        summary: '会议总结', plan: '工作计划', free: '自由生成'
    };
    const systemPrompt = `你是一个专业的中文公文写作助手，擅长起草企业内部工作文件。
请根据用户需求，生成一份完整、规范的${docTypeNames[docType] || '工作文件'}。
要求：
1. 格式规范，使用标准公文结构
2. 语言简洁严谨，符合企业公文风格
3. 直接输出正文，不要加任何说明或前缀
4. 保持中文表达，数字和专业术语准确`;

    const userMsg = `请为我生成一份${docTypeNames[docType]}，需求如下：\n${userInput}`;

    let url, headers, body;

    if (provider === 'qianwen' || provider === 'tongyi') {
        url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        body = { model: model || 'qwen-plus', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], max_tokens: 2000 };
    } else if (provider === 'deepseek') {
        url = 'https://api.deepseek.com/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        body = { model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }] };
    } else if (provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        body = { model: model || 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }] };
    } else if (provider === 'wenxin') {
        // 文心一言 ERNIE Speed
        url = `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/ernie-4.0-8k?access_token=${apiKey}`;
        headers = { 'Content-Type': 'application/json' };
        body = { messages: [{ role: 'user', content: systemPrompt + '\n\n' + userMsg }] };
    }

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${err.slice(0, 200)}`);
    }
    const data = await resp.json();

    if (provider === 'wenxin') return data.result;
    return data.choices?.[0]?.message?.content || '生成失败，请重试';
}

// ==================== 模板生成（无API时） ====================
function templateGenerate(input, type) {
    const d = new Date();
    const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    const templates = {
        notification: `通　知\n\n各相关部门：\n\n根据工作安排，现将有关事项通知如下：\n\n一、主要内容\n${input}\n\n二、工作要求\n（一）请相关部门认真贯彻执行，确保按时按质完成各项工作任务。\n（二）如有疑问，请及时与本部门联系沟通。\n\n特此通知。\n\n品牌管理部\n${dateStr}`,
        report: `工作汇报\n\n一、总体情况\n${input}\n\n二、主要进展\n（一）重点工作有序推进，各项任务按计划推进，进展顺利。\n（二）相关协调工作已基本完成，正按节点推进落实。\n\n三、存在问题\n当前工作推进中存在以下问题，需进一步研究解决：\n1. 资源配置有待进一步优化\n2. 相关机制需进一步完善\n\n四、下步计划\n1. 持续抓好当前重点工作落地落实\n2. 加强与相关部门的沟通协调\n3. 确保各项任务按时完成\n\n品牌管理部\n${dateStr}`,
        email: `主　题：关于${input.slice(0, 20)}的工作联系\n\n尊敬的领导/同事：\n\n您好！\n\n现就以下事项与您沟通协调：\n\n${input}\n\n请您研究并给予答复，如有需要进一步说明之处，欢迎随时联系。\n\n感谢您的支持与配合！\n\n此致\n敬礼！\n\n品牌管理部\n${dateStr}`,
        summary: `会议纪要\n\n时　间：${dateStr}\n地　点：（会议室）\n主持人：（姓名）\n参　会：（相关人员）\n记　录：（姓名）\n\n一、会议主要内容\n本次会议就以下事项进行了研究讨论：\n${input}\n\n二、主要决定\n1. 原则同意相关工作方案，请牵头部门抓紧推进落实。\n2. 各相关单位要加强协同配合，确保工作顺利推进。\n\n三、工作要求\n1. 各责任部门要明确责任分工，制定详细工作方案。\n2. 定期汇报工作进展情况，遇到重要问题及时上报。\n\n品牌管理部\n${dateStr}`,
        plan: `工作计划\n\n一、总体目标\n围绕部门年度重点工作，扎实推进以下工作：\n${input}\n\n二、重点任务安排\n（一）近期重点（本月）\n1. 启动相关工作，完成前期调研和方案制定\n2. 建立工作台账，明确责任分工和时间节点\n\n（二）中期安排（本季度）\n1. 全面推进各项工作，定期汇报进展情况\n2. 加强跨部门协调，推动重点任务落地\n\n（三）目标成果\n按计划完成各项工作指标，形成可复制可推广的工作模式。\n\n三、保障措施\n1. 加强组织领导，明确责任落实\n2. 建立台账管理，强化跟踪督办\n\n品牌管理部\n${dateStr}`,
        free: `${input}\n\n（以上为根据您的描述生成的工作文本框架，请根据实际情况完善具体内容。）\n\n品牌管理部\n${dateStr}`
    };
    return templates[type] || templates.free;
}

function clearDocument() {
    document.getElementById('docInput').value = '';
    document.getElementById('docOutput').innerHTML = '<p class="placeholder-text">🤖 生成的内容将显示在这里</p>';
}

function copyOutput() {
    const txt = document.querySelector('.output-text')?.innerText || '';
    navigator.clipboard.writeText(txt).then(() => showToast('✅ 已复制到剪贴板'));
}

function downloadOutput() {
    const txt = document.querySelector('.output-text')?.innerText || '';
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `工作文本_${todayStr()}.txt` });
    a.click(); URL.revokeObjectURL(a.href);
}

// ==================== 看板 ====================
function renderDashboard() {
    const c = document.getElementById('dashboardContainer');
    const pending = appData.tasks.filter(t => !t.completed);
    const done = appData.tasks.filter(t => t.completed);
    const todaySch = appData.schedules.filter(s => isToday(s.start));
    const projStats = {};
    pending.forEach(t => { const p = t.project || '未分类'; projStats[p] = (projStats[p] || 0) + 1; });
    const urgent = pending.filter(t => t.priority === 'urgent-important');
    const overdueTasks = pending.filter(t => isOverdue(t.deadline));

    c.innerHTML = `
        <div class="dashboard-card">
            <h4>📊 数据概览</h4>
            <ul class="db-list">
                <li><span>待完成任务</span><span class="db-badge">${pending.length}</span></li>
                <li><span>紧急重要</span><span class="db-badge" style="background:#FDECEA;color:var(--danger)">${urgent.length}</span></li>
                <li><span>已逾期任务</span><span class="db-badge" style="background:#FFF3CD;color:#B7791F">${overdueTasks.length}</span></li>
                <li><span>今日日程</span><span class="db-badge">${todaySch.length}</span></li>
                <li><span>本周已完成</span><span class="db-badge" style="background:#E8F5E9;color:var(--success)">${done.filter(t=>isThisWeek(t.completedDate)).length}</span></li>
            </ul>
        </div>
        <div class="dashboard-card">
            <h4>🔥 紧急重要任务</h4>
            <ul class="db-list">
                ${urgent.length ? urgent.slice(0,5).map(t=>`<li><span>${escHtml(t.title)}</span><small>${t.deadline||'无截止'}</small></li>`).join('') : '<li style="color:var(--text-light)">暂无紧急重要任务 ✅</li>'}
            </ul>
        </div>
        <div class="dashboard-card">
            <h4>📂 按项目分布</h4>
            <ul class="db-list">
                ${Object.keys(projStats).length ? Object.entries(projStats).map(([k,v])=>`<li><span>${escHtml(k)}</span><span class="db-badge">${v}</span></li>`).join('') : '<li style="color:var(--text-light)">暂无数据</li>'}
            </ul>
        </div>
        <div class="dashboard-card">
            <h4>✅ 最近完成</h4>
            <ul class="db-list">
                ${done.slice(-5).reverse().length ? done.slice(-5).reverse().map(t=>`<li><span>${escHtml(t.title)}</span><small>${fmtDate(t.completedDate)}</small></li>`).join('') : '<li style="color:var(--text-light)">暂无完成记录</li>'}
            </ul>
        </div>
    `;
}

function exportWeekReport() {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const doneWeek = appData.tasks.filter(t => t.completed && isThisWeek(t.completedDate));
    const pending = appData.tasks.filter(t => !t.completed);
    const txt = `工作周报\n周期：${fmtDate(start.toISOString())} — ${fmtDate(now.toISOString())}\n生成：${now.toLocaleString('zh-CN')}\n${'='.repeat(40)}\n\n【本周完成工作】\n${doneWeek.map((t,i)=>`${i+1}. ${t.title}（${t.project}）`).join('\n') || '无'}\n\n【下周重点计划】\n${pending.slice(0,8).map((t,i)=>`${i+1}. ${t.title}（${t.priority==='urgent-important'?'紧急重要':t.priority==='important'?'重要':'普通'}）`).join('\n') || '无'}\n\n【需要协调事项】\n（请根据实际情况填写）\n`;
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `周报_${todayStr()}.txt` });
    a.click(); URL.revokeObjectURL(a.href);
}

// ==================== AI 设置 ====================
function openSettingsModal() {
    const { provider, apiKey, model } = appData.settings;
    document.getElementById('settingsProvider').value = provider || 'qianwen';
    document.getElementById('settingsApiKey').value = apiKey || '';
    document.getElementById('settingsModel').value = model || 'qwen-plus';
    updateProviderHint();
    openModal('settingsModal');
}

function saveSettings() {
    const provider = document.getElementById('settingsProvider').value;
    const apiKey = document.getElementById('settingsApiKey').value.trim();
    const model = document.getElementById('settingsModel').value;
    appData.settings = { provider, apiKey, model };
    save();
    closeModal('settingsModal');
    updateAiStatus();
    showToast(apiKey ? '✅ AI 设置已保存' : '⚠️ 未填写 API Key，将使用模板生成');
}

function updateAiStatus() {
    const bar = document.getElementById('aiStatusBar');
    const txt = document.getElementById('aiStatusText');
    if (!bar || !txt) return;
    if (appData.settings.apiKey) {
        const providerName = { qianwen:'通义千问', deepseek:'DeepSeek', openai:'OpenAI', wenxin:'文心一言' }[appData.settings.provider] || appData.settings.provider;
        bar.className = 'ai-status-bar ok';
        txt.textContent = `✅ AI 已就绪（${providerName} · ${appData.settings.model || '默认模型'}）`;
        bar.querySelector('button').textContent = '更换配置';
    } else {
        bar.className = 'ai-status-bar';
        txt.textContent = '⚡ AI 未配置，将使用内置模板生成';
        bar.querySelector('button').textContent = '去配置';
    }
}

const PROVIDER_HINTS = {
    qianwen: '获取：<a href="https://dashscope.console.aliyun.com/apiKey" target="_blank">阿里云百炼平台</a>（免费额度充足，推荐）',
    deepseek: '获取：<a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek 平台</a>（价格极低，约 ¥1/百万 Token）',
    openai: '获取：<a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>（需绑定海外信用卡）',
    wenxin: '注意：文心一言需先在控制台获取 Access Token，填入此处'
};

const PROVIDER_MODELS = {
    qianwen: [['qwen-plus','qwen-plus（均衡推荐）'],['qwen-max','qwen-max（效果最强）'],['qwen-turbo','qwen-turbo（速度最快）']],
    deepseek: [['deepseek-chat','deepseek-chat（推荐）'],['deepseek-reasoner','deepseek-reasoner（深度推理）']],
    openai: [['gpt-4o-mini','gpt-4o-mini（推荐·经济）'],['gpt-4o','gpt-4o（效果最强）'],['gpt-3.5-turbo','gpt-3.5-turbo（速度快）']],
    wenxin: [['ernie-4.0-8k','ERNIE 4.0'],['ernie-speed-128k','ERNIE Speed']]
};

function updateProviderHint() {
    const p = document.getElementById('settingsProvider').value;
    document.getElementById('providerHint').innerHTML = PROVIDER_HINTS[p] || '';
    const modelSel = document.getElementById('settingsModel');
    const models = PROVIDER_MODELS[p] || [];
    modelSel.innerHTML = models.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

function toggleApiKeyVisibility() {
    const inp = document.getElementById('settingsApiKey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function testAiConnection() {
    const provider = document.getElementById('settingsProvider').value;
    const apiKey = document.getElementById('settingsApiKey').value.trim();
    const model = document.getElementById('settingsModel').value;
    const btn = document.getElementById('testBtn');
    const result = document.getElementById('testResult');
    if (!apiKey) { result.textContent = '⚠️ 请先填写 API Key'; return; }
    btn.disabled = true; btn.textContent = '⏳ 测试中…'; result.textContent = '';
    try {
        const resp = await callAI(provider, apiKey, model, '请用一句话介绍自己', 'free');
        result.style.color = 'var(--success)';
        result.textContent = '✅ 连接成功！';
    } catch (e) {
        result.style.color = 'var(--danger)';
        result.textContent = `❌ ${e.message.slice(0, 60)}`;
    }
    btn.disabled = false; btn.textContent = '🔌 测试连接';
}

// ==================== 数据备份 ====================
function exportData() {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `工作秘书备份_${todayStr()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
    showToast('📦 备份文件已下载');
}
function importData() { document.getElementById('importFile').click(); }
function handleImport(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            if (!confirm('导入将覆盖当前全部数据，确认继续？')) return;
            appData = JSON.parse(ev.target.result);
            save(); renderSchedules(); renderTasks(); renderDashboard(); updateStats(); updateAiStatus();
            showToast('✅ 数据导入成功');
        } catch { showToast('❌ 文件格式错误'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ==================== Toast 提示 ====================
function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
        position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
        background:'rgba(0,0,0,0.75)', color:'white', padding:'10px 20px',
        borderRadius:'20px', fontSize:'14px', zIndex:'9999',
        transition:'opacity 0.4s', whiteSpace:'nowrap'
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2000);
}

window.addEventListener('beforeunload', save);
