const fs = require("fs");
const path = require("path");
const logger = require("../logger");

function readJson(filePath) {
  const absolutePath = path.resolve(filePath);
  const contents = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(contents);
}

function toKeySet(record) {
  if (!record || typeof record !== "object") return new Set();
  const keys = new Set();
  const stack = [record];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
    } else if (typeof current === "object" && current !== null) {
      Object.entries(current).forEach(([key, value]) => {
        keys.add(key);
        if (typeof value === "object") {
          stack.push(value);
        }
      });
    }
  }
  return keys;
}

class MappingWorkspace {
  constructor({ label = "default", logLevel } = {}) {
    this.label = label;
    this.payload = null;
    this.suiteQlResult = null;
    this.mappingSteps = [];
    if (logLevel) {
      logger.level = logLevel;
    }
    logger.info(`Workspace '${label}' ready`);
  }

  loadPayloadFromFile(filePath) {
    this.payload = readJson(filePath);
    logger.info("Loaded incoming payload", {
      filePath: path.resolve(filePath),
    });
    return this.payload;
  }

  loadSuiteQlFromFile(filePath) {
    this.suiteQlResult = readJson(filePath);
    logger.info("Loaded SuiteQL response", {
      filePath: path.resolve(filePath),
    });
    return this.suiteQlResult;
  }

  addMappingStep({ id, description, transform }) {
    if (!id) {
      throw new Error("Mapping step requires an id");
    }
    if (typeof transform !== "function") {
      throw new Error("Mapping step transform must be a function");
    }
    this.mappingSteps.push({ id, description, transform });
    logger.debug("Registered mapping step", { id, description });
  }

  runMappings(context = {}) {
    if (!this.payload || !this.suiteQlResult) {
      throw new Error(
        "Load payload and SuiteQL response before running mappings"
      );
    }
    const results = {};
    for (const step of this.mappingSteps) {
      logger.debug("Running mapping step", { id: step.id });
      results[step.id] = step.transform({
        payload: this.payload,
        suiteQlResult: this.suiteQlResult,
        context,
      });
    }
    logger.info("Completed mapping execution");
    return results;
  }

  summarizeDifferences() {
    const payloadKeys = toKeySet(this.payload);
    const suiteQlKeys = toKeySet(this.suiteQlResult);
    const onlyInPayload = [...payloadKeys].filter(
      (key) => !suiteQlKeys.has(key)
    );
    const onlyInSuiteQl = [...suiteQlKeys].filter(
      (key) => !payloadKeys.has(key)
    );
    const inBoth = [...payloadKeys].filter((key) => suiteQlKeys.has(key));

    const summary = {
      payloadKeys: payloadKeys.size,
      suiteQlKeys: suiteQlKeys.size,
      overlappingKeys: inBoth.length,
      onlyInPayload,
      onlyInSuiteQl,
      sharedKeys: inBoth,
    };

    logger.info(
      "Generated structural comparison between payload and SuiteQL response",
      {
        payloadKeyCount: payloadKeys.size,
        suiteQlKeyCount: suiteQlKeys.size,
        overlapCount: inBoth.length,
      }
    );

    return summary;
  }
}

module.exports = { MappingWorkspace };
