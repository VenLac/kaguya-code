/**
 * 设备级资源的有界聚合窗口。
 *
 * 每台设备每个窗口一条 `perf_system_window`：整机 CPU 与剩余内存、应用总量、遥测自身开销。
 * 与角色窗口一样是纯内存、有界、无队列、无重试；flush 时投影成一条报告。
 */

import {
  appendBoundedSamples,
  computeAggregateStats,
  roundMetric,
} from "./resourceMetricsStats.js";
import { PROCESS_RESOURCE_MAX_SAMPLES_PER_WINDOW } from "./processResourceWindowAggregator.js";

/** 一个 10 秒 tick 的设备级瞬时事实；缺整机 CPU 基线时不会产生样本。 */
export interface DeviceResourceSample {
  /** 整机 CPU（两次 `os.cpus()` 差分得到的整机归一化百分比）。 */
  systemCpuPercent: number;
  systemFreeMemoryKb: number;
  /** 全部本机 Kaguya Code 进程的 CPU 之和。 */
  appCpuPercent: number;
  appRssKbTotal: number;
  appProcessCount: number;
}

export interface SystemResourceWindowReport {
  backgroundRatio: number;
  appUptimeMinutes: number;
  systemCpuPercentP95: number;
  systemFreeMemoryKbMin: number;
  /** 事件 value。 */
  appCpuPercentMean: number;
  appCpuPercentP95: number;
  appRssKbTotalMean: number;
  appRssKbTotalPeak: number;
  processCountTotalPeak: number;
  sampleCount: number;
  telemetrySelfMs: number;
}

export class ProcessResourceSystemWindowAggregator {
  private systemCpuPercent: number[] = [];
  private systemFreeMemoryKb: number[] = [];
  private appCpuPercent: number[] = [];
  private appRssKbTotal: number[] = [];
  private processCountTotalPeak = 0;
  private telemetrySelfMs = 0;

  add(sample: DeviceResourceSample): void {
    this.systemCpuPercent = appendSample(this.systemCpuPercent, sample.systemCpuPercent);
    this.systemFreeMemoryKb = appendSample(this.systemFreeMemoryKb, sample.systemFreeMemoryKb);
    this.appCpuPercent = appendSample(this.appCpuPercent, sample.appCpuPercent);
    this.appRssKbTotal = appendSample(this.appRssKbTotal, sample.appRssKbTotal);
    this.processCountTotalPeak = Math.max(this.processCountTotalPeak, sample.appProcessCount);
  }

  /**
   * 累计 main 侧遥测代码本身的墙钟耗时（自证开销）。
   * flush 自身的耗时只能计入下一个窗口——它发生在窗口投影之后。
   */
  addTelemetrySelfMs(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return;
    }
    this.telemetrySelfMs += elapsedMs;
  }

  /**
   * 取出并清空窗口。窗口内没有设备样本时返回 null，不发空事件，
   * 但已累计的自证开销顺延到下一个窗口——采样连续失败的窗口恰恰最需要看到遥测自身成本。
   * `backgroundRatio` 由角色聚合器的 scene 计数提供，保证两个事件里是同一个数。
   */
  drain(input: {
    backgroundRatio: number;
    appUptimeMinutes: number;
  }): SystemResourceWindowReport | null {
    if (this.appCpuPercent.length === 0) {
      this.clearSamples();
      return null;
    }

    const systemCpu = computeAggregateStats(this.systemCpuPercent);
    const appCpu = computeAggregateStats(this.appCpuPercent);
    const appRss = computeAggregateStats(this.appRssKbTotal);
    const report: SystemResourceWindowReport = {
      backgroundRatio: input.backgroundRatio,
      appUptimeMinutes: input.appUptimeMinutes,
      systemCpuPercentP95: systemCpu.p95,
      systemFreeMemoryKbMin: Math.min(...this.systemFreeMemoryKb),
      appCpuPercentMean: appCpu.mean,
      appCpuPercentP95: appCpu.p95,
      appRssKbTotalMean: appRss.mean,
      appRssKbTotalPeak: appRss.peak,
      processCountTotalPeak: this.processCountTotalPeak,
      sampleCount: appCpu.sample_count,
      telemetrySelfMs: roundMetric(this.telemetrySelfMs),
    };
    this.clear();
    return report;
  }

  clear(): void {
    this.clearSamples();
    this.telemetrySelfMs = 0;
  }

  private clearSamples(): void {
    this.systemCpuPercent = [];
    this.systemFreeMemoryKb = [];
    this.appCpuPercent = [];
    this.appRssKbTotal = [];
    this.processCountTotalPeak = 0;
  }
}

/** 与角色窗口同一个上限与同一套溢出策略：定时器漂移时保留窗口末尾的读数。 */
function appendSample(bucket: number[], value: number): number[] {
  return appendBoundedSamples(bucket, value, PROCESS_RESOURCE_MAX_SAMPLES_PER_WINDOW);
}
