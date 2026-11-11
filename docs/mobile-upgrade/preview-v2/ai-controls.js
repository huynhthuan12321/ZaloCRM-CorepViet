import {createApp, ref, shallowRef, computed} from '/vue.js';

// Documentation-only mock: no API, storage, credentials, or customer messaging.
const ToggleRow = {
  props: {modelValue:Boolean, title:String, detail:String}, emits:['update:modelValue'],
  template:`<label class="control-row"><span><b>{{title}}</b><small>{{detail}}</small></span><input type="checkbox" role="switch" :checked="modelValue" @change="$emit('update:modelValue',$event.target.checked)"><span class="switch-track" aria-hidden="true"></span></label>`
};
const AiPhone = {
  components:{ToggleRow}, props:{page:String, config:Object}, emits:['change','navigate','save'],
  setup(props,{emit}) {
    const effective=computed(()=>props.config.global && (props.config.manual || props.config.scope!=='manual'));
    const scopeName=computed(()=>({manual:'Bật thủ công',new_customers:'Khách mới',all:'Mọi khách'})[props.config.scope]);
    return {effective,scopeName,update:(key,value)=>emit('change',key,value),go:page=>emit('navigate',page)};
  },
  template:`<div class="phone crm-mobile"><div class="phone-inner">
    <div class="statusbar" aria-hidden="true"><span>9:41</span><span class="island"></span><span>▮▮▮  ▰</span></div>
    <header class="thread-head"><button class="icon-btn" aria-label="Quay về thiết lập AI" @click="go('settings')">‹</button><span class="row-content"><b>{{page==='settings'?'Trợ lý AI':page==='scope'?'Tự động tư vấn':'AI trong hội thoại'}}</b><small class="thread-scope" style="display:block">{{page==='conversation'?'Zalo · Nick Cờ Rếp':'Cài đặt CRM · Quản trị viên'}}</small></span><span class="ai-glyph">✦</span></header>
    <main class="scroll pad">
    <template v-if="page==='settings'">
      <div class="overline">ĐIỀU KHIỂN AI</div><h1 class="ai-title">Bạn chọn cách<br>AI hỗ trợ.</h1><p class="ai-copy">Tách rõ hỗ trợ soạn tin và tự động trả lời khách hàng.</p>
      <section class="control-card"><ToggleRow :model-value="config.assistant" title="Trợ lý soạn tin" detail="Gợi ý bản nháp để nhân viên duyệt." @update:model-value="update('assistant',$event)"/><div class="card-foot">Bạn kiểm tra và bấm gửi trong hội thoại.</div></section>
      <section class="auto-summary"><div class="summary-top"><span class="ai-glyph">✦</span><span class="tag" :class="config.global?'success':'warning'">{{config.global?'Đã bật công tắc tổng':'Đã tắt công tắc tổng'}}</span></div><h2>AI tự động tư vấn</h2><p>{{config.global?'Tự trả lời theo phạm vi bạn chọn.':'Tạm dừng tự trả lời cho toàn tổ chức.'}}</p><div class="summary-meta"><span>Phạm vi</span><b>{{scopeName}}</b></div><button class="primary" @click="go('scope')">Thiết lập tự động tư vấn <span>→</span></button></section>
      <div class="section-title"><h2>Kết nối & kiến thức</h2></div><div class="control-card"><div class="setting-info"><span class="setting-symbol">◈</span><div><b>Nhà cung cấp AI</b><small>Đã cấu hình · Đang bật</small></div><span class="connection-dot"></span></div><div class="setting-info"><span class="setting-symbol">▤</span><div><b>Nguồn kiến thức</b><small>12 tài liệu mẫu · Sẵn sàng</small></div></div></div><p class="ai-note">Quản lý model, API key và tài liệu trong cấu hình quản trị. Thông tin trên là dữ liệu minh hoạ.</p>
    </template>
    <template v-else-if="page==='scope'">
      <div class="eyebrow">ÁP DỤNG TOÀN TỔ CHỨC</div><section class="control-card"><ToggleRow :model-value="config.global" title="Bật tự động tư vấn" detail="Công tắc tổng cho mọi hội thoại đủ điều kiện." @update:model-value="update('global',$event)"/></section>
      <div class="section-title"><h2>AI sẽ tư vấn cho ai?</h2></div><div class="control-card choices"><label v-for="option in [{key:'manual',name:'Chỉ khách bật thủ công',detail:'Nhân viên chọn từng hội thoại.'},{key:'new_customers',name:'Khách mới',detail:'Chưa được nhân viên trả lời trước đó.'},{key:'all',name:'Mọi khách',detail:'Tất cả hội thoại Zalo 1–1 đủ điều kiện.'}]" :key="option.key" :class="{selected:config.scope===option.key}"><span><b>{{option.name}}</b><small>{{option.detail}}</small></span><input type="radio" name="scope" :value="option.key" :checked="config.scope===option.key" @change="update('scope',option.key)"></label></div>
      <section class="control-card" style="margin-top:16px"><ToggleRow :model-value="config.strangers" title="Khách chưa kết bạn" detail="Thêm khách chủ động nhắn vào phạm vi." @update:model-value="update('strangers',$event)"/><ToggleRow :model-value="config.full" title="Tư vấn cả giá & đơn hàng" detail="Nới bước duyệt nội dung nhạy cảm; vẫn cần nguồn kiến thức." @update:model-value="update('full',$event)"/></section>
      <div class="policy-note"><b>{{config.full?'Đang chọn chế độ trọn':'Nhân viên duyệt giá & đơn hàng'}}</b><p>{{config.full?'Các điều kiện về nguồn, giờ hoạt động và quyền riêng tư vẫn áp dụng.':'Giá, cọc, thanh toán và đơn hàng cần nhân viên kiểm tra.'}}</p></div><div class="ai-note">Giờ hoạt động mẫu: 08:00–21:00 (Việt Nam). Giới hạn, độ tin cậy và nhắc lại được thiết lập trong cấu hình nâng cao.</div>
    </template>
    <template v-else>
      <div class="customer-ai"><span class="avatar online">AN</span><div><h1>Anh Nam</h1><p>Minh Anh phụ trách · Khách mới</p></div></div>
      <section class="effective-card" :class="{paused:!effective}"><span class="effective-dot"></span><div><b>{{effective?'AI đủ điều kiện tự tư vấn':'AI đang tạm dừng'}}</b><p>{{!config.global?'Công tắc tổng đang tắt.':config.manual?'Đã bật thủ công cho hội thoại này.':'Được chọn theo phạm vi “'+scopeName+'”.'}}</p></div></section>
      <div class="section-title"><h2>Điều khiển hội thoại</h2></div><section class="control-card"><ToggleRow :model-value="config.manual" title="Bật thủ công cho khách này" detail="Chọn riêng hội thoại vào diện tự tư vấn." @update:model-value="update('manual',$event)"/></section>
      <div class="policy-note"><b>Tắt bật thủ công có ý nghĩa gì?</b><p>Tắt lựa chọn này vẫn có thể được AI tư vấn nếu khách thuộc phạm vi chung. Muốn dừng toàn bộ, tắt công tắc tổng.</p></div>
      <div class="info-card" style="margin-top:20px"><div class="info-row"><span>Phạm vi chung</span><b>{{scopeName}}</b></div><div class="info-row"><span>Giá & đơn hàng</span><b>{{config.full?'Chế độ trọn':'Cần duyệt'}}</b></div><div class="info-row"><span>Nguồn kiến thức</span><b>Đã sẵn sàng</b></div></div>
      <button class="ai-settings-link" @click="go('scope')">Mở thiết lập chung <span>→</span></button><p class="ai-note">Trạng thái minh hoạ cho Zalo 1–1. Khi gửi thật, hệ thống còn kiểm tra thời gian, nguồn và các giới hạn khác.</p>
    </template>
    </main><footer class="sticky-action"><button class="primary" @click="$emit('save')">{{page==='conversation'?'Lưu lựa chọn hội thoại':'Lưu cài đặt'}}</button><p>Bản mô phỏng · Không thay đổi AI thật</p></footer><div class="home-indicator" aria-hidden="true"></div>
  </div></div>`
};
createApp({components:{AiPhone},setup(){
  const config=ref({assistant:true,global:true,scope:'new_customers',manual:false,strangers:false,full:false});
  const page=shallowRef(new URLSearchParams(location.search).get('page'));
  const saved=shallowRef(false);
  function change(key,value){config.value={...config.value,[key]:value};saved.value=false;}
  return {config,page,saved,change,save:()=>saved.value=true};
},template:`<div :class="page?'single-stage':'stage'"><header v-if="!page" class="board-head"><div><div class="board-brand">Cờ Rếp Việt · CRM</div><h1>AI hỗ trợ đúng lúc. Bạn giữ quyền điều khiển.</h1></div><div class="board-note">Thiết kế giao diện AI · 29.10.2026<br>Dữ liệu mẫu · Chưa triển khai</div></header><div :class="page?'':'board-grid'"><section v-for="(item,i) in (page?[page]:['settings','scope','conversation'])" :key="item"><h2 v-if="!page" class="spec-label">{{['01 / Trung tâm thiết lập AI','02 / Phạm vi & chế độ tự tư vấn','03 / Trạng thái từng hội thoại'][i]}}</h2><AiPhone :page="item" :config="config" @change="change" @navigate="page=$event" @save="save"/></section></div><p v-if="!page" class="screen-description">Thêm → Trợ lý AI · Thiết lập chung và lựa chọn hội thoại cùng dùng một cấu hình mẫu</p><div v-if="saved" class="demo-saved" role="status">Đã lưu trong bản mô phỏng. Không gửi dữ liệu lên hệ thống.</div></div>`}).mount('#app');

