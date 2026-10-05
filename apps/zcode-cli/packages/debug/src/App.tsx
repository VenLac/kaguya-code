import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock3,
  Clipboard,
  Database,
  FileJson,
  Globe2,
  Layers3,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Timeline as VisTimeline } from "vis-timeline/standalone";
import type {
  DataGroup as VisTimelineGroup,
  DataItem as VisTimelineItem,
  TimelineOptions,
} from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import type {
  CacheReport,
  ContextSectionSource,
  ContextSnapshotView,
  ContextUsageSnapshotView,
  ContextUsageSource,
  NetworkCaptureStatus,
  NetworkRequestRecord,
  NetworkRequestsResponse,
  ObservationChangeEvent,
  ObservationHelloEvent,
  ObservationSourceErrorEvent,
  ProjectSummary,
  SourceStatus,
  TokenConfidence,
  TokenMethod,
  TimelineItem,
  TraceDetailResponse,
  TraceListResponse,
  TraceSpan,
  TraceSpanLane,
  TraceSummary,
} from "./shared";
import { ganttItemStyle } from "./gantt-style";

interface SourceInputs {
  projectId: string;
  logDir: string;
  eventPath: string;
  dbPath: string;
  sessionId: string;
}

interface ObservationEventState {
  connected: boolean;
  error: string | null;
  lastChangeAt?: string;
  watchedPathCount: number;
}

const emptyInputs: SourceInputs = {
  projectId: "",
  logDir: "",
  eventPath: "",
  dbPath: "",
  sessionId: "",
};

const lastProjectStorageKey = "zcode-debug:last-project-id";
type EnvShell = "posix" | "powershell" | "cmd";
type DebugView = "trace" | "gantt" | "network";

const envShellLabels: Record<EnvShell, string> = {
  posix: "POSIX",
  powershell: "PowerShell",
  cmd: "CMD",
};

const viewLabels: Record<DebugView, string> = {
  trace: "Trace",
  gantt: "甘特图",
  network: "网络请求",
};

const laneOrder: TraceSpanLane[] = [
  "turn",
  "model",
  "tool",
  "permission",
  "subagent",
  "network",
  "storage",
  "log",
  "event",
];

const laneLabels: Record<TraceSpanLane, string> = {
  turn: "Turn",
  model: "模型",
  tool: "工具",
  network: "网络",
  permission: "权限",
  storage: "存储",
  subagent: "子 Agent",
  event: "事件",
  log: "日志",
};

const sourceLabels: Record<ContextSectionSource, string> = {
  system_prompt: "系统",
  skills: "技能",
  tools: "工具",
  other: "其他",
};

const sourceClasses: Record<ContextSectionSource, string> = {
  system_prompt: "tone-system",
  skills: "tone-skills",
  tools: "tone-tools",
  other: "tone-other",
};

const usageSourceLabels: Record<ContextUsageSource, string> = {
  system_prompt: "系统提示",
  meta_user_context: "Meta User 上下文",
  skills: "技能",
  tool_prompt: "工具提示",
  system_tool_schemas: "系统工具",
  mcp_tool_schemas: "MCP 工具",
  messages: "消息",
  other: "其他",
};

const usageSourceClasses: Record<ContextUsageSource, string> = {
  system_prompt: "tone-system",
  meta_user_context: "tone-meta-user",
  skills: "tone-skills",
  tool_prompt: "tone-tools",
  system_tool_schemas: "tone-tool-schema",
  mcp_tool_schemas: "tone-mcp",
  messages: "tone-messages",
  other: "tone-other",
};

