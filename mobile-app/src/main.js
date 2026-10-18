import { createApp } from 'vue';
import App from './App.vue';

// 样式按职责分片，顺序即层叠优先级
// fonts.css 必须最先：它只做 @font-face 声明，不含选择器，放在最前
// 可以让 base.css 里的 var(--f-hand) 引用时不出现「先使用后定义」的观感问题。
import './styles/fonts.css';
import './styles/base.css';
import './styles/components.css';
import './styles/attendance.css';
import './styles/sheets.css';

createApp(App).mount('#app');
