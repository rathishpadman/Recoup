import { describe, expect, it } from "vitest";

import { REMITTANCE_CSV_V1_HEADER } from "../../config/remittanceCsvV1.js";
import { mapRemittanceCsvV1 } from "../../src/services/remittanceMapper.js";

const header = REMITTANCE_CSV_V1_HEADER.join(",");
const validRow =
  "REM-1,CUST-001,LE-001,PAY-1001,USD,1250.00,LINE-1,INV-1,1000.00,250.00,DMG,damaged pallet";

const base = {
  inboundMessageId: "INBOX-1",
  provenanceMode: "replay" as const,
  sourceRecordIds: ["INBOX-1"]
};

describe("CSV v1 mapper", () => {
  it("maps a well-formed single-line remittance", () => {
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${validRow}` });
    expect(result.status).toBe("mapped");
    if (result.status !== "mapped") return;

    expect(result.advice.remittanceId).toBe("REM-1");
    expect(result.advice.instructedPaymentAmount).toBe("1250.00");
    expect(result.advice.lines).toHaveLength(1);
    expect(result.advice.lines[0]?.claimedReasonCode).toBe("DMG");
    expect(result.advice.mapperVersion).toContain("ASSUMED");
  });

  it("maps several lines belonging to one payment", () => {
    const second =
      "REM-1,CUST-001,LE-001,PAY-1001,USD,1250.00,LINE-2,INV-2,100.00,0,SHT,short delivery";
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${validRow}\n${second}` });
    expect(result.status).toBe("mapped");
    if (result.status !== "mapped") return;
    expect(result.advice.lines).toHaveLength(2);
  });

  it("rejects a reordered header rather than mapping by position", () => {
    const reordered = [...REMITTANCE_CSV_V1_HEADER].reverse().join(",");
    const result = mapRemittanceCsvV1({ ...base, csv: `${reordered}\n${validRow}` });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("header_mismatch");
  });

  it("rejects an extra column", () => {
    const result = mapRemittanceCsvV1({
      ...base,
      csv: `${header},extra\n${validRow},junk`
    });
    expect(result.status).toBe("rejected");
  });

  it("rejects a row whose cell count differs from the header", () => {
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\nREM-1,CUST-001` });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("inconsistent_header_row");
  });

  it("rejects a missing claimed reason code", () => {
    const noReason =
      "REM-1,CUST-001,LE-001,PAY-1001,USD,1250.00,LINE-1,INV-1,1000.00,250.00,,damaged pallet";
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${noReason}` });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("missing_reason_code");
  });

  it("rejects a negative amount rather than allocating it", () => {
    const negative =
      "REM-1,CUST-001,LE-001,PAY-1001,USD,1250.00,LINE-1,INV-1,-1000.00,250.00,DMG,text";
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${negative}` });
    expect(result.status).toBe("rejected");
  });

  it("rejects a lowercase currency rather than normalising it", () => {
    const lower =
      "REM-1,CUST-001,LE-001,PAY-1001,usd,1250.00,LINE-1,INV-1,1000.00,250.00,DMG,text";
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${lower}` });
    expect(result.status).toBe("rejected");
  });

  it("rejects rows that disagree on the payment-level fields", () => {
    const other =
      "REM-2,CUST-002,LE-001,PAY-9999,USD,1250.00,LINE-2,INV-2,100.00,0,SHT,text";
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${validRow}\n${other}` });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("row_invalid");
  });

  it("rejects a file that is not valid UTF-8", () => {
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${validRow}�` });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("not_utf8");
  });

  it("rejects a header with no data rows", () => {
    const result = mapRemittanceCsvV1({ ...base, csv: header });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("empty_file");
  });

  it("never populates a validated reason", () => {
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\n${validRow}` });
    if (result.status !== "mapped") throw new Error("expected a mapping");
    for (const line of result.advice.lines) {
      expect(line).not.toHaveProperty("validatedReason");
    }
  });

  it("tolerates CRLF line endings", () => {
    const result = mapRemittanceCsvV1({ ...base, csv: `${header}\r\n${validRow}\r\n` });
    expect(result.status).toBe("mapped");
  });
});
