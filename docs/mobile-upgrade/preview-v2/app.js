import { createApp, computed, shallowRef, ref, onUnmounted } from '/vue.js';

// All names, events, messages and metrics are synthetic documentation fixtures.
// This preview imports no application stores, auth, sockets, API or credentials.
const iconPaths = {
  home: ['M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z'],
  chat: ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M16 3a4 4 0 0 1 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  calendar: ['M8 2v4M16 2v4M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M8 14h2M14 14h2M8 18h2'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  search: ['M21 21l-4.4-4.4', 'M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z'],
  filter: ['M4 7h16M7 12h10M10 17h4'],
  chevron: ['m9 5 7 7-7 7'],
  down: ['m6 9 6 6 6-6'],
  back: ['m15 18-6-6 6-6'],
  arrow: ['M5 12h14m-6-6 6 6-6 6'],
  plus: ['M12 5v14M5 12h14'],
  send: ['M12 20V4m-6 6 6-6 6 6'],
  spark: ['m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z', 'M20 2v4M18 4h4'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6M8 13h8M8 17h5'],
  check: ['m5 12 4 4L19 6'],
  checks: ['m2 12 4 4L16 6', 'm10 14 2 2L22 6'],
  info: ['M12 16v-4M12 8h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  phone: ['M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z'],
  wifi: ['M2 8.8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0M12 19h.01'],
  battery: ['M2 7h17v10H2Z', 'M22 10v4M5 10v4M8 10v4M11 10v4M14 10v4'],
  signal: ['M4 20v-4M9 20v-8M14 20V8M19 20V4'],
  clock: ['M12 8v5l3 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  logout: ['M9 21H4V3h5M12 12h10m-4-4 4 4-4 4'],
  shield: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', 'm8 12 3 3 5-6'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z'],
};
const Icon = {
  props: { name: { type: String, required: true } },
  setup: props => ({ paths: computed(() => iconPaths[props.name] || iconPaths.more) }),
  template: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(d,i) in paths" :key="i" :d="d"/></svg>`,
};
const tabs = [
  { key: 'overview', label: 'Tổng quan', icon: 'home' },
  { key: 'inbox', label: 'Hội thoại', icon: 'chat' },
  { key: 'contacts', label: 'Khách hàng', icon: 'users' },
  { key: 'agenda', label: 'Lịch hẹn', icon: 'calendar' },
  { key: 'more', label: 'Thêm', icon: 'more' },
];
const people = [
  { id: 'nam', name: 'Anh Nam', initials: 'AN', business: 'Mô hình xe lưu động', preview: 'Anh muốn xem thêm về gói setup xe.', time: '10:42', owner: 'Minh Anh', nick: 'Nick Cờ Rếp', unread: 2, tone: '', stage: 'Quan tâm', source: 'Zalo', note: 'Hỏi về quy trình setup' },
  { id: 'linh', name: 'Chị Linh', initials: 'CL', business: 'Mô hình cửa hàng', preview: 'Bạn: Dạ, hẹn chị lúc 14:00 nhé.', time: '10:28', owner: 'Minh Anh', nick: 'Nick Cờ Rếp', unread: 0, tone: 'lilac', stage: 'Đã liên hệ', source: 'Zalo', note: 'Đã có lịch tư vấn' },
  { id: 'hoang', name: 'Anh Hoàng', initials: 'AH', business: 'Tìm hiểu hợp tác', preview: 'Bên mình hỗ trợ những khu vực nào?', time: '09:54', owner: 'Tuấn Minh', nick: 'Nick Kinh doanh', unread: 1, tone: 'sand', stage: 'Khách mới', source: 'Zalo', note: 'Chưa trao đổi nhu cầu' },
  { id: 'mai', name: 'Chị Mai', initials: 'CM', business: 'Mô hình xe lưu động', preview: 'Bạn: Em đã nhận được thông tin ạ.', time: '09:15', owner: 'Minh Anh', nick: 'Nick Cờ Rếp', unread: 0, tone: 'sage', stage: 'Đã liên hệ', source: 'Zalo', note: 'Chờ phản hồi tài liệu' },
  { id: 'phuc', name: 'Anh Phúc', initials: 'AP', business: 'Mô hình cửa hàng', preview: 'Cảm ơn em, anh sẽ xem lại tài liệu.', time: 'Hôm qua', owner: 'Tuấn Minh', nick: 'Nick Kinh doanh', unread: 0, tone: '', stage: 'Quan tâm', source: 'Zalo', note: 'Quan tâm quy trình vận hành' },
];
const suggestion = 'Dạ, em gửi anh thông tin về mô hình xe và các bước triển khai để anh tham khảo. Anh dự kiến kinh doanh ở khu vực nào và muốn bắt đầu vào thời gian nào ạ?';

const ConversationRows = {
  components: { Icon }, props: { items: { type: Array, required: true } }, emits: ['select'],
  template: `<div><button v-for="p in items" :key="p.id" class="conversation" :class="{attention:p.unread}" @click="$emit('select',p.id)">
    <span class="avatar" :class="p.tone">{{p.initials}}</span><span class="row-content"><span class="row-top"><span class="row-title">{{p.name}}</span><span class="row-time">{{p.time}}</span></span><span class="row-preview" style="display:block">{{p.preview}}</span><span class="row-bottom"><span class="row-owner">{{p.owner}} · {{p.nick}}</span><span v-if="p.unread" class="unread" :aria-label="p.unread+' tin chưa đọc'">{{p.unread}}</span><Icon v-else name="checks" style="width:15px;height:15px;color:var(--m-muted)"/></span></span></button></div>`,
};
const ChatBubbles = {
  components: { Icon }, props: { extra: { type: Array, default: () => [] } },
  template: `<div class="messages"><div class="day-label">Hôm nay, 29 tháng 10</div>
    <div class="bubble">Chào bạn, mình đang tìm hiểu mô hình xe. Bên bạn tư vấn giúp mình nhé.<div class="bubble-time">10:38</div></div>
    <div class="bubble self">Dạ em chào anh Nam. Em gửi anh thông tin để mình tham khảo trước nhé.<div class="bubble-time">10:39 <Icon name="checks"/></div></div>
    <div class="bubble self"><div class="file-card"><div class="file-icon"><Icon name="file"/></div><div><div class="file-title">Giới thiệu mô hình xe.pdf</div><div class="file-meta">PDF · Tài liệu minh hoạ</div></div></div>Anh xem qua tài liệu này giúp em ạ.<div class="bubble-time">10:41 <Icon name="checks"/></div></div>
    <div class="bubble">Anh muốn xem thêm về gói setup xe.<div class="bubble-time">10:42</div></div>
    <div v-for="(m,i) in extra" :key="i" class="bubble self">{{m}}<div class="bubble-time">Bản mô phỏng <Icon name="check"/></div></div>
  </div>`,
};
const ProfileInfo = {
  components: { Icon },
  template: `<div class="info-card"><div class="info-row"><span class="info-label">Điện thoại</span><strong>09•• ••• •••</strong></div><div class="info-row"><span class="info-label">Phụ trách</span><strong>Minh Anh</strong></div><div class="info-row"><span class="info-label">Nguồn khách</span><strong>Zalo · Nick Cờ Rếp</strong></div><div class="info-row"><span class="info-label">Nhu cầu</span><strong>Setup xe lưu động</strong></div></div>`,
};
const PhoneScreen = {
  components: { Icon, ConversationRows, ChatBubbles, ProfileInfo },
  props: { screen: { type: String, required: true }, prefill: { type: String, default: '' } }, emits: ['navigate', 'apply-draft', 'draft-change'],
  setup(props, { emit }) {
    const query = shallowRef('');
    const filter = shallowRef('all');
    const draft = computed({ get: () => props.prefill, set: value => emit('draft-change', value) });
    const extra = ref([]);
    const toast = shallowRef('');
    let timer;
    const inform = (text = 'Thao tác minh hoạ · Không thay đổi CRM') => { toast.value = text; clearTimeout(timer); timer = setTimeout(() => { toast.value = ''; }, 2300); };
    onUnmounted(() => clearTimeout(timer));
    const filtered = computed(() => people.filter(p => (p.name+' '+p.business).toLocaleLowerCase('vi').includes(query.value.toLocaleLowerCase('vi')) && (filter.value==='all'||p.unread>0)));
    const activeTab = computed(() => ['thread','ai'].includes(props.screen) ? 'inbox' : props.screen==='profile' ? 'contacts' : props.screen);
    const navVisible = computed(() => !['thread','profile','ai'].includes(props.screen));
    function sendLocal() { const text=draft.value.trim(); if(!text)return; extra.value.push(text); draft.value=''; inform('Đã thêm vào bản mô phỏng, không gửi thật'); }
    return { tabs, people, query, filter, draft, extra, toast, inform, filtered, activeTab, navVisible, suggestion, sendLocal,
      go: screen => emit('navigate', screen), apply: () => emit('apply-draft', suggestion),
    };
  },
  template: `<div class="phone crm-mobile"><div class="phone-inner">
    <div class="statusbar" aria-hidden="true"><span>9:41</span><span class="island"></span><span class="status-icons"><Icon name="signal"/><Icon name="wifi"/><Icon name="battery"/></span></div>

    <template v-if="screen==='overview'">
      <header class="page-head"><div class="head-top"><div><div class="overline">Cờ Rếp Việt</div><h1 class="heading">Chào Minh Anh</h1></div><button class="icon-btn notify" aria-label="Xem thông báo mẫu" @click="inform('Bạn có 3 thông báo minh hoạ')"><Icon name="bell"/></button></div><p class="subheading">Thứ Năm, 29 tháng 10</p></header>
      <main class="scroll"><div class="pad">
        <section class="priority"><div class="priority-top"><p>Việc cần ưu tiên</p><span class="tag">Hôm nay</span></div><h2>8 hội thoại<br>đang chờ bạn phản hồi</h2><p>Ưu tiên khách đang quan tâm.</p><button class="primary" @click="go('inbox')">Mở hội thoại <Icon name="arrow"/></button></section>
        <div class="metrics"><div class="metric"><strong>12</strong><span>Khách hàng mới</span></div><div class="metric"><strong>03</strong><span>Lịch hẹn hôm nay</span></div></div>
        <section><div class="section-title"><h2>Cần chăm sóc</h2><button class="text-link" @click="go('contacts')">Xem tất cả</button></div><div v-for="p in people.slice(0,2)" :key="p.id" class="compact-card"><button class="compact-row" @click="go('profile')"><span class="avatar" :class="p.tone">{{p.initials}}</span><span class="row-content"><span class="compact-title">{{p.name}}</span><span class="compact-sub" style="display:block">{{p.note}}</span></span><Icon name="chevron" style="width:16px"/></button></div></section>
        <section style="margin-top:16px"><div class="section-title"><h2>Lịch hẹn tiếp theo</h2><button class="text-link" @click="go('agenda')">Xem lịch</button></div><div class="compact-card event-small"><div class="event-line"></div><div><div class="time">14:00 – 14:30</div><div class="compact-title" style="margin-top:4px">Tư vấn mô hình xe</div><div class="compact-sub">Anh Nam · Cuộc gọi tư vấn</div></div></div></section>
      </div></main>
    </template>

    <template v-else-if="screen==='inbox'">
      <header class="page-head"><div class="head-top"><div><div class="overline">Không gian làm việc</div><h1 class="heading">Hội thoại</h1></div><button class="icon-btn soft" aria-label="Lọc hội thoại mẫu" @click="inform('Bộ lọc: nick, người phụ trách và trạng thái')"><Icon name="filter"/></button></div>
        <label class="search"><Icon name="search"/><input v-model="query" type="search" aria-label="Tìm hội thoại mẫu" placeholder="Tìm khách, hội thoại…" autocomplete="off"></label>
        <div class="filter-chips"><button class="chip" :class="{active:filter==='all'}" :aria-pressed="filter==='all'" @click="filter='all'">Tất cả</button><button class="chip" :class="{active:filter==='unread'}" :aria-pressed="filter==='unread'" @click="filter='unread'">Chưa đọc <span class="count">3</span></button><button class="chip" :class="{active:filter==='reply'}" :aria-pressed="filter==='reply'" @click="filter='reply'">Chưa trả lời</button></div>
      </header>
      <div class="scope"><span><span class="scope-dot"></span>3 nick đang kết nối</span><button @click="inform('Đang hiển thị tất cả nick mẫu')">Tất cả nick <Icon name="down"/></button></div>
      <main class="scroll"><ConversationRows :items="filtered" @select="go('thread')"/><div v-if="!filtered.length" class="blank-state"><Icon name="search"/><h2>Chưa có kết quả</h2><p>Thử tên khác hoặc bỏ bớt bộ lọc.</p><button class="primary" @click="query='';filter='all'">Xoá bộ lọc</button></div><p v-else style="text-align:center;font-size:11px;color:var(--m-muted);padding:16px">Đã đồng bộ các hội thoại mẫu</p></main>
    </template>

    <template v-else-if="screen==='thread'">
      <header class="thread-head"><button class="icon-btn" aria-label="Quay lại hội thoại" @click="go('inbox')"><Icon name="back"/></button><span class="avatar online">AN</span><button class="row-content" style="text-align:left;padding:0" @click="go('profile')"><span class="thread-name">Anh Nam</span><span class="thread-scope" style="display:block">Zalo · Nick Cờ Rếp</span></button><button class="icon-btn" aria-label="Xem thông tin khách hàng" @click="go('profile')"><Icon name="info"/></button></header>
      <main class="scroll"><ChatBubbles :extra="extra"/></main>
      <footer class="compose-area"><div class="compose-tools"><button class="ai-trigger" @click="go('ai')"><Icon name="spark"/>Gợi ý AI</button><span class="tool-hint">Minh Anh đang phụ trách</span></div><form class="composer" @submit.prevent="sendLocal"><button class="icon-btn" type="button" aria-label="Chọn đính kèm mẫu" @click="inform('Ảnh, tài liệu và mẫu tin nhắn')"><Icon name="plus"/></button><textarea v-model="draft" aria-label="Tin nhắn mô phỏng" placeholder="Nhập tin nhắn…" enterkeyhint="send"></textarea><button class="icon-btn send" type="submit" aria-label="Gửi vào bản mô phỏng" :disabled="!draft.trim()"><Icon name="send"/></button></form></footer>
    </template>

    <template v-else-if="screen==='contacts'">
      <header class="page-head"><div class="head-top"><div><div class="overline">Quản lý chăm sóc</div><h1 class="heading">Khách hàng</h1></div><button class="icon-btn soft" aria-label="Thêm khách mẫu" @click="inform()"><Icon name="plus"/></button></div><label class="search"><Icon name="search"/><input v-model="query" type="search" aria-label="Tìm khách hàng mẫu" placeholder="Tên hoặc số điện thoại…" autocomplete="off"></label><div class="filter-chips"><button class="chip active" @click="filter='all'">Tất cả</button><button class="chip" @click="inform('Bộ lọc khách cần chăm sóc')">Cần chăm sóc</button><button class="chip" @click="inform('Bộ lọc trạng thái khách mới')">Khách mới</button></div></header>
      <main class="scroll"><div class="contact-summary">5 khách hàng mẫu · Phạm vi của tôi</div><article v-for="p in filtered" :key="p.id" class="customer-card"><button class="customer-main" @click="go('profile')"><span class="avatar" :class="p.tone">{{p.initials}}</span><span class="row-content"><span class="row-top"><span class="row-title">{{p.name}}</span><Icon name="chevron" style="width:15px;height:15px;color:var(--m-muted)"/></span><span class="row-preview" style="display:block;font-size:12px">{{p.business}}</span></span></button><div class="customer-meta"><span class="tag" :class="p.stage==='Khách mới'?'success':''">{{p.stage}}</span><span>{{p.owner}} · Zalo</span></div></article><div v-if="!filtered.length" class="blank-state"><h2>Chưa có kết quả</h2><p>Hãy thử tìm tên khách khác.</p></div></main>
    </template>

    <template v-else-if="screen==='profile'">
      <header class="thread-head" style="border:0"><button class="icon-btn" aria-label="Quay lại danh sách khách" @click="go('contacts')"><Icon name="back"/></button><span class="row-content" style="font-size:14px;font-weight:600">Hồ sơ khách hàng</span><button class="icon-btn" aria-label="Thao tác hồ sơ mẫu" @click="inform()"><Icon name="more"/></button></header>
      <main class="scroll"><section class="profile-hero"><span class="avatar">AN</span><h1>Anh Nam</h1><p>Quan tâm mô hình xe lưu động</p><span class="tag">Quan tâm</span><div class="profile-actions"><button class="main" @click="go('thread')"><Icon name="chat"/>Nhắn tin</button><button @click="go('agenda')"><Icon name="calendar"/>Hẹn lịch</button><button @click="inform('Điện thoại đã ẩn trong dữ liệu mẫu')"><Icon name="phone"/>Gọi điện</button></div></section>
      <div class="pad"><div class="section-title"><h2>Thông tin khách</h2><button class="text-link" @click="inform()">Chỉnh sửa</button></div><ProfileInfo/><div class="section-title" style="margin-top:20px"><h2>Hoạt động gần đây</h2></div><div class="timeline-item"><h3>Đã gửi tài liệu giới thiệu</h3><p>10:41 · Minh Anh</p></div><div class="timeline-item"><h3>Chuyển sang Quan tâm</h3><p>Hôm nay · Minh Anh</p></div><div class="timeline-item"><h3>Bắt đầu hội thoại Zalo</h3><p>Hôm qua · Nick Cờ Rếp</p></div><button class="text-link" @click="inform('Lịch sử minh hoạ của khách hàng')">Xem toàn bộ lịch sử <Icon name="chevron" style="width:15px"/></button></div></main>
    </template>

    <template v-else-if="screen==='agenda'">
      <header class="page-head"><div class="head-top"><div><div class="overline">Tháng 10, 2026</div><h1 class="heading">Lịch hẹn</h1></div><button class="icon-btn soft" aria-label="Tạo lịch hẹn mẫu" @click="inform()"><Icon name="plus"/></button></div><div class="dates"><button v-for="(day,i) in ['T2','T3','T4','T5','T6','T7','CN']" :key="day" class="date" :class="{active:i===3}" :aria-pressed="i===3" @click="inform('Ngày được chọn chỉ là minh hoạ')">{{day}}<b>{{26+i>31?1:26+i}}</b></button></div></header>
      <main class="scroll"><div class="pad"><div class="section-title"><h2>Hôm nay</h2><span style="font-size:12px;color:var(--m-muted)">3 lịch hẹn</span></div><article class="appointment"><div class="time">09:00</div><div class="appointment-box done"><h3>Trao đổi nhu cầu</h3><p>Chị Linh · Cuộc gọi tư vấn</p><span class="tag success"><Icon name="check" style="width:12px;height:12px"/>Đã hoàn thành</span></div></article><article class="appointment"><div class="time">14:00</div><div class="appointment-box"><h3>Tư vấn mô hình xe</h3><p>Anh Nam · 30 phút</p><span class="tag">Sắp tới</span><button class="text-link" style="display:flex;min-height:44px;margin-top:8px" @click="go('profile')">Xem hồ sơ khách <Icon name="chevron" style="width:14px"/></button></div></article><article class="appointment"><div class="time">16:30</div><div class="appointment-box"><h3>Gửi thông tin bổ sung</h3><p>Anh Hoàng · Nhắc chăm sóc</p><span class="tag warning">Cần chuẩn bị</span></div></article><div class="agenda-footer"><Icon name="calendar" style="width:20px;height:20px;margin-bottom:5px"/><br>Bạn còn 2 việc trong hôm nay.</div></div></main>
    </template>

    <template v-else-if="screen==='ai'">
      <header class="thread-head"><button class="icon-btn" aria-label="Quay lại chat" @click="go('thread')"><Icon name="back"/></button><span class="row-content"><span class="thread-name">Trợ lý AI</span><span class="thread-scope" style="display:block">Gợi ý cho hội thoại Anh Nam</span></span><Icon name="spark" style="color:var(--m-brand-strong);margin-right:12px"/></header>
      <main class="scroll"><div class="pad"><div class="ai-context"><b>Khách vừa nhắn</b>“Anh muốn xem thêm về gói setup xe.”</div><section class="ai-result"><div class="ai-label"><Icon name="spark" style="width:16px;height:16px"/>Gợi ý trả lời</div><p>{{suggestion}}</p></section><div class="section-title" style="margin-top:22px"><h2>Nguồn tham khảo</h2><span class="tag success">2 nguồn</span></div><div class="source"><Icon name="file"/><div><b>Thông tin mô hình xe</b><span>Nguồn mẫu · Chưa kết nối kho thật</span></div></div><div class="source"><Icon name="file"/><div><b>Quy trình tư vấn khách hàng</b><span>Nguồn mẫu · Chưa kết nối kho thật</span></div></div><p style="font-size:12px;color:var(--m-muted);margin-top:16px">Kiểm tra nội dung và nguồn trước khi sử dụng. Không tự động gửi cho khách.</p></div></main><footer class="sticky-action"><button class="primary" @click="apply()"><Icon name="plus"/>Đưa vào ô nhập</button><p>Nội dung chỉ là bản nháp minh hoạ</p></footer>
    </template>

    <template v-else>
      <header class="page-head"><h1 class="heading">Thêm</h1><p class="subheading">Tài khoản và công cụ làm việc</p></header><main class="scroll pad"><div class="compact-card"><div class="compact-row"><span class="avatar">MA</span><div><div class="compact-title">Minh Anh</div><div class="compact-sub">Nhân viên kinh doanh · Tài khoản mẫu</div></div></div></div><button v-for="item in [{name:'Kho phương tiện',icon:'file'},{name:'Báo cáo',icon:'home'},{name:'Trợ lý AI',icon:'spark'},{name:'Cài đặt',icon:'settings'},{name:'Quyền truy cập',icon:'shield'}]" :key="item.name" class="compact-card compact-row" style="min-height:56px" @click="inform()"><Icon :name="item.icon"/><span class="row-content">{{item.name}}</span><Icon name="chevron" style="width:16px"/></button><p style="font-size:12px;color:var(--m-muted);padding:12px">Trong ứng dụng thật, công cụ hiển thị theo quyền của tài khoản.</p></main>
    </template>

    <nav v-if="navVisible" class="tabbar" aria-label="Điều hướng chính"><button v-for="tab in tabs" :key="tab.key" class="tab" :class="{active:activeTab===tab.key}" :aria-current="activeTab===tab.key?'page':undefined" @click="go(tab.key)"><span class="icon-wrap"><Icon :name="tab.icon"/></span>{{tab.label}}</button></nav>
    <div v-if="toast" class="toast" role="status">{{toast}}</div><div class="home-indicator" aria-hidden="true"></div>
  </div></div>`,
};

const DesktopPreview = {
  components: { Icon, ConversationRows, ChatBubbles, ProfileInfo },
  setup: () => ({ people, tabs }),
  template: `<div class="workspace"><aside class="workspace-nav"><div class="workspace-brand">Cờ Rếp Việt</div><button v-for="tab in tabs" :key="tab.key" :class="{active:tab.key==='inbox'}"><Icon :name="tab.icon"/>{{tab.label}}</button><div style="margin-top:420px;font-size:12px;color:var(--m-muted);padding:12px">Minh Anh<br>Nhân viên kinh doanh</div></aside><section class="workspace-list"><header class="page-head"><h2 class="heading" style="font-size:24px">Hội thoại</h2><div class="search"><Icon name="search"/><span style="font-size:14px">Tìm khách, hội thoại…</span></div><div class="filter-chips"><button class="chip active">Tất cả</button><button class="chip">Chưa đọc <span class="count">3</span></button></div></header><div class="scope">3 nick đang kết nối</div><ConversationRows :items="people"/></section><section class="workspace-thread"><header class="thread-head"><span class="avatar online">AN</span><div class="row-content"><div class="thread-name">Anh Nam</div><div class="thread-scope">Zalo · Nick Cờ Rếp · Minh Anh phụ trách</div></div><Icon name="more"/></header><ChatBubbles/><footer class="compose-area"><div class="compose-tools"><button class="ai-trigger"><Icon name="spark"/>Gợi ý AI</button></div><div class="composer"><button class="icon-btn" aria-label="Đính kèm mẫu"><Icon name="plus"/></button><textarea aria-label="Ô nhập mẫu desktop" placeholder="Nhập tin nhắn…"></textarea><button class="icon-btn send" disabled aria-label="Gửi mẫu"><Icon name="send"/></button></div></footer></section><aside class="workspace-side"><div style="font-size:14px;font-weight:600">Thông tin khách hàng</div><div class="profile-hero"><div class="avatar">AN</div><h1 style="font-size:22px">Anh Nam</h1><p>Setup xe lưu động</p><span class="tag">Quan tâm</span></div><ProfileInfo/><h2 style="font-size:16px;margin:22px 0 12px">Ghi chú chăm sóc</h2><div class="compact-card"><p style="font-size:13px;line-height:1.7;margin:0">Khách muốn tìm hiểu quy trình và mô hình xe trước khi tư vấn chi tiết.</p><div class="compact-sub" style="margin-top:10px">Minh Anh · Hôm nay</div></div></aside></div>`,
};

const labels = { overview:'01 / Tổng quan công việc', inbox:'02 / Hộp hội thoại', thread:'03 / Chi tiết hội thoại', contacts:'04 / Danh sách khách hàng', profile:'05 / Hồ sơ chăm sóc', agenda:'06 / Lịch hẹn', ai:'07 / Trợ lý AI', more:'08 / Công cụ và cài đặt' };
const params = new URLSearchParams(location.search);
const requested = params.get('screen');
const allowed = Object.keys(labels);
const mode = params.get('mode') || 'single';
createApp({
  components: { PhoneScreen, DesktopPreview },
  setup() {
    const screen = shallowRef(allowed.includes(requested) ? requested : 'inbox');
    const prefill = shallowRef('');
    const board = computed(() => mode==='board-b' ? ['contacts','profile','agenda'] : ['overview','inbox','thread']);
    function navigate(next) { if(allowed.includes(next))screen.value=next; }
    function applyDraft(text) { prefill.value=text; screen.value='thread'; }
    return { mode, screen, prefill, board, labels, navigate, applyDraft };
  },
  template: `<div :class="mode==='single'?'single-stage':mode==='desktop'?'desktop-stage':'stage'">
    <header v-if="mode!=='single'" class="board-head"><div><div class="board-brand">Cờ Rếp Việt · CRM</div><h1>{{mode==='board-b'?'Chăm sóc xuyên suốt hành trình':mode==='desktop'?'Cùng một công việc. Mọi màn hình.':'Tập trung vào cuộc trò chuyện tiếp theo'}}</h1></div><div class="board-note">Đề xuất giao diện · 29.10.2026<br>Dữ liệu minh hoạ, chưa triển khai</div></header>
    <DesktopPreview v-if="mode==='desktop'"/>
    <template v-else-if="mode==='single'"><PhoneScreen :key="screen" :screen="screen" :prefill="prefill" @navigate="navigate" @apply-draft="applyDraft" @draft-change="prefill=$event"/></template>
    <div v-else class="board-grid"><section v-for="page in board" :key="page"><h2 class="spec-label">{{labels[page]}}</h2><PhoneScreen :screen="page" @navigate="navigate" @apply-draft="applyDraft"/></section></div>
    <p v-if="mode!=='single'" class="screen-description">Một hệ thống thiết kế · Nhận diện xanh Cờ Rếp Việt · Tối ưu thao tác trên iPhone</p>
  </div>`,
}).mount('#app');
