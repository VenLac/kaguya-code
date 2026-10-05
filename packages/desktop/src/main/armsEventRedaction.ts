import { redactTelemetryText, redactTelemetryUrl } from "@zcode/shared";

/**
 * ARMS SDK 自动采集事件离开本机前的脱敏收口。
 *
 * SDK collector 决定采集哪些字段，其原始内容可能包含用户界面文本（click）、本机路径与堆栈
 * （exception）以及完整 URL（api / resource）。`appARMSBootstrap.beforeReport` 是唯一能在上报前
 * 改写整批事件的位置，因此规则集中在这里，不分散到各 collector 配置。
 *
 * 脱敏只改写上报
 * 副本：网络聚合已在本函数之前完成 ingest，本地日志、错误展示与崩溃归档继续使用原值。
 */

/** exception 的 message 上限：与依赖补丁里 console 归一化的 2000 字符口径保持一致。 */
const EXCEPTION_MESSAGE_MAX_LENGTH = 2_000;

/** stack / snapshots 上限：保证最近的抛错帧一定上得去，同时不把整段正文送进 ARMS。 */
const EXCEPTION_STACK_MAX_LENGTH = 4_000;

/**
 * Browser SDK 的 click name 形如 `click on <type-><tag>: <innerText 前 20 字符>...`。
 * 只保留到 tag 为止；`: ` 之后是元素文本，在 Kaguya Code 里可能是会话标题、文件名或消息正文。
 */
const CLICK_NAME_PATTERN = /^(click on [a-z0-9-]+)(?::[\s\S]*)?$/iu;

/** 不符合预期形态的 name 不原样透传，退化为固定桶，保持事件可计数但不带内容。 */
const CLICK_NAME_FALLBACK = "click";

function isClickEvent(event: Record<string, unknown>): boolean {
  return event.event_type === "click" || event.type === "click";
}

function isExceptionEvent(event: Record<string, unknown>): boolean {
  return event.event_type === "exception";
}

function isNativeDumpEvent(event: Record<string, unknown>): boolean {
  // 原生 dump 由 crash collector 解析产生，其 binary_images / threads 已是结构化取证数据，
  // 且 filterAndEnrichNativeCrashEvents 依赖 binary_images 判定产品二进制，不能在这里改写。
  return event.type === "crash" && event.source === "crashReporter";
}

function isResourceEvent(event: Record<string, unknown>): boolean {
  const eventType = String(event.event_type ?? "").toLowerCase();
  return eventType === "api" || eventType === "resource" || eventType.includes("resource");
}

function redactTextField(event: Record<string, unknown>, key: string, maxLength: number): void {
  const value = event[key];
  if (typeof value !== "string" || !value) {
    return;
  }
  event[key] = redactTelemetryText(value, { maxLength });
}

function redactUrlField(event: Record<string, unknown>, key: string): void {
  const value = event[key];
  if (typeof value !== "string" || !value) {
    return;
  }
  event[key] = redactTelemetryUrl(value);
}

function redactClickEvent(event: Record<string, unknown>): void {
  const name = event.name;
  event.name =
    typeof name === "string"
      ? (CLICK_NAME_PATTERN.exec(name)?.[1] ?? CLICK_NAME_FALLBACK)
      : CLICK_NAME_FALLBACK;
  // snapshots 的 href / src 可能是本地文件路径，id / className 对诊断没有增量价值。
  delete event.snapshots;
}

function redactExceptionEvent(event: Record<string, unknown>): void {
  if (isNativeDumpEvent(event)) {
    return;
  }
  redactTextField(event, "message", EXCEPTION_MESSAGE_MAX_LENGTH);
  redactTextField(event, "stack", EXCEPTION_STACK_MAX_LENGTH);
  // 修复原因：jsError collector 把 ErrorEvent.filename 写进 file；Windows 安装版脚本位于
  // C:\Users\<用户名>\AppData\...，与 stack 同规则处理，line / column 等结构化字段不动。
  redactTextField(event, "file", EXCEPTION_MESSAGE_MAX_LENGTH);
  redactTextField(event, "snapshots", EXCEPTION_STACK_MAX_LENGTH);
}

function redactResourceEvent(event: Record<string, unknown>): void {
  redactUrlField(event, "url");
  redactUrlField(event, "name");
  redactTextField(event, "message", EXCEPTION_MESSAGE_MAX_LENGTH);
}

/**
 * 就地脱敏整批 SDK 自动采集事件，返回同一批次以便在 `beforeReport` 里链式使用。
 *
 * 只处理 click / exception / api-resource 三类自动采集事件；自定义事件（`perf_*` 等）由各自的
 * 构造处负责脱敏，不在这里二次改写，避免同一字段被两套规则处理后失去可读性。
 */
export function redactArmsEventBatch(
  events: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }
    if (isClickEvent(event)) {
      redactClickEvent(event);
      continue;
    }
    if (isExceptionEvent(event)) {
      redactExceptionEvent(event);
      continue;
    }
    if (isResourceEvent(event)) {
      redactResourceEvent(event);
    }
  }
  return events;
}
