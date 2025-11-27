/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */

// @ts-expect-error Define is OK for restlets
define(["N/error", "N/log", "N/record", "N/query", "N/file"], (
  error,
  log,
  record,
  query,
  file
) => {
  //----------------------------constants needed for restlet---------------------

  //const SQL_FILE_ID = 718177;  //can use fileID or path
  const SQL_FILE_ID = "/SuiteScripts/JF Test/ql_check_vb_equivalence.sql";

  const HEADER_FIELDS = [
    { path: "tranid", type: "string" },
    { path: "externalId", type: "string" },
    { path: "tranDate", type: "date" },
    { path: "memo", type: "string" },
    { path: "custbody_cci_dedicated_payment", type: "boolean" },
    { path: "entity.externalId", type: "string" },
    { path: "subsidiary.externalId", type: "string" },
    { path: "terms.externalId", type: "string" },
    { path: "currency.externalId", type: "string" },
  ];

  const LINE_FIELDS = [
    { path: "amount", type: "number" },
    { path: "quantity", type: "number" },
    { path: "item.id", type: "number" },
    { path: "location.id", type: "number" },
    { path: "orderDoc.id", type: "number" },
    { path: "orderLine", type: "number" },
    { path: "account.externalId", type: "string" },
    { path: "department.externalId", type: "string" },
    { path: "cseg_cci_location.externalId", type: "string" },
    { path: "custcol_cci_ext_taxcode.id", type: "number" },
    { path: "custcol_cci_ext_taxrate", type: "number" },
    { path: "custcol_cci_ext_taxamount", type: "number" },
  ];

  const get = () => {
    const _timestamp = new Date().toISOString();
    log.audit({ title: "GET_START", details: `GET invoked at: ${_timestamp}` });
    return JSON.stringify({
      message: `restlet is deployed and the 'get' is working (ts: ${_timestamp})`,
    });
  };

  const post = (body) => {
    const bodyText = typeof body === "string" ? body : JSON.stringify(body);

    try {
      const payload =
        body && typeof body === "object" ? body : JSON.parse(bodyText);

      if (!payload.tranid) {
        throw error.create({
          name: "VALIDATION_ERROR",
          message: "Missing required field: 'tranid'.",
        });
      }

      const tranId = payload.tranid;

      // ----- SuiteQL ----- //
      const fileRows = getQLrows(tranId);

      const noVendorBillFound = !fileRows || fileRows.length === 0;

      if (noVendorBillFound) {
        const responsePayload = {
          status: "NOT_FOUND",
          message: `No vendor bill found in NetSuite for tranid ${tranId}.`,
          isEquivalent: false,
        };

        return makeResponse(false, responsePayload);
      }

      const mappedFromSuiteQL = getVendorbillObj(fileRows);

      // ----- comparison ----- //
      let comparisonResult = null;

      try {
        const headerResult = compareHeaders(payload, mappedFromSuiteQL);
        const lineResult = compareLines(payload, mappedFromSuiteQL);

        comparisonResult = {
          isEquivalent: headerResult.isEqual && lineResult.isEqual,
          headerDifferences: headerResult.differences,
          lineDifferences: lineResult.differences,
        };

        if (!comparisonResult.isEquivalent) {
          log.debug({
            title: "COMPARISON_MISMATCH",
            details: JSON.stringify(comparisonResult),
          });
        } else {
          log.debug({
            title: "COMPARISON_MATCH",
            details:
              "Incoming invoice payload is equivalent to SuiteQL vendor bill data.",
          });
        }
      } catch (cmpErr) {
        log.error({
          title: "COMPARISON_ERROR",
          details: JSON.stringify({
            name: cmpErr && cmpErr.name,
            message: cmpErr && cmpErr.message,
            stack: cmpErr && cmpErr.stack,
          }),
        });

        // Surface as structured COMPARISON_ERROR status
        throw error.create({
          name: "COMPARISON_ERROR",
          message:
            (cmpErr && cmpErr.message) || "Unexpected error during comparison.",
        });
      }

      const status = comparisonResult.isEquivalent
        ? "EQUIVALENT"
        : "NOT_EQUIVALENT";

      // build response payload
      const responsePayload = {
        status,
        isEquivalent: comparisonResult ? comparisonResult.isEquivalent : false,
      };

      // only include differences if there are any
      if (
        comparisonResult &&
        comparisonResult.headerDifferences &&
        comparisonResult.headerDifferences.length > 0
      ) {
        responsePayload.headerDifferences = comparisonResult.headerDifferences;
      }

      if (
        comparisonResult &&
        comparisonResult.lineDifferences &&
        comparisonResult.lineDifferences.length > 0
      ) {
        responsePayload.lineDifferences = comparisonResult.lineDifferences;
      }

      return makeResponse(true, responsePayload);
    } catch (e) {
      const isKnownInternalError =
        e &&
        (e.name === "QL_ERROR" ||
          e.name === "MAPPING_ERROR" ||
          e.name === "VALIDATION_ERROR" ||
          e.name === "COMPARISON_ERROR");

      const status = isKnownInternalError ? e.name : "GENERAL_ERROR";

      log.error({
        title: status,
        details: e && e.message ? `${status}: ${e.message}` : e,
      });

      return makeResponse(false, {
        status,
        message: e && e.message ? e.message : "Unexpected error.",
        isEquivalent: false,
      });
    }
  };

  //---------------------some helper funcs-----------------------
  const makeResponse = (ranSuccessfully, payload) =>
    JSON.stringify({ evaluationSucceeded: ranSuccessfully, ...payload });

  const loadSqlFromFile = (fileId) => {
    //log.audit({ title: 'FILE_LOAD_START', details: `Attempting to load SQL file ID: ${fileId}` });

    const fileObj = file.load({ id: fileId });
    const contents = fileObj.getContents();

    //log.audit({ title: 'FILE_LOAD_SUCCESS', details: `Loaded file name: ${fileObj.name}, size: ${contents.length} chars`});
    if (contents.length === 0) {
      log.error({
        title: "FILE_LOAD_FAILURE",
        details: `Unable to loaded file ${fileId}`,
      });
    }

    return contents;
  };

  const getByPath = (obj, path) =>
    path.split(".").reduce((acc, key) => {
      if (acc == null) return undefined;
      return acc[key];
    }, obj);

  //-------------------------QL work-----------------

  const getQLrows = (tranId) => {
    try {
      const fileSql = loadSqlFromFile(SQL_FILE_ID);
      const fileResultSet = query.runSuiteQL({
        query: fileSql,
        params: [tranId],
      });

      const rows = fileResultSet.asMappedResults() || [];

      if (!rows || rows.length === 0) {
        log.audit({
          title: "QL Msg",
          details: `No rows returned from SuiteQL query (tranid:${tranId})`,
        });
      } else {
        //log.debug({ title: 'QL Results', details: JSON.stringify(rows) });
        log.debug({
          title: "QL Results",
          details: `Retrieved VB data from NetSuite for TranId ${tranId}`,
        });
      }

      return rows;
    } catch (fileErr) {
      log.error({
        title: "QL_ERROR",
        details: JSON.stringify({
          name: fileErr && fileErr.name,
          message: fileErr && fileErr.message,
          stack: fileErr && fileErr.stack,
        }),
      });
      throw error.create({
        name: "QL_ERROR",
        message:
          (fileErr && fileErr.message) ||
          `Error while executing SuiteQL for tranid ${tranId}`,
      });
    }
  };

  const getVendorbillObj = (fileRows) => {
    if (!fileRows || fileRows.length === 0) {
      log.debug({
        title: "MAPPING_SKIPPED",
        details: "Mapping step skipped because SuiteQL returned no rows.",
      });
      return null;
    }

    try {
      const mappedFromSuiteQL = mapSuiteQLToIncomingShape(fileRows);
      //log.debug({ title: "MAPPED_FROM_SUITEQL", details: JSON.stringify(mappedFromSuiteQL) });
      return mappedFromSuiteQL;
    } catch (mapErr) {
      log.error({
        title: "MAPPING_ERROR",
        details: JSON.stringify({
          name: mapErr && mapErr.name,
          message: mapErr && mapErr.message,
          stack: mapErr && mapErr.stack,
        }),
      });

      // Surface as MAPPING_ERROR instead of returning null
      throw error.create({
        name: "MAPPING_ERROR",
        message:
          (mapErr && mapErr.message) ||
          "Error while mapping SuiteQL rows to vendor bill shape.",
      });
    }
  };

  // ------------------ mapping helpers ------------------ //

  const mapHeaderFromSuiteQL = (rows) => {
    const first = rows[0];

    return {
      tranid: first.tranid,
      tranDate: first.trandatechar,
      memo: first.invoicememo,
      custbody_cci_dedicated_payment: first.custbody_cci_dedicated_payment,
      externalId: first.externalid,
      entity: {
        externalId: first.vendorexternalid,
      },
      subsidiary: {
        externalId: first.subsidiaryexternalid,
      },
      terms: {
        externalId: first.termsexternalid,
      },
      currency: {
        externalId: first.currencyexternalid,
      },
    };
  };

  const mapLinesFromSuiteQL = (rows) =>
    (rows || []).map((row) => ({
      amount: row.linetotal,
      quantity: row.quantity,
      item: {
        id: row.itemid,
      },
      location: {
        id: row.warehousefacilitylocation,
      },
      orderDoc: {
        id: row.po_id,
      },
      orderLine: row.orderline,
      account: {
        externalId: row.itemaccountexternalid,
      },
      department: {
        externalId: row.departmentexternalid,
      },
      cseg_cci_location: {
        externalId: row.cci_locationexternalid,
      },
      coupaorderlinenumber: row.coupaorderlinenumber,
      custcol_cci_ext_taxcode: {
        // externalid not available in SuiteQL, only id
        id: row.taxcodeid,
      },
      custcol_cci_ext_taxrate: row.taxrateaspercentage,
      custcol_cci_ext_taxamount: row.taxamount,
    }));

  const mapSuiteQLToIncomingShape = (rows) => {
    const header = mapHeaderFromSuiteQL(rows);
    const lineItems = mapLinesFromSuiteQL(rows);

    return {
      ...header,
      item: {
        items: lineItems,
      },
      expense: {
        items: [],
      },
    };
  };

  // ------------------ comparison helpers ------------------ //

  const compareFieldSet = (
    invoiceSource,
    suiteQLSource,
    fields,
    pathPrefix
  ) => {
    const differences = [];

    for (const field of fields) {
      const fullPath = (pathPrefix || "") + field.path;

      const invoiceRaw = getByPath(invoiceSource, field.path);
      const suiteQLRaw = getByPath(suiteQLSource, field.path);

      const invoiceNormalized = normalize(invoiceRaw, field.type);
      const suiteQLNormalized = normalize(suiteQLRaw, field.type);

      const areEqual =
        invoiceNormalized === suiteQLNormalized ||
        (invoiceNormalized == null && suiteQLNormalized == null);

      if (!areEqual) {
        const diff = {
          path: fullPath,
          invoice: invoiceRaw,
          ql: suiteQLRaw,
        };

        differences.push(diff);

        // log only mismatches
        log.debug({
          title: "FIELD_MISMATCH",
          details: JSON.stringify(diff),
        });
      }
    }

    return differences;
  };

  const compareHeaders = (incoming, suiteQLMapped) => {
    const differences = compareFieldSet(
      incoming,
      suiteQLMapped,
      HEADER_FIELDS,
      ""
    );
    return {
      isEqual: differences.length === 0,
      differences,
    };
  };

  const compareLines = (incoming, suiteQLMapped) => {
    const invoiceLines =
      incoming.item && Array.isArray(incoming.item.items)
        ? incoming.item.items
        : [];

    const suiteQLLines =
      suiteQLMapped.item && Array.isArray(suiteQLMapped.item.items)
        ? suiteQLMapped.item.items
        : [];

    const differences = [];

    //loop QL lines, find matching invoice line, compare
    for (const qlLine of suiteQLLines) {
      if (!qlLine) continue;

      const key = qlLine.coupaorderlinenumber;
      const invoiceLine = findLineByCoupaOrderLineNumber(invoiceLines, key);

      if (!invoiceLine) {
        // exists only in QL
        differences.push({
          path: `item.items[coupaorderlinenumber=${key}]`,
          message: `This line only exists in the QL result set.`,
        });
        continue;
      }

      const lineDiffs = compareFieldSet(
        invoiceLine,
        qlLine,
        LINE_FIELDS,
        `item.items[coupaorderlinenumber=${key}].`
      );

      if (lineDiffs && lineDiffs.length > 0) {
        differences.push(...lineDiffs);
      }
    }

    for (const invoiceLine of invoiceLines) {
      if (!invoiceLine) continue;

      const key = invoiceLine.coupaorderlinenumber;
      const qlLine = findLineByCoupaOrderLineNumber(suiteQLLines, key);

      if (!qlLine) {
        differences.push({
          path: `item.items[coupaorderlinenumber=${key}]`,
          message: `This line only exists in the incoming JSON payload.`,
        });
      }
    }

    return {
      isEqual: differences.length === 0,
      differences,
    };
  };

  const findLineByCoupaOrderLineNumber = (lines, coupaOrderLineNumber) => {
    if (!Array.isArray(lines)) return null;

    for (const line of lines) {
      if (!line) continue;
      if (line.coupaorderlinenumber === coupaOrderLineNumber) {
        return line;
      }
    }

    return null;
  };

  //--------------------------normalizers-------------------------

  const normalize = (value, type) => {
    if (value == null) return null;

    switch (type) {
      case "date":
        return normalizeDate(value);
      case "boolean":
        return normalizeBoolean(value);
      case "number":
        return normalizeNumber(value);
      case "string": {
        const trimmed = String(value).trim();
        if (trimmed === "") return null;
        return trimmed;
      }
      default:
        return value;
    }
  };

  const normalizeBoolean = (value) => {
    if (value == null) return null;

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const v = value.trim().toUpperCase();
      if (v === "T") return true;
      if (v === "F") return false;
    }

    // Fallback for anything else
    return Boolean(value);
  };

  const normalizeNumber = (value) => {
    if (value == null || value === "") return null;

    const num = Number(value);
    return Number.isNaN(num) ? value : num;
  };

  const normalizeDate = (value) => {
    if (value == null || value === "") return null;

    // Already on format YYYY-MM-DD
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    // Try parsing ISO-like or numeric timestamps
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return value;
  };

  return { post, get };
});
