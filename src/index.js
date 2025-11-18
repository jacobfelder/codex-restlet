const path = require('path');
const logger = require('./logger');
const { MappingWorkspace } = require('./mapping/workspace');

function run() {
  const workspace = new MappingWorkspace({
    label: 'suiteql-mapper',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  const payloadPath = process.env.PAYLOAD_PATH || path.join(__dirname, '..', 'data', 'sample-payload.json');
  const suiteQlPath = process.env.SUITEQL_PATH || path.join(__dirname, '..', 'data', 'sample-suiteql.json');

  workspace.loadPayloadFromFile(payloadPath);
  workspace.loadSuiteQlFromFile(suiteQlPath);

  workspace.addMappingStep({
    id: 'orderSummary',
    description: 'Align order identity and totals',
    transform: ({ payload, suiteQlResult }) => {
      const order = payload.order || {};
      const suiteOrder = suiteQlResult.rows?.[0] || {};
      return {
        payloadOrderId: order.id,
        suiteOrderId: suiteOrder.id,
        payloadTotal: order.total,
        suiteTotal: suiteOrder.total,
      };
    },
  });

  workspace.addMappingStep({
    id: 'lineItems',
    description: 'Compare line items by sku',
    transform: ({ payload, suiteQlResult }) => {
      const payloadLines = payload.lines || [];
      const suiteLines = suiteQlResult.lines || [];
      const suiteIndex = new Map(suiteLines.map((line) => [line.sku, line]));
      return payloadLines.map((line) => {
        const suiteLine = suiteIndex.get(line.sku) || {};
        return {
          sku: line.sku,
          payloadQty: line.qty,
          suiteQty: suiteLine.qty,
          payloadAmount: line.amount,
          suiteAmount: suiteLine.amount,
        };
      });
    },
  });

  const results = workspace.runMappings();
  logger.info('Mapping results ready', results);

  const structuralDiff = workspace.summarizeDifferences();
  logger.info('Structural comparison complete', structuralDiff);

  return { results, structuralDiff };
}

if (require.main === module) {
  run();
}

module.exports = { run };