export function App() {
  const [inputs, setInputs] = useState<SourceInputs>(emptyInputs);
  const [traceId, setTraceId] = useState("");
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [detail, setDetail] = useState<TraceDetailResponse | null>(null);
  const [view, setView] = useState<DebugView>(() => viewFromHash(window.location.hash));
  const [networkFilter, setNetworkFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const network = useNetworkCapture();

  const query = useMemo(() => buildQuery(inputs), [inputs]);
  const spans = useMemo(
    () => mergeNetworkSpans(detail?.spans ?? [], network.requests, traceId),
    [detail?.spans, network.requests, traceId],
  );
  const setDebugView = useCallback((nextView: DebugView) => {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
  }, []);
  const selectTrace = useCallback((nextTraceId: string) => {
    setTraceId(nextTraceId);
  }, []);

  const loadTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJson<TraceListResponse>(`/api/traces${query}`);
      setTraces(response.traces);
      setProjects(response.projects);
      setSources(response.sources);

      if (!inputs.projectId && response.projects.length > 0) {
        const lastProjectId = window.localStorage.getItem(lastProjectStorageKey);
        const nextProjectId =
          response.projects.find((project) => project.projectId === lastProjectId)?.projectId ??
          response.projects[0]?.projectId;
        if (nextProjectId) {
          setInputs((current) => ({ ...current, projectId: nextProjectId }));
        }
      }

      const hasCurrentTrace = response.traces.some((trace) => trace.traceId === traceId);
      if (!hasCurrentTrace) {
        setTraceId(response.traces[0]?.traceId ?? "");
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [inputs.projectId, query, traceId]);

  const loadTraceDetail = useCallback(async () => {
    if (!traceId.trim()) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(traceId.trim());
      const response = await fetchJson<TraceDetailResponse>(`/api/traces/${encoded}${query}`);
      setDetail(response);
      setSources(response.sources);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [query, traceId]);

  const refreshObservations = useCallback(() => {
    void loadTraces();
    void loadTraceDetail();
  }, [loadTraceDetail, loadTraces]);
  const observationEvents = useObservationEvents(query, refreshObservations);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  useEffect(() => {
    void loadTraceDetail();
  }, [loadTraceDetail]);

  useEffect(() => {
    if (inputs.projectId) {
      window.localStorage.setItem(lastProjectStorageKey, inputs.projectId);
    }
  }, [inputs.projectId]);

  useEffect(() => {
    const syncViewFromHash = () => setView(viewFromHash(window.location.hash));
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Kaguya Code 调试台</h1>
          <p>Trace、甘特执行、网络抓包</p>
        </div>
        <div className="topbar-actions">
          <ViewTabs activeView={view} onChange={setDebugView} />
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadTraces()}
            title="刷新"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="control-strip" aria-label="调试控制">
        <ProjectSelect
          projects={projects}
          value={inputs.projectId}
          onChange={(value) => {
            setInputs((current) => ({ ...current, projectId: value }));
            setTraceId("");
          }}
        />
        <TraceSelect traces={traces} value={traceId} onChange={selectTrace} />
      </section>

      {error ? (
        <div className="notice error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <SourceBar sources={sources} loading={loading} live={observationEvents} />

      {view === "trace" ? (
        <div className="workspace-grid">
          <TimelinePanel items={detail?.timeline ?? []} />
          <div className="side-stack">
            <ContextPanel
              snapshots={detail?.contextSnapshots ?? []}
              usageSnapshots={detail?.contextUsageSnapshots ?? []}
            />
            <CachePanel reports={detail?.cacheReports ?? []} />
            <GapsPanel requests={detail?.developerRequests ?? []} />
          </div>
        </div>
      ) : null}

      {view === "gantt" ? (
        <div className="gantt-page">
          <ExecutionGanttPanel spans={spans} traceId={traceId} />
        </div>
      ) : null}

      {view === "network" ? (
        <NetworkPage
          activeTraceId={traceId}
          error={network.error}
          filter={networkFilter}
          onFilterChange={setNetworkFilter}
          onTraceSelect={(nextTraceId) => {
            selectTrace(nextTraceId);
            setDebugView("gantt");
          }}
          requests={network.requests}
          status={network.status}
        />
      ) : null}
    </main>
  );
}

function ViewTabs(props: { activeView: DebugView; onChange: (view: DebugView) => void }) {
  return (
    <nav className="view-tabs" aria-label="调试视图">
      {(Object.keys(viewLabels) as DebugView[]).map((view) => (
        <button
          aria-current={props.activeView === view ? "page" : undefined}
          className={props.activeView === view ? "active" : ""}
          key={view}
          onClick={() => props.onChange(view)}
          type="button"
        >
          {viewLabels[view]}
        </button>
      ))}
    </nav>
  );
}

function ProjectSelect(props: {
  projects: ProjectSummary[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>项目</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">全部项目</option>
        {props.projects.map((project) => (
          <option key={project.projectId} value={project.projectId}>
            {project.label}（{project.sessionCount}）
          </option>
        ))}
      </select>
    </label>
  );
}

function TraceSelect(props: {
  traces: TraceSummary[];
  value: string;
  onChange: (traceId: string) => void;
}) {
  return (
    <label>
      <span>Trace</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">选择 Trace</option>
        {props.traces.map((trace) => (
          <option key={trace.traceId} value={trace.traceId}>
            {trace.traceId} - {trace.firstUserMessage ?? "没有观察到用户消息"}
          </option>
        ))}
      </select>
    </label>
  );
}

function SourceBar({
  sources,
  loading,
  live,
}: {
  sources: SourceStatus[];
  loading: boolean;
  live: ObservationEventState;
}) {
  const showLoading = useDelayedVisible(loading, 180);
  return (
    <section className="source-bar" aria-label="观测数据源">
      <div className={`source-pill live ${live.connected ? "ready" : "muted"}`}>
        <Radio size={16} />
        <div>
          <strong>{live.connected ? "实时推送" : "实时重连"}</strong>
          <span>
            {live.lastChangeAt
              ? `最近更新 ${formatTime(live.lastChangeAt)}`
              : `${live.watchedPathCount} 个路径`}
          </span>
        </div>
        {live.error ? <small>{live.error}</small> : <small>SSE</small>}
      </div>
      {sources.map((source) => (
        <div className={`source-pill ${source.available ? "ready" : "muted"}`} key={source.kind}>
          {source.kind === "sqlite" ? <Database size={16} /> : <FileJson size={16} />}
          <div>
            <strong>{source.label}</strong>
            <span>{source.recordCount} 条记录</span>
          </div>
          {source.warning ? <small>{source.warning}</small> : null}
        </div>
      ))}
      <div className={`loading-dot ${showLoading ? "visible" : ""}`} aria-hidden={!showLoading}>
        加载中
      </div>
    </section>
  );
}

function NetworkPage(props: {
  activeTraceId: string;
  error: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onTraceSelect: (traceId: string) => void;
  requests: NetworkRequestRecord[];
  status: NetworkCaptureStatus | null;
}) {
  const filteredRequests = useMemo(
    () => filterNetworkRequests(props.requests, props.filter),
    [props.filter, props.requests],
  );

  return (
    <div className="network-page">
      <section className="network-control-strip" aria-label="网络请求过滤">
        <label>
          <span>过滤</span>
          <div className="input-with-icon">
            <Search size={16} />
            <input
              value={props.filter}
              onChange={(event) => props.onFilterChange(event.target.value)}
              placeholder="trace、host、URL、method"
            />
          </div>
        </label>
        <button
          className="secondary-button"
          disabled={!props.activeTraceId}
          onClick={() => props.onFilterChange(props.activeTraceId)}
          type="button"
        >
          当前 Trace
        </button>
        <button
          className="secondary-button"
          disabled={!props.filter}
          onClick={() => props.onFilterChange("")}
          type="button"
        >
          清空
        </button>
      </section>
      <NetworkPanel
        activeTraceId={props.activeTraceId}
        error={props.error}
        requests={filteredRequests}
        status={props.status}
        onTraceSelect={props.onTraceSelect}
      />
    </div>
  );
}

function NetworkPanel(props: {
  activeTraceId: string;
  error: string | null;
  requests: NetworkRequestRecord[];
  status: NetworkCaptureStatus | null;
  onTraceSelect: (traceId: string) => void;
}) {
  const [envShell, setEnvShell] = useState<EnvShell>("posix");
  const [copiedShell, setCopiedShell] = useState<EnvShell | null>(null);
  const activeTraceCount = props.activeTraceId
    ? props.requests.filter((request) => request.traceId === props.activeTraceId).length
    : 0;
  const envCommand = useMemo(
    () => formatEnvCommand(props.status?.env ?? {}, envShell),
    [envShell, props.status?.env],
  );

  useEffect(() => {
    if (!copiedShell) return;
    const timer = window.setTimeout(() => setCopiedShell(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedShell]);

  const copyEnvCommand = useCallback(async () => {
    if (!envCommand) return;
    await copyTextToClipboard(envCommand);
    setCopiedShell(envShell);
  }, [envCommand, envShell]);

  return (
    <section className="panel network-panel">
      <PanelTitle icon={<Globe2 size={17} />} title="网络请求" />
      {props.error ? (
        <div className="network-error">
          <AlertTriangle size={15} />
          <span>{props.error}</span>
        </div>
      ) : null}
      <div className="network-head">
        <div className={props.status?.running ? "network-state ready" : "network-state muted"}>
          <ShieldCheck size={16} />
          <div>
            <strong>{props.status?.running ? "代理运行中" : "代理未运行"}</strong>
            <span>{props.status?.proxyUrl ?? "未启用"}</span>
          </div>
        </div>
        <div className="network-stat">
          <span>最近请求</span>
          <strong>{props.requests.length}</strong>
        </div>
        <div className="network-stat">
          <span>当前 Trace</span>
          <strong>{activeTraceCount}</strong>
        </div>
        <div className="network-stat wide">
          <span>CA</span>
          <strong>{props.status?.certificate.caCertPath ?? "未生成"}</strong>
        </div>
      </div>
      {envCommand ? (
        <div className="env-copy-box">
          <div className="env-copy-toolbar">
            <div className="segmented-control" aria-label="环境变量 shell 格式">
              {(Object.keys(envShellLabels) as EnvShell[]).map((shell) => (
                <button
                  aria-pressed={envShell === shell}
                  className={envShell === shell ? "active" : ""}
                  key={shell}
                  onClick={() => setEnvShell(shell)}
                  type="button"
                >
                  {envShellLabels[shell]}
                </button>
              ))}
            </div>
            <button className="copy-button" onClick={() => void copyEnvCommand()} type="button">
              {copiedShell === envShell ? <Check size={15} /> : <Clipboard size={15} />}
              <span>{copiedShell === envShell ? "已复制" : "复制环境"}</span>
            </button>
          </div>
          <pre className="env-command">
            <code>{envCommand}</code>
          </pre>
        </div>
      ) : null}
      <div className="network-list">
        {props.requests.length === 0 ? <EmptyLine text="等待被测 CLI 的网络请求" /> : null}
        {props.requests.map((request) => (
          <article
            className={
              request.traceId && request.traceId === props.activeTraceId
                ? "network-row active"
                : "network-row"
            }
            key={request.id}
          >
            <div className="network-row-main">
              <span className={`method method-${request.method.toLowerCase()}`}>
                {request.method}
              </span>
              <strong title={request.url}>{request.url}</strong>
              <span className={`request-status status-${request.status}`}>
                {formatNetworkStatus(request)}
              </span>
            </div>
            <div className="network-row-meta">
              <time>{formatTime(request.startedAt)}</time>
              <span>{formatDuration(request.durationMs)}</span>
              <span>{formatBytes(request.requestBodyBytes)} up</span>
              <span>{formatBytes(request.responseBodyBytes)} down</span>
              {request.traceId ? (
                <button
                  className="trace-chip"
                  onClick={() => props.onTraceSelect(request.traceId ?? "")}
                  title="选择这个 Trace"
                  type="button"
                >
                  {request.traceId}
                </button>
              ) : (
                <code>未归因</code>
              )}
              {request.sessionId ? <code>{request.sessionId}</code> : null}
              {request.error ? <span className="network-row-error">{request.error}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExecutionGanttPanel({ spans, traceId }: { spans: TraceSpan[]; traceId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<VisTimeline | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const visibleSpans = useMemo(
    () => spans.toSorted((left, right) => compareDateAsc(left.startAt, right.startAt)),
    [spans],
  );
  const groups = useMemo(() => buildGanttGroups(visibleSpans), [visibleSpans]);
  const items = useMemo(() => buildGanttItems(visibleSpans), [visibleSpans]);
  const selectedSpan =
    visibleSpans.find((span) => span.id === selectedSpanId) ?? visibleSpans[0] ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const timeline = new VisTimeline(container, [], [], ganttOptions(false));
    timelineRef.current = timeline;
    const handleSelect = (properties?: { items?: Array<string | number> }) => {
      const id = properties?.items?.[0];
      setSelectedSpanId(id === undefined ? null : String(id));
    };
    timeline.on("select", handleSelect);
    return () => {
      timeline.off("select", handleSelect);
      timeline.destroy();
      timelineRef.current = null;
    };
  }, []);

  useEffect(() => {
    timelineRef.current?.setData({ groups, items });
    if (items.length > 0) {
      timelineRef.current?.fit();
    }
  }, [groups, items]);

  useEffect(() => {
    if (selectedSpanId && visibleSpans.some((span) => span.id === selectedSpanId)) return;
    setSelectedSpanId(visibleSpans[0]?.id ?? null);
  }, [selectedSpanId, visibleSpans]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    timeline.setOptions(ganttOptions(isFullscreen));
    const refit = () => {
      timeline.redraw();
      if (items.length > 0) timeline.fit();
    };
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      timeline.redraw();
      secondFrame = window.requestAnimationFrame(refit);
    });
    window.addEventListener("resize", refit);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("resize", refit);
    };
  }, [isFullscreen, items.length]);

  return (
    <section className={isFullscreen ? "panel gantt-panel fullscreen" : "panel gantt-panel"}>
      <div className="gantt-toolbar">
        <PanelTitle icon={<BarChart3 size={17} />} title="执行甘特图" />
        <div className="gantt-toolbar-actions">
          <button
            className="icon-button"
            onClick={() => setIsFullscreen((current) => !current)}
            title={isFullscreen ? "退出窗口内全屏" : "窗口内全屏"}
            type="button"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button
            className="secondary-button"
            disabled={items.length === 0}
            onClick={() => timelineRef.current?.fit()}
            type="button"
          >
            适配视图
          </button>
        </div>
      </div>
      <div className="gantt-summary">
        <Metric label="Trace" value={traceId || "未选择"} />
        <Metric label="执行段" value={String(visibleSpans.length)} />
        <Metric
          label="网络段"
          value={String(visibleSpans.filter((span) => span.lane === "network").length)}
        />
      </div>
      <div className="gantt-shell">
        <div className="gantt-canvas" ref={containerRef} />
        {visibleSpans.length === 0 ? (
          <div className="gantt-empty">
            <EmptyLine text="没有可渲染的执行段。需要 turn/tool/model start/end 事件或网络归因。" />
          </div>
        ) : null}
      </div>
      {selectedSpan ? <SpanDetail span={selectedSpan} /> : null}
    </section>
  );
}

function SpanDetail({ span }: { span: TraceSpan }) {
  return (
    <aside className="gantt-detail" aria-label="执行段详情">
      <div className="gantt-detail-heading">
        <strong>{span.label}</strong>
        <span className={`request-status status-${span.status}`}>
          {formatSpanStatus(span.status)}
        </span>
      </div>
      <MetaLine
        values={[
          laneLabels[span.lane],
          span.source,
          formatTime(span.startAt),
          formatSpanDuration(span),
          span.traceId ? `trace ${span.traceId}` : "",
          span.sessionId ? `session ${span.sessionId}` : "",
          span.turnId ? `turn ${span.turnId}` : "",
          span.toolCallId ? `tool ${span.toolCallId}` : "",
        ]}
      />
      {span.summary ? <p>{span.summary}</p> : null}
      {span.payload !== undefined ? <TimelinePayload payload={span.payload} /> : null}
    </aside>
  );
}

function TimelinePanel({ items }: { items: TimelineItem[] }) {
  return (
    <section className="panel timeline-panel">
      <PanelTitle icon={<Clock3 size={17} />} title="时间线" />
      <div className="timeline">
        {items.length === 0 ? <EmptyLine text="选择 Trace 后查看事件" /> : null}
        {items.map((item) => (
          <article className={`timeline-item severity-${item.severity ?? "info"}`} key={item.id}>
            <time>{formatTime(item.at)}</time>
            <div>
              <div className="timeline-heading">
                <strong>{item.label}</strong>
                <span>{item.source}</span>
              </div>
              <p className="timeline-summary">{item.summary}</p>
              {item.payload !== undefined ? <TimelinePayload payload={item.payload} /> : null}
              <MetaLine
                values={[
                  item.sessionId ? `会话 ${item.sessionId}` : "",
                  item.turnId ? `轮次 ${item.turnId}` : "",
                  item.toolCallId ? `工具 ${item.toolCallId}` : "",
                ]}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TimelinePayload({ payload }: { payload: unknown }) {
  return (
    <details className="timeline-payload">
      <summary>原始 Payload</summary>
      <pre>{stringifyPayload(payload)}</pre>
    </details>
  );
}

function ContextPanel({
  snapshots,
  usageSnapshots,
}: {
  snapshots: ContextSnapshotView[];
  usageSnapshots: ContextUsageSnapshotView[];
}) {
  const snapshot = useMemo(
    () => snapshots.findLast((item) => item.observationLevel === "full") ?? snapshots.at(-1),
    [snapshots],
  );
  const usageSnapshot = usageSnapshots.at(-1);
  const grouped = useMemo(() => groupSections(snapshot), [snapshot]);

  return (
    <section className="panel context-panel">
      <PanelTitle icon={<Layers3 size={17} />} title="上下文" />
      {!snapshot && !usageSnapshot ? <EmptyLine text="未观察到上下文快照" /> : null}
      {usageSnapshot ? (
        <div className="usage-snapshot">
          <div className="usage-heading">
            <strong>占用快照</strong>
            <span>
              {formatTokenMethod(usageSnapshot.tokenMethod)} ·{" "}
              {formatConfidence(usageSnapshot.confidence)}
            </span>
          </div>
          <div className="metric-row">
            <Metric label="估算 Token" value={usageSnapshot.totalTokens.toLocaleString()} />
            <Metric label="字符" value={usageSnapshot.totalChars.toLocaleString()} />
            <Metric label="算法" value={usageSnapshot.tokenizer ?? "未知"} />
          </div>
          <div className="stack-bar" aria-label="上下文占用 token 分类">
            {usageSnapshot.categories.map((category) => (
              <span
                className={usageSourceClasses[category.source]}
                key={category.id}
                style={{ width: `${Math.max(category.percentTokens * 100, 2)}%` }}
                title={`${usageSourceLabels[category.source]} ${Math.round(category.percentTokens * 100)}%`}
              />
            ))}
          </div>
          <div className="usage-list">
            {usageSnapshot.categories.map((category) => (
              <div className="usage-row" key={category.id}>
                <span className={`dot ${usageSourceClasses[category.source]}`} />
                <strong>{usageSourceLabels[category.source]}</strong>
                <small>
                  {category.tokens.toLocaleString()} Token ·{" "}
                  {Math.round(category.percentTokens * 100)}% ·{" "}
                  {formatTokenMethod(category.tokenMethod)}
                </small>
              </div>
            ))}
          </div>
          {usageSnapshot.mcpTools.length > 0 ? (
            <details className="usage-details">
              <summary>MCP 工具明细</summary>
              <div className="usage-list">
                {usageSnapshot.mcpTools.map((tool) => (
                  <div className="usage-row" key={tool.name}>
                    <span className="dot tone-mcp" />
                    <strong>{tool.name}</strong>
                    <small>
                      {tool.serverName ?? "unknown"} · {tool.tokens.toLocaleString()} Token ·{" "}
                      {formatTokenMethod(tool.tokenMethod)}
                    </small>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {usageSnapshot.skills.length > 0 ? (
            <details className="usage-details">
              <summary>技能明细</summary>
              <div className="usage-list">
                {usageSnapshot.skills.map((skill) => (
                  <div className="usage-row" key={`${skill.source ?? "skill"}:${skill.name}`}>
                    <span className="dot tone-skills" />
                    <strong>{skill.name}</strong>
                    <small>
                      {skill.source ?? "unknown"} · {skill.tokens.toLocaleString()} Token ·{" "}
                      {formatTokenMethod(skill.tokenMethod)}
                    </small>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {usageSnapshot.warnings.map((warning) => (
            <p className="soft-warning" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      {snapshot ? (
        <>
          <div className="usage-heading">
            <strong>文本快照</strong>
            <span>{formatObservationLevel(snapshot.observationLevel)}</span>
          </div>
          <div className="metric-row">
            <Metric label="Token" value={snapshot.totalTokens.toLocaleString()} />
            <Metric label="字符" value={snapshot.totalChars.toLocaleString()} />
            <Metric label="观测" value={formatObservationLevel(snapshot.observationLevel)} />
          </div>
          <div className="stack-bar" aria-label="上下文 token 占比">
            {grouped.map((group) => (
              <span
                className={sourceClasses[group.source]}
                key={group.source}
                style={{ width: `${Math.max(group.percent * 100, 2)}%` }}
                title={`${sourceLabels[group.source]} ${Math.round(group.percent * 100)}%`}
              />
            ))}
          </div>
          <div className="section-list">
            {snapshot.sections.map((section) => (
              <details key={section.id}>
                <summary>
                  <span className={`dot ${sourceClasses[section.source]}`} />
                  <strong>{section.name}</strong>
                  <small>
                    {sourceLabels[section.source]} · {section.tokens.toLocaleString()} Token ·{" "}
                    {Math.round(section.percentTokens * 100)}%
                  </small>
                </summary>
                <pre>{section.content ?? section.preview ?? "只有元数据"}</pre>
              </details>
            ))}
          </div>
          {snapshot.warnings.map((warning) => (
            <p className="soft-warning" key={warning}>
              {warning}
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}

function CachePanel({ reports }: { reports: CacheReport[] }) {
  const report = reports.at(-1);
  const segments = report?.segments.filter(isRenderableCacheSegment) ?? [];

  return (
    <section className="panel cache-panel">
      <PanelTitle icon={<BarChart3 size={17} />} title="缓存" />
      {!report ? <EmptyLine text="未观察到缓存使用" /> : null}
      {report ? (
        <>
          <div className="metric-row">
            <Metric label="读取" value={report.cacheReadTokens.toLocaleString()} />
            <Metric label="写入" value={report.cacheWriteTokens.toLocaleString()} />
            <Metric
              label="命中"
              value={report.hitRate === null ? "未知" : `${Math.round(report.hitRate * 100)}%`}
            />
          </div>
          {segments.length > 0 ? (
            <div className="cache-segments">
              {segments.map((segment) => (
                <article className={`cache-segment ${segment.status}`} key={segment.id}>
                  <strong>{formatCacheStatus(segment.status)}</strong>
                  <span>{formatSegmentLabel(segment.role ?? segment.source)}</span>
                  <p>{segment.preview}</p>
                  {segment.reason ? <small>{segment.reason}</small> : null}
                </article>
              ))}
            </div>
          ) : null}
          {report.limitations.map((limitation) => (
            <p className="soft-warning" key={limitation}>
              {limitation}
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}

function isRenderableCacheSegment(segment: CacheReport["segments"][number]): boolean {
  return segment.preview !== "SQLite 的 step-finish token usage 不包含 provider 可见文本。";
}

function GapsPanel({ requests }: { requests: TraceDetailResponse["developerRequests"] }) {
  return (
    <section className="panel gaps-panel">
      <PanelTitle icon={<AlertTriangle size={17} />} title="观测缺口" />
      {requests.length === 0 ? <EmptyLine text="当前 trace 没有观测缺口" /> : null}
      {requests.map((request) => (
        <article className="request-row" key={request.eventName}>
          <strong>{request.title}</strong>
          <p>{request.reason}</p>
          <code>{request.eventName}</code>
        </article>
      ))}
    </section>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="empty-line">{text}</p>;
}

function MetaLine({ values }: { values: string[] }) {
  const cleanValues = values.filter(Boolean);
  if (cleanValues.length === 0) return null;
  return <small className="meta-line">{cleanValues.join(" · ")}</small>;
}

function useObservationEvents(query: string, onChange: () => void): ObservationEventState {
  const onChangeRef = useRef(onChange);
  const [state, setState] = useState<ObservationEventState>({
    connected: false,
    error: null,
    watchedPathCount: 0,
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let closed = false;
    let refreshTimer: number | undefined;
    const events = new EventSource(`/api/observations/events${query}`);

    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!closed) onChangeRef.current();
      }, 180);
    };

    events.addEventListener("hello", (event) => {
      const parsed = parseMessageEvent<ObservationHelloEvent>(event);
      if (!parsed || closed) return;
      setState({
        connected: true,
        error: null,
        watchedPathCount: parsed.sources.length,
      });
    });
    events.addEventListener("change", (event) => {
      const parsed = parseMessageEvent<ObservationChangeEvent>(event);
      if (!parsed || closed) return;
      setState({
        connected: true,
        error: null,
        lastChangeAt: parsed.changedAt,
        watchedPathCount: parsed.sources.length,
      });
      scheduleRefresh();
    });
    events.addEventListener("source-error", (event) => {
      const parsed = parseMessageEvent<ObservationSourceErrorEvent>(event);
      if (!parsed || closed) return;
      setState((current) => ({
        ...current,
        connected: true,
        error: parsed.message,
      }));
    });
    events.addEventListener("open", () => {
      if (!closed) {
        setState((current) => ({ ...current, connected: true, error: null }));
      }
    });
    events.addEventListener("error", () => {
      if (!closed) {
        setState((current) => ({
          ...current,
          connected: false,
          error: "观测事件流已断开，正在等待浏览器重连。",
        }));
      }
    });

    return () => {
      closed = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      events.close();
    };
  }, [query]);

  return state;
}

function useDelayedVisible(visible: boolean, delayMs: number): boolean {
  const [delayedVisible, setDelayedVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDelayedVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setDelayedVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, visible]);

  return delayedVisible;
}

function useNetworkCapture(): {
  status: NetworkCaptureStatus | null;
  requests: NetworkRequestRecord[];
  error: string | null;
} {
  const [status, setStatus] = useState<NetworkCaptureStatus | null>(null);
  const [requests, setRequests] = useState<NetworkRequestRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;

    async function loadInitialState() {
      try {
        const response = await fetchJson<NetworkRequestsResponse>(
          "/api/network/requests?limit=200",
        );
        if (closed) return;
        setStatus(response.status);
        setRequests(response.requests);
      } catch (fetchError) {
        if (!closed)
          setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      }
    }

    void loadInitialState();
    const events = new EventSource("/api/network/events");
    events.addEventListener("status", (event) => {
      const parsed = parseMessageEvent<NetworkCaptureStatus>(event);
      if (parsed && !closed) setStatus(parsed);
    });
    events.addEventListener("snapshot", (event) => {
      const parsed = parseMessageEvent<NetworkRequestRecord[]>(event);
      if (parsed && !closed) setRequests(parsed);
    });
    events.addEventListener("request", (event) => {
      const parsed = parseMessageEvent<NetworkRequestRecord>(event);
      if (parsed && !closed) {
        setRequests((current) => mergeNetworkRequest(current, parsed));
      }
    });
    events.addEventListener("reset", () => {
      if (!closed) setRequests([]);
    });
    events.addEventListener("error", () => {
      if (!closed) setError("网络抓包事件流已断开，正在等待浏览器重连。");
    });
    events.addEventListener("open", () => {
      if (!closed) setError(null);
    });

    return () => {
      closed = true;
      events.close();
    };
  }, []);

  return { status, requests, error };
}

function groupSections(snapshot?: ContextSnapshotView) {
  const groups = new Map<ContextSectionSource, number>();
  for (const section of snapshot?.sections ?? []) {
    groups.set(section.source, (groups.get(section.source) ?? 0) + section.tokens);
  }
  const total = [...groups.values()].reduce((sum, value) => sum + value, 0);
  return [...groups.entries()].map(([source, tokens]) => ({
    source,
    tokens,
    percent: total > 0 ? tokens / total : 0,
  }));
}

function buildQuery(inputs: SourceInputs): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(inputs)) {
    if (value.trim()) params.set(key, value.trim());
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2) ?? String(payload);
  } catch {
    return String(payload);
  }
}

function parseMessageEvent<T>(event: Event): T | null {
  const data = (event as MessageEvent<string>).data;
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function formatEnvCommand(env: Record<string, string>, shell: EnvShell): string {
  const entries = Object.entries(env);
  if (entries.length === 0) return "";
  if (shell === "powershell") {
    return entries.map(([name, value]) => `$env:${name} = ${quotePowerShell(value)}`).join("\n");
  }
  if (shell === "cmd") {
    return entries
      .map(([name, value]) => `set "${name}=${value.replaceAll('"', '\\"')}"`)
      .join("\n");
  }
  return entries.map(([name, value]) => `export ${name}=${quotePosix(value)}`).join("\n");
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function mergeNetworkRequest(
  current: NetworkRequestRecord[],
  next: NetworkRequestRecord,
): NetworkRequestRecord[] {
  const byId = new Map(current.map((request) => [request.id, request]));
  byId.set(next.id, next);
  return [...byId.values()]
    .toSorted((left, right) => compareDateDesc(left.startedAt, right.startedAt))
    .slice(0, 200);
}

function mergeNetworkSpans(
  spans: TraceSpan[],
  requests: NetworkRequestRecord[],
  traceId: string,
): TraceSpan[] {
  if (!traceId) return spans;
  const networkSpans = requests
    .filter((request) => request.traceId === traceId)
    .map(networkRequestToSpan);
  return [...spans, ...networkSpans];
}

function networkRequestToSpan(request: NetworkRequestRecord): TraceSpan {
  return {
    id: `network:${request.id}`,
    traceId: request.traceId,
    sessionId: request.sessionId,
    turnId: request.turnId,
    spanId: request.spanId,
    lane: "network",
    label: `${request.method} ${request.host}`,
    source: "network",
    startAt: request.startedAt,
    endAt: request.completedAt,
    status: request.status === "pending" ? "running" : request.status === "error" ? "error" : "ok",
    summary: `${request.method} ${request.url}\n${formatNetworkStatus(request)} · ${formatBytes(
      request.requestBodyBytes,
    )} up · ${formatBytes(request.responseBodyBytes)} down`,
    payload: request,
  };
}

function filterNetworkRequests(
  requests: NetworkRequestRecord[],
  filter: string,
): NetworkRequestRecord[] {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return requests;
  return requests.filter((request) =>
    [
      request.traceId,
      request.sessionId,
      request.turnId,
      request.spanId,
      request.method,
      request.host,
      request.path,
      request.url,
      request.status,
      request.statusCode ? String(request.statusCode) : "",
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized)),
  );
}

function buildGanttGroups(spans: TraceSpan[]): VisTimelineGroup[] {
  const activeLanes = new Set(spans.map((span) => span.lane));
  return laneOrder
    .filter((lane) => activeLanes.has(lane))
    .map((lane, index) => ({
      id: lane,
      content: laneLabels[lane],
      order: index,
      className: `gantt-group lane-${lane}`,
    }));
}

function buildGanttItems(spans: TraceSpan[]): VisTimelineItem[] {
  return spans.map((span) => {
    const runningEndAt =
      !span.endAt && span.status === "running" ? new Date().toISOString() : undefined;
    const type = span.endAt || runningEndAt ? "range" : "point";
    return {
      id: span.id,
      group: span.lane,
      content: ganttItemContent(span),
      title: escapeTimelineContent(ganttItemTitle(span)),
      start: span.startAt,
      end: span.endAt ?? runningEndAt,
      type,
      style: ganttItemStyle(type),
      className: `gantt-item lane-${span.lane} span-status-${span.status}`,
    };
  });
}

function ganttItemContent(span: TraceSpan): string {
  return [
    `<span class="gantt-item-title">${escapeTimelineContent(span.label)}</span>`,
    `<span class="gantt-item-meta"> · ${escapeTimelineContent(ganttItemMeta(span))}</span>`,
  ].join("");
}

function ganttItemTitle(span: TraceSpan): string {
  return [
    span.label,
    `${laneLabels[span.lane]} · ${formatSpanStatus(span.status)} · ${formatSpanDuration(span)}`,
    ganttIdentifierLine(span),
    span.summary,
  ]
    .filter(Boolean)
    .join("\n");
}

function ganttItemMeta(span: TraceSpan): string {
  const request = networkRequestFromPayload(span.payload);
  if (request) {
    return [formatNetworkStatus(request), formatDuration(request.durationMs)].join(" · ");
  }

  return [formatSpanStatus(span.status), formatSpanDuration(span)].join(" · ");
}

function ganttIdentifierLine(span: TraceSpan): string {
  return [
    span.traceId ? `trace ${span.traceId}` : "",
    span.sessionId ? `session ${span.sessionId}` : "",
    span.turnId ? `turn ${span.turnId}` : "",
    span.toolCallId ? `tool ${span.toolCallId}` : "",
    span.spanId ? `span ${span.spanId}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function networkRequestFromPayload(payload: unknown): NetworkRequestRecord | null {
  if (!isPlainObject(payload)) return null;
  if (typeof payload.id !== "string") return null;
  if (typeof payload.startedAt !== "string") return null;
  if (typeof payload.method !== "string") return null;
  if (typeof payload.url !== "string") return null;
  if (typeof payload.status !== "string") return null;
  return payload as unknown as NetworkRequestRecord;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ganttOptions(isFullscreen: boolean): TimelineOptions {
  return {
    stack: true,
    autoResize: true,
    selectable: true,
    showCurrentTime: false,
    horizontalScroll: true,
    verticalScroll: true,
    zoomKey: "ctrlKey",
    orientation: { axis: "top", item: isFullscreen ? "top" : "bottom" },
    margin: { item: { horizontal: 8, vertical: 8 }, axis: 12 },
    groupHeightMode: "fitItems",
    height: isFullscreen ? "100%" : undefined,
    minHeight: isFullscreen ? "0" : "320px",
    maxHeight: isFullscreen ? undefined : "560px",
  };
}

function escapeTimelineContent(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function viewFromHash(hash: string): DebugView {
  const normalized = hash.replace(/^#/, "");
  if (normalized === "gantt" || normalized === "network") return normalized;
  return "gantt";
}

function formatSpanStatus(value: TraceSpan["status"]): string {
  switch (value) {
    case "running":
      return "进行中";
    case "ok":
      return "完成";
    case "error":
      return "错误";
    case "cancelled":
      return "已取消";
    case "unknown":
      return "未知";
  }
}

function formatSpanDuration(span: TraceSpan): string {
  if (!span.endAt) return span.status === "running" ? "进行中" : "未结束";
  const start = new Date(span.startAt).getTime();
  const end = new Date(span.endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "未知耗时";
  return formatDuration(end - start);
}

function formatObservationLevel(value: ContextSnapshotView["observationLevel"]): string {
  switch (value) {
    case "full":
      return "完整";
    case "metadata":
      return "元数据";
    case "inferred":
      return "推断";
  }
}

function formatTokenMethod(value?: TokenMethod): string {
  switch (value) {
    case "provider_count":
      return "模型计数";
    case "provider_usage":
      return "模型用量";
    case "proportional_estimate":
      return "按比例估算";
    case "estimated":
      return "本地估算";
    default:
      return "未知来源";
  }
}

function formatConfidence(value?: TokenConfidence): string {
  switch (value) {
    case "high":
      return "可信度高";
    case "medium":
      return "可信度中";
    case "low":
      return "可信度低";
    default:
      return "可信度未知";
  }
}

function formatCacheStatus(value: CacheReport["segments"][number]["status"]): string {
  switch (value) {
    case "hit":
      return "命中";
    case "miss":
      return "未命中";
    case "unknown":
      return "未知";
  }
}

function formatSegmentLabel(value?: string): string {
  switch (value) {
    case "system_prompt":
      return "系统";
    case "skills":
      return "技能";
    case "tools":
      return "工具";
    case "other":
      return "其他";
    case "message":
      return "消息";
    case "system":
      return "system 消息";
    case "user":
      return "user 消息";
    case "assistant":
      return "assistant 消息";
    case "tool":
      return "tool 消息";
    default:
      return value ?? "片段";
  }
}

function formatNetworkStatus(request: NetworkRequestRecord): string {
  if (request.status === "pending") return "进行中";
  if (request.status === "error") return "错误";
  return request.statusCode ? String(request.statusCode) : "完成";
}

function formatDuration(value?: number): string {
  if (value === undefined) return "-- ms";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value?: string): string {
  if (!value) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function compareDateDesc(left?: string, right?: string): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

function compareDateAsc(left?: string, right?: string): number {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}
