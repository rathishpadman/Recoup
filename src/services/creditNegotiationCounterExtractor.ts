import { runtimeModels } from "../../config/models.ts";
import type { EmailFetch, RuntimeEmailEnv } from "./emailGateway.ts";

interface ExtractCreditNegotiationCounterOfferWithLiveModelInput {
  env: RuntimeEmailEnv;
  fetchImpl: EmailFetch;
  rawMessage: string;
}

const counterExtractionSchema = {
  additionalProperties: false,
  properties: {
    citedSpans: {
      items: {
        additionalProperties: false,
        properties: {
          field: {
            enum: ["collateralRatio", "depositPct", "financingSpreadBps", "outOfScope", "releasePct", "trancheCount"],
            type: "string"
          },
          text: {
            type: "string"
          }
        },
        required: ["field", "text"],
        type: "object"
      },
      minItems: 1,
      type: "array"
    },
    intent: {
      enum: ["counter_offer", "out_of_scope"],
      type: "string"
    }
  },
  required: ["citedSpans", "intent"],
  type: "object"
} as const;

export async function extractCreditNegotiationCounterOfferWithLiveModel(
  input: ExtractCreditNegotiationCounterOfferWithLiveModelInput
): Promise<unknown> {
  const apiKey = input.env.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }

  const response = await input.fetchImpl("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content:
            "Extract only cited spans from this Harbor counter-offer email. Return counter_offer only for depositPct, releasePct, trancheCount, collateralRatio, or financingSpreadBps. Return out_of_scope for credit-limit increases, shipment demands outside the deal grammar, banking instructions, or unrelated text. Cite exact substrings from the email; never calculate or emit dollar amounts.",
          role: "system"
        },
        {
          content: input.rawMessage,
          role: "user"
        }
      ],
      model: runtimeModels.fastMini,
      text: {
        format: {
          name: "credit_negotiation_counter_offer_extraction",
          schema: counterExtractionSchema,
          strict: true,
          type: "json_schema"
        }
      }
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    method: "POST"
  }).catch(() => undefined);
  if (response === undefined || !response.ok) {
    return undefined;
  }

  const outputText = readOutputText(await readJson(response));
  if (outputText === undefined) {
    return undefined;
  }

  return parseJson(outputText);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function readOutputText(value: unknown): string | undefined {
  const record = asRecord(value);
  const outputText = readString(record?.output_text);
  if (outputText !== undefined) {
    return outputText;
  }

  const output = Array.isArray(record?.output) ? record.output : [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
    for (const contentItem of content) {
      const text = readString(asRecord(contentItem)?.text);
      if (text !== undefined) {
        return text;
      }
    }
  }

  return undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
