/**
 * 设置页“离开前确认”守卫。
 *
 * 带有未保存草稿的分区（例如全局 AGENTS.md 编辑器）在有改动时注册守卫；
 * 设置页在切换分区、返回工作区之前先询问守卫。没有守卫时 `runAfterSettingsLeaveConfirmed`
 * 同步直接执行，不改变其他分区原有的同步行为。
 */
type SettingsLeaveGuard = () => Promise<boolean>;

let activeGuard: SettingsLeaveGuard | null = null;

/** 注册守卫，返回注销函数。同一时刻只有一个设置分区可见，所以只保留一个守卫。 */
export function registerSettingsLeaveGuard(guard: SettingsLeaveGuard): () => void {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) activeGuard = null;
  };
}

export function runAfterSettingsLeaveConfirmed(action: () => void): void {
  const guard = activeGuard;
  if (!guard) {
    action();
    return;
  }
  void guard().then((allowed) => {
    if (allowed) action();
  });
}
