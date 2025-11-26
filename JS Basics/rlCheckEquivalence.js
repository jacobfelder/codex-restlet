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
    return makeResponse(true, {
      message: `restlet is deployed and the 'get' is working (ts: ${_timestamp})`,
    });
  };

  const post = (body) => {
    const bodyText = typeof body === "string" ? body : JSON.stringify(body);

    const start = new Date();
    log.debug({ title: "POST_START", details: `ts: ${start}` });

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

      let fileRows = getQLrows();

      // ----- mapping ----- //

      const noVendorBillFound = !fileRows || fileRows.length === 0;

      let mappedFromSuiteQL = getVendorbillObj(fileRows);

      // ----- comparison ----- //
      let comparisonResult = null;

      if (!noVendorBillFound && mappedFromSuiteQL) {
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
                "Incoming payload is equivalent to SuiteQL vendor bill data.",
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
        }
      }

      const end = new Date();
      const durationMs = end - start;
      log.debug({ title: "Load Duration (ms)", details: durationMs });

      // normal success path – status + mismatches (if any)
      //I want to improve this to only show differences if there are any
      return makeResponse(true, {
        message: "Restlet ran successfully",
        isEquivalent: comparisonResult ? comparisonResult.isEquivalent : false,
        headerDifferences:
          (comparisonResult && comparisonResult.headerDifferences) || [],
        lineDifferences:
          (comparisonResult && comparisonResult.lineDifferences) || [],
        durationMs,
      });
    } catch (e) {
      log.error({
        title: "POST_ERROR",
        details: e && e.message ? `${e.name || "ERROR"}: ${e.message}` : e,
      });
      if (e && e.name === "VALIDATION_ERROR") {
        return makeResponse(false, e.message);
      }

      // For unexpected/system errors, rethrow to surface as HTTP 500
      throw e;
    }
  };

  //---------------------some helper funcs-----------------------
  const makeResponse = (isOK, payload) =>
    JSON.stringify(
      isOK ? { isOK: true, data: payload } : { isOK: false, error: payload }
    );

  const loadSqlFromFile = (fileId) => {
    //log.audit({ title: 'FILE_LOAD_START', details: `Attempting to load SQL file ID: ${fileId}` });

    const fileObj = file.load({ id: fileId });
    const contents = fileObj.getContents();

    //log.audit({ title: 'FILE_LOAD_SUCCESS', details: `Loaded file name: ${fileObj.name}, size: ${contents.length} chars`});

    return contents;
  };

  const getByPath = (obj, path) =>
    path.split(".").reduce((acc, key) => {
      if (acc == null) return undefined;
      return acc[key];
    }, obj);
  //-------------------------QL work-----------------

  const getQLrows = () => {
    try {
      const fileSql = loadSqlFromFile(SQL_FILE_ID);
      const fileResultSet = query.runSuiteQL({
        query: fileSql,
        params: [tranId],
      });

      fileRows = fileResultSet.asMappedResults();

      if (!fileRows || fileRows.length === 0) {
        log.audit({
          title: "QL Msg",
          details: `No rows returned from SuiteQL query (tranid:${tranId})`,
        });
      } else {
        //log.debug({ title: 'QL Results', details: JSON.stringify(fileRows) });
        log.debug({
          title: "QL Results",
          details: `Retrieved VB data from NetSuite for TranId ${tranId}`,
        });
      }
    } catch (fileErr) {
      log.error({
        title: "FILE_SQL_ERROR",
        details: JSON.stringify({
          name: fileErr && fileErr.name,
          message: fileErr && fileErr.message,
          stack: fileErr && fileErr.stack,
        }),
      });
    }
  };

  const getVendorbillObj = (fileRows) =>{
    if(!fileRows || fileRows.length === 0)
      {
            try {
          mappedFromSuiteQL = mapSuiteQLToIncomingShape(fileRows);
          //log.debug({ title: "MAPPED_FROM_SUITEQL", details: JSON.stringify(mappedFromSuiteQL) });
        } catch (mapErr) {
          log.error({
            title: "MAPPING_ERROR",
            details: JSON.stringify({
              name: mapErr && mapErr.name,
              message: mapErr && mapErr.message,
              stack: mapErr && mapErr.stack,
            }),
          });
        }
      } else {
        log.debug({
          title: "MAPPING_SKIPPED",
          details: "Mapping step skipped because SuiteQL returned no rows.",
        });

  }
  // ------------------ mapping helpers ------------------ //

  const mapHeaderFromSuiteQL = (rows) => {
    if (!rows || rows.length === 0) {
      throw error.create({
        name: "MAPPING_ERROR",
        message: "No SuiteQL rows provided to header mapper.",
      });
    }

    const first = rows[0];

    return {
      tranid: first.tranid,
      tranDate: first.trandatechar,
      memo: potentialNull(first.invoicememo),
      custbody_cci_dedicated_payment: mapBoolean(
        first.custbody_cci_dedicated_payment
      ),
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
      // Coupa order line number key
      orderlinenumber: row.coupaorderlinenumber,
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

  const indexLinesByOrderLineNum = (lines, invoiceMode) => {
    const dict = {};
    if (!lines) return dict;

    for (const line of lines) {
      if (!line) continue;

      const key = invoiceMode ? line["order-line-num"] : line.orderlinenumber;
      if (key == null) continue;

      dict[key] = line;
    }

    return dict;
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

    const invoiceDict = indexLinesByOrderLineNum(invoiceLines, true);
    const suiteQLDict = indexLinesByOrderLineNum(suiteQLLines, false);

    const allKeys = new Set([
      ...Object.keys(invoiceDict),
      ...Object.keys(suiteQLDict),
    ]);

    const allDifferences = [];

    allKeys.forEach((key) => {
      const invoiceLine = invoiceDict[key];
      const suiteQLLine = suiteQLDict[key];

      // completely missing on one side
      if (!invoiceLine || !suiteQLLine) {
        const diff = {
          path: `item.items[order-line-num=${key}]`,
          invoice: invoiceLine,
          ql: suiteQLLine,
        };

        allDifferences.push(diff);

        log.debug({
          title: "LINE_PRESENCE_MISMATCH",
          details: JSON.stringify(diff),
        });

        return;
      }

      // compare individual fields on that line
      const lineDiffs = compareFieldSet(
        invoiceLine,
        suiteQLLine,
        LINE_FIELDS,
        `item.items[order-line-num=${key}].`
      );

      if (lineDiffs && lineDiffs.length > 0) {
        Array.prototype.push.apply(allDifferences, lineDiffs);
      }
    });

    return {
      isEqual: allDifferences.length === 0,
      differences: allDifferences,
    };
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
      case "string":
      default:
        // no normalization for strings (for now)
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

    // Can't parse → leave unchanged so you can see issues during comparison
    return value;
  };

  return { post, get };
});
