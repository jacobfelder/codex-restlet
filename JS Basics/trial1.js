console.log("testing log");

const fs = require("fs");

//const jsonText = fs.readFileSync("./invoice 1442-A.json", "utf8");
//const qlJSON = fs.readFileSync("./ql PODD1442-A.json", "utf8");

const jsonText = fs.readFileSync("./invoice PO1443.json", "utf8");
const qlJSON = fs.readFileSync("./ql PO1443.json", "utf8");

//console.log(jsonText);
//console.log(payloadObj);

const InvoiceObj = JSON.parse(jsonText);
const qlObj = JSON.parse(qlJSON);

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
  { path: "amount", type: "integer" },
  { path: "quantity", type: "integer" },
  { path: "item.id", type: "integer" },
  { path: "location.id", type: "integer" },
  { path: "orderDoc.id", type: "integer" },
  { path: "orderLine", type: "integer" },
  { path: "account.externalId", type: "string" },
  { path: "department.externalId", type: "string" },
  { path: "cseg_cci_location.externalId", type: "string" },
  //{ path: "custcol_cci_ext_taxcode.externalId", type: "string" },
  //this needs to be added to the json  { path: "custcol_cci_ext_taxcode.id", type: "integer" },
  { path: "custcol_cci_ext_taxrate", type: "integer" },
  { path: "custcol_cci_ext_taxamount", type: "integer" },
];

//console.log(qlObj);

const mappedFromSuiteQL = mapSuiteQLToIncomingShape(qlObj);

var tt = mappedFromSuiteQL;

function mapSuiteQLToIncomingShape(rows) {
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
}

compareHeaders(InvoiceObj, mappedFromSuiteQL);

///mapping header fields from QL into Obj

function mapHeaderFromSuiteQL(rows) {
  if (!rows || rows.length === 0) {
    throw new Error("No SuiteQL rows provided");
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

    // // no expenses from SuiteQL right now:
    // expense: {
    //   items: [],
    // },
  };
}

function mapLinesFromSuiteQL(rows) {
  return rows.map((row) => {
    return {
      amount: row.netamount,
      quantity: row.quantity,
      item: {
        id: row.item,
      },
      location: {
        id: row.warehousefacilitylocation,
      },
      orderDoc: {
        id: row.createdfrom,
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
      custcol_cci_ext_taxcode: {
        externalid: "Not avail in QL",
        id: row.taxcodeid,
      },
      custcol_cci_ext_taxrate: taxRateFractionToPercent(row.taxrate),
      custcol_cci_ext_taxamount: row.taxamount,
    };
  });
}

function compareHeaders(incoming, suiteQLMapped) {
  const differences = [];

  for (const field of HEADER_FIELDS) {
    console.log("Evaluating: " + field.path);

    const invoiceRaw = getByPath(incoming, field.path);
    const qlRaw = getByPath(suiteQLMapped, field.path);
    // const areEqual = invoiceRaw === qlRaw || (invoiceRaw == null && qlRaw == null); // treat null/undefined as equivalent

    const invoiceNorm = normalize(invoiceRaw, field.type);
    const qlNorm = normalize(qlRaw, field.type);

    const areEqual =
      invoiceNorm === qlNorm || (invoiceNorm == null && qlNorm == null);

    console.log(
      `  Invoice: ${JSON.stringify(invoiceRaw)}\n` +
        `  QL:      ${JSON.stringify(qlRaw)}\n`
    );

    if (!areEqual) {
      differences.push({
        path: field.path,
        invoice: invoiceRaw,
        ql: qlRaw,
      });
      console.log("❌ MISMATCH");
    } else {
      console.log("✅ MATCH");
    }

    console.log("-------------------next-----------------");
  }

  return {
    isEqual: differences.length === 0,
    differences,
  };
}

//functions
function mapBoolean(value) {
  // "T"/"F" => true/false, null/undefined => false
  return value === "T";
}

function normalizeDateFromSuiteQL(trandatechar) {
  //this should prob be done the other way and have the Incoming match the SuiteQL

  // SuiteQL: "2025-11-16"
  // Incoming: "2025-11-16T00:00:00-05:00"
  //console.log("original: " + trandatechar);

  //trandatechar =

  //console.log("stripped: " + trandatechar);
  return trandatechar;
}

function potentialNull(value) {
  // first non-null, non-empty string
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return ""; // or null – your choice, just be consistent
}

function taxRateFractionToPercent(fraction) {
  // SuiteQL: 0.1 => 10
  if (fraction == null) return null;
  return fraction * 100;
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

function normalize(value, type) {
  if (value == null) return null;

  switch (type) {
    case "date":
      return normalizeDate(value);

    case "boolean":
      // Keep your original logic but more defensive
      if (typeof value === "string") {
        return value.toUpperCase() === "T";
      }
      return Boolean(value);

    case "integer":
    case "number":
      const num = Number(value);
      return isNaN(num) ? value : num;

    default:
      return value;
  }
}

function normalizeDate(value) {
  // Already a Date object
  if (value instanceof Date && !isNaN(value)) {
    return value.toISOString().substring(0, 10);
  }

  // Strings that are already yyyy-mm-dd → return unchanged
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Try standard parsing
  const parsed = new Date(value);

  if (!isNaN(parsed)) {
    return parsed.toISOString().substring(0, 10);
  }

  // If parsing failed → return value unchanged
  return value;
}
