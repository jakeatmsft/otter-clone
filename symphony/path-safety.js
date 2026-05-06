const fs = require("node:fs/promises");
const path = require("node:path");

const { createError } = require("./errors");

async function canonicalize(targetPath) {
  const expandedPath = path.resolve(targetPath);
  const { root, segments } = splitAbsolutePath(expandedPath);
  return resolveSegments(root, [], segments);
}

async function ensurePathWithinRoot(targetPath, rootPath, options = {}) {
  const allowRoot = options.allowRoot === true;
  const canonicalTarget = await canonicalize(targetPath);
  const canonicalRoot = await canonicalize(rootPath);
  const rootPrefix = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`;

  if (allowRoot && canonicalTarget === canonicalRoot) {
    return {
      canonicalTarget,
      canonicalRoot,
    };
  }

  if (canonicalTarget === canonicalRoot) {
    throw createError("workspace_equals_root", "Workspace path resolves to workspace root", {
      canonicalTarget,
      canonicalRoot,
    });
  }

  if (!canonicalTarget.startsWith(rootPrefix)) {
    throw createError("workspace_outside_root", "Workspace path escapes configured root", {
      canonicalTarget,
      canonicalRoot,
    });
  }

  return {
    canonicalTarget,
    canonicalRoot,
  };
}

function sanitizeWorkspaceKey(identifier) {
  const source = typeof identifier === "string" && identifier.trim() !== "" ? identifier : "issue";
  return source.replace(/[^A-Za-z0-9._-]/g, "_");
}

function splitAbsolutePath(absolutePath) {
  const segments = path.resolve(absolutePath).split(path.sep);

  if (process.platform === "win32") {
    const [drive, ...rest] = segments;
    return {
      root: `${drive}${path.sep}`,
      segments: rest.filter(Boolean),
    };
  }

  return {
    root: path.sep,
    segments: segments.filter(Boolean),
  };
}

async function resolveSegments(root, resolvedSegments, remainingSegments) {
  if (remainingSegments.length === 0) {
    return joinPath(root, resolvedSegments);
  }

  const [segment, ...rest] = remainingSegments;
  const candidatePath = joinPath(root, [...resolvedSegments, segment]);

  try {
    const stat = await fs.lstat(candidatePath);

    if (stat.isSymbolicLink()) {
      const linkTarget = await fs.readlink(candidatePath);
      const resolvedTarget = path.resolve(joinPath(root, resolvedSegments), linkTarget);
      const { root: nextRoot, segments: nextSegments } = splitAbsolutePath(resolvedTarget);
      return resolveSegments(nextRoot, [], [...nextSegments, ...rest]);
    }

    return resolveSegments(root, [...resolvedSegments, segment], rest);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return joinPath(root, [...resolvedSegments, segment, ...rest]);
    }

    throw createError("path_canonicalize_failed", `Failed to canonicalize path ${candidatePath}`, {
      targetPath: candidatePath,
      cause: error,
    });
  }
}

function joinPath(root, segments) {
  return segments.reduce((current, segment) => path.join(current, segment), root);
}

module.exports = {
  canonicalize,
  ensurePathWithinRoot,
  sanitizeWorkspaceKey,
};
