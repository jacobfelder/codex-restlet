const path = require("path");
const logger = require("./logger");
const { MappingWorkspace } = require("./mapping/workspace");

function run() {
  const workspace = new MappingWorkspace({
    label: "suiteql-mapper",
    logLevel: process.env.LOG_LEVEL || "info",
  });

  const payloadPath =
    process.env.PAYLOAD_PATH ||
    path.join(__dirname, "..", "data", "invoice 1442-A.json");
  const suiteQlPath =
    process.env.SUITEQL_PATH ||
    path.join(__dirname, "..", "data", "ql PODD1442-A.json");

  workspace.loadPayloadFromFile(payloadPath);
  workspace.loadSuiteQlFromFile(suiteQlPath);

  const getSuiteRows = (suiteQlResult) => {
    if (Array.isArray(suiteQlResult)) {
      return suiteQlResult;
    }
    if (Array.isArray(suiteQlResult?.rows)) {
      return suiteQlResult.rows;
    }
    return [];
  };

  workspace.addMappingStep({
    id: "invoiceHeader",
    description: "Map invoice header fields from SuiteQL row to payload",
    transform: ({ payload, suiteQlResult }) => {
      const suiteRows = getSuiteRows(suiteQlResult);
      const firstRow = suiteRows[0] || {};
      const memoValue =
        firstRow.invoicememo ??
        firstRow.invoicememocoalesce ??
        firstRow.invoicememonvl ??
        "";
      const suiteTaxStatus = firstRow.custbody_cci_dedicated_payment;
      return {
        tranId: {
          payload: payload.tranid,
          suiteQl: firstRow.tranid,
        },
        externalId: {
          payload: payload.externalId,
          suiteQl: firstRow.externalid,
        },
        vendorExternalId: {
          payload: payload.entity?.externalId,
          suiteQl: firstRow.vendorexternalid,
        },
        subsidiaryExternalId: {
          payload: payload.subsidiary?.externalId,
          suiteQl: firstRow.subsidiaryexternalid,
        },
        termsExternalId: {
          payload: payload.terms?.externalId,
          suiteQl: firstRow.termsexternalid,
        },
        currencyExternalId: {
          payload: payload.currency?.externalId,
          suiteQl: firstRow.currencyexternalid,
        },
        tranDate: {
          payload: payload.tranDate,
          suiteQl: firstRow.trandatechar,
        },
        memo: {
          payload: payload.memo,
          suiteQl: memoValue,
        },
        dedicatedPayment: {
          payload: payload.custbody_cci_dedicated_payment,
          suiteQl: suiteTaxStatus === "T" ? true : suiteTaxStatus === "F" ? false : suiteTaxStatus,
        },
      };
    },
  });

  workspace.addMappingStep({
    id: "lineItems",
    description: "Compare invoice item lines to SuiteQL row data",
    transform: ({ payload, suiteQlResult }) => {
      const payloadLines = payload.item?.items || [];
      const suiteRows = getSuiteRows(suiteQlResult);
      return payloadLines.map((line, index) => {
        const suiteLine = suiteRows[index] || {};
        const suiteTaxRatePercent =
          typeof suiteLine.taxrate === "number" ? suiteLine.taxrate * 100 : undefined;
        return {
          index,
          identifiers: {
            payloadOrder: line.orderDoc?.id,
            suiteCreatedFrom: suiteLine.createdfrom,
            suiteCoupaLine: suiteLine.coupaorderlinenumber,
          },
          item: {
            payload: line.item?.id,
            suiteQl: suiteLine.item,
          },
          accountExternalId: {
            payload: line.account?.externalId,
            suiteQl: suiteLine.itemaccountexternalid,
          },
          quantity: {
            payload: line.quantity,
            suiteQl: suiteLine.quantity,
          },
          amount: {
            payload: line.amount,
            suiteQl: suiteLine.netamount,
          },
          locationExternalId: {
            payload:
              line.cseg_cci_location?.externalId ||
              line.location?.externalId ||
              line.location?.id,
            suiteQl: suiteLine.cci_locationexternalid,
          },
          taxCode: {
            payload: line.custcol_cci_ext_taxcode?.externalid,
            suiteQl: suiteLine.taxcodeid,
          },
          taxRatePercent: {
            payload: line.custcol_cci_ext_taxrate,
            suiteQl: suiteTaxRatePercent,
          },
          taxAmount: {
            payload: line.custcol_cci_ext_taxamount,
            suiteQl: suiteLine.taxamount,
          },
        };
      });
    },
  });

  workspace.addMappingStep({
    id: "totals",
    description: "Compare header-level totals",
    transform: ({ payload, suiteQlResult }) => {
      const payloadLines = payload.item?.items || [];
      const suiteRows = getSuiteRows(suiteQlResult);
      const payloadTotals = payloadLines.reduce(
        (totals, line) => {
          totals.quantity += Number(line.quantity || 0);
          totals.amount += Number(line.amount || 0);
          totals.tax += Number(line.custcol_cci_ext_taxamount || 0);
          return totals;
        },
        { quantity: 0, amount: 0, tax: 0 }
      );

      const suiteTotals = suiteRows.reduce(
        (totals, row) => {
          totals.quantity += Number(row.quantity || 0);
          totals.amount += Number(row.netamount || 0);
          totals.tax += Number(row.taxamount || 0);
          return totals;
        },
        { quantity: 0, amount: 0, tax: 0 }
      );

      return {
        payload: payloadTotals,
        suiteQl: suiteTotals,
      };
    },
  });

  const results = workspace.runMappings();
  logger.info("Mapping results ready", results);

  const structuralDiff = workspace.summarizeDifferences();
  logger.info("Structural comparison complete", structuralDiff);

  return { results, structuralDiff };
}

if (require.main === module) {
  run();
}

module.exports = { run };
