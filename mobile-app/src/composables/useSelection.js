/**
 * 批量选择状态机（无外部依赖，便于单测与复用）。
 *
 * 入口：**长按学生行**（顶栏的「批量」按钮已让位给一键全班 PDPR）。
 * 选择结果以 id 数组保存 —— 学生对象会因重新加载而被替换，
 * 存对象引用会在 loadAttendance 后失效。
 */
import { ref, computed } from 'vue';

export function useSelection() {
  const selectMode = ref(false);
  const selectedIds = ref([]);

  const selCount = computed(() => selectedIds.value.length);
  const hasSelection = computed(() => selectedIds.value.length > 0);

  function exit() {
    selectMode.value = false;
    selectedIds.value = [];
  }
  function toggleSelectMode() {
    if (selectMode.value) exit();
    else selectMode.value = true;
  }
  /** 长按进入：把长按的那一行作为首个选中项，避免「进了批量却一个都没选」 */
  function enter(st) {
    if (selectMode.value) return;
    selectMode.value = true;
    selectedIds.value = st ? [st.id] : [];
  }
  function toggle(id) {
    const i = selectedIds.value.indexOf(id);
    if (i >= 0) selectedIds.value.splice(i, 1);
    else selectedIds.value.push(id);
  }
  function selectAll(ids) { selectedIds.value = ids.slice(); }
  function selectNone() { selectedIds.value = []; }
  function invert(ids) {
    const cur = new Set(selectedIds.value);
    selectedIds.value = ids.filter(id => !cur.has(id));
  }

  return {
    selectMode, selectedIds, selCount, hasSelection,
    exit, toggleSelectMode, enter, toggle, selectAll, selectNone, invert,
  };
}
