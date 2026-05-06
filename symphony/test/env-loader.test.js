const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  isPlaceholderValue,
  loadEnvFileIfPresent,
  parseEnvFile,
  parseEnvLine,
} = require("../env-loader");

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("parseEnvLine handles comments, export prefixes, quotes, and whitespace", () => {
  assert.equal(parseEnvLine("# comment"), null);
  assert.deepEqual(parseEnvLine("LINEAR_API_KEY=abc123   "), {
    key: "LINEAR_API_KEY",
    value: "abc123",
  });
  assert.deepEqual(parseEnvLine('export PROJECT_NAME="otter clone"'), {
    key: "PROJECT_NAME",
    value: "otter clone",
  });
  assert.deepEqual(parseEnvLine("SINGLE='quoted value'"), {
    key: "SINGLE",
    value: "quoted value",
  });
});

test("parseEnvFile keeps the last value for duplicate keys", () => {
  const parsed = parseEnvFile(`
FIRST=one
FIRST=two
SECOND=three
`);

  assert.deepEqual(parsed, {
    FIRST: "two",
    SECOND: "three",
  });
});

test("isPlaceholderValue detects example secret placeholders", () => {
  assert.equal(isPlaceholderValue("your_openai_api_key_here"), true);
  assert.equal(isPlaceholderValue("replace-with-linear-project-slug"), true);
  assert.equal(isPlaceholderValue("lin_api_realvalue"), false);
});

test("loadEnvFileIfPresent populates missing variables and does not override existing ones", async (t) => {
  const tempDir = await createTempDir("symphony-env-");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const envPath = path.join(tempDir, ".env.local");
  await fs.writeFile(
    envPath,
    `
LINEAR_API_KEY=file-value    
OPENAI_API_KEY="quoted-value"
ANTHROPIC_API_KEY=your_anthropic_api_key_here
`,
    "utf8"
  );

  const previousLinear = process.env.LINEAR_API_KEY;
  const previousOpenAI = process.env.OPENAI_API_KEY;
  const previousAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.LINEAR_API_KEY = "existing-value";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  t.after(() => {
    if (previousLinear === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = previousLinear;
    }

    if (previousOpenAI === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAI;
    }

    if (previousAnthropic === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropic;
    }
  });

  const result = await loadEnvFileIfPresent(envPath);

  assert.equal(result.loaded, true);
  assert.equal(process.env.LINEAR_API_KEY, "existing-value");
  assert.equal(process.env.OPENAI_API_KEY, "quoted-value");
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
  assert.deepEqual(result.loadedKeys, ["OPENAI_API_KEY"]);
});
