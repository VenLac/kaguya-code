import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUserInstructionsService } from "../src/user-instructions/userInstructionsService.js";
import { USER_INSTRUCTIONS_MAX_BYTES } from "../src/user-instructions/userInstructions.js";

async function withHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "user-instructions-"));
  try {
    await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const agentsPath = (home: string) => join(home, ".zcode", "AGENTS.md");

test("文件不存在：read 返回 exists:false 且不创建文件；首次保存以 null 作为基线", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    const snapshot = await service.read();
    assert.deepEqual(snapshot, {
      path: agentsPath(home),
      exists: false,
      content: "",
      revision: null,
    });
    await assert.rejects(readFile(agentsPath(home)));

    const result = await service.write({ content: "x", expectedRevision: null });
    assert.equal(result.status, "saved");
    assert.equal(await readFile(agentsPath(home), "utf8"), "x");
    if (result.status === "saved") {
      assert.equal(result.snapshot.exists, true);
      assert.notEqual(result.snapshot.revision, null);
    }
  });
});

test("读取后文件被外部修改：保存返回 conflict，磁盘不变，附带最新快照", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await mkdir(join(home, ".zcode"), { recursive: true });
    await writeFile(agentsPath(home), "v1");
    const base = await service.read();

    await writeFile(agentsPath(home), "external");
    const result = await service.write({ content: "mine", expectedRevision: base.revision });

    assert.equal(result.status, "conflict");
    assert.equal(await readFile(agentsPath(home), "utf8"), "external");
    if (result.status === "conflict") assert.equal(result.snapshot.content, "external");
  });
});

test("外部写入相同内容不算冲突（revision 基于内容而非 mtime）", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await mkdir(join(home, ".zcode"), { recursive: true });
    await writeFile(agentsPath(home), "same");
    const base = await service.read();

    await writeFile(agentsPath(home), "same");
    const result = await service.write({ content: "next", expectedRevision: base.revision });
    assert.equal(result.status, "saved");
  });
});

test("读取时不存在、保存前被外部创建：conflict", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await mkdir(join(home, ".zcode"), { recursive: true });
    await writeFile(agentsPath(home), "created elsewhere");
    const result = await service.write({ content: "mine", expectedRevision: null });
    assert.equal(result.status, "conflict");
    assert.equal(await readFile(agentsPath(home), "utf8"), "created elsewhere");
  });
});

test("读取后文件被外部删除：conflict", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await mkdir(join(home, ".zcode"), { recursive: true });
    await writeFile(agentsPath(home), "v1");
    const base = await service.read();
    await rm(agentsPath(home));
    const result = await service.write({ content: "mine", expectedRevision: base.revision });
    assert.equal(result.status, "conflict");
  });
});

test("大小上限按 UTF-8 字节计：恰好通过，多 1 字节被拒绝且磁盘不变", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    const exact = "a".repeat(USER_INSTRUCTIONS_MAX_BYTES);
    const ok = await service.write({ content: exact, expectedRevision: null });
    assert.equal(ok.status, "saved");
    const base = await service.read();

    const tooLarge = await service.write({ content: `${exact}a`, expectedRevision: base.revision });
    assert.deepEqual(tooLarge, {
      status: "tooLarge",
      bytes: USER_INSTRUCTIONS_MAX_BYTES + 1,
      maxBytes: USER_INSTRUCTIONS_MAX_BYTES,
    });
    assert.equal((await readFile(agentsPath(home))).byteLength, USER_INSTRUCTIONS_MAX_BYTES);

    // 多字节字符：每个“指”占 3 字节，字符数远小于字节数。
    const multibyte = "指".repeat(Math.floor(USER_INSTRUCTIONS_MAX_BYTES / 3) + 1);
    const multibyteResult = await service.write({
      content: multibyte,
      expectedRevision: base.revision,
    });
    assert.equal(multibyteResult.status, "tooLarge");
  });
});

test("保存空字符串：写入空文件而不是删除", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await service.write({ content: "something", expectedRevision: null });
    const base = await service.read();
    const result = await service.write({ content: "", expectedRevision: base.revision });
    assert.equal(result.status, "saved");
    const after = await service.read();
    assert.equal(after.exists, true);
    assert.equal(after.content, "");
  });
});

test("内容原样保存：不 trim、不改换行", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    const content = "  line1\r\nline2\n\n";
    await service.write({ content, expectedRevision: null });
    assert.equal(await readFile(agentsPath(home), "utf8"), content);
  });
});

test("符号链接：内容写入链接目标，链接本身保留", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await mkdir(join(home, ".zcode"), { recursive: true });
    const real = join(home, "dotfiles-AGENTS.md");
    await writeFile(real, "linked");
    await symlink(real, agentsPath(home));

    const base = await service.read();
    assert.equal(base.content, "linked");
    const result = await service.write({ content: "updated", expectedRevision: base.revision });

    assert.equal(result.status, "saved");
    assert.equal(await readFile(real, "utf8"), "updated");
    assert.equal(await readFile(agentsPath(home), "utf8"), "updated");
    assert.equal((await lstat(agentsPath(home))).isSymbolicLink(), true);
  });
});

test("目标是目录：保存抛错而不是静默失败", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await mkdir(agentsPath(home), { recursive: true });
    await assert.rejects(service.read());
    await assert.rejects(service.write({ content: "x", expectedRevision: null }));
  });
});

test("保存成功后不遗留临时文件", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await service.write({ content: "x", expectedRevision: null });
    assert.deepEqual(await readdir(join(home, ".zcode")), ["AGENTS.md"]);
  });
});

test("并发保存串行执行：同一基线的两次保存只有一次成功，另一次 conflict", async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await service.write({ content: "base", expectedRevision: null });
    const base = await service.read();

    const [first, second] = await Promise.all([
      service.write({ content: "A", expectedRevision: base.revision }),
      service.write({ content: "B", expectedRevision: base.revision }),
    ]);

    assert.deepEqual([first.status, second.status].sort(), ["conflict", "saved"]);
    const finalContent = await readFile(agentsPath(home), "utf8");
    assert.equal(finalContent, first.status === "saved" ? "A" : "B");
  });
});

// root 与 Windows 不受目录只读位限制，无法制造写入失败。
const canSimulateWriteFailure = process.platform !== "win32" && process.getuid?.() !== 0;

test("写入中途失败：原文件不变，不遗留临时文件", { skip: !canSimulateWriteFailure }, async () => {
  await withHome(async (home) => {
    const service = createUserInstructionsService({ env: { HOME: home } });
    await service.write({ content: "original", expectedRevision: null });
    const base = await service.read();

    const dir = join(home, ".zcode");
    await chmod(dir, 0o500);
    try {
      await assert.rejects(service.write({ content: "new", expectedRevision: base.revision }));
    } finally {
      await chmod(dir, 0o700);
    }

    assert.equal(await readFile(agentsPath(home), "utf8"), "original");
    assert.deepEqual(await readdir(dir), ["AGENTS.md"]);
  });
});
