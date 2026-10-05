interface RuntimeWarningInterceptor {
  readonly suppressedCount: number;
  restore(): void;
}

type WriteCallback = (err?: Error | null) => void;

const SQLITE_EXPERIMENTAL_WARNING =
  /^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\r?$/;
const MODULE_REGISTER_DEPRECATION_WARNING =
  /^\(node:\d+\) \[DEP0205\] DeprecationWarning: `module\.register\(\)` is deprecated\. Use `module\.registerHooks\(\)` instead\.\r?$/;
const NODE_TLS_REJECT_UNAUTHORIZED_WARNING =
  /^\(node:\d+\) Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification\.\r?$/;
const TRACE_WARNINGS_HINT =
  /^\(Use `[^`]+ --trace-(?:warnings|deprecation) \.\.\.` to show where the warning was created\)\r?$/;
const AI_SDK_WARNING_SYSTEM =
  /^AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false\.\r?$/;
const AI_SDK_ANTHROPIC_THINKING_BUDGET_WARNING =
  /^AI SDK Warning \(anthropic\.messages \/ [^)]+\): The feature "extended thinking" is used in a compatibility mode\. thinking budget is required when thinking is enabled\. using default budget of \d+ tokens\.\r?$/;

export function interceptKnownRuntimeWarnings(
  stderr: NodeJS.WriteStream,
): RuntimeWarningInterceptor {
  const originalWrite = stderr.write;
  let restored = false;
  let suppressedCount = 0;
  let dropNextTraceHint = false;

  const writeOriginal = (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean => {
    if (typeof encodingOrCallback === "function") {
      return originalWrite.call(stderr, chunk, undefined, encodingOrCallback);
    }

    if (typeof encodingOrCallback === "string") {
      return originalWrite.call(stderr, chunk, encodingOrCallback, callback);
    }

    return originalWrite.call(stderr, chunk, undefined, callback);
  };

  // Node/AI SDK dependency warnings can be emitted during headless
  // provider setup before Kaguya Code can format them as actionable diagnostics. Keep
  // these known notices out of user-facing CLI stderr while preserving normal
  // errors and unknown warnings.
  stderr.write = ((chunk, encodingOrCallback, callback) => {
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    const text = stringifyChunk(chunk, encoding);
    // 空 write 是退出前的 flush barrier，必须等底层队列完成，不能当成被过滤的警告。
    if (text.length === 0) return writeOriginal(chunk, encodingOrCallback, callback);
    const filtered = filterKnownRuntimeWarningChunk(text, {
      onSuppressed: () => {
        suppressedCount += 1;
      },
      get dropNextTraceHint() {
        return dropNextTraceHint;
      },
      set dropNextTraceHint(value: boolean) {
        dropNextTraceHint = value;
      },
    });

    const writeCallback = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (filtered.length === 0) {
      if (writeCallback) queueMicrotask(() => writeCallback());
      return true;
    }

    return writeOriginal(filtered, encoding, writeCallback);
  }) as NodeJS.WriteStream["write"];

  return {
    get suppressedCount() {
      return suppressedCount;
    },
    restore() {
      if (restored) return;
      restored = true;
      stderr.write = originalWrite;
    },
  };
}

function filterKnownRuntimeWarningChunk(
  text: string,
  state: {
    dropNextTraceHint: boolean;
    onSuppressed(): void;
  },
): string {
  const segments = text.match(/[^\n]*\n|[^\n]+/g) ?? [];
  let output = "";

  for (const segment of segments) {
    const line = segment.endsWith("\n") ? segment.slice(0, -1) : segment;

    if (
      SQLITE_EXPERIMENTAL_WARNING.test(line) ||
      MODULE_REGISTER_DEPRECATION_WARNING.test(line) ||
      NODE_TLS_REJECT_UNAUTHORIZED_WARNING.test(line)
    ) {
      state.dropNextTraceHint = true;
      state.onSuppressed();
      continue;
    }

    if (AI_SDK_WARNING_SYSTEM.test(line) || AI_SDK_ANTHROPIC_THINKING_BUDGET_WARNING.test(line)) {
      state.onSuppressed();
      continue;
    }

    if (state.dropNextTraceHint && TRACE_WARNINGS_HINT.test(line)) {
      state.dropNextTraceHint = false;
      state.onSuppressed();
      continue;
    }

    if (line.trim().length > 0) {
      state.dropNextTraceHint = false;
    }
    output += segment;
  }

  return output;
}

function stringifyChunk(chunk: string | Uint8Array, encoding?: BufferEncoding): string {
  return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(encoding);
}
